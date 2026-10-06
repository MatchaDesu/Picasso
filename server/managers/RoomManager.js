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

/*
 * ------------------------------------------------
 * Room logic
 *
 * ทุกฟังก์ชันรับ object ห้องแล้วแก้ค่าในนั้นตรงๆ
 * ไม่มี state ในตัวเอง (state อยู่ใน GameStore)
 *
 * room.players เป็น array (เก็บลง Redis เป็น JSON ได้)
 * ------------------------------------------------
 */

function createRoom(roomId, host, settings = {}) {
    return {
        id: roomId,

        title:
            String(settings.title || "")
                .trim()
                .slice(0, MAX_TITLE_LENGTH) ||
            "Untitled Room",

        hostId: host.id,

        status: "waiting",

        settings: sanitizeSettings(settings),

        players: [host],
    }
}

function findPlayer(room, playerId) {
    return room.players.find((player) => player.id === playerId) || null
}

function getActivePlayers(room) {
    return room.players.filter((player) => !player.disconnected)
}

/*
 * ย้าย host ให้คนที่ยังออนไลน์ (ถ้ามี)
 */
function transferHost(room) {
    const nextHost = getActivePlayers(room)[0] || room.players[0]

    if (nextHost) {
        room.hostId = nextHost.id
    }
}

function addPlayer(room, player) {
    if (room.status !== "waiting") {
        return {
            success: false,
            error: "GAME_ALREADY_STARTED",
        }
    }

    if (findPlayer(room, player.id)) {
        return {
            success: true,
        }
    }

    if (isFull(room)) {
        return {
            success: false,
            error: "ROOM_FULL",
        }
    }

    room.players.push(player)

    return {
        success: true,
    }
}

function markPlayerDisconnected(room, playerId, now = Date.now()) {
    const player = findPlayer(room, playerId)

    if (!player) {
        return null
    }

    player.disconnected = true
    player.disconnectedAt = now

    /*
     * Host หลุดตอนรอในห้อง
     * ย้าย host ให้คนที่ยังออนไลน์ จะได้กดเริ่มเกมได้
     */
    if (room.status === "waiting" && room.hostId === playerId) {
        transferHost(room)
    }

    return player
}

/*
 * แทนที่ player เดิม (socket เก่า) ด้วย socket ใหม่
 * ตำแหน่งใน array เหมือนเดิม ลำดับผู้เล่นจึงไม่เปลี่ยน
 */
function reconnectPlayer(room, oldPlayerId, newPlayer) {
    const index = room.players.findIndex(
        (player) => player.id === oldPlayerId
    )

    if (index === -1) {
        return null
    }

    const restoredPlayer = {
        ...room.players[index],
        ...newPlayer,
        disconnected: false,
        disconnectedAt: null,
    }

    room.players[index] = restoredPlayer

    if (room.hostId === oldPlayerId) {
        room.hostId = newPlayer.id
    }

    return restoredPlayer
}

/*
 * คืน false ถ้าห้องไม่เหลือใครแล้ว (ผู้เรียกต้องลบห้องทิ้ง)
 */
function removePlayer(room, playerId) {
    room.players = room.players.filter((player) => player.id !== playerId)

    if (room.players.length === 0) {
        return false
    }

    if (room.hostId === playerId) {
        transferHost(room)
    }

    return true
}

function updateSettings(room, playerId, settings) {
    if (room.hostId !== playerId) {
        return {
            success: false,
            error: "ONLY_HOST_CAN_CHANGE_SETTINGS",
        }
    }

    if (room.status !== "waiting") {
        return {
            success: false,
            error: "GAME_ALREADY_STARTED",
        }
    }

    room.settings = sanitizeSettings(settings, room.settings)

    return {
        success: true,
    }
}

function canStart(room) {
    return (
        room.status === "waiting" &&
        getActivePlayers(room).length >= MIN_PLAYERS
    )
}

function isFull(room) {
    return getActivePlayers(room).length >= MAX_PLAYERS
}

module.exports = {
    MAX_PLAYERS,
    MIN_PLAYERS,
    SETTINGS_OPTIONS,
    DEFAULT_SETTINGS,

    createRoom,
    findPlayer,
    getActivePlayers,
    addPlayer,
    markPlayerDisconnected,
    reconnectPlayer,
    removePlayer,
    updateSettings,
    canStart,
    isFull,
}
