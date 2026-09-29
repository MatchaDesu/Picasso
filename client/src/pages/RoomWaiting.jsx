import { useEffect, useState } from "react"
import { useLocation, useNavigate } from "react-router-dom"

import socket from "../socket"

function RoomWaiting() {
  const location = useLocation()
  const navigate = useNavigate()

  const initialRoom = location.state?.room

  const [room, setRoom] = useState(initialRoom || null)

  const [players, setPlayers] = useState(
    initialRoom?.players || []
  )

  const [playerName] = useState(() => {
    return localStorage.getItem("playerName") || "Player"
  })

  const [error, setError] = useState("")

  const currentPlayer = players.find(
    (player) => player.id === socket.id
  )

  const isHost = currentPlayer?.isHost === true

  useEffect(() => {
    if (!initialRoom?.code) {
      navigate("/room")
      return
    }

    const joinRoom = () => {
      console.log(
        "Joining room:",
        initialRoom.code
      )

      socket.emit("joinRoom", {
        roomCode: initialRoom.code,

        player: {
          name: playerName,
          fur: "default",
          ears: "default",
          costume: "default",
        },
      })
    }

    const handleConnect = () => {
      console.log(
        "Connected to server:",
        socket.id
      )

      joinRoom()
    }

    const handleRoomJoined = ({
      room: joinedRoom,
    }) => {
      console.log(
        "Room joined:",
        joinedRoom
      )

      setRoom(joinedRoom)

      setPlayers(
        joinedRoom.players || []
      )

      setError("")
    }

    const handlePlayersUpdated = ({
      players: updatedPlayers,
    }) => {
      console.log(
        "Players updated:",
        updatedPlayers
      )

      setPlayers(
        updatedPlayers || []
      )
    }

    const handlePlayerJoined = ({
      player,
    }) => {
      console.log(
        "Player joined:",
        player
      )
    }

    const handlePlayerLeft = ({
      playerId,
    }) => {
      console.log(
        "Player left:",
        playerId
      )
    }

    /*
    |--------------------------------------------------------------------------
    | สำคัญที่สุด
    |--------------------------------------------------------------------------
    |
    | ใช้ startedRoom จาก Server
    | ไม่ใช้ room ที่อยู่ใน closure
    |
    */

    const handleRoundStarted = ({
      room: startedRoom,
      currentRound,
      artistId,
      roundStartedAt,
      roundEndsAt,
      hint,
      wordLength,
    }) => {
      console.log(
        "================================"
      )

      console.log(
        "GAME STARTED"
      )

      console.log(
        "Room from server:",
        startedRoom
      )

      console.log(
        "Players:",
        startedRoom?.players
      )

      console.log(
        "================================"
      )

      /*
      |--------------------------------------------------------------------------
      | อัปเดตข้อมูลล่าสุดก่อนเปลี่ยนหน้า
      |--------------------------------------------------------------------------
      */

      if (startedRoom) {
        setRoom(
          startedRoom
        )

        setPlayers(
          startedRoom.players || []
        )
      }

      /*
      |--------------------------------------------------------------------------
      | ส่ง startedRoom ไป Game
      |
      | ห้ามใช้ room ตรงนี้
      |--------------------------------------------------------------------------
      */

      navigate("/game", {
        state: {
          room:
            startedRoom,

          currentRound,

          artistId,

          roundStartedAt,

          roundEndsAt,

          hint,

          wordLength,
        },
      })
    }

    const handleRoomError = ({
      message,
    }) => {
      console.error(
        "Room error:",
        message
      )

      setError(
        message
      )
    }

    /*
    |--------------------------------------------------------------------------
    | Socket Events
    |--------------------------------------------------------------------------
    */

    socket.on(
      "connect",
      handleConnect
    )

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
      "roundStarted",
      handleRoundStarted
    )

    socket.on(
      "roomError",
      handleRoomError
    )

    /*
    |--------------------------------------------------------------------------
    | Connect / Join
    |--------------------------------------------------------------------------
    */

    if (!socket.connected) {
      socket.connect()
    } else {
      joinRoom()
    }

    /*
    |--------------------------------------------------------------------------
    | Cleanup
    |--------------------------------------------------------------------------
    */

    return () => {
      socket.off(
        "connect",
        handleConnect
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
        "roundStarted",
        handleRoundStarted
      )

      socket.off(
        "roomError",
        handleRoomError
      )
    }
  }, [
    initialRoom?.code,
    navigate,
    playerName,
  ])

  /*
  |--------------------------------------------------------------------------
  | Start Game
  |--------------------------------------------------------------------------
  */

  const handleStartGame = () => {
    if (!socket.connected) {
      setError(
        "Not connected to the server."
      )

      return
    }

    if (!isHost) {
      setError(
        "Only the host can start the game."
      )

      return
    }

    if (players.length < 4) {
      setError(
        "At least 4 players are required."
      )

      return
    }

    setError("")

    console.log(
      "Starting game..."
    )

    socket.emit(
      "startGame"
    )
  }

  /*
  |--------------------------------------------------------------------------
  | Leave Room
  |--------------------------------------------------------------------------
  */

  const handleLeaveRoom = () => {
    socket.emit(
      "leaveRoom"
    )

    socket.disconnect()

    navigate("/room")
  }

  /*
  |--------------------------------------------------------------------------
  | No Room
  |--------------------------------------------------------------------------
  */

  if (!room) {
    return (
      <div className="flex min-h-[calc(100vh-73px)] items-center justify-center">
        <p className="text-lg font-semibold">
          Loading room...
        </p>
      </div>
    )
  }

  /*
  |--------------------------------------------------------------------------
  | UI
  |--------------------------------------------------------------------------
  */

  return (
    <div className="mx-auto flex min-h-[calc(100vh-73px)] w-full max-w-[1080px] flex-col gap-6 px-6 py-8">

      {/* Header */}

      <div className="flex items-center justify-between">

        <div>
          <p className="text-sm font-bold tracking-wider text-gray-500">
            ROOM
          </p>

          <h1 className="text-4xl font-extrabold">
            {room.name}
          </h1>
        </div>

        <button
          type="button"
          onClick={
            handleLeaveRoom
          }
          className="rounded-full border-[3px] border-black bg-white px-6 py-3 font-bold transition hover:bg-gray-100"
        >
          Leave Room
        </button>

      </div>

      {/* Room Code */}

      <section className="rounded-[24px] border-[3px] border-black bg-[#e8f79c] p-6 shadow-[0_5px_0_#111]">

        <div className="text-center">

          <p className="text-sm font-bold tracking-wider text-gray-600">
            ROOM CODE
          </p>

          <p className="mt-1 text-5xl font-extrabold tracking-[0.2em]">
            {room.code}
          </p>

          <p className="mt-2 text-sm text-gray-600">
            Share this code with your friends
          </p>

        </div>

      </section>

      {/* Game Settings */}

      <section className="grid grid-cols-2 gap-4 md:grid-cols-4">

        <div className="rounded-[18px] border-2 border-black bg-white p-4">

          <p className="text-xs font-bold text-gray-500">
            DRAWING TIME
          </p>

          <p className="mt-1 text-2xl font-extrabold">
            {room.drawingTime}s
          </p>

        </div>

        <div className="rounded-[18px] border-2 border-black bg-white p-4">

          <p className="text-xs font-bold text-gray-500">
            ROUNDS
          </p>

          <p className="mt-1 text-2xl font-extrabold">
            {room.rounds}
          </p>

        </div>

        <div className="rounded-[18px] border-2 border-black bg-white p-4">

          <p className="text-xs font-bold text-gray-500">
            CATEGORY
          </p>

          <p className="mt-1 text-2xl font-extrabold">
            {room.category}
          </p>

        </div>

        <div className="rounded-[18px] border-2 border-black bg-white p-4">

          <p className="text-xs font-bold text-gray-500">
            PLAYERS
          </p>

          <p className="mt-1 text-2xl font-extrabold">
            {players.length}/{room.maxPlayers}
          </p>

        </div>

      </section>

      {/* Players */}

      <section className="rounded-[24px] bg-[#ebebeb] p-5">

        <div className="mb-4 flex items-center justify-between">

          <div>

            <h2 className="text-2xl font-extrabold">
              Players
            </h2>

            <p className="text-sm text-gray-500">
              Waiting for everyone to join...
            </p>

          </div>

          <div className="rounded-full border-2 border-black bg-white px-4 py-2 text-sm font-bold">
            {players.length} /{" "}
            {room.maxPlayers}
          </div>

        </div>

        <div className="grid gap-3 sm:grid-cols-2">

          {players.map(
            (player) => (

              <div
                key={
                  player.id
                }
                className={`flex items-center gap-3 rounded-[16px] border-2 border-black p-3 ${
                  player.isHost
                    ? "bg-[#e8f79c]"
                    : "bg-white"
                }`}
              >

                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gray-200 text-2xl">
                  🐱
                </div>

                <div className="min-w-0 flex-1">

                  <p className="truncate font-bold">

                    {player.name}

                    {player.id ===
                      socket.id && (
                      <span className="ml-2 text-xs text-[#a2401c]">
                        You
                      </span>
                    )}

                  </p>

                  {player.isHost && (
                    <p className="text-xs font-bold text-[#a2401c]">
                      HOST
                    </p>
                  )}

                </div>

              </div>

            )
          )}

          {/* Empty Slots */}

          {Array.from({
            length:
              Math.max(
                0,
                room.maxPlayers -
                  players.length
              ),
          }).map(
            (_, index) => (

              <div
                key={
                  `empty-${index}`
                }
                className="flex items-center gap-3 rounded-[16px] border-2 border-dashed border-gray-400 bg-transparent p-3"
              >

                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gray-200 text-xl text-gray-400">
                  +
                </div>

                <p className="text-sm font-semibold text-gray-400">
                  Waiting for player...
                </p>

              </div>

            )
          )}

        </div>

      </section>

      {/* Error */}

      {error && (
        <div className="rounded-[16px] border-2 border-red-500 bg-red-50 px-4 py-3 text-center font-semibold text-red-600">
          {error}
        </div>
      )}

      {/* Start Game */}

      <section className="flex flex-col items-center gap-3 rounded-[24px] border-2 border-black bg-white p-6">

        {isHost ? (

          <>
            <button
              type="button"
              onClick={
                handleStartGame
              }
              disabled={
                players.length <
                4
              }
              className="w-full max-w-[420px] rounded-full border-[3px] border-black bg-[#e8f79c] px-8 py-4 text-xl font-extrabold shadow-[0_4px_0_#111] transition hover:-translate-y-0.5 hover:bg-[#def08b] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {players.length <
              4
                ? `Need ${
                    4 -
                    players.length
                  } more player${
                    4 -
                      players.length ===
                    1
                      ? ""
                      : "s"
                  }`
                : "Start Game"}
            </button>

            <p className="text-sm text-gray-500">
              Minimum 4 players required
            </p>
          </>

        ) : (

          <div className="text-center">

            <div className="mb-2 text-3xl">
              ⏳
            </div>

            <p className="text-lg font-bold">
              Waiting for the host to start the game...
            </p>

            <p className="mt-1 text-sm text-gray-500">
              You are ready!
            </p>

          </div>

        )}

      </section>

    </div>
  )
}

export default RoomWaiting