import { useState } from "react"
import { Link } from "react-router-dom"

function Lobby() {
  const isLoggedIn = localStorage.getItem("isLoggedIn") === "true"

  const [fur, setFur] = useState("Ginger Orange")
  const [ears, setEars] = useState("Classic")
  const [costume, setCostume] = useState("Beret")

  const [guestName] = useState(() => {
    const savedName = localStorage.getItem("guestArtistName")

    if (savedName) {
      return savedName
    }

    const names = [
      "SleepyCat",
      "MochiCat",
      "OrangePaw",
      "DoodleCat",
      "FluffyPaws",
      "PaintyCat",
      "LazyPaw",
      "Meowster",
      "SketchyCat",
      "PurrArtist",
      "TinyPaws",
      "GingerPaws",
    ]

    const randomName =
      names[Math.floor(Math.random() * names.length)]

    const randomNumber = Math.floor(100 + Math.random() * 900)

    const newName = `${randomName}${randomNumber}`

    localStorage.setItem("guestArtistName", newName)

    return newName
  })

  const furOptions = [
    { name: "Ginger Orange", color: "#e06a3b" },
    { name: "Brown", color: "#6d4c41" },
    { name: "Black", color: "#212121" },
    { name: "White", color: "#ffffff" },
    { name: "Green", color: "#00695c" },
  ]

  const earOptions = [
    "Classic",
    "Scottish Fold",
    "Fluffy Tuft",
  ]

  const costumeOptions = [
    { name: "Beret", icon: "🎨" },
    { name: "Bowtie", icon: "🎀" },
    { name: "Glasses", icon: "👓" },
    { name: "Scarf", icon: "🧣" },
  ]

  const selectedFur =
    furOptions.find((option) => option.name === fur) || furOptions[0]

  return (
    <div className="mx-auto flex min-h-[calc(100vh-73px)] w-full max-w-[1080px] flex-1 flex-col gap-6 px-6 py-8">
      <main className="grid grid-cols-[minmax(0,1fr)_380px] items-start gap-9">

        {/* Character */}
        <section className="flex flex-col gap-5">
          <div className="flex items-start gap-6">

            {/* Character Preview */}
            <div className="relative flex h-[170px] w-[170px] shrink-0 items-center justify-center overflow-hidden rounded-lg bg-[#e5e5e5]">

              {/* Tail */}
              <div
                className="absolute bottom-[25px] right-[18px] h-[50px] w-[22px] rounded-full border-[5px] border-black"
                style={{
                  backgroundColor: selectedFur.color,
                  transform: "rotate(-35deg)",
                }}
              />

              {/* Cat */}
              <div
                className="absolute bottom-[18px] h-[105px] w-[105px] rounded-[45%] border-[5px] border-black"
                style={{
                  backgroundColor: selectedFur.color,
                }}
              >

                {/* Classic Ears */}
                {ears === "Classic" && (
                  <>
                    <div
                      className="absolute -left-[8px] -top-[25px] h-[48px] w-[45px]"
                      style={{
                        backgroundColor: selectedFur.color,
                        clipPath:
                          "polygon(0 100%, 25% 0, 100% 100%)",
                      }}
                    />

                    <div
                      className="absolute -right-[8px] -top-[25px] h-[48px] w-[45px]"
                      style={{
                        backgroundColor: selectedFur.color,
                        clipPath:
                          "polygon(0 100%, 75% 0, 100% 100%)",
                      }}
                    />
                  </>
                )}

                {/* Scottish Fold */}
                {ears === "Scottish Fold" && (
                  <>
                    <div
                      className="absolute -left-[7px] -top-[12px] h-[42px] w-[42px]"
                      style={{
                        backgroundColor: selectedFur.color,
                        clipPath:
                          "polygon(0 0, 100% 35%, 35% 100%)",
                      }}
                    />

                    <div
                      className="absolute -right-[7px] -top-[12px] h-[42px] w-[42px]"
                      style={{
                        backgroundColor: selectedFur.color,
                        clipPath:
                          "polygon(0 35%, 100% 0, 65% 100%)",
                      }}
                    />
                  </>
                )}

                {/* Fluffy Tuft */}
                {ears === "Fluffy Tuft" && (
                  <>
                    <div
                      className="absolute -left-[13px] -top-[27px] h-[52px] w-[50px]"
                      style={{
                        backgroundColor: selectedFur.color,
                        clipPath:
                          "polygon(0 100%, 15% 55%, 0 30%, 35% 40%, 55% 0, 65% 45%, 100% 25%, 85% 100%)",
                      }}
                    />

                    <div
                      className="absolute -right-[13px] -top-[27px] h-[52px] w-[50px]"
                      style={{
                        backgroundColor: selectedFur.color,
                        clipPath:
                          "polygon(0 25%, 35% 45%, 45% 0, 65% 40%, 100% 30%, 85% 55%, 100% 100%, 15% 100%)",
                      }}
                    />
                  </>
                )}

                {/* Eyes */}
                <div className="absolute left-1/2 top-[38px] flex -translate-x-1/2 gap-7">
                  <div className="h-[9px] w-[9px] rounded-full bg-black" />
                  <div className="h-[9px] w-[9px] rounded-full bg-black" />
                </div>

                {/* Nose */}
                <div className="absolute left-1/2 top-[55px] h-[7px] w-[9px] -translate-x-1/2 rounded-full bg-black" />

                {/* Mouth */}
                <div className="absolute left-1/2 top-[61px] h-[8px] w-[14px] -translate-x-1/2 rounded-b-full border-b-2 border-black" />
              </div>

              {/* Beret */}
              {costume === "Beret" && (
                <div className="absolute left-1/2 top-[18px] h-[22px] w-[72px] -translate-x-1/2 rotate-[-8deg] rounded-[50%] border-[4px] border-black bg-[#d94b4b]">
                  <div className="absolute -top-[7px] left-[22px] h-[8px] w-[20px] rounded-full border-2 border-black bg-[#d94b4b]" />
                </div>
              )}

              {/* Bowtie */}
              {costume === "Bowtie" && (
                <div className="absolute bottom-[25px] left-1/2 flex -translate-x-1/2 items-center">
                  <div className="h-[18px] w-[23px] rotate-[20deg] rounded-[6px] border-2 border-black bg-[#e85d75]" />

                  <div className="z-10 h-[10px] w-[10px] rounded-full border-2 border-black bg-[#f5c542]" />

                  <div className="h-[18px] w-[23px] rotate-[-20deg] rounded-[6px] border-2 border-black bg-[#e85d75]" />
                </div>
              )}

              {/* Glasses */}
              {costume === "Glasses" && (
                <div className="absolute left-1/2 top-[62px] flex -translate-x-1/2 items-center gap-1">
                  <div className="h-[22px] w-[27px] rounded-full border-[3px] border-black" />

                  <div className="h-[3px] w-[8px] bg-black" />

                  <div className="h-[22px] w-[27px] rounded-full border-[3px] border-black" />
                </div>
              )}

              {/* Scarf */}
              {costume === "Scarf" && (
                <>
                  <div className="absolute bottom-[27px] left-1/2 h-[17px] w-[82px] -translate-x-1/2 rotate-[-3deg] rounded-full border-[3px] border-black bg-[#4d8bd8]" />

                  <div className="absolute bottom-[13px] left-[91px] h-[35px] w-[14px] rotate-[-5deg] rounded-b-md border-[3px] border-black bg-[#4d8bd8]" />
                </>
              )}
            </div>

            {/* Customization */}
            <div className="flex flex-1 flex-col gap-[14px]">

              {/* Fur */}
              <div>
                <div className="mb-1.5 flex items-center gap-2 text-xs font-bold">
                  Fur Pigment

                  <small className="font-normal text-[#666]">
                    {fur}
                  </small>
                </div>

                <div className="flex gap-2">
                  {furOptions.map((option) => {
                    const isSelected = fur === option.name

                    return (
                      <button
                        key={option.name}
                        type="button"
                        onClick={() => setFur(option.name)}
                        aria-label={option.name}
                        className={`h-[22px] w-[22px] cursor-pointer rounded-full border-2 ${
                          isSelected
                            ? "border-black"
                            : "border-transparent"
                        }`}
                        style={{
                          backgroundColor: option.color,
                        }}
                      />
                    )
                  })}
                </div>
              </div>

              {/* Ears */}
              <div>
                <div className="mb-1.5 text-xs font-bold">
                  Ears & Expression
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {earOptions.map((option) => {
                    const isSelected = ears === option

                    return (
                      <button
                        key={option}
                        type="button"
                        onClick={() => setEars(option)}
                        className={`rounded-[14px] border-2 px-3 py-[5px] text-[11px] font-bold ${
                          isSelected
                            ? "border-black bg-white"
                            : "border-[#ccc] bg-white hover:border-black"
                        }`}
                      >
                        {option}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Costume */}
              <div>
                <div className="mb-1.5 text-xs font-bold">
                  Costume & Atelier Gear
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {costumeOptions.map((option) => {
                    const isSelected = costume === option.name

                    return (
                      <button
                        key={option.name}
                        type="button"
                        onClick={() => setCostume(option.name)}
                        className={`rounded-[14px] border-2 px-3 py-[5px] text-[11px] font-bold ${
                          isSelected
                            ? "border-black bg-white"
                            : "border-[#ccc] bg-white hover:border-black"
                        }`}
                      >
                        {option.icon} {option.name}
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* Artist Name */}
          <div className="flex h-11 items-center justify-between rounded-[22px] border-2 border-black bg-white px-5">
            <span className="text-sm font-bold">
              {isLoggedIn ? "Artist Name" : guestName}
            </span>

            {!isLoggedIn && (
              <span className="text-xs text-[#777]">
                Guest
              </span>
            )}
          </div>
        </section>

        {/* Right */}
        <section className="flex flex-col gap-[14px]">
          <button
            type="button"
            className="h-12 w-full cursor-pointer rounded-[24px] border-2 border-black bg-[#d6f679] text-[17px] font-bold"
          >
            Quick Match
          </button>

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

              <button
                type="button"
                className="shrink-0 cursor-pointer rounded-[14px] border-[1.5px] border-black bg-white px-[14px] py-1 text-xs font-bold"
              >
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