const {
    MIXED_CATEGORY,
    getWordsForCategory,
} = require("../utils/Words")

const CHOOSE_WORD_TIME = 15

/*
 * คะแนนที่คนวาดได้ ต่อ 1 คนที่ทายถูก
 */
const DRAWER_POINTS_PER_GUESS = 100

const MAX_GUESS_LENGTH = 100
const MAX_STROKES_PER_TURN = 20000
const MAX_POINTS_PER_STROKE = 50
const MAX_BRUSH_SIZE = 50

/*
 * ------------------------------------------------
 * Game logic
 *
 * ทุกฟังก์ชันรับ object เกมแล้วแก้ค่าในนั้นตรงๆ
 * ไม่มี state / timer ในตัวเอง (state อยู่ใน GameStore)
 *
 * แทน setTimeout ด้วยเวลาที่ต้องเปลี่ยนสถานะ:
 *   - phaseEndsAt : หมดเวลาเลือกคำ / หมดเวลาวาด
 *   - nextHintAt  : เวลาเปิด hint ตัวถัดไป
 * scheduler ใน socketHandler เรียก tick() เมื่อถึงเวลา
 * (instance ไหนก็ทำได้ ไม่ผูกกับเครื่องที่สร้างเกม)
 *
 * events: array ที่ฟังก์ชันเติมให้ผู้เรียกรู้ว่าเกิดอะไรขึ้น
 *   - "turnStarted" : เริ่มวาดคำใหม่ (ต้องล้าง canvas / strokes)
 * ------------------------------------------------
 */

function createGame(roomId, players, settings = {}, now = Date.now()) {
    const playerIds = players.map((player) => player.id)

    const scores = {}

    playerIds.forEach((playerId) => {
        scores[playerId] = 0
    })

    const game = {
        roomId,
        playerIds,
        scores,

        drawingTime: settings.drawingTime || 60,

        category: settings.category || MIXED_CATEGORY,

        /*
         * คำที่ใช้ไปแล้วในเกมนี้ (กันคำซ้ำ)
         */
        usedWords: new Set(),

        phase: "choose-word",

        /*
         * 1 round = ผู้เล่นทุกคนได้วาดคนละ 1 ครั้ง
         */
        round: 1,
        totalRounds: settings.rounds || 1,

        /*
         * turnId เพิ่มขึ้นทุกครั้งที่เริ่ม turn ใหม่
         * client ใช้ reset UI (chat / คำตอบ)
         */
        turnId: 0,

        turnIndex: 0,
        drawerId: playerIds[0],

        word: "",
        wordOptions: [],

        guessedPlayers: new Set(),
        guessMessages: [],

        phaseEndsAt: 0,
        nextHintAt: 0,

        hint: "",
        revealedIndexes: new Set(),
        maxHints: 0,
    }

    startChooseWord(game, now)

    return game
}

function startChooseWord(game, now = Date.now()) {
    game.turnId += 1

    game.phase = "choose-word"

    game.word = ""
    game.wordOptions = getRandomWords(game, 3)

    game.guessedPlayers = new Set()
    game.guessMessages = []

    game.hint = ""
    game.revealedIndexes = new Set()
    game.maxHints = 0
    game.nextHintAt = 0

    game.phaseEndsAt = now + CHOOSE_WORD_TIME * 1000
}

function getRandomWords(game, count) {
    const words = getWordsForCategory(game.category)

    let available = words.filter((word) => !game.usedWords.has(word))

    /*
     * คำในหมวดใช้หมดแล้ว เริ่มวนใหม่
     */
    if (available.length < count) {
        game.usedWords.clear()

        available = [...words]
    }

    /*
     * Fisher-Yates shuffle
     */
    for (let index = available.length - 1; index > 0; index--) {
        const swapIndex = Math.floor(Math.random() * (index + 1))

        ;[available[index], available[swapIndex]] = [
            available[swapIndex],
            available[index],
        ]
    }

    return available.slice(0, count)
}

function selectWord(game, playerId, word, now = Date.now(), events = []) {
    if (game.phase !== "choose-word") {
        return {
            success: false,
            error: "NOT_CHOOSE_WORD_PHASE",
        }
    }

    if (game.drawerId !== playerId) {
        return {
            success: false,
            error: "NOT_DRAWER",
        }
    }

    if (!game.wordOptions.includes(word)) {
        return {
            success: false,
            error: "INVALID_WORD",
        }
    }

    game.word = word

    game.usedWords.add(word)

    game.phase = "draw-and-guess"

    game.guessedPlayers = new Set()
    game.guessMessages = []

    game.revealedIndexes = new Set()
    game.maxHints = getMaxHints(word)
    game.hint = createHiddenHint(word, game.revealedIndexes)

    game.phaseEndsAt = now + game.drawingTime * 1000

    scheduleNextHint(game, now)

    /*
     * บอกผู้เรียกว่าเริ่ม turn ใหม่
     * ต้องล้าง strokes / canvas ครั้งเดียวตรงนี้
     * (hint ห้ามล้าง canvas)
     */
    events.push("turnStarted")

    return {
        success: true,
    }
}

function createHiddenHint(word, revealedIndexes) {
    return word
        .split("")
        .map((character, index) => {
            if (character === " ") {
                return " "
            }

            if (revealedIndexes.has(index)) {
                return character
            }

            return "_"
        })
        .join(" ")
}

function revealHintCharacter(game) {
    const hiddenIndexes = []

    for (let index = 0; index < game.word.length; index++) {
        if (game.word[index] !== " " && !game.revealedIndexes.has(index)) {
            hiddenIndexes.push(index)
        }
    }

    if (hiddenIndexes.length === 0) {
        return false
    }

    const index =
        hiddenIndexes[Math.floor(Math.random() * hiddenIndexes.length)]

    game.revealedIndexes.add(index)

    game.hint = createHiddenHint(game.word, game.revealedIndexes)

    return true
}

/*
 * ตั้งเวลาเปิด hint ตัวถัดไป
 *
 * กระจาย hint เท่าๆ กันตลอดเวลาวาด
 * เช่น เวลา 60s, hint 2 ตัว -> เปิดที่ 20s และ 40s
 *
 * เปิดครบตามจำนวนที่กำหนดแล้วไม่เปิดเพิ่ม (กันคำตอบโผล่ทั้งคำ)
 */
function scheduleNextHint(game, from) {
    if (game.revealedIndexes.size >= game.maxHints) {
        game.nextHintAt = 0
        return
    }

    const hintDelay = (game.drawingTime * 1000) / (game.maxHints + 1)

    game.nextHintAt = from + hintDelay
}

/*
 * จำนวนตัวอักษรสูงสุดที่ hint จะเปิดให้
 *
 * ไม่เกินครึ่งคำ และต้องเหลือซ่อนอย่างน้อย 1 ตัวเสมอ
 * เช่น cat -> 1, pizza -> 2, ice cream -> 4
 */
function getMaxHints(word) {
    const letters = word.replace(/\s/g, "").length

    return Math.max(0, Math.min(Math.floor(letters / 2), letters - 1))
}

/*
 * ตัดช่องว่างหัวท้าย / ช่องว่างซ้ำ และไม่สนตัวพิมพ์ใหญ่เล็ก
 * "  Ice   Cream " -> "ice cream"
 */
function normalizeGuess(text) {
    return String(text || "")
        .trim()
        .replace(/\s+/g, " ")
        .toLowerCase()
}

function submitGuess(game, playerId, guess, now = Date.now()) {
    if (game.phase !== "draw-and-guess") {
        return {
            success: false,
            error: "NOT_DRAWING_PHASE",
        }
    }

    if (playerId === game.drawerId) {
        return {
            success: false,
            error: "DRAWER_CANNOT_GUESS",
        }
    }

    if (game.guessedPlayers.has(playerId)) {
        return {
            success: true,
            alreadyGuessed: true,
        }
    }

    const rawGuess = String(guess || "")
        .trim()
        .replace(/\s+/g, " ")
        .slice(0, MAX_GUESS_LENGTH)

    if (!rawGuess) {
        return {
            success: false,
            error: "EMPTY_GUESS",
        }
    }

    if (!game.playerIds.includes(playerId)) {
        return {
            success: false,
            error: "PLAYER_NOT_IN_GAME",
        }
    }

    if (normalizeGuess(rawGuess) !== normalizeGuess(game.word)) {
        const message = {
            playerId,
            guess: rawGuess,
            correct: false,
            timestamp: now,
        }

        game.guessMessages.push(message)

        return {
            success: true,
            correct: false,
            message,
        }
    }

    game.guessedPlayers.add(playerId)

    const points = calculateGuessPoints(game, now)

    game.scores[playerId] += points

    /*
     * คนวาดได้คะแนนทุกครั้งที่มีคนทายถูก
     */
    if (Object.prototype.hasOwnProperty.call(game.scores, game.drawerId)) {
        game.scores[game.drawerId] += DRAWER_POINTS_PER_GUESS
    }

    /*
     * ไม่เก็บคำตอบที่ถูกไว้ใน message
     * กันคำตอบรั่วไปถึงผู้เล่นคนอื่น
     */
    const message = {
        playerId,
        correct: true,
        points,
        timestamp: now,
    }

    game.guessMessages.push(message)

    return {
        success: true,
        correct: true,
        message,
        points,
        drawerPoints: DRAWER_POINTS_PER_GUESS,
        allGuessed: haveAllGuessed(game),
    }
}

function haveAllGuessed(game) {
    const guessers = game.playerIds.filter((id) => id !== game.drawerId)

    return (
        guessers.length > 0 &&
        guessers.every((id) => game.guessedPlayers.has(id))
    )
}

function calculateGuessPoints(game, now = Date.now()) {
    const remaining = Math.max(1, Math.ceil((game.phaseEndsAt - now) / 1000))

    return Math.max(100, remaining * 10)
}

/*
 * ตรวจ stroke จาก client
 * คืน null ถ้าไม่ถูกต้อง
 */
function sanitizeStroke(stroke) {
    if (
        !stroke ||
        !Array.isArray(stroke.points) ||
        stroke.points.length < 2 ||
        stroke.points.length > MAX_POINTS_PER_STROKE
    ) {
        return null
    }

    const points = []

    for (const point of stroke.points) {
        const x = Number(point?.x)
        const y = Number(point?.y)

        if (!Number.isFinite(x) || !Number.isFinite(y)) {
            return null
        }

        points.push({
            x: Math.min(1, Math.max(0, x)),
            y: Math.min(1, Math.max(0, y)),
        })
    }

    const color = String(stroke.color || "")

    if (!/^#[0-9a-fA-F]{6}$/.test(color)) {
        return null
    }

    const size = Number(stroke.size)

    if (!Number.isFinite(size)) {
        return null
    }

    return {
        points,
        color,
        size: Math.min(MAX_BRUSH_SIZE, Math.max(1, size)),
        mode: stroke.mode === "erase" ? "erase" : "draw",
    }
}

function finishTurn(game, now = Date.now()) {
    startTurnAt(game, game.turnIndex + 1, now)
}

/*
 * เริ่ม turn ของผู้เล่นลำดับ turnIndex
 *
 * ถ้าเลยคนสุดท้ายแล้ว -> ขึ้น round ใหม่
 * ถ้าครบทุก round แล้ว -> จบเกม
 */
function startTurnAt(game, turnIndex, now = Date.now()) {
    if (turnIndex >= game.playerIds.length) {
        turnIndex = 0

        game.round += 1
    }

    if (game.round > game.totalRounds) {
        game.round = game.totalRounds

        endGame(game)

        return
    }

    game.turnIndex = turnIndex

    game.drawerId = game.playerIds[game.turnIndex]

    startChooseWord(game, now)
}

function endGame(game) {
    game.phase = "game-result"

    game.word = ""
    game.wordOptions = []

    game.phaseEndsAt = 0
    game.nextHintAt = 0

    game.hint = ""
    game.revealedIndexes = new Set()
}

/*
 * เอาผู้เล่นออกจากเกม
 *
 * คืน { changed, empty }
 *   empty = ไม่เหลือผู้เล่นในเกมแล้ว (ผู้เรียกต้องลบเกม)
 * ถ้าเกมจบเพราะเหลือคนน้อย game.phase จะเป็น "game-result"
 */
function removePlayer(game, playerId, now = Date.now()) {
    const index = game.playerIds.indexOf(playerId)

    if (index === -1) {
        return {
            changed: false,
            empty: false,
        }
    }

    const wasDrawer = game.drawerId === playerId

    game.playerIds.splice(index, 1)

    delete game.scores[playerId]

    game.guessedPlayers.delete(playerId)

    if (game.playerIds.length === 0) {
        return {
            changed: true,
            empty: true,
        }
    }

    if (game.phase === "game-result") {
        return {
            changed: true,
            empty: false,
        }
    }

    /*
     * เหลือผู้เล่นเพียง 1 คน จบเกมทันที
     */
    if (game.playerIds.length === 1) {
        endGame(game)

        return {
            changed: true,
            empty: false,
        }
    }

    if (wasDrawer) {
        /*
         * หลัง splice คนถัดไปจะเลื่อนมาอยู่ที่ turnIndex เดิมพอดี
         *
         * startTurnAt จัดการขึ้น round ใหม่ / จบเกม ให้
         * และเริ่ม choose-word ใหม่ ให้ drawer คนใหม่ได้เวลาเต็ม
         */
        startTurnAt(game, game.turnIndex, now)
    } else {
        /*
         * ถ้า player ที่ออกอยู่ก่อน drawer
         */
        if (index < game.turnIndex) {
            game.turnIndex -= 1
        }

        /*
         * คนที่เหลือทายถูกครบแล้ว จบ turn เลย ไม่ต้องรอหมดเวลา
         */
        if (game.phase === "draw-and-guess" && haveAllGuessed(game)) {
            finishTurn(game, now)
        }
    }

    return {
        changed: true,
        empty: false,
    }
}

function replacePlayerId(game, oldPlayerId, newPlayerId) {
    const index = game.playerIds.indexOf(oldPlayerId)

    if (index !== -1) {
        game.playerIds[index] = newPlayerId
    }

    if (Object.prototype.hasOwnProperty.call(game.scores, oldPlayerId)) {
        game.scores[newPlayerId] = game.scores[oldPlayerId]

        delete game.scores[oldPlayerId]
    }

    if (game.drawerId === oldPlayerId) {
        game.drawerId = newPlayerId
    }

    if (game.guessedPlayers.has(oldPlayerId)) {
        game.guessedPlayers.delete(oldPlayerId)
        game.guessedPlayers.add(newPlayerId)
    }

    for (const message of game.guessMessages) {
        if (message.playerId === oldPlayerId) {
            message.playerId = newPlayerId
        }
    }
}

/*
 * ทำสิ่งที่ถึงเวลาแล้ว (แทน setTimeout เดิม)
 *
 * คืน true ถ้าเกมเปลี่ยน (ผู้เรียกต้อง save + ส่ง state)
 */
function tick(game, now = Date.now(), events = []) {
    if (game.phase === "choose-word") {
        /*
         * หมดเวลาเลือกคำ -> เลือกคำแรกให้
         */
        if (now >= game.phaseEndsAt) {
            selectWord(game, game.drawerId, game.wordOptions[0], now, events)

            return true
        }

        return false
    }

    if (game.phase !== "draw-and-guess") {
        return false
    }

    /*
     * หมดเวลาวาด
     */
    if (now >= game.phaseEndsAt) {
        finishTurn(game, now)

        return true
    }

    /*
     * ถึงเวลาเปิด hint
     */
    if (game.nextHintAt && now >= game.nextHintAt) {
        revealHintCharacter(game)

        scheduleNextHint(game, game.nextHintAt)

        return true
    }

    return false
}

/*
 * เวลาที่เกมต้องเปลี่ยนสถานะครั้งถัดไป (null = ไม่มี)
 */
function getNextDeadline(game) {
    if (game.phase === "choose-word") {
        return game.phaseEndsAt
    }

    if (game.phase === "draw-and-guess") {
        return game.nextHintAt
            ? Math.min(game.phaseEndsAt, game.nextHintAt)
            : game.phaseEndsAt
    }

    return null
}

function getPublicState(game) {
    return {
        roomId: game.roomId,

        phase: game.phase,

        turnId: game.turnId,

        round: game.round,

        totalRounds: game.totalRounds,

        /*
         * ลำดับคนวาดใน round นี้ เช่น 2 / 4
         */
        turn: game.turnIndex + 1,

        turnsPerRound: game.playerIds.length,

        drawerId: game.drawerId,

        phaseEndsAt: game.phaseEndsAt,

        /*
         * เวลาของ server ตอนส่ง state
         * client ใช้ชดเชยนาฬิกาเครื่องตัวเองที่อาจไม่ตรง
         */
        serverNow: Date.now(),

        hint: game.hint,

        scores: game.scores,

        wordLength: game.word.replace(/ /g, "").length,

        guessedPlayers: Array.from(game.guessedPlayers),
    }
}

/*
 * แปลง Set <-> array สำหรับเก็บเป็น JSON
 */
function serializeGame(game) {
    return {
        ...game,
        usedWords: Array.from(game.usedWords),
        guessedPlayers: Array.from(game.guessedPlayers),
        revealedIndexes: Array.from(game.revealedIndexes),
    }
}

function deserializeGame(data) {
    if (!data) {
        return null
    }

    return {
        ...data,
        usedWords: new Set(data.usedWords),
        guessedPlayers: new Set(data.guessedPlayers),
        revealedIndexes: new Set(data.revealedIndexes),
    }
}

module.exports = {
    MAX_STROKES_PER_TURN,

    createGame,
    selectWord,
    submitGuess,
    sanitizeStroke,
    finishTurn,
    removePlayer,
    replacePlayerId,
    tick,
    getNextDeadline,
    getPublicState,
    serializeGame,
    deserializeGame,

    // ใช้ในการทดสอบ
    getMaxHints,
    normalizeGuess,
}
