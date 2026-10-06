import { useEffect, useMemo, useRef, useState } from "react";

import { useLocation, useNavigate } from "react-router-dom";

import Header from "../components/Header";
import Footer from "../components/Footer";
import DrawingBoard from "../components/DrawingBoard";
import socket, {
  clearSession,
  isResumeRetrying,
  resumeSession,
} from "../socket";

const GUESS_ERROR_MESSAGES = {
  NOT_DRAWING_PHASE: "Wait for the drawing round.",
  DRAWER_CANNOT_GUESS: "The artist can't guess.",
  PLAYER_NOT_IN_GAME: "You are watching this game.",
  EMPTY_GUESS: "Type a guess first.",
};

function makeSystemMessage(text) {
  return {
    id: `system-${Date.now()}-${Math.random()}`,
    type: "system",
    text,
  };
}

/*
 * รวม message ใหม่เข้ากับของเดิม โดยไม่ซ้ำ id
 */
function mergeMessages(previous, incoming) {
  const ids = new Set(previous.map((message) => message.id));

  const added = incoming.filter((message) => message && !ids.has(message.id));

  return added.length ? [...previous, ...added] : previous;
}

function Game() {
  const location = useLocation();
  const navigate = useNavigate();

  const initialRoom = location.state?.room || null;

  const [room, setRoom] = useState(initialRoom);
  const [gameState, setGameState] = useState(null);
  const [wordOptions, setWordOptions] = useState([]);
  const [drawerWord, setDrawerWord] = useState("");
  const [guess, setGuess] = useState("");
  const [guessMessage, setGuessMessage] = useState("");
  const [chatMessages, setChatMessages] = useState([]);
  const [now, setNow] = useState(() => Date.now());
  const [connected, setConnected] = useState(socket.connected);
  const [turnId, setTurnId] = useState(null);

  const roomRef = useRef(initialRoom);
  const gameStateRef = useRef(null);
  const resultNavigatedRef = useRef(false);

  /*
   * --------------------------------------------------
   * Keep latest room / game state in refs
   * --------------------------------------------------
   */

  useEffect(() => {
    roomRef.current = room;
  }, [room]);

  useEffect(() => {
    gameStateRef.current = gameState;
  }, [gameState]);

  /*
   * --------------------------------------------------
   * Players
   * --------------------------------------------------
   */

  const players = useMemo(() => {
    if (!room?.players) {
      return [];
    }

    if (Array.isArray(room.players)) {
      return room.players;
    }

    return Object.values(room.players);
  }, [room]);

  /*
   * --------------------------------------------------
   * Current player
   * --------------------------------------------------
   */

  const currentSocketId = socket.id;
  const isDrawer = gameState?.drawerId === currentSocketId;

  const totalRounds = gameState?.totalRounds || 0;
  const currentRound = gameState?.round || 1;

  const guessedPlayers = useMemo(
    () => new Set(gameState?.guessedPlayers || []),
    [gameState?.guessedPlayers],
  );

  /*
   * --------------------------------------------------
   * Reset UI when NEW TURN starts
   *
   * ใช้ turnId จาก server (ไม่เปลี่ยนตอน reconnect)
   * และปรับ state ระหว่าง render แทน useEffect
   * --------------------------------------------------
   */

  if (gameState?.turnId !== undefined && gameState.turnId !== turnId) {
    setTurnId(gameState.turnId);
    setGuessMessage("");
    setChatMessages([]);
    setDrawerWord("");
  }

  /*
   * --------------------------------------------------
   * Word hint
   * --------------------------------------------------
   */

  const wordHint = useMemo(() => {
    if (isDrawer) {
      return drawerWord || "";
    }

    if (gameState?.hint) {
      return gameState.hint;
    }

    if (gameState?.wordHint) {
      return gameState.wordHint;
    }

    const length = gameState?.wordLength || 0;

    if (!length) {
      return "";
    }

    return Array(length).fill("_").join(" ");
  }, [
    isDrawer,
    drawerWord,
    gameState?.hint,
    gameState?.wordHint,
    gameState?.wordLength,
  ]);

  /*
   * --------------------------------------------------
   * Timer
   * --------------------------------------------------
   */

  const phaseEndsAt = gameState?.phaseEndsAt || 0;

  const timeLeft = phaseEndsAt
    ? Math.max(0, Math.ceil((phaseEndsAt - now) / 1000))
    : 0;

  useEffect(() => {
    if (!phaseEndsAt) {
      return;
    }

    const timer = setInterval(() => {
      setNow(Date.now());
    }, 250);

    return () => {
      clearInterval(timer);
    };
  }, [phaseEndsAt]);

  /*
   * --------------------------------------------------
   * Socket events
   * --------------------------------------------------
   */

  useEffect(() => {
    function requestGameState() {
      if (!socket.connected) {
        return;
      }

      socket.emit("requestGameState");
    }

    /*
     * Connect
     */

    function handleConnect() {
      setConnected(true);

      // socket ใหม่ (refresh / หลุด) ต้อง resume ก่อน
      // server จะส่ง game state มาให้เองหลัง resume สำเร็จ
      if (!resumeSession()) {
        requestGameState();
      }
    }

    function handleRoomResumed(resumedRoom) {
      if (!resumedRoom) {
        return;
      }

      // เกมจบไปแล้วระหว่างที่หลุด -> กลับห้องรอ
      if (resumedRoom.status === "waiting") {
        navigate("/waiting-room", {
          replace: true,
          state: {
            room: resumedRoom,
          },
        });

        return;
      }

      roomRef.current = resumedRoom;
      setRoom(resumedRoom);
    }

    function handleResumeFailed() {
      if (isResumeRetrying()) {
        return;
      }

      clearSession();
      navigate("/", { replace: true });
    }

    /*
     * Disconnect
     */

    function handleDisconnect() {
      setConnected(false);
    }

    /*
     * Game started
     */

    function handleGameStarted(data) {
      if (data?.room) {
        roomRef.current = data.room;
        setRoom(data.room);
      }

      requestGameState();
    }

    /*
     * Game state
     */

    function handleGameState(state) {
      if (!state) {
        return;
      }

      const nextGameState = state.game || state;

      gameStateRef.current = nextGameState;
      setGameState(nextGameState);

      if (state.room) {
        roomRef.current = state.room;
        setRoom(state.room);
      }

    }

    /*
     * --------------------------------------------------
     * GAME FINISHED
     *
     * Server จะส่ง event นี้ตอนเกมจบ
     *
     * ไม่ emit leaveRoom ที่นี่
     * เพราะ Server จะลบ room ให้เอง
     * --------------------------------------------------
     */

    function handleGameFinished(data) {
      if (resultNavigatedRef.current) {
        return;
      }

      resultNavigatedRef.current = true;

      // ไม่ clear session: ยังอยู่ในห้องเดิม กลับไปเล่นรอบใหม่ได้

      const finalPlayers = Array.isArray(data?.players) ? data.players : [];

      const finalScores = data?.scores || {};

      navigate("/result", {
        replace: true,
        state: {
          players: finalPlayers,
          scores: finalScores,
          room: data?.room || roomRef.current,
        },
      });
    }
    /*
     * Word options
     */

    function handleWordOptions(options) {
      setWordOptions(Array.isArray(options) ? options : []);
    }

    /*
     * Drawer word
     */

    function handleDrawerWord(data) {
      if (!data) {
        setDrawerWord("");
        return;
      }

      if (typeof data === "string") {
        setDrawerWord(data);
        return;
      }

      setDrawerWord(data.word || "");
    }

    /*
     * Room updated
     */

    function handleRoomUpdated(updatedRoom) {
      if (!updatedRoom) {
        return;
      }

      roomRef.current = updatedRoom;
      setRoom(updatedRoom);
    }

    /*
     * Guess result
     */

    function handleGuessResult(result) {
      if (!result) {
        return;
      }

      if (result.correct) {
        setGuessMessage(`✓ Correct! +${result.points || 0} pts`);
        return;
      }

      if (result.alreadyGuessed) {
        setGuessMessage("You already guessed the word.");
        return;
      }

      if (result.error) {
        setGuessMessage(GUESS_ERROR_MESSAGES[result.error] || result.error);
        return;
      }

      setGuessMessage("Wrong guess.");
    }

    /*
     * Player guessed correctly
     */

    function handlePlayerGuessedCorrectly(data) {
      if (!data) {
        return;
      }

      const message = data.message || {
        id: `${Date.now()}-${data.playerId}`,
        type: "correct",
        playerId: data.playerId,
        playerName: data.playerName || "Player",
        points: data.points || 0,
      };

      setChatMessages((previous) => mergeMessages(previous, [message]));
    }

    /*
     * Chat
     */

    function handleChatMessage(message) {
      if (!message) {
        return;
      }

      setChatMessages((previous) => mergeMessages(previous, [message]));
    }

    /*
     * Guess history (ตอนโหลดหน้า / reconnect)
     */

    function handleGuessHistory(history) {
      if (!Array.isArray(history)) {
        return;
      }

      setChatMessages((previous) => mergeMessages(previous, history));
    }

    /*
     * Game error
     */

    function handleGameError(message) {
      const text =
        typeof message === "string"
          ? message
          : message?.message || message?.error || "Game error.";

      setGuessMessage(text);
    }

    /*
     * Player disconnected
     */

    function handlePlayerDisconnected(data) {
      if (!data) {
        return;
      }

      setChatMessages((previous) => [
        ...previous,
        makeSystemMessage(`${data.playerName || "A player"} disconnected.`),
      ]);
    }

    function handlePlayerLeft(data) {
      setChatMessages((previous) => [
        ...previous,
        makeSystemMessage(`${data?.playerName || "A player"} left the game.`),
      ]);
    }

    function handlePlayerReconnected(data) {
      setChatMessages((previous) => [
        ...previous,
        makeSystemMessage(
          `${data?.player?.name || "A player"} reconnected.`,
        ),
      ]);
    }

    /*
     * Register
     */

    socket.on("connect", handleConnect);

    socket.on("disconnect", handleDisconnect);

    socket.on("gameStarted", handleGameStarted);

    socket.on("gameState", handleGameState);

    socket.on("gameFinished", handleGameFinished);

    socket.on("wordOptions", handleWordOptions);

    socket.on("drawerWord", handleDrawerWord);

    socket.on("roomUpdated", handleRoomUpdated);

    socket.on("guessResult", handleGuessResult);

    socket.on("playerGuessedCorrectly", handlePlayerGuessedCorrectly);

    socket.on("chatMessage", handleChatMessage);

    socket.on("gameError", handleGameError);

    socket.on("playerDisconnected", handlePlayerDisconnected);

    socket.on("playerLeft", handlePlayerLeft);

    socket.on("playerReconnected", handlePlayerReconnected);

    socket.on("guessHistory", handleGuessHistory);

    socket.on("roomResumed", handleRoomResumed);

    socket.on("resumeFailed", handleResumeFailed);

    if (socket.connected) {
      handleConnect();
    }

    /*
     * Cleanup
     */

    return () => {
      socket.off("connect", handleConnect);

      socket.off("disconnect", handleDisconnect);

      socket.off("gameStarted", handleGameStarted);

      socket.off("gameState", handleGameState);

      socket.off("gameFinished", handleGameFinished);

      socket.off("wordOptions", handleWordOptions);

      socket.off("drawerWord", handleDrawerWord);

      socket.off("roomUpdated", handleRoomUpdated);

      socket.off("guessResult", handleGuessResult);

      socket.off("playerGuessedCorrectly", handlePlayerGuessedCorrectly);

      socket.off("chatMessage", handleChatMessage);

      socket.off("gameError", handleGameError);

      socket.off("playerDisconnected", handlePlayerDisconnected);

      socket.off("playerLeft", handlePlayerLeft);

      socket.off("playerReconnected", handlePlayerReconnected);

      socket.off("guessHistory", handleGuessHistory);

      socket.off("roomResumed", handleRoomResumed);

      socket.off("resumeFailed", handleResumeFailed);
    };
  }, [navigate]);

  /*
   * --------------------------------------------------
   * Select word
   * --------------------------------------------------
   */

  function handleSelectWord(word) {
    if (!word) {
      return;
    }

    socket.emit("selectWord", word);
  }

  /*
   * --------------------------------------------------
   * Submit guess
   * --------------------------------------------------
   */

  function handleSubmitGuess(event) {
    event.preventDefault();

    const value = guess.trim();

    if (!value || isDrawer || gameState?.phase !== "draw-and-guess") {
      return;
    }

    socket.emit("submitGuess", value);

    setGuess("");
  }

  /*
   * --------------------------------------------------
   * Leave
   * --------------------------------------------------
   */

  function handleLeave() {
    socket.emit("leaveRoom");
    clearSession();
    navigate("/");
  }

  /*
   * --------------------------------------------------
   * Phase text
   * --------------------------------------------------
   */

  const stageText =
    gameState?.phase === "choose-word"
      ? "CHOOSE YOUR WORD"
      : gameState?.phase === "draw-and-guess"
        ? isDrawer
          ? "YOU ARE DRAWING!"
          : "GUESS THE DRAWING!"
        : "MATCH STAGE";

  const wordText =
    isDrawer && drawerWord
      ? drawerWord
      : gameState?.phase === "choose-word"
        ? "Choose a word"
        : gameState?.phase === "draw-and-guess"
          ? wordHint
          : "Game Complete";

  /*
   * --------------------------------------------------
   * Player status
   * --------------------------------------------------
   */

  function getPlayerStatus(player) {
    if (player.id === gameState?.drawerId) {
      return "Artist • Drawing";
    }

    if (guessedPlayers.has(player.id)) {
      return "Solved!";
    }

    if (gameState?.phase === "draw-and-guess") {
      return "Guessing...";
    }

    if (gameState?.phase === "choose-word") {
      return "Waiting...";
    }

    return "Finished";
  }

  function getPlayerScore(player) {
    return gameState?.scores?.[player.id] || 0;
  }

  /*
   * --------------------------------------------------
   * Loading
   * --------------------------------------------------
   */

  if (!gameState) {
    return (
      <div className="flex min-h-screen flex-col bg-white text-[#1b1b1b]">
        <Header />

        <main className="flex flex-1 items-center justify-center px-6">
          <div className="text-center">
            <p className="text-xl font-bold">Loading Game...</p>

            {!connected && (
              <p className="mt-2 text-sm text-[#c62828]">
                Reconnecting to server...
              </p>
            )}

            {connected && (
              <p className="mt-2 text-sm text-[#666666]">
                Connecting to game...
              </p>
            )}
          </div>
        </main>

        <Footer />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col border-[3px] border-[#111111] bg-white font-sans text-[#1b1b1b]">
      {/* HEADER */}

      <div className="flex items-center justify-between border-b-[3px] border-[#111111] px-6 py-4">
        <h1 className="text-4xl font-black tracking-tight">Picasso?</h1>

        <button
          type="button"
          onClick={handleLeave}
          className="rounded-full border-[3px] border-[#111111] bg-white px-8 py-3 text-lg font-bold transition hover:bg-[#111111] hover:text-white"
        >
          Leave
        </button>
      </div>

      {/* GAME BAR */}

      <section className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 px-8 pb-3 pt-6">
        <div className="flex items-center gap-4">
          <div className="grid h-12 w-12 place-items-center rounded-full bg-[#ebebeb] text-xl">
            🎲
          </div>

          <div>
            <p className="text-xs font-semibold tracking-wider text-[#666666]">
              MATCH STAGE
              <span className="ml-1 inline-block h-1.5 w-1.5 rounded-full bg-[#2a7a5a]" />
            </p>

            <p className="text-2xl font-medium">
              Round {currentRound}{" "}
              <span className="text-lg text-[#666666]">of {totalRounds}</span>
            </p>

            {gameState?.turnsPerRound > 0 && (
              <p className="text-xs text-[#666666]">
                Artist {gameState.turn} of {gameState.turnsPerRound}
              </p>
            )}
          </div>
        </div>

        <div className="min-w-[280px] rounded-2xl border-[3px] border-[#111111] bg-white px-10 py-3 text-center shadow-[0_4px_0_#111111]">
          <p className="text-xs font-semibold">{stageText}</p>

          <p className="text-2xl font-bold tracking-wide">{wordText}</p>
        </div>

        <div className="flex items-center justify-self-end gap-4 rounded-full border-2 border-[#111111] bg-white px-4 py-2 shadow-[0_3px_0_#d4d4d4]">
          <div
            className="relative grid h-12 w-12 place-items-center rounded-full font-semibold"
            style={{
              background: `conic-gradient(#111111 ${Math.max(
                0,
                Math.min(
                  100,
                  (timeLeft /
                    Math.max(
                      1,
                      gameState.phase === "choose-word"
                        ? 15
                        : room?.settings?.drawingTime || 60,
                    )) *
                    100,
                ),
              )}%, #d4d4d4 0)`,
            }}
          >
            <div className="absolute inset-[5px] rounded-full bg-white" />

            <span className="relative z-10">{timeLeft}</span>
          </div>

          <div>
            <p className="text-[10px] tracking-wider text-[#666666]">
              TIME REMAINING
            </p>

            <p className="text-xl font-medium">{timeLeft}s</p>
          </div>
        </div>
      </section>

      {/* WORD HINT */}

      <section className="mx-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-[#ebebeb] px-6 py-3 text-sm">
        <p>
          <span className="font-semibold tracking-wide text-[#666666]">
            GUESSER FEED:
          </span>

          <span className="ml-4 inline-flex items-center gap-2 font-bold tracking-wider">
            {isDrawer ? drawerWord : wordHint}
          </span>
        </p>

        <p className="font-medium">
          💡 Hint:{" "}
          {gameState?.wordLength
            ? `${gameState.wordLength} letters`
            : "Guess the drawing"}
        </p>
      </section>

      {/* MAIN */}

      <main className="grid min-h-[650px] flex-1 grid-cols-[300px_minmax(0,1fr)_300px] gap-4 px-6 pb-6 pt-5">
        {/* PLAYERS */}

        <aside className="flex min-h-0 flex-col gap-3 rounded-[24px] bg-[#ebebeb] p-4">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-xl font-medium">👥 Players</h2>

            <span className="rounded-lg bg-[#d4d4d4] px-3 py-1 text-xs">
              {players.length} / 8 Active
            </span>
          </div>

          <div className="flex flex-col gap-2 overflow-y-auto">
            {players.map((player) => {
              const solved = guessedPlayers.has(player.id);

              const self = player.id === currentSocketId;

              const drawer = player.id === gameState.drawerId;

              const score = getPlayerScore(player);

              return (
                <div
                  key={player.id}
                  className={`flex items-center gap-3 p-3 shadow-[0_2px_3px_rgba(0,0,0,0.08)] ${
                    solved
                      ? "border-b-[3px] border-[#7d7a25] bg-[#e8f79c]"
                      : "bg-white"
                  }`}
                >
                  <div
                    className="relative grid h-11 w-11 shrink-0 place-items-center rounded-full text-xl"
                    style={{
                      backgroundColor: player.avatar?.furColor || "#d4d4d4",
                    }}
                  >
                    🐱
                    {drawer && (
                      <span className="absolute -bottom-1 -right-1 grid h-5 w-5 place-items-center rounded-full bg-[#a2401c] text-xs text-white">
                        ✎
                      </span>
                    )}
                    {solved && (
                      <span className="absolute -bottom-1 -right-1 grid h-5 w-5 place-items-center rounded-full bg-[#7d7a25] text-xs text-white">
                        ✓
                      </span>
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">
                      {player.name || "Player"}

                      {self && (
                        <span className="ml-1 text-xs font-medium text-[#a2401c]">
                          (You)
                        </span>
                      )}

                      {solved && (
                        <span className="ml-1 rounded bg-[#7d7a25] px-1 text-[9px] text-white">
                          SOLVED!
                        </span>
                      )}
                    </p>

                    <p
                      className={`text-sm ${
                        solved ? "text-[#5c5a12]" : "text-[#666666]"
                      }`}
                    >
                      {getPlayerStatus(player)}
                    </p>
                  </div>

                  <p
                    className={`text-right text-xl font-medium leading-none ${
                      self ? "text-[#a2401c]" : ""
                    }`}
                  >
                    {score.toLocaleString()}

                    <small className="block text-xs text-[#666666]">pts</small>
                  </p>
                </div>
              );
            })}
          </div>
        </aside>

        {/* DRAWING BOARD */}

        <section className="flex min-h-0 flex-col gap-3 rounded-[24px] bg-[#ebebeb] p-4">
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled
              className="grid h-10 w-10 place-items-center rounded-full border-2 border-[#111111] bg-white text-xl opacity-50"
              title="Undo"
            >
              ↶
            </button>

            <button
              type="button"
              disabled
              className="grid h-10 w-10 place-items-center rounded-full border-2 border-[#111111] bg-white text-xl opacity-50"
              title="Redo"
            >
              ↷
            </button>

            <span className="mx-1 h-6 w-px bg-[#d4d4d4]" />

            <span className="rounded-full bg-white px-4 py-2 text-xs font-semibold">
              {isDrawer ? "✎ You are drawing" : "👀 Watch the artist"}
            </span>
          </div>

          <div className="relative min-h-[420px] flex-1 overflow-hidden rounded-[28px] bg-white shadow-[0_0_0_1px_#d4d4d4]">
            <div className="absolute left-3 top-3 z-10 rounded-full border-2 border-[#111111] bg-white px-4 py-1 text-xs font-semibold">
              {isDrawer
                ? "✎ You are sketching..."
                : `${
                    players.find((player) => player.id === gameState.drawerId)
                      ?.name || "Player"
                  } is sketching...`}
            </div>

            <div className="h-full w-full p-0">
              <DrawingBoard
                disabled={!isDrawer || gameState.phase !== "draw-and-guess"}
              />
            </div>
          </div>
        </section>

        {/* CHAT */}

        <aside className="flex min-h-0 flex-col gap-3 rounded-[24px] bg-[#ebebeb] p-4">
          <div className="px-1">
            <h2 className="text-xl font-medium">💬 Guesses & Chat</h2>
          </div>

          <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
            {chatMessages.length === 0 && (
              <div className="rounded-lg bg-[#d4d4d4] px-3 py-2 text-center text-xs text-[#666666]">
                No guesses yet.
              </div>
            )}

            {chatMessages.map((message) => {
              if (message.type === "system") {
                return (
                  <div
                    key={message.id}
                    className="flex justify-center bg-[#d4d4d4] px-3 py-2 text-xs font-medium"
                  >
                    {message.text}
                  </div>
                );
              }

              if (message.type === "correct") {
                return (
                  <div
                    key={message.id}
                    className="flex flex-wrap items-center gap-2 border-b-[3px] border-[#7d7a25] bg-[#e8f79c] px-3 py-2 text-sm text-[#5c5a12]"
                  >
                    <span className="font-semibold">
                      🎉 {message.playerName}
                    </span>

                    <span>guessed the word!</span>

                    <span className="font-semibold">+{message.points}</span>
                  </div>
                );
              }

              return (
                <div
                  key={message.id}
                  className="flex flex-wrap items-center gap-2 bg-white px-3 py-2 text-sm"
                >
                  <span className="font-semibold">{message.playerName}:</span>

                  <span className="flex-1 break-words">{message.text}</span>

                  <span className="font-bold text-[#c62828]">✕</span>
                </div>
              );
            })}
          </div>

          {isDrawer ? (
            <div className="rounded-2xl bg-[#d4d4d4] px-4 py-4 text-center text-sm font-semibold text-[#666666]">
              ✎ You are drawing.
              <br />
              Wait for the other players to guess.
            </div>
          ) : gameState.phase === "draw-and-guess" ? (
            <form onSubmit={handleSubmitGuess} className="flex flex-col gap-2">
              <div className="flex items-center gap-2 rounded-full border-[3px] border-[#111111] bg-white p-2 pl-4">
                <input
                  type="text"
                  value={guess}
                  onChange={(event) => setGuess(event.target.value)}
                  placeholder="Type your guess here..."
                  autoComplete="off"
                  disabled={guessedPlayers.has(currentSocketId)}
                  className="min-w-0 flex-1 bg-transparent text-sm outline-none"
                />

                <button
                  type="submit"
                  disabled={guessedPlayers.has(currentSocketId)}
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#111111] text-white disabled:opacity-40"
                >
                  🐾
                </button>
              </div>

              {guessMessage && (
                <p className="px-2 text-center text-xs font-semibold text-[#666666]">
                  {guessMessage}
                </p>
              )}
            </form>
          ) : (
            <div className="rounded-2xl bg-[#d4d4d4] px-4 py-4 text-center text-sm font-semibold text-[#666666]">
              Waiting for the drawing round...
            </div>
          )}
        </aside>
      </main>

      {/* CHOOSE WORD */}

      {gameState.phase === "choose-word" && isDrawer && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/30 px-6">
          <div className="w-full max-w-[520px] rounded-[24px] border-[3px] border-[#111111] bg-white p-7 shadow-[0_8px_0_#111111]">
            <p className="text-center text-sm font-semibold text-[#666666]">
              YOUR TURN
            </p>

            <h2 className="mt-1 text-center text-3xl font-bold">
              Choose a word
            </h2>

            <p className="mt-2 text-center text-sm text-[#666666]">
              Pick what you want to draw.
            </p>

            <div className="mt-6 grid gap-3">
              {wordOptions.map((word) => (
                <button
                  key={word}
                  type="button"
                  onClick={() => handleSelectWord(word)}
                  className="rounded-full border-[3px] border-[#111111] bg-white px-5 py-4 text-lg font-bold transition hover:bg-[#a2401c] hover:text-white"
                >
                  {word}
                </button>
              ))}
            </div>

            <p className="mt-5 text-center text-xs text-[#666666]">
              Choose quickly before the timer runs out.
            </p>
          </div>
        </div>
      )}

      <Footer />
    </div>
  );
}

export default Game;
