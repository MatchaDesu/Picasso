const express = require("express")
const cors = require("cors")
const http = require("http")
const { Server } = require("socket.io")

const {
  registerSocketHandlers,
} = require("./socket/socketHandler")

const app =
  express()

const server =
  http.createServer(app)

const clientUrl =
  process.env.CLIENT_URL ||
  "http://localhost:5173"

app.use(
  cors({
    origin: clientUrl,
  })
)

app.use(
  express.json()
)

const io =
  new Server(
    server,
    {
      cors: {
        origin: clientUrl,
        methods: [
          "GET",
          "POST",
        ],
      },
    }
  )

app.get(
  "/",
  (req, res) => {
    res.send(
      "Picasso Server is running"
    )
  }
)

registerSocketHandlers(io)

const PORT =
  process.env.PORT || 3000

server.listen(
  PORT,
  () => {
    console.log(
      `Server running on port ${PORT}`
    )
  }
)