import { useEffect, useState } from "react"
import {
  useLocation,
  useNavigate,
} from "react-router-dom"

import socket from "../socket"

function RoomWaiting() {
  const location = useLocation()
  const navigate = useNavigate()

  const room = location.state?.room

  const [players, setPlayers] = useState([])
  const [error, setError] = useState("")
  const [isConnected, setIsConnected] = useState(false)

  const isLoggedIn =
    localStorage.getItem("isLoggedIn") === "true"

  const guestName =
    localStorage.getItem("guestArtistName") ||
    "Guest"

  useEffect(() => {
    if (!room?.code) {
      navigate("/room")
      return
    }

    const playerName = isLoggedIn
      ? "Player"
      : guestName

    /*
    |--------------------------------------------------------------------------
    | Socket Event Handlers
    |--------------------------------------------------------------------------
    */

    const handleConnect = () => {
      console.log(
        "Connected to server:",
        socket.id
      )

      setIsConnected(true)
      setError("")

      socket.emit("joinRoom", {
        roomCode: room.code,

        player: {
          name: playerName,
          fur: "Ginger Orange",
          ears: "Classic",
          costume: "Beret",
        },
      })
    }

    const handleDisconnect = () => {
      console.log("Disconnected from server")
      setIsConnected(false)
    }

    const handleRoomJoined = ({
      room: joinedRoom,
    }) => {
      console.log(
        "Joined room:",
        joinedRoom.code
      )

      setPlayers(joinedRoom.players)
      setError("")
    }

    const handlePlayersUpdated = ({
      players,
    }) => {
      console.log(
        "Players updated:",
        players
      )

      setPlayers(players)
    }

    const handlePlayerJoined = ({
      player,
    }) => {
      console.log(
        `${player.name} joined the room`
      )
    }

    const handlePlayerLeft = ({
      playerId,
    }) => {
      console.log(
        `${playerId} left the room`
      )
    }

    const handleRoomError = ({
      message,
    }) => {
      console.error("Room error:", message)

      setError(message)
    }

    /*
    |--------------------------------------------------------------------------
    | Register Events BEFORE Connecting
    |--------------------------------------------------------------------------
    */

    socket.on("connect", handleConnect)
    socket.on("disconnect", handleDisconnect)

    socket.on(
      "roomJoined",
      handleRoomJoined
    )

    socket.on(
      "playersUpdated",
      handlePlayersUpdated
    )

    socket.on(
      "playerJoined",
      handlePlayerJoined
    )

    socket.on(
      "playerLeft",
      handlePlayerLeft
    )

    socket.on(
      "roomError",
      handleRoomError
    )

    /*
    |--------------------------------------------------------------------------
    | Connect
    |--------------------------------------------------------------------------
    */

    if (!socket.connected) {
      socket.connect()
    } else {
      handleConnect()
    }

    /*
    |--------------------------------------------------------------------------
    | Cleanup
    |--------------------------------------------------------------------------
    */

    return () => {
      socket.off("connect", handleConnect)
      socket.off(
        "disconnect",
        handleDisconnect
      )

      socket.off(
        "roomJoined",
        handleRoomJoined
      )

      socket.off(
        "playersUpdated",
        handlePlayersUpdated
      )

      socket.off(
        "playerJoined",
        handlePlayerJoined
      )

      socket.off(
        "playerLeft",
        handlePlayerLeft
      )

      socket.off(
        "roomError",
        handleRoomError
      )

      /*
      ไม่ leaveRoom ตรงนี้
      เพราะ React StrictMode อาจ cleanup
      แล้วสร้าง effect ใหม่ทันที
      */
    }
  }, [
    room,
    navigate,
    isLoggedIn,
    guestName,
  ])

  const handleLeave = () => {
    socket.emit("leaveRoom")

    socket.disconnect()

    navigate("/room")
  }

  if (!room) {
    return null
  }

  return (
    <div className="flex min-h-[calc(100vh-73px)] flex-col bg-[#f4f5f5]">
      <main className="mx-auto flex w-full max-w-[1200px] flex-1 flex-col px-10 py-10">

        {/* Header */}

        <div className="mb-8 flex items-center justify-between">
          <div>
            <h2 className="text-[32px] font-extrabold">
              {room.name}
            </h2>

            <div className="mt-2 flex gap-2">
              <span className="rounded-full bg-[#e9ecef] px-4 py-1.5 text-sm font-bold">
                Room Code: {room.code}
              </span>

              <span className="rounded-full bg-[#e9ecef] px-4 py-1.5 text-sm font-bold">
                {players.length}/{room.maxPlayers}{" "}
                players
              </span>

              <span
                className={`rounded-full px-4 py-1.5 text-sm font-bold ${
                  isConnected
                    ? "bg-[#e0f878]"
                    : "bg-[#eee]"
                }`}
              >
                {isConnected
                  ? "Connected"
                  : "Connecting..."}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={handleLeave}
            className="rounded-full border-[3px] border-[#222] bg-white px-6 py-2.5 text-sm font-extrabold hover:bg-[#f2f2f2]"
          >
            Leave
          </button>
        </div>

        {/* Error */}

        {error && (
          <div className="mb-5 rounded-xl border-2 border-red-500 bg-red-50 px-4 py-3 text-sm font-bold text-red-600">
            {error}
          </div>
        )}

        {/* Players */}

        <section className="rounded-[20px] border-[3px] border-[#222] bg-white p-6">
          <div className="mb-5 flex items-center justify-between">
            <h3 className="text-xl font-extrabold">
              Players
            </h3>

            <span className="text-sm text-[#666]">
              Waiting for players...
            </span>
          </div>

          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
            {players.map((player) => (
              <div
                key={player.id}
                className="rounded-[16px] border-2 border-[#222] bg-[#f4f5f5] p-4"
              >
                <div className="mb-3 flex h-20 items-center justify-center rounded-[12px] bg-[#e0f878] text-4xl">
                  🐱
                </div>

                <div className="truncate text-sm font-extrabold">
                  {player.name}
                </div>

                {player.isHost && (
                  <div className="mt-1 text-xs font-bold text-[#666]">
                    👑 Host
                  </div>
                )}
              </div>
            ))}

            {players.length === 0 && (
              <div className="col-span-full py-10 text-center text-sm text-[#777]">
                Joining room...
              </div>
            )}
          </div>
        </section>

        {/* Room Information */}

        <div className="mt-5 grid grid-cols-3 gap-4">
          <div className="rounded-[16px] border-[3px] border-[#222] bg-white p-4 text-center">
            <div className="text-xs text-[#666]">
              Drawing Time
            </div>

            <div className="mt-1 text-lg font-extrabold">
              {room.drawingTime}s
            </div>
          </div>

          <div className="rounded-[16px] border-[3px] border-[#222] bg-white p-4 text-center">
            <div className="text-xs text-[#666]">
              Rounds
            </div>

            <div className="mt-1 text-lg font-extrabold">
              {room.rounds}
            </div>
          </div>

          <div className="rounded-[16px] border-[3px] border-[#222] bg-white p-4 text-center">
            <div className="text-xs text-[#666]">
              Category
            </div>

            <div className="mt-1 text-lg font-extrabold">
              {room.category}
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}

export default RoomWaiting