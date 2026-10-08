/*
 * ต่อ server หลายรอบ แล้วดูว่าแต่ละเครื่องตอบ Leaderboard อย่างไร
 *
 *   node scripts/probe-leaderboard.js http://<ALB-DNS> [จำนวนรอบ]
 */

const { io } = require("socket.io-client")

const url = process.argv[2] || "http://localhost:3000"
const attempts = Number(process.argv[3]) || 10
const TIMEOUT_MS = 5000

function probe() {
    return new Promise((resolve) => {
        const socket = io(url, { transports: ["websocket"], forceNew: true })
        let serverId = "?"

        const timer = setTimeout(() => {
            socket.close()
            resolve({ serverId, result: `no reply in ${TIMEOUT_MS}ms` })
        }, TIMEOUT_MS)

        socket.on("playerProfile", (profile) => {
            serverId = profile.serverId
        })

        socket.on("connect", () => socket.emit("getLeaderboard"))

        socket.on("leaderboard", (entries) => {
            clearTimeout(timer)
            socket.close()
            resolve({ serverId, result: `${entries.length} entries` })
        })

        socket.on("connect_error", (error) => {
            clearTimeout(timer)
            socket.close()
            resolve({ serverId, result: `connect_error: ${error.message}` })
        })
    })
}

async function main() {
    for (let i = 1; i <= attempts; i++) {
        const { serverId, result } = await probe()
        console.log(`#${i} ${serverId} -> ${result}`)
    }
}

main()
