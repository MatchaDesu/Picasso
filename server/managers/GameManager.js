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

class GameManager {
    constructor() {
        this.games = new Map()
    }

    createGame(
        roomId,
        players,
        settings = {},
        onPhaseChange = null,
        onTurnStart = null
    ) {
        const playerIds = players.map(
            (player) => player.id
        )

        const scores = {}

        playerIds.forEach((playerId) => {
            scores[playerId] = 0
        })

        const game = {
            roomId,
            playerIds,
            scores,

            drawingTime:
                settings.drawingTime || 60,

            category:
                settings.category ||
                MIXED_CATEGORY,

            /*
             * คำที่ใช้ไปแล้วในเกมนี้ (กันคำซ้ำ)
             */
            usedWords: new Set(),

            phase: "choose-word",

            /*
             * 1 round = ผู้เล่นทุกคนได้วาดคนละ 1 ครั้ง
             */
            round: 1,
            totalRounds:
                settings.rounds || 1,

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

            hint: "",
            revealedIndexes: new Set(),
            hintRevealed: false,
            maxHints: 0,

            strokes: [],

            timer: null,
            hintTimer: null,

            onPhaseChange,
            onTurnStart,
        }

        this.games.set(
            roomId,
            game
        )

        this.startChooseWord(game)

        return game
    }

    getGame(roomId) {
        return this.games.get(roomId)
    }

    deleteGame(roomId) {
        const game = this.games.get(roomId)

        if (game) {
            this.clearTimers(game)
        }

        this.games.delete(roomId)
    }

    clearTimers(game) {
        if (game.timer) {
            clearTimeout(game.timer)
            game.timer = null
        }

        if (game.hintTimer) {
            clearTimeout(game.hintTimer)
            game.hintTimer = null
        }
    }

    startChooseWord(game) {
        if (!game) {
            return
        }

        this.clearTimers(game)

        game.turnId += 1

        game.phase = "choose-word"

        game.word = ""
        game.wordOptions = this.getRandomWords(
            game,
            3
        )

        game.guessedPlayers = new Set()
        game.guessMessages = []

        game.hint = ""
        game.revealedIndexes = new Set()
        game.hintRevealed = false

        game.strokes = []

        game.phaseEndsAt =
            Date.now() +
            CHOOSE_WORD_TIME * 1000

        if (game.onPhaseChange) {
            game.onPhaseChange(game)
        }

        game.timer = setTimeout(() => {
            if (
                game.phase !==
                "choose-word"
            ) {
                return
            }

            const defaultWord =
                game.wordOptions[0]

            this.selectWord(
                game.roomId,
                game.drawerId,
                defaultWord
            )
        }, CHOOSE_WORD_TIME * 1000)
    }

    getRandomWords(
        game,
        count
    ) {
        const words =
            getWordsForCategory(
                game.category
            )

        let available =
            words.filter(
                (word) =>
                    !game.usedWords.has(
                        word
                    )
            )

        /*
         * คำในหมวดใช้หมดแล้ว เริ่มวนใหม่
         */
        if (
            available.length <
            count
        ) {
            game.usedWords.clear()

            available = [...words]
        }

        /*
         * Fisher-Yates shuffle
         */
        for (
            let index = available.length - 1;
            index > 0;
            index--
        ) {
            const swapIndex =
                Math.floor(
                    Math.random() *
                    (index + 1)
                )

            ;[
                available[index],
                available[swapIndex],
            ] = [
                available[swapIndex],
                available[index],
            ]
        }

        return available.slice(
            0,
            count
        )
    }

    selectWord(
        roomId,
        playerId,
        word
    ) {
        const game =
            this.games.get(roomId)

        if (!game) {
            return {
                success: false,
                error: "GAME_NOT_FOUND",
            }
        }

        if (
            game.phase !==
            "choose-word"
        ) {
            return {
                success: false,
                error: "NOT_CHOOSE_WORD_PHASE",
            }
        }

        if (
            game.drawerId !==
            playerId
        ) {
            return {
                success: false,
                error: "NOT_DRAWER",
            }
        }

        if (
            !game.wordOptions.includes(
                word
            )
        ) {
            return {
                success: false,
                error: "INVALID_WORD",
            }
        }

        this.clearTimers(game)

        game.word = word

        game.usedWords.add(
            word
        )

        game.maxHints =
            this.getMaxHints(
                word
            )

        game.phase =
            "draw-and-guess"

        game.guessedPlayers =
            new Set()

        game.guessMessages = []

        game.revealedIndexes =
            new Set()

        game.hint =
            this.createHiddenHint(
                word,
                game.revealedIndexes
            )

        game.hintRevealed =
            false

        /*
         * สำคัญมาก:
         *
         * reset strokes เฉพาะตอนเริ่ม
         * คำใหม่เท่านั้น
         */
        game.strokes = []

        game.phaseEndsAt =
            Date.now() +
            game.drawingTime * 1000

        /*
         * บอก socketHandler ว่า
         * "นี่คือการเริ่ม turn ใหม่"
         *
         * callback นี้จะสั่ง draw:clear
         * แค่ครั้งเดียว
         */
        if (game.onTurnStart) {
            game.onTurnStart(game)
        }

        /*
         * ส่ง game state ปกติ
         */
        if (game.onPhaseChange) {
            game.onPhaseChange(game)
        }

        /*
         * Timer จบรอบ
         */
        game.timer = setTimeout(() => {
            if (
                game.phase !==
                "draw-and-guess"
            ) {
                return
            }

            this.finishTurn(game)

            /*
             * หลังจบ turn ให้ส่ง state
             * แต่ไม่ clear canvas ตรงนี้
             */
            if (game.onPhaseChange) {
                game.onPhaseChange(game)
            }
        }, game.drawingTime * 1000)

        /*
         * เริ่มระบบ Hint
         */
        this.scheduleNextHint(game)

        return {
            success: true,
            game,
        }
    }

    createHiddenHint(
        word,
        revealedIndexes
    ) {
        return word
            .split("")
            .map(
                (
                    character,
                    index
                ) => {
                    if (
                        character ===
                        " "
                    ) {
                        return " "
                    }

                    if (
                        revealedIndexes.has(
                            index
                        )
                    ) {
                        return character
                    }

                    return "_"
                }
            )
            .join(" ")
    }

    revealHintCharacters(game) {
        if (!game) {
            return false
        }

        const hiddenIndexes = []

        for (
            let index = 0;
            index < game.word.length;
            index++
        ) {
            const character =
                game.word[index]

            if (
                character ===
                " "
            ) {
                continue
            }

            if (
                !game.revealedIndexes.has(
                    index
                )
            ) {
                hiddenIndexes.push(
                    index
                )
            }
        }

        if (
            hiddenIndexes.length ===
            0
        ) {
            return false
        }

        const randomIndex =
            Math.floor(
                Math.random() *
                hiddenIndexes.length
            )

        const index =
            hiddenIndexes[
            randomIndex
            ]

        game.revealedIndexes.add(
            index
        )

        game.hint =
            this.createHiddenHint(
                game.word,
                game.revealedIndexes
            )

        game.hintRevealed = true

        return true
    }

    scheduleNextHint(game) {
        if (!game) {
            return
        }

        if (
            game.phase !==
            "draw-and-guess"
        ) {
            return
        }

        if (game.hintTimer) {
            clearTimeout(
                game.hintTimer
            )

            game.hintTimer = null
        }

        /*
         * เปิด hint ครบตามจำนวนที่กำหนดแล้ว
         * ไม่เปิดเพิ่ม (กันคำตอบโผล่ทั้งคำ)
         */
        if (
            game.revealedIndexes.size >=
            game.maxHints
        ) {
            return
        }

        /*
         * กระจาย hint เท่าๆ กันตลอดเวลาวาด
         * เช่น เวลา 60s, hint 2 ตัว -> เปิดที่ 20s และ 40s
         */
        const hintDelay =
            (game.drawingTime * 1000) /
            (game.maxHints + 1)

        game.hintTimer =
            setTimeout(() => {
                if (
                    game.phase !==
                    "draw-and-guess"
                ) {
                    return
                }

                const revealed =
                    this.revealHintCharacters(
                        game
                    )

                if (revealed) {
                    /*
                     * สำคัญ:
                     *
                     * ตรงนี้เรียกแค่
                     * onPhaseChange
                     *
                     * ไม่มี draw:clear
                     *
                     * ดังนั้น Canvas จะไม่ reset
                     */
                    if (
                        game.onPhaseChange
                    ) {
                        game.onPhaseChange(
                            game
                        )
                    }
                }

                this.scheduleNextHint(
                    game
                )
            }, hintDelay)
    }

    /*
     * จำนวนตัวอักษรสูงสุดที่ hint จะเปิดให้
     *
     * ไม่เกินครึ่งคำ และต้องเหลือซ่อนอย่างน้อย 1 ตัวเสมอ
     * เช่น cat -> 1, pizza -> 2, ice cream -> 4
     */
    getMaxHints(word) {
        const letters =
            word.replace(
                /\s/g,
                ""
            ).length

        return Math.max(
            0,
            Math.min(
                Math.floor(
                    letters / 2
                ),
                letters - 1
            )
        )
    }

    /*
     * ตัดช่องว่างหัวท้าย / ช่องว่างซ้ำ และไม่สนตัวพิมพ์ใหญ่เล็ก
     * "  Ice   Cream " -> "ice cream"
     */
    normalizeGuess(text) {
        return String(
            text || ""
        )
            .trim()
            .replace(
                /\s+/g,
                " "
            )
            .toLowerCase()
    }

    submitGuess(
        roomId,
        playerId,
        guess
    ) {
        const game =
            this.games.get(roomId)

        if (!game) {
            return {
                success: false,
                error: "GAME_NOT_FOUND",
            }
        }

        if (
            game.phase !==
            "draw-and-guess"
        ) {
            return {
                success: false,
                error: "NOT_DRAWING_PHASE",
            }
        }

        if (
            playerId ===
            game.drawerId
        ) {
            return {
                success: false,
                error: "DRAWER_CANNOT_GUESS",
            }
        }

        if (
            game.guessedPlayers.has(
                playerId
            )
        ) {
            return {
                success: true,
                alreadyGuessed: true,
            }
        }

        const rawGuess =
            String(
                guess || ""
            )
                .trim()
                .replace(
                    /\s+/g,
                    " "
                )
                .slice(
                    0,
                    MAX_GUESS_LENGTH
                )

        if (!rawGuess) {
            return {
                success: false,
                error: "EMPTY_GUESS",
            }
        }

        if (
            !game.playerIds.includes(
                playerId
            )
        ) {
            return {
                success: false,
                error: "PLAYER_NOT_IN_GAME",
            }
        }

        const correct =
            this.normalizeGuess(
                rawGuess
            ) ===
            this.normalizeGuess(
                game.word
            )

        if (!correct) {
            const message = {
                playerId,
                guess: rawGuess,
                correct: false,
                timestamp:
                    Date.now(),
            }

            game.guessMessages.push(
                message
            )

            return {
                success: true,
                correct: false,
                message,
            }
        }

        game.guessedPlayers.add(
            playerId
        )

        const points =
            this.calculateGuessPoints(
                game
            )

        game.scores[playerId] +=
            points

        /*
         * คนวาดได้คะแนนทุกครั้งที่มีคนทายถูก
         */
        if (
            Object.prototype.hasOwnProperty.call(
                game.scores,
                game.drawerId
            )
        ) {
            game.scores[game.drawerId] +=
                DRAWER_POINTS_PER_GUESS
        }

        /*
         * ไม่เก็บคำตอบที่ถูกไว้ใน message
         * กันคำตอบรั่วไปถึงผู้เล่นคนอื่น
         */
        const message = {
            playerId,
            correct: true,
            points,
            timestamp:
                Date.now(),
        }

        game.guessMessages.push(
            message
        )

        return {
            success: true,
            correct: true,
            message,
            points,
            drawerPoints:
                DRAWER_POINTS_PER_GUESS,
            allGuessed:
                this.haveAllGuessed(
                    game
                ),
        }
    }

    haveAllGuessed(game) {
        const guessers =
            game.playerIds.filter(
                (id) =>
                    id !==
                    game.drawerId
            )

        return (
            guessers.length > 0 &&
            guessers.every(
                (id) =>
                    game.guessedPlayers.has(
                        id
                    )
            )
        )
    }

    calculateGuessPoints(game) {
        const remaining =
            Math.max(
                1,
                Math.ceil(
                    (
                        game.phaseEndsAt -
                        Date.now()
                    ) / 1000
                )
            )

        return Math.max(
            100,
            remaining * 10
        )
    }

    addStroke(
        roomId,
        playerId,
        stroke
    ) {
        const game =
            this.games.get(roomId)

        if (!game) {
            return {
                success: false,
                error: "GAME_NOT_FOUND",
            }
        }

        if (
            game.phase !==
            "draw-and-guess"
        ) {
            return {
                success: false,
                error: "NOT_DRAWING_PHASE",
            }
        }

        if (
            game.drawerId !==
            playerId
        ) {
            return {
                success: false,
                error: "NOT_DRAWER",
            }
        }

        const sanitizedStroke =
            this.sanitizeStroke(
                stroke
            )

        if (!sanitizedStroke) {
            return {
                success: false,
                error: "INVALID_STROKE",
            }
        }

        if (
            game.strokes.length >=
            MAX_STROKES_PER_TURN
        ) {
            return {
                success: false,
                error: "TOO_MANY_STROKES",
            }
        }

        game.strokes.push(
            sanitizedStroke
        )

        return {
            success: true,
            stroke: sanitizedStroke,
        }
    }

    sanitizeStroke(stroke) {
        if (
            !stroke ||
            !Array.isArray(
                stroke.points
            ) ||
            stroke.points.length < 2 ||
            stroke.points.length >
            MAX_POINTS_PER_STROKE
        ) {
            return null
        }

        const points = []

        for (const point of stroke.points) {
            const x = Number(point?.x)
            const y = Number(point?.y)

            if (
                !Number.isFinite(x) ||
                !Number.isFinite(y)
            ) {
                return null
            }

            points.push({
                x: Math.min(1, Math.max(0, x)),
                y: Math.min(1, Math.max(0, y)),
            })
        }

        const color =
            String(
                stroke.color || ""
            )

        if (
            !/^#[0-9a-fA-F]{6}$/.test(
                color
            )
        ) {
            return null
        }

        const size =
            Number(stroke.size)

        if (
            !Number.isFinite(size)
        ) {
            return null
        }

        return {
            points,
            color,
            size:
                Math.min(
                    MAX_BRUSH_SIZE,
                    Math.max(1, size)
                ),
            mode:
                stroke.mode ===
                "erase"
                    ? "erase"
                    : "draw",
        }
    }

    clearDrawing(
        roomId,
        playerId
    ) {
        const game =
            this.games.get(roomId)

        if (!game) {
            return {
                success: false,
                error: "GAME_NOT_FOUND",
            }
        }

        if (
            game.phase !==
            "draw-and-guess"
        ) {
            return {
                success: false,
                error: "NOT_DRAWING_PHASE",
            }
        }

        if (
            game.drawerId !==
            playerId
        ) {
            return {
                success: false,
                error: "NOT_DRAWER",
            }
        }

        game.strokes = []

        return {
            success: true,
        }
    }

    finishTurn(game) {
        if (!game) {
            return
        }

        this.clearTimers(game)

        this.startTurnAt(
            game,
            game.turnIndex + 1
        )
    }

    /*
     * เริ่ม turn ของผู้เล่นลำดับ turnIndex
     *
     * ถ้าเลยคนสุดท้ายแล้ว -> ขึ้น round ใหม่
     * ถ้าครบทุก round แล้ว -> จบเกม
     */
    startTurnAt(
        game,
        turnIndex
    ) {
        if (
            turnIndex >=
            game.playerIds.length
        ) {
            turnIndex = 0

            game.round += 1
        }

        if (
            game.round >
            game.totalRounds
        ) {
            game.round =
                game.totalRounds

            this.endGame(game)

            return
        }

        game.turnIndex =
            turnIndex

        game.drawerId =
            game.playerIds[
            game.turnIndex
            ]

        this.startChooseWord(
            game
        )
    }

    endGame(game) {
        this.clearTimers(game)

        game.phase =
            "game-result"

        game.word = ""
        game.wordOptions = []

        game.phaseEndsAt = 0

        game.hint = ""

        game.revealedIndexes =
            new Set()

        game.hintRevealed =
            false

        game.strokes = []
    }

    removePlayer(
        roomId,
        playerId
    ) {
        const game =
            this.games.get(roomId)

        if (!game) {
            return {
                changed: false,
                game: null,
            }
        }

        const index =
            game.playerIds.indexOf(
                playerId
            )

        if (index === -1) {
            return {
                changed: false,
                game,
            }
        }

        const wasDrawer =
            game.drawerId ===
            playerId

        /*
         * เอา player ออกจาก game
         */
        game.playerIds.splice(
            index,
            1
        )

        delete game.scores[
            playerId
        ]

        game.guessedPlayers.delete(
            playerId
        )

        /*
         * ไม่มีผู้เล่นเหลือ
         */
        if (
            game.playerIds.length ===
            0
        ) {
            this.deleteGame(
                roomId
            )

            return {
                changed: true,
                game: null,
            }
        }

        /*
         * เกมจบไปแล้ว ไม่ต้องทำอะไรต่อ
         */
        if (
            game.phase ===
            "game-result"
        ) {
            return {
                changed: true,
                game,
            }
        }

        /*
         * เหลือผู้เล่นเพียง 1 คน
         *
         * จบเกมทันที
         */
        if (
            game.playerIds.length ===
            1
        ) {
            this.endGame(game)

            return {
                changed: true,
                game,
            }
        }

        if (wasDrawer) {
            /*
             * หลัง splice คนถัดไปจะเลื่อนมาอยู่ที่
             * turnIndex เดิมพอดี
             *
             * startTurnAt จัดการขึ้น round ใหม่ / จบเกม ให้
             * และเริ่ม choose-word ใหม่ ให้ drawer คนใหม่ได้เวลาเต็ม
             */
            this.clearTimers(game)

            this.startTurnAt(
                game,
                game.turnIndex
            )
        } else {
            /*
             * ถ้า player ที่ออก
             * อยู่ก่อน drawer
             */
            if (
                index <
                game.turnIndex
            ) {
                game.turnIndex -= 1
            }

            /*
             * คนที่เหลือทายถูกครบแล้ว
             * จบ turn เลย ไม่ต้องรอหมดเวลา
             */
            if (
                game.phase ===
                "draw-and-guess" &&
                this.haveAllGuessed(
                    game
                )
            ) {
                this.finishTurn(game)
            }
        }

        return {
            changed: true,
            game,
        }
    }

    replacePlayerId(
        game,
        oldPlayerId,
        newPlayerId
    ) {
        if (!game) {
            return
        }

        const index =
            game.playerIds.indexOf(
                oldPlayerId
            )

        if (index !== -1) {
            game.playerIds[index] =
                newPlayerId
        }

        if (
            Object.prototype.hasOwnProperty.call(
                game.scores,
                oldPlayerId
            )
        ) {
            game.scores[newPlayerId] =
                game.scores[
                oldPlayerId
                ]

            delete game.scores[
                oldPlayerId
            ]
        }

        if (
            game.drawerId ===
            oldPlayerId
        ) {
            game.drawerId =
                newPlayerId
        }

        if (
            game.guessedPlayers.has(
                oldPlayerId
            )
        ) {
            game.guessedPlayers.delete(
                oldPlayerId
            )

            game.guessedPlayers.add(
                newPlayerId
            )
        }
    }

    getPublicState(game) {
        if (!game) {
            return null
        }

        return {
            roomId:
                game.roomId,

            phase:
                game.phase,

            turnId:
                game.turnId,

            round:
                game.round,

            totalRounds:
                game.totalRounds,

            /*
             * ลำดับคนวาดใน round นี้ เช่น 2 / 4
             */
            turn:
                game.turnIndex + 1,

            turnsPerRound:
                game.playerIds.length,

            drawerId:
                game.drawerId,

            phaseEndsAt:
                game.phaseEndsAt,

            /*
             * เวลาของ server ตอนส่ง state
             * client ใช้ชดเชยนาฬิกาเครื่องตัวเองที่อาจไม่ตรง
             */
            serverNow:
                Date.now(),

            hint:
                game.hint,

            scores:
                game.scores,

            wordLength:
                game.word.replace(
                    / /g,
                    ""
                ).length,

            guessedPlayers:
                Array.from(
                    game.guessedPlayers
                ),
        }
    }
}

module.exports = {
    GameManager,
}