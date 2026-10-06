import { useEffect, useState } from "react";

import { useNavigate } from "react-router-dom";

import Header from "../components/Header";
import Footer from "../components/Footer";
import RoomSettingsForm from "../components/RoomSettingsForm";
import {
  DEFAULT_ROOM_SETTINGS,
  DEFAULT_SETTINGS_OPTIONS,
} from "../roomSettings";
import socket, { saveSession } from "../socket";

function CreateRoom() {
  const navigate = useNavigate();

  const [roomTitle, setRoomTitle] = useState("");

  const [settings, setSettings] = useState(DEFAULT_ROOM_SETTINGS);

  const [settingsOptions, setSettingsOptions] = useState(
    DEFAULT_SETTINGS_OPTIONS,
  );

  const [isCreating, setIsCreating] = useState(false);

  const [error, setError] = useState("");

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

  useEffect(() => {
    function handleRoomCreated(room) {
      setIsCreating(false);

      saveSession({
        roomId: room.id,
        playerId: socket.id,
        resumeToken: room.resumeToken,
      });

      navigate("/waiting-room", {
        state: {
          room,
        },
      });
    }

    // รายการตัวเลือก + ค่าเริ่มต้นจาก server
    function handleSettingsOptions(data) {
      if (data?.options) {
        setSettingsOptions(data.options);
      }

      if (data?.defaults) {
        setSettings(data.defaults);
      }
    }

    function handleRoomError(data) {
      setIsCreating(false);

      const messages = {
        INVALID_ROOM_ID: "Invalid room code.",

        ROOM_ALREADY_EXISTS: "That room already exists. Please try again.",

        ALREADY_IN_ROOM: "You are already in a room.",

        ROOM_NOT_FOUND: "Room not found.",

        ROOM_FULL: "Room is full.",

        GAME_ALREADY_STARTED: "The game has already started.",
      };

      setError(messages[data?.error] || "Unable to create room.");
    }

    function handleDisconnect() {
      if (isCreating) {
        setIsCreating(false);

        setError("Connection lost. Please try again.");
      }
    }

    socket.on("roomCreated", handleRoomCreated);

    socket.on("roomSettingsOptions", handleSettingsOptions);

    socket.on("roomError", handleRoomError);

    socket.on("disconnect", handleDisconnect);

    return () => {
      socket.off("roomCreated", handleRoomCreated);

      socket.off("roomSettingsOptions", handleSettingsOptions);

      socket.off("roomError", handleRoomError);

      socket.off("disconnect", handleDisconnect);
    };
  }, [navigate, isCreating]);

  useEffect(() => {
    function requestOptions() {
      socket.emit("getRoomSettingsOptions");
    }

    if (socket.connected) {
      requestOptions();
    }

    socket.on("connect", requestOptions);

    return () => {
      socket.off("connect", requestOptions);
    };
  }, []);

  function handleChangeSetting(key, value) {
    setSettings((current) => ({
      ...current,
      [key]: value,
    }));
  }

  function handleCreateRoom() {
    if (isCreating) {
      return;
    }

    if (!socket.connected) {
      setError("Connecting to server. Please try again.");

      return;
    }

    setError("");

    setIsCreating(true);

    const roomId = generateRoomId();

    socket.emit("createRoom", {
      roomId,

      roomTitle,

      ...settings,
    });

    setTimeout(() => {
      setIsCreating((current) => {
        if (current) {
          setError("The server did not respond. Please try again.");

          return false;
        }

        return current;
      });
    }, 8000);
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

            {error && (
              <div className="mb-5 rounded-[12px] border-2 border-black bg-[#ffe7e7] p-3 text-sm font-bold">
                {error}
              </div>
            )}

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

            <div>
              <label className="mb-2 block text-sm font-bold">
                Game Settings
              </label>

              <RoomSettingsForm
                settings={settings}
                options={settingsOptions}
                onChange={handleChangeSetting}
              />

              <p className="mt-2 text-xs text-[#888888]">
                You can still change these in the waiting room.
              </p>
            </div>

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
