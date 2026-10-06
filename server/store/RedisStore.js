/*
 * Store บน Redis (ใช้เมื่อตั้ง REDIS_URL)
 *
 * ทุก instance ของ server ใช้ Redis ตัวเดียวกัน
 * จึงเห็นห้อง / เกมเดียวกัน -> scale ได้หลายเครื่อง
 */

// ลบ key เฉพาะเมื่อค่ายังเป็นของเรา (ใช้ปลด lock อย่างปลอดภัย)
const DELETE_IF_EQUALS_SCRIPT = `
if redis.call("GET", KEYS[1]) == ARGV[1] then
    return redis.call("DEL", KEYS[1])
end
return 0
`

class RedisStore {
    constructor(client) {
        this.client = client
    }

    async get(key) {
        const value = await this.client.get(key)

        return value === null ? null : JSON.parse(value)
    }

    async mGet(keys) {
        if (keys.length === 0) {
            return []
        }

        const values = await this.client.mGet(keys)

        return values.map(
            (value) => (value === null ? null : JSON.parse(value))
        )
    }

    async set(key, value, ttlMs = 0) {
        const options = ttlMs ? { PX: ttlMs } : undefined

        await this.client.set(key, JSON.stringify(value), options)
    }

    async setIfAbsent(key, value, ttlMs) {
        const result = await this.client.set(
            key,
            JSON.stringify(value),
            { NX: true, PX: ttlMs }
        )

        return result === "OK"
    }

    async deleteIfEquals(key, value) {
        const result = await this.client.eval(
            DELETE_IF_EQUALS_SCRIPT,
            {
                keys: [key],
                arguments: [JSON.stringify(value)],
            }
        )

        return result === 1
    }

    async del(...keys) {
        if (keys.length > 0) {
            await this.client.del(keys)
        }
    }

    async sAdd(key, member) {
        await this.client.sAdd(key, member)
    }

    async sRem(key, member) {
        await this.client.sRem(key, member)
    }

    async sMembers(key) {
        return this.client.sMembers(key)
    }

    async zAdd(key, score, member) {
        await this.client.zAdd(key, { score, value: member })
    }

    async zRem(key, member) {
        await this.client.zRem(key, member)
    }

    async zRangeByScore(key, maxScore) {
        return this.client.zRangeByScore(key, 0, maxScore)
    }

    async rPush(key, value) {
        return this.client.rPush(key, JSON.stringify(value))
    }

    async rPop(key) {
        await this.client.rPop(key)
    }

    async lRange(key) {
        const values = await this.client.lRange(key, 0, -1)

        return values.map((value) => JSON.parse(value))
    }

    async close() {
        await this.client.quit()
    }
}

module.exports = {
    RedisStore,
}
