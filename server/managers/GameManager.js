const WORDS = [
    "cat",
    "dog",
    "pizza",
    "apple",
    "car",
    "house",
    "tree",
    "sun",
    "moon",
    "fish",
    "flower",
    "book",
    "phone",
    "computer",
    "guitar",
    "cake",
    "ice cream",
    "banana",
    "airplane",
    "robot",
    "star",
    "cloud",
    "rainbow",
    "coffee",
    "hamburger",
    "camera",
    "chair",
    "table",
    "school",
    "castle",
]

const CHOOSE_WORD_TIME = 15
const HINT_DELAY = 10

class GameManager {
    constructor() {
        this.games = new Map()
    }

    createGame(
        roomId,
        players,
        drawingTime = 60,
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

            drawingTime,

            phase: "choose-word",

            round: 1,
            totalRounds: playerIds.length,

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

        game.phase = "choose-word"

        game.word = ""
        game.wordOptions = this.getRandomWords(3)

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

    getRandomWords(count) {
        const shuffled = [
            ...WORDS,
        ].sort(
            () =>
                Math.random() -
                0.5
        )

        return shuffled.slice(
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
        }

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
            }, HINT_DELAY * 1000)
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

        const normalizedGuess =
            String(
                guess || ""
            )
                .trim()
                .toLowerCase()

        const normalizedWord =
            String(
                game.word
            )
                .trim()
                .toLowerCase()

        const correct =
            normalizedGuess ===
            normalizedWord

        const player =
            game.playerIds.includes(
                playerId
            )

        if (!player) {
            return {
                success: false,
                error: "PLAYER_NOT_IN_GAME",
            }
        }

        if (!correct) {
            game.guessMessages.push(
                {
                    playerId,
                    guess:
                        String(
                            guess || ""
                        ),
                    correct: false,
                    timestamp:
                        Date.now(),
                }
            )

            return {
                success: true,
                correct: false,
            }
        }

        game.guessedPlayers.add(
            playerId
        )

        const remainingPlayers =
            game.playerIds.filter(
                (id) =>
                    id !==
                    game.drawerId
            )

        const guessedCount =
            game.guessedPlayers.size

        const allGuessed =
            remainingPlayers.length >
            0 &&
            guessedCount >=
            remainingPlayers.length

        const points =
            this.calculateGuessPoints(
                game
            )

        game.scores[playerId] +=
            points

        game.guessMessages.push(
            {
                playerId,
                guess:
                    String(
                        guess || ""
                    ),
                correct: true,
                timestamp:
                    Date.now(),
            }
        )

        return {
            success: true,
            correct: true,
            points,
            allGuessed,
        }
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

        if (!stroke) {
            return {
                success: false,
                error: "INVALID_STROKE",
            }
        }

        game.strokes.push(
            stroke
        )

        return {
            success: true,
            stroke,
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

        const nextTurnIndex =
            game.turnIndex + 1

        /*
         * ยังมี player คนต่อไป
         */
        if (
            nextTurnIndex <
            game.playerIds.length
        ) {
            game.turnIndex =
                nextTurnIndex

            game.drawerId =
                game.playerIds[
                game.turnIndex
                ]

            /*
             * ถ้าครบทุกคนแล้ว
             * ขึ้น round ใหม่
             */
            if (
                game.turnIndex ===
                0
            ) {
                game.round += 1
            }

            this.startChooseWord(
                game
            )

            return
        }

        /*
         * จบเกม
         */
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
         * ไม่มี player เหลือ
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
         * Drawer ออก
         */
        if (
            game.drawerId ===
            playerId
        ) {
            game.turnIndex =
                game.turnIndex %
                game.playerIds.length

            game.drawerId =
                game.playerIds[
                game.turnIndex
                ]

            if (
                game.phase ===
                "draw-and-guess"
            ) {
                this.startChooseWord(
                    game
                )
            }
        } else {
            /*
             * ปรับ turnIndex ถ้า player
             * ที่อยู่ก่อน drawer ถูกลบ
             */
            if (
                index <
                game.turnIndex
            ) {
                game.turnIndex -= 1
            }

            game.turnIndex =
                Math.max(
                    0,
                    game.turnIndex
                )

            /*
             * ปรับ total rounds
             */
            game.totalRounds =
                game.playerIds.length
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

            round:
                game.round,

            totalRounds:
                game.totalRounds,

            drawerId:
                game.drawerId,

            phaseEndsAt:
                game.phaseEndsAt,

            hint:
                game.hint,

            scores:
                game.scores,

            guessedPlayers:
                Array.from(
                    game.guessedPlayers
                ),

            guessMessages:
                game.guessMessages,
        }
    }
}

module.exports = {
    GameManager,
}