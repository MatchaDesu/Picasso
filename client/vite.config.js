import process from "node:process"
import { defineConfig, loadEnv } from "vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"

/*
 * build production แต่ยังไม่ได้ตั้ง URL -> เตือน
 * (หน้าเว็บบน S3 อยู่คนละที่กับ ALB / API Gateway ต้องตั้งให้ครบ
 *  ใช้ deploy/deploy-client.ps1 จะตั้งให้เอง)
 */
function warnMissingProductionUrls(mode) {
  if (mode !== "production") {
    return
  }

  const env = loadEnv(mode, process.cwd(), "VITE_")

  const missing = ["VITE_SOCKET_URL", "VITE_AUTH_API_URL"].filter(
    (key) => !env[key]
  )

  if (missing.length > 0) {
    console.warn(
      `\n⚠️  ${missing.join(", ")} is empty. The built site will connect to its own origin.\n` +
        "   For S3 + ALB + API Gateway, build with deploy/deploy-client.ps1 (or set these in client/.env.production).\n"
    )
  }
}

export default defineConfig(({ mode }) => {
  warnMissingProductionUrls(mode)

  return {
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

        // Auth Lambda ที่รันในเครื่อง (node lambda/auth/local-server.js)
        "/auth": {
          target: "http://localhost:3001",
        },
      },
    },
  }
})
