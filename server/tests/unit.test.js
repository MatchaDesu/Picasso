/*
 * Unit test: logic ล้วน ไม่ต้องเปิด server
 */
const { test, describe } = require("node:test")
const assert = require("node:assert/strict")
const crypto = require("node:crypto")

const GameManager = require("../managers/GameManager")
const RoomManager = require("../managers/RoomManager")
const { verifyAuthToken } = require("../utils/AuthToken")
const { MemoryStore } = require("../store/MemoryStore")

const players = [{ id: "a" }, { id: "b" }, { id: "c" }]
const NOW = 1_000_000

function startDrawing(word, settings = {}) {
    const game = GameManager.createGame("R", players, { drawingTime: 60, rounds: 1, ...settings }, NOW)

    game.wordOptions = [word]

    const events = []
    GameManager.selectWord(game, "a", word, NOW, events)

    return { game, events }
}

describe("GameManager", () => {
    test("selectWord starts the turn and asks to clear the canvas", () => {
        const { game, events } = startDrawing("cat")

        assert.equal(game.phase, "draw-and-guess")
        assert.deepEqual(events, ["turnStarted"])
    })

    test("hints never reveal the whole word and are spread over drawing time", () => {
        for (const [word, maxHints] of [["cat", 1], ["pizza", 2], ["ice cream", 4], ["elephant", 4]]) {
            const { game } = startDrawing(word)
            const revealTimes = []

            for (let t = NOW; t < NOW + 60000; t += 250) {
                const before = game.hint

                GameManager.tick(game, t, [])

                if (game.phase === "draw-and-guess" && game.hint !== before) {
                    revealTimes.push(t - NOW)
                }
            }

            assert.equal(revealTimes.length, maxHints, word)
            assert.ok(revealTimes.every((ms) => ms < 60000))
        }
    })

    test("drawing time running out moves to the next drawer", () => {
        const { game } = startDrawing("cat")

        GameManager.tick(game, NOW + 60000, [])

        assert.equal(game.phase, "choose-word")
        assert.equal(game.drawerId, "b")
    })

    test("choose-word timeout picks a word automatically", () => {
        const game = GameManager.createGame("R", players, {}, NOW)
        const events = []

        assert.equal(GameManager.tick(game, NOW + 14000, events), false)
        assert.equal(GameManager.tick(game, NOW + 15000, events), true)
        assert.equal(game.phase, "draw-and-guess")
        assert.deepEqual(events, ["turnStarted"])
    })

    test("guess ignores case and extra spaces", () => {
        const { game } = startDrawing("ice cream")

        const result = GameManager.submitGuess(game, "b", "  ICE   Cream ", NOW + 1000)

        assert.equal(result.correct, true)
    })

    test("drawer gets 100 points per correct guess", () => {
        const { game } = startDrawing("cat")

        GameManager.submitGuess(game, "b", "cat", NOW + 1000)
        GameManager.submitGuess(game, "c", "cat", NOW + 2000)

        assert.equal(game.scores.a, 200)
    })

    test("correct guess message does not contain the answer", () => {
        const { game } = startDrawing("cat")

        const result = GameManager.submitGuess(game, "b", "cat", NOW + 1000)

        assert.equal(result.message.guess, undefined)
    })

    test("rounds: everyone draws once per round, then the game ends", () => {
        const game = GameManager.createGame("R", players, { rounds: 2 }, NOW)
        const turns = []

        while (game.phase !== "game-result") {
            turns.push(`${game.round}:${game.drawerId}`)
            GameManager.finishTurn(game, NOW)
        }

        assert.deepEqual(turns, ["1:a", "1:b", "1:c", "2:a", "2:b", "2:c"])
    })

    test("no repeated words within a game", () => {
        const game = GameManager.createGame("R", players, { rounds: 5, category: "animals" }, NOW)
        const used = []

        while (game.phase !== "game-result") {
            const word = game.wordOptions[0]

            used.push(word)
            GameManager.selectWord(game, game.drawerId, word, NOW, [])
            GameManager.finishTurn(game, NOW)
        }

        assert.equal(new Set(used).size, used.length)
    })

    test("last drawer leaving ends the final round instead of looping", () => {
        const game = GameManager.createGame("R", players, { rounds: 1 }, NOW)

        GameManager.finishTurn(game, NOW)
        GameManager.finishTurn(game, NOW)

        assert.equal(game.drawerId, "c")

        GameManager.removePlayer(game, "c", NOW)

        assert.equal(game.phase, "game-result")
    })

    test("only one player left ends the game", () => {
        const game = GameManager.createGame("R", players, {}, NOW)

        GameManager.removePlayer(game, "b", NOW)
        GameManager.removePlayer(game, "c", NOW)

        assert.equal(game.phase, "game-result")
    })

    test("sanitizeStroke clamps values and rejects bad input", () => {
        assert.equal(GameManager.sanitizeStroke({ points: "x" }), null)
        assert.equal(GameManager.sanitizeStroke({ points: [{ x: 0, y: 0 }, { x: 1, y: 1 }], color: "red", size: 4 }), null)

        const stroke = GameManager.sanitizeStroke({
            points: [{ x: -1, y: 0.5 }, { x: 5, y: 0.5 }],
            color: "#FF0000",
            size: 999,
            mode: "weird",
        })

        assert.deepEqual(stroke.points, [{ x: 0, y: 0.5 }, { x: 1, y: 0.5 }])
        assert.equal(stroke.size, 50)
        assert.equal(stroke.mode, "draw")
    })

    test("serialize/deserialize keeps Sets", () => {
        const { game } = startDrawing("cat")

        const restored = GameManager.deserializeGame(
            JSON.parse(JSON.stringify(GameManager.serializeGame(game)))
        )

        assert.ok(restored.usedWords instanceof Set)
        assert.ok(restored.usedWords.has("cat"))
    })
})

describe("RoomManager", () => {
    test("invalid settings fall back to defaults / current values", () => {
        const room = RoomManager.createRoom("ROOM", { id: "h" }, { drawingTime: 7, rounds: 99, category: "nope" })

        assert.deepEqual(room.settings, RoomManager.DEFAULT_SETTINGS)

        RoomManager.updateSettings(room, "h", { rounds: 3, category: "food" })
        RoomManager.updateSettings(room, "h", { rounds: 42 })

        assert.equal(room.settings.rounds, 3)
        assert.equal(room.settings.category, "food")
    })

    test("only host can change settings", () => {
        const room = RoomManager.createRoom("ROOM", { id: "h" })

        RoomManager.addPlayer(room, { id: "p" })

        assert.equal(RoomManager.updateSettings(room, "p", { rounds: 5 }).error, "ONLY_HOST_CAN_CHANGE_SETTINGS")
    })

    test("host disconnecting in waiting room passes host to an online player", () => {
        const room = RoomManager.createRoom("ROOM", { id: "h" })

        RoomManager.addPlayer(room, { id: "p" })
        RoomManager.markPlayerDisconnected(room, "h")

        assert.equal(room.hostId, "p")
    })

    test("title is trimmed to 40 characters", () => {
        const room = RoomManager.createRoom("ROOM", { id: "h" }, { title: "x".repeat(100) })

        assert.equal(room.title.length, 40)
    })
})

describe("AuthToken", () => {
    const secret = "unit-test-secret-0123456789abcdef0123"

    function sign(payload) {
        const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url")
        const body = Buffer.from(JSON.stringify(payload)).toString("base64url")
        const signature = crypto.createHmac("sha256", secret).update(`${header}.${body}`).digest("base64url")

        return `${header}.${body}.${signature}`
    }

    const future = Math.floor(Date.now() / 1000) + 60

    test("accepts a valid token", () => {
        assert.equal(verifyAuthToken(sign({ username: "alice", exp: future }), secret).username, "alice")
    })

    test("rejects tampered, expired or wrong-secret tokens", () => {
        const token = sign({ username: "alice", exp: future })

        assert.equal(verifyAuthToken(token.slice(0, -2) + "xx", secret), null)
        assert.equal(verifyAuthToken(sign({ username: "alice", exp: 1 }), secret), null)
        assert.equal(verifyAuthToken(token, "other-secret"), null)
    })
})

describe("MemoryStore", () => {
    test("setIfAbsent works as a lock and TTL expires", async () => {
        const store = new MemoryStore()

        assert.equal(await store.setIfAbsent("lock", "a", 50), true)
        assert.equal(await store.setIfAbsent("lock", "b", 50), false)
        assert.equal(await store.deleteIfEquals("lock", "b"), false)

        await new Promise((resolve) => setTimeout(resolve, 80))

        assert.equal(await store.setIfAbsent("lock", "c", 50), true)
    })
})
