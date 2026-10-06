import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import Header from "../components/Header";
import CharacterCustomizer from "../components/CharacterCustomizer";
import ArtistName from "../components/ArtistName";
import JoinRoom from "../components/JoinRoom";
import Leaderboard from "../components/Leaderboard";
import Footer from "../components/Footer";
import socket, { saveSession } from "../socket";
import { DEFAULT_AVATAR } from "../avatarParts";


const ROOM_ERROR_MESSAGES = {
  ROOM_NOT_FOUND: "Room not found. Check the code and try again.",
  ROOM_FULL: "That room is full.",
  GAME_ALREADY_STARTED: "That game has already started.",
  INVALID_ROOM_ID: "Room codes are 4–12 letters or numbers.",
  ALREADY_IN_ROOM: "You are already in a room.",
  QUICK_MATCH_FAILED: "Could not find a room. Please try again.",
};

function Home() {
  const navigate = useNavigate();

  const [artistName, setArtistName] = useState("");

  const [isLoggedIn, setIsLoggedIn] = useState(false);

  const [avatar, setAvatar] = useState(DEFAULT_AVATAR);

  // "quick" | "join" | null
  const [pendingAction, setPendingAction] = useState(null);

  const [roomError, setRoomError] = useState("");

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

  /*
   * Quick Match / Join with Code -> เข้าห้องแล้วไปห้องรอ
   * (Quick Match อาจได้ roomCreated ถ้าไม่มีห้องว่าง)
   */
  useEffect(() => {
    function handleEnteredRoom(room) {
      setPendingAction(null);

      saveSession({
        roomId: room.id,
        playerId: socket.id,
        resumeToken: room.resumeToken,
      });

      navigate("/waiting-room", {
        state: {
          room,
        },
      });
    }

    function handleRoomError(data) {
      setPendingAction(null);

      setRoomError(
        ROOM_ERROR_MESSAGES[data?.error] || "Unable to join the room.",
      );
    }

    socket.on("roomJoined", handleEnteredRoom);
    socket.on("roomCreated", handleEnteredRoom);
    socket.on("roomError", handleRoomError);

    return () => {
      socket.off("roomJoined", handleEnteredRoom);
      socket.off("roomCreated", handleEnteredRoom);
      socket.off("roomError", handleRoomError);
    };
  }, [navigate]);

  function handleQuickMatch() {
    if (pendingAction) {
      return;
    }

    setRoomError("");
    setPendingAction("quick");

    socket.emit("quickMatch");
  }

  function handleJoinWithCode(code) {
    setRoomError("");
    setPendingAction("join");

    socket.emit("joinRoom", code);
  }

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
              onClick={handleQuickMatch}
              disabled={Boolean(pendingAction)}
              className="h-12 w-full rounded-full border-2 border-black bg-[#d6f679] text-[17px] font-bold transition hover:opacity-80 disabled:cursor-wait disabled:opacity-60"
            >
              {pendingAction === "quick" ? "Finding a room..." : "Quick Match"}
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

            <JoinRoom
              onJoin={handleJoinWithCode}
              isJoining={pendingAction === "join"}
              error={roomError}
            />
          </section>
        </div>

        <Leaderboard />
      </main>

      <Footer />
    </div>
  );
}

export default Home;
