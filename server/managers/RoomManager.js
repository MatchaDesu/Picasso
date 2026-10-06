const {
    MIXED_CATEGORY,
    CATEGORY_OPTIONS,
    isValidCategory,
} = require("../utils/Words")

const MAX_PLAYERS = 8

const MIN_PLAYERS = 3

const MAX_TITLE_LENGTH = 40

/*
 * ตัวเลือกการตั้งค่าห้อง
 *
 * ส่งให้ client ผ่าน room.settingsOptions
 * (CreateRoom.jsx มีรายการเวลาวาดของตัวเอง ต้องตรงกับ DRAWING_TIMES)
 */
const DRAWING_TIMES = [30, 60, 90, 120]

const ROUND_OPTIONS = [1, 2, 3, 4, 5]

const DEFAULT_SETTINGS = {
    drawingTime: 60,
    rounds: 2,
    category: MIXED_CATEGORY,
}

const SETTINGS_OPTIONS = {
    drawingTimes: DRAWING_TIMES,
    rounds: ROUND_OPTIONS,
    categories: CATEGORY_OPTIONS,
}

/*
 * รวมค่าที่ส่งมากับค่าเดิม
 * ค่าที่ไม่อยู่ในตัวเลือกจะถูกข้าม (ใช้ค่าเดิม)
 */
function sanitizeSettings(
    input = {},
    current = DEFAULT_SETTINGS
) {
    const drawingTime =
        Number(input.drawingTime)

    const rounds =
        Number(input.rounds)

    const category =
        String(
            input.category || ""
        )

    return {
        drawingTime:
            DRAWING_TIMES.includes(
                drawingTime
            )
                ? drawingTime
                : current.drawingTime,

        rounds:
            ROUND_OPTIONS.includes(
                rounds
            )
                ? rounds
                : current.rounds,

        category:
            isValidCategory(
                category
            )
                ? category
                : current.category,
    }
}

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
                String(
                    settings.title || ""
                )
                    .trim()
                    .slice(
                        0,
                        MAX_TITLE_LENGTH
                    ) ||
                "Untitled Room",

            hostId: host.id,

            status: "waiting",

            settings:
                sanitizeSettings(
                    settings
                ),

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
        return this.rooms.get(
            roomId
        )
    }

    hasRoom(roomId) {
        return this.rooms.has(
            roomId
        )
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
                error:
                    "ROOM_NOT_FOUND",
            }
        }

        if (
            room.status !==
            "waiting"
        ) {
            return {
                success: false,
                error:
                    "GAME_ALREADY_STARTED",
            }
        }

        if (
            room.players.has(
                player.id
            )
        ) {
            return {
                success: true,
                room,
            }
        }

        const activePlayers =
            Array.from(
                room.players.values()
            ).filter(
                (item) =>
                    !item.disconnected
            )

        if (
            activePlayers.length >=
            MAX_PLAYERS
        ) {
            return {
                success: false,
                error:
                    "ROOM_FULL",
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

    markPlayerDisconnected(
        roomId,
        playerId
    ) {
        const room =
            this.getRoom(roomId)

        if (!room) {
            return null
        }

        const player =
            room.players.get(
                playerId
            )

        if (!player) {
            return null
        }

        player.disconnected =
            true

        player.disconnectedAt =
            Date.now()

        return room
    }

    reconnectPlayer(
        roomId,
        oldPlayerId,
        newPlayer
    ) {
        const room =
            this.getRoom(roomId)

        if (!room) {
            return {
                success: false,
                error:
                    "ROOM_NOT_FOUND",
            }
        }

        const oldPlayer =
            room.players.get(
                oldPlayerId
            )

        if (!oldPlayer) {
            return {
                success: false,
                error:
                    "PLAYER_NOT_FOUND",
            }
        }

        room.players.delete(
            oldPlayerId
        )

        const restoredPlayer = {
            ...oldPlayer,
            ...newPlayer,
            id: newPlayer.id,
            disconnected: false,
            disconnectedAt:
                null,
        }

        room.players.set(
            newPlayer.id,
            restoredPlayer
        )

        if (
            room.hostId ===
            oldPlayerId
        ) {
            room.hostId =
                newPlayer.id
        }

        return {
            success: true,
            room,
            player:
                restoredPlayer,
            oldPlayerId,
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
            room.hostId ===
            playerId
        ) {
            const nextHost =
                Array.from(
                    room.players.values()
                ).find(
                    (player) =>
                        !player.disconnected
                ) ||
                room.players
                    .values()
                    .next()
                    .value

            if (nextHost) {
                room.hostId =
                    nextHost.id
            }
        }

        return room
    }

    updateSettings(
        roomId,
        playerId,
        settings
    ) {
        const room =
            this.getRoom(roomId)

        if (!room) {
            return {
                success: false,
                error:
                    "ROOM_NOT_FOUND",
            }
        }

        if (
            room.hostId !==
            playerId
        ) {
            return {
                success: false,
                error:
                    "ONLY_HOST_CAN_CHANGE_SETTINGS",
            }
        }

        if (
            room.status !==
            "waiting"
        ) {
            return {
                success: false,
                error:
                    "GAME_ALREADY_STARTED",
            }
        }

        room.settings =
            sanitizeSettings(
                settings,
                room.settings
            )

        return {
            success: true,
            room,
        }
    }

    canStart(roomId) {
        const room =
            this.getRoom(roomId)

        if (!room) {
            return false
        }

        const activePlayers =
            Array.from(
                room.players.values()
            ).filter(
                (player) =>
                    !player.disconnected
            )

        return (
            room.status ===
            "waiting" &&
            activePlayers.length >=
            MIN_PLAYERS
        )
    }

    isFull(roomId) {
        const room =
            this.getRoom(roomId)

        if (!room) {
            return false
        }

        const activePlayers =
            Array.from(
                room.players.values()
            ).filter(
                (player) =>
                    !player.disconnected
            )

        return (
            activePlayers.length >=
            MAX_PLAYERS
        )
    }

    deleteRoom(roomId) {
        return this.rooms.delete(
            roomId
        )
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
    SETTINGS_OPTIONS,
    DEFAULT_SETTINGS,
}