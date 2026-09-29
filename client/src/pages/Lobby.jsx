import { Link } from "react-router-dom"

function Lobby() {
  // เช็กสถานะ Login
  const isLoggedIn = localStorage.getItem("isLoggedIn") === "true"

  return (
    <div className="mx-auto flex min-h-[calc(100vh-73px)] w-full max-w-[1080px] flex-1 flex-col gap-6 px-6 py-8">
      {/* Main */}
      <main className="grid grid-cols-[minmax(0,1fr)_380px] items-start gap-9">
        {/* Left */}
        <section className="flex flex-col gap-5">
          {/* Customizer */}
          <div className="flex items-start gap-6">
            {/* Avatar */}
            <div className="h-[170px] w-[170px] shrink-0 rounded-lg bg-[#e5e5e5]" />

            {/* Options */}
            <div className="flex flex-1 flex-col gap-[14px]">
              {/* Fur Pigment */}
              <div>
                <div className="mb-1.5 flex items-center gap-2 text-xs font-bold">
                  Fur Pigment

                  <small className="font-normal text-[#666]">
                    Ginger Orange
                  </small>
                </div>

                <div className="flex gap-2">
                  <button
                    className="h-[22px] w-[22px] cursor-pointer rounded-full border-2 border-black bg-[#e06a3b]"
                    aria-label="Ginger Orange"
                  />

                  <button
                    className="h-[22px] w-[22px] cursor-pointer rounded-full border-2 border-transparent bg-[#6d4c41]"
                    aria-label="Brown"
                  />

                  <button
                    className="h-[22px] w-[22px] cursor-pointer rounded-full border-2 border-transparent bg-[#212121]"
                    aria-label="Black"
                  />

                  <button
                    className="h-[22px] w-[22px] cursor-pointer rounded-full border-2 border-[#ddd] bg-white"
                    aria-label="White"
                  />

                  <button
                    className="h-[22px] w-[22px] cursor-pointer rounded-full border-2 border-transparent bg-[#00695c]"
                    aria-label="Green"
                  />
                </div>
              </div>

              {/* Ears */}
              <div>
                <div className="mb-1.5 text-xs font-bold">
                  Ears & Expression
                </div>

                <div className="flex flex-wrap gap-1.5">
                  <button className="rounded-[14px] border-2 border-black bg-white px-3 py-[5px] text-[11px] font-bold">
                    Classic
                  </button>

                  <button className="rounded-[14px] border border-[#ccc] bg-white px-3 py-[5px] text-[11px]">
                    Scottish Fold
                  </button>

                  <button className="rounded-[14px] border border-[#ccc] bg-white px-3 py-[5px] text-[11px]">
                    Fluffy Tuft
                  </button>
                </div>
              </div>

              {/* Costume */}
              <div>
                <div className="mb-1.5 text-xs font-bold">
                  Costume & Atelier Gear
                </div>

                <div className="flex flex-wrap gap-1.5">
                  <button className="rounded-[14px] border-2 border-black bg-white px-3 py-[5px] text-[11px] font-bold">
                    🎨 Beret
                  </button>

                  <button className="rounded-[14px] border border-[#ccc] bg-white px-3 py-[5px] text-[11px]">
                    🎀 Bowtie
                  </button>

                  <button className="rounded-[14px] border border-[#ccc] bg-white px-3 py-[5px] text-[11px]">
                    👓 Glasses
                  </button>

                  <button className="rounded-[14px] border border-[#ccc] bg-white px-3 py-[5px] text-[11px]">
                    🧣 Scarf
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Artist Name */}
          <input
            type="text"
            placeholder="Enter Your Artist Name..."
            className="h-11 w-full rounded-[22px] border-2 border-black px-5 text-sm outline-none placeholder:text-gray-400"
          />
        </section>

        {/* Right */}
        <section className="flex flex-col gap-[14px]">
          {/* Quick Match */}
          <button className="h-12 w-full cursor-pointer rounded-[24px] border-2 border-black bg-[#d6f679] text-[17px] font-bold">
            Quick Match
          </button>

          {/* Create Room */}
          <Link
            to="/room/create"
            className="flex h-12 w-full items-center justify-center rounded-[24px] border-2 border-black bg-white text-[17px] font-bold hover:bg-[#f2f2f2]"
          >
            Create Room
          </Link>

          {/* Join Room */}
          <div className="flex flex-col gap-3 rounded-[18px] border-2 border-black px-[18px] py-[14px]">
            <div className="flex justify-between text-xs font-bold">
              <span>🔑 Join with Room Code</span>

              <span className="font-normal text-[#666]">
                4 - character code
              </span>
            </div>

            <div className="flex items-center justify-between rounded-[24px] bg-[#e9e9e9] px-[14px] py-1.5">
              <input
                type="text"
                maxLength="4"
                placeholder="ABCD"
                className="min-w-0 flex-1 bg-transparent px-2 text-center text-sm font-bold uppercase tracking-[4px] outline-none placeholder:tracking-normal placeholder:text-gray-400"
              />

              <button className="shrink-0 cursor-pointer rounded-[14px] border-[1.5px] border-black bg-white px-[14px] py-1 text-xs font-bold">
                Join →
              </button>
            </div>
          </div>
        </section>
      </main>

      {/* Leaderboard */}
      <section className="rounded-2xl border-2 border-black px-5 py-4">
        <div className="mb-3 text-sm font-bold">
          Community Leader Board.
        </div>

        <div className="grid grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((player) => (
            <div
              key={player}
              className="flex h-[110px] items-center justify-center rounded-[14px] bg-[#f3f3f3] text-[38px]"
            >
              {/* Player */}
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}

export default Lobby
