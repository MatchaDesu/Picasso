import { useState } from "react";

function JoinRoom() {
  const [code, setCode] = useState(["", "", "", ""]);

  function handleChange(index, value) {
    const newCode = [...code];

    newCode[index] = value.slice(-1).toUpperCase();

    setCode(newCode);
  }

  return (
    <div className="flex flex-col gap-3 rounded-[18px] border-2 border-black p-[14px] px-[18px]">
      {/* Title */}
      <div className="flex items-center justify-between text-xs font-bold">
        <span>🔑 Join with Room Code</span>

        <span className="font-normal text-[#666666]">4-character code</span>
      </div>

      {/* Input Bar */}
      <div className="flex items-center justify-between rounded-full bg-[#e9e9e9] px-[14px] py-1.5">
        {/* Code */}
        <div className="flex gap-2">
          {code.map((value, index) => (
            <input
              key={index}
              type="text"
              maxLength={1}
              value={value}
              onChange={(event) => handleChange(index, event.target.value)}
              className="w-6 border-0 border-b-2 border-black bg-transparent text-center text-sm font-bold outline-none"
            />
          ))}
        </div>

        {/* Join */}
        <button
          type="button"
          className="rounded-[14px] border-[1.5px] border-black bg-white px-[14px] py-1 text-xs font-bold transition hover:bg-[#e5e5e5]"
        >
          Join →
        </button>
      </div>
    </div>
  );
}

export default JoinRoom;
