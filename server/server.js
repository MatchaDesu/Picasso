const express = require("express")
const cors = require("cors")
const http = require("http")
const { Server } = require("socket.io")

const app = express()
const server = http.createServer(app)

const PORT = 3000

app.use(cors())
app.use(express.json())

const io = new Server(server, {
  cors: {
    origin: "http://localhost:5173",
    methods: ["GET", "POST"],
  },
})

const rooms = []
const roomTimers = new Map()

const wordCategories = {
  Animals: [
    { word: "SLEEPING CAT", hint: "Animal, 2 words" },
    { word: "RED FOX", hint: "Animal, 2 words" },
    { word: "FAT PANDA", hint: "Animal, 2 words" },
    { word: "BLUE BIRD", hint: "Animal, 2 words" },
    { word: "BABY TIGER", hint: "Animal, 2 words" },
    { word: "GOLDEN FISH", hint: "Animal, 2 words" },
    { word: "WHITE RABBIT", hint: "Animal, 2 words" },
  ],

  Food: [
    { word: "PIZZA", hint: "Food, 1 word" },
    { word: "ICE CREAM", hint: "Dessert, 2 words" },
    { word: "FRIED RICE", hint: "Food, 2 words" },
    { word: "HAMBURGER", hint: "Food, 1 word" },
    { word: "HOT DOG", hint: "Food, 2 words" },
    { word: "DONUT", hint: "Dessert, 1 word" },
  ],

  Nature: [
    { word: "RAINBOW", hint: "Nature, 1 word" },
    { word: "SUNFLOWER", hint: "Nature, 1 word" },
    { word: "WATERFALL", hint: "Nature, 1 word" },
    { word: "VOLCANO", hint: "Nature, 1 word" },
    { word: "MOUNTAIN", hint: "Nature, 1 word" },
  ],

  Objects: [
    { word: "TELEPHONE", hint: "Object, 1 word" },
    { word: "UMBRELLA", hint: "Object, 1 word" },
    { word: "TOOTHBRUSH", hint: "Object, 1 word" },
    { word: "BACKPACK", hint: "Object, 1 word" },
    { word: "CAMERA", hint: "Object, 1 word" },
  ],
}

/*
|--------------------------------------------------------------------------
| Random Word
|--------------------------------------------------------------------------
*/

function getRandomWord(category) {
  let words = wordCategories[category]

  if (!words || words.length === 0) {
    words = Object.values(wordCategories).flat()
  }

  const randomIndex = Math.floor(
    Math.random() * words.length
  )

  return words[randomIndex]
}

/*
|--------------------------------------------------------------------------
| Get 3 Word Choices
|--------------------------------------------------------------------------
*/

function getWordChoices(category) {
  let words = wordCategories[category]

  if (!words || words.length < 3) {
    words = Object.values(wordCategories).flat()
  }

  const shuffled = [...words].sort(
    () => Math.random() - 0.5
  )

  return shuffled.slice(0, 3)
}

/*
|--------------------------------------------------------------------------
| Generate Room Code
|--------------------------------------------------------------------------
*/

function generateRoomCode() {
  const characters =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"

  let code = ""

  for (let i = 0; i < 4; i++) {
    code += characters.charAt(
      Math.floor(
        Math.random() *
          characters.length
      )
    )
  }

  return code
}

/*
|--------------------------------------------------------------------------
| Find Room
|--------------------------------------------------------------------------
*/

function getRoomByCode(code) {
  return rooms.find(
    (room) =>
      room.code ===
      code.toUpperCase()
  )
}

/*
|--------------------------------------------------------------------------
| Public Room
|
| currentWord is NEVER sent to everyone.
|--------------------------------------------------------------------------
*/

function getPublicRoom(room) {
  if (!room) return null

  return {
    id: room.id,
    code: room.code,
    name: room.name,

    drawingTime:
      room.drawingTime,

    rounds:
      room.rounds,

    category:
      room.category,

    maxPlayers:
      room.maxPlayers,

    players:
      room.players,

    status:
      room.status,

    phase:
      room.phase,

    currentRound:
      room.currentRound,

    artistId:
      room.artistId,

    roundStartedAt:
      room.roundStartedAt,

    roundEndsAt:
      room.roundEndsAt,

    currentHint:
      room.currentHint,

    correctGuessers:
      room.correctGuessers,
  }
}

/*
|--------------------------------------------------------------------------
| Broadcast Players
|--------------------------------------------------------------------------
*/

function broadcastPlayers(room) {
  if (!room) return

  console.log(
    `Broadcast players in room ${room.code}:`,
    room.players.map(
      (player) => player.name
    )
  )

  io.to(room.code).emit(
    "playersUpdated",
    {
      players:
        room.players,
    }
  )
}

/*
|--------------------------------------------------------------------------
| Clear Timer
|--------------------------------------------------------------------------
*/

function clearRoomTimer(roomCode) {
  const timer =
    roomTimers.get(roomCode)

  if (timer) {
    clearInterval(timer)

    roomTimers.delete(
      roomCode
    )
  }
}

/*
|--------------------------------------------------------------------------
| Select Next Artist
|--------------------------------------------------------------------------
*/

function getNextArtist(room) {
  const players =
    room.players

  if (
    players.length === 0
  ) {
    return null
  }

  /*
  | Prefer someone who was NOT the previous artist.
  */

  const availablePlayers =
    players.filter(
      (player) =>
        player.id !==
        room.artistId
    )

  const candidates =
    availablePlayers.length > 0
      ? availablePlayers
      : players

  const randomIndex =
    Math.floor(
      Math.random() *
        candidates.length
    )

  return candidates[
    randomIndex
  ]
}

/*
|--------------------------------------------------------------------------
| START ROUND
|
| This does NOT start the timer.
|
| It starts the Choosing Word phase.
|--------------------------------------------------------------------------
*/

function startRound(room) {
  if (!room) return

  if (
    room.players.length === 0
  ) {
    return
  }

  const artist =
    getNextArtist(room)

  if (!artist) {
    return
  }

  clearRoomTimer(
    room.code
  )

  room.artistId =
    artist.id

  room.currentWord =
    null

  room.currentHint =
    null

  room.currentChoices =
    getWordChoices(
      room.category
    )

  room.correctGuessers =
    []

  room.phase =
    "choosing"

  room.roundStartedAt =
    null

  room.roundEndsAt =
    null

  console.log(
    `Round ${room.currentRound} choosing in room ${room.code}`
  )

  console.log(
    `Artist: ${artist.name}`
  )

  console.log(
    "Word choices:",
    room.currentChoices.map(
      (item) =>
        item.word
    )
  )

  /*
  |--------------------------------------------------------------------------
  | Tell everyone that the artist is choosing
  |--------------------------------------------------------------------------
  */

  io.to(room.code).emit(
    "roundChoosing",
    {
      room:
        getPublicRoom(room),

      currentRound:
        room.currentRound,

      artistId:
        room.artistId,
    }
  )

  /*
  |--------------------------------------------------------------------------
  | Only artist gets the actual choices
  |--------------------------------------------------------------------------
  */

  io.to(room.artistId).emit(
    "wordChoices",
    {
      choices:
        room.currentChoices,
    }
  )
}

/*
|--------------------------------------------------------------------------
| START DRAWING
|
| Called AFTER artist selects a word.
|--------------------------------------------------------------------------
*/

function startDrawingPhase(
  room,
  selectedWord
) {
  if (!room) return

  if (
    room.phase !==
    "choosing"
  ) {
    return
  }

  if (
    !selectedWord ||
    !selectedWord.word
  ) {
    return
  }

  /*
  |--------------------------------------------------------------------------
  | Make sure selected word came from the 3 choices
  |--------------------------------------------------------------------------
  */

  const validChoice =
    room.currentChoices.find(
      (choice) =>
        choice.word ===
        selectedWord.word
    )

  if (!validChoice) {
    return
  }

  room.currentWord =
    validChoice.word

  room.currentHint =
    validChoice.hint

  room.currentChoices =
    []

  room.correctGuessers =
    []

  room.phase =
    "drawing"

  const now =
    Date.now()

  room.roundStartedAt =
    now

  room.roundEndsAt =
    now +
    room.drawingTime *
      1000

  console.log(
    `Drawing started in room ${room.code}`
  )

  console.log(
    `Artist: ${room.artistId}`
  )

  console.log(
    `Word: ${room.currentWord}`
  )

  /*
  |--------------------------------------------------------------------------
  | Tell everyone drawing has started
  |--------------------------------------------------------------------------
  */

  io.to(room.code).emit(
    "roundStarted",
    {
      room:
        getPublicRoom(room),

      currentRound:
        room.currentRound,

      artistId:
        room.artistId,

      roundStartedAt:
        room.roundStartedAt,

      roundEndsAt:
        room.roundEndsAt,

      hint:
        room.currentHint,

      wordLength:
        room.currentWord.length,
    }
  )

  /*
  |--------------------------------------------------------------------------
  | Only artist gets the answer
  |--------------------------------------------------------------------------
  */

  io.to(room.artistId).emit(
    "artistWord",
    {
      word:
        room.currentWord,
    }
  )

  /*
  |--------------------------------------------------------------------------
  | Clear canvas
  |--------------------------------------------------------------------------
  */

  io.to(room.code).emit(
    "clearCanvas"
  )

  /*
  |--------------------------------------------------------------------------
  | Start server timer
  |--------------------------------------------------------------------------
  */

  clearRoomTimer(
    room.code
  )

  const timer =
    setInterval(() => {
      const currentRoom =
        getRoomByCode(
          room.code
        )

      if (!currentRoom) {
        clearRoomTimer(
          room.code
        )

        return
      }

      /*
      | Stop if phase changed
      */

      if (
        currentRoom.phase !==
        "drawing"
      ) {
        clearRoomTimer(
          room.code
        )

        return
      }

      const remaining =
        currentRoom.roundEndsAt -
        Date.now()

      if (
        remaining <= 0
      ) {
        clearRoomTimer(
          room.code
        )

        nextRound(
          currentRoom
        )
      }
    }, 250)

  roomTimers.set(
    room.code,
    timer
  )
}

/*
|--------------------------------------------------------------------------
| NEXT ROUND
|--------------------------------------------------------------------------
*/

function nextRound(room) {
  if (!room) return

  clearRoomTimer(
    room.code
  )

  /*
  |--------------------------------------------------------------------------
  | Game finished
  |--------------------------------------------------------------------------
  */

  if (
    room.currentRound >=
    room.rounds
  ) {
    room.status =
      "finished"

    room.phase =
      "finished"

    room.artistId =
      null

    room.currentWord =
      null

    room.currentHint =
      null

    room.currentChoices =
      []

    room.roundStartedAt =
      null

    room.roundEndsAt =
      null

    console.log(
      `Game finished in room ${room.code}`
    )

    io.to(room.code).emit(
      "gameFinished",
      {
        room:
          getPublicRoom(room),
      }
    )

    return
  }

  /*
  |--------------------------------------------------------------------------
  | Next player / round
  |--------------------------------------------------------------------------
  */

  room.currentRound += 1

  startRound(room)
}

/*
|--------------------------------------------------------------------------
| API
|--------------------------------------------------------------------------
*/

app.get("/", (req, res) => {
  res.send(
    "Picasso Server is running!"
  )
})

app.get(
  "/api/rooms",
  (req, res) => {
    res.json({
      success: true,
      rooms,
    })
  }
)

app.post(
  "/api/rooms",
  (req, res) => {
    const {
      roomName,
      drawingTime,
      rounds,
      category,
      maxPlayers,
    } = req.body

    if (
      !roomName ||
      !roomName.trim()
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Room name is required",
      })
    }

    let code =
      generateRoomCode()

    while (
      getRoomByCode(code)
    ) {
      code =
        generateRoomCode()
    }

    const room = {
      id:
        Date.now().toString(),

      code,

      name:
        roomName.trim(),

      drawingTime:
        drawingTime || 60,

      rounds:
        rounds || 5,

      category:
        category || "Animals",

      maxPlayers:
        maxPlayers || 8,

      players: [],

      status:
        "waiting",

      phase:
        "waiting",

      currentRound:
        0,

      artistId:
        null,

      roundStartedAt:
        null,

      roundEndsAt:
        null,

      currentWord:
        null,

      currentHint:
        null,

      currentChoices:
        [],

      correctGuessers:
        [],
    }

    rooms.push(room)

    console.log(
      `Room created: ${room.code}`
    )

    res.status(201).json({
      success: true,

      room:
        getPublicRoom(room),
    })
  }
)

app.get(
  "/api/rooms/:code",
  (req, res) => {
    const room =
      getRoomByCode(
        req.params.code
      )

    if (!room) {
      return res.status(404).json({
        success: false,
        message:
          "Room not found",
      })
    }

    res.json({
      success: true,

      room:
        getPublicRoom(room),
    })
  }
)

/*
|--------------------------------------------------------------------------
| Socket.IO
|--------------------------------------------------------------------------
*/

io.on(
  "connection",
  (socket) => {
    console.log(
      "User connected:",
      socket.id
    )

    /*
    |--------------------------------------------------------------------------
    | Join Room
    |--------------------------------------------------------------------------
    */

    socket.on(
      "joinRoom",
      ({
        roomCode,
        player,
      }) => {
        const room =
          getRoomByCode(
            roomCode
          )

        if (!room) {
          socket.emit(
            "roomError",
            {
              message:
                "Room not found",
            }
          )

          return
        }

        /*
        | Already joined
        */

        const existingPlayer =
          room.players.find(
            (item) =>
              item.id ===
              socket.id
          )

        if (existingPlayer) {
          console.log(
            `${socket.id} already joined room ${room.code}`
          )

          socket.roomCode =
            room.code

          socket.join(
            room.code
          )

          socket.emit(
            "roomJoined",
            {
              room:
                getPublicRoom(
                  room
                ),
            }
          )

          broadcastPlayers(
            room
          )

          return
        }

        /*
        | Do not allow new players after game starts.
        */

        if (
          room.status !==
          "waiting"
        ) {
          socket.emit(
            "roomError",
            {
              message:
                "Game has already started",
            }
          )

          return
        }

        /*
        | Room full
        */

        if (
          room.players.length >=
          room.maxPlayers
        ) {
          socket.emit(
            "roomError",
            {
              message:
                "Room is full",
            }
          )

          return
        }

        const newPlayer = {
          id:
            socket.id,

          name:
            player?.name ||
            "Player",

          fur:
            player?.fur ||
            "default",

          ears:
            player?.ears ||
            "default",

          costume:
            player?.costume ||
            "default",

          isHost:
            room.players.length ===
            0,

          score:
            0,
        }

        room.players.push(
          newPlayer
        )

        socket.join(
          room.code
        )

        socket.roomCode =
          room.code

        console.log(
          `${newPlayer.name} joined room ${room.code}`
        )

        console.log(
          "Current players:",
          room.players.map(
            (player) =>
              `${player.name} (${player.id})`
          )
        )

        socket.emit(
          "roomJoined",
          {
            room:
              getPublicRoom(
                room
              ),
          }
        )

        broadcastPlayers(
          room
        )

        socket
          .to(room.code)
          .emit(
            "playerJoined",
            {
              player:
                newPlayer,
            }
          )
      }
    )

    /*
    |--------------------------------------------------------------------------
    | Start Game
    |--------------------------------------------------------------------------
    */

    socket.on(
      "startGame",
      () => {
        if (
          !socket.roomCode
        ) {
          return
        }

        const room =
          getRoomByCode(
            socket.roomCode
          )

        if (!room) {
          return
        }

        const player =
          room.players.find(
            (item) =>
              item.id ===
              socket.id
          )

        if (!player) {
          return
        }

        if (
          !player.isHost
        ) {
          socket.emit(
            "roomError",
            {
              message:
                "Only the host can start the game",
            }
          )

          return
        }

        if (
          room.players.length <
          4
        ) {
          socket.emit(
            "roomError",
            {
              message:
                "At least 4 players are required",
            }
          )

          return
        }

        room.status =
          "playing"

        room.currentRound =
          1

        room.artistId =
          null

        startRound(room)
      }
    )

    /*
    |--------------------------------------------------------------------------
    | Artist Selects Word
    |--------------------------------------------------------------------------
    */

    socket.on(
      "selectWord",
      ({
        word,
        hint,
      }) => {
        if (
          !socket.roomCode
        ) {
          return
        }

        const room =
          getRoomByCode(
            socket.roomCode
          )

        if (!room) {
          return
        }

        if (
          room.status !==
          "playing"
        ) {
          return
        }

        if (
          room.phase !==
          "choosing"
        ) {
          return
        }

        if (
          room.artistId !==
          socket.id
        ) {
          return
        }

        const selectedWord =
          room.currentChoices.find(
            (choice) =>
              choice.word ===
              word
          )

        if (!selectedWord) {
          socket.emit(
            "roomError",
            {
              message:
                "Invalid word choice",
            }
          )

          return
        }

        startDrawingPhase(
          room,
          selectedWord
        )
      }
    )

    /*
    |--------------------------------------------------------------------------
    | Drawing
    |--------------------------------------------------------------------------
    */

    socket.on(
      "draw",
      (data) => {
        if (
          !socket.roomCode
        ) {
          return
        }

        const room =
          getRoomByCode(
            socket.roomCode
          )

        if (!room) {
          return
        }

        if (
          room.status !==
          "playing"
        ) {
          return
        }

        if (
          room.phase !==
          "drawing"
        ) {
          return
        }

        if (
          room.artistId !==
          socket.id
        ) {
          return
        }

        socket
          .to(room.code)
          .emit(
            "draw",
            data
          )
      }
    )

    /*
    |--------------------------------------------------------------------------
    | Clear Canvas
    |--------------------------------------------------------------------------
    */

    socket.on(
      "clearCanvas",
      () => {
        if (
          !socket.roomCode
        ) {
          return
        }

        const room =
          getRoomByCode(
            socket.roomCode
          )

        if (!room) {
          return
        }

        if (
          room.status !==
          "playing"
        ) {
          return
        }

        if (
          room.phase !==
          "drawing"
        ) {
          return
        }

        if (
          room.artistId !==
          socket.id
        ) {
          return
        }

        socket
          .to(room.code)
          .emit(
            "clearCanvas"
          )
      }
    )

    /*
    |--------------------------------------------------------------------------
    | Guess
    |--------------------------------------------------------------------------
    */

    socket.on(
      "guess",
      ({
        guess,
      }) => {
        if (
          !socket.roomCode
        ) {
          return
        }

        const room =
          getRoomByCode(
            socket.roomCode
          )

        if (!room) {
          return
        }

        if (
          room.status !==
          "playing"
        ) {
          return
        }

        if (
          room.phase !==
          "drawing"
        ) {
          return
        }

        if (
          room.artistId ===
          socket.id
        ) {
          return
        }

        if (
          !room.currentWord
        ) {
          return
        }

        if (
          room.correctGuessers.includes(
            socket.id
          )
        ) {
          return
        }

        if (
          typeof guess !==
          "string"
        ) {
          return
        }

        const cleanGuess =
          guess
            .trim()
            .toUpperCase()

        if (!cleanGuess) {
          return
        }

        const correctWord =
          room.currentWord
            .trim()
            .toUpperCase()

        const player =
          room.players.find(
            (item) =>
              item.id ===
              socket.id
          )

        if (!player) {
          return
        }

        /*
        |--------------------------------------------------------------------------
        | Correct
        |--------------------------------------------------------------------------
        */

        if (
          cleanGuess ===
          correctWord
        ) {
          room.correctGuessers.push(
            socket.id
          )

          const timeLeft =
            Math.max(
              0,
              room.roundEndsAt -
                Date.now()
            )

          const maxTime =
            room.drawingTime *
            1000

          const score =
            Math.max(
              100,
              Math.round(
                500 +
                  (timeLeft /
                    maxTime) *
                    500
              )
            )

          if (
            typeof player.score !==
            "number"
          ) {
            player.score = 0
          }

          player.score +=
            score

          socket.emit(
            "correctGuess",
            {
              score,
            }
          )

          io.to(
            room.code
          ).emit(
            "playerGuessedCorrectly",
            {
              playerId:
                player.id,

              playerName:
                player.name,
            }
          )

          broadcastPlayers(
            room
          )

          /*
          | Check whether everyone has guessed.
          */

          const guessers =
            room.players.filter(
              (item) =>
                item.id !==
                room.artistId
            )

          const allGuessed =
            guessers.length >
              0 &&
            guessers.every(
              (item) =>
                room.correctGuessers.includes(
                  item.id
                )
            )

          if (
            allGuessed
          ) {
            clearRoomTimer(
              room.code
            )

            nextRound(
              room
            )
          }

          return
        }

        /*
        |--------------------------------------------------------------------------
        | Wrong Guess
        |--------------------------------------------------------------------------
        */

        io.to(
          room.code
        ).emit(
          "playerGuess",
          {
            playerId:
              player.id,

            playerName:
              player.name,

            guess:
              guess.trim(),

            correct:
              false,
          }
        )
      }
    )

    /*
    |--------------------------------------------------------------------------
    | Leave Room
    |--------------------------------------------------------------------------
    */

    socket.on(
      "leaveRoom",
      () => {
        leaveRoom(
          socket
        )
      }
    )

    /*
    |--------------------------------------------------------------------------
    | Disconnect
    |--------------------------------------------------------------------------
    */

    socket.on(
      "disconnect",
      () => {
        console.log(
          "User disconnected:",
          socket.id
        )

        leaveRoom(
          socket
        )
      }
    )
  }
)

/*
|--------------------------------------------------------------------------
| Leave Room
|--------------------------------------------------------------------------
*/

function leaveRoom(socket) {
  if (
    !socket.roomCode
  ) {
    return
  }

  const room =
    getRoomByCode(
      socket.roomCode
    )

  if (!room) {
    return
  }

  const playerIndex =
    room.players.findIndex(
      (player) =>
        player.id ===
        socket.id
    )

  if (
    playerIndex === -1
  ) {
    return
  }

  const leavingPlayer =
    room.players[
      playerIndex
    ]

  const wasArtist =
    room.artistId ===
    leavingPlayer.id

  room.players.splice(
    playerIndex,
    1
  )

  /*
  |--------------------------------------------------------------------------
  | Give host to next player
  |--------------------------------------------------------------------------
  */

  if (
    leavingPlayer.isHost &&
    room.players.length > 0
  ) {
    room.players[0].isHost =
      true
  }

  /*
  |--------------------------------------------------------------------------
  | Artist left during game
  |--------------------------------------------------------------------------
  */

  if (
    wasArtist &&
    room.status ===
      "playing"
  ) {
    room.artistId =
      null

    clearRoomTimer(
      room.code
    )

    /*
    | If enough players remain,
    | restart the current round with another artist.
    */

    if (
      room.players.length >=
      2
    ) {
      startRound(room)
    }
  }

  broadcastPlayers(
    room
  )

  io.to(
    room.code
  ).emit(
    "playerLeft",
    {
      playerId:
        leavingPlayer.id,
    }
  )

  console.log(
    `${leavingPlayer.name} left room ${room.code}`
  )

  /*
  |--------------------------------------------------------------------------
  | Delete empty room
  |--------------------------------------------------------------------------
  */

  if (
    room.players.length ===
    0
  ) {
    clearRoomTimer(
      room.code
    )

    const roomIndex =
      rooms.findIndex(
        (item) =>
          item.code ===
          room.code
      )

    if (
      roomIndex !== -1
    ) {
      rooms.splice(
        roomIndex,
        1
      )
    }

    console.log(
      `Room ${room.code} deleted`
    )
  }

  socket.roomCode =
    null
}

server.listen(
  PORT,
  () => {
    console.log(
      `Server running on http://localhost:${PORT}`
    )
  }
)