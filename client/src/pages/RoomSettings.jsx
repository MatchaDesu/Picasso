import { useState } from "react";
import { useNavigate } from "react-router-dom";

function RoomSettings() {
  const navigate = useNavigate();

  const [roomName, setRoomName] = useState("");
  const [drawingTime, setDrawingTime] = useState(60);
  const [rounds, setRounds] = useState(2);
  const [category, setCategory] = useState("Animals");

  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState("");

  const timeOptions = [30, 60, 90, 120];

  const roundOptions = [1, 2, 3, 5];

  const categories = [
    {
      name: "Animals",
      icon: "🐱",
    },
    {
      name: "Food",
      icon: "🍔",
    },
    {
      name: "Nature",
      icon: "🌳",
    },
    {
      name: "Objects",
      icon: "🏠",
    },
    {
      name: "Random",
      icon: "🎨",
    },
  ];

  const handleCreateRoom = async () => {
    if (!roomName.trim()) {
      setError("Please enter a room name");
      return;
    }

    setIsCreating(true);
    setError("");

    try {
      const SERVER_URL =
        import.meta.env.VITE_SERVER_URL || "http://localhost:3000";

      const response = await fetch(`${SERVER_URL}/api/rooms`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          roomName: roomName.trim(),
          drawingTime,
          rounds,
          category,
          maxPlayers: 8,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Failed to create room");
      }

      console.log("Room created:", data.room);

      navigate("/room/waiting", {
        state: {
          room: data.room,
        },
      });
    } catch (error) {
      console.error(error);

      setError(error.message || "Cannot connect to server");
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="flex min-h-[calc(100vh-73px)] flex-col bg-[#f4f5f5]">
      <main className="mx-auto w-full max-w-[1000px] flex-1 px-10 py-10">
        <div className="mb-8">
          <h1 className="text-[32px] font-extrabold">Create Room</h1>

          <p className="mt-2 text-sm text-[#666]">
            Set up your room before starting the game.
          </p>
        </div>

        <div className="rounded-[20px] border-[3px] border-[#222] bg-white p-6">
          {/* Room Name */}

          <div className="mb-6">
            <label className="mb-2 block text-sm font-extrabold">
              Room Name
            </label>

            <input
              type="text"
              value={roomName}
              onChange={(event) => setRoomName(event.target.value)}
              placeholder="Enter room name..."
              maxLength={30}
              className="h-12 w-full rounded-full border-[3px] border-[#222] px-5 text-sm outline-none"
            />
          </div>

          {/* Drawing Time */}

          <div className="mb-6">
            <div className="mb-3 text-sm font-extrabold">Drawing Time</div>

            <div className="flex flex-wrap gap-2">
              {timeOptions.map((time) => {
                const isSelected = drawingTime === time;

                return (
                  <button
                    key={time}
                    type="button"
                    onClick={() => setDrawingTime(time)}
                    className={`rounded-full border-4 px-5 py-2 text-sm font-bold ${
                      isSelected
                        ? "border-[#222] bg-[#d3d3d3]"
                        : "border-[#222] bg-white hover:bg-[#f2f2f2]"
                    }`}
                  >
                    {time}s
                  </button>
                );
              })}
            </div>
          </div>

          {/* Rounds */}

          <div className="mb-6">
            <div className="mb-3 text-sm font-extrabold">Rounds</div>

            <div className="flex flex-wrap gap-2">
              {roundOptions.map((round) => {
                const isSelected = rounds === round;

                return (
                  <button
                    key={round}
                    type="button"
                    onClick={() => setRounds(round)}
                    className={`rounded-full border-4 px-5 py-2 text-sm font-bold ${
                      isSelected
                        ? "border-[#222] bg-[#d3d3d3]"
                        : "border-[#222] bg-white hover:bg-[#f2f2f2]"
                    }`}
                  >
                    {round}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Category */}

          <div className="mb-8">
            <div className="mb-3 text-sm font-extrabold">Category</div>

            <div className="flex flex-wrap gap-2">
              {categories.map((item) => {
                const isSelected = category === item.name;

                return (
                  <button
                    key={item.name}
                    type="button"
                    onClick={() => setCategory(item.name)}
                    className={`rounded-full border-4 px-4 py-2.5 text-sm font-bold ${
                      isSelected
                        ? "border-[#222] bg-[#d3d3d3]"
                        : "border-[#222] bg-white hover:bg-[#f2f2f2]"
                    }`}
                  >
                    {item.icon} {item.name}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Error */}

          {error && (
            <div className="mb-5 rounded-xl border-2 border-red-500 bg-red-50 px-4 py-3 text-sm font-bold text-red-600">
              {error}
            </div>
          )}

          {/* Create */}

          <button
            type="button"
            onClick={handleCreateRoom}
            disabled={isCreating}
            className="w-full rounded-full border-[3px] border-[#222] bg-[#e0f878] px-6 py-3 text-lg font-extrabold hover:bg-[#d0e868] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isCreating ? "Creating Room..." : "Create Room"}
          </button>
        </div>
      </main>
    </div>
  );
}

export default RoomSettings;
