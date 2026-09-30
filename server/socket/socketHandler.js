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

        name: player.name,

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

        title: room.title,

        hostId: room.hostId,

        status: room.status,

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

    io.to(room.id).emit(
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
                    socket.data.isLoggedIn
                ),

            avatar:
                sanitizeAvatar(
                    socket.data.avatar
                ),
        }
    )
}

function emitGameState(
    io,
    game
) {
    if (!game) {
        return
    }

    io.to(
        game.roomId
    ).emit(
        "gameState",
        gameManager.getPublicState(
            game
        )
    )

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

        io.to(
            game.roomId
        ).emit(
            "draw:clear"
        )

        io.to(
            game.roomId
        ).emit(
            "guessHistory",
            game.guessMessages
        )

        return
    }

    if (
        game.phase ===
        "game-result"
    ) {
        io.to(
            game.roomId
        ).emit(
            "gameFinished",
            {
                scores:
                    game.scores,
            }
        )
    }
}

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

    if (
        game.phase ===
        "draw-and-guess"
    ) {
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

    const game =
        gameManager.createGame(
            roomId,
            players,
            room.settings
                .drawingTime
        )

    room.status =
        "playing"

    io.to(roomId).emit(
        "gameStarted",
        {
            roomId,
        }
    )

    emitGameState(
        io,
        game
    )
}

function createPlayerFromSocket(
    socket
) {
    return {
        id: socket.id,

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

        disconnectedAt:
            null,
    }
}

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

    if (
        !player.disconnected
    ) {
        return
    }

    const game =
        gameManager.getGame(
            roomId
        )

    if (game) {
        const result =
            gameManager.removePlayer(
                roomId,
                oldPlayerId
            )

        if (
            result.changed
        ) {
            emitGameState(
                io,
                result.game
            )
        }
    }

    const updatedRoom =
        roomManager.removePlayer(
            roomId,
            oldPlayerId
        )

    if (!updatedRoom) {
        io.emit(
            "roomClosed",
            roomId
        )

        return
    }

    io.to(roomId).emit(
        "playerDisconnected",
        {
            playerId:
                oldPlayerId,
        }
    )

    emitRoomUpdate(
        io,
        updatedRoom
    )
}

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

    io.to(roomId).emit(
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

function leaveCurrentRoom(
    io,
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

    if (game) {
        const result =
            gameManager.removePlayer(
                roomId,
                socket.id
            )

        if (
            result.changed
        ) {
            emitGameState(
                io,
                result.game
            )
        }
    }

    const result =
        roomService.leaveRoom(
            roomId,
            socket.id
        )

    socket.leave(
        roomId
    )

    socket.data.roomId =
        null

    if (!result.room) {
        io.emit(
            "roomClosed",
            roomId
        )

        return
    }

    io.to(roomId).emit(
        "playerLeft",
        {
            playerId:
                socket.id,
        }
    )

    emitRoomUpdate(
        io,
        result.room
    )
}

function registerSocketHandlers(
    io
) {
    io.on(
        "connection",
        (socket) => {
            const guestName =
                generateGuestName()

            socket.data.name =
                guestName

            socket.data.isLoggedIn =
                false

            socket.data.avatar =
            {
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

            socket.on(
                "getPlayerProfile",
                () => {
                    emitPlayerProfile(
                        socket
                    )
                }
            )

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
                                id: socket.id,

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

            socket.on(
                "setPlayerName",
                (name) => {
                    if (
                        !socket.data.isLoggedIn
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

            socket.on(
                "requestGameState",
                () => {
                    emitCurrentGameStateToSocket(
                        socket
                    )
                }
            )

            socket.on(
                "startGame",
                () => {
                    startGame(
                        io,
                        socket
                    )
                }
            )

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
                            word,
                            (game) => {
                                emitGameState(
                                    io,
                                    game
                                )
                            }
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
                    }
                }
            )

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
                                correct: false,

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
                                correct: false,

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
                                correct: false,
                            }
                        )

                        return
                    }

                    socket.emit(
                        "guessResult",
                        {
                            correct: true,

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

                    if (
                        result.allGuessed &&
                        game
                    ) {
                        gameManager.finishTurn(
                            game
                        )

                        emitGameState(
                            io,
                            game
                        )

                        return
                    }

                    if (game) {
                        io.to(
                            roomId
                        ).emit(
                            "gameState",
                            gameManager.getPublicState(
                                game
                            )
                        )
                    }
                }
            )

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