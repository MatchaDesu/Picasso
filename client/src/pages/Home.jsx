import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import Header from "../components/Header";
import CharacterCustomizer from "../components/CharacterCustomizer";
import ArtistName from "../components/ArtistName";
import JoinRoom from "../components/JoinRoom";
import Leaderboard from "../components/Leaderboard";
import Footer from "../components/Footer";
import socket, { saveSession } from "../services/socket";
import { DEFAULT_AVATAR } from "../constants/avatarParts";


// รอ server ตอบนานสุดเท่านี้ ก่อนปลดปุ่มและบอกให้ลองใหม่
const ROOM_REQUEST_TIMEOUT = 8000;

const ROOM_ERROR_MESSAGES = {
  ROOM_NOT_FOUND: "Room not found. Check the code and try again.",
  ROOM_FULL: "That room is full.",
  GAME_ALREADY_STARTED: "That game has already started.",
  INVALID_ROOM_ID: "Room codes are 4–12 letters or numbers.",
  ALREADY_IN_ROOM: "You are already in a room.",
  QUICK_MATCH_FAILED: "Could not find a room. Please try again.",
  NOT_CONNECTED: "Not connected to the game server yet. Please wait a moment and try again.",
  TIMEOUT: "The server did not respond. Please try again.",
};

function Home() {
  const navigate = useNavigate();

  const [artistName, setArtistName] = useState("");

  const [isLoggedIn, setIsLoggedIn] = useState(false);

  const [avatar, setAvatar] = useState(DEFAULT_AVATAR);

  // "quick" | "join" | null
  const [pendingAction, setPendingAction] = useState(null);

  const [roomError, setRoomError] = useState("");

  const requestTimerRef = useRef(null);

  /*
   * server ตอบ playerProfile กลับมา 1 ครั้งต่อการเปลี่ยนชื่อ / ตัวละคร 1 ครั้ง
   * เน็ตช้าแล้วกดติดกัน คำตอบเก่าจะมาทับค่าที่เพิ่งกด
   * -> นับคำตอบที่ยังค้าง แล้วใช้เฉพาะคำตอบของคำขอล่าสุด
   */
  const pendingProfileEchoesRef = useRef(0);

  // ชื่อที่กำลังพิมพ์ (มีช่องว่างท้ายได้ แต่ server ตัดทิ้ง)
  const localNameRef = useRef("");

  useEffect(() => {
    function handlePlayerProfile(profile) {
      setIsLoggedIn(profile.isLoggedIn);

      if (pendingProfileEchoesRef.current > 0) {
        pendingProfileEchoesRef.current -= 1;

        if (pendingProfileEchoesRef.current > 0) {
          return;
        }
      }

      if (profile.name !== localNameRef.current.trim()) {
        localNameRef.current = profile.name;
        setArtistName(profile.name);
      }

      if (profile.avatar) {
        setAvatar(profile.avatar);
      }
    }

    // ต่อใหม่ = คำขอเก่าอาจไม่ได้คำตอบแล้ว
    function resetPendingEchoes() {
      pendingProfileEchoesRef.current = 0;
    }

    socket.on("playerProfile", handlePlayerProfile);
    socket.on("connect", resetPendingEchoes);

    socket.emit("getPlayerProfile");

    return () => {
      socket.off("playerProfile", handlePlayerProfile);
      socket.off("connect", resetPendingEchoes);
    };
  }, []);

  /*
   * Quick Match / Join with Code -> เข้าห้องแล้วไปห้องรอ
   * (Quick Match อาจได้ roomCreated ถ้าไม่มีห้องว่าง)
   */
  useEffect(() => {
    function handleEnteredRoom(room) {
      clearTimeout(requestTimerRef.current);
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
      clearTimeout(requestTimerRef.current);
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

  // ออกจากหน้านี้ไปแล้ว ไม่ต้องจับเวลาต่อ
  useEffect(() => () => clearTimeout(requestTimerRef.current), []);

  /*
   * ส่งคำขอเข้าห้อง
   * - ยังไม่ได้ต่อ server -> บอกทันที ไม่ส่ง (เดิมปุ่มค้างตลอดไป)
   * - server ไม่ตอบภายใน 8 วินาที -> ปลดปุ่ม ให้ลองใหม่ได้
   */
  function sendRoomRequest(action, event, payload) {
    if (pendingAction) {
      return;
    }

    if (!socket.connected) {
      setRoomError(ROOM_ERROR_MESSAGES.NOT_CONNECTED);
      return;
    }

    setRoomError("");
    setPendingAction(action);

    socket.emit(event, payload);

    clearTimeout(requestTimerRef.current);

    requestTimerRef.current = setTimeout(() => {
      setPendingAction(null);
      setRoomError(ROOM_ERROR_MESSAGES.TIMEOUT);
    }, ROOM_REQUEST_TIMEOUT);
  }

  function handleQuickMatch() {
    sendRoomRequest("quick", "quickMatch");
  }

  function handleJoinWithCode(code) {
    sendRoomRequest("join", "joinRoom", code);
  }

  function handleArtistNameChange(name) {
    if (!isLoggedIn) {
      return;
    }

    setArtistName(name);
    localNameRef.current = name;

    // ชื่อว่าง server ไม่ตอบกลับ -> ไม่ต้องส่ง
    if (!name.trim()) {
      return;
    }

    pendingProfileEchoesRef.current += 1;
    socket.emit("setPlayerName", name);
  }

  function handleAvatarChange(newAvatar) {
    setAvatar(newAvatar);

    pendingProfileEchoesRef.current += 1;
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
