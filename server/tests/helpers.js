/*
 * ตัวช่วยสำหรับชุดทดสอบ (node --test)
 *
 * แต่ละไฟล์ทดสอบเปิด server ของตัวเองบน port ว่าง แล้วปิดเองเมื่อจบ
 * รัน server ใน temp dir -> ไม่โหลด server/.env ของเครื่อง
 */

const { spawn } = require("node:child_process")
const net = require("node:net")
const os = require("node:os")
const path = require("node:path")

const { io } = require("socket.io-client")

const SERVER_ENTRY = path.join(__dirname, "..", "server.js")
const AUTH_ENTRY = path.join(__dirname, "..", "..", "lambda", "auth", "local-server.js")

// ใช้ secret เดียวกันทั้ง server และ Lambda จำลอง (ยาวพอผ่าน validation)
const TEST_AUTH_SECRET = "test-secret-0123456789abcdef0123456789abcdef"

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function getFreePort() {
    return new Promise((resolve, reject) => {
        const server = net.createServer()

        server.unref()
        server.on("error", reject)
        server.listen(0, () => {
            const { port } = server.address()
            server.close(() => resolve(port))
        })
    })
}

/*
 * env สะอาด: ไม่ติดค่า production / AWS จากเครื่องคนรัน
 */
function cleanEnv(extra = {}) {
    const env = { ...process.env }

    for (const key of [
        "NODE_ENV",
        "REDIS_URL",
        "ASG_NAME",
        "METRICS_NAMESPACE",
        "USERS_TABLE",
        "AUTH_SECRET",
        "CLIENT_URL",
        "PORT",
        "AUTH_PORT",
    ]) {
        delete env[key]
    }

    return {
        ...env,
        AUTH_SECRET: TEST_AUTH_SECRET,
        ...extra,
    }
}

/*
 * spawn process แล้วรอจนเจอข้อความใน log
 */
function startProcess(entry, env, readyPattern, timeoutMs = 20000) {
    return new Promise((resolve, reject) => {
        const child = spawn(process.execPath, [entry], {
            cwd: os.tmpdir(),
            env,
            stdio: ["ignore", "pipe", "pipe"],
        })

        let output = ""

        const timer = setTimeout(() => {
            child.kill()
            reject(new Error(`Process did not become ready:\n${output}`))
        }, timeoutMs)

        const onData = (chunk) => {
            output += chunk

            if (readyPattern.test(output)) {
                clearTimeout(timer)
                resolve(child)
            }
        }

        child.stdout.on("data", onData)
        child.stderr.on("data", onData)

        child.on("exit", (code) => {
            clearTimeout(timer)
            reject(new Error(`Process exited (${code}) before ready:\n${output}`))
        })

        child.output = () => output
    })
}

async function startServer(extraEnv = {}) {
    const port = await getFreePort()

    const child = await startProcess(
        SERVER_ENTRY,
        cleanEnv({ PORT: String(port), ...extraEnv }),
        /Server running on port/
    )

    // หลังพร้อมแล้ว ไม่สนว่า exit อย่างไร (ตอนปิดเอง)
    child.removeAllListeners("exit")

    return {
        child,
        port,
        url: `http://localhost:${port}`,
    }
}

async function startAuth() {
    const port = await getFreePort()

    const child = await startProcess(
        AUTH_ENTRY,
        cleanEnv({ AUTH_PORT: String(port) }),
        /Auth \(local Lambda\) running/
    )

    child.removeAllListeners("exit")

    return {
        child,
        port,
        url: `http://localhost:${port}`,
    }
}

function stopProcess(handle) {
    const child = handle?.child

    // จบไปแล้ว (exit เอง หรือถูก kill ด้วย signal)
    if (!child || child.exitCode !== null || child.signalCode !== null) {
        return Promise.resolve()
    }

    return new Promise((resolve) => {
        child.once("exit", resolve)
        child.kill()
    })
}

/*
 * รัน server แล้วรอให้ process จบ (ใช้ทดสอบ config ผิด)
 */
function runServerUntilExit(extraEnv, timeoutMs = 30000) {
    return new Promise((resolve) => {
        const child = spawn(process.execPath, [SERVER_ENTRY], {
            cwd: os.tmpdir(),
            env: cleanEnv(extraEnv),
            stdio: ["ignore", "pipe", "pipe"],
        })

        let output = ""

        child.stdout.on("data", (chunk) => (output += chunk))
        child.stderr.on("data", (chunk) => (output += chunk))

        const timer = setTimeout(() => child.kill(), timeoutMs)

        child.on("exit", (code) => {
            clearTimeout(timer)
            resolve({ code, output })
        })
    })
}

/*
 * client ทดสอบ: เก็บทุก event ไว้ใน socket.log
 */
function connect(url, { token, reconnection = false } = {}) {
    return new Promise((resolve, reject) => {
        const socket = io(url, {
            transports: ["websocket"],
            forceNew: true,
            reconnection,
            auth: token ? { token } : {},
        })

        socket.log = []
        socket.onAny((event, data) => socket.log.push({ event, data }))

        const timer = setTimeout(() => reject(new Error("connect timeout")), 5000)

        socket.once("playerProfile", (profile) => {
            clearTimeout(timer)
            socket.profile = profile
            resolve(socket)
        })
    })
}

function once(socket, event, timeoutMs = 5000) {
    return Promise.race([
        new Promise((resolve) => socket.once(event, resolve)),
        wait(timeoutMs).then(() => null),
    ])
}

function last(socket, event) {
    return [...socket.log].reverse().find((entry) => entry.event === event)?.data
}

function count(socket, event) {
    return socket.log.filter((entry) => entry.event === event).length
}

function closeAll(sockets) {
    sockets.forEach((socket) => socket?.close())
}

let roomCounter = 0

// room id ไม่ซ้ำกันในแต่ละ test
function uniqueRoomId(prefix = "T") {
    roomCounter += 1

    return `${prefix}${process.pid % 1000}${roomCounter}`.slice(0, 12).toUpperCase()
}

/*
 * สร้างห้อง + ผู้เล่นครบ แล้วคืน sockets [host, ...others]
 */
async function setupRoom(url, { players = 3, settings = {}, tokens = [] } = {}) {
    const sockets = []

    for (let i = 0; i < players; i++) {
        sockets.push(await connect(url, { token: tokens[i] }))
    }

    const [host, ...others] = sockets
    const roomId = uniqueRoomId()

    host.emit("createRoom", { roomId, roomTitle: "Test", ...settings })

    const created = await once(host, "roomCreated")

    for (const socket of others) {
        socket.emit("joinRoom", roomId)
        socket.joined = await once(socket, "roomJoined")
    }

    host.joined = created

    return { sockets, roomId, created }
}

/*
 * ให้คนวาดเลือกคำ แล้วคืนคำที่ได้
 */
async function chooseWord(drawer) {
    const options = last(drawer, "wordOptions")

    drawer.emit("selectWord", options[0])

    await wait(250)

    return last(drawer, "drawerWord")?.word
}

module.exports = {
    TEST_AUTH_SECRET,
    wait,
    startServer,
    startAuth,
    stopProcess,
    runServerUntilExit,
    connect,
    once,
    last,
    count,
    closeAll,
    uniqueRoomId,
    setupRoom,
    chooseWord,
}
