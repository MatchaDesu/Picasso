import { useEffect, useRef, useState } from "react"
import {
  useLocation,
  useNavigate,
} from "react-router-dom"

import socket from "../socket"

function Game() {
  const location =
    useLocation()

  const navigate =
    useNavigate()

  const room =
    location.state?.room

  const canvasRef =
    useRef(null)

  const canvasContainerRef =
    useRef(null)

  const isDrawingRef =
    useRef(false)

  const lastPositionRef =
    useRef({
      x: 0,
      y: 0,
    })

  const undoStackRef =
    useRef([])

  const redoStackRef =
    useRef([])

  const timerRef =
    useRef(null)

  const [selectedColor, setSelectedColor] =
    useState("#1b1b1b")

  const [brushSize, setBrushSize] =
    useState(8)

  const [tool, setTool] =
    useState("draw")

  const [artistId, setArtistId] =
    useState(
      location.state?.artistId ||
        room?.artistId ||
        null
    )

  const [currentRound, setCurrentRound] =
    useState(
      location.state?.currentRound ||
        room?.currentRound ||
        1
    )

  const [phase, setPhase] =
    useState(
      room?.phase ||
        "choosing"
    )

  const [timeRemaining, setTimeRemaining] =
    useState(
      room?.drawingTime ||
        60
    )

  const [currentWord, setCurrentWord] =
    useState("")

  const [hint, setHint] =
    useState("")

  const [wordLength, setWordLength] =
    useState(0)

  const [wordChoices, setWordChoices] =
    useState([])

  const [guess, setGuess] =
    useState("")

  const [guessMessages, setGuessMessages] =
    useState([])

  const [hasGuessedCorrectly, setHasGuessedCorrectly] =
    useState(false)

  const [scorePopup, setScorePopup] =
    useState(null)

  const [players, setPlayers] =
    useState(
      room?.players || []
    )

  const colors = [
    "#1b1b1b",
    "#ffffff",
    "#5a4238",
    "#b8973f",
    "#a2401c",
    "#ee7141",
    "#f0b09a",
    "#f8dc9c",
    "#6f5c15",
    "#98f0ea",
    "#28635f",
    "#6fd0c6",
    "#b62a25",
    "#f9dcdc",
    "#8b7268",
  ]

  /*
  |--------------------------------------------------------------------------
  | Current Player
  |--------------------------------------------------------------------------
  */

  const currentPlayer =
    players.find(
      (player) =>
        player.id ===
        socket.id
    )

  const isArtist =
    currentPlayer?.id ===
    artistId

  /*
  |--------------------------------------------------------------------------
  | Local Timer
  |--------------------------------------------------------------------------
  */

  const startLocalTimer = (
    roundEndsAt
  ) => {
    if (
      timerRef.current
    ) {
      clearInterval(
        timerRef.current
      )
    }

    const updateTimer = () => {
      const remainingMs =
        roundEndsAt -
        Date.now()

      const remainingSeconds =
        Math.max(
          0,
          Math.ceil(
            remainingMs /
              1000
          )
        )

      setTimeRemaining(
        remainingSeconds
      )
    }

    updateTimer()

    timerRef.current =
      setInterval(
        updateTimer,
        250
      )
  }

  /*
  |--------------------------------------------------------------------------
  | Canvas Resize
  |--------------------------------------------------------------------------
  */

  useEffect(() => {
    const canvas =
      canvasRef.current

    const container =
      canvasContainerRef.current

    if (
      !canvas ||
      !container
    ) {
      return
    }

    const resizeCanvas = () => {
      const rect =
        container.getBoundingClientRect()

      const oldCanvas =
        document.createElement(
          "canvas"
        )

      oldCanvas.width =
        canvas.width

      oldCanvas.height =
        canvas.height

      if (
        canvas.width > 0 &&
        canvas.height > 0
      ) {
        const oldContext =
          oldCanvas.getContext(
            "2d"
          )

        oldContext.drawImage(
          canvas,
          0,
          0
        )
      }

      const devicePixelRatio =
        window.devicePixelRatio ||
        1

      canvas.width =
        rect.width *
        devicePixelRatio

      canvas.height =
        rect.height *
        devicePixelRatio

      canvas.style.width =
        `${rect.width}px`

      canvas.style.height =
        `${rect.height}px`

      const context =
        canvas.getContext(
          "2d"
        )

      context.setTransform(
        devicePixelRatio,
        0,
        0,
        devicePixelRatio,
        0,
        0
      )

      context.lineCap =
        "round"

      context.lineJoin =
        "round"

      if (
        oldCanvas.width > 0 &&
        oldCanvas.height > 0
      ) {
        context.drawImage(
          oldCanvas,
          0,
          0,
          oldCanvas.width,
          oldCanvas.height,
          0,
          0,
          rect.width,
          rect.height
        )
      }
    }

    resizeCanvas()

    const observer =
      new ResizeObserver(
        resizeCanvas
      )

    observer.observe(
      container
    )

    return () => {
      observer.disconnect()
    }
  }, [])

  /*
  |--------------------------------------------------------------------------
  | Draw Line
  |--------------------------------------------------------------------------
  */

  const drawLine = ({
    x0,
    y0,
    x1,
    y1,
    color,
    size,
    tool,
  }) => {
    const canvas =
      canvasRef.current

    if (!canvas) {
      return
    }

    const rect =
      canvas.getBoundingClientRect()

    const startX =
      x0 * rect.width

    const startY =
      y0 * rect.height

    const endX =
      x1 * rect.width

    const endY =
      y1 * rect.height

    const context =
      canvas.getContext(
        "2d"
      )

    context.beginPath()

    context.moveTo(
      startX,
      startY
    )

    context.lineTo(
      endX,
      endY
    )

    context.strokeStyle =
      tool === "eraser"
        ? "#ffffff"
        : color

    context.lineWidth =
      size

    context.lineCap =
      "round"

    context.lineJoin =
      "round"

    context.stroke()
  }

  /*
  |--------------------------------------------------------------------------
  | Socket Events
  |--------------------------------------------------------------------------
  */

  useEffect(() => {
    if (!room?.code) {
      return
    }

    /*
    |--------------------------------------------------------------------------
    | Remote Draw
    |--------------------------------------------------------------------------
    */

    const handleRemoteDraw = (
      data
    ) => {
      drawLine(data)
    }

    /*
    |--------------------------------------------------------------------------
    | Clear Canvas
    |--------------------------------------------------------------------------
    */

    const handleRemoteClear =
      () => {
        const canvas =
          canvasRef.current

        if (!canvas) {
          return
        }

        const context =
          canvas.getContext(
            "2d"
          )

        const rect =
          canvas.getBoundingClientRect()

        context.clearRect(
          0,
          0,
          rect.width,
          rect.height
        )
      }

    /*
    |--------------------------------------------------------------------------
    | Choosing Word
    |--------------------------------------------------------------------------
    */

    const handleRoundChoosing = ({
      room: choosingRoom,
      currentRound:
        choosingRound,
      artistId:
        choosingArtistId,
    }) => {
      console.log(
        "================================"
      )

      console.log(
        "CHOOSING WORD"
      )

      console.log(
        "Round:",
        choosingRound
      )

      console.log(
        "Artist:",
        choosingArtistId
      )

      console.log(
        "Players:",
        choosingRoom?.players
      )

      console.log(
        "================================"
      )

      /*
      | Sync players immediately.
      */

      if (
        choosingRoom?.players
      ) {
        setPlayers(
          choosingRoom.players
        )
      }

      setPhase(
        "choosing"
      )

      setCurrentRound(
        choosingRound
      )

      setArtistId(
        choosingArtistId
      )

      setCurrentWord(
        ""
      )

      setHint(
        ""
      )

      setWordLength(
        0
      )

      setWordChoices(
        []
      )

      setGuess(
        ""
      )

      setHasGuessedCorrectly(
        false
      )

      setGuessMessages(
        []
      )

      setScorePopup(
        null
      )

      setTimeRemaining(
        room.drawingTime
      )

      undoStackRef.current =
        []

      redoStackRef.current =
        []

      /*
      | Clear local canvas.
      */

      const canvas =
        canvasRef.current

      if (canvas) {
        const context =
          canvas.getContext(
            "2d"
          )

        const rect =
          canvas.getBoundingClientRect()

        context.clearRect(
          0,
          0,
          rect.width,
          rect.height
        )
      }

      if (
        timerRef.current
      ) {
        clearInterval(
          timerRef.current
        )
      }
    }

    /*
    |--------------------------------------------------------------------------
    | Word Choices
    |--------------------------------------------------------------------------
    */

    const handleWordChoices = ({
      choices,
    }) => {
      console.log(
        "Word choices:",
        choices
      )

      setWordChoices(
        choices || []
      )
    }

    /*
    |--------------------------------------------------------------------------
    | Drawing Started
    |--------------------------------------------------------------------------
    */

    const handleRoundStarted = ({
      room: startedRoom,
      currentRound:
        startedRound,
      artistId:
        startedArtistId,
      roundEndsAt,
      hint:
        startedHint,
      wordLength:
        startedWordLength,
    }) => {
      console.log(
        "================================"
      )

      console.log(
        "DRAWING STARTED"
      )

      console.log(
        "Round:",
        startedRound
      )

      console.log(
        "Artist:",
        startedArtistId
      )

      console.log(
        "Players:",
        startedRoom?.players
      )

      console.log(
        "================================"
      )

      if (
        startedRoom?.players
      ) {
        setPlayers(
          startedRoom.players
        )
      }

      setPhase(
        "drawing"
      )

      setCurrentRound(
        startedRound
      )

      setArtistId(
        startedArtistId
      )

      setHint(
        startedHint
      )

      setWordLength(
        startedWordLength
      )

      setWordChoices(
        []
      )

      setCurrentWord(
        ""
      )

      setGuess(
        ""
      )

      setHasGuessedCorrectly(
        false
      )

      setGuessMessages(
        []
      )

      undoStackRef.current =
        []

      redoStackRef.current =
        []

      setScorePopup(
        null
      )

      startLocalTimer(
        roundEndsAt
      )
    }

    /*
    |--------------------------------------------------------------------------
    | Artist Word
    |--------------------------------------------------------------------------
    */

    const handleArtistWord = ({
      word,
    }) => {
      setCurrentWord(
        word
      )
    }

    /*
    |--------------------------------------------------------------------------
    | Player Guess
    |--------------------------------------------------------------------------
    */

    const handlePlayerGuess = ({
      playerName,
      guess,
      correct,
    }) => {
      setGuessMessages(
        (messages) => [
          ...messages,
          {
            type:
              correct
                ? "correct"
                : "guess",

            playerName,

            guess,
          },
        ]
      )
    }

    /*
    |--------------------------------------------------------------------------
    | Correct Guess
    |--------------------------------------------------------------------------
    */

    const handleCorrectGuess = ({
      score,
    }) => {
      setHasGuessedCorrectly(
        true
      )

      setScorePopup(
        score
      )

      setTimeout(() => {
        setScorePopup(
          null
        )
      }, 2000)
    }

    /*
    |--------------------------------------------------------------------------
    | Player Guessed Correctly
    |--------------------------------------------------------------------------
    */

    const handlePlayerGuessedCorrectly = ({
      playerName,
    }) => {
      setGuessMessages(
        (messages) => [
          ...messages,
          {
            type:
              "correct",

            playerName,
          },
        ]
      )
    }

    /*
    |--------------------------------------------------------------------------
    | Players Updated
    |--------------------------------------------------------------------------
    */

    const handlePlayersUpdated = ({
      players:
        updatedPlayers,
    }) => {
      console.log(
        "Players updated:",
        updatedPlayers
      )

      if (
        Array.isArray(
          updatedPlayers
        )
      ) {
        setPlayers(
          updatedPlayers
        )
      }
    }

    /*
    |--------------------------------------------------------------------------
    | Game Finished
    |--------------------------------------------------------------------------
    */

    const handleGameFinished =
      ({
        room:
          finishedRoom,
      }) => {
        console.log(
          "Game finished"
        )

        if (
          timerRef.current
        ) {
          clearInterval(
            timerRef.current
          )
        }

        navigate(
          "/score",
          {
            state: {
              room:
                finishedRoom,
            },
          }
        )
      }

    /*
    |--------------------------------------------------------------------------
    | Register Events
    |--------------------------------------------------------------------------
    */

    socket.on(
      "draw",
      handleRemoteDraw
    )

    socket.on(
      "clearCanvas",
      handleRemoteClear
    )

    socket.on(
      "roundChoosing",
      handleRoundChoosing
    )

    socket.on(
      "wordChoices",
      handleWordChoices
    )

    socket.on(
      "roundStarted",
      handleRoundStarted
    )

    socket.on(
      "artistWord",
      handleArtistWord
    )

    socket.on(
      "playerGuess",
      handlePlayerGuess
    )

    socket.on(
      "correctGuess",
      handleCorrectGuess
    )

    socket.on(
      "playerGuessedCorrectly",
      handlePlayerGuessedCorrectly
    )

    socket.on(
      "playersUpdated",
      handlePlayersUpdated
    )

    socket.on(
      "gameFinished",
      handleGameFinished
    )

    /*
    |--------------------------------------------------------------------------
    | Cleanup
    |--------------------------------------------------------------------------
    */

    return () => {
      socket.off(
        "draw",
        handleRemoteDraw
      )

      socket.off(
        "clearCanvas",
        handleRemoteClear
      )

      socket.off(
        "roundChoosing",
        handleRoundChoosing
      )

      socket.off(
        "wordChoices",
        handleWordChoices
      )

      socket.off(
        "roundStarted",
        handleRoundStarted
      )

      socket.off(
        "artistWord",
        handleArtistWord
      )

      socket.off(
        "playerGuess",
        handlePlayerGuess
      )

      socket.off(
        "correctGuess",
        handleCorrectGuess
      )

      socket.off(
        "playerGuessedCorrectly",
        handlePlayerGuessedCorrectly
      )

      socket.off(
        "playersUpdated",
        handlePlayersUpdated
      )

      socket.off(
        "gameFinished",
        handleGameFinished
      )

      if (
        timerRef.current
      ) {
        clearInterval(
          timerRef.current
        )
      }
    }
  }, [
    room?.code,
    navigate,
  ])

  /*
  |--------------------------------------------------------------------------
  | Select Word
  |--------------------------------------------------------------------------
  */

  const handleSelectWord = (
    choice
  ) => {
    if (!isArtist) {
      return
    }

    if (
      phase !==
      "choosing"
    ) {
      return
    }

    if (
      !choice?.word
    ) {
      return
    }

    console.log(
      "Selected word:",
      choice.word
    )

    socket.emit(
      "selectWord",
      {
        word:
          choice.word,

        hint:
          choice.hint,
      }
    )

    /*
    | Hide choices immediately.
    | Server will confirm with roundStarted.
    */

    setWordChoices(
      []
    )
  }

  /*
  |--------------------------------------------------------------------------
  | Save Canvas
  |--------------------------------------------------------------------------
  */

  const saveCanvasState = () => {
    const canvas =
      canvasRef.current

    if (!canvas) {
      return
    }

    undoStackRef.current.push(
      canvas.toDataURL()
    )

    if (
      undoStackRef.current
        .length > 30
    ) {
      undoStackRef.current.shift()
    }

    redoStackRef.current =
      []
  }

  /*
  |--------------------------------------------------------------------------
  | Restore Canvas
  |--------------------------------------------------------------------------
  */

  const restoreCanvasState = (
    dataUrl
  ) => {
    const canvas =
      canvasRef.current

    if (!canvas) {
      return
    }

    const context =
      canvas.getContext(
        "2d"
      )

    const image =
      new Image()

    image.onload = () => {
      const rect =
        canvas.getBoundingClientRect()

      context.clearRect(
        0,
        0,
        rect.width,
        rect.height
      )

      context.drawImage(
        image,
        0,
        0,
        rect.width,
        rect.height
      )
    }

    image.src =
      dataUrl
  }

  /*
  |--------------------------------------------------------------------------
  | Undo
  |--------------------------------------------------------------------------
  */

  const handleUndo = () => {
    const canvas =
      canvasRef.current

    if (!canvas) {
      return
    }

    if (
      undoStackRef.current
        .length === 0
    ) {
      return
    }

    redoStackRef.current.push(
      canvas.toDataURL()
    )

    const previous =
      undoStackRef.current.pop()

    if (previous) {
      restoreCanvasState(
        previous
      )
    }
  }

  /*
  |--------------------------------------------------------------------------
  | Redo
  |--------------------------------------------------------------------------
  */

  const handleRedo = () => {
    const canvas =
      canvasRef.current

    if (!canvas) {
      return
    }

    if (
      redoStackRef.current
        .length === 0
    ) {
      return
    }

    undoStackRef.current.push(
      canvas.toDataURL()
    )

    const next =
      redoStackRef.current.pop()

    if (next) {
      restoreCanvasState(
        next
      )
    }
  }

  /*
  |--------------------------------------------------------------------------
  | Pointer Position
  |--------------------------------------------------------------------------
  */

  const getPointerPosition = (
    event
  ) => {
    const canvas =
      canvasRef.current

    const rect =
      canvas.getBoundingClientRect()

    return {
      x:
        event.clientX -
        rect.left,

      y:
        event.clientY -
        rect.top,
    }
  }

  /*
  |--------------------------------------------------------------------------
  | Pointer Down
  |--------------------------------------------------------------------------
  */

  const handlePointerDown = (
    event
  ) => {
    if (!isArtist) {
      return
    }

    if (
      phase !==
      "drawing"
    ) {
      return
    }

    const canvas =
      canvasRef.current

    if (!canvas) {
      return
    }

    if (
      tool !== "draw" &&
      tool !== "eraser"
    ) {
      return
    }

    saveCanvasState()

    canvas.setPointerCapture(
      event.pointerId
    )

    const position =
      getPointerPosition(
        event
      )

    isDrawingRef.current =
      true

    lastPositionRef.current =
      position

    const context =
      canvas.getContext(
        "2d"
      )

    context.beginPath()

    context.moveTo(
      position.x,
      position.y
    )

    context.lineTo(
      position.x + 0.01,
      position.y + 0.01
    )

    context.strokeStyle =
      tool === "eraser"
        ? "#ffffff"
        : selectedColor

    context.lineWidth =
      brushSize

    context.lineCap =
      "round"

    context.lineJoin =
      "round"

    context.stroke()
  }

  /*
  |--------------------------------------------------------------------------
  | Pointer Move
  |--------------------------------------------------------------------------
  */

  const handlePointerMove = (
    event
  ) => {
    if (
      !isDrawingRef.current
    ) {
      return
    }

    if (!isArtist) {
      return
    }

    if (
      phase !==
      "drawing"
    ) {
      return
    }

    const canvas =
      canvasRef.current

    if (!canvas) {
      return
    }

    const position =
      getPointerPosition(
        event
      )

    const rect =
      canvas.getBoundingClientRect()

    const previous =
      lastPositionRef.current

    const x0 =
      previous.x /
      rect.width

    const y0 =
      previous.y /
      rect.height

    const x1 =
      position.x /
      rect.width

    const y1 =
      position.y /
      rect.height

    const drawingData = {
      x0,
      y0,
      x1,
      y1,
      color:
        selectedColor,
      size:
        brushSize,
      tool,
    }

    drawLine(
      drawingData
    )

    if (
      socket.connected &&
      room?.code
    ) {
      socket.emit(
        "draw",
        {
          roomCode:
            room.code,

          ...drawingData,
        }
      )
    }

    lastPositionRef.current =
      position
  }

  /*
  |--------------------------------------------------------------------------
  | Pointer Up
  |--------------------------------------------------------------------------
  */

  const handlePointerUp = () => {
    isDrawingRef.current =
      false
  }

  /*
  |--------------------------------------------------------------------------
  | Clear
  |--------------------------------------------------------------------------
  */

  const handleClear = () => {
    if (!isArtist) {
      return
    }

    if (
      phase !==
      "drawing"
    ) {
      return
    }

    const canvas =
      canvasRef.current

    if (!canvas) {
      return
    }

    saveCanvasState()

    const context =
      canvas.getContext(
        "2d"
      )

    const rect =
      canvas.getBoundingClientRect()

    context.clearRect(
      0,
      0,
      rect.width,
      rect.height
    )

    if (
      socket.connected &&
      room?.code
    ) {
      socket.emit(
        "clearCanvas"
      )
    }
  }

  /*
  |--------------------------------------------------------------------------
  | Color
  |--------------------------------------------------------------------------
  */

  const handleColorChange = (
    color
  ) => {
    if (!isArtist) {
      return
    }

    if (
      phase !==
      "drawing"
    ) {
      return
    }

    setSelectedColor(
      color
    )

    setTool(
      "draw"
    )
  }

  /*
  |--------------------------------------------------------------------------
  | Draw Tool
  |--------------------------------------------------------------------------
  */

  const handleDraw = () => {
    if (!isArtist) {
      return
    }

    if (
      phase !==
      "drawing"
    ) {
      return
    }

    setTool(
      "draw"
    )
  }

  /*
  |--------------------------------------------------------------------------
  | Eraser
  |--------------------------------------------------------------------------
  */

  const handleEraser = () => {
    if (!isArtist) {
      return
    }

    if (
      phase !==
      "drawing"
    ) {
      return
    }

    setTool(
      "eraser"
    )
  }

  /*
  |--------------------------------------------------------------------------
  | Guess Submit
  |--------------------------------------------------------------------------
  */

  const handleGuessSubmit = (
    event
  ) => {
    event.preventDefault()

    if (
      !guess.trim()
    ) {
      return
    }

    if (
      !socket.connected
    ) {
      return
    }

    if (isArtist) {
      return
    }

    if (
      phase !==
      "drawing"
    ) {
      return
    }

    if (
      hasGuessedCorrectly
    ) {
      return
    }

    socket.emit(
      "guess",
      {
        guess:
          guess.trim(),
      }
    )

    setGuess("")
  }

  /*
  |--------------------------------------------------------------------------
  | Leave
  |--------------------------------------------------------------------------
  */

  const handleLeave = () => {
    socket.emit(
      "leaveRoom"
    )

    socket.disconnect()

    navigate("/room")
  }

  /*
  |--------------------------------------------------------------------------
  | No Room
  |--------------------------------------------------------------------------
  */

  if (!room) {
    return null
  }

  /*
  |--------------------------------------------------------------------------
  | Render
  |--------------------------------------------------------------------------
  */

  return (
    <div className="min-h-screen bg-white text-[#1b1b1b]">

      {/* Score Popup */}

      {scorePopup !== null && (
        <div className="fixed left-1/2 top-8 z-50 -translate-x-1/2 rounded-full border-[3px] border-[#111] bg-[#e8f79c] px-8 py-3 text-lg font-extrabold shadow-[0_4px_0_#111]">
          🎉 Correct! +
          {scorePopup} pts
        </div>
      )}

      {/* Header */}

      <header className="flex items-center justify-between border-b-[3px] border-[#111] px-6 py-4">

        <h1 className="text-4xl font-extrabold">
          Picasso?
        </h1>

        <button
          type="button"
          onClick={
            handleLeave
          }
          className="rounded-full border-[3px] border-[#111] bg-white px-8 py-3 text-lg font-bold transition hover:bg-[#f2f2f2]"
        >
          Leave
        </button>

      </header>

      {/* Top Info */}

      <section className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 px-8 pb-4 pt-6">

        <div className="flex items-center gap-4">

          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#ebebeb] text-2xl">
            🎲
          </div>

          <div>

            <p className="text-xs font-bold tracking-wide text-[#666]">
              MATCH STAGE
            </p>

            <p className="text-2xl font-medium">

              Round{" "}
              {currentRound}

              <span className="text-lg text-[#666]">
                {" "}
                of{" "}
                {room.rounds}
              </span>

            </p>

          </div>

        </div>

        {/* Center */}

        <div className="rounded-[16px] border-[3px] border-[#111] bg-white px-10 py-3 text-center shadow-[0_4px_0_#111]">

          {phase ===
          "choosing" ? (
            <>
              <p className="text-xs font-bold">
                {isArtist
                  ? "CHOOSE A WORD"
                  : "WAITING FOR ARTIST"}
              </p>

              <p className="text-xl font-extrabold">
                {isArtist
                  ? "Pick one!"
                  : "Choosing word..."}
              </p>
            </>
          ) : (
            <>
              <p className="text-xs font-bold">
                {isArtist
                  ? "YOU ARE DRAWING!"
                  : "GUESS THE WORD!"}
              </p>

              <p className="text-2xl font-extrabold">

                {isArtist
                  ? currentWord ||
                    "Loading..."
                  : Array.from({
                      length:
                        wordLength ||
                        3,
                    })
                      .map(
                        () =>
                          "＿"
                      )
                      .join(" ")}

              </p>
            </>
          )}

        </div>

        {/* Timer */}

        <div className="flex items-center justify-self-end gap-4 rounded-full border-2 border-[#111] bg-white px-5 py-2 shadow-[0_3px_0_#d4d4d4]">

          <div
            className={`flex h-12 w-12 items-center justify-center rounded-full text-sm font-bold text-white ${
              phase ===
              "choosing"
                ? "bg-[#999]"
                : timeRemaining <=
                    5
                  ? "bg-[#c62828]"
                  : "bg-[#111]"
            }`}
          >
            {phase ===
            "choosing"
              ? "—"
              : timeRemaining}
          </div>

          <div>

            <p className="text-xs tracking-wide text-[#666]">
              {phase ===
              "choosing"
                ? "WORD SELECTION"
                : "TIME REMAINING"}
            </p>

            <p className="text-xl font-medium">
              {phase ===
              "choosing"
                ? "Waiting"
                : `${timeRemaining}s`}
            </p>

          </div>

        </div>

      </section>

      {/* Choosing Word Panel */}

      {phase ===
        "choosing" &&
        isArtist && (
          <section className="mx-6 mb-4 rounded-[24px] border-[3px] border-[#111] bg-[#e8f79c] p-6 shadow-[0_4px_0_#111]">

            <div className="mb-5 text-center">

              <p className="text-sm font-bold tracking-wider text-[#666]">
                YOUR TURN TO DRAW
              </p>

              <h2 className="mt-1 text-3xl font-extrabold">
                Choose a word
              </h2>

              <p className="mt-1 text-sm text-[#666]">
                Everyone will guess the word you choose.
              </p>

            </div>

            <div className="grid gap-4 md:grid-cols-3">

              {wordChoices.map(
                (
                  choice,
                  index
                ) => (

                  <button
                    key={
                      `${choice.word}-${index}`
                    }
                    type="button"
                    onClick={() =>
                      handleSelectWord(
                        choice
                      )
                    }
                    className="rounded-[18px] border-[3px] border-[#111] bg-white px-5 py-6 text-center font-extrabold shadow-[0_4px_0_#111] transition hover:-translate-y-1 hover:bg-[#f5f5f5] active:translate-y-1 active:shadow-none"
                  >

                    <span className="block text-xs font-bold text-[#888]">
                      OPTION{" "}
                      {index +
                        1}
                    </span>

                    <span className="mt-1 block text-2xl">
                      {choice.word}
                    </span>

                  </button>

                )
              )}

            </div>

            {wordChoices.length ===
              0 && (
              <p className="text-center text-sm font-semibold text-[#666]">
                Loading word choices...
              </p>
            )}

          </section>
        )}

      {/* Waiting For Artist */}

      {phase ===
        "choosing" &&
        !isArtist && (
          <section className="mx-6 mb-4 rounded-[24px] bg-[#ebebeb] p-8 text-center">

            <div className="text-5xl">
              ✏️
            </div>

            <h2 className="mt-3 text-2xl font-extrabold">
              {players.find(
                (player) =>
                  player.id ===
                  artistId
              )?.name ||
                "The artist"}{" "}
              is choosing a word...
            </h2>

            <p className="mt-2 text-sm text-[#666]">
              Get ready to guess!
            </p>

          </section>
        )}

      {/* Guess Feed / Hint */}

      {phase ===
        "drawing" && (
        <section className="mx-6 flex flex-wrap items-center justify-between gap-4 rounded-[16px] bg-[#ebebeb] px-6 py-3">

          <div className="flex flex-wrap items-center">

            <p className="text-sm font-semibold text-[#666]">
              GUESSER FEED:
            </p>

            <div className="ml-4 flex items-center gap-2">

              {Array.from({
                length:
                  Math.max(
                    1,
                    wordLength
                  ),
              }).map(
                (_, index) => (
                  <span
                    key={`word-${index}`}
                    className="inline-block w-4 border-b-2 border-[#666]"
                  />
                )
              )}

            </div>

          </div>

          <p className="text-sm font-medium">
            💡 Hint:{" "}
            {hint ||
              "Loading..."}
          </p>

        </section>
      )}

      {/* Main */}

      <main className="grid grid-cols-[300px_minmax(0,1fr)_300px] gap-4 px-6 py-5">

        {/* Players */}

        <aside className="flex flex-col gap-3 rounded-[24px] bg-[#ebebeb] p-4">

          <div className="flex items-center justify-between px-1">

            <h2 className="text-xl font-medium">
              👥 Players
            </h2>

            <span className="rounded-lg bg-[#d4d4d4] px-3 py-1 text-xs">
              {players.length} /{" "}
              {room.maxPlayers}{" "}
              Active
            </span>

          </div>

          <div className="flex flex-col gap-2">

            {players.map(
              (player) => {
                const playerIsArtist =
                  player.id ===
                  artistId

                return (
                  <div
                    key={
                      player.id
                    }
                    className={`flex items-center gap-3 p-3 ${
                      playerIsArtist
                        ? "border-b-[3px] border-[#7d7a25] bg-[#e8f79c]"
                        : "bg-white"
                    }`}
                  >

                    <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#d4d4d4] text-xl">
                      🐱

                      {playerIsArtist && (
                        <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-[#a2401c] text-xs text-white">
                          ✎
                        </span>
                      )}
                    </div>

                    <div className="min-w-0 flex-1">

                      <p className="truncate text-sm font-semibold">

                        {player.name}

                        {player.id ===
                          socket.id && (
                          <span className="ml-1 text-xs text-[#a2401c]">
                            (You)
                          </span>
                        )}

                      </p>

                      <p className="text-sm text-[#666]">

                        {phase ===
                        "choosing"
                          ? playerIsArtist
                            ? "Choosing..."
                            : "Waiting..."
                          : playerIsArtist
                            ? "Drawing..."
                            : hasGuessedCorrectly &&
                                player.id ===
                                  socket.id
                              ? "Correct!"
                              : "Guessing..."}

                      </p>

                    </div>

                    <p className="text-right text-lg font-medium">

                      {player.score ||
                        0}

                      <small className="block text-xs text-[#666]">
                        pts
                      </small>

                    </p>

                  </div>
                )
              }
            )}

          </div>

        </aside>

        {/* Canvas */}

        <section className="flex min-w-0 flex-col gap-3 rounded-[24px] bg-[#ebebeb] p-4">

          {/* Tools */}

          <div className="flex items-center gap-2">

            <button
              type="button"
              onClick={
                handleUndo
              }
              disabled={
                !isArtist ||
                phase !==
                  "drawing"
              }
              className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-[#111] bg-white text-xl transition hover:bg-[#f2f2f2] disabled:cursor-not-allowed disabled:opacity-40"
              title="Undo"
            >
              ↶
            </button>

            <button
              type="button"
              onClick={
                handleRedo
              }
              disabled={
                !isArtist ||
                phase !==
                  "drawing"
              }
              className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-[#111] bg-white text-xl transition hover:bg-[#f2f2f2] disabled:cursor-not-allowed disabled:opacity-40"
              title="Redo"
            >
              ↷
            </button>

            <div className="mx-1 h-6 w-px bg-[#d4d4d4]" />

            <button
              type="button"
              disabled
              className="flex h-10 w-10 cursor-not-allowed items-center justify-center rounded-full border-2 border-[#111] bg-white opacity-40"
              title="Zoom"
            >
              🔍
            </button>

            <button
              type="button"
              disabled
              className="flex h-10 w-10 cursor-not-allowed items-center justify-center rounded-full border-2 border-[#111] bg-white opacity-40"
              title="Snapshot"
            >
              📷
            </button>

          </div>

          {/* Canvas */}

          <div
            ref={
              canvasContainerRef
            }
            className={`relative min-h-[420px] flex-1 overflow-hidden rounded-[28px] bg-white shadow-[0_0_0_1px_#d4d4d4] ${
              !isArtist ||
              phase !==
                "drawing"
                ? "cursor-not-allowed"
                : "cursor-crosshair"
            }`}
          >

            {/* Canvas Status */}

            <div
              className={`absolute left-3 top-3 z-10 rounded-full border-2 border-[#111] px-3 py-1 text-xs font-semibold ${
                phase ===
                  "choosing"
                  ? "bg-white"
                  : isArtist
                    ? "bg-[#e8f79c]"
                    : "bg-white"
              }`}
            >

              {phase ===
              "choosing"
                ? isArtist
                  ? "✏️ Choose a word above"
                  : "👀 Waiting for artist..."
                : isArtist
                  ? "✎ You are drawing..."
                  : "👀 Waiting for the artist..."}

            </div>

            <canvas
              ref={
                canvasRef
              }
              onPointerDown={
                handlePointerDown
              }
              onPointerMove={
                handlePointerMove
              }
              onPointerUp={
                handlePointerUp
              }
              onPointerCancel={
                handlePointerUp
              }
              onPointerLeave={
                handlePointerUp
              }
              className="block h-full w-full touch-none"
            />

          </div>

          {/* Colors */}

          <div className="flex flex-wrap items-center gap-2 px-1">

            {colors.map(
              (
                color,
                index
              ) => (
                <button
                  key={`${color}-${index}`}
                  type="button"
                  aria-label={`Color ${index + 1}`}
                  disabled={
                    !isArtist ||
                    phase !==
                      "drawing"
                  }
                  onClick={() =>
                    handleColorChange(
                      color
                    )
                  }
                  className={`h-8 w-8 rounded-full border-2 transition ${
                    selectedColor ===
                      color &&
                    tool ===
                      "draw"
                      ? "border-[#111] ring-2 ring-white ring-offset-2 ring-offset-[#111]"
                      : "border-black/10 hover:scale-110"
                  } disabled:cursor-not-allowed disabled:opacity-40`}
                  style={{
                    backgroundColor:
                      color,
                  }}
                />
              )
            )}

          </div>

          {/* Brush Tools */}

          <div className="flex flex-wrap items-center gap-2 px-1">

            <div className="flex items-center gap-2 rounded-full border-2 border-[#111] bg-white px-3 py-1.5 text-sm font-semibold">

              <span>
                Size:
              </span>

              {[4, 8, 16, 24].map(
                (size) => (
                  <button
                    key={
                      size
                    }
                    type="button"
                    disabled={
                      !isArtist ||
                      phase !==
                        "drawing"
                    }
                    onClick={() =>
                      setBrushSize(
                        size
                      )
                    }
                    className={`flex h-7 w-7 items-center justify-center rounded-full ${
                      brushSize ===
                      size
                        ? "bg-[#d4d4d4]"
                        : ""
                    } disabled:cursor-not-allowed disabled:opacity-40`}
                  >
                    <span
                      className="block rounded-full bg-[#111]"
                      style={{
                        width: `${Math.min(
                          size,
                          20
                        )}px`,

                        height: `${Math.min(
                          size,
                          20
                        )}px`,
                      }}
                    />
                  </button>
                )
              )}

            </div>

            <button
              type="button"
              disabled={
                !isArtist ||
                phase !==
                  "drawing"
              }
              onClick={
                handleDraw
              }
              className={`rounded-full border-2 px-4 py-2 font-semibold ${
                tool ===
                "draw"
                  ? "border-[#a2401c] bg-[#a2401c] text-white"
                  : "border-[#111] bg-white"
              } disabled:cursor-not-allowed disabled:opacity-40`}
            >
              ✎ Draw
            </button>

            <button
              type="button"
              disabled={
                !isArtist ||
                phase !==
                  "drawing"
              }
              onClick={
                handleEraser
              }
              className={`rounded-full border-2 px-4 py-2 font-semibold ${
                tool ===
                "eraser"
                  ? "border-[#a2401c] bg-[#a2401c] text-white"
                  : "border-[#111] bg-white"
              } disabled:cursor-not-allowed disabled:opacity-40`}
            >
              Eraser
            </button>

            <button
              type="button"
              disabled
              className="cursor-not-allowed rounded-full border-2 border-[#111] bg-white px-4 py-2 font-semibold opacity-40"
            >
              Bucket
            </button>

            <div className="flex-1" />

            <button
              type="button"
              disabled={
                !isArtist ||
                phase !==
                  "drawing"
              }
              onClick={
                handleClear
              }
              className="rounded-full border-2 border-[#c62828] bg-white px-4 py-2 font-semibold text-[#c62828] transition hover:bg-[#fff1f1] disabled:cursor-not-allowed disabled:opacity-40"
            >
              🗑 Clear
            </button>

          </div>

        </section>

        {/* Guesses */}

        <aside className="flex min-h-[500px] flex-col gap-3 rounded-[24px] bg-[#ebebeb] p-4">

          <div className="px-1">

            <h2 className="text-xl font-medium">
              💬 Guesses
            </h2>

          </div>

          <div className="flex flex-1 flex-col gap-2 overflow-y-auto">

            {phase ===
            "choosing" ? (
              <>

                <div className="flex justify-center bg-[#d4d4d4] px-3 py-2 text-xs">
                  Round{" "}
                  {currentRound}{" "}
                  starting
                </div>

                <div className="flex flex-1 items-center justify-center px-3 py-3 text-center text-sm text-[#666]">

                  {isArtist
                    ? "Choose one of the words to start drawing."
                    : "The artist is choosing a word. Get ready!"}

                </div>

              </>
            ) : (
              <>

                <div className="flex justify-center bg-[#d4d4d4] px-3 py-2 text-xs">
                  Round{" "}
                  {currentRound}{" "}
                  started!
                </div>

                <div className="flex justify-center bg-white px-3 py-3 text-center text-sm text-[#666]">

                  {isArtist
                    ? "You are the artist. Draw something!"
                    : hasGuessedCorrectly
                      ? "🎉 You guessed correctly!"
                      : "Watch the drawing and guess the word!"}

                </div>

                {guessMessages.map(
                  (
                    message,
                    index
                  ) => (
                    <div
                      key={`${message.playerName}-${index}`}
                      className={`px-3 py-2 text-sm ${
                        message.type ===
                        "correct"
                          ? "bg-[#e8f79c] font-bold"
                          : "bg-white"
                      }`}
                    >

                      {message.type ===
                      "correct" ? (
                        <>
                          🎉{" "}
                          {
                            message.playerName
                          }{" "}
                          guessed correctly!
                        </>
                      ) : (
                        <>
                          <span className="font-bold">
                            {
                              message.playerName
                            }
                          </span>

                          :{" "}

                          {
                            message.guess
                          }
                        </>
                      )}

                    </div>
                  )
                )}

              </>
            )}

          </div>

          {/* Guess Input */}

          <form
            onSubmit={
              handleGuessSubmit
            }
            className="flex items-center gap-2 rounded-full border-[3px] border-[#111] bg-white px-3 py-2"
          >

            <input
              type="text"
              value={
                guess
              }
              onChange={(
                event
              ) =>
                setGuess(
                  event.target
                    .value
                )
              }
              disabled={
                isArtist ||
                phase !==
                  "drawing" ||
                hasGuessedCorrectly ||
                timeRemaining <=
                  0
              }
              placeholder={
                phase ===
                "choosing"
                  ? "Wait for the word..."
                  : isArtist
                    ? "You are drawing..."
                    : hasGuessedCorrectly
                      ? "Correct!"
                      : "Type your guess..."
              }
              className="min-w-0 flex-1 bg-transparent px-2 text-sm outline-none disabled:cursor-not-allowed"
              autoComplete="off"
            />

            <button
              type="submit"
              disabled={
                isArtist ||
                phase !==
                  "drawing" ||
                hasGuessedCorrectly ||
                !guess.trim() ||
                timeRemaining <=
                  0
              }
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#111] text-white transition hover:bg-[#333] disabled:cursor-not-allowed disabled:opacity-40"
            >
              🐾
            </button>

          </form>

        </aside>

      </main>

    </div>
  )
}

export default Game