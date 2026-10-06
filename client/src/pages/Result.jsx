import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import Header from "../components/Header";
import Footer from "../components/Footer";
import PlayerAvatar from "../components/PlayerAvatar";
import socket, { clearSession, resumeSession } from "../services/socket";

const EMPTY_PLAYERS = [];
const EMPTY_SCORES = {};

function Result() {
  const location = useLocation();
  const navigate = useNavigate();

  const players = location.state?.players || EMPTY_PLAYERS;
  const scores = location.state?.scores || EMPTY_SCORES;

  // ห้องยังอยู่หลังจบเกม (กลับไปเล่นรอบใหม่ได้)
  const [room, setRoom] = useState(location.state?.room || null);

  useEffect(() => {
    function handleConnect() {
      resumeSession();
    }

    function handleRoomUpdated(updatedRoom) {
      if (updatedRoom?.id === room?.id) {
        setRoom(updatedRoom);
      }
    }

    // host เริ่มรอบใหม่ระหว่างที่ยังอยู่หน้านี้
    function handleGameStarted() {
      navigate("/game", {
        replace: true,
        state: {
          room,
        },
      });
    }

    socket.on("connect", handleConnect);
    socket.on("roomUpdated", handleRoomUpdated);
    socket.on("roomResumed", handleRoomUpdated);
    socket.on("gameStarted", handleGameStarted);

    return () => {
      socket.off("connect", handleConnect);
      socket.off("roomUpdated", handleRoomUpdated);
      socket.off("roomResumed", handleRoomUpdated);
      socket.off("gameStarted", handleGameStarted);
    };
  }, [navigate, room]);

  function handleBackToRoom() {
    navigate("/waiting-room", {
      replace: true,
      state: {
        room,
      },
    });
  }

  function handleLeave() {
    socket.emit("leaveRoom");
    clearSession();
    navigate("/");
  }

  const ranking = useMemo(() => {
    return [...players].sort(
      (a, b) => (scores[b.id] || 0) - (scores[a.id] || 0),
    );
  }, [players, scores]);

  function getScore(player) {
    return scores[player.id] || 0;
  }

  return (
    <div className="flex min-h-screen flex-col border-[3px] border-[#111111] bg-white font-sans text-[#1b1b1b]">
      <Header />

      <main className="flex flex-1 items-center justify-center px-6 py-10">
        <div className="w-full max-w-[700px]">
          <div className="text-center">
            <p className="text-sm font-semibold tracking-wider text-[#666666]">
              MATCH COMPLETE
            </p>

            <h1 className="mt-2 text-5xl font-black">🏆 Game Result</h1>

            <p className="mt-3 text-[#666666]">Final scores</p>
          </div>

          {ranking.length === 0 ? (
            <div className="mt-8 rounded-[24px] bg-[#ebebeb] p-8 text-center">
              <p className="font-semibold">Result data is unavailable.</p>

              <button
                type="button"
                onClick={handleLeave}
                className="mt-5 rounded-full border-[3px] border-[#111111] bg-[#d6f679] px-8 py-3 font-bold"
              >
                Back to Lobby
              </button>
            </div>
          ) : (
            <div className="mt-8 rounded-[24px] border-[3px] border-[#111111] bg-[#ebebeb] p-5 shadow-[0_6px_0_#111111]">
              <div className="flex flex-col gap-3">
                {ranking.map((player, index) => {
                  const score = getScore(player);

                  const isFirst = index === 0;

                  return (
                    <div
                      key={player.id}
                      className={`flex items-center gap-4 rounded-2xl px-5 py-4 ${
                        isFirst
                          ? "border-[3px] border-[#111111] bg-[#e8f79c]"
                          : "bg-white"
                      }`}
                    >
                      <div className="w-10 text-center text-xl font-black">
                        #{index + 1}
                      </div>

                      <div className="h-12 w-12 shrink-0 overflow-hidden rounded-full border-2 border-black bg-[#f6f6f6]">
                        <PlayerAvatar
                          avatar={player.avatar}
                          className="h-full w-full"
                        />
                      </div>

                      <div className="min-w-0 flex-1">
                        <p className="truncate text-lg font-bold">
                          {player.name || "Player"}
                        </p>

                        {isFirst && (
                          <p className="text-xs font-semibold text-[#5c5a12]">
                            WINNER
                          </p>
                        )}
                      </div>

                      <div className="text-right">
                        <p className="text-2xl font-black">
                          {score.toLocaleString()}
                        </p>

                        <p className="text-xs text-[#666666]">points</p>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                {room && (
                  <button
                    type="button"
                    onClick={handleBackToRoom}
                    className="flex-1 rounded-full border-[3px] border-[#111111] bg-[#d6f679] px-6 py-4 font-bold transition hover:opacity-80"
                  >
                    Back to Room · Play Again
                  </button>
                )}

                <button
                  type="button"
                  onClick={handleLeave}
                  className="flex-1 rounded-full border-[3px] border-[#111111] bg-white px-6 py-4 font-bold transition hover:bg-[#ebebeb]"
                >
                  Leave Room
                </button>
              </div>
            </div>
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
}

export default Result;
