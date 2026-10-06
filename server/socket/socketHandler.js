const crypto = require("crypto")

const {
    RoomManager,
    SETTINGS_OPTIONS,
} = require("../managers/RoomManager")

const {
    RoomService,
} = require("../services/RoomService")

const {
    GameManager,
} = require("../managers/GameManager")

const {
    generateGuestName,
} = require("../utils/NameGenerator")

const roomManager =
    new RoomManager()

const roomService =
    new RoomService(
        roomManager
    )

const gameManager =
    new GameManager()

const RECONNECT_GRACE_TIME =
    15000

const reconnectTimers =
    new Map()

const ROOM_ID_PATTERN =
    /^[A-Z0-9]{4,12}$/

const MAX_AVATAR_FIELD_LENGTH = 50

const DEFAULT_AVATAR = {
    furColor: "#e06a3b",
    earStyle: "Classic",
    costume: "🎨 Beret",
}

function sanitizeAvatar(
    avatar
) {
    if (!avatar) {
        return {
            ...DEFAULT_AVATAR,
        }
    }

    return {
        furColor:
            String(
                avatar.furColor ||
                DEFAULT_AVATAR.furColor
            ).slice(
                0,
                MAX_AVATAR_FIELD_LENGTH
            ),

        earStyle:
            String(
                avatar.earStyle ||
                DEFAULT_AVATAR.earStyle
            ).slice(
                0,
                MAX_AVATAR_FIELD_LENGTH
            ),

        costume:
            String(
                avatar.costume ||
                DEFAULT_AVATAR.costume
            ).slice(
                0,
                MAX_AVATAR_FIELD_LENGTH
            ),
    }
}

function serializePlayer(
    player
) {
    return {
        id: player.id,

        name:
            player.name,

        isLoggedIn:
            Boolean(
                player.isLoggedIn
            ),

        avatar:
            sanitizeAvatar(
                player.avatar
            ),

        disconnected:
            Boolean(
                player.disconnected
            ),
    }
}

function serializeRoom(
    room
) {
    if (!room) {
        return null
    }

    return {
        id: room.id,

        title:
            room.title,

        hostId:
            room.hostId,

        status:
            room.status,

        settings: {
            drawingTime:
                room.settings
                    .drawingTime,

            rounds:
                room.settings
                    .rounds,

            category:
                room.settings
                    .category,
        },

        settingsOptions:
            SETTINGS_OPTIONS,

        players:
            Array.from(
                room.players.values()
            )
                .filter(
                    (player) =>
                        !player.disconnected
                )
                .map(
                    serializePlayer
                ),

        playerCount:
            Array.from(
                room.players.values()
            ).filter(
                (player) =>
                    !player.disconnected
            ).length,

        maxPlayers: 8,
    }
}

function emitRoomUpdate(
    io,
    room
) {
    if (!room) {
        return
    }

    io.to(
        room.id
    ).emit(
        "roomUpdated",
        serializeRoom(room)
    )
}

function getPlayerName(
    roomId,
    playerId
) {
    const room =
        roomManager.getRoom(
            roomId
        )

    return (
        room?.players.get(
            playerId
        )?.name ||
        "Player"
    )
}

/*
 * แปลง guess message เป็นรูปแบบที่ส่งให้ client ได้
 *
 * คำตอบที่ถูกจะไม่มี text
 * กันคำตอบรั่วไปถึงคนที่ยังทายไม่ถูก
 */
function toPublicGuessMessage(
    roomId,
    message
) {
    return {
        id:
            `${message.timestamp}-${message.playerId}`,

        type:
            message.correct
                ? "correct"
                : "wrong",

        playerId:
            message.playerId,

        playerName:
            getPlayerName(
                roomId,
                message.playerId
            ),

        text:
            message.correct
                ? ""
                : message.guess,

        points:
            message.points || 0,
    }
}

function serializeGuessHistory(
    game
) {
    return game.guessMessages.map(
        (message) =>
            toPublicGuessMessage(
                game.roomId,
                message
            )
    )
}

function emitPlayerProfile(
    socket
) {
    socket.emit(
        "playerProfile",
        {
            name:
                socket.data.name,

            isLoggedIn:
                Boolean(
                    socket.data
                        .isLoggedIn
                ),

            avatar:
                sanitizeAvatar(
                    socket.data.avatar
                ),
        }
    )
}

/*
|--------------------------------------------------------------------------
| Game State
|--------------------------------------------------------------------------
*/

/*
 * จบเกมแล้วพาทุกคนกลับห้องรอ (ไม่ลบห้อง)
 * host กดเริ่มรอบใหม่ได้ และคนใหม่เข้าห้องได้อีกครั้ง
 */
function finishGameAndReturnToRoom(io, game) {
    if (!game) {
        return
    }

    const roomId = game.roomId

    /*
     * ป้องกัน game ถูกปิดไปแล้ว
     */
    if (gameManager.getGame(roomId) !== game) {
        return
    }

    const room = roomManager.getRoom(roomId)

    /*
     * รวมคนที่หลุดชั่วคราวด้วย
     * จะได้ไม่หายจากหน้าผลลัพธ์
     */
    const players = room
        ? Array.from(room.players.values())
            .filter(
                (player) =>
                    Object.prototype.hasOwnProperty.call(
                        game.scores,
                        player.id
                    )
            )
            .map(serializePlayer)
        : []

    const scores = {
        ...game.scores,
    }

    gameManager.deleteGame(roomId)

    if (!room) {
        return
    }

    room.status = "waiting"

    io.to(roomId).emit(
        "gameFinished",
        {
            players,
            scores,
            room:
                serializeRoom(room),
        }
    )

    emitRoomUpdate(
        io,
        room
    )

    /*
     * แจ้ง lobby ว่าห้องกลับมาเข้าได้แล้ว
     */
    io.emit("roomListChanged")

    console.log(
        `Game finished in room ${roomId}. Back to waiting room.`
    )
}

function emitGameState(
    io,
    game
) {
    if (!game) {
        return
    }

    /*
     * ส่ง public game state
     *
     * ห้ามส่ง draw:clear ที่นี่
     *
     * เพราะฟังก์ชันนี้ถูกเรียกจาก:
     *
     * - Hint
     * - Guess
     * - Phase change
     * - Timer
     * - Player state
     *
     * ถ้า clear ตรงนี้ Canvas จะ reset
     * ทุกครั้งที่ Hint เพิ่ม
     */

    io.to(
        game.roomId
    ).emit(
        "gameState",
        gameManager.getPublicState(
            game
        )
    )

    /*
     * Choose Word
     */

    if (
        game.phase ===
        "choose-word"
    ) {
        const drawerSocket =
            io.sockets.sockets.get(
                game.drawerId
            )

        if (drawerSocket) {
            drawerSocket.emit(
                "wordOptions",
                game.wordOptions
            )
        }

        return
    }

    /*
     * Draw and Guess
     */

    if (
        game.phase ===
        "draw-and-guess"
    ) {
        const drawerSocket =
            io.sockets.sockets.get(
                game.drawerId
            )

        if (drawerSocket) {
            drawerSocket.emit(
                "drawerWord",
                {
                    word:
                        game.word,
                }
            )
        }

        /*
         * Guess History
         *
         * ไม่ clear Canvas
         */

        io.to(
            game.roomId
        ).emit(
            "guessHistory",
            serializeGuessHistory(
                game
            )
        )

        return
    }

    /*
     * Game Result
     */

    if (
        game.phase ===
        "game-result"
    ) {
        finishGameAndReturnToRoom(
            io,
            game
        )
    }
}

/*
|--------------------------------------------------------------------------
| Send Current Game State To One Socket
|--------------------------------------------------------------------------
*/

function emitCurrentGameStateToSocket(
    socket
) {
    const roomId =
        socket.data.roomId

    if (!roomId) {
        return
    }

    const game =
        gameManager.getGame(
            roomId
        )

    if (!game) {
        return
    }

    socket.emit(
        "gameState",
        gameManager.getPublicState(
            game
        )
    )

    /*
     * Choose Word
     */

    if (
        game.phase ===
        "choose-word" &&
        game.drawerId ===
        socket.id
    ) {
        socket.emit(
            "wordOptions",
            game.wordOptions
        )
    }

    /*
     * Draw and Guess
     */

    if (
        game.phase ===
        "draw-and-guess"
    ) {
        /*
         * Drawer ได้คำจริง
         */

        if (
            game.drawerId ===
            socket.id
        ) {
            socket.emit(
                "drawerWord",
                {
                    word:
                        game.word,
                }
            )
        }

        /*
         * Reconnect:
         * ส่ง drawing history
         *
         * ไม่ clear Canvas
         */

        socket.emit(
            "draw:history",
            game.strokes
        )

        socket.emit(
            "guessHistory",
            serializeGuessHistory(
                game
            )
        )
    }
}

/*
|--------------------------------------------------------------------------
| Start Game
|--------------------------------------------------------------------------
*/

function startGame(
    io,
    socket
) {
    const roomId =
        socket.data.roomId

    if (!roomId) {
        socket.emit(
            "gameError",
            {
                error:
                    "NOT_IN_ROOM",
            }
        )

        return
    }

    const room =
        roomManager.getRoom(
            roomId
        )

    if (!room) {
        socket.emit(
            "gameError",
            {
                error:
                    "ROOM_NOT_FOUND",
            }
        )

        return
    }

    if (
        room.hostId !==
        socket.id
    ) {
        socket.emit(
            "gameError",
            {
                error:
                    "ONLY_HOST_CAN_START",
            }
        )

        return
    }

    if (
        !roomManager.canStart(
            roomId
        )
    ) {
        socket.emit(
            "gameError",
            {
                error:
                    "NOT_ENOUGH_PLAYERS",
            }
        )

        return
    }

    if (
        room.status !==
        "waiting"
    ) {
        socket.emit(
            "gameError",
            {
                error:
                    "GAME_ALREADY_STARTED",
            }
        )

        return
    }

    const players =
        Array.from(
            room.players.values()
        ).filter(
            (player) =>
                !player.disconnected
        )

    /*
     * สร้าง game
     *
     * onPhaseChange:
     * update game state
     *
     * onTurnStart:
     * clear Canvas เฉพาะตอน
     * เริ่มคำใหม่
     */

    const game =
        gameManager.createGame(
            roomId,
            players,
            room.settings,

            /*
             * onPhaseChange
             */
            (updatedGame) => {
                emitGameState(
                    io,
                    updatedGame
                )
            },

            /*
             * onTurnStart
             */
            (updatedGame) => {
                io.to(
                    updatedGame.roomId
                ).emit(
                    "draw:clear"
                )
            }
        )

    room.status =
        "playing"

    io.to(
        roomId
    ).emit(
        "gameStarted",
        {
            roomId,
        }
    )

    /*
     * createGame() เรียก
     * onPhaseChange ไปแล้ว
     *
     * แต่ emitGameState อีกครั้งตรงนี้
     * ไม่เป็นปัญหา
     */
    emitGameState(
        io,
        game
    )
}

/*
|--------------------------------------------------------------------------
| Player
|--------------------------------------------------------------------------
*/

function createPlayerFromSocket(
    socket
) {
    return {
        id:
            socket.id,

        name:
            socket.data.name,

        isLoggedIn:
            Boolean(
                socket.data.isLoggedIn
            ),

        avatar:
            sanitizeAvatar(
                socket.data.avatar
            ),

        disconnected: false,

        disconnectedAt: null,

        /*
         * ใช้ยืนยันตัวตนตอน resumeRoom
         * ห้ามส่งให้ผู้เล่นคนอื่น (serializePlayer ไม่ส่ง)
         */
        resumeToken:
            crypto.randomUUID(),
    }
}

/*
|--------------------------------------------------------------------------
| Cleanup Disconnected Player
|--------------------------------------------------------------------------
*/

function cleanupDisconnectedPlayer(
    io,
    roomId,
    oldPlayerId
) {
    reconnectTimers.delete(
        oldPlayerId
    )

    const room =
        roomManager.getRoom(
            roomId
        )

    if (!room) {
        return
    }

    const player =
        room.players.get(
            oldPlayerId
        )

    if (!player) {
        return
    }

    /*
     * Player กลับมา reconnect แล้ว
     */
    if (
        !player.disconnected
    ) {
        return
    }

    /*
     * หา Game
     */
    const game =
        gameManager.getGame(
            roomId
        )

    let gameResult = null

    /*
     * เอาออกจาก Game ก่อน
     */
    if (game) {
        gameResult =
            gameManager.removePlayer(
                roomId,
                oldPlayerId
            )
    }

    /*
     * เอาออกจาก Room
     *
     * ต้องเกิดก่อน finishGameAndReturnToRoom()
     */
    const updatedRoom =
        roomManager.removePlayer(
            roomId,
            oldPlayerId
        )

    /*
     * ไม่มี Room แล้ว
     */
    if (!updatedRoom) {
        if (
            gameResult &&
            gameResult.game
        ) {
            gameManager.deleteGame(
                roomId
            )
        }

        io.emit(
            "roomClosed",
            roomId
        )

        return
    }

    io.to(
        roomId
    ).emit(
        "playerLeft",
        {
            playerId:
                oldPlayerId,

            playerName:
                player.name,
        }
    )

    /*
     * Game เหลือ 1 คน
     */
    if (
        gameResult &&
        gameResult.changed &&
        gameResult.game
    ) {
        if (
            gameResult.game.phase ===
            "game-result"
        ) {
            finishGameAndReturnToRoom(
                io,
                gameResult.game
            )

            return
        }

        emitGameState(
            io,
            gameResult.game
        )
    }

    emitRoomUpdate(
        io,
        updatedRoom
    )
}

/*
|--------------------------------------------------------------------------
| Disconnect
|--------------------------------------------------------------------------
*/

function handleDisconnect(
    io,
    socket
) {
    const roomId =
        socket.data.roomId

    if (!roomId) {
        return
    }

    const room =
        roomManager.getRoom(
            roomId
        )

    if (!room) {
        return
    }

    const player =
        room.players.get(
            socket.id
        )

    /*
     * player ถูก resume ไปเป็น socket ใหม่แล้ว
     */
    if (!player) {
        return
    }

    roomManager.markPlayerDisconnected(
        roomId,
        socket.id
    )

    /*
     * Host หลุดตอนรอในห้อง
     * ย้าย host ให้คนที่ยังออนไลน์ จะได้กดเริ่มเกมได้
     */
    if (
        room.status ===
        "waiting" &&
        room.hostId ===
        socket.id
    ) {
        const nextHost =
            Array.from(
                room.players.values()
            ).find(
                (item) =>
                    !item.disconnected
            )

        if (nextHost) {
            room.hostId =
                nextHost.id
        }
    }

    io.to(
        roomId
    ).emit(
        "playerDisconnected",
        {
            playerId:
                socket.id,

            playerName:
                player.name,
        }
    )

    emitRoomUpdate(
        io,
        room
    )

    const oldPlayerId =
        socket.id

    const timer =
        setTimeout(
            () => {
                cleanupDisconnectedPlayer(
                    io,
                    roomId,
                    oldPlayerId
                )
            },
            RECONNECT_GRACE_TIME
        )

    reconnectTimers.set(
        oldPlayerId,
        timer
    )
}

/*
|--------------------------------------------------------------------------
| Leave Room
|--------------------------------------------------------------------------
*/

function leaveCurrentRoom(
    io,
    socket
) {
    const roomId =
        socket.data.roomId

    if (!roomId) {
        return
    }

    /*
     * หา Game ก่อน
     */
    const game =
        gameManager.getGame(
            roomId
        )

    /*
     * เอา player ออกจาก Room ก่อน
     *
     * สำคัญ:
     * เพราะ finishGameAndReturnToRoom()
     * จะอ่าน players จาก RoomManager
     */
    const playerName =
        getPlayerName(
            roomId,
            socket.id
        )

    const roomResult =
        roomService.leaveRoom(
            roomId,
            socket.id
        )

    /*
     * เอา socket ออกจาก Socket.IO room
     */
    socket.leave(
        roomId
    )

    socket.data.roomId =
        null

    /*
     * ถ้า Game กำลังเล่นอยู่
     */
    if (game) {
        const gameResult =
            gameManager.removePlayer(
                roomId,
                socket.id
            )

        /*
         * เหลือ 1 คน
         * หรือ Game จบแล้ว
         */
        if (
            gameResult.changed &&
            gameResult.game
        ) {
            /*
             * Game จบ
             */
            if (
                gameResult.game.phase ===
                "game-result"
            ) {
                finishGameAndReturnToRoom(
                    io,
                    gameResult.game
                )

                return
            }

            /*
             * Game ยังเล่นต่อ
             */
            emitGameState(
                io,
                gameResult.game
            )
        }
    }

    /*
     * Room ไม่มีคนเหลือ
     */
    if (
        !roomResult ||
        !roomResult.room
    ) {
        io.emit(
            "roomClosed",
            roomId
        )

        return
    }

    /*
     * แจ้งคนที่เหลือ
     */
    io.to(
        roomId
    ).emit(
        "playerLeft",
        {
            playerId:
                socket.id,

            playerName,
        }
    )

    emitRoomUpdate(
        io,
        roomResult.room
    )
}

/*
|--------------------------------------------------------------------------
| Register Socket Handlers
|--------------------------------------------------------------------------
*/

function registerSocketHandlers(
    io
) {
    io.on(
        "connection",
        (socket) => {
            /*
             * Default player profile
             */

            const guestName =
                generateGuestName()

            socket.data.name =
                guestName

            socket.data.isLoggedIn =
                false

            socket.data.avatar = {
                ...DEFAULT_AVATAR,
            }

            socket.data.roomId =
                null

            emitPlayerProfile(
                socket
            )

            console.log(
                `User connected: ${socket.id} as ${guestName}`
            )

            /*
             * Get Player Profile
             */

            socket.on(
                "getPlayerProfile",
                () => {
                    emitPlayerProfile(
                        socket
                    )
                }
            )

            /*
             * Resume Room
             */

            socket.on(
                "resumeRoom",
                ({
                    roomId,
                    oldPlayerId,
                    resumeToken,
                } = {}) => {
                    const normalizedRoomId =
                        String(
                            roomId || ""
                        )
                            .trim()
                            .toUpperCase()

                    if (
                        !normalizedRoomId ||
                        !oldPlayerId
                    ) {
                        return
                    }

                    const room =
                        roomManager.getRoom(
                            normalizedRoomId
                        )

                    if (!room) {
                        socket.emit(
                            "resumeFailed",
                            {
                                error:
                                    "ROOM_NOT_FOUND",
                            }
                        )

                        return
                    }

                    const oldPlayer =
                        room.players.get(
                            oldPlayerId
                        )

                    if (!oldPlayer) {
                        socket.emit(
                            "resumeFailed",
                            {
                                error:
                                    "PLAYER_NOT_FOUND",
                            }
                        )

                        return
                    }

                    if (
                        !resumeToken ||
                        oldPlayer.resumeToken !==
                        resumeToken
                    ) {
                        socket.emit(
                            "resumeFailed",
                            {
                                error:
                                    "INVALID_RESUME_TOKEN",
                            }
                        )

                        return
                    }

                    /*
                     * ตอน refresh หน้า socket ใหม่อาจต่อเข้ามา
                     * ก่อน server รู้ว่า socket เก่าหลุด
                     * client จะ retry เองเมื่อได้ error นี้
                     */
                    if (
                        !oldPlayer.disconnected &&
                        io.sockets.sockets.has(
                            oldPlayerId
                        )
                    ) {
                        socket.emit(
                            "resumeFailed",
                            {
                                error:
                                    "PLAYER_STILL_CONNECTED",
                            }
                        )

                        return
                    }

                    const result =
                        roomManager.reconnectPlayer(
                            normalizedRoomId,
                            oldPlayerId,
                            {
                                id:
                                    socket.id,

                                name:
                                    oldPlayer.name,

                                isLoggedIn:
                                    oldPlayer.isLoggedIn,

                                avatar:
                                    oldPlayer.avatar,
                            }
                        )

                    if (
                        !result.success
                    ) {
                        socket.emit(
                            "resumeFailed",
                            {
                                error:
                                    result.error,
                            }
                        )

                        return
                    }

                    const timer =
                        reconnectTimers.get(
                            oldPlayerId
                        )

                    if (timer) {
                        clearTimeout(
                            timer
                        )

                        reconnectTimers.delete(
                            oldPlayerId
                        )
                    }

                    socket.data.name =
                        result.player.name

                    socket.data.isLoggedIn =
                        Boolean(
                            result.player
                                .isLoggedIn
                        )

                    socket.data.avatar =
                        sanitizeAvatar(
                            result.player.avatar
                        )

                    socket.data.roomId =
                        normalizedRoomId

                    socket.join(
                        normalizedRoomId
                    )

                    const game =
                        gameManager.getGame(
                            normalizedRoomId
                        )

                    if (game) {
                        gameManager.replacePlayerId(
                            game,
                            oldPlayerId,
                            socket.id
                        )
                    }

                    socket.emit(
                        "roomResumed",
                        serializeRoom(
                            result.room
                        )
                    )

                    io.to(
                        normalizedRoomId
                    ).emit(
                        "playerReconnected",
                        {
                            player:
                                serializePlayer(
                                    result.player
                                ),
                        }
                    )

                    emitRoomUpdate(
                        io,
                        result.room
                    )

                    emitCurrentGameStateToSocket(
                        socket
                    )
                }
            )

            /*
             * Set Player Name
             */

            socket.on(
                "setPlayerName",
                (name) => {
                    if (
                        !socket.data
                            .isLoggedIn
                    ) {
                        return
                    }

                    const trimmedName =
                        String(
                            name || ""
                        ).trim()

                    if (!trimmedName) {
                        return
                    }

                    socket.data.name =
                        trimmedName

                    if (
                        socket.data.roomId
                    ) {
                        const room =
                            roomManager.getRoom(
                                socket.data.roomId
                            )

                        if (room) {
                            const player =
                                room.players.get(
                                    socket.id
                                )

                            if (player) {
                                player.name =
                                    trimmedName

                                emitRoomUpdate(
                                    io,
                                    room
                                )
                            }
                        }
                    }

                    emitPlayerProfile(
                        socket
                    )
                }
            )

            /*
             * Set Player Avatar
             */

            socket.on(
                "setPlayerAvatar",
                (avatar) => {
                    const sanitizedAvatar =
                        sanitizeAvatar(
                            avatar
                        )

                    socket.data.avatar =
                        sanitizedAvatar

                    if (
                        socket.data.roomId
                    ) {
                        const room =
                            roomManager.getRoom(
                                socket.data.roomId
                            )

                        if (room) {
                            const player =
                                room.players.get(
                                    socket.id
                                )

                            if (player) {
                                player.avatar =
                                    sanitizedAvatar

                                emitRoomUpdate(
                                    io,
                                    room
                                )
                            }
                        }
                    }

                    emitPlayerProfile(
                        socket
                    )
                }
            )

            /*
             * Create Room
             */

            socket.on(
                "createRoom",
                ({
                    roomId,
                    roomTitle,
                    drawingTime,
                } = {}) => {
                    const normalizedRoomId =
                        String(
                            roomId || ""
                        )
                            .trim()
                            .toUpperCase()

                    if (
                        !ROOM_ID_PATTERN.test(
                            normalizedRoomId
                        )
                    ) {
                        socket.emit(
                            "roomError",
                            {
                                error:
                                    "INVALID_ROOM_ID",
                            }
                        )

                        return
                    }

                    if (
                        socket.data.roomId
                    ) {
                        socket.emit(
                            "roomError",
                            {
                                error:
                                    "ALREADY_IN_ROOM",
                            }
                        )

                        return
                    }

                    const player =
                        createPlayerFromSocket(
                            socket
                        )

                    const result =
                        roomService.createRoom(
                            normalizedRoomId,
                            player,
                            {
                                title:
                                    roomTitle,

                                drawingTime:
                                    drawingTime,
                            }
                        )

                    if (
                        !result.success
                    ) {
                        socket.emit(
                            "roomError",
                            {
                                error:
                                    result.error,
                            }
                        )

                        return
                    }

                    socket.join(
                        normalizedRoomId
                    )

                    socket.data.roomId =
                        normalizedRoomId

                    socket.emit(
                        "roomCreated",
                        {
                            ...serializeRoom(
                                result.room
                            ),

                            resumeToken:
                                player.resumeToken,
                        }
                    )

                    io.emit(
                        "roomListChanged"
                    )
                }
            )

            /*
             * Get Rooms
             */

            socket.on(
                "getRooms",
                () => {
                    const result =
                        roomService.getRooms()

                    socket.emit(
                        "roomsList",
                        result.rooms.map(
                            serializeRoom
                        )
                    )
                }
            )

            /*
             * Join Room
             */

            socket.on(
                "joinRoom",
                (roomId) => {
                    const normalizedRoomId =
                        String(
                            roomId || ""
                        )
                            .trim()
                            .toUpperCase()

                    if (
                        !normalizedRoomId
                    ) {
                        socket.emit(
                            "roomError",
                            {
                                error:
                                    "INVALID_ROOM_ID",
                            }
                        )

                        return
                    }

                    if (
                        socket.data.roomId
                    ) {
                        socket.emit(
                            "roomError",
                            {
                                error:
                                    "ALREADY_IN_ROOM",
                            }
                        )

                        return
                    }

                    const room =
                        roomManager.getRoom(
                            normalizedRoomId
                        )

                    if (!room) {
                        socket.emit(
                            "roomError",
                            {
                                error:
                                    "ROOM_NOT_FOUND",
                            }
                        )

                        return
                    }

                    if (
                        room.status !==
                        "waiting"
                    ) {
                        socket.emit(
                            "roomError",
                            {
                                error:
                                    "GAME_ALREADY_STARTED",
                            }
                        )

                        return
                    }

                    if (
                        roomManager.isFull(
                            normalizedRoomId
                        )
                    ) {
                        socket.emit(
                            "roomError",
                            {
                                error:
                                    "ROOM_FULL",
                            }
                        )

                        return
                    }

                    const player =
                        createPlayerFromSocket(
                            socket
                        )

                    const result =
                        roomService.joinRoom(
                            normalizedRoomId,
                            player
                        )

                    if (
                        !result.success
                    ) {
                        socket.emit(
                            "roomError",
                            {
                                error:
                                    result.error,
                            }
                        )

                        return
                    }

                    socket.join(
                        normalizedRoomId
                    )

                    socket.data.roomId =
                        normalizedRoomId

                    socket.emit(
                        "roomJoined",
                        {
                            ...serializeRoom(
                                result.room
                            ),

                            resumeToken:
                                player.resumeToken,
                        }
                    )

                    io.to(
                        normalizedRoomId
                    ).emit(
                        "playerJoined",
                        {
                            player:
                                serializePlayer(
                                    player
                                ),
                        }
                    )

                    emitRoomUpdate(
                        io,
                        result.room
                    )

                    io.emit(
                        "roomListChanged"
                    )
                }
            )

            /*
             * Get Room
             */

            socket.on(
                "getRoom",
                (roomId) => {
                    const result =
                        roomService.getRoom(
                            roomId
                        )

                    if (
                        !result.success
                    ) {
                        socket.emit(
                            "roomError",
                            {
                                error:
                                    result.error,
                            }
                        )

                        return
                    }

                    socket.emit(
                        "roomData",
                        serializeRoom(
                            result.room
                        )
                    )
                }
            )

            /*
             * Request Game State
             */

            socket.on(
                "requestGameState",
                () => {
                    emitCurrentGameStateToSocket(
                        socket
                    )
                }
            )

            /*
             * Update Room Settings (host เท่านั้น)
             */

            socket.on(
                "updateRoomSettings",
                (settings = {}) => {
                    const roomId =
                        socket.data.roomId

                    if (!roomId) {
                        return
                    }

                    const result =
                        roomManager.updateSettings(
                            roomId,
                            socket.id,
                            settings
                        )

                    if (
                        !result.success
                    ) {
                        socket.emit(
                            "roomError",
                            {
                                error:
                                    result.error,
                            }
                        )

                        return
                    }

                    emitRoomUpdate(
                        io,
                        result.room
                    )
                }
            )

            /*
             * Start Game
             */

            socket.on(
                "startGame",
                () => {
                    startGame(
                        io,
                        socket
                    )
                }
            )

            /*
             * Select Word
             */

            socket.on(
                "selectWord",
                (word) => {
                    const roomId =
                        socket.data.roomId

                    if (!roomId) {
                        return
                    }

                    const result =
                        gameManager.selectWord(
                            roomId,
                            socket.id,
                            word
                        )

                    if (
                        !result.success
                    ) {
                        socket.emit(
                            "gameError",
                            {
                                error:
                                    result.error,
                            }
                        )

                        return
                    }

                    /*
                     * สำคัญ:
                     *
                     * selectWord() จะเรียก
                     * onTurnStart เอง
                     *
                     * ดังนั้นตรงนี้ไม่ต้อง
                     * draw:clear ซ้ำ
                     *
                     * และ Hint ก็จะไม่เข้ามา
                     * clear Canvas
                     */

                    emitGameState(
                        io,
                        result.game
                    )
                }
            )

            /*
             * Submit Guess
             */

            socket.on(
                "submitGuess",
                (guess) => {
                    const roomId =
                        socket.data.roomId

                    if (!roomId) {
                        return
                    }

                    const result =
                        gameManager.submitGuess(
                            roomId,
                            socket.id,
                            guess
                        )

                    if (
                        !result.success
                    ) {
                        socket.emit(
                            "guessResult",
                            {
                                correct:
                                    false,

                                error:
                                    result.error,
                            }
                        )

                        return
                    }

                    if (
                        result.alreadyGuessed
                    ) {
                        socket.emit(
                            "guessResult",
                            {
                                correct:
                                    false,

                                alreadyGuessed:
                                    true,
                            }
                        )

                        return
                    }

                    if (
                        !result.correct
                    ) {
                        io.to(
                            roomId
                        ).emit(
                            "chatMessage",
                            toPublicGuessMessage(
                                roomId,
                                result.message
                            )
                        )

                        socket.emit(
                            "guessResult",
                            {
                                correct:
                                    false,
                            }
                        )

                        return
                    }

                    /*
                     * Correct Guess
                     */

                    socket.emit(
                        "guessResult",
                        {
                            correct:
                                true,

                            points:
                                result.points,
                        }
                    )

                    io.to(
                        roomId
                    ).emit(
                        "playerGuessedCorrectly",
                        {
                            playerId:
                                socket.id,

                            playerName:
                                getPlayerName(
                                    roomId,
                                    socket.id
                                ),

                            points:
                                result.points,

                            message:
                                toPublicGuessMessage(
                                    roomId,
                                    result.message
                                ),
                        }
                    )

                    const game =
                        gameManager.getGame(
                            roomId
                        )

                    /*
                     * ทุกคนตอบถูกแล้ว
                     */

                    if (
                        result.allGuessed &&
                        game
                    ) {
                        gameManager.finishTurn(
                            game
                        )

                        /*
                         * finishTurn()
                         * อาจเปลี่ยนเป็น
                         * choose-word
                         *
                         * แต่ไม่ clear Canvas
                         * ตรงนี้
                         */

                        emitGameState(
                            io,
                            game
                        )

                        return
                    }

                    /*
                     * ยังมีคนเหลือ
                     */

                    if (game) {
                        io.to(
                            roomId
                        ).emit(
                            "gameState",
                            gameManager.getPublicState(
                                game
                            )
                        )

                        io.to(
                            roomId
                        ).emit(
                            "guessHistory",
                            serializeGuessHistory(
                                game
                            )
                        )
                    }
                }
            )

            /*
             * Drawing Stroke
             */

            socket.on(
                "draw:stroke",
                (stroke) => {
                    const roomId =
                        socket.data.roomId

                    if (!roomId) {
                        return
                    }

                    const result =
                        gameManager.addStroke(
                            roomId,
                            socket.id,
                            stroke
                        )

                    if (
                        !result.success
                    ) {
                        return
                    }

                    socket.to(
                        roomId
                    ).emit(
                        "draw:stroke",
                        result.stroke
                    )
                }
            )

            /*
             * Clear Drawing
             */

            socket.on(
                "draw:clear",
                () => {
                    const roomId =
                        socket.data.roomId

                    if (!roomId) {
                        return
                    }

                    const result =
                        gameManager.clearDrawing(
                            roomId,
                            socket.id
                        )

                    if (
                        !result.success
                    ) {
                        return
                    }

                    io.to(
                        roomId
                    ).emit(
                        "draw:clear"
                    )
                }
            )

            /*
             * Leave Room
             */

            socket.on(
                "leaveRoom",
                () => {
                    const timer =
                        reconnectTimers.get(
                            socket.id
                        )

                    if (timer) {
                        clearTimeout(
                            timer
                        )

                        reconnectTimers.delete(
                            socket.id
                        )
                    }

                    leaveCurrentRoom(
                        io,
                        socket
                    )

                    io.emit(
                        "roomListChanged"
                    )
                }
            )

            /*
             * Disconnect
             */

            socket.on(
                "disconnect",
                () => {
                    handleDisconnect(
                        io,
                        socket
                    )
                }
            )
        }
    )
}

module.exports = {
    registerSocketHandlers,
}