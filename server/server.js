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

/*
|--------------------------------------------------------------------------
| Room Data
|--------------------------------------------------------------------------
*/

const rooms = []

function generateRoomCode() {
  const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"

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

/*
|--------------------------------------------------------------------------
| Test
|--------------------------------------------------------------------------
*/

app.get("/", (req, res) => {
  res.send("Picasso Server is running!")
})

/*
|--------------------------------------------------------------------------
| REST API - Rooms
|--------------------------------------------------------------------------
*/

// Get all rooms
app.get("/api/rooms", (req, res) => {
  res.json({
    success: true,
    rooms,
  })
})

// Create room
app.post("/api/rooms", (req, res) => {
  const {
    roomName,
    drawingTime,
    rounds,
    category,
    maxPlayers,
  } = req.body

  if (!roomName || !roomName.trim()) {
    return res.status(400).json({
      success: false,
      message: "Room name is required",
    })
  }

  let code = generateRoomCode()

  while (getRoomByCode(code)) {
    code = generateRoomCode()
  }

  const room = {
    id: Date.now().toString(),
    code,
    name: roomName.trim(),
    drawingTime: drawingTime || 60,
    rounds: rounds || 5,
    category: category || "Animals",
    maxPlayers: maxPlayers || 8,
    players: [],
    status: "waiting",
  }

  rooms.push(room)

  console.log(`Room created: ${room.code}`)

  res.status(201).json({
    success: true,
    room,
  })
})

// Get specific room
app.get("/api/rooms/:code", (req, res) => {
  const room = getRoomByCode(req.params.code)

  if (!room) {
    return res.status(404).json({
      success: false,
      message: "Room not found",
    })
  }

  res.json({
    success: true,
    room,
  })
})

/*
|--------------------------------------------------------------------------
| Socket.IO
|--------------------------------------------------------------------------
*/

io.on("connection", (socket) => {
  console.log("User connected:", socket.id)

  /*
  |--------------------------------------------------------------------------
  | Join Room
  |--------------------------------------------------------------------------
  */

  socket.on("joinRoom", ({ roomCode, player }) => {
    const room = getRoomByCode(roomCode)

    if (!room) {
      socket.emit("roomError", {
        message: "Room not found",
      })

      return
    }

    if (room.status !== "waiting") {
      socket.emit("roomError", {
        message: "Game has already started",
      })

      return
    }

    if (room.players.length >= room.maxPlayers) {
      socket.emit("roomError", {
        message: "Room is full",
      })

      return
    }

    const alreadyJoined = room.players.some(
      (existingPlayer) => existingPlayer.id === socket.id
    )

    if (alreadyJoined) {
      return
    }

    const newPlayer = {
      id: socket.id,
      name: player.name,
      fur: player.fur,
      ears: player.ears,
      costume: player.costume,
      isHost: room.players.length === 0,
    }

    room.players.push(newPlayer)

    socket.join(room.code)

    socket.roomCode = room.code

    socket.emit("roomJoined", {
      room,
    })

    io.to(room.code).emit("playersUpdated", {
      players: room.players,
    })

    socket.to(room.code).emit("playerJoined", {
      player: newPlayer,
    })

    console.log(
      `${newPlayer.name} joined room ${room.code}`
    )
  })

  /*
  |--------------------------------------------------------------------------
  | Leave Room
  |--------------------------------------------------------------------------
  */

  socket.on("leaveRoom", () => {
    leaveRoom(socket)
  })

  /*
  |--------------------------------------------------------------------------
  | Disconnect
  |--------------------------------------------------------------------------
  */

  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id)

    leaveRoom(socket)
  })
})

/*
|--------------------------------------------------------------------------
| Leave Room Function
|--------------------------------------------------------------------------
*/

function leaveRoom(socket) {
  if (!socket.roomCode) {
    return
  }

  const room = getRoomByCode(socket.roomCode)

  if (!room) {
    return
  }

  const playerIndex = room.players.findIndex(
    (player) => player.id === socket.id
  )

  if (playerIndex === -1) {
    return
  }

  const leavingPlayer = room.players[playerIndex]

  room.players.splice(playerIndex, 1)

  if (
    leavingPlayer.isHost &&
    room.players.length > 0
  ) {
    room.players[0].isHost = true
  }

  io.to(room.code).emit("playersUpdated", {
    players: room.players,
  })

  io.to(room.code).emit("playerLeft", {
    playerId: leavingPlayer.id,
  })

  console.log(
    `${leavingPlayer.name} left room ${room.code}`
  )

  if (room.players.length === 0) {
    const roomIndex = rooms.findIndex(
      (item) => item.code === room.code
    )

    if (roomIndex !== -1) {
      rooms.splice(roomIndex, 1
      )
    }

    console.log(`Room ${room.code} deleted`)
  }

  socket.roomCode = null
}

/*
|--------------------------------------------------------------------------
| Start Server
|--------------------------------------------------------------------------
*/

server.listen(PORT, () => {
  console.log(
    `Server running on http://localhost:${PORT}`
  )
})