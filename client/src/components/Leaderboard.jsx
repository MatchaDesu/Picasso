import { useEffect, useState } from "react";

import socket from "../socket";

const MEDALS = ["🥇", "🥈", "🥉"];

/*
 * อันดับคะแนนรวมของผู้เล่นที่ login (server ดึงจาก DynamoDB)
 */
function Leaderboard() {
  const [entries, setEntries] = useState(null);

  useEffect(() => {
    function handleLeaderboard(data) {
      setEntries(Array.isArray(data) ? data : []);
    }

    function requestLeaderboard() {
      socket.emit("getLeaderboard");
    }

    socket.on("leaderboard", handleLeaderboard);
    socket.on("connect", requestLeaderboard);

    if (socket.connected) {
      requestLeaderboard();
    }

    return () => {
      socket.off("leaderboard", handleLeaderboard);
      socket.off("connect", requestLeaderboard);
    };
  }, []);

  return (
    <section className="rounded-[16px] border-2 border-black px-5 py-4">
      {/* Title */}
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-bold">Community Leader Board.</h2>

        <span className="text-xs text-[#666666]">Top 10 · signed-in artists</span>
      </div>

      {entries === null && (
        <p className="py-6 text-center text-sm text-[#666666]">Loading...</p>
      )}

      {entries?.length === 0 && (
        <p className="rounded-[14px] bg-[#f3f3f3] py-6 text-center text-sm text-[#666666]">
          No scores yet. Sign in and finish a game to get on the board!
        </p>
      )}

      {entries?.length > 0 && (
        <ol className="grid grid-cols-2 gap-2">
          {entries.map((entry, index) => (
            <li
              key={entry.username}
              className={`flex items-center gap-3 rounded-[14px] px-4 py-2.5 ${
                index === 0 ? "border-2 border-black bg-[#e8f79c]" : "bg-[#f3f3f3]"
              }`}
            >
              <span className="w-7 text-center text-lg font-black">
                {MEDALS[index] || `#${index + 1}`}
              </span>

              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold">{entry.username}</p>

                <p className="text-[11px] text-[#666666]">
                  {entry.wins} wins · {entry.gamesPlayed} games
                </p>
              </div>

              <p className="text-right text-lg font-black leading-none">
                {entry.totalScore.toLocaleString()}
                <small className="block text-[10px] font-normal text-[#666666]">pts</small>
              </p>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

export default Leaderboard;
