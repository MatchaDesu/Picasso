# Picasso บน AWS (Auto Scaling)

คู่มือขึ้นระบบตามสถาปัตยกรรมของโปรเจค: client บน S3, server เป็น EC2 ใน Auto Scaling Group หลัง ALB กระจาย 2 AZ, Login ผ่าน API Gateway + Lambda + DynamoDB และ state ของเกมใน ElastiCache (Redis)

## สถาปัตยกรรม

```
                         ┌──────────────────────────────────────────────┐
 User ── Route 53 (DNS) ─┤                                              │
   │                     │  1) หน้าเว็บ   : S3 Static Website           │
   │                     │  2) เกม (WS)   : ALB ─> EC2 (ASG, 2 AZ)      │
   │                     │  3) Login      : API Gateway ─> Lambda       │
   │                     └──────────────────────────────────────────────┘
   │
   ├─> S3 (picasso-web)                       หน้าเว็บ React (static)
   │
   ├─> API Gateway (HTTP API) ─> Lambda auth ─> DynamoDB (PicassoUsers)
   │
   └─> Internet Gateway ─> ALB (public subnet × 2 AZ)
                             │  WebSocket (Socket.IO)
                             ▼
              Auto Scaling Group: EC2 × 2..4 (private subnet × 2 AZ)
                │            │                  │
                │            │                  └─> NAT Gateway ─> อินเทอร์เน็ต (ติดตั้งแพ็กเกจ)
                │            └─> VPC Endpoint ─> S3 (โค้ด server) / DynamoDB
                └─> ElastiCache Redis (private subnet)
                      ห้อง, เกม, lock, pub/sub ข้ามเครื่อง

 CloudWatch: log ของ server, metric ActiveConnections, alarm ให้ ASG
```

ทำไมต้องเป็นแบบนี้

- **Socket.IO ไม่ผ่าน API Gateway**: เกมใช้ WebSocket ที่ต่อค้างไว้ API Gateway (REST/HTTP) ส่งต่อไป ALB ไม่ได้ ผู้เล่นจึงต่อ ALB ตรง ส่วน API Gateway ใช้กับ Login เท่านั้น
- **ElastiCache จำเป็น**: EC2 หลายเครื่องต้องเห็นห้องเดียวกัน และต้องส่ง event ข้ามเครื่อง (A วาดบนเครื่อง 1 -> B บนเครื่อง 2 เห็น) ผ่าน Redis
- **DynamoDB** เก็บข้อมูลถาวร (บัญชีผู้ใช้)
- **Lambda แทน Cognito**: สมัคร/เข้าสู่ระบบ ออก token ให้ server เกมตรวจ

ระบบทนเครื่องตาย: ถ้าเครื่องหนึ่งดับ (หรือ ASG ปิดเครื่องตอน scale-in) ผู้เล่นจะต่อใหม่ไปเครื่องอื่นแล้วกลับเข้าห้องเดิมได้ เพราะ state อยู่ใน Redis ไม่ได้อยู่ในเครื่อง

---

## 0. ก่อนเริ่ม

- Region: ใช้ **ap-southeast-1 (Singapore)** ทั้งหมด (หรือ Bangkok ap-southeast-7 ก็ได้ ขอให้ทุกอย่างอยู่ region เดียวกัน)
- ตั้ง **Budget alert** (Billing > Budgets) กันค่าใช้จ่ายบาน
- สร้าง `AUTH_SECRET` (ใช้ทั้ง Lambda และ EC2 ต้องตรงกัน):
  ```bash
  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  ```
- (ไม่บังคับ) ติดตั้ง [AWS CLI](https://aws.amazon.com/cli/) แล้ว `aws configure` จะใช้สคริปต์อัปไฟล์ได้ ไม่มีก็อัปผ่าน Console ได้

ลำดับการสร้างสำคัญ เพราะบางอย่างต้องใช้ค่าจากขั้นก่อนหน้า (เช่น ต้องมี URL ของ ALB ก่อน build หน้าเว็บ)

---

## 1. VPC และ Subnet

VPC Console > **Create VPC** > เลือก **VPC and more**

| ค่า | ตั้งเป็น |
|---|---|
| Name tag | `picasso` |
| Number of AZs | 2 |
| Public subnets | 2 |
| Private subnets | 2 |
| NAT gateways | **1 per AZ** (ตามภาพ) หรือ **In 1 AZ** ถ้าอยากประหยัด |
| VPC endpoints | **S3 Gateway** |

จะได้ VPC, subnet 4 อัน, Internet Gateway, NAT Gateway และ S3 Gateway Endpoint ครบ

เพิ่ม **DynamoDB Gateway Endpoint**: VPC > Endpoints > Create endpoint > Service `com.amazonaws.ap-southeast-1.dynamodb` (Gateway) > เลือก VPC `picasso` และ route table ของ private subnet ทั้งสอง

## 2. Security Groups

| ชื่อ | Inbound | ใช้กับ |
|---|---|---|
| `picasso-alb-sg` | HTTP 80 (และ HTTPS 443 ถ้ามีโดเมน) จาก `0.0.0.0/0` | ALB |
| `picasso-ec2-sg` | TCP 3000 จาก `picasso-alb-sg` | EC2 |
| `picasso-redis-sg` | TCP 6379 จาก `picasso-ec2-sg` | ElastiCache |

EC2 ไม่ต้องเปิด SSH เข้าเครื่องผ่าน **Session Manager** (ข้อ 8)

## 3. DynamoDB (บัญชีผู้ใช้ + Leaderboard)

DynamoDB > Create table

- Table name: `PicassoUsers`
- Partition key: `usernameLower` (String)
- Capacity: **On-demand**

ตารางเดียวใช้ 2 ทาง:

- **Lambda** สร้าง/อ่านบัญชี (`username`, `passwordHash`)
- **EC2 (server เกม)** เพิ่ม `totalScore`, `gamesPlayed`, `wins` ทุกครั้งที่เกมจบ (เฉพาะคนที่ login) และอ่านทั้งตารางเพื่อทำ Leaderboard ผ่าน DynamoDB VPC Endpoint

## 4. Lambda + API Gateway (Login/Register)

### 4.1 Lambda

Lambda > Create function

- Name: `picasso-auth`, Runtime: **Node.js 22.x**
- เปิด Code editor แล้ว **วางโค้ดทั้งไฟล์ `lambda/auth/index.js`** ทับ `index.mjs` เดิม โดยเปลี่ยนชื่อไฟล์เป็น `index.js` (โค้ดเป็น CommonJS) แล้ว Deploy
- Configuration > Environment variables

  | Key | Value |
  |---|---|
  | `USERS_TABLE` | `PicassoUsers` |
  | `AUTH_SECRET` | ค่าที่สร้างในข้อ 0 |
  | `ALLOWED_ORIGIN` | URL หน้าเว็บ S3 (ข้อ 6) เติมทีหลังได้ |

- Configuration > Permissions > คลิก Role > Add permissions > Create inline policy (JSON):
  ```json
  {
    "Version": "2012-10-17",
    "Statement": [{
      "Effect": "Allow",
      "Action": ["dynamodb:GetItem", "dynamodb:PutItem"],
      "Resource": "arn:aws:dynamodb:ap-southeast-1:*:table/PicassoUsers"
    }]
  }
  ```

### 4.2 API Gateway

API Gateway > Create API > **HTTP API** > Integration: Lambda `picasso-auth`

- Routes: `POST /auth/register`, `POST /auth/login`, `GET /auth/me` ทั้งหมดชี้ไป `picasso-auth`
- Stage: `$default` (auto-deploy)
- **CORS**: Allow origin = URL หน้าเว็บ S3, Allow headers = `content-type,authorization`, Allow methods = `GET,POST,OPTIONS`

จด **Invoke URL** (เช่น `https://abc123.execute-api.ap-southeast-1.amazonaws.com`) ใช้ตอน build หน้าเว็บ

ทดสอบ:
```bash
curl -X POST https://abc123.execute-api.ap-southeast-1.amazonaws.com/auth/register -H "Content-Type: application/json" -d "{\"username\":\"test01\",\"password\":\"secret123\"}"
```

### 4.3 Throttling (กันเดารหัสผ่าน / ยิง API รัวๆ)

ไม่ตั้งไว้ คนสามารถยิง `/auth/login` เดารหัสผ่านได้ไม่จำกัด (และเปลือง Lambda)

API Gateway > เลือก API > **Protect > Throttling**

| ตั้งที่ | Burst limit | Rate limit (ครั้ง/วินาที) |
|---|---|---|
| **Default route throttling** (ทุก route) | 20 | 10 |
| `POST /auth/login` (Edit route throttling) | 10 | 5 |
| `POST /auth/register` | 10 | 5 |

เกินแล้ว API Gateway ตอบ **429 Too Many Requests** หน้าเว็บจะขึ้นว่า "Too many attempts. Please wait a moment and try again."

หรือตั้งด้วย AWS CLI (รันใน Git Bash / Linux / macOS):
```bash
aws apigatewayv2 update-stage --api-id <api-id> --stage-name '$default' --default-route-settings ThrottlingBurstLimit=20,ThrottlingRateLimit=10 --route-settings '{"POST /auth/login":{"ThrottlingBurstLimit":10,"ThrottlingRateLimit":5},"POST /auth/register":{"ThrottlingBurstLimit":10,"ThrottlingRateLimit":5}}'
```

> ข้อจำกัด: throttling ของ HTTP API นับรวมทุกคน ไม่ได้แยกตาม IP (คนยิงรัวๆ คนเดียวทำให้คนอื่น login ช้าไปด้วยช่วงสั้นๆ)
> ถ้าต้องการจำกัดต่อ IP ต้องใช้ REST API + AWS WAF (rate-based rule) ซึ่ง HTTP API ใช้ WAF ไม่ได้ สำหรับงานนี้แบบข้างบนเพียงพอ

## 5. ElastiCache (Redis / Valkey)

ElastiCache > Create cache > **Valkey** (หรือ Redis OSS) > **Design your own cache** > **Cluster cache** แต่ **Cluster mode: Disabled**

> ห้ามใช้ Serverless: เป็น cluster mode ซึ่งโค้ดนี้ไม่รองรับ

- Node type: `cache.t4g.micro`, Number of replicas: 0 (เดโม) หรือ 1 (ทน AZ ล่ม)
- Subnet group: สร้างใหม่ด้วย **private subnet ทั้ง 2**
- Security group: `picasso-redis-sg`
- Encryption in transit: ปิด (ใช้ `redis://`) หรือเปิด (ใช้ `rediss://`)

จด **Primary endpoint** -> `REDIS_URL=redis://<primary-endpoint>:6379`

## 6. S3

### 6.1 Bucket หน้าเว็บ `picasso-web-<ชื่อไม่ซ้ำ>`

- ปิด **Block all public access**
- Properties > **Static website hosting**: Enable, Index document `index.html`, **Error document `index.html`** (ให้ refresh หน้า `/game` แล้วไม่ 404)
- Permissions > Bucket policy:
  ```json
  {
    "Version": "2012-10-17",
    "Statement": [{
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::picasso-web-<ชื่อไม่ซ้ำ>/*"
    }]
  }
  ```
- จด **Bucket website endpoint** เช่น `http://picasso-web-xxx.s3-website-ap-southeast-1.amazonaws.com` (ใช้เป็น `CLIENT_URL` และ `ALLOWED_ORIGIN`)

### 6.2 Bucket โค้ด server `picasso-artifacts-<ชื่อไม่ซ้ำ>` (private)

แพ็กโค้ดแล้วอัป:
```powershell
.\deploy\package-server.ps1 -Bucket picasso-artifacts-<ชื่อไม่ซ้ำ>
```
(ไม่มี AWS CLI: รันโดยไม่ใส่ `-Bucket` แล้วอัป `build/server.tar.gz` ผ่าน Console)

## 7. IAM Role ของ EC2

IAM > Roles > Create role > AWS service: **EC2**

- Managed policies: `AmazonSSMManagedInstanceCore`, `CloudWatchAgentServerPolicy`
- Inline policy อ่าน bucket โค้ด + บันทึก/อ่านคะแนน Leaderboard:
  ```json
  {
    "Version": "2012-10-17",
    "Statement": [
      {
        "Effect": "Allow",
        "Action": "s3:GetObject",
        "Resource": "arn:aws:s3:::picasso-artifacts-<ชื่อไม่ซ้ำ>/*"
      },
      {
        "Effect": "Allow",
        "Action": ["dynamodb:UpdateItem", "dynamodb:Scan"],
        "Resource": "arn:aws:dynamodb:ap-southeast-1:*:table/PicassoUsers"
      }
    ]
  }
  ```
- ชื่อ role: `picasso-ec2-role`

(`CloudWatchAgentServerPolicy` มีสิทธิ์ `cloudwatch:PutMetricData` สำหรับ metric ActiveConnections อยู่แล้ว)

## 8. Launch Template

EC2 > Launch Templates > Create

- AMI: **Amazon Linux 2023**, Instance type: `t3.micro` (หรือ `t3.small`)
- Key pair: ไม่ต้อง (เข้าเครื่องด้วย Systems Manager > Session Manager)
- Security group: `picasso-ec2-sg`
- Advanced details > IAM instance profile: `picasso-ec2-role`
- Advanced details > **User data**: วางไฟล์ `deploy/ec2-user-data.sh` **แก้ส่วน "ตั้งค่า"** ให้ครบ (bucket, `CLIENT_URL`, `REDIS_URL`, `AUTH_SECRET`, `ASG_NAME`, `USERS_TABLE`)

## 9. Target Group + ALB

### Target group

EC2 > Target Groups > Create

- Type: Instances, Protocol HTTP, Port **3000**, VPC `picasso`
- Health check path: **`/health`**
- Attributes: Deregistration delay **30** วินาที
- Stickiness: **ปิด** (client ใช้ WebSocket อย่างเดียว ต่อค้างกับเครื่องเดิมอยู่แล้ว)

### ALB

EC2 > Load Balancers > Create > Application Load Balancer

- Internet-facing, **public subnet ทั้ง 2 AZ**, Security group `picasso-alb-sg`
- Listener HTTP:80 -> target group ข้างบน
- (มีโดเมน) Listener HTTPS:443 + certificate จาก ACM

จด **DNS name** ของ ALB (เช่น `picasso-alb-123.ap-southeast-1.elb.amazonaws.com`)

## 10. Auto Scaling Group

EC2 > Auto Scaling Groups > Create

- Name: **`picasso-asg`** (ต้องตรงกับ `ASG_NAME` ใน user data)
- Launch template จากข้อ 8
- VPC `picasso`, **private subnet ทั้ง 2 AZ**
- Attach to existing load balancer > target group จากข้อ 9
- Health checks: เปิด **ELB health checks**, grace period 180 วินาที
- Desired **2**, Min **2**, Max **4**
- Monitoring: เปิด **Enable group metrics collection** (เห็นจำนวนเครื่องใน CloudWatch)

### Scaling policy (ตามจำนวนผู้เล่นต่อเครื่อง)

server แต่ละเครื่องส่ง metric `Picasso / ActiveConnections` (Average = ผู้เล่นต่อเครื่อง) ทุก 60 วินาที

**แบบ Target tracking (แนะนำ, ใช้ AWS CLI):**
```bash
aws autoscaling put-scaling-policy --auto-scaling-group-name picasso-asg --policy-name picasso-connections --policy-type TargetTrackingScaling --target-tracking-configuration "{\"TargetValue\":30,\"CustomizedMetricSpecification\":{\"MetricName\":\"ActiveConnections\",\"Namespace\":\"Picasso\",\"Dimensions\":[{\"Name\":\"AutoScalingGroupName\",\"Value\":\"picasso-asg\"}],\"Statistic\":\"Average\"}}"
```
(เป้าหมาย 30 ผู้เล่นต่อเครื่อง ตั้งต่ำไว้ให้เดโมเห็นผลง่าย)

**แบบ Console (Step scaling):**

1. CloudWatch > Alarms > Create alarm > metric `Picasso > AutoScalingGroupName > ActiveConnections` (`picasso-asg`), Statistic **Average**, Period 1 นาที
   - `picasso-scale-out`: มากกว่า 30 ติดกัน 2 จุด
   - `picasso-scale-in`: น้อยกว่า 10 ติดกัน 5 จุด
2. ASG > Automatic scaling > Create dynamic scaling policy > **Step scaling**
   - alarm `picasso-scale-out` -> Add 1 instance
   - alarm `picasso-scale-in` -> Remove 1 instance

(จะเพิ่ม policy ตาม CPU 60% อีกตัวก็ได้)

## 11. Build และอัปหน้าเว็บ

ตอนนี้มี URL ครบแล้ว:
```powershell
.\deploy\deploy-client.ps1 `
  -SocketUrl http://<ALB-DNS-name> `
  -AuthApiUrl https://<api-id>.execute-api.ap-southeast-1.amazonaws.com `
  -Bucket picasso-web-<ชื่อไม่ซ้ำ>
```
(ไม่มี AWS CLI: ไม่ต้องใส่ `-Bucket` แล้วอัปทุกไฟล์ใน `client/dist` ขึ้น bucket ผ่าน Console)

> หน้าเว็บ S3 เป็น `http://` ส่วน Login เป็น `https://` (API Gateway) ใช้ร่วมกันได้
> ถ้า ALB มี HTTPS แล้ว ใช้ `-SocketUrl https://api.<โดเมน>`

## 12. Route 53 (ถ้ามีโดเมน)

- `api.<โดเมน>` : A record (Alias) -> ALB
- `auth.<โดเมน>` : Custom domain ของ API Gateway (ไม่บังคับ)
- หน้าเว็บ: ถ้าจะใช้โดเมนกับ S3 website ชื่อ bucket ต้องตรงกับโดเมน (เช่น bucket `www.example.com`) หรือใช้ CloudFront หน้า S3 (ได้ HTTPS ด้วย)

อย่าลืมเพิ่มโดเมนใหม่ลงใน `CLIENT_URL` (user data) และ CORS ของ API Gateway

## 13. CloudWatch

- **Logs**: log group `/picasso/server` แยก stream ตาม instance
- **Dashboard** แนะนำ (CloudWatch > Dashboards > Create):
  - `Picasso / ActiveConnections` (Average และ Sum)
  - `AWS/AutoScaling / GroupInServiceInstances` ของ `picasso-asg`
  - `AWS/ApplicationELB / ActiveConnectionCount` และ `HealthyHostCount`
  - `AWS/EC2 / CPUUtilization` (แยกตาม ASG)

---

## เดโม Auto Scaling ให้อาจารย์ดู

1. เปิดหน้าเว็บจาก S3 หลายแท็บ (Incognito คนละแท็บ) ดูที่ **footer มุมขวาล่าง `server: ip-10-0-...`** จะเห็นว่าผู้เล่นกระจายอยู่คนละเครื่อง แต่เล่นห้องเดียวกันได้
2. เปิด `http://<ALB-DNS>/health` แล้ว refresh หลายครั้ง `instanceId` จะสลับไปมาระหว่างเครื่อง
3. ยิงโหลดด้วยบอท (รันจากเครื่องตัวเอง):
   ```bash
   cd server
   npm run load-test -- http://<ALB-DNS> 40 15
   ```
   (40 ห้อง × 3 บอท = 120 connections, 15 นาที) จากนั้นดู dashboard: ActiveConnections ต่อเครื่องเกิน 30 -> alarm -> ASG เพิ่มเป็น 3-4 เครื่อง
   ตอนจบสคริปต์จะสรุปว่าบอทอยู่เครื่องไหนบ้าง
4. หยุดโหลด -> หลายนาทีต่อมา ASG ลดเครื่องเหลือ 2 ผู้เล่นที่อยู่บนเครื่องที่ถูกปิดจะต่อใหม่และกลับเข้าห้องเดิมเอง
5. เดโมทนเครื่องตาย: ระหว่างเล่น สั่ง **Terminate** EC2 เครื่องหนึ่ง ผู้เล่นบนเครื่องนั้นจะหลุดแวบหนึ่งแล้วกลับเข้าเกมเดิม ASG สร้างเครื่องใหม่มาแทน

## อัปเดตโค้ด server

1. `.\deploy\package-server.ps1 -Bucket picasso-artifacts-<ชื่อไม่ซ้ำ>`
2. ASG > **Instance refresh** > Start (เครื่องใหม่ดึงโค้ดใหม่ เครื่องเก่าถูกปิดทีละเครื่อง ผู้เล่น resume ไปเครื่องอื่นเอง)

## ค่าใช้จ่ายโดยประมาณ (Singapore, ต่อชั่วโมง)

| บริการ | ราคา |
|---|---|
| NAT Gateway | ~$0.059/ตัว (+ ค่า data) |
| ALB | ~$0.025 + LCU |
| EC2 t3.micro | ~$0.013/เครื่อง |
| ElastiCache cache.t4g.micro | ~$0.022 |
| Lambda / API Gateway / DynamoDB / S3 | เกือบฟรีสำหรับเดโม |

รวมประมาณ **$0.20-0.25/ชั่วโมง** (2 NAT, 2 EC2) **ลบทิ้งหลังส่งงาน**: ASG -> ALB -> Target group -> ElastiCache -> NAT Gateway -> Elastic IP -> VPC

## แก้ปัญหา

| อาการ | ดูตรงไหน |
|---|---|
| Target group ขึ้น unhealthy | Session Manager เข้าเครื่อง แล้ว `sudo tail -f /var/log/picasso/server.log` และ `sudo cat /var/log/cloud-init-output.log` (user data error) |
| server ขึ้นแต่ต่อ Redis ไม่ได้ | `picasso-redis-sg` เปิด 6379 จาก `picasso-ec2-sg` หรือยัง, `REDIS_URL` ถูกไหม (`redis://` vs `rediss://`) |
| หน้าเว็บต่อ socket ไม่ได้ | build ด้วย `-SocketUrl` ถูกไหม, ALB listener / security group เปิด 80 หรือยัง |
| Login ขึ้น Cannot reach the server | CORS ของ API Gateway มี origin ของหน้าเว็บหรือยัง |
| Login ขึ้น Too many attempts ทั้งที่กดไม่กี่ครั้ง | Throttling ตั้งต่ำเกินไป (ข้อ 4.3) หรือมีคนยิง API อยู่ ดู metric `4xx` ของ API Gateway ใน CloudWatch |
| Login ได้แต่ในเกมยังเป็น guest | `AUTH_SECRET` ของ Lambda กับ EC2 ไม่ตรงกัน |
| Leaderboard ว่างตลอด | ต้อง login ก่อนเล่น (guest ไม่ถูกบันทึก), `USERS_TABLE` ใน user data, IAM role มี `dynamodb:UpdateItem` + `dynamodb:Scan`, ดู log `recordGameStats failed` ใน CloudWatch |
| refresh หน้าแล้ว 404 | S3 Error document ต้องเป็น `index.html` |
| metric ActiveConnections ไม่ขึ้น | IAM role มี `CloudWatchAgentServerPolicy`, `ASG_NAME` ใน user data ตรงกับชื่อ ASG |

## รันในเครื่อง (dev)

```bash
cd server && npm run dev          # เกม (ไม่ตั้ง REDIS_URL = เก็บในหน่วยความจำ)
cd server && npm run auth:dev     # Login (จำลอง Lambda, user เก็บในหน่วยความจำ)
cd client && npm run dev          # หน้าเว็บ (proxy /socket.io และ /auth ให้เอง)
```

ทดสอบหลายเครื่องในเครื่องตัวเอง: เปิด Redis แล้วรัน server 2 ตัวคนละ port ด้วย `REDIS_URL=redis://localhost:6379`
