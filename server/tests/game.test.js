/*
 * Integration test: เกมทั้งรอบผ่าน Socket.IO (server โหมดหน่วยความจำ)
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
    count,
    closeAll,
    uniqueRoomId,
    setupRoom,
    chooseWord,
} = require("./helpers")

let server

before(async () => {
    server = await startServer()
})

after(async () => {
    await stopProcess(server)
})

const STROKE = {
    points: [{ x: 0.1, y: 0.1 }, { x: 0.2, y: 0.2 }],
    color: "#000000",
    size: 8,
    mode: "draw",
}

describe("rooms and settings", () => {
    test("room input is sanitized and creator gets a private resume token", async () => {
        const host = await connect(server.url)
        const guest = await connect(server.url)
        const roomId = uniqueRoomId()

        host.emit("createRoom", { roomId, roomTitle: "x".repeat(100), drawingTime: 0.5 })
        const created = await once(host, "roomCreated")

        assert.equal(created.title.length, 40)
        assert.equal(created.settings.drawingTime, 60)
        assert.equal(typeof created.resumeToken, "string")

        guest.emit("joinRoom", roomId)
        const joined = await once(guest, "roomJoined")

        assert.ok(!JSON.stringify(joined.players).includes(created.resumeToken))

        closeAll([host, guest])
    })

    test("only the host can change settings, invalid values are ignored", async () => {
        const { sockets } = await setupRoom(server.url)
        const [host, guest] = sockets

        guest.emit("updateRoomSettings", { rounds: 5 })
        assert.equal((await once(guest, "roomError")).error, "ONLY_HOST_CAN_CHANGE_SETTINGS")

        host.emit("updateRoomSettings", { rounds: 3, category: "animals", drawingTime: 90 })
        await wait(200)
        host.emit("updateRoomSettings", { rounds: 99, category: "nope" })
        await wait(200)

        const settings = last(guest, "roomUpdated").settings

        assert.deepEqual(settings, { drawingTime: 90, rounds: 3, category: "animals" })

        closeAll(sockets)
    })
})

describe("drawing and guessing", () => {
    let sockets
    let word

    before(async () => {
        ;({ sockets } = await setupRoom(server.url, { settings: { rounds: 1 } }))

        sockets[0].emit("startGame")
        await wait(400)

        word = await chooseWord(sockets[0])
    })

    after(() => closeAll(sockets))

    test("strokes are validated, clamped and only accepted from the drawer", async () => {
        const [drawer, guesser] = sockets

        drawer.emit("draw:stroke", { points: "bad" })
        drawer.emit("draw:stroke", { ...STROKE, points: [{ x: 0, y: 0 }, { x: 5, y: 0.5 }], size: 999 })
        guesser.emit("draw:stroke", STROKE)
        await wait(300)

        const received = guesser.log.filter((entry) => entry.event === "draw:stroke")

        assert.equal(received.length, 1)
        assert.equal(received[0].data.points[1].x, 1)
        assert.equal(received[0].data.size, 50)
        assert.equal(count(drawer, "draw:stroke"), 0)
    })

    test("a burst of strokes is capped at 60 per second", async () => {
        const [drawer, guesser] = sockets

        await wait(1100)

        const before = count(guesser, "draw:stroke")

        for (let i = 0; i < 200; i++) {
            drawer.emit("draw:stroke", STROKE)
        }

        await wait(700)

        assert.equal(count(guesser, "draw:stroke") - before, 60)
    })

    test("wrong guesses appear in chat with name and text", async () => {
        const [, guesser, other] = sockets

        guesser.emit("submitGuess", "definitely-wrong")
        const message = await once(other, "chatMessage")

        assert.equal(message.text, "definitely-wrong")
        assert.equal(message.playerName, guesser.profile.name)
    })

    test("correct guess scores both players and never leaks the answer", async () => {
        const [drawer, guesser, other] = sockets

        guesser.emit("submitGuess", word)
        const event = await once(other, "playerGuessedCorrectly")

        assert.equal(event.playerName, guesser.profile.name)
        assert.ok(event.points >= 100)

        const leaked = other.log
            .filter((entry) => entry.event !== "drawerWord")
            .some((entry) => JSON.stringify(entry.data ?? "").includes(`"${word}"`))

        assert.equal(leaked, false)

        await wait(200)
        assert.equal(last(other, "gameState").scores[drawer.id], 100)
    })
})

describe("reconnect", () => {
    test("resume needs the right token and works more than once", async () => {
        const { sockets } = await setupRoom(server.url)
        const [host, guest] = sockets
        const roomId = host.joined.id

        host.emit("startGame")
        await wait(400)
        const word = await chooseWord(host)
        sockets[2].emit("submitGuess", "nope")
        await wait(200)

        const token = guest.joined.resumeToken
        const oldId = guest.id

        guest.close()
        await wait(300)

        const imposter = await connect(server.url)
        imposter.emit("resumeRoom", { roomId, oldPlayerId: oldId, resumeToken: "wrong" })
        assert.equal((await once(imposter, "resumeFailed")).error, "INVALID_RESUME_TOKEN")

        const second = await connect(server.url)
        second.emit("resumeRoom", { roomId, oldPlayerId: oldId, resumeToken: token })
        assert.ok(await once(second, "roomResumed"))
        await wait(300)

        const history = last(second, "guessHistory")
        assert.ok(Array.isArray(history) && history.length === 1)
        assert.ok(!JSON.stringify(history).includes(word))
        assert.ok(Array.isArray(last(second, "draw:history")))

        const secondId = second.id
        second.close()
        await wait(300)

        const third = await connect(server.url)
        third.emit("resumeRoom", { roomId, oldPlayerId: secondId, resumeToken: token })
        assert.ok(await once(third, "roomResumed"))

        closeAll([...sockets, imposter, third])
    })
})

describe("full game and play again", () => {
    test("2 rounds x 3 players, drawer points, return to room, play again", async () => {
        const { sockets } = await setupRoom(server.url, {
            settings: { rounds: 2, category: "animals", drawingTime: 30 },
        })
        const [host] = sockets
        const byId = () => Object.fromEntries(sockets.map((s) => [s.id, s]))

        host.emit("startGame")
        await wait(400)

        const turns = []
        const words = []

        for (let t = 0; t < 6; t++) {
            const state = last(host, "gameState")
            const drawer = byId()[state.drawerId]

            turns.push(`${state.round}/${state.totalRounds}:${state.turn}`)

            const word = await chooseWord(drawer)
            words.push(word)

            for (const socket of sockets) {
                if (socket !== drawer) {
                    socket.emit("submitGuess", word)
                }
            }

            await wait(350)
        }

        assert.deepEqual(turns, ["1/2:1", "1/2:2", "1/2:3", "2/2:1", "2/2:2", "2/2:3"])
        assert.equal(new Set(words).size, 6)

        const finished = last(host, "gameFinished")

        assert.ok(finished)
        assert.equal(finished.room.status, "waiting")
        assert.ok(Object.values(finished.scores).every((score) => score >= 400))

        // คนใหม่เข้าได้ และเริ่มรอบใหม่ได้
        const newcomer = await connect(server.url)
        newcomer.emit("joinRoom", host.joined.id)
        assert.ok(await once(newcomer, "roomJoined"))

        host.emit("startGame")
        await wait(400)

        const fresh = last(host, "gameState")

        assert.equal(fresh.round, 1)
        assert.equal(fresh.turnsPerRound, 4)
        assert.ok(Object.values(fresh.scores).every((score) => score === 0))

        closeAll([...sockets, newcomer])
    })
})

describe("guess rate limit", () => {
    test("more than 5 guesses in 3 seconds are blocked", async () => {
        const { sockets } = await setupRoom(server.url)
        const [host, guesser, watcher] = sockets

        host.emit("startGame")
        await wait(400)
        await chooseWord(host)

        for (let i = 0; i < 8; i++) {
            guesser.emit("submitGuess", `wrong${i}`)
        }

        await wait(400)

        const blocked = guesser.log.filter((entry) => entry.data?.error === "TOO_MANY_GUESSES").length

        assert.equal(blocked, 3)
        assert.equal(count(watcher, "chatMessage"), 5)

        closeAll(sockets)
    })
})
