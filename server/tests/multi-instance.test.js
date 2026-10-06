/*
 * Test: server 2 เครื่องใช้ Redis ร่วมกัน (จำลอง Auto Scaling)
 *
 * ต้องมี Redis แล้วตั้ง TEST_REDIS_URL ก่อนรัน ไม่ตั้ง = ข้าม
 *   PowerShell: $env:TEST_REDIS_URL="redis://localhost:6379"; npm test
 *   bash:       TEST_REDIS_URL=redis://localhost:6379 npm test
 *
 * ใช้เวลาประมาณ 1 นาที (รอ timer เลือกคำ 15 วินาที และรอตรวจเครื่องตาย)
 */
const { test, describe, before, after } = require("node:test")
const assert = require("node:assert/strict")

const {
    wait,
    startServer,
    stopProcess,
    connect,
    once,
    last,
    closeAll,
    uniqueRoomId,
    chooseWord,
} = require("./helpers")

const REDIS_URL = process.env.TEST_REDIS_URL

const STROKE = {
    points: [{ x: 0.1, y: 0.1 }, { x: 0.2, y: 0.2 }],
    color: "#ff0000",
    size: 8,
    mode: "draw",
}

describe("multiple instances with Redis", { skip: !REDIS_URL && "TEST_REDIS_URL not set" }, () => {
    let s1
    let s2

    before(async () => {
        ;[s1, s2] = await Promise.all([
            startServer({ REDIS_URL }),
            startServer({ REDIS_URL }),
        ])
    })

    after(async () => {
        await Promise.all([stopProcess(s1), stopProcess(s2)])
    })

    test("players on different instances play in the same room, and survive an instance crash", async () => {
        const a = await connect(s1.url)
        const b = await connect(s2.url)
        const c = await connect(s1.url)
        const sockets = [a, b, c]

        assert.notEqual(a.profile.serverId, b.profile.serverId)

        const roomId = uniqueRoomId("M")

        a.emit("createRoom", { roomId, drawingTime: 30, rounds: 1 })
        const created = await once(a, "roomCreated")

        b.emit("getRooms")
        assert.ok((await once(b, "roomsList")).some((room) => room.id === roomId), "room visible from S2")

        b.emit("joinRoom", roomId)
        await once(b, "roomJoined")
        c.emit("joinRoom", roomId)
        const cJoined = await once(c, "roomJoined")
        await wait(200)

        assert.equal(last(a, "roomUpdated").players.length, 3, "S1 sees S2 join")

        a.emit("startGame")
        await wait(400)
        assert.ok(b.log.some((entry) => entry.event === "gameStarted"), "S2 got gameStarted")

        // คนวาดบน S1 -> stroke ถึง S2
        const word = await chooseWord(a)
        a.emit("draw:stroke", STROKE)
        await wait(300)
        assert.ok(b.log.some((entry) => entry.event === "draw:stroke"), "stroke reached S2")

        // ทายถูกพร้อมกันจาก 2 เครื่อง -> นับคะแนนครบ เปลี่ยนตาครั้งเดียว
        b.emit("submitGuess", word)
        c.emit("submitGuess", word)
        await wait(600)

        let state = last(a, "gameState")
        assert.equal(state.turn, 2)
        assert.equal(state.drawerId, b.id)
        assert.equal(state.scores[a.id], 200)

        // ไม่มีใครเลือกคำ -> scheduler (เครื่องไหนก็ได้) เลือกให้หลัง 15 วินาที
        await wait(15800)
        state = last(c, "gameState")
        assert.equal(state.phase, "draw-and-guess")

        // C ย้ายจาก S1 ไป S2
        const cOldId = c.id
        c.close()
        await wait(300)

        const c2 = await connect(s2.url)
        sockets.push(c2)
        c2.emit("resumeRoom", { roomId, oldPlayerId: cOldId, resumeToken: cJoined.resumeToken })
        assert.ok(await once(c2, "roomResumed"), "resume on another instance")
        await wait(300)
        assert.equal(last(a, "gameState").scores[c2.id], state.scores[cOldId])

        // S1 ดับกะทันหัน -> S2 รู้จาก heartbeat แล้ว mark ว่าหลุด
        const aOldId = a.id
        s1.child.kill("SIGKILL")
        await wait(22000)

        assert.ok(
            b.log.some((entry) => entry.event === "playerDisconnected" && entry.data.playerId === aOldId),
            "dead instance's player marked disconnected"
        )

        const a2 = await connect(s2.url)
        sockets.push(a2)
        a2.emit("resumeRoom", { roomId, oldPlayerId: aOldId, resumeToken: created.resumeToken })
        assert.ok(await once(a2, "roomResumed"), "resume after instance crash")
        await wait(300)
        assert.notEqual(last(a2, "gameState")?.phase, "game-result")

        closeAll(sockets)
    })
})
