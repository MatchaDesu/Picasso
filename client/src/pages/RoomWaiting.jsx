import { Link } from "react-router-dom"

function RoomWaiting() {
  return (
    <div className="flex min-h-[calc(100vh-73px)] flex-col bg-[#f4f5f5]">
      <main className="mx-auto flex w-full max-w-[1200px] flex-1 flex-col px-10 py-10">
        {/* Waiting Header */}
        <div className="mb-8 flex items-center justify-between">
          <h2 className="text-[2rem] font-extrabold">
            Loading Room...

            <span className="ml-3 inline-block rounded-full bg-[#e9ecef] px-4 py-1.5 align-middle text-sm font-bold">
              0/0 players
            </span>
          </h2>

          <Link
            to="/room"
            className="rounded-full border-[3px] border-[#222] bg-white px-6 py-2.5 text-sm font-extrabold hover:bg-[#f2f2f2]"
          >
            Leave
          </Link>
        </div>

        {/* Player Grid */}
        <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-5">
          {/* Players will be added here later */}
        </div>

        {/* Start Button */}
        <div className="mt-10 flex justify-center">
          <button
            type="button"
            className="rounded-full border-[3px] border-[#222] bg-[#e0f878] px-10 py-3 text-lg font-extrabold hover:bg-[#d0e868]"
          >
            Start
          </button>
        </div>
      </main>
    </div>
  )
}

export default RoomWaiting
