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
        drawingTime = 60
    ) {
        const playerIds =
            players
                .filter(
                    (player) =>
                        !player.disconnected
                )
                .map(
                    (player) =>
                        player.id
                )

        const scores = {}

        for (
            const playerId of
            playerIds
        ) {
            scores[playerId] =
                0
        }

        const game = {
            roomId,

            playerIds,

            scores,

            drawingTime:
                Number(
                    drawingTime
                ) || 60,

            phase:
                "choose-word",

            round: 1,

            totalRounds:
                playerIds.length,

            turnIndex: 0,

            drawerId:
                playerIds[0],

            word: "",

            wordOptions: [],

            guessedPlayers:
                new Set(),

            guessMessages: [],

            phaseEndsAt: 0,

            hint: "",

            hintRevealed: false,

            strokes: [],

            timer: null,

            hintTimer: null,
        }

        this.games.set(
            roomId,
            game
        )

        this.startChooseWord(
            game
        )

        return game
    }

    getGame(roomId) {
        return this.games.get(
            roomId
        )
    }

    removeGame(roomId) {
        const game =
            this.games.get(
                roomId
            )

        if (game) {
            this.clearTimers(
                game
            )
        }

        return this.games.delete(
            roomId
        )
    }

    clearTimers(game) {
        if (game.timer) {
            clearTimeout(
                game.timer
            )

            game.timer =
                null
        }

        if (game.hintTimer) {
            clearTimeout(
                game.hintTimer
            )

            game.hintTimer =
                null
        }
    }

    generateWordOptions() {
        const shuffled =
            [...WORDS].sort(
                () =>
                    Math.random() -
                    0.5
            )

        return shuffled
            .slice(0, 3)
    }

    createHiddenHint(
        word
    ) {
        return word
            .split("")
            .map(
                (character) => {
                    if (
                        character ===
                        " "
                    ) {
                        return " "
                    }

                    return "_"
                }
            )
            .join(" ")
    }

    revealHintCharacters(
        game
    ) {
        if (
            !game.word
        ) {
            return
        }

        const characters =
            game.word.split("")

        const current =
            game.hint
                .split("")

        const hiddenIndexes =
            []

        for (
            let i = 0;
            i <
            characters.length;
            i++
        ) {
            if (
                characters[i] ===
                " "
            ) {
                continue
            }

            if (
                current[i] ===
                "_"
            ) {
                hiddenIndexes.push(
                    i
                )
            }
        }

        if (
            hiddenIndexes.length ===
            0
        ) {
            return
        }

        const index =
            hiddenIndexes[
            Math.floor(
                Math.random() *
                hiddenIndexes.length
            )
            ]

        current[index] =
            characters[index]

        game.hint =
            current.join("")
    }

    startChooseWord(game) {
        this.clearTimers(
            game
        )

        game.phase =
            "choose-word"

        game.word =
            ""

        game.wordOptions =
            this.generateWordOptions()

        game.guessedPlayers =
            new Set()

        game.guessMessages =
            []

        game.hint =
            ""

        game.hintRevealed =
            false

        game.strokes =
            []

        game.phaseEndsAt =
            Date.now() +
            CHOOSE_WORD_TIME *
            1000

        game.timer =
            setTimeout(
                () => {
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
                },
                CHOOSE_WORD_TIME *
                1000
            )
    }

    selectWord(
        roomId,
        playerId,
        word,
        onPhaseChange
    ) {
        const game =
            this.getGame(
                roomId
            )

        if (!game) {
            return {
                success: false,
                error:
                    "GAME_NOT_FOUND",
            }
        }

        if (
            game.phase !==
            "choose-word"
        ) {
            return {
                success: false,
                error:
                    "NOT_CHOOSING_WORD",
            }
        }

        if (
            game.drawerId !==
            playerId
        ) {
            return {
                success: false,
                error:
                    "ONLY_DRAWER_CAN_SELECT",
            }
        }

        const normalizedWord =
            String(
                word || ""
            )
                .trim()
                .toLowerCase()

        if (
            !game.wordOptions.includes(
                normalizedWord
            )
        ) {
            return {
                success: false,
                error:
                    "INVALID_WORD",
            }
        }

        this.clearTimers(
            game
        )

        game.word =
            normalizedWord

        game.wordOptions =
            []

        game.phase =
            "draw-and-guess"

        game.guessedPlayers =
            new Set()

        game.guessMessages =
            []

        game.hint =
            this.createHiddenHint(
                normalizedWord
            )

        game.hintRevealed =
            false

        game.strokes =
            []

        game.phaseEndsAt =
            Date.now() +
            game.drawingTime *
            1000

        game.timer =
            setTimeout(
                () => {
                    if (
                        game.phase !==
                        "draw-and-guess"
                    ) {
                        return
                    }

                    this.finishTurn(
                        game
                    )

                    if (
                        onPhaseChange
                    ) {
                        onPhaseChange(
                            game
                        )
                    }
                },
                game.drawingTime *
                1000
            )

        game.hintTimer =
            setTimeout(
                () => {
                    if (
                        game.phase !==
                        "draw-and-guess"
                    ) {
                        return
                    }

                    this.revealHintCharacters(
                        game
                    )

                    game.hintRevealed =
                        true

                    if (
                        onPhaseChange
                    ) {
                        onPhaseChange(
                            game
                        )
                    }
                },
                HINT_DELAY *
                1000
            )

        if (
            onPhaseChange
        ) {
            onPhaseChange(
                game
            )
        }

        return {
            success: true,
            game,
        }
    }

    submitGuess(
        roomId,
        playerId,
        guess
    ) {
        const game =
            this.getGame(
                roomId
            )

        if (!game) {
            return {
                success: false,
                error:
                    "GAME_NOT_FOUND",
            }
        }

        if (
            game.phase !==
            "draw-and-guess"
        ) {
            return {
                success: false,
                error:
                    "NOT_DRAWING_PHASE",
            }
        }

        if (
            game.drawerId ===
            playerId
        ) {
            return {
                success: false,
                error:
                    "DRAWER_CANNOT_GUESS",
            }
        }

        if (
            game.guessedPlayers.has(
                playerId
            )
        ) {
            return {
                success: true,
                correct: false,
                alreadyGuessed:
                    true,
            }
        }

        const normalizedGuess =
            String(
                guess || ""
            )
                .trim()
                .toLowerCase()

        if (
            !normalizedGuess
        ) {
            return {
                success: false,
                error:
                    "EMPTY_GUESS",
            }
        }

        const correct =
            normalizedGuess ===
            game.word
                .trim()
                .toLowerCase()

        if (!correct) {
            game.guessMessages.push(
                {
                    playerId,

                    message:
                        String(
                            guess || ""
                        ).trim(),

                    correct: false,

                    timestamp:
                        Date.now(),
                }
            )

            return {
                success: true,
                correct: false,
                alreadyGuessed:
                    false,
            }
        }

        game.guessedPlayers.add(
            playerId
        )

        const remainingSeconds =
            Math.max(
                0,
                Math.ceil(
                    (
                        game.phaseEndsAt -
                        Date.now()
                    ) / 1000
                )
            )

        const guesserPoints =
            100 +
            remainingSeconds

        game.scores[playerId] =
            (
                game.scores[playerId] ||
                0
            ) + guesserPoints

        game.scores[
            game.drawerId
        ] =
            (
                game.scores[
                game.drawerId
                ] || 0
            ) + 50

        game.guessMessages.push(
            {
                playerId,

                message:
                    "guessed the word!",

                correct: true,

                timestamp:
                    Date.now(),
            }
        )

        const allPlayersGuessed =
            game.guessedPlayers.size >=
            game.playerIds.length - 1

        return {
            success: true,

            correct: true,

            points:
                guesserPoints,

            drawerPoints:
                50,

            allGuessed:
                allPlayersGuessed,
        }
    }

    addStroke(
        roomId,
        playerId,
        stroke
    ) {
        const game =
            this.getGame(
                roomId
            )

        if (!game) {
            return {
                success: false,
                error:
                    "GAME_NOT_FOUND",
            }
        }

        if (
            game.phase !==
            "draw-and-guess"
        ) {
            return {
                success: false,
                error:
                    "NOT_DRAWING_PHASE",
            }
        }

        if (
            game.drawerId !==
            playerId
        ) {
            return {
                success: false,
                error:
                    "ONLY_DRAWER_CAN_DRAW",
            }
        }

        if (
            !stroke ||
            !Array.isArray(
                stroke.points
            ) ||
            stroke.points.length <
            2
        ) {
            return {
                success: false,
                error:
                    "INVALID_STROKE",
            }
        }

        const safeStroke = {
            points:
                stroke.points
                    .slice(0, 100)
                    .map(
                        (point) => ({
                            x: Math.min(
                                1,
                                Math.max(
                                    0,
                                    Number(
                                        point.x
                                    ) || 0
                                )
                            ),

                            y: Math.min(
                                1,
                                Math.max(
                                    0,
                                    Number(
                                        point.y
                                    ) || 0
                                )
                            ),
                        })
                    ),

            color:
                String(
                    stroke.color ||
                    "#000000"
                ),

            size:
                Math.max(
                    1,
                    Math.min(
                        50,
                        Number(
                            stroke.size
                        ) || 5
                    )
                ),

            mode:
                stroke.mode ===
                    "erase"
                    ? "erase"
                    : "draw",
        }

        game.strokes.push(
            safeStroke
        )

        if (
            game.strokes.length >
            5000
        ) {
            game.strokes.shift()
        }

        return {
            success: true,

            stroke:
                safeStroke,
        }
    }

    clearDrawing(
        roomId,
        playerId
    ) {
        const game =
            this.getGame(
                roomId
            )

        if (!game) {
            return {
                success: false,
                error:
                    "GAME_NOT_FOUND",
            }
        }

        if (
            game.phase !==
            "draw-and-guess"
        ) {
            return {
                success: false,
                error:
                    "NOT_DRAWING_PHASE",
            }
        }

        if (
            game.drawerId !==
            playerId
        ) {
            return {
                success: false,
                error:
                    "ONLY_DRAWER_CAN_CLEAR",
            }
        }

        game.strokes =
            []

        return {
            success: true,
        }
    }

    finishTurn(game) {
        if (!game) {
            return
        }

        this.clearTimers(
            game
        )

        if (
            game.turnIndex <
            game.playerIds.length -
            1
        ) {
            game.turnIndex +=
                1

            game.drawerId =
                game.playerIds[
                game.turnIndex
                ]

            game.round =
                game.turnIndex + 1

            this.startChooseWord(
                game
            )

            return
        }

        game.phase =
            "game-result"

        game.word =
            ""

        game.wordOptions =
            []

        game.phaseEndsAt =
            0

        game.hint =
            ""

        game.strokes =
            []
    }

    removePlayer(
        roomId,
        playerId
    ) {
        const game =
            this.getGame(
                roomId
            )

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

        if (
            index === -1
        ) {
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

        if (
            game.playerIds.length <
            2
        ) {
            game.phase =
                "game-result"

            this.clearTimers(
                game
            )

            return {
                changed: true,
                game,
            }
        }

        if (
            index <
            game.turnIndex
        ) {
            game.turnIndex -=
                1
        }

        if (
            game.turnIndex >=
            game.playerIds.length
        ) {
            game.turnIndex =
                0
        }

        const drawerWasRemoved =
            game.drawerId ===
            playerId

        if (
            drawerWasRemoved
        ) {
            game.drawerId =
                game.playerIds[
                game.turnIndex
                ]

            game.round =
                game.turnIndex + 1

            this.startChooseWord(
                game
            )
        }

        game.totalRounds =
            game.playerIds.length

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

        if (
            index === -1
        ) {
            return
        }

        game.playerIds[index] =
            newPlayerId

        game.scores[
            newPlayerId
        ] =
            game.scores[
            oldPlayerId
            ] || 0

        delete game.scores[
            oldPlayerId
        ]

        if (
            game.drawerId ===
            oldPlayerId
        ) {
            game.drawerId =
                newPlayerId
        }

        const newGuessedPlayers =
            new Set()

        for (
            const playerId of
            game.guessedPlayers
        ) {
            newGuessedPlayers.add(
                playerId ===
                    oldPlayerId
                    ? newPlayerId
                    : playerId
            )
        }

        game.guessedPlayers =
            newGuessedPlayers
    }

    getPublicState(game) {
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

            wordLength:
                game.word
                    ? game.word.length
                    : 0,

            hint:
                game.phase ===
                    "draw-and-guess"
                    ? game.hint
                    : "",

            guessedCount:
                game.guessedPlayers.size,

            guessablePlayers:
                Math.max(
                    0,
                    game.playerIds.length -
                    1
                ),

            scores:
                game.scores,

            phaseEndsAt:
                game.phaseEndsAt,
        }
    }
}

module.exports = {
    GameManager,
}