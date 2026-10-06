const { MemoryStore } = require("./MemoryStore")
const { RedisStore } = require("./RedisStore")

// ต่อ Redis ครั้งแรกไม่ได้ภายในเวลานี้ -> เลิก แล้วให้ server ล้มพร้อมบอกสาเหตุ
const REDIS_CONNECT_TIMEOUT = 10000

/*
 * ซ่อนรหัสผ่านใน URL ก่อนพิมพ์ลง log
 */
function maskRedisUrl(redisUrl) {
    try {
        const url = new URL(redisUrl)

        if (url.password) {
            url.password = "****"
        }

        return url.toString()
    } catch {
        return "(invalid REDIS_URL)"
    }
}

/*
 * error ตอนต่อไม่ติดบางแบบ (เช่น ECONNREFUSED ทั้ง IPv4/IPv6)
 * มี message ว่าง -> ดึง code / error ย่อยมาแสดงแทน
 */
function describeError(error) {
    if (!error) {
        return "unknown error"
    }

    if (error.message) {
        return error.message
    }

    if (Array.isArray(error.errors) && error.errors.length > 0) {
        return error.errors.map(describeError).join("; ")
    }

    return error.code || String(error)
}

/*
 * มี REDIS_URL -> ใช้ Redis (รองรับหลาย instance / auto scaling)
 * ไม่มี       -> เก็บในหน่วยความจำ (เครื่องเดียว / dev)
 *
 * คืน { store, adapter, close }
 *   adapter = Socket.IO adapter สำหรับ emit ข้าม instance (null ถ้าไม่ใช้ Redis)
 */
async function createStore(redisUrl) {
    if (!redisUrl) {
        return {
            store: new MemoryStore(),
            adapter: null,
            close: async () => {},
        }
    }

    const { createClient } = require("redis")
    const { createAdapter } = require("@socket.io/redis-adapter")

    /*
     * RESP: 2 ใช้ได้กับ Redis ทุกเวอร์ชัน (ElastiCache Redis / Valkey)
     * และเป็นแบบที่ Socket.IO redis adapter รองรับ
     */
    const client = createClient({
        url: redisUrl,
        RESP: 2,
        socket: {
            connectTimeout: REDIS_CONNECT_TIMEOUT,
        },
    })
    const pubClient = client.duplicate()
    const subClient = client.duplicate()

    let lastError = null

    for (const redisClient of [client, pubClient, subClient]) {
        redisClient.on("error", (error) => {
            lastError = error
            console.error("Redis error:", describeError(error))
        })
    }

    const clients = [client, pubClient, subClient]

    const closeAll = () =>
        Promise.allSettled(
            clients.map((redisClient) =>
                redisClient.isOpen ? redisClient.quit() : redisClient.destroy()
            )
        )

    /*
     * node-redis จะ retry ต่อไปเรื่อยๆ ถ้าต่อไม่ติด
     * จำกัดเวลาตอนเริ่ม เพื่อให้รู้ทันทีว่า REDIS_URL / Security Group ผิด
     * (หลังต่อติดแล้ว ถ้าหลุดระหว่างทำงานจะ reconnect เองตามปกติ)
     */
    let timer

    try {
        await Promise.race([
            Promise.all(clients.map((redisClient) => redisClient.connect())),
            new Promise((_, reject) => {
                timer = setTimeout(
                    () => reject(new Error("timed out")),
                    REDIS_CONNECT_TIMEOUT
                )
            }),
        ])
    } catch (error) {
        /*
         * ห้าม await quit() ตรงนี้: client ที่ยังต่อไม่ติดจะรอไม่จบ
         * และ process จะปิดเงียบๆ โดยไม่บอกสาเหตุ
         */
        for (const redisClient of clients) {
            try {
                redisClient.destroy()
            } catch {
                // ignore
            }
        }

        throw new Error(
            `Cannot connect to Redis at ${maskRedisUrl(redisUrl)} ` +
                `(${describeError(lastError || error)}). ` +
                "Check REDIS_URL (redis:// vs rediss://) and that the Redis security group allows port 6379 from the server."
        )
    } finally {
        clearTimeout(timer)
    }

    return {
        store: new RedisStore(client),
        adapter: createAdapter(pubClient, subClient),
        close: closeAll,
    }
}

module.exports = {
    createStore,
}
