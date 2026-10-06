# Project Picasso?
เกมวาดรูปทายคำแบบ multiplayer (React + Socket.IO)

## โครงสร้าง

| โฟลเดอร์ | คืออะไร |
|---|---|
| `client/` | หน้าเว็บ React + Vite (ขึ้น S3) |
| `server/` | server เกม Node.js + Socket.IO (EC2 ใน Auto Scaling Group) |
| `lambda/auth/` | Login/Register (API Gateway + Lambda + DynamoDB) |
| `deploy/` | สคริปต์และคู่มือขึ้น AWS |

## รันในเครื่อง

```bash
cd server && npm install && npm run dev       # เกม
cd server && npm run auth:dev                 # Login (จำลอง Lambda)
cd client && npm install && npm run dev       # หน้าเว็บ http://localhost:5173
```

## ทดสอบ

```bash
cd server && npm test
```

ทดสอบ logic เกม, ห้อง, การกลับเข้าห้อง, rate limit, Login, Leaderboard, Quick Match และการตั้งค่าที่ผิด
(แต่ละไฟล์เปิด server ทดสอบของตัวเองบน port ว่าง ไม่ต้องเปิดอะไรไว้ก่อน)

ทดสอบหลายเครื่อง (จำลอง Auto Scaling) ต้องมี Redis แล้วตั้ง `TEST_REDIS_URL` ไม่ตั้งจะข้ามไป:

```powershell
$env:TEST_REDIS_URL="redis://localhost:6379"; npm test
```

## ขึ้น AWS

ดู [deploy/README.md](deploy/README.md)
