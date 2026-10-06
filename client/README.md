# Picasso? — Client

หน้าเว็บของเกมวาดรูปทายคำ (React 19 + Vite + Tailwind CSS) ต่อกับ server ผ่าน Socket.IO และ Login ผ่าน API Gateway + Lambda

## รัน (dev)

ต้องเปิด server เกมและ Login จำลองไว้ก่อน (ดู [README หลัก](../README.md))

```bash
npm install
npm run dev
```

เปิด http://localhost:5173 — Vite proxy ให้เอง:

| path | ส่งต่อไป |
|---|---|
| `/socket.io` | server เกม `localhost:3000` |
| `/auth` | Login จำลอง `localhost:3001` (`lambda/auth/local-server.js`) |

## Environment variables

| ตัวแปร | ใช้ทำอะไร | dev |
|---|---|---|
| `VITE_SOCKET_URL` | URL ของ server เกม (ALB) | เว้นว่าง (ใช้ proxy) |
| `VITE_AUTH_API_URL` | URL ของ API Gateway (Login) | เว้นว่าง (ใช้ proxy) |

ค่าถูกฝังลงไฟล์ตอน build — build production ด้วย [`deploy/deploy-client.ps1`](../deploy/deploy-client.ps1) จะใส่ให้เอง (ถ้า build เองแล้วลืมใส่ Vite จะเตือน)

## โครงสร้าง

```
src/
├── pages/          หน้าหลัก: Home, CreateRoom, BrowseRoom, WaitingRoom, Game, Result
├── components/     DrawingBoard, PlayerAvatar, CharacterCustomizer, AuthModal, ...
├── socket.js       การเชื่อมต่อ Socket.IO + session สำหรับกลับเข้าห้องเดิม
├── auth.js         Login / Register / token
├── avatarParts.js  ชิ้นส่วน avatar แมว (SVG ใน public/avatars)
└── roomSettings.js ค่าเริ่มต้นการตั้งค่าห้อง
```

## คำสั่ง

```bash
npm run dev      # dev server
npm run build    # build ไปที่ dist/
npm run lint     # ESLint
```
