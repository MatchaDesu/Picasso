import { useEffect, useState } from "react";

import { useNavigate } from "react-router-dom";

import Header from "../components/Header";
import Footer from "../components/Footer";
import socket from "../socket";

function BrowseRoom() {
  const navigate = useNavigate();

  const [rooms, setRooms] = useState([]);

  const [isLoading, setIsLoading] = useState(true);

  const [error, setError] = useState("");

  function loadRooms() {
    setIsLoading(true);

    setError("");

    socket.emit("getRooms");
  }

  useEffect(() => {
    function handleRoomsList(roomList) {
      setRooms(roomList || []);

      setIsLoading(false);
    }

    function handleRoomListChanged() {
      socket.emit("getRooms");
    }

    function handleRoomJoined(room) {
      sessionStorage.setItem("picassoRoomId", room.id);

      sessionStorage.setItem("picassoPlayerId", socket.id);

      navigate("/waiting-room", {
        state: {
          room,
        },
      });
    }

    function handleRoomError(data) {
      const messages = {
        ROOM_NOT_FOUND: "Room not found.",

        ROOM_FULL: "Room is full.",

        GAME_ALREADY_STARTED: "This game has already started.",

        ALREADY_IN_ROOM: "You are already in a room.",

        INVALID_ROOM_ID: "Invalid room code.",
      };

      setError(messages[data?.error] || "Unable to join room.");

      setIsLoading(false);
    }

    socket.on("roomsList", handleRoomsList);

    socket.on("roomListChanged", handleRoomListChanged);

    socket.on("roomJoined", handleRoomJoined);

    socket.on("roomError", handleRoomError);

    loadRooms();

    return () => {
      socket.off("roomsList", handleRoomsList);

      socket.off("roomListChanged", handleRoomListChanged);

      socket.off("roomJoined", handleRoomJoined);

      socket.off("roomError", handleRoomError);
    };
  }, [navigate]);

  function handleJoinRoom(roomId) {
    setError("");

    socket.emit("joinRoom", roomId);
  }

  return (
    <div className="flex min-h-screen flex-col bg-white text-black">
      <Header />

      <main className="mx-auto flex w-full max-w-[1080px] flex-1 flex-col px-6 py-8">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <button
              type="button"
              onClick={() => navigate("/")}
              className="mb-4 font-extrabold"
            >
              ← Back to Lobby
            </button>

            <h2 className="text-2xl font-black">Browse Rooms</h2>

            <p className="mt-1 text-sm text-[#666666]">
              Join an available drawing room.
            </p>
          </div>

          <button
            type="button"
            onClick={loadRooms}
            className="rounded-full border-2 border-black bg-white px-5 py-2 text-sm font-bold transition hover:bg-[#e5e5e5]"
          >
            Refresh
          </button>
        </div>

        {error && (
          <div className="mb-5 rounded-[12px] border-2 border-black bg-[#ffe7e7] p-3 text-sm font-bold">
            {error}
          </div>
        )}

        {isLoading ? (
          <div className="rounded-[16px] border-2 border-black p-8 text-center">
            <p className="text-sm font-bold">Loading rooms...</p>
          </div>
        ) : rooms.length === 0 ? (
          <div className="rounded-[16px] border-2 border-dashed border-[#cccccc] p-10 text-center">
            <p className="text-lg font-bold">No rooms available</p>

            <p className="mt-2 text-sm text-[#666666]">
              Create a room and invite your friends.
            </p>

            <button
              type="button"
              onClick={() => navigate("/create-room")}
              className="mt-5 rounded-full border-2 border-black bg-[#d6f679] px-6 py-3 text-sm font-bold"
            >
              Create Room →
            </button>
          </div>
        ) : (
          <div className="grid gap-3">
            {rooms.map((room) => {
              const players = room.players || [];

              const full = players.length >= room.maxPlayers;

              return (
                <div
                  key={room.id}
                  className="flex items-center justify-between gap-4 rounded-[16px] border-2 border-black p-5"
                >
                  <div>
                    <h3 className="font-black">{room.title}</h3>

                    <p className="mt-1 text-xs text-[#666666]">
                      Code: <span className="font-bold">{room.id}</span>
                    </p>

                    <p className="mt-1 text-xs text-[#666666]">
                      {players.length} / {room.maxPlayers} players
                    </p>
                  </div>

                  <button
                    type="button"
                    disabled={full}
                    onClick={() => handleJoinRoom(room.id)}
                    className="rounded-full border-2 border-black bg-[#d6f679] px-6 py-2 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {full ? "Full" : "Join →"}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
}

export default BrowseRoom;
