const crypto = require("crypto")

const RoomManager = require("../managers/RoomManager")
const GameManager = require("../managers/GameManager")

const {
    generateGuestName,
} = require("../utils/NameGenerator")

const {
    verifyAuthToken,
} = require("../utils/AuthToken")

/*
 * ------------------------------------------------
 * Config
 * ------------------------------------------------
 */

// เวลาที่รอให้ผู้เล่นที่หลุดกลับมา ก่อนเอาออกจากห้อง
const RECONNECT_GRACE_TIME = 15000

// scheduler เช็คเกมที่ถึงเวลาเปลี่ยนสถานะ (แทน setTimeout)
const SCHEDULER_INTERVAL = 250

// heartbeat ของ instance และการเช็ค instance ที่ตายไป
const HEARTBEAT_INTERVAL = 5000
const INSTANCE_TTL = 15000
const SWEEP_INTERVAL = 5000

const ROOM_ID_PATTERN = /^[A-Z0-9]{4,12}$/

const MAX_NAME_LENGTH = 20

/*
 * ชิ้นส่วน avatar ที่มี (ต้องตรงกับ client/src/avatarParts.js)
 */
const AVATAR_OPTIONS = {
    body: ["Orange", "Black", "White", "Calico", "Cow"],
    ears: ["N", "L", "S"],
    accessory: ["none", "Glasses", "Moustache", "Bow", "Pan"],
}

const DEFAULT_AVATAR = {
    body: "Orange",
    ears: "N",
    accessory: "none",
}

/*
 * จำกัดการทาย: ไม่เกิน GUESS_LIMIT ครั้ง ภายใน GUESS_WINDOW ms
 */
const GUESS_LIMIT = 5
const GUESS_WINDOW = 3000

/*
 * จำกัด stroke: ไม่เกิน STROKE_LIMIT ครั้งต่อวินาที (เกินแล้วทิ้ง)
 * client รวมจุดแล้วส่งไม่เกิน 50 ครั้ง/วินาที (DrawingBoard.jsx)
 * กัน client ที่ตั้งใจส่งรัวๆ ทำให้ Redis และทั้งห้องหนัก
 */
const STROKE_LIMIT = 60
const STROKE_WINDOW = 1000

/*
 * ------------------------------------------------
 * Serialize (ส่งให้ client)
 * ------------------------------------------------
 */

/*
 * รับเฉพาะค่าที่อยู่ในรายการ ค่าอื่นใช้ default
 */
function sanitizeAvatar(avatar) {
    const pick = (key) =>
        AVATAR_OPTIONS[key].includes(avatar?.[key])
            ? avatar[key]
            : DEFAULT_AVATAR[key]

    return {
        body: pick("body"),
        ears: pick("ears"),
        accessory: pick("accessory"),
    }
}

/*
 * ห้ามส่ง resumeToken / instanceId ให้คนอื่น
 */
function serializePlayer(player) {
    return {
        id: player.id,
        name: player.name,
        isLoggedIn: Boolean(player.isLoggedIn),
        avatar: sanitizeAvatar(player.avatar),
        disconnected: Boolean(player.disconnected),
    }
}

function serializeRoom(room) {
    if (!room) {
        return null
    }

    const activePlayers = RoomManager.getActivePlayers(room)

    return {
        id: room.id,
        title: room.title,
        hostId: room.hostId,
        status: room.status,

        settings: {
            drawingTime: room.settings.drawingTime,
            rounds: room.settings.rounds,
            category: room.settings.category,
        },

        settingsOptions: RoomManager.SETTINGS_OPTIONS,

        players: activePlayers.map(serializePlayer),

        playerCount: activePlayers.length,

        maxPlayers: RoomManager.MAX_PLAYERS,
    }
}

function getPlayerName(room, playerId) {
    return RoomManager.findPlayer(room, playerId)?.name || "Player"
}

/*
 * แปลง guess message เป็นรูปแบบที่ส่งให้ client ได้
 *
 * คำตอบที่ถูกจะไม่มี text
 * กันคำตอบรั่วไปถึงคนที่ยังทายไม่ถูก
 */
function toPublicGuessMessage(room, message) {
    return {
        id: `${message.timestamp}-${message.playerId}`,
        type: message.correct ? "correct" : "wrong",
        playerId: message.playerId,
        playerName: getPlayerName(room, message.playerId),
        text: message.correct ? "" : message.guess,
        points: message.points || 0,
    }
}

function serializeGuessHistory(room, game) {
    return game.guessMessages.map((message) =>
        toPublicGuessMessage(room, message)
    )
}

function generateRoomId() {
    const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"

    let roomId = ""

    for (let i = 0; i < 4; i++) {
        roomId += characters[crypto.randomInt(characters.length)]
    }

    return roomId
}

function normalizeRoomId(roomId) {
    return String(roomId || "")
        .trim()
        .toUpperCase()
}

/*
 * นับแบบหน้าต่างคงที่ (ถูกและเร็ว เหมาะกับ event ถี่ๆ อย่าง stroke)
 */
function isStrokeRateLimited(socket) {
    const now = Date.now()

    if (
        !socket.data.strokeWindowStart ||
        now - socket.data.strokeWindowStart >= STROKE_WINDOW
    ) {
        socket.data.strokeWindowStart = now
        socket.data.strokeCount = 0
    }

    socket.data.strokeCount += 1

    return socket.data.strokeCount > STROKE_LIMIT
}

function isGuessRateLimited(socket) {
    const now = Date.now()

    const recentGuesses = (socket.data.guessTimes || []).filter(
        (time) => now - time < GUESS_WINDOW
    )

    if (recentGuesses.length >= GUESS_LIMIT) {
        socket.data.guessTimes = recentGuesses

        return true
    }

    recentGuesses.push(now)

    socket.data.guessTimes = recentGuesses

    return false
}

/*
 * ------------------------------------------------
 * Register
 *
 * ทุก instance รันโค้ดชุดนี้เหมือนกัน
 * state อยู่ใน gameStore (Redis) ไม่ได้อยู่ในเครื่อง
 * การ emit ข้ามเครื่องทำผ่าน Socket.IO Redis adapter
 * ------------------------------------------------
 */

function registerSocketHandlers(
    io,
    { gameStore, statsStore, instanceId, authSecret }
) {
    /*
     * --------------------------------------------
     * Emit helpers
     *
     * ใช้ io.to(socketId) แทน io.sockets.sockets.get()
     * เพราะ socket อาจอยู่คนละ instance
     * --------------------------------------------
     */

    function emitRoomUpdate(room) {
        io.to(room.id).emit("roomUpdated", serializeRoom(room))
    }

    function emitGameState(room, game) {
        io.to(game.roomId).emit("gameState", GameManager.getPublicState(game))

        if (game.phase === "choose-word") {
            io.to(game.drawerId).emit("wordOptions", game.wordOptions)
            return
        }

        if (game.phase === "draw-and-guess") {
            io.to(game.drawerId).emit("drawerWord", { word: game.word })

            io.to(game.roomId).emit(
                "guessHistory",
                serializeGuessHistory(room, game)
            )
        }
    }

    async function emitCurrentGameStateToSocket(socket, room, game) {
        socket.emit("gameState", GameManager.getPublicState(game))

        if (game.phase === "choose-word" && game.drawerId === socket.id) {
            socket.emit("wordOptions", game.wordOptions)
        }

        if (game.phase === "draw-and-guess") {
            if (game.drawerId === socket.id) {
                socket.emit("drawerWord", { word: game.word })
            }

            // reconnect: ส่งภาพที่วาดไปแล้ว (ไม่ clear canvas)
            socket.emit("draw:history", await gameStore.getStrokes(room.id))

            socket.emit("guessHistory", serializeGuessHistory(room, game))
        }
    }

    /*
     * --------------------------------------------
     * Game state changes
     *
     * เรียกหลังแก้เกมทุกครั้ง (ภายใน room lock)
     * --------------------------------------------
     */

    async function applyGameChange(room, game, events = []) {
        if (game.phase === "game-result") {
            await finishGameAndReturnToRoom(room, game)
            return
        }

        /*
         * เริ่มวาดคำใหม่ -> ล้าง canvas ครั้งเดียว
         * (hint / guess ไม่ล้าง canvas)
         */
        if (events.includes("turnStarted")) {
            await gameStore.clearStrokes(room.id)

            io.to(room.id).emit("draw:clear")
        }

        await gameStore.saveGame(game)

        emitGameState(room, game)
    }

    /*
     * จบเกมแล้วพาทุกคนกลับห้องรอ (ไม่ลบห้อง)
     * host กดเริ่มรอบใหม่ได้ และคนใหม่เข้าห้องได้อีกครั้ง
     */
    async function finishGameAndReturnToRoom(room, game) {
        /*
         * รวมคนที่หลุดชั่วคราวด้วย จะได้ไม่หายจากหน้าผลลัพธ์
         */
        const players = room.players
            .filter((player) =>
                Object.prototype.hasOwnProperty.call(game.scores, player.id)
            )
            .map(serializePlayer)

        const scores = { ...game.scores }

        await recordGameStats(room, scores)

        await gameStore.deleteGame(room.id)

        room.status = "waiting"

        await gameStore.saveRoom(room)

        io.to(room.id).emit("gameFinished", {
            players,
            scores,
            room: serializeRoom(room),
        })

        emitRoomUpdate(room)

        io.emit("roomListChanged")

        console.log(`[${instanceId}] Game finished in room ${room.id}.`)
    }

    /*
     * บันทึกคะแนนลง Leaderboard (เฉพาะคนที่ login)
     * คะแนนสูงสุดของเกม = ชนะ (เสมอกันชนะทุกคน)
     */
    async function recordGameStats(room, scores) {
        const topScore = Math.max(0, ...Object.values(scores))

        const results = room.players
            .filter(
                (player) =>
                    player.username &&
                    Object.prototype.hasOwnProperty.call(scores, player.id)
            )
            .map((player) => ({
                username: player.username,
                score: scores[player.id],
                won: topScore > 0 && scores[player.id] === topScore,
            }))

        if (results.length === 0) {
            return
        }

        try {
            await statsStore.recordResults(results)
        } catch (error) {
            // บันทึกไม่ได้ไม่ควรทำให้เกมค้าง
            console.error(`[${instanceId}] recordGameStats failed:`, error)
        }
    }

    /*
     * --------------------------------------------
     * Remove player (ออกเอง / หลุดเกินเวลา)
     * ต้องเรียกภายใน room lock
     * --------------------------------------------
     */

    async function removePlayerFromRoom(room, playerId) {
        const playerName = getPlayerName(room, playerId)

        const game = await gameStore.getGame(room.id)

        let gameResult = null

        if (game) {
            gameResult = GameManager.removePlayer(game, playerId)
        }

        const hasPlayers = RoomManager.removePlayer(room, playerId)

        await gameStore.cancelDisconnectCleanup(room.id, playerId)

        /*
         * ห้องไม่เหลือใครแล้ว
         */
        if (!hasPlayers) {
            await gameStore.deleteRoom(room.id)

            io.emit("roomClosed", room.id)
            io.emit("roomListChanged")

            return
        }

        /*
         * ผู้เล่นในเกมออกหมด (เหลือแค่คนดู) -> กลับห้องรอ
         */
        if (gameResult?.empty) {
            await gameStore.deleteGame(room.id)

            room.status = "waiting"
        }

        await gameStore.saveRoom(room)

        io.to(room.id).emit("playerLeft", {
            playerId,
            playerName,
        })

        if (game && gameResult?.changed && !gameResult.empty) {
            await applyGameChange(room, game)

            // applyGameChange อาจจบเกมไปแล้ว (ส่ง roomUpdated ให้แล้ว)
            if (game.phase === "game-result") {
                return
            }
        }

        emitRoomUpdate(room)

        io.emit("roomListChanged")
    }

    /*
     * --------------------------------------------
     * Disconnect
     * --------------------------------------------
     */

    async function markDisconnected(roomId, playerId) {
        await gameStore.withRoomLock(roomId, async () => {
            const room = await gameStore.getRoom(roomId)

            const player = room && RoomManager.findPlayer(room, playerId)

            /*
             * ไม่มีห้องแล้ว / player ถูก resume เป็น socket ใหม่แล้ว
             * / mark ไปแล้ว
             */
            if (!player || player.disconnected) {
                return
            }

            RoomManager.markPlayerDisconnected(room, playerId)

            await gameStore.saveRoom(room)

            await gameStore.scheduleDisconnectCleanup(
                roomId,
                playerId,
                Date.now() + RECONNECT_GRACE_TIME
            )

            io.to(roomId).emit("playerDisconnected", {
                playerId,
                playerName: player.name,
            })

            emitRoomUpdate(room)
        })
    }

    async function handleDisconnect(socket) {
        const roomId = socket.data.roomId

        if (!roomId) {
            return
        }

        await markDisconnected(roomId, socket.id)
    }

    /*
     * หลุดเกิน RECONNECT_GRACE_TIME -> เอาออกจากห้องจริง
     */
    async function cleanupDisconnectedPlayer(roomId, playerId) {
        await gameStore.withRoomLock(roomId, async () => {
            await gameStore.cancelDisconnectCleanup(roomId, playerId)

            const room = await gameStore.getRoom(roomId)

            const player = room && RoomManager.findPlayer(room, playerId)

            // กลับมาแล้ว หรือออกไปแล้ว
            if (!player || !player.disconnected) {
                return
            }

            await removePlayerFromRoom(room, playerId)
        })
    }

    /*
     * --------------------------------------------
     * Scheduler (ทุก instance รัน)
     *
     * - เกมที่ถึงเวลาเปลี่ยนสถานะ (หมดเวลา / เปิด hint)
     * - ผู้เล่นที่หลุดเกินเวลา
     *
     * lock ต่อห้องกันไม่ให้สอง instance ทำซ้ำ
     * (wait: false = ถ้าเครื่องอื่นทำอยู่ ข้ามไป)
     * --------------------------------------------
     */

    async function runScheduledTasks() {
        const now = Date.now()

        const dueRoomIds = await gameStore.getDueGameRoomIds(now)

        for (const roomId of dueRoomIds) {
            await gameStore.withRoomLock(
                roomId,
                async () => {
                    const game = await gameStore.getGame(roomId)
                    const room = await gameStore.getRoom(roomId)

                    if (!game || !room) {
                        await gameStore.deleteGame(roomId)
                        return
                    }

                    const events = []

                    /*
                     * เช็คเวลาอีกครั้งใน lock
                     * เครื่องอื่นอาจทำไปก่อนแล้ว
                     */
                    if (!GameManager.tick(game, Date.now(), events)) {
                        await gameStore.saveGame(game)
                        return
                    }

                    await applyGameChange(room, game, events)
                },
                { wait: false }
            )
        }

        const dueDisconnects = await gameStore.getDueDisconnects(now)

        for (const { roomId, playerId } of dueDisconnects) {
            await cleanupDisconnectedPlayer(roomId, playerId)
        }
    }

    /*
     * instance ที่ตาย (crash / ถูก scale-in แบบไม่ทันปิด)
     * ไม่ได้ส่ง disconnect ให้ผู้เล่นของมัน
     * -> หา player ที่ instance หาย heartbeat แล้ว mark ว่าหลุด
     */
    async function sweepDeadInstances() {
        await gameStore.withLock(
            "sweep-dead-instances",
            async () => {
                const rooms = await gameStore.getRooms()

                const aliveCache = new Map()

                const isAlive = async (id) => {
                    if (!id || id === instanceId) {
                        return true
                    }

                    if (!aliveCache.has(id)) {
                        aliveCache.set(id, await gameStore.isInstanceAlive(id))
                    }

                    return aliveCache.get(id)
                }

                for (const room of rooms) {
                    for (const player of room.players) {
                        if (
                            !player.disconnected &&
                            !(await isAlive(player.instanceId))
                        ) {
                            console.log(
                                `[${instanceId}] Instance ${player.instanceId} is gone. Marking ${player.id} as disconnected.`
                            )

                            await markDisconnected(room.id, player.id)
                        }
                    }
                }
            },
            { wait: false }
        )
    }

    function startInterval(fn, ms, label) {
        let running = false

        return setInterval(async () => {
            if (running) {
                return
            }

            running = true

            try {
                await fn()
            } catch (error) {
                console.error(`[${instanceId}] ${label} failed:`, error)
            } finally {
                running = false
            }
        }, ms)
    }

    const sendHeartbeat = () =>
        gameStore.heartbeat(instanceId, INSTANCE_TTL)

    sendHeartbeat().catch((error) =>
        console.error(`[${instanceId}] heartbeat failed:`, error)
    )

    const intervals = [
        startInterval(runScheduledTasks, SCHEDULER_INTERVAL, "scheduler"),
        startInterval(sendHeartbeat, HEARTBEAT_INTERVAL, "heartbeat"),
        startInterval(sweepDeadInstances, SWEEP_INTERVAL, "sweep"),
    ]

    /*
     * --------------------------------------------
     * Player
     * --------------------------------------------
     */

    function createPlayerFromSocket(socket) {
        return {
            id: socket.id,
            name: socket.data.name,
            isLoggedIn: Boolean(socket.data.isLoggedIn),
            avatar: sanitizeAvatar(socket.data.avatar),
            disconnected: false,
            disconnectedAt: null,

            // username ของบัญชี (null = guest) ใช้บันทึก Leaderboard
            username: socket.data.username || null,

            // instance ที่ socket นี้ต่ออยู่ (ใช้เช็คตอนเครื่องตาย)
            instanceId,

            /*
             * ใช้ยืนยันตัวตนตอน resumeRoom
             * ห้ามส่งให้ผู้เล่นคนอื่น (serializePlayer ไม่ส่ง)
             */
            resumeToken: crypto.randomUUID(),
        }
    }

    function emitPlayerProfile(socket) {
        socket.emit("playerProfile", {
            name: socket.data.name,
            isLoggedIn: Boolean(socket.data.isLoggedIn),
            avatar: sanitizeAvatar(socket.data.avatar),

            // ให้เห็นว่าต่ออยู่กับ server เครื่องไหน (ใช้ตอนเดโม scaling)
            serverId: instanceId,
        })
    }

    /*
     * --------------------------------------------
     * Connection
     * --------------------------------------------
     */

    io.on("connection", (socket) => {
        /*
         * Login: client ส่ง token จาก Auth Lambda มาตอน handshake
         * ไม่มี / ไม่ถูกต้อง = เล่นแบบ guest
         */
        const auth = verifyAuthToken(socket.handshake.auth?.token, authSecret)

        socket.data.name = auth ? auth.username : generateGuestName()
        socket.data.username = auth ? auth.username : null
        socket.data.isLoggedIn = Boolean(auth)
        socket.data.avatar = { ...DEFAULT_AVATAR }
        socket.data.roomId = null

        emitPlayerProfile(socket)

        console.log(
            `[${instanceId}] User connected: ${socket.id} as ${socket.data.name}`
        )

        /*
         * handler ทุกตัวเป็น async
         * ห่อไว้ไม่ให้ error ทำ server ล่ม
         */
        function on(event, handler) {
            socket.on(event, async (...args) => {
                try {
                    await handler(...args)
                } catch (error) {
                    console.error(`[${instanceId}] ${event} failed:`, error)
                }
            })
        }

        on("getPlayerProfile", () => {
            emitPlayerProfile(socket)
        })

        /*
         * Resume Room (refresh / หลุด / instance เดิมตาย)
         */
        on("resumeRoom", async ({ roomId, oldPlayerId, resumeToken } = {}) => {
            const normalizedRoomId = normalizeRoomId(roomId)

            if (!normalizedRoomId || !oldPlayerId) {
                return
            }

            const error = await gameStore.withRoomLock(
                normalizedRoomId,
                async () => {
                    const room = await gameStore.getRoom(normalizedRoomId)

                    if (!room) {
                        return "ROOM_NOT_FOUND"
                    }

                    const oldPlayer = RoomManager.findPlayer(room, oldPlayerId)

                    if (!oldPlayer) {
                        return "PLAYER_NOT_FOUND"
                    }

                    if (!resumeToken || oldPlayer.resumeToken !== resumeToken) {
                        return "INVALID_RESUME_TOKEN"
                    }

                    /*
                     * ตอน refresh socket ใหม่อาจต่อเข้ามาก่อน
                     * server รู้ว่า socket เก่าหลุด
                     * เช็คข้ามทุก instance (ผ่าน adapter)
                     * client จะ retry เองเมื่อได้ error นี้
                     */
                    if (!oldPlayer.disconnected) {
                        const oldSockets = await io
                            .in(oldPlayerId)
                            .fetchSockets()

                        if (oldSockets.length > 0) {
                            return "PLAYER_STILL_CONNECTED"
                        }
                    }

                    const player = RoomManager.reconnectPlayer(
                        room,
                        oldPlayerId,
                        {
                            id: socket.id,
                            instanceId,
                        }
                    )

                    await gameStore.cancelDisconnectCleanup(
                        normalizedRoomId,
                        oldPlayerId
                    )

                    const game = await gameStore.getGame(normalizedRoomId)

                    if (game) {
                        GameManager.replacePlayerId(game, oldPlayerId, socket.id)

                        await gameStore.saveGame(game)
                    }

                    await gameStore.saveRoom(room)

                    socket.data.name = player.name
                    socket.data.username = player.username || null
                    socket.data.isLoggedIn = Boolean(player.isLoggedIn)
                    socket.data.avatar = sanitizeAvatar(player.avatar)
                    socket.data.roomId = normalizedRoomId

                    socket.join(normalizedRoomId)

                    socket.emit("roomResumed", serializeRoom(room))

                    io.to(normalizedRoomId).emit("playerReconnected", {
                        player: serializePlayer(player),
                    })

                    emitRoomUpdate(room)

                    if (game) {
                        // คนอื่นต้องรู้ id ใหม่ (คะแนน / คนวาด)
                        io.to(normalizedRoomId).emit(
                            "gameState",
                            GameManager.getPublicState(game)
                        )

                        await emitCurrentGameStateToSocket(socket, room, game)
                    }

                    return null
                }
            )

            if (error) {
                socket.emit("resumeFailed", { error })
            }
        })

        /*
         * Set Player Name (ยังต้อง login ก่อน)
         */
        on("setPlayerName", async (name) => {
            if (!socket.data.isLoggedIn) {
                return
            }

            const trimmedName = String(name || "")
                .trim()
                .slice(0, MAX_NAME_LENGTH)

            if (!trimmedName) {
                return
            }

            socket.data.name = trimmedName

            await updateMyPlayer((player) => {
                player.name = trimmedName
            })

            emitPlayerProfile(socket)
        })

        /*
         * Set Player Avatar
         */
        on("setPlayerAvatar", async (avatar) => {
            const sanitizedAvatar = sanitizeAvatar(avatar)

            socket.data.avatar = sanitizedAvatar

            await updateMyPlayer((player) => {
                player.avatar = sanitizedAvatar
            })

            emitPlayerProfile(socket)
        })

        async function updateMyPlayer(update) {
            const roomId = socket.data.roomId

            if (!roomId) {
                return
            }

            await gameStore.withRoomLock(roomId, async () => {
                const room = await gameStore.getRoom(roomId)

                const player = room && RoomManager.findPlayer(room, socket.id)

                if (!player) {
                    return
                }

                update(player)

                await gameStore.saveRoom(room)

                emitRoomUpdate(room)
            })
        }

        /*
         * Create Room
         */
        /*
         * สร้างห้อง (ใช้ทั้ง createRoom และ quickMatch)
         * คืน true ถ้าสร้างสำเร็จ / false ถ้า id ซ้ำ
         */
        async function tryCreateRoom(roomId, settings) {
            const player = createPlayerFromSocket(socket)

            const room = await gameStore.withRoomLock(roomId, async () => {
                if (await gameStore.getRoom(roomId)) {
                    return null
                }

                const newRoom = RoomManager.createRoom(roomId, player, settings)

                await gameStore.saveRoom(newRoom)

                return newRoom
            })

            if (!room) {
                return false
            }

            socket.join(roomId)

            socket.data.roomId = roomId

            socket.emit("roomCreated", {
                ...serializeRoom(room),
                resumeToken: player.resumeToken,
            })

            io.emit("roomListChanged")

            return true
        }

        /*
         * เข้าห้อง (ใช้ทั้ง joinRoom และ quickMatch)
         * คืน error code หรือ null ถ้าเข้าสำเร็จ
         */
        async function tryJoinRoom(roomId) {
            const player = createPlayerFromSocket(socket)

            return gameStore.withRoomLock(roomId, async () => {
                const room = await gameStore.getRoom(roomId)

                if (!room) {
                    return "ROOM_NOT_FOUND"
                }

                const result = RoomManager.addPlayer(room, player)

                if (!result.success) {
                    return result.error
                }

                await gameStore.saveRoom(room)

                socket.join(roomId)

                socket.data.roomId = roomId

                socket.emit("roomJoined", {
                    ...serializeRoom(room),
                    resumeToken: player.resumeToken,
                })

                io.to(roomId).emit("playerJoined", {
                    player: serializePlayer(player),
                })

                emitRoomUpdate(room)

                io.emit("roomListChanged")

                return null
            })
        }

        /*
         * Create Room
         */
        on(
            "createRoom",
            async ({ roomId, roomTitle, drawingTime, rounds, category } = {}) => {
                const normalizedRoomId = normalizeRoomId(roomId)

                if (!ROOM_ID_PATTERN.test(normalizedRoomId)) {
                    socket.emit("roomError", { error: "INVALID_ROOM_ID" })
                    return
                }

                if (socket.data.roomId) {
                    socket.emit("roomError", { error: "ALREADY_IN_ROOM" })
                    return
                }

                const created = await tryCreateRoom(normalizedRoomId, {
                    title: roomTitle,
                    drawingTime,
                    rounds,
                    category,
                })

                if (!created) {
                    socket.emit("roomError", { error: "ROOM_ALREADY_EXISTS" })
                }
            }
        )

        /*
         * Get Rooms
         */
        on("getRooms", async () => {
            const rooms = await gameStore.getRooms()

            socket.emit("roomsList", rooms.map(serializeRoom))
        })

        /*
         * Join Room
         */
        on("joinRoom", async (roomId) => {
            const normalizedRoomId = normalizeRoomId(roomId)

            if (!ROOM_ID_PATTERN.test(normalizedRoomId)) {
                socket.emit("roomError", { error: "INVALID_ROOM_ID" })
                return
            }

            if (socket.data.roomId) {
                socket.emit("roomError", { error: "ALREADY_IN_ROOM" })
                return
            }

            const error = await tryJoinRoom(normalizedRoomId)

            if (error) {
                socket.emit("roomError", { error })
            }
        })

        /*
         * Quick Match
         *
         * เข้าห้องที่รออยู่และยังไม่เต็ม (คนเยอะสุดก่อน จะได้เริ่มเกมเร็ว)
         * ไม่มีห้องว่าง -> สร้างห้องใหม่ให้
         */
        on("quickMatch", async () => {
            if (socket.data.roomId) {
                socket.emit("roomError", { error: "ALREADY_IN_ROOM" })
                return
            }

            const openRooms = (await gameStore.getRooms())
                .filter(
                    (room) =>
                        room.status === "waiting" && !RoomManager.isFull(room)
                )
                .sort(
                    (a, b) =>
                        RoomManager.getActivePlayers(b).length -
                        RoomManager.getActivePlayers(a).length
                )

            /*
             * ห้องอาจเต็ม / เริ่มเกมไปแล้วระหว่างนี้ ลองห้องถัดไป
             */
            for (const room of openRooms) {
                if (!(await tryJoinRoom(room.id))) {
                    return
                }
            }

            for (let attempt = 0; attempt < 5; attempt++) {
                if (
                    await tryCreateRoom(generateRoomId(), {
                        title: "Quick Match",
                    })
                ) {
                    return
                }
            }

            socket.emit("roomError", { error: "QUICK_MATCH_FAILED" })
        })

        /*
         * Get Room
         */
        on("getRoom", async (roomId) => {
            const room = await gameStore.getRoom(normalizeRoomId(roomId))

            if (!room) {
                socket.emit("roomError", { error: "ROOM_NOT_FOUND" })
                return
            }

            socket.emit("roomData", serializeRoom(room))
        })

        /*
         * Request Game State
         */
        on("requestGameState", async () => {
            const roomId = socket.data.roomId

            if (!roomId) {
                return
            }

            const [room, game] = await Promise.all([
                gameStore.getRoom(roomId),
                gameStore.getGame(roomId),
            ])

            if (room && game) {
                await emitCurrentGameStateToSocket(socket, room, game)
            }
        })

        /*
         * Leaderboard (หน้า Home)
         */
        on("getLeaderboard", async () => {
            socket.emit("leaderboard", await statsStore.getLeaderboard())
        })

        /*
         * Room Settings Options (หน้า Create Room ใช้ก่อนมีห้อง)
         */
        on("getRoomSettingsOptions", () => {
            socket.emit("roomSettingsOptions", {
                options: RoomManager.SETTINGS_OPTIONS,
                defaults: RoomManager.DEFAULT_SETTINGS,
            })
        })

        /*
         * Update Room Settings (host เท่านั้น)
         */
        on("updateRoomSettings", async (settings = {}) => {
            const roomId = socket.data.roomId

            if (!roomId) {
                return
            }

            await gameStore.withRoomLock(roomId, async () => {
                const room = await gameStore.getRoom(roomId)

                if (!room) {
                    socket.emit("roomError", { error: "ROOM_NOT_FOUND" })
                    return
                }

                const result = RoomManager.updateSettings(
                    room,
                    socket.id,
                    settings
                )

                if (!result.success) {
                    socket.emit("roomError", { error: result.error })
                    return
                }

                await gameStore.saveRoom(room)

                emitRoomUpdate(room)
            })
        })

        /*
         * Start Game
         */
        on("startGame", async () => {
            const roomId = socket.data.roomId

            if (!roomId) {
                socket.emit("gameError", { error: "NOT_IN_ROOM" })
                return
            }

            await gameStore.withRoomLock(roomId, async () => {
                const room = await gameStore.getRoom(roomId)

                let error = null

                if (!room) {
                    error = "ROOM_NOT_FOUND"
                } else if (room.hostId !== socket.id) {
                    error = "ONLY_HOST_CAN_START"
                } else if (room.status !== "waiting") {
                    error = "GAME_ALREADY_STARTED"
                } else if (!RoomManager.canStart(room)) {
                    error = "NOT_ENOUGH_PLAYERS"
                }

                if (error) {
                    socket.emit("gameError", { error })
                    return
                }

                const game = GameManager.createGame(
                    roomId,
                    RoomManager.getActivePlayers(room),
                    room.settings
                )

                room.status = "playing"

                await gameStore.saveRoom(room)

                io.to(roomId).emit("gameStarted", { roomId })

                await applyGameChange(room, game)

                io.emit("roomListChanged")
            })
        })

        /*
         * Select Word
         */
        on("selectWord", async (word) => {
            const roomId = socket.data.roomId

            if (!roomId) {
                return
            }

            await gameStore.withRoomLock(roomId, async () => {
                const [room, game] = await Promise.all([
                    gameStore.getRoom(roomId),
                    gameStore.getGame(roomId),
                ])

                if (!room || !game) {
                    socket.emit("gameError", { error: "GAME_NOT_FOUND" })
                    return
                }

                const events = []

                const result = GameManager.selectWord(
                    game,
                    socket.id,
                    word,
                    Date.now(),
                    events
                )

                if (!result.success) {
                    socket.emit("gameError", { error: result.error })
                    return
                }

                await applyGameChange(room, game, events)
            })
        })

        /*
         * Submit Guess
         */
        on("submitGuess", async (guess) => {
            const roomId = socket.data.roomId

            if (!roomId) {
                return
            }

            if (isGuessRateLimited(socket)) {
                socket.emit("guessResult", {
                    correct: false,
                    error: "TOO_MANY_GUESSES",
                })
                return
            }

            await gameStore.withRoomLock(roomId, async () => {
                const [room, game] = await Promise.all([
                    gameStore.getRoom(roomId),
                    gameStore.getGame(roomId),
                ])

                if (!room || !game) {
                    socket.emit("guessResult", {
                        correct: false,
                        error: "GAME_NOT_FOUND",
                    })
                    return
                }

                const result = GameManager.submitGuess(game, socket.id, guess)

                if (!result.success) {
                    socket.emit("guessResult", {
                        correct: false,
                        error: result.error,
                    })
                    return
                }

                if (result.alreadyGuessed) {
                    socket.emit("guessResult", {
                        correct: false,
                        alreadyGuessed: true,
                    })
                    return
                }

                if (!result.correct) {
                    await gameStore.saveGame(game)

                    io.to(roomId).emit(
                        "chatMessage",
                        toPublicGuessMessage(room, result.message)
                    )

                    socket.emit("guessResult", { correct: false })
                    return
                }

                /*
                 * Correct Guess
                 */
                socket.emit("guessResult", {
                    correct: true,
                    points: result.points,
                })

                io.to(roomId).emit("playerGuessedCorrectly", {
                    playerId: socket.id,
                    playerName: getPlayerName(room, socket.id),
                    points: result.points,
                    message: toPublicGuessMessage(room, result.message),
                })

                /*
                 * ทุกคนตอบถูกแล้ว -> จบ turn
                 */
                if (result.allGuessed) {
                    GameManager.finishTurn(game)
                }

                await applyGameChange(room, game)
            })
        })

        /*
         * Drawing Stroke
         *
         * มาถี่มาก (หลายสิบครั้ง/วินาที) จึงไม่ใช้ room lock
         * เช็คคนวาดจาก key เล็กๆ แล้ว append ต่อท้าย list
         */
        on("draw:stroke", async (stroke) => {
            const roomId = socket.data.roomId

            if (!roomId) {
                return
            }

            // เช็คก่อนแตะ Redis
            if (isStrokeRateLimited(socket)) {
                return
            }

            if ((await gameStore.getDrawerId(roomId)) !== socket.id) {
                return
            }

            const sanitizedStroke = GameManager.sanitizeStroke(stroke)

            if (!sanitizedStroke) {
                return
            }

            const added = await gameStore.addStroke(
                roomId,
                sanitizedStroke,
                GameManager.MAX_STROKES_PER_TURN
            )

            if (added) {
                socket.to(roomId).emit("draw:stroke", sanitizedStroke)
            }
        })

        /*
         * Clear Drawing
         */
        on("draw:clear", async () => {
            const roomId = socket.data.roomId

            if (!roomId) {
                return
            }

            if ((await gameStore.getDrawerId(roomId)) !== socket.id) {
                return
            }

            await gameStore.clearStrokes(roomId)

            io.to(roomId).emit("draw:clear")
        })

        /*
         * Leave Room
         */
        on("leaveRoom", async () => {
            const roomId = socket.data.roomId

            if (!roomId) {
                return
            }

            socket.leave(roomId)

            socket.data.roomId = null

            await gameStore.withRoomLock(roomId, async () => {
                const room = await gameStore.getRoom(roomId)

                if (room && RoomManager.findPlayer(room, socket.id)) {
                    await removePlayerFromRoom(room, socket.id)
                }
            })
        })

        /*
         * Disconnect
         */
        on("disconnect", async () => {
            await handleDisconnect(socket)
        })
    })

    /*
     * --------------------------------------------
     * Graceful shutdown (scale-in / deploy)
     *
     * mark ผู้เล่นของเครื่องนี้ว่าหลุด
     * แล้ว client จะต่อใหม่ไปเครื่องอื่นและ resume ได้ทันที
     * --------------------------------------------
     */

    async function shutdown() {
        intervals.forEach(clearInterval)

        const localSockets = Array.from(io.of("/").sockets.values())

        await Promise.allSettled(
            localSockets.map((socket) => handleDisconnect(socket))
        )

        await gameStore.removeInstance(instanceId)
    }

    return {
        shutdown,
    }
}

module.exports = {
    registerSocketHandlers,
}
