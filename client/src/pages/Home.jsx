import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import Header from "../components/Header";
import CharacterCustomizer from "../components/CharacterCustomizer";
import ArtistName from "../components/ArtistName";
import JoinRoom from "../components/JoinRoom";
import Leaderboard from "../components/Leaderboard";
import Footer from "../components/Footer";
import socket from "../socket";

const DEFAULT_AVATAR = {
  furColor: "#e06a3b",
  earStyle: "Classic",
  costume: "🎨 Beret",
};

function Home() {
  const navigate = useNavigate();

  const [artistName, setArtistName] = useState("");

  const [isLoggedIn, setIsLoggedIn] = useState(false);

  const [avatar, setAvatar] = useState(DEFAULT_AVATAR);

  useEffect(() => {
    function handlePlayerProfile(profile) {
      setArtistName(profile.name);

      setIsLoggedIn(profile.isLoggedIn);

      if (profile.avatar) {
        setAvatar(profile.avatar);
      }
    }

    socket.on("playerProfile", handlePlayerProfile);

    socket.emit("getPlayerProfile");

    return () => {
      socket.off("playerProfile", handlePlayerProfile);
    };
  }, []);

  function handleArtistNameChange(name) {
    if (!isLoggedIn) {
      return;
    }

    setArtistName(name);

    socket.emit("setPlayerName", name);
  }

  function handleAvatarChange(newAvatar) {
    setAvatar(newAvatar);

    socket.emit("setPlayerAvatar", newAvatar);
  }

  return (
    <div className="flex min-h-screen flex-col bg-white text-black">
      <Header />

      <main className="mx-auto flex w-full max-w-[1080px] flex-1 flex-col gap-6 px-6 py-8">
        <div className="grid grid-cols-[1fr_380px] items-start gap-9">
          <section className="flex flex-col gap-5">
            <CharacterCustomizer value={avatar} onChange={handleAvatarChange} />

            <ArtistName
              value={artistName}
              onChange={handleArtistNameChange}
              isLoggedIn={isLoggedIn}
            />
          </section>

          <section className="flex flex-col gap-[14px]">
            <button
              type="button"
              className="h-12 w-full rounded-full border-2 border-black bg-[#d6f679] text-[17px] font-bold transition hover:opacity-80"
            >
              Quick Match
            </button>

            <button
              type="button"
              onClick={() => navigate("/create-room")}
              className="h-12 w-full rounded-full border-2 border-black bg-white text-[17px] font-bold transition hover:bg-[#e5e5e5]"
            >
              Create Room
            </button>

            <button
              type="button"
              onClick={() => navigate("/browse-room")}
              className="h-12 w-full rounded-full border-2 border-black bg-white text-[17px] font-bold transition hover:bg-[#e5e5e5]"
            >
              Browse Room
            </button>

            <JoinRoom />
          </section>
        </div>

        <Leaderboard />
      </main>

      <Footer />
    </div>
  );
}

export default Home;
