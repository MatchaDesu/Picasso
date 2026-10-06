/*
 * โหลด .env (Node >= 20.12)
 * ไม่มีไฟล์ก็ข้ามไป ใช้ค่า default
 */
try {
  process.loadEnvFile()
} catch {
  // no .env file
}

const crypto = require("crypto")
const os = require("os")
const express = require("express")
const cors = require("cors")
const http = require("http")
const { Server } = require("socket.io")

const { createStore } = require("./store")
const { GameStore } = require("./services/GameStore")
const { createStatsStore } = require("./services/StatsStore")
const { registerSocketHandlers } = require("./socket/socketHandler")
const { startMetricsPublisher } = require("./utils/Metrics")

/*
 * id ของ instance นี้ (ใช้ heartbeat และโชว์ตอนเดโม scaling)
 */
const INSTANCE_ID = `${os.hostname()}-${crypto.randomBytes(3).toString("hex")}`

const PORT = process.env.PORT || 3000

const IS_PRODUCTION = process.env.NODE_ENV === "production"

const DEV_AUTH_SECRET = "picasso-dev-secret"

const MIN_AUTH_SECRET_LENGTH = 32

/*
 * ต้องตรงกับ AUTH_SECRET ของ Auth Lambda
 * dev ไม่ตั้งได้ (ใช้ค่าสำรอง) แต่ production ต้องตั้งเสมอ
 */
const AUTH_SECRET = process.env.AUTH_SECRET || DEV_AUTH_SECRET

/*
 * เช็คค่าที่ตั้งผิดแล้วระบบดูเหมือนทำงานได้ แต่จริงๆ พัง/ไม่ปลอดภัย
 * คืนรายการปัญหา (ว่าง = ผ่าน)
 */
function validateConfig() {
  const problems = []

  const secret = process.env.AUTH_SECRET || ""

  if (IS_PRODUCTION) {
    // ค่าสำรองอยู่ในโค้ดบน GitHub ใครก็ปลอม token ได้
    if (!secret || secret === DEV_AUTH_SECRET || secret === "CHANGE-ME") {
      problems.push(
        "AUTH_SECRET is not set (or still the placeholder). Generate one with: " +
          "node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\""
      )
    } else if (secret.length < MIN_AUTH_SECRET_LENGTH) {
      problems.push(
        `AUTH_SECRET is too short (${secret.length} chars, need at least ${MIN_AUTH_SECRET_LENGTH}).`
      )
    }
  }

  /*
   * รันใน Auto Scaling Group แต่ไม่มี Redis
   * -> แต่ละเครื่องเก็บห้องแยกกัน ผู้เล่นคนละเครื่องไม่เห็นห้องกัน
   */
  if (process.env.ASG_NAME && !process.env.REDIS_URL) {
    problems.push(
      "ASG_NAME is set but REDIS_URL is not. Multiple instances need a shared Redis (ElastiCache)."
    )
  }

  return problems
}

const configProblems = validateConfig()

if (configProblems.length > 0) {
  console.error("Invalid configuration:")
  configProblems.forEach((problem) => console.error(`  - ${problem}`))
  process.exit(1)
}

if (!process.env.AUTH_SECRET) {
  console.warn("AUTH_SECRET is not set. Using an insecure development secret.")
}

/*
 * CLIENT_URL ใส่ได้หลาย origin คั่นด้วย comma
 * เช่น http://localhost:5173,https://xxx.ngrok-free.dev
 */
const clientUrl = (process.env.CLIENT_URL || "http://localhost:5173")
  .split(",")
  .map((url) => url.trim())
  .filter(Boolean)

async function main() {
  const { store, adapter, close: closeStore } = await createStore(
    process.env.REDIS_URL
  )

  const app = express()
  const server = http.createServer(app)

  app.use(cors({ origin: clientUrl }))
  app.use(express.json())

  const io = new Server(server, {
    cors: {
      origin: clientUrl,
      methods: ["GET", "POST"],
    },
  })

  if (adapter) {
    io.adapter(adapter)
  }

  app.get("/", (req, res) => {
    res.send("Picasso Server is running")
  })

  /*
   * Health check สำหรับ Load Balancer
   *
   * เช็ค Redis ด้วย ถ้า Redis ล่ม/ต่อไม่ได้ ตอบ 503
   * ALB จะได้หยุดส่งผู้เล่นมาที่เครื่องนี้
   */
  const HEALTH_CHECK_TIMEOUT = 2000

  app.get("/health", async (req, res) => {
    let storeOk = false

    try {
      storeOk = await Promise.race([
        store.ping(),
        new Promise((resolve) =>
          setTimeout(() => resolve(false), HEALTH_CHECK_TIMEOUT)
        ),
      ])
    } catch {
      storeOk = false
    }

    res.status(storeOk ? 200 : 503).json({
      ok: storeOk,
      instanceId: INSTANCE_ID,
      store: adapter ? "redis" : "memory",
      storeOk,
      connections: io.engine.clientsCount,
    })
  })

  const { shutdown } = registerSocketHandlers(io, {
    gameStore: new GameStore(store),
    statsStore: createStatsStore(process.env.USERS_TABLE),
    instanceId: INSTANCE_ID,
    authSecret: AUTH_SECRET,
  })

  const stopMetrics = startMetricsPublisher({
    io,
    instanceId: INSTANCE_ID,
  })

  server.listen(PORT, () => {
    console.log(
      `[${INSTANCE_ID}] Server running on port ${PORT} (store: ${adapter ? "redis" : "memory"})`
    )
  })

  /*
   * ECS / Auto Scaling ส่ง SIGTERM ก่อนปิดเครื่อง
   * mark ผู้เล่นว่าหลุด แล้วปิด process
   * client จะต่อใหม่ไปเครื่องอื่นเองและ resume เข้าห้องเดิม
   */
  let shuttingDown = false

  async function handleSignal(signal) {
    if (shuttingDown) {
      return
    }

    shuttingDown = true

    console.log(`[${INSTANCE_ID}] ${signal} received. Shutting down...`)

    try {
      stopMetrics()
      await shutdown()
      await closeStore()
    } catch (error) {
      console.error(`[${INSTANCE_ID}] Shutdown error:`, error)
    }

    process.exit(0)
  }

  process.on("SIGTERM", () => handleSignal("SIGTERM"))
  process.on("SIGINT", () => handleSignal("SIGINT"))
}

main().catch((error) => {
  console.error("Failed to start server:", error)
  process.exit(1)
})
