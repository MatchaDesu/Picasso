const crypto = require("crypto")

const {
    serializeGame,
    deserializeGame,
    getNextDeadline,
} = require("../managers/GameManager")

/*
 * Key ที่ใช้ใน store
 */
const ROOMS_SET = "rooms"
const GAME_DEADLINES = "game-deadlines"
const DISCONNECT_DEADLINES = "disconnect-deadlines"

const roomKey = (roomId) => `room:${roomId}`
const gameKey = (roomId) => `game:${roomId}`
const strokesKey = (roomId) => `strokes:${roomId}`
const drawerKey = (roomId) => `drawer:${roomId}`
const lockKey = (name) => `lock:${name}`
const instanceKey = (instanceId) => `instance:${instanceId}`

const LOCK_TTL = 5000
const LOCK_RETRY_DELAY = 15
const LOCK_WAIT_TIMEOUT = 5000

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/*
 * อ่าน/เขียน state ของห้องและเกม
 *
 * ทุกการแก้ไขห้อง/เกม ต้องทำภายใน withRoomLock()
 * กันสอง instance แก้ห้องเดียวกันพร้อมกัน
 */
class GameStore {
    constructor(store) {
        this.store = store
    }

    /*
     * ------------------------------------------------
     * Lock
     * ------------------------------------------------
     */

    /*
     * wait = false -> ถ้ามีคนถืออยู่ ข้ามไปเลย (คืน { locked: false })
     */
    async withLock(name, fn, { wait: shouldWait = true } = {}) {
        const key = lockKey(name)
        const token = crypto.randomUUID()
        const startedAt = Date.now()

        while (!(await this.store.setIfAbsent(key, token, LOCK_TTL))) {
            if (!shouldWait) {
                return { locked: false }
            }

            if (Date.now() - startedAt > LOCK_WAIT_TIMEOUT) {
                throw new Error(`Timed out waiting for lock ${name}`)
            }

            await wait(LOCK_RETRY_DELAY)
        }

        try {
            return {
                locked: true,
                value: await fn(),
            }
        } finally {
            await this.store.deleteIfEquals(key, token)
        }
    }

    async withRoomLock(roomId, fn, options) {
        const result = await this.withLock(`room:${roomId}`, fn, options)

        return result.value
    }

    /*
     * ------------------------------------------------
     * Rooms
     * ------------------------------------------------
     */

    async getRoom(roomId) {
        if (!roomId) {
            return null
        }

        return this.store.get(roomKey(roomId))
    }

    async saveRoom(room) {
        await this.store.set(roomKey(room.id), room)
        await this.store.sAdd(ROOMS_SET, room.id)
    }

    async deleteRoom(roomId) {
        await this.deleteGame(roomId)
        await this.store.del(roomKey(roomId))
        await this.store.sRem(ROOMS_SET, roomId)
    }

    async getRooms() {
        const roomIds = await this.store.sMembers(ROOMS_SET)

        const rooms = await this.store.mGet(roomIds.map(roomKey))

        return rooms.filter(Boolean)
    }

    /*
     * ------------------------------------------------
     * Games
     * ------------------------------------------------
     */

    async getGame(roomId) {
        if (!roomId) {
            return null
        }

        return deserializeGame(await this.store.get(gameKey(roomId)))
    }

    async saveGame(game) {
        await this.store.set(gameKey(game.roomId), serializeGame(game))

        /*
         * เวลาที่เกมต้องเปลี่ยนสถานะครั้งถัดไป (หมดเวลา / เปิด hint)
         * scheduler ของทุก instance ดูจากตรงนี้
         */
        const deadline = getNextDeadline(game)

        if (deadline) {
            await this.store.zAdd(GAME_DEADLINES, deadline, game.roomId)
        } else {
            await this.store.zRem(GAME_DEADLINES, game.roomId)
        }

        /*
         * ใครเป็นคนวาดอยู่ตอนนี้ (เช็คเร็วๆ ตอนรับ stroke)
         */
        if (game.phase === "draw-and-guess") {
            await this.store.set(drawerKey(game.roomId), game.drawerId)
        } else {
            await this.store.del(drawerKey(game.roomId))
        }
    }

    async deleteGame(roomId) {
        await this.store.del(
            gameKey(roomId),
            strokesKey(roomId),
            drawerKey(roomId)
        )

        await this.store.zRem(GAME_DEADLINES, roomId)
    }

    async getDueGameRoomIds(now) {
        return this.store.zRangeByScore(GAME_DEADLINES, now)
    }

    /*
     * ------------------------------------------------
     * Drawing
     * ------------------------------------------------
     */

    async getDrawerId(roomId) {
        return this.store.get(drawerKey(roomId))
    }

    /*
     * คืน false ถ้าเกินจำนวน stroke สูงสุดต่อ turn
     */
    async addStroke(roomId, stroke, maxStrokes) {
        const length = await this.store.rPush(strokesKey(roomId), stroke)

        if (length > maxStrokes) {
            await this.store.rPop(strokesKey(roomId))
            return false
        }

        return true
    }

    async getStrokes(roomId) {
        return this.store.lRange(strokesKey(roomId))
    }

    async clearStrokes(roomId) {
        await this.store.del(strokesKey(roomId))
    }

    /*
     * ------------------------------------------------
     * Disconnect grace period
     * ------------------------------------------------
     */

    async scheduleDisconnectCleanup(roomId, playerId, at) {
        await this.store.zAdd(
            DISCONNECT_DEADLINES,
            at,
            `${roomId}|${playerId}`
        )
    }

    async cancelDisconnectCleanup(roomId, playerId) {
        await this.store.zRem(
            DISCONNECT_DEADLINES,
            `${roomId}|${playerId}`
        )
    }

    async getDueDisconnects(now) {
        const members = await this.store.zRangeByScore(
            DISCONNECT_DEADLINES,
            now
        )

        return members.map((member) => {
            const [roomId, playerId] = member.split("|")

            return { roomId, playerId }
        })
    }

    /*
     * ------------------------------------------------
     * Instance heartbeat
     * ------------------------------------------------
     */

    async heartbeat(instanceId, ttlMs) {
        await this.store.set(instanceKey(instanceId), Date.now(), ttlMs)
    }

    async removeInstance(instanceId) {
        await this.store.del(instanceKey(instanceId))
    }

    async isInstanceAlive(instanceId) {
        return (await this.store.get(instanceKey(instanceId))) !== null
    }
}

module.exports = {
    GameStore,
}
