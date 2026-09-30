import { useState } from "react";

import { useNavigate } from "react-router-dom";

import Header from "../components/Header";

import Footer from "../components/Footer";

import socket from "../socket";

function CreateRoom() {
  const navigate = useNavigate();

  const [roomTitle, setRoomTitle] = useState("");

  const [drawingTime, setDrawingTime] = useState(60);

  const [isCreating, setIsCreating] = useState(false);

  const drawingTimes = [30, 60, 90, 120];

  function generateRoomId() {
    const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

    let roomId = "";

    for (let i = 0; i < 4; i++) {
      roomId += characters.charAt(
        Math.floor(Math.random() * characters.length),
      );
    }

    return roomId;
  }

  function handleCreateRoom() {
    if (isCreating) {
      return;
    }

    setIsCreating(true);

    const roomId = generateRoomId();

    socket.once("roomCreated", (room) => {
      navigate("/waiting-room", {
        state: {
          room,
        },
      });
    });

    socket.emit("createRoom", {
      roomId,
      roomTitle,
      drawingTime,
    });
  }

  return (
    <div className="flex min-h-screen flex-col bg-white text-black">
      <Header />

      <main className="flex flex-1 justify-center px-6 py-8">
        <div className="w-full max-w-[700px]">
          <button
            type="button"
            onClick={() => navigate("/")}
            className="mb-5 font-extrabold"
          >
            ← Back to Lobby
          </button>

          <div className="rounded-[16px] border-2 border-black p-7">
            <h2 className="text-2xl font-bold">Create New Game Room</h2>

            <p className="mb-6 mt-2 text-sm text-[#666666]">
              Set the rules for your upcoming drawing party.
            </p>

            {/* Room Title */}

            <div className="mb-6">
              <label
                htmlFor="room-title"
                className="mb-2 block text-sm font-bold"
              >
                Room Title
              </label>

              <input
                id="room-title"
                type="text"
                value={roomTitle}
                onChange={(event) => setRoomTitle(event.target.value)}
                placeholder="Enter room name..."
                className="h-11 w-full rounded-full border-2 border-black px-5 text-sm outline-none placeholder:text-[#666666]"
              />
            </div>

            {/* Drawing Time */}

            <div>
              <label className="mb-2 block text-sm font-bold">
                Drawing Time per Round
              </label>

              <div className="grid grid-cols-4 gap-3">
                {drawingTimes.map((time) => (
                  <button
                    key={time}
                    type="button"
                    onClick={() => setDrawingTime(time)}
                    className={`h-12 rounded-[14px] border-2 border-black bg-white text-sm font-bold transition hover:bg-[#e5e5e5] ${
                      drawingTime === time ? "border-4" : ""
                    }`}
                  >
                    {time}s
                  </button>
                ))}
              </div>
            </div>

            {/* Actions */}

            <div className="mt-10 flex items-center justify-between gap-4">
              <button
                type="button"
                onClick={() => navigate("/")}
                className="rounded-full border-2 border-black bg-white px-6 py-3 text-sm font-bold transition hover:bg-[#e5e5e5]"
              >
                Cancel & Exit
              </button>

              <button
                type="button"
                onClick={handleCreateRoom}
                disabled={isCreating}
                className="rounded-full border-2 border-black bg-[#d6f679] px-6 py-3 text-sm font-bold transition hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isCreating ? "Creating..." : "Create Room →"}
              </button>
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}

export default CreateRoom;
