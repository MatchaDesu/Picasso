import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import Header from "../components/Header";
import Footer from "../components/Footer";
import socket from "../socket";

function BrowseRoom() {
  const navigate = useNavigate();

  const [search, setSearch] = useState("");
  const [rooms, setRooms] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [joiningRoomId, setJoiningRoomId] = useState(null);

  useEffect(() => {
    function handleRoomsList(roomList) {
      setRooms(roomList);
      setIsLoading(false);
    }

    function handleRoomUpdated(updatedRoom) {
      setRooms((currentRooms) => {
        const exists = currentRooms.some((room) => room.id === updatedRoom.id);

        if (!exists) {
          return [...currentRooms, updatedRoom];
        }

        return currentRooms.map((room) =>
          room.id === updatedRoom.id ? updatedRoom : room,
        );
      });
    }

    function handleRoomClosed(roomId) {
      setRooms((currentRooms) =>
        currentRooms.filter((room) => room.id !== roomId),
      );
    }

    function handleRoomJoined(room) {
      setJoiningRoomId(null);

      navigate("/waiting-room", {
        state: {
          room,
        },
      });
    }

    function handleRoomError(data) {
      setJoiningRoomId(null);

      console.error("Room error:", data.error);
    }

    socket.on("roomsList", handleRoomsList);

    socket.on("roomUpdated", handleRoomUpdated);

    socket.on("roomClosed", handleRoomClosed);

    socket.on("roomJoined", handleRoomJoined);

    socket.on("roomError", handleRoomError);

    socket.emit("getRooms");

    return () => {
      socket.off("roomsList", handleRoomsList);

      socket.off("roomUpdated", handleRoomUpdated);

      socket.off("roomClosed", handleRoomClosed);

      socket.off("roomJoined", handleRoomJoined);

      socket.off("roomError", handleRoomError);
    };
  }, [navigate]);

  function handleJoinRoom(roomId) {
    if (joiningRoomId) {
      return;
    }

    setJoiningRoomId(roomId);

    socket.emit("joinRoom", roomId);
  }

  const filteredRooms = rooms.filter((room) =>
    room.title.toLowerCase().includes(search.toLowerCase()),
  );

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

          <div className="mb-6">
            <h2 className="text-2xl font-bold">Browse Rooms</h2>

            <p className="mt-2 text-sm text-[#666666]">
              Find a room and join the drawing party.
            </p>
          </div>

          <input
            type="text"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search room..."
            className="mb-5 h-11 w-full rounded-full border-2 border-black px-5 text-sm outline-none placeholder:text-[#666666]"
          />

          <div className="flex flex-col gap-3">
            {isLoading ? (
              <div className="rounded-[16px] border-2 border-black p-8 text-center">
                <p className="font-bold">Loading rooms...</p>
              </div>
            ) : filteredRooms.length > 0 ? (
              filteredRooms.map((room) => {
                const isFull = room.playerCount >= room.maxPlayers;

                const isJoining = joiningRoomId === room.id;

                const host = room.players?.find(
                  (player) => player.id === room.hostId,
                );

                return (
                  <div
                    key={room.id}
                    className="flex items-center justify-between rounded-[16px] border-2 border-black p-4"
                  >
                    <div className="min-w-0">
                      <h3 className="truncate text-base font-bold">
                        {room.title}
                      </h3>

                      <p className="mt-1 text-xs text-[#666666]">
                        Host: {host?.name || "Unknown"}
                      </p>
                    </div>

                    <div className="ml-4 flex shrink-0 items-center gap-4">
                      <span className="text-xs font-bold">
                        {room.playerCount} / {room.maxPlayers} Players
                      </span>

                      <button
                        type="button"
                        disabled={isFull || isJoining}
                        onClick={() => handleJoinRoom(room.id)}
                        className="rounded-full border-2 border-black bg-[#d6f679] px-4 py-2 text-xs font-bold transition hover:opacity-80 disabled:cursor-not-allowed disabled:bg-[#e5e5e5] disabled:opacity-60"
                      >
                        {isJoining ? "Joining..." : isFull ? "Full" : "Join →"}
                      </button>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="rounded-[16px] border-2 border-black p-8 text-center">
                <p className="font-bold">No rooms found</p>

                <p className="mt-1 text-sm text-[#666666]">
                  {rooms.length === 0
                    ? "There are no active rooms right now."
                    : "Try searching for another room."}
                </p>
              </div>
            )}
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}

export default BrowseRoom;
