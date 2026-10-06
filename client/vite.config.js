import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  server: {
    allowedHosts: ["hug-paper-slouching.ngrok-free.dev"],

    // ส่งต่อ socket ไปที่ server (port 3000)
    // ทำให้เปิด ngrok แค่ port 5173 ก็เล่นจากเครื่องอื่นได้
    proxy: {
      "/socket.io": {
        target: "http://localhost:3000",
        ws: true,
      },
    },
  },
})