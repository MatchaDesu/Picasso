const MAX_PLAYERS = 8
const MIN_PLAYERS = 3

class RoomManager {

    constructor() {
        this.rooms = new Map()
    }

    createRoom(
        roomId,
        host,
        settings = {}
    ) {

        const room = {
            id: roomId,

            title:
                String(settings.title || "").trim() ||
                "Untitled Room",

            hostId: host.id,

            status: "waiting",

            settings: {
                drawingTime:
                    Number(settings.drawingTime) || 60,
            },

            players: new Map(),
        }

        room.players.set(
            host.id,
            host
        )

        this.rooms.set(
            roomId,
            room
        )

        return room
    }

    getRoom(roomId) {
        return this.rooms.get(roomId)
    }

    hasRoom(roomId) {
        return this.rooms.has(roomId)
    }

    addPlayer(
        roomId,
        player
    ) {

        const room =
            this.getRoom(roomId)

        if (!room) {
            return {
                success: false,
                error: "ROOM_NOT_FOUND",
            }
        }

        if (room.status !== "waiting") {
            return {
                success: false,
                error: "GAME_ALREADY_STARTED",
            }
        }

        if (
            room.players.has(player.id)
        ) {
            return {
                success: true,
                room,
            }
        }

        if (
            room.players.size >= MAX_PLAYERS
        ) {
            return {
                success: false,
                error: "ROOM_FULL",
            }
        }

        room.players.set(
            player.id,
            player
        )

        return {
            success: true,
            room,
        }
    }

    removePlayer(
        roomId,
        playerId
    ) {

        const room =
            this.getRoom(roomId)

        if (!room) {
            return null
        }

        room.players.delete(
            playerId
        )

        if (
            room.players.size === 0
        ) {

            this.rooms.delete(
                roomId
            )

            return null
        }

        if (
            room.hostId === playerId
        ) {

            const nextHost =
                room.players
                    .values()
                    .next()
                    .value

            room.hostId =
                nextHost.id
        }

        return room
    }

    canStart(roomId) {

        const room =
            this.getRoom(roomId)

        if (!room) {
            return false
        }

        return (
            room.status === "waiting" &&
            room.players.size >= MIN_PLAYERS
        )
    }

    isFull(roomId) {

        const room =
            this.getRoom(roomId)

        if (!room) {
            return false
        }

        return (
            room.players.size >= MAX_PLAYERS
        )
    }

    deleteRoom(roomId) {
        return this.rooms.delete(roomId)
    }

    getRooms() {
        return Array.from(
            this.rooms.values()
        )
    }
}

module.exports = {
    RoomManager,
    MAX_PLAYERS,
    MIN_PLAYERS,
}