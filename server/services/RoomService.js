const {
    RoomManager,
} = require("../managers/RoomManager")

class RoomService {

    constructor(roomManager) {
        this.roomManager = roomManager
    }

    createRoom(
        roomId,
        player,
        settings = {}
    ) {

        if (!roomId) {
            return {
                success: false,
                error: "INVALID_ROOM_ID",
            }
        }

        if (
            this.roomManager.hasRoom(roomId)
        ) {
            return {
                success: false,
                error: "ROOM_ALREADY_EXISTS",
            }
        }

        const room =
            this.roomManager.createRoom(
                roomId,
                player,
                settings
            )

        return {
            success: true,
            room,
        }
    }

    getRoom(roomId) {

        const room =
            this.roomManager.getRoom(roomId)

        if (!room) {
            return {
                success: false,
                error: "ROOM_NOT_FOUND",
            }
        }

        return {
            success: true,
            room,
        }
    }

    joinRoom(
        roomId,
        player
    ) {

        return this.roomManager.addPlayer(
            roomId,
            player
        )
    }

    leaveRoom(
        roomId,
        playerId
    ) {

        const room =
            this.roomManager.removePlayer(
                roomId,
                playerId
            )

        return {
            success: true,
            room,
        }
    }

    getRooms() {

        return {
            success: true,
            rooms:
                this.roomManager.getRooms(),
        }
    }

    canStartRoom(roomId) {

        return {
            success: true,
            canStart:
                this.roomManager.canStart(
                    roomId
                ),
        }
    }
}

module.exports = {
    RoomService,
}