import { useEffect, useState } from "react";

import socket from "../services/socket";

function Footer() {
  // server เครื่องที่ต่ออยู่ (ใช้ดูตอนมีหลายเครื่องหลัง Load Balancer)
  const [serverId, setServerId] = useState("");

  useEffect(() => {
    function handlePlayerProfile(profile) {
      setServerId(profile?.serverId || "");
    }

    socket.on("playerProfile", handlePlayerProfile);

    socket.emit("getPlayerProfile");

    return () => {
      socket.off("playerProfile", handlePlayerProfile);
    };
  }, []);

  return (
    <footer className="flex w-full items-center justify-between border-t-2 border-black bg-[#f2f2f2] px-9 py-2.5 text-[11px] text-[#594139]">
      <div>© 2026 Picasso?. Doodle together!</div>

      {serverId && <div className="font-mono">server: {serverId}</div>}
    </footer>
  );
}

export default Footer;
