/*
 * Store ในหน่วยความจำ
 *
 * ใช้ตอนไม่ได้ตั้ง REDIS_URL (เครื่องเดียว / dev)
 * มี method ชุดเดียวกับ RedisStore ทุกตัว
 * ค่าทุกตัวเก็บเป็น JSON เหมือน Redis
 */
class MemoryStore {
    constructor() {
        this.values = new Map()
        this.expiresAt = new Map()
        this.sets = new Map()
        this.sortedSets = new Map()
        this.lists = new Map()
    }

    isAlive(key) {
        const expiresAt = this.expiresAt.get(key)

        if (expiresAt && expiresAt <= Date.now()) {
            this.values.delete(key)
            this.expiresAt.delete(key)
            return false
        }

        return this.values.has(key)
    }

    async get(key) {
        return this.isAlive(key)
            ? JSON.parse(this.values.get(key))
            : null
    }

    async mGet(keys) {
        return Promise.all(
            keys.map((key) => this.get(key))
        )
    }

    async set(key, value, ttlMs = 0) {
        this.values.set(key, JSON.stringify(value))

        if (ttlMs) {
            this.expiresAt.set(key, Date.now() + ttlMs)
        } else {
            this.expiresAt.delete(key)
        }
    }

    async setIfAbsent(key, value, ttlMs) {
        if (this.isAlive(key)) {
            return false
        }

        await this.set(key, value, ttlMs)

        return true
    }

    async deleteIfEquals(key, value) {
        if (
            this.isAlive(key) &&
            this.values.get(key) === JSON.stringify(value)
        ) {
            this.values.delete(key)
            this.expiresAt.delete(key)
            return true
        }

        return false
    }

    async del(...keys) {
        for (const key of keys) {
            this.values.delete(key)
            this.expiresAt.delete(key)
            this.sets.delete(key)
            this.sortedSets.delete(key)
            this.lists.delete(key)
        }
    }

    async sAdd(key, member) {
        if (!this.sets.has(key)) {
            this.sets.set(key, new Set())
        }

        this.sets.get(key).add(member)
    }

    async sRem(key, member) {
        this.sets.get(key)?.delete(member)
    }

    async sMembers(key) {
        return Array.from(this.sets.get(key) || [])
    }

    async zAdd(key, score, member) {
        if (!this.sortedSets.has(key)) {
            this.sortedSets.set(key, new Map())
        }

        this.sortedSets.get(key).set(member, score)
    }

    async zRem(key, member) {
        this.sortedSets.get(key)?.delete(member)
    }

    /*
     * member ที่ score <= maxScore เรียงจากน้อยไปมาก
     */
    async zRangeByScore(key, maxScore) {
        const entries = Array.from(
            this.sortedSets.get(key) || []
        )

        return entries
            .filter(([, score]) => score <= maxScore)
            .sort((a, b) => a[1] - b[1])
            .map(([member]) => member)
    }

    async rPush(key, value) {
        if (!this.lists.has(key)) {
            this.lists.set(key, [])
        }

        const list = this.lists.get(key)

        list.push(JSON.stringify(value))

        return list.length
    }

    async rPop(key) {
        this.lists.get(key)?.pop()
    }

    async lRange(key) {
        return (this.lists.get(key) || []).map(
            (value) => JSON.parse(value)
        )
    }

    async ping() {
        return true
    }

    async close() {}
}

module.exports = {
    MemoryStore,
}
