import { useEffect, useState } from "react";

import { getPlayerAvatar } from "../utils/avatar";

function PlayerAvatar({ size = "normal" }) {
  const [avatar, setAvatar] = useState(getPlayerAvatar());

  useEffect(() => {
    function handleStorageChange(event) {
      if (event.key === "playerAvatar") {
        setAvatar(getPlayerAvatar());
      }
    }

    window.addEventListener("storage", handleStorageChange);

    return () => {
      window.removeEventListener("storage", handleStorageChange);
    };
  }, []);

  const sizeClass =
    size === "small"
      ? "h-8 w-8 text-lg"
      : size === "large"
        ? "h-20 w-20 text-4xl"
        : "h-10 w-10 text-xl";

  return (
    <div
      className={`flex shrink-0 items-center justify-center rounded-full border-2 border-black ${sizeClass}`}
      style={{
        backgroundColor: avatar.furColor,
      }}
      title={`${avatar.earStyle} ${avatar.costume}`}
    >
      🐱
    </div>
  );
}

export default PlayerAvatar;
