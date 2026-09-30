import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import Header from "../components/Header";
import Footer from "../components/Footer";
import socket from "../socket";

function WaitingRoom() {
  const navigate = useNavigate();
  const location = useLocation();

  const [room, setRoom] = useState(location.state?.room || null);

  const [mySocketId, setMySocketId] = useState(socket.id);

  useEffect(() => {
    function handleConnect() {
      setMySocketId(socket.id);
    }

    if (socket.connected) {
      setMySocketId(socket.id);
    }

    socket.on("connect", handleConnect);

    return () => {
      socket.off("connect", handleConnect);
    };
  }, []);

  useEffect(() => {
    if (!room?.id) {
      return;
    }

    function handleRoomUpdated(updatedRoom) {
      if (updatedRoom.id !== room.id) {
        return;
      }

      setRoom(updatedRoom);
    }

    function handlePlayerJoined(data) {
      if (data.room?.id !== room.id) {
        return;
      }

      setRoom(data.room);
    }

    function handlePlayerLeft(data) {
      if (data.room?.id !== room.id) {
        return;
      }

      setRoom(data.room);
    }

    function handleRoomClosed(roomId) {
      if (roomId !== room.id) {
        return;
      }

      navigate("/browse-room");
    }

    socket.on("roomUpdated", handleRoomUpdated);

    socket.on("playerJoined", handlePlayerJoined);

    socket.on("playerLeft", handlePlayerLeft);

    socket.on("roomClosed", handleRoomClosed);

    return () => {
      socket.off("roomUpdated", handleRoomUpdated);

      socket.off("playerJoined", handlePlayerJoined);

      socket.off("playerLeft", handlePlayerLeft);

      socket.off("roomClosed", handleRoomClosed);
    };
  }, [room?.id, navigate]);

  function handleLeaveRoom() {
    socket.emit("leaveRoom");

    navigate("/browse-room");
  }

  if (!room) {
    return (
      <div className="flex min-h-screen flex-col bg-white text-black">
        <Header />

        <main className="flex flex-1 items-center justify-center px-6 py-8">
          <div className="text-center">
            <h2 className="text-xl font-bold">Room Not Found</h2>

            <p className="mt-2 text-sm text-[#666666]">
              This room is no longer available.
            </p>

            <button
              type="button"
              onClick={() => navigate("/browse-room")}
              className="mt-5 rounded-full border-2 border-black bg-white px-5 py-2 text-sm font-bold transition hover:bg-[#e5e5e5]"
            >
              Back to Rooms
            </button>
          </div>
        </main>

        <Footer />
      </div>
    );
  }

  const players = room.players || [];

  const playerSlots = Array.from(
    { length: 8 },
    (_, index) => players[index] || null,
  );

  return (
    <div className="flex min-h-screen flex-col bg-white text-black">
      <Header />

      <main className="flex flex-1 justify-center px-6 py-8">
        <div className="w-full max-w-[800px]">
          <button
            type="button"
            onClick={handleLeaveRoom}
            className="mb-5 font-extrabold"
          >
            ← Back to Rooms
          </button>

          <div className="rounded-[16px] border-2 border-black p-7">
            {/* Room Header */}
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-2xl font-bold">{room.title}</h2>

                <p className="mt-2 text-sm text-[#666666]">
                  Waiting for the host to start the game.
                </p>
              </div>

              <div className="rounded-full border-2 border-black px-4 py-2 text-xs font-bold">
                {players.length} / 8 Players
              </div>
            </div>

            {/* Players */}
            <div className="mt-7">
              <h3 className="mb-3 text-sm font-bold">Players</h3>

              <div className="grid grid-cols-2 gap-3">
                {playerSlots.map((player, index) => {
                  if (!player) {
                    return (
                      <div
                        key={`empty-${index}`}
                        className="flex min-h-[76px] items-center gap-3 rounded-[14px] border-2 border-dashed border-[#cccccc] bg-[#fafafa] p-3"
                      >
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-2 border-dashed border-[#cccccc] text-xl text-[#aaaaaa]">
                          +
                        </div>

                        <div>
                          <p className="text-sm font-bold text-[#aaaaaa]">
                            Waiting for player...
                          </p>
                        </div>
                      </div>
                    );
                  }

                  const isHost = player.id === room.hostId;

                  const isMe = player.id === mySocketId;

                  const avatar = player.avatar || {
                    furColor: "#e06a3b",
                    earStyle: "Classic",
                    costume: "🎨 Beret",
                  };

                  return (
                    <div
                      key={player.id}
                      className="flex min-h-[76px] items-center gap-3 rounded-[14px] bg-[#f3f3f3] p-3"
                    >
                      {/* Character */}
                      <div
                        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-2 border-black text-2xl"
                        style={{
                          backgroundColor: avatar.furColor,
                        }}
                      >
                        🐱
                      </div>

                      {/* Player Info */}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="truncate text-sm font-bold">
                            {player.name}
                          </p>

                          {isMe && (
                            <span className="shrink-0 rounded-full bg-black px-2 py-0.5 text-[10px] font-bold text-white">
                              You
                            </span>
                          )}
                        </div>

                        <div className="mt-1 flex items-center gap-2">
                          {isHost && (
                            <span className="text-xs font-bold text-[#666666]">
                              Host
                            </span>
                          )}

                          <span className="truncate text-[10px] text-[#888888]">
                            {avatar.earStyle}
                            {" · "}
                            {avatar.costume}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Room Code */}
            <div className="mt-7 rounded-[14px] bg-[#e9e9e9] p-4 text-center">
              <p className="text-xs text-[#666666]">Room Code</p>

              <p className="mt-1 text-2xl font-black tracking-[6px]">
                {room.id}
              </p>
            </div>

            {/* Waiting Status */}
            <div className="mt-6 text-center">
              <p className="text-sm font-bold">Waiting for host...</p>

              <p className="mt-1 text-xs text-[#666666]">
                The game will start when the host is ready.
              </p>
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}

export default WaitingRoom;
