/*
 * Integration test: หน้า Home (avatar, Quick Match, Join with Room Code)
 */
const { test, describe, before, after } = require("node:test")
const assert = require("node:assert/strict")

const {
    wait,
    startServer,
    stopProcess,
    connect,
    once,
    closeAll,
} = require("./helpers")

let server

before(async () => {
    server = await startServer()
})

after(async () => {
    await stopProcess(server)
})

describe("avatar", () => {
    test("default avatar, valid update, invalid values fall back", async () => {
        const socket = await connect(server.url)

        assert.deepEqual(socket.profile.avatar, { body: "Orange", ears: "N", accessory: "none" })

        socket.emit("setPlayerAvatar", { body: "Black", ears: "L", accessory: "Glasses" })
        assert.deepEqual((await once(socket, "playerProfile")).avatar, {
            body: "Black",
            ears: "L",
            accessory: "Glasses",
        })

        socket.emit("setPlayerAvatar", { body: "<script>", ears: "Z", accessory: "Hat" })
        assert.deepEqual((await once(socket, "playerProfile")).avatar, {
            body: "Orange",
            ears: "N",
            accessory: "none",
        })

        socket.close()
    })
})

// ต้องรันก่อน test อื่นที่สร้างห้อง (server นี้ยังไม่มีห้องว่าง)
describe("quick match and join with code", () => {
    test("quick match creates a room, then others join it", async () => {
        const [a, b] = [await connect(server.url), await connect(server.url)]

        a.emit("quickMatch")
        const created = await once(a, "roomCreated")

        assert.equal(created.title, "Quick Match")
        assert.match(created.id, /^[A-Z0-9]{4}$/)

        b.emit("quickMatch")
        assert.equal((await once(b, "roomJoined")).id, created.id)

        // join ด้วยรหัสตัวพิมพ์เล็กก็ได้
        const c = await connect(server.url)
        c.emit("joinRoom", created.id.toLowerCase())
        assert.equal((await once(c, "roomJoined")).id, created.id)

        closeAll([a, b, c])
        await wait(200)
    })

    test("bad room codes give clear errors", async () => {
        const socket = await connect(server.url)

        socket.emit("joinRoom", "ZZZZ")
        assert.equal((await once(socket, "roomError")).error, "ROOM_NOT_FOUND")

        socket.emit("joinRoom", "AB")
        assert.equal((await once(socket, "roomError")).error, "INVALID_ROOM_ID")

        socket.close()
    })

    test("cannot quick match while already in a room", async () => {
        const socket = await connect(server.url)

        socket.emit("quickMatch")
        await once(socket, "roomJoined", 2000)

        socket.emit("quickMatch")
        assert.equal((await once(socket, "roomError")).error, "ALREADY_IN_ROOM")

        socket.close()
    })
})
