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

const WORD_CHOICE_TIME = 10
const MIN_PLAYERS_TO_CONTINUE = 2
const EMPTY_ROOM_TTL = 2 * 60 * 1000
const ROOM_CLEANUP_INTERVAL = 30 * 1000
const QUICK_MATCH_GRACE = 30 * 1000

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

function generateRoomCode() {
  const characters =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"

  let code = ""

  for (let i = 0; i < 4; i++) {
    code += characters.charAt(
      Math.floor(
        Math.random() * characters.length
      )
    )
  }

  return code
}

function getRoomByCode(code) {
  if (!code) {
    return null
  }

  return rooms.find(
    (room) =>
      room.code === code.toUpperCase()
  )
}

/*
 * =========================================================
 * Public room data
 * =========================================================
 *
 * currentWord และ currentChoices จะไม่ถูกส่งออกไป
 * เพื่อไม่ให้คนทายเห็นคำตอบ
 */
function getPublicRoom(room) {
  if (!room) {
    return null
  }

  return {
    id: room.id,
    code: room.code,
    name: room.name,
    drawingTime: room.drawingTime,
    rounds: room.rounds,
    category: room.category,
    maxPlayers: room.maxPlayers,
    players: room.players,
    status: room.status,
    phase: room.phase,
    currentRound: room.currentRound,
    artistId: room.artistId,
    artistIndex: room.artistIndex,
    roundStartedAt: room.roundStartedAt,
    roundEndsAt: room.roundEndsAt,
    currentHint: room.currentHint,
    correctGuessers: room.correctGuessers,
    gameStartedAt: room.gameStartedAt,
    gameFinishedAt: room.gameFinishedAt,
    matchDurationMs: room.matchDurationMs,
  }
}

function broadcastPlayers(room) {
  if (!room) {
    return
  }

  console.log(
    `Broadcast players in room ${room.code}:`,
    room.players.map(
      (player) => player.name
    )
  )

  io.to(room.code).emit(
    "playersUpdated",
    {
      players: room.players,
    }
  )
}

/*
 * =========================================================
 * Timer
 * =========================================================
 */
function clearRoomTimer(roomCode) {
  const timer = roomTimers.get(roomCode)

  if (!timer) {
    return
  }

  clearTimeout(timer)
  clearInterval(timer)

  roomTimers.delete(roomCode)
}

/*
 * =========================================================
 * Guess state
 * =========================================================
 */
function haveAllGuessersGuessed(room) {
  if (!room) {
    return false
  }

  const guessers = room.players.filter(
    (player) =>
      player.id !== room.artistId
  )

  if (guessers.length === 0) {
    return false
  }

  return guessers.every(
    (player) =>
      room.correctGuessers.includes(
        player.id
      )
  )
}

/*
 * =========================================================
 * Start round
 * =========================================================
 *
 * round:
 *
 * Round 1
 *   Player A draws
 *   Player B draws
 *   Player C draws
 *   Player D draws
 *
 * Round 2
 *   Player A draws
 *   Player B draws
 *   ...
 *
 * drawnThisRound เก็บคนที่วาดไปแล้ว
 */
function startRound(room) {
  if (!room) {
    return
  }

  if (room.status !== "playing") {
    return
  }

  if (room.players.length === 0) {
    return
  }

  /*
   * ป้องกันการเรียก startRound ซ้ำ
   */
  if (room.roundTransitioning) {
    return
  }

  /*
   * ถ้าจำนวนผู้เล่นต่ำเกินไป
   */
  if (
    room.players.length <
    MIN_PLAYERS_TO_CONTINUE
  ) {
    finishGame(room)
    return
  }

  /*
   * หา player คนแรกที่ยังไม่ได้วาด
   */
  let artist = room.players.find(
    (player) =>
      !room.drawnThisRound.includes(
        player.id
      )
  )

  /*
   * ถ้าทุกคนวาดครบแล้ว
   */
  if (!artist) {
    if (
      room.currentRound >=
      room.rounds
    ) {
      finishGame(room)
      return
    }

    /*
     * ขึ้น round ใหม่
     */
    room.currentRound += 1

    room.drawnThisRound = []

    artist = room.players[0]
  }

  if (!artist) {
    return
  }

  /*
   * เริ่ม transition
   */
  room.roundTransitioning = true

  clearRoomTimer(room.code)

  /*
   * เพิ่ม artist เข้า list คนที่วาดแล้ว
   */
  if (
    !room.drawnThisRound.includes(
      artist.id
    )
  ) {
    room.drawnThisRound.push(
      artist.id
    )
  }

  room.artistIndex =
    room.players.findIndex(
      (player) =>
        player.id === artist.id
    )

  room.artistId = artist.id

  room.currentWord = null
  room.currentHint = null

  room.currentChoices =
    getWordChoices(
      room.category
    )

  room.correctGuessers = []

  room.phase = "choosing"

  room.roundStartedAt = null
  room.roundEndsAt = null

  /*
   * token ใหม่สำหรับ turn นี้
   *
   * timer เก่าจะไม่มีสิทธิ์ทำงาน
   */
  room.turnToken += 1

  const currentTurnToken =
    room.turnToken

  console.log(
    `Round ${room.currentRound} choosing in room ${room.code}`
  )

  console.log(
    `Artist: ${artist.name}`
  )

  console.log(
    "Word choices:",
    room.currentChoices.map(
      (item) => item.word
    )
  )

  io.to(room.code).emit(
    "roundChoosing",
    {
      room: getPublicRoom(room),
      currentRound:
        room.currentRound,
      artistId:
        room.artistId,
    }
  )

  io.to(room.artistId).emit(
    "wordChoices",
    {
      choices:
        room.currentChoices,
    }
  )

  /*
   * หลังตั้ง state และ emit แล้ว
   * จบ transition
   */
  room.roundTransitioning = false

  /*
   * Timer สำหรับเลือกคำ
   */
  const choiceTimer =
    setTimeout(() => {
      const currentRoom =
        getRoomByCode(
          room.code
        )

      if (!currentRoom) {
        return
      }

      if (
        currentRoom.turnToken !==
        currentTurnToken
      ) {
        return
      }

      if (
        currentRoom.status !==
        "playing"
      ) {
        return
      }

      if (
        currentRoom.phase !==
        "choosing"
      ) {
        return
      }

      if (
        currentRoom.artistId !==
        artist.id
      ) {
        return
      }

      if (
        !currentRoom.currentChoices ||
        currentRoom.currentChoices
          .length === 0
      ) {
        return
      }

      const automaticChoice =
        currentRoom
          .currentChoices[0]

      console.log(
        `Artist did not choose a word in room ${currentRoom.code}`
      )

      console.log(
        `Automatically selecting: ${automaticChoice.word}`
      )

      startDrawingPhase(
        currentRoom,
        automaticChoice
      )
    }, WORD_CHOICE_TIME * 1000)

  roomTimers.set(
    room.code,
    choiceTimer
  )
}

/*
 * =========================================================
 * Start drawing
 * =========================================================
 */
function startDrawingPhase(
  room,
  selectedWord
) {
  if (!room) {
    return
  }

  if (
    room.status !== "playing"
  ) {
    return
  }

  if (
    room.phase !== "choosing"
  ) {
    return
  }

  if (
    room.roundTransitioning
  ) {
    return
  }

  if (
    !selectedWord ||
    !selectedWord.word
  ) {
    return
  }

  const validChoice =
    room.currentChoices.find(
      (choice) =>
        choice.word ===
        selectedWord.word
    )

  if (!validChoice) {
    return
  }

  clearRoomTimer(room.code)

  room.currentWord =
    validChoice.word

  room.currentHint =
    validChoice.hint

  room.currentChoices = []

  room.correctGuessers = []

  room.phase = "drawing"

  const now = Date.now()

  room.roundStartedAt = now

  room.roundEndsAt =
    now +
    room.drawingTime * 1000

  /*
   * token ของ drawing phase
   */
  room.turnToken += 1

  const currentTurnToken =
    room.turnToken

  console.log(
    `Drawing started in room ${room.code}`
  )

  console.log(
    `Artist: ${room.artistId}`
  )

  console.log(
    `Word: ${room.currentWord}`
  )

  const wordPattern =
    room.currentWord
      .split("")
      .map((char) =>
        char === " "
          ? " "
          : "＿"
      )
      .join("")

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

      wordPattern,
    }
  )

  /*
   * เฉพาะ artist เห็นคำเต็ม
   */
  io.to(room.artistId).emit(
    "artistWord",
    {
      word:
        room.currentWord,
    }
  )

  /*
   * ล้าง canvas ทุกคน
   */
  io.to(room.code).emit(
    "clearCanvas"
  )

  /*
   * Drawing timer
   */
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

      if (
        currentRoom.turnToken !==
        currentTurnToken
      ) {
        clearRoomTimer(
          room.code
        )
        return
      }

      if (
        currentRoom.status !==
        "playing"
      ) {
        clearRoomTimer(
          room.code
        )
        return
      }

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

      if (remaining <= 0) {
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
 * =========================================================
 * Finish game
 * =========================================================
 */
function finishGame(room) {
  if (!room) {
    return
  }

  /*
   * สำคัญมาก:
   * ถ้า finishGame ถูกเรียกซ้ำ
   * ไม่ต้อง emit gameFinished ซ้ำ
   */
  if (
    room.status === "finished"
  ) {
    return
  }

  clearRoomTimer(room.code)

  /*
   * ทำให้ timer เก่าทั้งหมดหมดสิทธิ์
   */
  room.turnToken += 1

  room.status = "finished"
  room.phase = "finished"

  room.roundTransitioning =
    false

  room.gameFinishedAt =
    Date.now()

  if (room.gameStartedAt) {
    room.matchDurationMs =
      Math.max(
        0,
        room.gameFinishedAt -
          room.gameStartedAt
      )
  } else {
    room.matchDurationMs = 0
  }

  /*
   * ล้าง turn state
   */
  room.artistId = null
  room.artistIndex = -1

  room.currentWord = null
  room.currentHint = null
  room.currentChoices = []

  room.roundStartedAt = null
  room.roundEndsAt = null

  room.correctGuessers = []
  room.drawnThisRound = []

  console.log(
    `Game finished in room ${room.code}`
  )

  console.log(
    `Match duration: ${room.matchDurationMs} ms`
  )

  /*
   * ส่งผลคะแนนให้ทุกคน
   */
  io.to(room.code).emit(
    "gameFinished",
    {
      room:
        getPublicRoom(room),
    }
  )
}

/*
 * =========================================================
 * Next round / next artist
 * =========================================================
 */
function nextRound(room) {
  if (!room) {
    return
  }

  if (
    room.status !== "playing"
  ) {
    return
  }

  /*
   * ป้องกัน nextRound ถูกเรียกซ้ำ
   * เช่น timer + guess เกิดใกล้กัน
   */
  if (
    room.roundTransitioning
  ) {
    return
  }

  room.roundTransitioning = true

  clearRoomTimer(room.code)

  /*
   * invalidate timer เก่า
   */
  room.turnToken += 1

  console.log(
    `Moving to next turn in room ${room.code}`
  )

  /*
   * เรียก startRound
   *
   * startRound จะ:
   * - หา artist คนถัดไป
   * - ถ้าทุกคนวาดแล้ว → round ใหม่
   * - ถ้าครบ rounds → finishGame
   */
  room.roundTransitioning = false

  startRound(room)
}

/*
 * =========================================================
 * Create room
 * =========================================================
 */
function createRoom({
  roomName,
  drawingTime,
  rounds,
  category,
  maxPlayers,
  isQuickMatch = false,
}) {
  let code =
    generateRoomCode()

  while (getRoomByCode(code)) {
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

    status: "waiting",

    phase: "waiting",

    currentRound: 0,

    artistIndex: -1,

    artistId: null,

    roundStartedAt: null,

    roundEndsAt: null,

    currentWord: null,

    currentHint: null,

    currentChoices: [],

    correctGuessers: [],

    drawnThisRound: [],

    gameStartedAt: null,

    gameFinishedAt: null,

    matchDurationMs: 0,

    createdAt:
      Date.now(),

    isQuickMatch,

    /*
     * ใช้กัน timer / event เก่า
     */
    turnToken: 0,

    /*
     * ใช้กัน transition ซ้ำ
     */
    roundTransitioning: false,
  }

  rooms.push(room)

  console.log(
    `Room created: ${room.code}`
  )

  return room
}

/*
 * =========================================================
 * REST - Create Room
 * =========================================================
 */
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

    const room =
      createRoom({
        roomName,
        drawingTime,
        rounds,
        category,
        maxPlayers,
      })

    res.status(201).json({
      success: true,
      room:
        getPublicRoom(room),
    })
  }
)

/*
 * =========================================================
 * REST - Quick Match
 * =========================================================
 */
app.post(
  "/api/rooms/quick-match",
  (req, res) => {
    const now = Date.now()

    const candidates =
      rooms
        .filter((room) => {
          if (
            room.status !==
            "waiting"
          ) {
            return false
          }

          if (
            room.players.length >=
            room.maxPlayers
          ) {
            return false
          }

          if (
            room.players.length > 0
          ) {
            return true
          }

          return (
            room.isQuickMatch &&
            now -
              room.createdAt <
              QUICK_MATCH_GRACE
          )
        })
        .sort(
          (a, b) =>
            b.players.length -
            a.players.length
        )

    if (
      candidates.length > 0
    ) {
      return res.json({
        success: true,
        created: false,
        room:
          getPublicRoom(
            candidates[0]
          ),
      })
    }

    const room =
      createRoom({
        roomName:
          "Quick Match",

        drawingTime: 60,

        rounds: 2,

        category:
          "Random",

        maxPlayers: 8,

        isQuickMatch: true,
      })

    res.status(201).json({
      success: true,
      created: true,
      room:
        getPublicRoom(room),
    })
  }
)

/*
 * =========================================================
 * REST - Get Room
 * =========================================================
 */
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
 * =========================================================
 * Socket.IO
 * =========================================================
 */
io.on(
  "connection",
  (socket) => {
    console.log(
      "User connected:",
      socket.id
    )

    /*
     * =====================================================
     * Join room
     * =====================================================
     */
    socket.on(
      "joinRoom",
      ({ roomCode, player }) => {
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
         * ป้องกัน join ซ้ำ
         */
        const existingPlayer =
          room.players.find(
            (item) =>
              item.id ===
              socket.id
          )

        if (existingPlayer) {
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
         * เข้าเกมที่เริ่มแล้วไม่ได้
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
         * ห้องเต็ม
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

          score: 0,
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
     * =====================================================
     * Start game
     * =====================================================
     */
    socket.on(
      "startGame",
      () => {
        if (!socket.roomCode) {
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

        if (!player.isHost) {
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

        /*
         * กัน start ซ้ำ
         */
        if (
          room.status !==
          "waiting"
        ) {
          return
        }

        room.status =
          "playing"

        room.phase =
          "choosing"

        room.currentRound =
          1

        room.artistIndex = -1
        room.artistId = null

        room.drawnThisRound =
          []

        room.correctGuessers =
          []

        room.gameStartedAt =
          Date.now()

        room.gameFinishedAt =
          null

        room.matchDurationMs =
          0

        room.turnToken = 0

        room.roundTransitioning =
          false

        console.log(
          `Game started in room ${room.code}`
        )

        console.log(
          `Game started at: ${room.gameStartedAt}`
        )

        startRound(room)
      }
    )

    /*
     * =====================================================
     * Select word
     * =====================================================
     */
    socket.on(
      "selectWord",
      ({ word }) => {
        if (!socket.roomCode) {
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
     * =====================================================
     * Draw
     * =====================================================
     */
    socket.on(
      "draw",
      (data) => {
        if (!socket.roomCode) {
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
     * =====================================================
     * Clear canvas
     * =====================================================
     */
    socket.on(
      "clearCanvas",
      () => {
        if (!socket.roomCode) {
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
     * =====================================================
     * Guess
     * =====================================================
     */
    socket.on(
      "guess",
      ({ guess }) => {
        if (!socket.roomCode) {
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

        /*
         * Artist ห้ามทาย
         */
        if (
          room.artistId ===
          socket.id
        ) {
          return
        }

        if (!room.currentWord) {
          return
        }

        /*
         * คนที่ตอบถูกไปแล้ว
         * ห้ามได้คะแนนซ้ำ
         */
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
         * =================================================
         * Correct
         * =================================================
         */
        if (
          cleanGuess ===
          correctWord
        ) {
          /*
           * ป้องกัน push ซ้ำ
           */
          if (
            !room.correctGuessers.includes(
              socket.id
            )
          ) {
            room.correctGuessers.push(
              socket.id
            )
          }

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

          /*
           * Artist ได้ 100 ต่อคน
           */
          const artistPlayer =
            room.players.find(
              (item) =>
                item.id ===
                room.artistId
            )

          if (artistPlayer) {
            if (
              typeof artistPlayer.score !==
              "number"
            ) {
              artistPlayer.score =
                0
            }

            artistPlayer.score +=
              100
          }

          socket.emit(
            "correctGuess",
            {
              score,
            }
          )

          io.to(room.code).emit(
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
           * ทุกคนทายถูก
           */
          if (
            haveAllGuessersGuessed(
              room
            )
          ) {
            nextRound(room)
          }

          return
        }

        /*
         * =================================================
         * Wrong guess
         * =================================================
         */
        io.to(room.code).emit(
          "playerGuess",
          {
            playerId:
              player.id,

            playerName:
              player.name,

            guess:
              guess.trim(),

            correct: false,
          }
        )
      }
    )

    /*
     * =====================================================
     * Explicit leave
     * =====================================================
     */
    socket.on(
      "leaveRoom",
      () => {
        leaveRoom(socket)
      }
    )

    /*
     * =====================================================
     * Disconnect
     * =====================================================
     */
    socket.on(
      "disconnect",
      () => {
        console.log(
          "User disconnected:",
          socket.id
        )

        leaveRoom(socket)
      }
    )
  }
)

/*
 * =========================================================
 * Leave room
 * =========================================================
 */
function leaveRoom(socket) {
  /*
   * เก็บ room code ไว้ก่อน
   */
  const roomCode =
    socket.roomCode

  if (!roomCode) {
    return
  }

  /*
   * สำคัญ:
   * เคลียร์ทันทีเพื่อป้องกัน
   *
   * leaveRoom
   * +
   * disconnect
   *
   * เรียกซ้ำ
   */
  socket.roomCode = null

  const room =
    getRoomByCode(
      roomCode
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
    room.players[playerIndex]

  const wasArtist =
    room.artistId ===
    leavingPlayer.id

  const wasHost =
    leavingPlayer.isHost

  /*
   * =======================================================
   * Remove player
   * =======================================================
   */
  room.players.splice(
    playerIndex,
    1
  )

  /*
   * เอา player ออกจาก state ที่เกี่ยวข้อง
   */
  room.correctGuessers =
    room.correctGuessers.filter(
      (id) =>
        id !==
        leavingPlayer.id
    )

  room.drawnThisRound =
    room.drawnThisRound.filter(
      (id) =>
        id !==
        leavingPlayer.id
    )

  /*
   * =======================================================
   * Empty room
   * =======================================================
   */
  if (
    room.players.length === 0
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

    return
  }

  /*
   * =======================================================
   * Host transfer
   * =======================================================
   */
  if (wasHost) {
    /*
     * reset host ก่อน
     */
    room.players.forEach(
      (player) => {
        player.isHost =
          false
      }
    )

    /*
     * คนแรกที่เหลือเป็น host
     */
    room.players[0].isHost =
      true

    console.log(
      `New host in room ${room.code}: ${room.players[0].name}`
    )
  }

  /*
   * =======================================================
   * Waiting room
   * =======================================================
   */
  if (
    room.status ===
    "waiting"
  ) {
    broadcastPlayers(
      room
    )

    io.to(room.code).emit(
      "playerLeft",
      {
        playerId:
          leavingPlayer.id,
      }
    )

    console.log(
      `${leavingPlayer.name} left room ${room.code}`
    )

    return
  }

  /*
   * =======================================================
   * Game already finished
   * =======================================================
   */
  if (
    room.status ===
    "finished"
  ) {
    broadcastPlayers(
      room
    )

    io.to(room.code).emit(
      "playerLeft",
      {
        playerId:
          leavingPlayer.id,
      }
    )

    console.log(
      `${leavingPlayer.name} left finished room ${room.code}`
    )

    return
  }

  /*
   * =======================================================
   * Game is playing
   * =======================================================
   */

  /*
   * ถ้าเหลือผู้เล่นน้อยกว่า 2
   * จบเกมทันที
   */
  if (
    room.players.length <
    MIN_PLAYERS_TO_CONTINUE
  ) {
    console.log(
      `Too few players in room ${room.code}`
    )

    finishGame(room)

    broadcastPlayers(
      room
    )

    io.to(room.code).emit(
      "playerLeft",
      {
        playerId:
          leavingPlayer.id,
      }
    )

    console.log(
      `${leavingPlayer.name} left room ${room.code}`
    )

    return
  }

  /*
   * =======================================================
   * Artist ออก
   * =======================================================
   */
  if (wasArtist) {
    console.log(
      `Artist ${leavingPlayer.name} left room ${room.code}`
    )

    /*
     * ยกเลิก timer เก่า
     */
    clearRoomTimer(
      room.code
    )

    /*
     * invalidate turn เก่า
     */
    room.turnToken += 1

    /*
     * reset current drawing state
     */
    room.artistId = null
    room.artistIndex = -1

    room.currentWord = null
    room.currentHint = null
    room.currentChoices = []

    room.correctGuessers = []

    room.roundStartedAt = null
    room.roundEndsAt = null

    /*
     * restart turn
     *
     * drawnThisRound ของ artist ที่ออก
     * ถูกลบออกไปแล้วด้านบน
     *
     * ดังนั้น startRound จะหา
     * คนถัดไปที่ยังไม่ได้วาด
     */
    startRound(room)
  } else if (
    room.phase ===
      "drawing" &&
    haveAllGuessersGuessed(
      room
    )
  ) {
    /*
     * กรณี player ที่เหลือ
     * ทายถูกครบหลังจากมีคนออก
     */
    nextRound(room)
  }

  /*
   * =======================================================
   * Broadcast
   * =======================================================
   */
  broadcastPlayers(
    room
  )

  io.to(room.code).emit(
    "playerLeft",
    {
      playerId:
        leavingPlayer.id,
    }
  )

  console.log(
    `${leavingPlayer.name} left room ${room.code}`
  )
}

/*
 * =========================================================
 * Empty room cleanup
 * =========================================================
 */
setInterval(() => {
  const now = Date.now()

  for (
    let i = rooms.length - 1;
    i >= 0;
    i--
  ) {
    const room =
      rooms[i]

    if (
      room.players.length ===
        0 &&
      now -
        room.createdAt >
        EMPTY_ROOM_TTL
    ) {
      clearRoomTimer(
        room.code
      )

      rooms.splice(
        i,
        1
      )

      console.log(
        `Room ${room.code} removed (empty)`
      )
    }
  }
}, ROOM_CLEANUP_INTERVAL)

/*
 * =========================================================
 * Start server
 * =========================================================
 */
server.listen(
  PORT,
  () => {
    console.log(
      `Server running on http://localhost:${PORT}`
    )
  }
)