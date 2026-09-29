function ScoreSummary() {
  return (
    <div className="flex min-h-[calc(100vh-73px)] flex-col bg-[#f4f5f5]">
      <main className="mx-auto flex w-full max-w-[1200px] flex-1 flex-col px-10 py-10">
        {/* Game Over */}
        <section className="mb-[30px] rounded-[20px] border-[3px] border-[#222] bg-white p-5">
          <h1 className="text-[28px] font-extrabold">
            Game Over! Purr-fect Match! 
          </h1>

          <span className="mt-2.5 inline-block rounded-full bg-[#e9ecef] px-4 py-1.5 text-sm font-bold">
            ⏱ --m --s Duration
          </span>
        </section>

        {/* Podium */}
        <section className="mb-[30px] flex min-h-[260px] items-end justify-center gap-5">
          {/* 2nd Place */}
          <div className="flex w-[220px] flex-col items-center">
            <div className="mb-3 flex h-[150px] w-full items-center justify-center rounded-[20px] border-[3px] border-[#222] bg-[#e9ecef]">
              <span className="text-4xl">🥈</span>
            </div>

            <div className="text-lg font-extrabold">2nd Place</div>
          </div>

          {/* 1st Place */}
          <div className="flex w-[220px] flex-col items-center">
            <div className="mb-3 flex h-[190px] w-full items-center justify-center rounded-[20px] border-[3px] border-[#222] bg-[#e0f878]">
              <span className="text-5xl">🏆</span>
            </div>

            <div className="text-lg font-extrabold">1st Place</div>
          </div>

          {/* 3rd Place */}
          <div className="flex w-[220px] flex-col items-center">
            <div className="mb-3 flex h-[120px] w-full items-center justify-center rounded-[20px] border-[3px] border-[#222] bg-[#e9ecef]">
              <span className="text-4xl">🥉</span>
            </div>

            <div className="text-lg font-extrabold">3rd Place</div>
          </div>
        </section>

        {/* Leaderboard */}
        <section className="rounded-[20px] border-[3px] border-[#222] bg-white p-5">
          <h3 className="mb-[15px] text-lg font-extrabold">
            Match Leaderboard
          </h3>

          {/* Player List */}
          <div className="flex flex-col gap-2.5">
            {/* Player rows will be added here later */}
          </div>
        </section>
      </main>
    </div>
  )
}

export default ScoreSummary
