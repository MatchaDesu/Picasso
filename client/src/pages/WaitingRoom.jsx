import { useEffect, useState } from "react";

import { useLocation, useNavigate } from "react-router-dom";

import Header from "../components/Header";
import Footer from "../components/Footer";
import PlayerAvatar from "../components/PlayerAvatar";
import RoomSettingsForm from "../components/RoomSettingsForm";
import { DEFAULT_SETTINGS_OPTIONS } from "../roomSettings";
import socket, {
  clearSession,
  isResumeRetrying,
  resumeSession,
} from "../socket";

function WaitingRoom() {
  const navigate = useNavigate();

  const location = useLocation();

  const [room, setRoom] = useState(location.state?.room || null);

  const [mySocketId, setMySocketId] = useState(socket.id);

  const [error, setError] = useState("");

  const [connectionStatus, setConnectionStatus] = useState(
    socket.connected ? "connected" : "connecting",
  );

  useEffect(() => {
    function handleConnect() {
      setMySocketId(socket.id);

      setConnectionStatus("connected");

      if (room?.id) {
        resumeSession();
      }
    }

    function handleDisconnect() {
      setConnectionStatus("disconnected");
    }

    socket.on("connect", handleConnect);

    socket.on("disconnect", handleDisconnect);

    if (socket.connected) {
      handleConnect();
    }

    return () => {
      socket.off("connect", handleConnect);

      socket.off("disconnect", handleDisconnect);
    };
  }, [room?.id]);

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

    function handleRoomJoined(joinedRoom) {
      if (joinedRoom.id !== room.id) {
        return;
      }

      setRoom(joinedRoom);
    }

    function handleRoomData(latestRoom) {
      if (latestRoom?.id !== room.id) {
        return;
      }

      if (latestRoom.status === "playing") {
        navigate("/game", {
          state: {
            room: latestRoom,
          },
        });

        return;
      }

      setRoom(latestRoom);
    }

    function handleRoomResumed(resumedRoom) {
      if (resumedRoom.id !== room.id) {
        return;
      }

      // เกมเริ่มไปแล้วระหว่างที่หลุด
      if (resumedRoom.status === "playing") {
        navigate("/game", {
          state: {
            room: resumedRoom,
          },
        });

        return;
      }

      setRoom(resumedRoom);
    }

    function handlePlayerJoined(data) {
      if (data.room?.id !== room.id) {
        return;
      }

      if (data.room) {
        setRoom(data.room);
      }
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

      clearSession();

      navigate("/browse-room");
    }

    function handleResumeFailed() {
      if (isResumeRetrying()) {
        return;
      }

      clearSession();

      navigate("/browse-room");
    }

    function handleGameStarted() {
      navigate("/game", {
        state: {
          room,
        },
      });
    }

    function handleGameError(data) {
      const messages = {
        ONLY_HOST_CAN_CHANGE_SETTINGS: "Only the host can change settings.",

        NOT_ENOUGH_PLAYERS: "At least 3 players are required.",

        ONLY_HOST_CAN_START: "Only the host can start the game.",

        GAME_ALREADY_STARTED: "The game has already started.",
      };

      setError(messages[data?.error] || "Unable to start the game.");
    }

    socket.on("roomUpdated", handleRoomUpdated);

    socket.on("roomJoined", handleRoomJoined);

    socket.on("roomResumed", handleRoomResumed);

    socket.on("roomData", handleRoomData);

    socket.on("roomError", handleGameError);

    socket.on("playerJoined", handlePlayerJoined);

    socket.on("playerLeft", handlePlayerLeft);

    socket.on("roomClosed", handleRoomClosed);

    socket.on("resumeFailed", handleResumeFailed);

    socket.on("gameStarted", handleGameStarted);

    socket.on("gameError", handleGameError);

    return () => {
      socket.off("roomUpdated", handleRoomUpdated);

      socket.off("roomJoined", handleRoomJoined);

      socket.off("roomResumed", handleRoomResumed);

      socket.off("roomData", handleRoomData);

      socket.off("roomError", handleGameError);

      socket.off("playerJoined", handlePlayerJoined);

      socket.off("playerLeft", handlePlayerLeft);

      socket.off("roomClosed", handleRoomClosed);

      socket.off("resumeFailed", handleResumeFailed);

      socket.off("gameStarted", handleGameStarted);

      socket.off("gameError", handleGameError);
    };
  }, [room?.id, navigate, room]);

  /*
   * ขอข้อมูลห้องล่าสุด (เช่น กลับมาจากหน้า Result
   * ซึ่ง state ที่ส่งมาอาจเก่าแล้ว)
   */
  useEffect(() => {
    if (room?.id && socket.connected) {
      socket.emit("getRoom", room.id);
    }
  }, [room?.id]);

  function handleChangeSetting(key, value) {
    setError("");

    socket.emit("updateRoomSettings", {
      [key]: value,
    });
  }

  function handleStartGame() {
    setError("");

    socket.emit("startGame");
  }

  function handleLeaveRoom() {
    socket.emit("leaveRoom");

    clearSession();

    navigate("/browse-room");
  }

  if (!room) {
    return (
      <div className="flex min-h-screen flex-col bg-white text-black">
        <Header />

        <main className="flex flex-1 items-center justify-center px-6 py-8">
          <div className="text-center">
            <h2 className="text-xl font-bold">Room Not Found</h2>

            <button
              type="button"
              onClick={() => navigate("/browse-room")}
              className="mt-5 rounded-full border-2 border-black bg-white px-5 py-2 text-sm font-bold"
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
    {
      length: 8,
    },
    (_, index) => players[index] || null,
  );

  const isHost = room.hostId === mySocketId;

  const settings = room.settings || {};

  const settingsOptions = room.settingsOptions || DEFAULT_SETTINGS_OPTIONS;

  const canStart = players.length >= 3;

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
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-2xl font-bold">{room.title}</h2>

                <p className="mt-2 text-sm text-[#666666]">
                  {isHost
                    ? "You are the host."
                    : "Waiting for the host to start the game."}
                </p>
              </div>

              <div className="text-right">
                <div className="rounded-full border-2 border-black px-4 py-2 text-xs font-bold">
                  {players.length} / 8 Players
                </div>

                <p className="mt-2 text-[10px] font-bold text-[#777777]">
                  {connectionStatus === "connected"
                    ? "● Connected"
                    : "● Reconnecting..."}
                </p>
              </div>
            </div>

            {error && (
              <div className="mt-5 rounded-[12px] border-2 border-black bg-[#ffe7e7] p-3 text-center text-sm font-bold">
                {error}
              </div>
            )}

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

                          <p className="mt-1 text-xs text-[#bbbbbb]">
                            Slot {index + 1}
                          </p>
                        </div>
                      </div>
                    );
                  }

                  const isPlayerHost = player.id === room.hostId;

                  const isMe = player.id === mySocketId;

                  return (
                    <div
                      key={player.id}
                      className="flex min-h-[76px] items-center gap-3 rounded-[14px] bg-[#f3f3f3] p-3"
                    >
                      <div className="h-12 w-12 shrink-0 overflow-hidden rounded-full border-2 border-black bg-white">
                        <PlayerAvatar
                          avatar={player.avatar}
                          className="h-full w-full"
                        />
                      </div>

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
                          {isPlayerHost && (
                            <span className="text-xs font-bold text-[#666666]">
                              Host
                            </span>
                          )}

                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="mt-7">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-bold">Game Settings</h3>

                {!isHost && (
                  <span className="text-[10px] font-bold text-[#888888]">
                    Only the host can change settings
                  </span>
                )}
              </div>

              <RoomSettingsForm
                settings={settings}
                options={settingsOptions}
                disabled={!isHost}
                onChange={handleChangeSetting}
              />
            </div>

            <div className="mt-7 rounded-[14px] bg-[#e9e9e9] p-4 text-center">
              <p className="text-xs text-[#666666]">Room Code</p>

              <p className="mt-1 text-2xl font-black tracking-[6px]">
                {room.id}
              </p>
            </div>

            {isHost ? (
              <div className="mt-6">
                <button
                  type="button"
                  onClick={handleStartGame}
                  disabled={!canStart}
                  className="h-12 w-full rounded-full border-2 border-black bg-[#d6f679] text-sm font-bold transition hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {canStart
                    ? "Start Game →"
                    : `Need ${3 - players.length} more player${
                        3 - players.length > 1 ? "s" : ""
                      }`}
                </button>
              </div>
            ) : (
              <div className="mt-6 text-center">
                <p className="text-sm font-bold">Waiting for host...</p>

                <p className="mt-1 text-xs text-[#666666]">
                  The game will start when the host is ready.
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

export default WaitingRoom;
