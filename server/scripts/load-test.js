/*
 * Load test: สร้างบอทจำนวนมากเข้ามาเล่นพร้อมกัน
 * ใช้เดโม Auto Scaling (จำนวน connection ต่อเครื่องสูง -> ASG เพิ่มเครื่อง)
 *
 *   node scripts/load-test.js <server-url> [rooms] [minutes]
 *   node scripts/load-test.js http://picasso-alb-xxx.elb.amazonaws.com 30 10
 *
 * แต่ละห้องมีบอท 3 ตัว: สร้างห้อง เริ่มเกม คนวาดส่ง stroke คนอื่นทายมั่วๆ
 * จบเกมแล้วเริ่มใหม่วนไปจนหมดเวลา
 * ท้ายสุดสรุปว่าบอทกระจายอยู่กับ server เครื่องไหนบ้าง
 */

const { io } = require("socket.io-client")

const SERVER_URL = process.argv[2] || "http://localhost:3000"
const ROOM_COUNT = Number(process.argv[3]) || 10
const DURATION_MINUTES = Number(process.argv[4]) || 5

const PLAYERS_PER_ROOM = 3
const STROKES_PER_SECOND = 20

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const serverCounts = new Map()

function connectBot() {
    return new Promise((resolve, reject) => {
        const socket = io(SERVER_URL, {
            transports: ["websocket"],
            forceNew: true,
        })

        const timeout = setTimeout(() => reject(new Error("connect timeout")), 10000)

        socket.once("playerProfile", (profile) => {
            clearTimeout(timeout)

            socket.serverId = profile.serverId

            serverCounts.set(
                profile.serverId,
                (serverCounts.get(profile.serverId) || 0) + 1
            )

            resolve(socket)
        })

        socket.once("connect_error", (error) => {
            clearTimeout(timeout)
            reject(error)
        })
    })
}

/*
 * บอทเล่นเกมเอง: ถ้าเป็นคนวาดก็เลือกคำและวาด ถ้าไม่ใช่ก็ทายมั่ว
 */
function playAsBot(socket) {
    let drawTimer = null

    socket.on("wordOptions", (options) => {
        setTimeout(() => socket.emit("selectWord", options[0]), 1000)
    })

    socket.on("gameState", (state) => {
        clearInterval(drawTimer)

        if (state.phase !== "draw-and-guess") {
            return
        }

        if (state.drawerId === socket.id) {
            drawTimer = setInterval(() => {
                const x = Math.random()
                const y = Math.random()

                socket.emit("draw:stroke", {
                    points: [
                        { x, y },
                        { x: x + 0.01, y: y + 0.01 },
                    ],
                    color: "#000000",
                    size: 8,
                    mode: "draw",
                })
            }, 1000 / STROKES_PER_SECOND)
        } else if (Math.random() < 0.5) {
            socket.emit("submitGuess", `guess-${Math.floor(Math.random() * 100)}`)
        }
    })

    socket.on("disconnect", () => clearInterval(drawTimer))
}

async function runRoom(index, endsAt) {
    const roomId = `LOAD${String(index).padStart(3, "0")}${Math.floor(Math.random() * 1000)}`

    const bots = []

    for (let i = 0; i < PLAYERS_PER_ROOM; i++) {
        bots.push(await connectBot())
    }

    bots.forEach(playAsBot)

    const [host, ...others] = bots

    host.emit("createRoom", {
        roomId,
        roomTitle: `Load test ${index}`,
        drawingTime: 30,
        rounds: 1,
    })

    await new Promise((resolve) => host.once("roomCreated", resolve))

    for (const bot of others) {
        bot.emit("joinRoom", roomId)
        await new Promise((resolve) => bot.once("roomJoined", resolve))
    }

    /*
     * เล่นวนไปจนหมดเวลา (จบเกมแล้ว host เริ่มใหม่)
     */
    host.on("gameFinished", () => {
        if (Date.now() < endsAt) {
            setTimeout(() => host.emit("startGame"), 2000)
        }
    })

    host.emit("startGame")

    return bots
}

async function main() {
    console.log(
        `Load test: ${ROOM_COUNT} rooms x ${PLAYERS_PER_ROOM} bots on ${SERVER_URL} for ${DURATION_MINUTES} min`
    )

    const endsAt = Date.now() + DURATION_MINUTES * 60 * 1000

    const allBots = []

    for (let index = 0; index < ROOM_COUNT; index++) {
        try {
            allBots.push(...(await runRoom(index, endsAt)))
        } catch (error) {
            console.error(`Room ${index} failed:`, error.message)
        }

        // ค่อยๆ เพิ่ม ไม่ยิงพร้อมกันทีเดียว
        await wait(200)
    }

    console.log(`${allBots.length} bots connected`)

    const report = setInterval(() => {
        const connected = allBots.filter((bot) => bot.connected).length

        console.log(
            `[${new Date().toLocaleTimeString()}] connected: ${connected}/${allBots.length}`
        )
    }, 30000)

    await wait(Math.max(0, endsAt - Date.now()))

    clearInterval(report)

    console.log("\nBots per server instance (at connect time):")

    for (const [serverId, count] of serverCounts) {
        console.log(`  ${serverId}: ${count}`)
    }

    allBots.forEach((bot) => bot.close())

    process.exit(0)
}

main().catch((error) => {
    console.error(error)
    process.exit(1)
})
