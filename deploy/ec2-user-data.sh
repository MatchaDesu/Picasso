#!/bin/bash
#
# User data ของ Launch Template (Amazon Linux 2023)
#
# ทุกเครื่องที่ Auto Scaling สร้างจะรันสคริปต์นี้ครั้งแรกที่บูต:
#   1. ติดตั้ง Node.js 22 + CloudWatch Agent
#   2. ดึงโค้ด server จาก S3 (ผ่าน VPC Endpoint)
#   3. รัน server เป็น systemd service (ล่มแล้วขึ้นใหม่เอง)
#   4. ส่ง log ไป CloudWatch Logs
#
# >>> แก้ค่าในส่วน "ตั้งค่า" ก่อนวางลง Launch Template <<<
#
set -euxo pipefail

# ========== ตั้งค่า ==========
REGION="ap-southeast-1"

# bucket ที่เก็บ server.tar.gz (ไม่ใช่ bucket ของหน้าเว็บ)
ARTIFACT_BUCKET="picasso-artifacts-CHANGE-ME"
ARTIFACT_KEY="server.tar.gz"

# origin ของหน้าเว็บ (S3 website / โดเมน) คั่นด้วย comma ได้
CLIENT_URL="http://picasso-web-CHANGE-ME.s3-website-ap-southeast-1.amazonaws.com"

# Primary endpoint ของ ElastiCache (ถ้าเปิด encryption in transit ใช้ rediss://)
REDIS_URL="redis://CHANGE-ME.cache.amazonaws.com:6379"

# ต้องตรงกับ AUTH_SECRET ของ Auth Lambda
AUTH_SECRET="CHANGE-ME"

# ชื่อ Auto Scaling Group (ใช้เป็น dimension ของ metric ActiveConnections)
ASG_NAME="picasso-asg"

# ตาราง DynamoDB ของบัญชีผู้ใช้ (server บันทึกคะแนน Leaderboard ลงตารางนี้)
USERS_TABLE="PicassoUsers"
# =============================

APP_DIR=/opt/picasso
LOG_DIR=/var/log/picasso

# ---------- 1. ติดตั้งโปรแกรม ----------
curl -fsSL https://rpm.nodesource.com/setup_22.x | bash -
dnf install -y nodejs amazon-cloudwatch-agent

useradd --system --home "$APP_DIR" --shell /sbin/nologin picasso || true
mkdir -p "$APP_DIR" "$LOG_DIR"

# ---------- 2. ดึงโค้ดจาก S3 ----------
aws s3 cp "s3://${ARTIFACT_BUCKET}/${ARTIFACT_KEY}" /tmp/server.tar.gz --region "$REGION"

rm -rf "$APP_DIR/server"
mkdir -p "$APP_DIR/server"
tar -xzf /tmp/server.tar.gz -C "$APP_DIR/server"

cd "$APP_DIR/server"
npm ci --omit=dev

cat > "$APP_DIR/server/.env" <<EOF
PORT=3000
CLIENT_URL=${CLIENT_URL}
REDIS_URL=${REDIS_URL}
AUTH_SECRET=${AUTH_SECRET}
METRICS_NAMESPACE=Picasso
ASG_NAME=${ASG_NAME}
USERS_TABLE=${USERS_TABLE}
AWS_REGION=${REGION}
EOF

chown -R picasso:picasso "$APP_DIR" "$LOG_DIR"
chmod 600 "$APP_DIR/server/.env"

# ---------- 3. systemd service ----------
cat > /etc/systemd/system/picasso.service <<'EOF'
[Unit]
Description=Picasso game server
After=network-online.target
Wants=network-online.target

[Service]
User=picasso
WorkingDirectory=/opt/picasso/server
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=3
Environment=NODE_ENV=production

# ASG ปิดเครื่อง -> SIGTERM -> server mark ผู้เล่นว่าหลุด
# แล้ว client ต่อใหม่ไปเครื่องอื่นเอง
KillSignal=SIGTERM
TimeoutStopSec=20

StandardOutput=append:/var/log/picasso/server.log
StandardError=append:/var/log/picasso/server.log

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now picasso

# ---------- 4. CloudWatch Logs ----------
cat > /opt/aws/amazon-cloudwatch-agent/etc/picasso.json <<'EOF'
{
  "logs": {
    "logs_collected": {
      "files": {
        "collect_list": [
          {
            "file_path": "/var/log/picasso/server.log",
            "log_group_name": "/picasso/server",
            "log_stream_name": "{instance_id}",
            "retention_in_days": 7
          }
        ]
      }
    }
  }
}
EOF

/opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl \
  -a fetch-config -m ec2 -s \
  -c file:/opt/aws/amazon-cloudwatch-agent/etc/picasso.json
