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

## ขึ้น AWS

ดู [deploy/README.md](deploy/README.md)
