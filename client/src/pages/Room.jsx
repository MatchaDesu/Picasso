import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"

function Room() {
  const navigate = useNavigate()

  const [rooms, setRooms] = useState([])
  const [search, setSearch] = useState("")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  const fetchRooms = async () => {
    try {
      setLoading(true)
      setError("")

      const response = await fetch(
        "http://localhost:3000/api/rooms"
      )

      const data = await response.json()

      if (!response.ok) {
        throw new Error(
          data.message || "Failed to load rooms"
        )
      }

      setRooms(data.rooms)
    } catch (error) {
      console.error(error)
      setError(
        error.message || "Cannot connect to server"
      )
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchRooms()
  }, [])

  const filteredRooms = rooms.filter((room) =>
    room.name
      .toLowerCase()
      .includes(search.toLowerCase())
  )

  const handleJoinRoom = (room) => {
    navigate("/room/waiting", {
      state: {
        room,
      },
    })
  }

  return (
    <div className="flex min-h-[calc(100vh-73px)] flex-col bg-[#f4f5f5]">
      <main className="mx-auto w-full max-w-[1200px] flex-1 px-10 py-10">

        {/* Search + Create */}

        <div className="mb-[30px] flex items-center justify-between rounded-full border-[3px] border-[#222] bg-white px-5 py-2.5">

          <input
            type="text"
            value={search}
            onChange={(event) =>
              setSearch(event.target.value)
            }
            placeholder="Filter by Room Name..."
            className="w-1/2 border-none bg-transparent text-sm outline-none placeholder:text-[#6c757d]"
          />

          <button
            type="button"
            onClick={() =>
              navigate("/room/create")
            }
            className="rounded-full border-[3px] border-[#222] bg-[#e0f878] px-6 py-2.5 text-[17px] font-extrabold hover:bg-[#d0e868]"
          >
            Create Room
          </button>
        </div>

        {/* Error */}

        {error && (
          <div className="mb-5 rounded-xl border-2 border-red-500 bg-red-50 px-4 py-3 text-sm font-bold text-red-600">
            {error}
          </div>
        )}

        {/* Loading */}

        {loading && (
          <div className="py-20 text-center text-sm text-[#777]">
            Loading rooms...
          </div>
        )}

        {/* Rooms */}

        {!loading && (
          <>
            {filteredRooms.length === 0 ? (
              <div className="rounded-[20px] border-[3px] border-[#222] bg-white py-20 text-center">
                <div className="text-4xl">
                  🐱
                </div>

                <h3 className="mt-4 text-xl font-extrabold">
                  No rooms found
                </h3>

                <p className="mt-2 text-sm text-[#777]">
                  Create a room and invite your friends!
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-5">
                {filteredRooms.map((room) => {
                  const isFull =
                    room.players.length >=
                    room.maxPlayers

                  return (
                    <div
                      key={room.id}
                      className="flex flex-col gap-[15px] rounded-[20px] border-[3px] border-[#222] bg-white p-5"
                    >
                      <div className="text-[13px] text-[#555]">
                        {room.status === "waiting"
                          ? "Waiting for players"
                          : "Game started"}
                      </div>

                      <h3 className="text-[22px] font-extrabold">
                        {room.name}
                      </h3>

                      <div className="flex flex-wrap gap-2">
                        <span className="inline-block rounded-full bg-[#eee] px-3 py-1 text-xs">
                          {room.players.length} /{" "}
                          {room.maxPlayers} Players
                        </span>

                        <span className="inline-block rounded-full bg-[#eee] px-3 py-1 text-xs">
                          {room.category}
                        </span>

                        <span className="inline-block rounded-full bg-[#eee] px-3 py-1 text-xs">
                          {room.rounds} Rounds
                        </span>
                      </div>

                      <div className="mt-auto pt-1">
                        <button
                          type="button"
                          disabled={
                            isFull ||
                            room.status !==
                              "waiting"
                          }
                          onClick={() =>
                            handleJoinRoom(room)
                          }
                          className="w-full rounded-full border-[3px] border-[#222] bg-white px-4 py-2 text-sm font-extrabold hover:bg-[#f2f2f2] disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          {isFull
                            ? "Room Full"
                            : room.status !==
                                "waiting"
                              ? "Game Started"
                              : "Join Room"}
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  )
}

export default Room