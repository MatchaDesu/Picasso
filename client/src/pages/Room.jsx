import { Link } from "react-router-dom"

function Room() {
  return (
    <div className="flex min-h-[calc(100vh-73px)] flex-col bg-[#f4f5f5]">
      <main className="mx-auto w-full max-w-[1200px] flex-1 px-10 py-10">
        {/* Room List Header */}
        <div className="mb-[30px] flex items-center justify-between rounded-full border-[3px] border-[#222] bg-white px-5 py-2.5">
          <input
            type="text"
            placeholder="Filter by Room Name..."
            className="w-1/2 border-none bg-transparent text-sm outline-none placeholder:text-[#6c757d]"
          />

          <Link
            to="/room/create"
            className="rounded-full border-[3px] border-[#222] bg-[#e0f878] px-6 py-2.5 text-[17px] font-extrabold hover:bg-[#d0e868]"
          >
            Create Room
          </Link>
        </div>

        {/* Room Grid */}
        <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-5">
          {/* Room 1 */}
          <div className="flex flex-col gap-[15px] rounded-[20px] border-[3px] border-[#222] bg-white p-5">
            <div className="text-[13px] text-[#555]">
              Waiting for players
            </div>

            <h3 className="text-[22px] font-extrabold">
              Cozy Cat Room
            </h3>

            <div className="flex gap-2">
              <span className="inline-block rounded-full bg-[#eee] px-3 py-1 text-xs">
                2 / 8 Players
              </span>

              <span className="inline-block rounded-full bg-[#eee] px-3 py-1 text-xs">
                Casual
              </span>
            </div>

            <button
              type="button"
              className="mt-1 w-full rounded-full border-[3px] border-[#222] bg-white px-4 py-2 text-sm font-extrabold hover:bg-[#f2f2f2]"
            >
              Join Room
            </button>
          </div>

          {/* Room 2 */}
          <div className="flex flex-col gap-[15px] rounded-[20px] border-[3px] border-[#222] bg-white p-5">
            <div className="text-[13px] text-[#555]">
              Waiting for players
            </div>

            <h3 className="text-[22px] font-extrabold">
              Doodle Party
            </h3>

            <div className="flex gap-2">
              <span className="inline-block rounded-full bg-[#eee] px-3 py-1 text-xs">
                4 / 8 Players
              </span>

              <span className="inline-block rounded-full bg-[#eee] px-3 py-1 text-xs">
                Public
              </span>
            </div>

            <button
              type="button"
              className="mt-1 w-full rounded-full border-[3px] border-[#222] bg-white px-4 py-2 text-sm font-extrabold hover:bg-[#f2f2f2]"
            >
              Join Room
            </button>
          </div>
        </div>
      </main>
    </div>
  )
}

export default Room