/*
 * Integration test: Login (Auth Lambda จำลอง) + server ตรวจ token + Leaderboard
 */
const { test, describe, before, after } = require("node:test")
const assert = require("node:assert/strict")

const {
    wait,
    startServer,
    startAuth,
    stopProcess,
    connect,
    once,
    last,
    closeAll,
    setupRoom,
    chooseWord,
} = require("./helpers")

let server
let auth

before(async () => {
    ;[server, auth] = await Promise.all([startServer(), startAuth()])
})

after(async () => {
    await Promise.all([stopProcess(server), stopProcess(auth)])
})

async function post(path, body) {
    const response = await fetch(`${auth.url}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    })

    return { status: response.status, data: await response.json() }
}

async function register(username) {
    return (await post("/auth/register", { username, password: "secret123" })).data.token
}

describe("Auth Lambda", () => {
    test("validates username and password", async () => {
        assert.equal((await post("/auth/register", { username: "ab", password: "123456" })).data.error, "INVALID_USERNAME")
        assert.equal((await post("/auth/register", { username: "valid_name", password: "123" })).data.error, "INVALID_PASSWORD")
    })

    test("register, duplicate (case-insensitive), login, me", async () => {
        const created = await post("/auth/register", { username: "Matcha", password: "secret123" })

        assert.equal(created.status, 201)
        assert.equal(created.data.user.username, "Matcha")

        assert.equal((await post("/auth/register", { username: "matcha", password: "other123" })).status, 409)

        const login = await post("/auth/login", { username: "MATCHA", password: "secret123" })

        assert.equal(login.status, 200)

        const me = await fetch(`${auth.url}/auth/me`, {
            headers: { Authorization: `Bearer ${login.data.token}` },
        }).then((response) => response.json())

        assert.equal(me.user.username, "Matcha")
    })

    test("wrong password and unknown user give the same error", async () => {
        await post("/auth/register", { username: "someone", password: "secret123" })

        const wrong = await post("/auth/login", { username: "someone", password: "nope" })
        const unknown = await post("/auth/login", { username: "nobody_here", password: "nope" })

        assert.equal(wrong.status, 401)
        assert.equal(wrong.data.error, unknown.data.error)
    })
})

describe("game server login", () => {
    test("valid token logs in with username and allows renaming", async () => {
        const token = await register("renamer")
        const socket = await connect(server.url, { token })

        assert.equal(socket.profile.isLoggedIn, true)
        assert.equal(socket.profile.name, "renamer")

        socket.emit("setPlayerName", "  A Very Long Artist Name Indeed  ")
        const profile = await once(socket, "playerProfile")

        assert.equal(profile.name, "A Very Long Artist N")

        socket.close()
    })

    test("tampered or missing token plays as guest", async () => {
        const token = await register("tamper")

        const tampered = await connect(server.url, { token: token.slice(0, -3) + "abc" })
        const guest = await connect(server.url)

        assert.equal(tampered.profile.isLoggedIn, false)
        assert.equal(guest.profile.isLoggedIn, false)

        closeAll([tampered, guest])
    })
})

describe("leaderboard", () => {
    test("records signed-in players after a game, skips guests", async () => {
        const tokens = [await register("alice"), await register("bob")]

        // คนที่ 3 เป็น guest
        const { sockets } = await setupRoom(server.url, { tokens, settings: { rounds: 1 } })
        const [host] = sockets
        const byId = () => Object.fromEntries(sockets.map((s) => [s.id, s]))

        host.emit("startGame")
        await wait(400)

        for (let t = 0; t < 3; t++) {
            const drawer = byId()[last(host, "gameState").drawerId]
            const word = await chooseWord(drawer)

            sockets.filter((s) => s !== drawer).forEach((s) => s.emit("submitGuess", word))
            await wait(350)
        }

        assert.ok(last(host, "gameFinished"))
        await wait(200)

        host.emit("getLeaderboard")
        const board = await once(host, "leaderboard")

        assert.deepEqual(board.map((entry) => entry.username).sort(), ["alice", "bob"])
        assert.ok(board.every((entry) => entry.gamesPlayed === 1 && entry.totalScore > 0))
        assert.ok(board[0].totalScore >= board[1].totalScore)

        closeAll(sockets)
    })
})
