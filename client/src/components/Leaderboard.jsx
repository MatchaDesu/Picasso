function Leaderboard() {
  const players = [
    {
      id: 1,
      name: "Player 1",
    },
    {
      id: 2,
      name: "Player 2",
    },
    {
      id: 3,
      name: "Player 3",
    },
    {
      id: 4,
      name: "Player 4",
    },
  ];

  return (
    <section className="rounded-[16px] border-2 border-black px-5 py-4">
      {/* Title */}
      <h2 className="mb-3 text-sm font-bold">Community Leader Board.</h2>

      {/* Players */}
      <div className="grid grid-cols-4 gap-4">
        {players.map((player) => (
          <div
            key={player.id}
            className="flex h-[110px] items-center justify-center rounded-[14px] bg-[#f3f3f3] text-[38px]"
          >
            🐱
          </div>
        ))}
      </div>
    </section>
  );
}

export default Leaderboard;
