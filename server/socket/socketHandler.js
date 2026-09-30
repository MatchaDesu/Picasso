const {
    RoomManager,
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
            ),

        earStyle:
            String(
                avatar.earStyle ||
                DEFAULT_AVATAR.earStyle
            ),

        costume:
            String(
                avatar.costume ||
                DEFAULT_AVATAR.costume
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
        },

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

function finishGameAndCloseRoom(io, game) {
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
     * เก็บข้อมูลผู้เล่นไว้ก่อนลบ room
     */
    const players = room
        ? Array.from(room.players.values())
            .filter(
                (player) =>
                    !player.disconnected
            )
            .map(serializePlayer)
        : []

    const scores = {
        ...game.scores,
    }

    /*
     * หา socket ของผู้เล่นทั้งหมด
     * ก่อนเอาออกจาก room
     */
    const roomSockets = io.sockets.adapter.rooms.get(roomId)

    const sockets = roomSockets
        ? Array.from(roomSockets)
            .map(
                (socketId) =>
                    io.sockets.sockets.get(socketId)
            )
            .filter(Boolean)
        : []

    /*
     * ส่งผลลัพธ์ให้ทุกคนก่อน
     * ลบ room
     */
    io.to(roomId).emit(
        "gameFinished",
        {
            players,
            scores,
        }
    )

    /*
     * ลบ Game
     */
    gameManager.deleteGame(roomId)

    /*
     * ลบ Room
     */
    roomManager.deleteRoom(roomId)

    /*
     * เอาผู้เล่นทุกคนออกจาก Socket.IO room
     */
    for (const playerSocket of sockets) {
        playerSocket.leave(roomId)

        playerSocket.data.roomId = null
    }

    /*
     * แจ้ง lobby ว่า room หายแล้ว
     */
    io.emit("roomListChanged")

    console.log(
        `Game finished and room ${roomId} was deleted.`
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
            game.guessMessages
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
        finishGameAndCloseRoom(
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
            game.guessMessages
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
            room.settings
                .drawingTime,

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
     * ต้องเกิดก่อน finishGameAndCloseRoom()
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
        "playerDisconnected",
        {
            playerId:
                oldPlayerId,
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
            finishGameAndCloseRoom(
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

    roomManager.markPlayerDisconnected(
        roomId,
        socket.id
    )

    io.to(
        roomId
    ).emit(
        "playerDisconnected",
        {
            playerId:
                socket.id,
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
     * เพราะ finishGameAndCloseRoom()
     * จะอ่าน players จาก RoomManager
     */
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
                finishGameAndCloseRoom(
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

                    if (
                        !oldPlayer ||
                        !oldPlayer.disconnected
                    ) {
                        socket.emit(
                            "resumeFailed",
                            {
                                error:
                                    "PLAYER_NOT_FOUND",
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
                        normalizedRoomId.length <
                        4
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

                    const room =
                        serializeRoom(
                            result.room
                        )

                    socket.emit(
                        "roomCreated",
                        room
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

                    const serialized =
                        serializeRoom(
                            result.room
                        )

                    socket.emit(
                        "roomJoined",
                        serialized
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
                        const game =
                            gameManager.getGame(
                                roomId
                            )

                        const message =
                            game?.guessMessages[
                            game
                                .guessMessages
                                .length - 1
                            ]

                        io.to(
                            roomId
                        ).emit(
                            "chatMessage",
                            message
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

                            points:
                                result.points,
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
                            game.guessMessages
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