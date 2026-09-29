import { useState } from "react";
import { Link } from "react-router-dom";

function RoomSettings() {
  const [drawingTime, setDrawingTime] = useState(60);
  const [rounds, setRounds] = useState(5);
  const [category, setCategory] = useState("Animals");

  const timeOptions = [30, 60, 90, 120];
  const roundOptions = [3, 5, 10, 15];

  const categories = [
    { name: "Animals", icon: "🐱" },
    { name: "Food", icon: "🍔" },
    { name: "Nature", icon: "🌳" },
    { name: "Objects", icon: "🏠" },
    { name: "Random", icon: "🎨" },
  ];

  return (
    <div className="flex min-h-[calc(100vh-73px)] flex-col bg-[#f4f5f5]">
      <main className="mx-auto w-full max-w-[1200px] flex-1 px-10 py-10">
        <div className="mx-auto max-w-[600px]">
          {/* Back */}
          <Link
            to="/room"
            className="mb-5 block w-fit text-sm font-extrabold hover:underline"
          >
            ← Back to Lobby
          </Link>

          {/* Settings Card */}
          <section className="rounded-[20px] border-[3px] border-[#222] bg-white p-5">
            <h2 className="text-2xl font-extrabold">Create New Game Room</h2>

            <p className="mb-[25px] mt-1 text-sm text-[#6c757d]">
              Set the rules for your upcoming drawing party.
            </p>

            {/* Room Title */}
            <div className="mb-[25px]">
              <label
                htmlFor="room-title"
                className="mb-2.5 block text-sm font-extrabold"
              >
                Room Title
              </label>

              <input
                id="room-title"
                type="text"
                placeholder="Enter room name..."
                className="box-border w-full rounded-full border-[3px] border-[#222] bg-[#e9ecef] px-4 py-[15px] text-sm outline-none focus:bg-white"
              />
            </div>

            {/* Drawing Time */}
            <div className="mb-[25px]">
              <label className="mb-2.5 block text-sm font-extrabold">
                Drawing Time per Round
              </label>

              <div className="grid grid-cols-4 gap-2.5">
                {timeOptions.map((time) => {
                  const isSelected = drawingTime === time;

                  return (
                    <button
                      key={time}
                      type="button"
                      onClick={() => setDrawingTime(time)}
                      className={`rounded-full px-2.5 py-2.5 text-center font-bold ${
                        isSelected
                          ? "border-4 border-[#222] bg-[#d3d3d3]"
                          : "border-[3px] border-[#222] bg-white hover:bg-[#f2f2f2]"
                      }`}
                    >
                      {time}s
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Number of Rounds */}
            <div className="mb-[25px]">
              <label className="mb-2.5 block text-sm font-extrabold">
                Number of Rounds
              </label>

              <div className="grid grid-cols-4 gap-2.5">
                {roundOptions.map((round) => {
                  const isSelected = rounds === round;

                  return (
                    <button
                      key={round}
                      type="button"
                      onClick={() => setRounds(round)}
                      className={`rounded-full px-2.5 py-2.5 text-center font-bold ${
                        isSelected
                          ? "border-4 border-[#222] bg-[#d3d3d3]"
                          : "border-[3px] border-[#222] bg-white hover:bg-[#f2f2f2]"
                      }`}
                    >
                      {round}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Category */}
            <div className="mb-[25px]">
              <label className="mb-2.5 block text-sm font-extrabold">
                Category
              </label>

              <div className="grid grid-cols-2 gap-2.5">
                {categories.map((item) => {
                  const isSelected = category === item.name;

                  return (
                    <button
                      key={item.name}
                      type="button"
                      onClick={() => setCategory(item.name)}
                      className={`rounded-full border-4 px-4 py-2.5 text-sm font-bold ${
                        isSelected
                          ? "border-[#222] bg-[#d3d3d3]"
                          : "border-[#222] bg-white hover:bg-[#f2f2f2]"
                      }`}
                    >
                      {item.icon} {item.name}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Actions */}
            <div className="mt-10 flex items-center justify-between">
              <Link
                to="/room"
                className="rounded-full border-[3px] border-[#222] bg-white px-6 py-2.5 text-sm font-extrabold hover:bg-[#f2f2f2]"
              >
                Cancel & Exit
              </Link>

              <button
                type="button"
                className="rounded-full border-[3px] border-[#222] bg-[#e0f878] px-6 py-2.5 text-sm font-extrabold hover:bg-[#d0e868]"
              >
                Create Room →
              </button>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}

export default RoomSettings;
