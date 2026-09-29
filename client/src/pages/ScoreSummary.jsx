import { useMemo } from "react"
import { useLocation, useNavigate } from "react-router-dom"

function ScoreSummary() {
  const location = useLocation()
  const navigate = useNavigate()

  const room = location.state?.room

  const players = useMemo(() => {
    if (!room?.players) {
      return []
    }

    return [...room.players].sort(
      (a, b) => (b.score || 0) - (a.score || 0)
    )
  }, [room])

  const first = players[0]
  const second = players[1]
  const third = players[2]

  const leaderboard = players.slice(3)

  /*
  |--------------------------------------------------------------------------
  | Match Duration
  |--------------------------------------------------------------------------
  |
  | [FIX] ใช้ matchDurationMs ที่ server ส่งมาใน room
  |
  */

  const matchDuration = useMemo(() => {
    const ms = room?.matchDurationMs

    if (typeof ms !== "number" || ms <= 0) {
      return "--m --s"
    }

    const totalSeconds = Math.round(ms / 1000)
    const minutes = Math.floor(totalSeconds / 60)
    const seconds = totalSeconds % 60

    return `${minutes}m ${seconds}s`
  }, [room])

  /*
  |--------------------------------------------------------------------------
  | Back To Lobby
  |--------------------------------------------------------------------------
  */

  const handleBackToLobby = () => {
    navigate("/")
  }

  /*
  |--------------------------------------------------------------------------
  | No Score Data
  |--------------------------------------------------------------------------
  */

  if (!room) {
    return (
      <div className="flex min-h-[calc(100vh-73px)] items-center justify-center px-6">
        <div className="rounded-[20px] border-[3px] border-[#222] bg-white p-8 text-center">
          <h1 className="text-2xl font-extrabold">
            No match data found
          </h1>

          <p className="mt-2 text-sm text-[#6c757d]">
            Please return to the lobby.
          </p>

          <button
            type="button"
            onClick={handleBackToLobby}
            className="mt-5 rounded-full border-[3px] border-[#222] bg-[#e0f878] px-6 py-3 font-extrabold transition hover:bg-[#d0e868]"
          >
            Back to Lobby
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-[calc(100vh-73px)] bg-[#f4f5f5] text-[#222]">

      <main className="mx-auto w-full max-w-[1200px] px-10 py-10">

        {/* =========================================================
            GAME OVER
        ========================================================= */}

        <div className="mb-[30px] rounded-[20px] border-[3px] border-[#222] bg-white p-5">

          <h1 className="text-3xl font-extrabold md:text-4xl">
            Game Over! Purr-fect Match!
          </h1>

          <span className="mt-[10px] inline-block rounded-full bg-[#eee] px-3 py-1 text-xs font-bold">
            ⏱ {matchDuration} Duration
          </span>

        </div>

        {/* =========================================================
            PODIUM
        ========================================================= */}

        <div className="my-[50px] flex h-[250px] items-end justify-center gap-5">

          {/* =======================================================
              2ND
          ======================================================= */}

          {second && (
            <div className="flex w-[150px] flex-col items-center">

              <div className="mb-2 max-w-full truncate text-center text-sm font-extrabold">
                {second.name}
              </div>

              <div className="mb-2 text-sm font-bold text-[#6c757d]">
                {second.score || 0} pts
              </div>

              <div className="flex h-20 w-full items-center justify-center rounded-t-[20px] border-[3px] border-[#222] bg-[#e9ecef] pt-5 font-black text-[#555]">
                <span className="text-2xl">
                  2nd
                </span>
              </div>

            </div>
          )}

          {/* =======================================================
              1ST
          ======================================================= */}

          {first && (
            <div className="flex w-[150px] flex-col items-center">

              <div className="mb-2 text-2xl">
                👑
              </div>

              <div className="mb-1 max-w-full truncate text-center text-sm font-extrabold">
                {first.name}
              </div>

              <div className="mb-2 text-sm font-bold text-[#6c757d]">
                {first.score || 0} pts
              </div>

              <div className="flex h-[120px] w-full items-center justify-center rounded-t-[20px] border-[3px] border-[#222] bg-[#e0f878] pt-5 font-black text-[#555]">
                <span className="text-3xl">
                  1st
                </span>
              </div>

            </div>
          )}

          {/* =======================================================
              3RD
          ======================================================= */}

          {third && (
            <div className="flex w-[150px] flex-col items-center">

              <div className="mb-2 max-w-full truncate text-center text-sm font-extrabold">
                {third.name}
              </div>

              <div className="mb-2 text-sm font-bold text-[#6c757d]">
                {third.score || 0} pts
              </div>

              <div className="flex h-[60px] w-full items-center justify-center rounded-t-[20px] border-[3px] border-[#222] bg-[#e9ecef] pt-5 font-black text-[#555]">
                <span className="text-2xl">
                  3rd
                </span>
              </div>

            </div>
          )}

        </div>

        {/* =========================================================
            LEADERBOARD
        ========================================================= */}

        <div className="rounded-[20px] border-[3px] border-[#222] bg-white p-5">

          <h3 className="mb-[15px] text-xl font-extrabold">
            Match Leaderboard
          </h3>

          <div className="flex flex-col gap-[10px]">

            {/* -----------------------------------------------------
                If there are only 3 players
            ----------------------------------------------------- */}

            {leaderboard.length === 0 && (
              <div className="rounded-[10px] bg-[#fdfdfd] px-5 py-4 text-sm text-[#6c757d]">
                All players are shown on the podium.
              </div>
            )}

            {/* -----------------------------------------------------
                Rank 4+
            ----------------------------------------------------- */}

            {leaderboard.map(
              (player, index) => {

                const rank =
                  index + 4

                return (
                  <div
                    key={player.id}
                    className="flex items-center justify-between rounded-[10px] border-b border-[#ddd] bg-[#fdfdfd] px-5 py-[15px]"
                  >

                    <div className="flex min-w-0 items-center gap-4">

                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#e9ecef] text-sm font-extrabold">
                        {rank}
                      </div>

                      <div className="min-w-0">

                        <p className="truncate font-extrabold">
                          {player.name}
                        </p>

                        <p className="text-xs text-[#6c757d]">
                          Player
                        </p>

                      </div>

                    </div>

                    <div className="ml-4 shrink-0 text-right">

                      <p className="text-lg font-extrabold">
                        {player.score || 0}
                      </p>

                      <p className="text-xs text-[#6c757d]">
                        points
                      </p>

                    </div>

                  </div>
                )
              }
            )}

          </div>

        </div>

        {/* =========================================================
            BACK TO LOBBY
        ========================================================= */}

        <div className="mt-8 flex justify-center">

          <button
            type="button"
            onClick={handleBackToLobby}
            className="rounded-full border-[3px] border-[#222] bg-[#e0f878] px-[60px] py-[15px] text-xl font-extrabold transition hover:bg-[#d0e868] active:translate-y-0.5"
          >
            Back to Lobby
          </button>

        </div>

      </main>

    </div>
  )
}

export default ScoreSummary