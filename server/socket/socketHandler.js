const {
    RoomManager,
} = require("../managers/RoomManager")

const {
    RoomService,
} = require("../services/RoomService")

const {
    generateGuestName,
} = require("../utils/NameGenerator")

const roomManager =
    new RoomManager()

const roomService =
    new RoomService(roomManager)

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
    }
}

function serializeRoom(room) {
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
                room.settings.drawingTime,
        },

        players:
            Array.from(
                room.players.values()
            ).map(
                serializePlayer
            ),

        playerCount:
            room.players.size,

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

function leaveCurrentRoom(
    io,
    socket
) {
    const roomId =
        socket.data.roomId

    if (!roomId) {
        return
    }

    const result =
        roomService.leaveRoom(
            roomId,
            socket.id
        )

    socket.leave(roomId)

    socket.data.roomId =
        null

    if (!result.room) {
        io.emit(
            "roomClosed",
            roomId
        )

        return
    }

    socket.to(roomId).emit(
        "playerLeft",
        {
            playerId:
                socket.id,

            room:
                serializeRoom(
                    result.room
                ),
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

                    // ถ้าอยู่ในห้อง
                    // update player ในห้องด้วย
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

                    // ถ้าอยู่ในห้อง
                    // update avatar ของ player
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
                    const player = {
                        id: socket.id,

                        name:
                            socket.data.name,

                        isLoggedIn:
                            socket.data.isLoggedIn,

                        avatar:
                            sanitizeAvatar(
                                socket.data.avatar
                            ),
                    }

                    const result =
                        roomService.createRoom(
                            roomId,
                            player,
                            {
                                title:
                                    roomTitle,

                                drawingTime:
                                    drawingTime,
                            }
                        )

                    if (!result.success) {
                        socket.emit(
                            "roomError",
                            {
                                error:
                                    result.error,
                            }
                        )

                        return
                    }

                    socket.join(roomId)

                    socket.data.roomId =
                        roomId

                    const room =
                        serializeRoom(
                            result.room
                        )

                    socket.emit(
                        "roomCreated",
                        room
                    )

                    console.log(
                        `Room created: ${roomId} by ${socket.data.name}`
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

                    const player = {
                        id: socket.id,

                        name:
                            socket.data.name,

                        isLoggedIn:
                            socket.data.isLoggedIn,

                        avatar:
                            sanitizeAvatar(
                                socket.data.avatar
                            ),
                    }

                    const result =
                        roomService.joinRoom(
                            normalizedRoomId,
                            player
                        )

                    if (!result.success) {
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
                        "roomJoined",
                        room
                    )

                    socket.to(
                        normalizedRoomId
                    ).emit(
                        "playerJoined",
                        {
                            player:
                                serializePlayer(
                                    player
                                ),

                            room,
                        }
                    )

                    emitRoomUpdate(
                        io,
                        result.room
                    )

                    console.log(
                        `${socket.data.name} joined room ${normalizedRoomId}`
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

                    if (!result.success) {
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
                "leaveRoom",
                () => {
                    leaveCurrentRoom(
                        io,
                        socket
                    )
                }
            )

            socket.on(
                "disconnect",
                () => {
                    leaveCurrentRoom(
                        io,
                        socket
                    )

                    console.log(
                        `User disconnected: ${socket.id}`
                    )
                }
            )
        }
    )
}

module.exports = {
    registerSocketHandlers,
}