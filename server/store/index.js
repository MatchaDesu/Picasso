const { MemoryStore } = require("./MemoryStore")
const { RedisStore } = require("./RedisStore")

/*
 * มี REDIS_URL -> ใช้ Redis (รองรับหลาย instance / auto scaling)
 * ไม่มี       -> เก็บในหน่วยความจำ (เครื่องเดียว / dev)
 *
 * คืน { store, adapter }
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
     * ถ้าเชื่อมต่อไม่ได้ ให้ล้มตอนเริ่ม ไม่ retry ไปเรื่อยๆ เงียบๆ
     */
    const client = createClient({
        url: redisUrl,
        RESP: 2,
        socket: {
            connectTimeout: 10000,
        },
    })
    const pubClient = client.duplicate()
    const subClient = client.duplicate()

    for (const redisClient of [client, pubClient, subClient]) {
        redisClient.on("error", (error) => {
            console.error("Redis error:", error.message)
        })
    }

    await Promise.all([
        client.connect(),
        pubClient.connect(),
        subClient.connect(),
    ])

    return {
        store: new RedisStore(client),
        adapter: createAdapter(pubClient, subClient),
        close: async () => {
            await Promise.allSettled([
                client.quit(),
                pubClient.quit(),
                subClient.quit(),
            ])
        },
    }
}

module.exports = {
    createStore,
}
