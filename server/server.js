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

// [FIX] ถ้าผู้เล่นเหลือน้อยกว่านี้ระหว่างเล่น ให้จบเกมทันที
const MIN_PLAYERS_TO_CONTINUE = 2

// [FIX] ห้องที่สร้างแล้วไม่มีใครเข้า socket จะถูกลบเมื่อเกินเวลานี้
const EMPTY_ROOM_TTL = 2 * 60 * 1000
const ROOM_CLEANUP_INTERVAL = 30 * 1000

// [FIX] ห้อง Quick Match ที่เพิ่งสร้าง (ยังไม่มีคนเข้า) จะรับคนอื่นเข้ามาได้ภายในเวลานี้
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

  const randomIndex = Math.floor(Math.random() * words.length)

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
      Math.floor(Math.random() * characters.length)
    )
  }

  return code
}

function getRoomByCode(code) {
  return rooms.find(
    (room) => room.code === code.toUpperCase()
  )
}

function getPublicRoom(room) {
  if (!room) return null

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
  if (!room) return

  console.log(
    `Broadcast players in room ${room.code}:`,
    room.players.map((player) => player.name)
  )

  io.to(room.code).emit("playersUpdated", {
    players: room.players,
  })
}

function clearRoomTimer(roomCode) {
  const timer = roomTimers.get(roomCode)

  if (timer) {
    clearTimeout(timer)
    clearInterval(timer)
    roomTimers.delete(roomCode)
  }
}

// [FIX] เช็กว่าคนทายที่เหลืออยู่ทายถูกครบทุกคนหรือยัง
function haveAllGuessersGuessed(room) {
  const guessers = room.players.filter(
    (item) => item.id !== room.artistId
  )

  return (
    guessers.length > 0 &&
    guessers.every((item) =>
      room.correctGuessers.includes(item.id)
    )
  )
}

/*
 * [FIX] 1 รอบ (round) = ผู้เล่นทุกคนได้วาดครบคนละ 1 turn
 *
 * room.drawnThisRound เก็บ id ของคนที่วาดไปแล้วในรอบนี้
 * turn ถัดไปคือผู้เล่นคนแรกในลำดับที่ยังไม่ได้วาด
 * ถ้าทุกคนวาดครบแล้ว จะขึ้นรอบใหม่ หรือจบเกมถ้าครบทุกรอบ
 *
 * วิธีนี้ทำงานถูกต้องแม้มีคนออกกลางเกม
 */
function startRound(room) {
  if (!room || room.players.length === 0) {
    return
  }

  let artist = room.players.find(
    (player) =>
      !room.drawnThisRound.includes(player.id)
  )

  if (!artist) {
    if (room.currentRound >= room.rounds) {
      finishGame(room)
      return
    }

    room.currentRound += 1
    room.drawnThisRound = []
    artist = room.players[0]
  }

  if (!artist) {
    return
  }

  clearRoomTimer(room.code)

  room.drawnThisRound.push(artist.id)

  room.artistIndex = room.players.findIndex(
    (player) => player.id === artist.id
  )

  room.artistId = artist.id
  room.currentWord = null
  room.currentHint = null
  room.currentChoices = getWordChoices(
    room.category
  )
  room.correctGuessers = []
  room.phase = "choosing"
  room.roundStartedAt = null
  room.roundEndsAt = null

  console.log(
    `Round ${room.currentRound} choosing in room ${room.code}`
  )

  console.log(`Artist: ${artist.name}`)

  console.log(
    "Word choices:",
    room.currentChoices.map(
      (item) => item.word
    )
  )

  io.to(room.code).emit("roundChoosing", {
    room: getPublicRoom(room),
    currentRound: room.currentRound,
    artistId: room.artistId,
  })

  io.to(room.artistId).emit("wordChoices", {
    choices: room.currentChoices,
  })

  const choiceTimer = setTimeout(() => {
    const currentRoom = getRoomByCode(
      room.code
    )

    if (!currentRoom) return

    if (currentRoom.phase !== "choosing") {
      return
    }

    if (currentRoom.artistId !== artist.id) {
      return
    }

    if (
      currentRoom.currentChoices.length === 0
    ) {
      return
    }

    const automaticChoice =
      currentRoom.currentChoices[0]

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

function startDrawingPhase(
  room,
  selectedWord
) {
  if (!room) return

  if (room.phase !== "choosing") {
    return
  }

  if (!selectedWord || !selectedWord.word) {
    return
  }

  const validChoice =
    room.currentChoices.find(
      (choice) =>
        choice.word === selectedWord.word
    )

  if (!validChoice) {
    return
  }

  clearRoomTimer(room.code)

  room.currentWord = validChoice.word
  room.currentHint = validChoice.hint
  room.currentChoices = []
  room.correctGuessers = []
  room.phase = "drawing"

  const now = Date.now()

  room.roundStartedAt = now

  room.roundEndsAt =
    now + room.drawingTime * 1000

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
   * สร้าง pattern สำหรับหน้า Game
   *
   * ตัวอักษร = ＿
   * space = เว้นว่าง
   *
   * เช่น
   * ICE CREAM
   * ↓
   * ＿ ＿ ＿  ＿ ＿ ＿ ＿ ＿
   */
  const wordPattern = room.currentWord
    .split("")
    .map((char) =>
      char === " " ? " " : "＿"
    )
    .join("")

  io.to(room.code).emit("roundStarted", {
    room: getPublicRoom(room),
    currentRound: room.currentRound,
    artistId: room.artistId,
    roundStartedAt: room.roundStartedAt,
    roundEndsAt: room.roundEndsAt,
    hint: room.currentHint,
    wordPattern,
  })

  io.to(room.artistId).emit("artistWord", {
    word: room.currentWord,
  })

  io.to(room.code).emit(
    "clearCanvas"
  )

  clearRoomTimer(room.code)

  const timer = setInterval(() => {
    const currentRoom = getRoomByCode(
      room.code
    )

    if (!currentRoom) {
      clearRoomTimer(room.code)
      return
    }

    if (currentRoom.phase !== "drawing") {
      clearRoomTimer(room.code)
      return
    }

    const remaining =
      currentRoom.roundEndsAt -
      Date.now()

    if (remaining <= 0) {
      clearRoomTimer(room.code)
      nextRound(currentRoom)
    }
  }, 250)

  roomTimers.set(
    room.code,
    timer
  )
}

function finishGame(room) {
  if (!room) return

  clearRoomTimer(room.code)

  room.status = "finished"
  room.phase = "finished"
  room.gameFinishedAt = Date.now()

  if (room.gameStartedAt) {
    room.matchDurationMs = Math.max(
      0,
      room.gameFinishedAt -
        room.gameStartedAt
    )
  } else {
    room.matchDurationMs = 0
  }

  room.artistId = null
  room.currentWord = null
  room.currentHint = null
  room.currentChoices = []
  room.roundStartedAt = null
  room.roundEndsAt = null

  console.log(
    `Game finished in room ${room.code}`
  )

  console.log(
    `Match duration: ${room.matchDurationMs} ms`
  )

  io.to(room.code).emit(
    "gameFinished",
    {
      room: getPublicRoom(room),
    }
  )
}

function nextRound(room) {
  if (!room) return

  clearRoomTimer(room.code)

  // [FIX] startRound จัดการขึ้นรอบใหม่ / จบเกมเองแล้ว
  startRound(room)
}

app.get("/", (req, res) => {
  res.send(
    "Picasso Server is running!"
  )
})

// [FIX] ใช้ getPublicRoom เพื่อไม่ให้ currentWord / currentChoices รั่วไปฝั่ง client
app.get("/api/rooms", (req, res) => {
  res.json({
    success: true,
    rooms: rooms.map(getPublicRoom),
  })
})

// [FIX] แยกการสร้างห้องออกมา ใช้ร่วมกันระหว่าง Create Room กับ Quick Match
function createRoom({
  roomName,
  drawingTime,
  rounds,
  category,
  maxPlayers,
  isQuickMatch = false,
}) {
  let code = generateRoomCode()

  while (getRoomByCode(code)) {
    code = generateRoomCode()
  }

  const room = {
    id: Date.now().toString(),
    code,
    name: roomName.trim(),
    drawingTime:
      drawingTime || 60,
    rounds: rounds || 5,
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
    createdAt: Date.now(),
    isQuickMatch,
  }

  rooms.push(room)

  console.log(
    `Room created: ${room.code}`
  )

  return room
}

app.post("/api/rooms", (req, res) => {
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
      message: "Room name is required",
    })
  }

  const room = createRoom({
    roomName,
    drawingTime,
    rounds,
    category,
    maxPlayers,
  })

  res.status(201).json({
    success: true,
    room: getPublicRoom(room),
  })
})

/*
 * [FIX] Quick Match
 *
 * 1. หาห้องที่ยังรออยู่และไม่เต็ม โดยเลือกห้องที่มีคนมากที่สุด
 *    (รวมห้อง Quick Match ที่เพิ่งสร้างและยังไม่มีคน เพื่อให้คนที่กดพร้อมกันได้อยู่ห้องเดียวกัน)
 * 2. ถ้าไม่มีห้องที่เข้าได้เลย สร้างห้องใหม่ให้
 */
app.post("/api/rooms/quick-match", (req, res) => {
  const now = Date.now()

  const candidates = rooms
    .filter((room) => {
      if (room.status !== "waiting") {
        return false
      }

      if (room.players.length >= room.maxPlayers) {
        return false
      }

      if (room.players.length > 0) {
        return true
      }

      return (
        room.isQuickMatch &&
        now - room.createdAt < QUICK_MATCH_GRACE
      )
    })
    .sort(
      (a, b) =>
        b.players.length - a.players.length
    )

  if (candidates.length > 0) {
    return res.json({
      success: true,
      created: false,
      room: getPublicRoom(candidates[0]),
    })
  }

  const room = createRoom({
    roomName: "Quick Match",
    drawingTime: 60,
    rounds: 2,
    category: "Random",
    maxPlayers: 8,
    isQuickMatch: true,
  })

  res.status(201).json({
    success: true,
    created: true,
    room: getPublicRoom(room),
  })
})

app.get(
  "/api/rooms/:code",
  (req, res) => {
    const room = getRoomByCode(
      req.params.code
    )

    if (!room) {
      return res.status(404).json({
        success: false,
        message: "Room not found",
      })
    }

    res.json({
      success: true,
      room: getPublicRoom(room),
    })
  }
)

io.on("connection", (socket) => {
  console.log(
    "User connected:",
    socket.id
  )

  socket.on(
    "joinRoom",
    ({ roomCode, player }) => {
      const room =
        getRoomByCode(roomCode)

      if (!room) {
        socket.emit("roomError", {
          message: "Room not found",
        })
        return
      }

      const existingPlayer =
        room.players.find(
          (item) =>
            item.id === socket.id
        )

      if (existingPlayer) {
        console.log(
          `${socket.id} already joined room ${room.code}`
        )

        socket.roomCode =
          room.code

        socket.join(room.code)

        socket.emit("roomJoined", {
          room: getPublicRoom(room),
        })

        broadcastPlayers(room)

        return
      }

      if (room.status !== "waiting") {
        socket.emit("roomError", {
          message:
            "Game has already started",
        })

        return
      }

      if (
        room.players.length >=
        room.maxPlayers
      ) {
        socket.emit("roomError", {
          message: "Room is full",
        })

        return
      }

      const newPlayer = {
        id: socket.id,
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

      socket.join(room.code)

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

      socket.emit("roomJoined", {
        room: getPublicRoom(room),
      })

      broadcastPlayers(room)

      socket
        .to(room.code)
        .emit("playerJoined", {
          player: newPlayer,
        })
    }
  )

  socket.on(
    "startGame",
    () => {
      if (!socket.roomCode) return

      const room = getRoomByCode(
        socket.roomCode
      )

      if (!room) return

      const player =
        room.players.find(
          (item) =>
            item.id === socket.id
        )

      if (!player) return

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
        room.players.length < 4
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

      // [FIX] กัน host ยิง startGame ซ้ำระหว่างเกมกำลังเล่น
      if (room.status !== "waiting") {
        return
      }

      room.status = "playing"
      room.currentRound = 1
      room.artistIndex = -1
      room.artistId = null
      room.drawnThisRound = []
      room.gameStartedAt =
        Date.now()
      room.gameFinishedAt = null
      room.matchDurationMs = 0

      console.log(
        `Game started in room ${room.code}`
      )

      console.log(
        `Game started at: ${room.gameStartedAt}`
      )

      startRound(room)
    }
  )

  socket.on(
    "selectWord",
    ({ word, hint }) => {
      if (!socket.roomCode) return

      const room = getRoomByCode(
        socket.roomCode
      )

      if (!room) return

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
        room.artistId !==
        socket.id
      ) {
        return
      }

      const selectedWord =
        room.currentChoices.find(
          (choice) =>
            choice.word === word
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

  socket.on(
    "draw",
    (data) => {
      if (!socket.roomCode) return

      const room = getRoomByCode(
        socket.roomCode
      )

      if (!room) return

      if (
        room.status !== "playing"
      ) {
        return
      }

      if (
        room.phase !== "drawing"
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
        .emit("draw", data)
    }
  )

  socket.on(
    "clearCanvas",
    () => {
      if (!socket.roomCode) return

      const room = getRoomByCode(
        socket.roomCode
      )

      if (!room) return

      if (
        room.status !== "playing"
      ) {
        return
      }

      if (
        room.phase !== "drawing"
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

  socket.on(
    "guess",
    ({ guess }) => {
      if (!socket.roomCode) return

      const room = getRoomByCode(
        socket.roomCode
      )

      if (!room) return

      if (
        room.status !== "playing"
      ) {
        return
      }

      if (
        room.phase !== "drawing"
      ) {
        return
      }

      if (
        room.artistId ===
        socket.id
      ) {
        return
      }

      if (!room.currentWord) {
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

      if (!cleanGuess) return

      const correctWord =
        room.currentWord
          .trim()
          .toUpperCase()

      const player =
        room.players.find(
          (item) =>
            item.id === socket.id
        )

      if (!player) return

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

        player.score += score

        // [FIX] artist ได้ 100 คะแนนต่อคนที่ทายถูก
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
            artistPlayer.score = 0
          }

          artistPlayer.score += 100
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

        broadcastPlayers(room)

        if (haveAllGuessersGuessed(room)) {
          clearRoomTimer(
            room.code
          )

          nextRound(room)
        }

        return
      }

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

  socket.on(
    "leaveRoom",
    () => {
      leaveRoom(socket)
    }
  )

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
})

function leaveRoom(socket) {
  if (!socket.roomCode) {
    return
  }

  const room = getRoomByCode(
    socket.roomCode
  )

  if (!room) {
    return
  }

  const playerIndex =
    room.players.findIndex(
      (player) =>
        player.id === socket.id
    )

  if (playerIndex === -1) {
    return
  }

  const leavingPlayer =
    room.players[playerIndex]

  const wasArtist =
    room.artistId ===
    leavingPlayer.id

  room.players.splice(
    playerIndex,
    1
  )

  if (
    leavingPlayer.isHost &&
    room.players.length > 0
  ) {
    room.players[0].isHost =
      true
  }

  /*
   * [FIX] จัดการเกมที่กำลังเล่นอยู่หลังมีคนออก
   */
  if (
    room.status === "playing" &&
    room.players.length > 0
  ) {
    if (
      room.players.length <
      MIN_PLAYERS_TO_CONTINUE
    ) {
      // เหลือผู้เล่นน้อยเกินไป → จบเกม แล้วทุกคนจะถูกพาไปหน้าสรุปคะแนน
      finishGame(room)
    } else if (wasArtist) {
      // artist ออก → ข้ามไป turn ถัดไปทันที
      room.artistId = null

      clearRoomTimer(room.code)

      startRound(room)
    } else if (
      room.phase === "drawing" &&
      haveAllGuessersGuessed(room)
    ) {
      // คนทายที่เหลือทายถูกครบแล้ว → ไป turn ถัดไป
      nextRound(room)
    }
  }

  broadcastPlayers(room)

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

  if (
    room.players.length === 0
  ) {
    clearRoomTimer(
      room.code
    )

    const roomIndex =
      rooms.findIndex(
        (item) =>
          item.code === room.code
      )

    if (roomIndex !== -1) {
      rooms.splice(
        roomIndex,
        1
      )
    }

    console.log(
      `Room ${room.code} deleted`
    )
  }

  socket.roomCode = null
}

/*
 * [FIX] ลบห้องที่สร้างผ่าน REST แล้วไม่มีใครเข้า socket เลย
 */
setInterval(() => {
  const now = Date.now()

  for (let i = rooms.length - 1; i >= 0; i--) {
    const room = rooms[i]

    if (
      room.players.length === 0 &&
      now - room.createdAt > EMPTY_ROOM_TTL
    ) {
      clearRoomTimer(room.code)

      rooms.splice(i, 1)

      console.log(
        `Room ${room.code} removed (empty)`
      )
    }
  }
}, ROOM_CLEANUP_INTERVAL)

server.listen(
  PORT,
  () => {
    console.log(
      `Server running on http://localhost:${PORT}`
    )
  }
)