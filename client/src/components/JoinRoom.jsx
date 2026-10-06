import { useState } from "react";

/*
 * ช่องเดียว พิมพ์/วางรหัสห้องได้เลย (แปลงเป็นตัวพิมพ์ใหญ่ให้)
 * onJoin(code) ให้หน้า Home เป็นคนส่งไป server
 */
function JoinRoom({ onJoin, error, isJoining }) {
  const [code, setCode] = useState("");

  function handleChange(event) {
    setCode(
      event.target.value
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, "")
        .slice(0, 12),
    );
  }

  function handleSubmit(event) {
    event.preventDefault();

    if (code.length >= 4 && !isJoining) {
      onJoin(code);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-3 rounded-[18px] border-2 border-black p-[14px] px-[18px]"
    >
      {/* Title */}
      <div className="flex items-center justify-between text-xs font-bold">
        <label htmlFor="room-code">🔑 Join with Room Code</label>

        <span className="font-normal text-[#666666]">e.g. AB12</span>
      </div>

      {/* Input Bar */}
      <div className="flex items-center gap-2 rounded-full bg-[#e9e9e9] py-1.5 pl-[18px] pr-1.5">
        <input
          id="room-code"
          type="text"
          value={code}
          onChange={handleChange}
          placeholder="ROOM CODE"
          autoComplete="off"
          spellCheck={false}
          className="min-w-0 flex-1 bg-transparent text-sm font-bold uppercase tracking-[4px] outline-none placeholder:font-normal placeholder:tracking-normal placeholder:text-[#999999]"
        />

        <button
          type="submit"
          disabled={code.length < 4 || isJoining}
          className="shrink-0 rounded-[14px] border-[1.5px] border-black bg-white px-[14px] py-1 text-xs font-bold transition hover:bg-[#e5e5e5] disabled:cursor-not-allowed disabled:opacity-40"
        >
          {isJoining ? "Joining..." : "Join →"}
        </button>
      </div>

      {error && <p className="px-2 text-xs font-bold text-[#c62828]">{error}</p>}
    </form>
  );
}

export default JoinRoom;
