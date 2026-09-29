import {
  useEffect,
  useRef,
  useState,
} from "react"

import {
  useLocation,
  useNavigate,
} from "react-router-dom"

import socket from "../socket"

function Game() {
  const location = useLocation()
  const navigate = useNavigate()

  const room = location.state?.room

  const canvasRef = useRef(null)
  const canvasContainerRef =
    useRef(null)

  const isDrawingRef =
    useRef(false)

  const lastPositionRef =
    useRef({ x: 0, y: 0 })

  const undoStackRef =
    useRef([])

  const redoStackRef =
    useRef([])

  const timerRef = useRef(null)

  const scorePopupTimerRef =
    useRef(null)

  const phaseRef = useRef(
    room?.phase || "choosing"
  )

  const artistIdRef = useRef(
    location.state?.artistId ||
      room?.artistId ||
      null
  )

  const selectingWordRef =
    useRef(false)

  const [
    selectedColor,
    setSelectedColor,
  ] = useState("#1b1b1b")

  const [
    brushSize,
    setBrushSize,
  ] = useState(8)

  const [
    tool,
    setTool,
  ] = useState("draw")

  const [
    artistId,
    setArtistId,
  ] = useState(
    location.state?.artistId ||
      room?.artistId ||
      null
  )

  const [
    currentRound,
    setCurrentRound,
  ] = useState(
    location.state?.currentRound ||
      room?.currentRound ||
      1
  )

  const [
    phase,
    setPhase,
  ] = useState(
    room?.phase || "choosing"
  )

  const [
    timeRemaining,
    setTimeRemaining,
  ] = useState(
    room?.drawingTime || 60
  )

  const [
    currentWord,
    setCurrentWord,
  ] = useState("")

  const [
    hint,
    setHint,
  ] = useState("")

  const [
    wordPattern,
    setWordPattern,
  ] = useState("")

  const [
    wordChoices,
    setWordChoices,
  ] = useState([])

  const [
    guess,
    setGuess,
  ] = useState("")

  const [
    guessMessages,
    setGuessMessages,
  ] = useState([])

  const [
    hasGuessedCorrectly,
    setHasGuessedCorrectly,
  ] = useState(false)

  const [
    scorePopup,
    setScorePopup,
  ] = useState(null)

  const [
    players,
    setPlayers,
  ] = useState(room?.players || [])

  const [
    historyVersion,
    setHistoryVersion,
  ] = useState(0)

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

  useEffect(() => {
    phaseRef.current = phase
  }, [phase])

  useEffect(() => {
    artistIdRef.current = artistId
  }, [artistId])

  const currentPlayer =
    players.find(
      (player) =>
        player.id === socket.id
    )

  const isArtist =
    currentPlayer?.id === artistId

  /*
   * =========================
   * Canvas helpers
   * =========================
   */

  const getCanvasContext = () => {
    const canvas = canvasRef.current

    if (!canvas) {
      return null
    }

    return canvas.getContext("2d")
  }

  const setupCanvasContext = () => {
    const canvas = canvasRef.current

    if (!canvas) {
      return null
    }

    const context =
      canvas.getContext("2d")

    if (!context) {
      return null
    }

    const dpr =
      window.devicePixelRatio || 1

    context.setTransform(
      dpr,
      0,
      0,
      dpr,
      0,
      0
    )

    context.lineCap = "round"
    context.lineJoin = "round"

    return context
  }

  const clearLocalCanvas = () => {
    const canvas = canvasRef.current

    if (!canvas) {
      return
    }

    const context =
      canvas.getContext("2d")

    if (!context) {
      return
    }

    context.save()

    context.setTransform(
      1,
      0,
      0,
      1,
      0,
      0
    )

    context.clearRect(
      0,
      0,
      canvas.width,
      canvas.height
    )

    context.restore()

    setupCanvasContext()
  }

  /*
   * =========================
   * Canvas resize
   * =========================
   */

  useEffect(() => {
    const canvas = canvasRef.current
    const container =
      canvasContainerRef.current

    if (!canvas || !container) {
      return
    }

    let previousCssWidth = 0
    let previousCssHeight = 0

    const resizeCanvas = () => {
      const rect =
        container.getBoundingClientRect()

      if (
        rect.width <= 0 ||
        rect.height <= 0
      ) {
        return
      }

      const dpr =
        window.devicePixelRatio || 1

      const newCssWidth =
        rect.width

      const newCssHeight =
        rect.height

      const oldCanvasWidth =
        canvas.width

      const oldCanvasHeight =
        canvas.height

      let oldImage = null

      if (
        oldCanvasWidth > 0 &&
        oldCanvasHeight > 0 &&
        previousCssWidth > 0 &&
        previousCssHeight > 0
      ) {
        try {
          oldImage =
            document.createElement(
              "canvas"
            )

          oldImage.width =
            oldCanvasWidth

          oldImage.height =
            oldCanvasHeight

          const oldContext =
            oldImage.getContext(
              "2d"
            )

          if (oldContext) {
            oldContext.drawImage(
              canvas,
              0,
              0
            )
          }
        } catch {
          oldImage = null
        }
      }

      canvas.width = Math.max(
        1,
        Math.round(
          newCssWidth * dpr
        )
      )

      canvas.height = Math.max(
        1,
        Math.round(
          newCssHeight * dpr
        )
      )

      canvas.style.width =
        `${newCssWidth}px`

      canvas.style.height =
        `${newCssHeight}px`

      const context =
        canvas.getContext("2d")

      if (!context) {
        return
      }

      context.setTransform(
        dpr,
        0,
        0,
        dpr,
        0,
        0
      )

      context.lineCap = "round"
      context.lineJoin = "round"

      if (oldImage) {
        context.drawImage(
          oldImage,
          0,
          0,
          oldImage.width,
          oldImage.height,
          0,
          0,
          previousCssWidth > 0
            ? newCssWidth
            : oldImage.width / dpr,
          previousCssHeight > 0
            ? newCssHeight
            : oldImage.height / dpr
        )
      }

      previousCssWidth =
        newCssWidth

      previousCssHeight =
        newCssHeight
    }

    resizeCanvas()

    const observer =
      new ResizeObserver(
        resizeCanvas
      )

    observer.observe(container)

    return () => {
      observer.disconnect()
    }
  }, [])

  /*
   * =========================
   * Draw line
   * =========================
   */

  const drawLine = ({
    x0,
    y0,
    x1,
    y1,
    color,
    size,
    tool: drawTool,
  }) => {
    const canvas = canvasRef.current

    if (!canvas) {
      return
    }

    const context =
      canvas.getContext("2d")

    if (!context) {
      return
    }

    const rect =
      canvas.getBoundingClientRect()

    if (
      rect.width <= 0 ||
      rect.height <= 0
    ) {
      return
    }

    const startX =
      x0 * rect.width

    const startY =
      y0 * rect.height

    const endX =
      x1 * rect.width

    const endY =
      y1 * rect.height

    const dpr =
      window.devicePixelRatio || 1

    context.save()

    context.setTransform(
      dpr,
      0,
      0,
      dpr,
      0,
      0
    )

    context.lineWidth =
      Number(size) || 8

    context.lineCap = "round"
    context.lineJoin = "round"

    if (
      drawTool === "eraser"
    ) {
      context.globalCompositeOperation =
        "destination-out"

      context.strokeStyle =
        "#000000"
    } else {
      context.globalCompositeOperation =
        "source-over"

      context.strokeStyle =
        color || "#1b1b1b"
    }

    context.beginPath()

    context.moveTo(
      startX,
      startY
    )

    context.lineTo(
      endX,
      endY
    )

    context.stroke()

    context.restore()
  }

  /*
   * =========================
   * Local timer
   * =========================
   */

  const stopLocalTimer = () => {
    if (timerRef.current) {
      clearInterval(
        timerRef.current
      )

      timerRef.current = null
    }
  }

  const startLocalTimer = (
    roundEndsAt
  ) => {
    stopLocalTimer()

    if (!roundEndsAt) {
      return
    }

    const updateTimer = () => {
      const remainingMs =
        Number(roundEndsAt) -
        Date.now()

      const remainingSeconds =
        Math.max(
          0,
          Math.ceil(
            remainingMs / 1000
          )
        )

      setTimeRemaining(
        remainingSeconds
      )

      if (
        remainingSeconds <= 0
      ) {
        stopLocalTimer()
        isDrawingRef.current =
          false
      }
    }

    updateTimer()

    timerRef.current =
      setInterval(
        updateTimer,
        250
      )
  }

  /*
   * =========================
   * Reset round
   * =========================
   */

  const resetRoundState = (
    roundRoom
  ) => {
    stopLocalTimer()

    isDrawingRef.current = false

    selectingWordRef.current =
      false

    setCurrentWord("")
    setHint("")
    setWordPattern("")
    setWordChoices([])
    setGuess("")
    setHasGuessedCorrectly(
      false
    )
    setGuessMessages([])
    setScorePopup(null)

    undoStackRef.current = []
    redoStackRef.current = []

    setHistoryVersion(
      (value) => value + 1
    )

    setTimeRemaining(
      roundRoom?.drawingTime ||
        60
    )

    clearLocalCanvas()
  }

  /*
   * =========================
   * Socket events
   * =========================
   */

  useEffect(() => {
    if (!room?.code) {
      return
    }

    const handleRemoteDraw = (
      data
    ) => {
      if (
        phaseRef.current !==
        "drawing"
      ) {
        return
      }

      drawLine(data)
    }

    const handleRemoteClear = () => {
      clearLocalCanvas()
    }

    const handleRoundChoosing = ({
      room: choosingRoom,
      currentRound:
        choosingRound,
      artistId:
        choosingArtistId,
    }) => {
      if (!choosingRoom) {
        return
      }

      console.log(
        `Round ${choosingRound}: artist ${choosingArtistId} is choosing`
      )

      phaseRef.current =
        "choosing"

      artistIdRef.current =
        choosingArtistId

      selectingWordRef.current =
        false

      setPlayers(
        choosingRoom.players ||
          []
      )

      setPhase("choosing")

      setCurrentRound(
        choosingRound
      )

      setArtistId(
        choosingArtistId
      )

      resetRoundState(
        choosingRoom
      )
    }

    const handleWordChoices = ({
      choices,
    }) => {
      setWordChoices(
        Array.isArray(choices)
          ? choices
          : []
      )
    }

    const handleRoundStarted = ({
      room: startedRoom,
      currentRound:
        startedRound,
      artistId:
        startedArtistId,
      roundEndsAt,
      hint:
        startedHint,
      wordPattern:
        startedWordPattern,
    }) => {
      if (!startedRoom) {
        return
      }

      console.log(
        `Round ${startedRound} started. Artist: ${startedArtistId}`
      )

      phaseRef.current =
        "drawing"

      artistIdRef.current =
        startedArtistId

      selectingWordRef.current =
        false

      setPlayers(
        startedRoom.players ||
          []
      )

      setPhase("drawing")

      setCurrentRound(
        startedRound
      )

      setArtistId(
        startedArtistId
      )

      setHint(
        startedHint || ""
      )

      setWordPattern(
        startedWordPattern || ""
      )

      setWordChoices([])

      setCurrentWord("")
      setGuess("")

      setHasGuessedCorrectly(
        false
      )

      setGuessMessages([])
      setScorePopup(null)

      undoStackRef.current = []
      redoStackRef.current = []

      setHistoryVersion(
        (value) => value + 1
      )

      clearLocalCanvas()

      startLocalTimer(
        roundEndsAt
      )
    }

    const handleArtistWord = ({
      word,
    }) => {
      setCurrentWord(
        word || ""
      )
    }

    const handlePlayerGuess = ({
      playerName,
      guess: playerGuess,
      correct,
    }) => {
      setGuessMessages(
        (messages) => [
          ...messages,
          {
            type: correct
              ? "correct"
              : "guess",
            playerName,
            guess: playerGuess,
          },
        ]
      )
    }

    const handleCorrectGuess = ({
      score,
    }) => {
      setHasGuessedCorrectly(
        true
      )

      setScorePopup(score)

      if (
        scorePopupTimerRef.current
      ) {
        clearTimeout(
          scorePopupTimerRef.current
        )
      }

      scorePopupTimerRef.current =
        setTimeout(() => {
          setScorePopup(null)

          scorePopupTimerRef.current =
            null
        }, 2000)
    }

    const handlePlayerGuessedCorrectly =
      ({
        playerId,
        playerName,
      }) => {
        setGuessMessages(
          (messages) => {
            const alreadyShown =
              messages.some(
                (message) =>
                  message.type ===
                    "correct" &&
                  message.playerId ===
                    playerId
              )

            if (alreadyShown) {
              return messages
            }

            return [
              ...messages,
              {
                type: "correct",
                playerId,
                playerName,
              },
            ]
          }
        )
      }

    const handlePlayersUpdated = ({
      players:
        updatedPlayers,
    }) => {
      if (
        !Array.isArray(
          updatedPlayers
        )
      ) {
        return
      }

      setPlayers(
        updatedPlayers
      )
    }

    const handleGameFinished = ({
      room:
        finishedRoom,
    }) => {
      stopLocalTimer()

      isDrawingRef.current =
        false

      if (!finishedRoom) {
        return
      }

      navigate("/score", {
        state: {
          room: finishedRoom,
        },
      })
    }

    const handleRoomError = ({
      message,
    }) => {
      console.error(
        "Room error:",
        message
      )

      selectingWordRef.current =
        false

      setWordChoices([])

      setScorePopup(null)
    }

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

    socket.on(
      "roomError",
      handleRoomError
    )

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

      socket.off(
        "roomError",
        handleRoomError
      )

      stopLocalTimer()

      if (
        scorePopupTimerRef.current
      ) {
        clearTimeout(
          scorePopupTimerRef.current
        )

        scorePopupTimerRef.current =
          null
      }
    }
  }, [
    room?.code,
    navigate,
  ])

  /*
   * =========================
   * Select word
   * =========================
   */

  const handleSelectWord = (
    choice
  ) => {
    if (!isArtist) {
      return
    }

    if (
      phaseRef.current !==
      "choosing"
    ) {
      return
    }

    if (!choice?.word) {
      return
    }

    if (
      selectingWordRef.current
    ) {
      return
    }

    if (!socket.connected) {
      console.warn(
        "Socket is not connected"
      )

      return
    }

    selectingWordRef.current =
      true

    console.log(
      "Selected word:",
      choice.word
    )

    socket.emit(
      "selectWord",
      {
        word: choice.word,
        hint: choice.hint,
      }
    )

    setWordChoices([])
  }

  /*
   * =========================
   * Canvas history
   * =========================
   */

  const saveCanvasState = () => {
    const canvas =
      canvasRef.current

    if (!canvas) {
      return
    }

    try {
      undoStackRef.current.push(
        canvas.toDataURL()
      )

      if (
        undoStackRef.current
          .length > 30
      ) {
        undoStackRef.current.shift()
      }

      redoStackRef.current = []

      setHistoryVersion(
        (value) => value + 1
      )
    } catch (error) {
      console.error(
        "Could not save canvas state:",
        error
      )
    }
  }

  const restoreCanvasState = (
    dataUrl
  ) => {
    const canvas =
      canvasRef.current

    if (!canvas || !dataUrl) {
      return
    }

    const image = new Image()

    image.onload = () => {
      const context =
        canvas.getContext("2d")

      if (!context) {
        return
      }

      const rect =
        canvas.getBoundingClientRect()

      if (
        rect.width <= 0 ||
        rect.height <= 0
      ) {
        return
      }

      const dpr =
        window.devicePixelRatio ||
        1

      context.save()

      context.setTransform(
        1,
        0,
        0,
        1,
        0,
        0
      )

      context.clearRect(
        0,
        0,
        canvas.width,
        canvas.height
      )

      context.restore()

      context.setTransform(
        dpr,
        0,
        0,
        dpr,
        0,
        0
      )

      context.globalCompositeOperation =
        "source-over"

      context.drawImage(
        image,
        0,
        0,
        rect.width,
        rect.height
      )

      context.lineCap = "round"
      context.lineJoin = "round"
    }

    image.src = dataUrl
  }

  const handleUndo = () => {
    if (
      !isArtist ||
      phaseRef.current !==
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

    setHistoryVersion(
      (value) => value + 1
    )
  }

  const handleRedo = () => {
    if (
      !isArtist ||
      phaseRef.current !==
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
      restoreCanvasState(next)
    }

    setHistoryVersion(
      (value) => value + 1
    )
  }

  /*
   * =========================
   * Pointer helpers
   * =========================
   */

  const getPointerPosition = (
    event
  ) => {
    const canvas =
      canvasRef.current

    if (!canvas) {
      return null
    }

    const rect =
      canvas.getBoundingClientRect()

    if (
      rect.width <= 0 ||
      rect.height <= 0
    ) {
      return null
    }

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
   * =========================
   * Pointer down
   * =========================
   */

  const handlePointerDown = (
    event
  ) => {
    if (!isArtist) {
      return
    }

    if (
      phaseRef.current !==
      "drawing"
    ) {
      return
    }

    if (
      tool !== "draw" &&
      tool !== "eraser"
    ) {
      return
    }

    const canvas =
      canvasRef.current

    if (!canvas) {
      return
    }

    const position =
      getPointerPosition(event)

    if (!position) {
      return
    }

    saveCanvasState()

    try {
      canvas.setPointerCapture(
        event.pointerId
      )
    } catch {
      // Ignore pointer capture errors.
    }

    isDrawingRef.current =
      true

    lastPositionRef.current =
      position

    const rect =
      canvas.getBoundingClientRect()

    const x = Math.max(
      0,
      Math.min(
        1,
        position.x /
          rect.width
      )
    )

    const y = Math.max(
      0,
      Math.min(
        1,
        position.y /
          rect.height
      )
    )

    const dotData = {
      x0: x,
      y0: y,
      x1: x + 0.00001,
      y1: y + 0.00001,
      color:
        selectedColor,
      size: brushSize,
      tool,
    }

    drawLine(dotData)

    if (
      socket.connected &&
      room?.code
    ) {
      socket.emit("draw", {
        roomCode:
          room.code,
        ...dotData,
      })
    }
  }

  /*
   * =========================
   * Pointer move
   * =========================
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
      phaseRef.current !==
      "drawing"
    ) {
      isDrawingRef.current =
        false

      return
    }

    const canvas =
      canvasRef.current

    if (!canvas) {
      return
    }

    const position =
      getPointerPosition(event)

    if (!position) {
      return
    }

    const rect =
      canvas.getBoundingClientRect()

    const previous =
      lastPositionRef.current

    const x0 = Math.max(
      0,
      Math.min(
        1,
        previous.x /
          rect.width
      )
    )

    const y0 = Math.max(
      0,
      Math.min(
        1,
        previous.y /
          rect.height
      )
    )

    const x1 = Math.max(
      0,
      Math.min(
        1,
        position.x /
          rect.width
      )
    )

    const y1 = Math.max(
      0,
      Math.min(
        1,
        position.y /
          rect.height
      )
    )

    const drawingData = {
      x0,
      y0,
      x1,
      y1,
      color:
        selectedColor,
      size: brushSize,
      tool,
    }

    drawLine(
      drawingData
    )

    if (
      socket.connected &&
      room?.code
    ) {
      socket.emit("draw", {
        roomCode:
          room.code,
        ...drawingData,
      })
    }

    lastPositionRef.current =
      position
  }

  /*
   * =========================
   * Pointer up
   * =========================
   */

  const handlePointerUp = (
    event
  ) => {
    isDrawingRef.current =
      false

    const canvas =
      canvasRef.current

    if (!canvas) {
      return
    }

    if (
      event?.pointerId !==
      undefined
    ) {
      try {
        if (
          canvas.hasPointerCapture(
            event.pointerId
          )
        ) {
          canvas.releasePointerCapture(
            event.pointerId
          )
        }
      } catch {
        // Ignore pointer capture errors.
      }
    }
  }

  /*
   * =========================
   * Clear canvas
   * =========================
   */

  const handleClear = () => {
    if (!isArtist) {
      return
    }

    if (
      phaseRef.current !==
      "drawing"
    ) {
      return
    }

    saveCanvasState()

    clearLocalCanvas()

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
   * =========================
   * Tools
   * =========================
   */

  const handleColorChange = (
    color
  ) => {
    if (
      !isArtist ||
      phaseRef.current !==
        "drawing"
    ) {
      return
    }

    setSelectedColor(color)
    setTool("draw")
  }

  const handleDraw = () => {
    if (
      !isArtist ||
      phaseRef.current !==
        "drawing"
    ) {
      return
    }

    setTool("draw")
  }

  const handleEraser = () => {
    if (
      !isArtist ||
      phaseRef.current !==
        "drawing"
    ) {
      return
    }

    setTool("eraser")
  }

  /*
   * =========================
   * Guess
   * =========================
   */

  const handleGuessSubmit = (
    event
  ) => {
    event.preventDefault()

    const cleanGuess =
      guess.trim()

    if (!cleanGuess) {
      return
    }

    if (!socket.connected) {
      return
    }

    if (isArtist) {
      return
    }

    if (
      phaseRef.current !==
      "drawing"
    ) {
      return
    }

    if (hasGuessedCorrectly) {
      return
    }

    if (timeRemaining <= 0) {
      return
    }

    socket.emit("guess", {
      guess: cleanGuess,
    })

    setGuess("")
  }

  /*
   * =========================
   * Leave
   * =========================
   */

  const handleLeave = () => {
    stopLocalTimer()

    isDrawingRef.current =
      false

    if (socket.connected) {
      socket.emit(
        "leaveRoom"
      )

      socket.disconnect()
    }

    navigate("/room")
  }

  /*
   * =========================
   * Cleanup
   * =========================
   */

  useEffect(() => {
    return () => {
      stopLocalTimer()

      if (
        scorePopupTimerRef.current
      ) {
        clearTimeout(
          scorePopupTimerRef.current
        )

        scorePopupTimerRef.current =
          null
      }

      isDrawingRef.current =
        false
    }
  }, [])

  /*
   * =========================
   * No room
   * =========================
   */

  if (!room) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f4f5f5] px-6">
        <div className="rounded-[20px] border-[3px] border-[#222] bg-white p-8 text-center">
          <h1 className="text-2xl font-extrabold">
            Room data not found
          </h1>

          <p className="mt-2 text-sm text-[#666]">
            Please return to the room.
          </p>

          <button
            type="button"
            onClick={() =>
              navigate("/room")
            }
            className="mt-5 rounded-full border-[3px] border-[#222] bg-[#e0f878] px-6 py-3 font-extrabold transition hover:bg-[#d0e868]"
          >
            Back to Room
          </button>
        </div>
      </div>
    )
  }

  /*
   * =========================
   * Render
   * =========================
   */

  return (
    <div className="min-h-screen bg-[#f4f5f5] text-[#222]">
      {scorePopup !== null && (
        <div className="pointer-events-none fixed left-1/2 top-24 z-50 -translate-x-1/2 rounded-full border-[3px] border-[#222] bg-[#e0f878] px-6 py-3 text-xl font-extrabold shadow-[0_4px_0_#222]">
          🎉 Correct! +
          {scorePopup} pts
        </div>
      )}

      <header className="flex items-center justify-between border-b-[3px] border-[#111] bg-white px-6 py-4">
        <h1 className="text-4xl font-extrabold">
          Picasso?
        </h1>

        <button
          type="button"
          onClick={handleLeave}
          className="rounded-full border-[3px] border-[#111] bg-white px-8 py-3 text-lg font-bold transition hover:bg-[#f2f2f2]"
        >
          Leave
        </button>
      </header>

      <section className="grid grid-cols-1 items-center gap-4 px-6 pb-4 pt-6 md:grid-cols-[1fr_auto_1fr] md:px-8">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#ebebeb] text-2xl">
            🎲
          </div>

          <div>
            <p className="text-xs font-bold tracking-wide text-[#666]">
              MATCH STAGE
            </p>

            <p className="text-2xl font-medium">
              Round {currentRound}

              <span className="text-lg text-[#666]">
                {" "}
                of {room.rounds}
              </span>
            </p>
          </div>
        </div>

        <div className="rounded-[16px] border-[3px] border-[#111] bg-white px-6 py-3 text-center shadow-[0_4px_0_#111] md:px-10">
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

              <p className="max-w-[360px] truncate text-2xl font-extrabold">
                {isArtist
                  ? currentWord ||
                    "Loading..."
                  : wordPattern ||
                    "＿"}
              </p>
            </>
          )}
        </div>

        <div className="flex items-center justify-self-start gap-4 rounded-full border-2 border-[#111] bg-white px-5 py-2 shadow-[0_3px_0_#d4d4d4] md:justify-self-end">
          <div
            className={`flex h-12 w-12 items-center justify-center rounded-full text-sm font-bold text-white ${
              phase === "choosing"
                ? "bg-[#999]"
                : timeRemaining <= 5
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
                Everyone will guess the
                word you choose.
              </p>
            </div>

            <div className="mx-auto grid max-w-[900px] grid-cols-1 gap-4 md:grid-cols-3">
              {wordChoices.map(
                (choice) => (
                  <button
                    key={
                      choice.word
                    }
                    type="button"
                    disabled={
                      selectingWordRef.current
                    }
                    onClick={() =>
                      handleSelectWord(
                        choice
                      )
                    }
                    className="rounded-[18px] border-[3px] border-[#111] bg-white px-5 py-6 text-center font-extrabold shadow-[0_4px_0_#111] transition hover:-translate-y-1 hover:bg-[#f7f7f7] active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <p className="text-xl">
                      {choice.word}
                    </p>

                    <p className="mt-2 text-sm font-medium text-[#666]">
                      {choice.hint}
                    </p>
                  </button>
                )
              )}
            </div>
          </section>
        )}

      {phase ===
        "choosing" &&
        !isArtist && (
          <section className="mx-6 mb-4 rounded-[24px] border-[3px] border-[#111] bg-white p-6 text-center shadow-[0_4px_0_#111]">
            <p className="text-4xl">
              🎨
            </p>

            <h2 className="mt-2 text-2xl font-extrabold">
              The artist is choosing a word...
            </h2>

            <p className="mt-1 text-sm text-[#666]">
              Get ready to guess!
            </p>
          </section>
        )}

      <main className="grid gap-5 px-6 pb-8 md:px-8 lg:grid-cols-[220px_minmax(0,1fr)_280px]">
        <aside className="rounded-[20px] border-[3px] border-[#111] bg-white p-4 shadow-[0_4px_0_#111]">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xl font-extrabold">
              Players
            </h2>

            <span className="rounded-full bg-[#eee] px-3 py-1 text-xs font-bold">
              {players.length}/
              {room.maxPlayers}
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
                    className={`flex items-center justify-between rounded-[12px] border-2 border-[#222] px-3 py-3 ${
                      playerIsArtist
                        ? "bg-[#e8f79c]"
                        : "bg-[#fafafa]"
                    }`}
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#eee]">
                        🐱
                      </div>

                      <div className="min-w-0">
                        <p className="truncate text-sm font-extrabold">
                          {player.name}
                        </p>

                        <p className="text-xs text-[#777]">
                          {playerIsArtist
                            ? "Artist"
                            : "Player"}
                        </p>
                      </div>
                    </div>

                    <span className="ml-2 shrink-0 text-sm font-extrabold">
                      {player.score ||
                        0}
                    </span>
                  </div>
                )
              }
            )}
          </div>
        </aside>

        <section className="min-w-0">
          <div
            ref={
              canvasContainerRef
            }
            className="relative aspect-[4/3] min-h-[400px] w-full overflow-hidden rounded-[20px] border-[3px] border-[#111] bg-white shadow-[0_4px_0_#111]"
          >
            <canvas
              ref={canvasRef}
              className={`block h-full w-full touch-none ${
                isArtist &&
                phase === "drawing"
                  ? "cursor-crosshair"
                  : "cursor-default"
              }`}
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
            />

            {phase ===
              "drawing" &&
              !isArtist && (
                <div className="pointer-events-none absolute left-1/2 top-4 -translate-x-1/2 rounded-full border-2 border-[#111] bg-white px-5 py-2 text-sm font-bold shadow-[0_3px_0_#111]">
                  Hint: {hint}
                </div>
              )}
          </div>

          {isArtist &&
            phase ===
              "drawing" && (
              <div className="mt-4 rounded-[20px] border-[3px] border-[#111] bg-white p-4 shadow-[0_4px_0_#111]">
                <div className="flex flex-wrap items-center gap-4">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={
                        handleDraw
                      }
                      className={`flex h-11 w-11 items-center justify-center rounded-full border-[3px] border-[#111] text-lg ${
                        tool ===
                        "draw"
                          ? "bg-[#e0f878]"
                          : "bg-white"
                      }`}
                    >
                      ✏️
                    </button>

                    <button
                      type="button"
                      onClick={
                        handleEraser
                      }
                      className={`flex h-11 w-11 items-center justify-center rounded-full border-[3px] border-[#111] text-lg ${
                        tool ===
                        "eraser"
                          ? "bg-[#e0f878]"
                          : "bg-white"
                      }`}
                    >
                      🧹
                    </button>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-sm font-extrabold">
                      Size
                    </span>

                    {[4, 8, 14, 20].map(
                      (size) => (
                        <button
                          key={size}
                          type="button"
                          onClick={() =>
                            setBrushSize(
                              size
                            )
                          }
                          className={`flex h-10 w-10 items-center justify-center rounded-full border-2 border-[#111] ${
                            brushSize ===
                            size
                              ? "bg-[#e0f878]"
                              : "bg-white"
                          }`}
                        >
                          <span
                            className="block rounded-full bg-[#111]"
                            style={{
                              width: `${Math.min(
                                size,
                                18
                              )}px`,
                              height: `${Math.min(
                                size,
                                18
                              )}px`,
                            }}
                          />
                        </button>
                      )
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {colors.map(
                      (color) => (
                        <button
                          key={
                            color
                          }
                          type="button"
                          onClick={() =>
                            handleColorChange(
                              color
                            )
                          }
                          className={`h-8 w-8 rounded-full border-2 border-[#111] ${
                            selectedColor ===
                              color &&
                            tool ===
                              "draw"
                              ? "ring-2 ring-[#111] ring-offset-2"
                              : ""
                          }`}
                          style={{
                            backgroundColor:
                              color,
                          }}
                          aria-label={`Color ${color}`}
                        />
                      )
                    )}
                  </div>

                  <div className="ml-auto flex items-center gap-2">
                    <button
                      type="button"
                      disabled={
                        undoStackRef.current
                          .length ===
                          0 ||
                        historyVersion <
                          0
                      }
                      onClick={
                        handleUndo
                      }
                      className="rounded-full border-[3px] border-[#111] bg-white px-4 py-2 font-extrabold transition hover:bg-[#f2f2f2] disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Undo
                    </button>

                    <button
                      type="button"
                      disabled={
                        redoStackRef.current
                          .length ===
                          0 ||
                        historyVersion <
                          0
                      }
                      onClick={
                        handleRedo
                      }
                      className="rounded-full border-[3px] border-[#111] bg-white px-4 py-2 font-extrabold transition hover:bg-[#f2f2f2] disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Redo
                    </button>

                    <button
                      type="button"
                      onClick={
                        handleClear
                      }
                      className="rounded-full border-[3px] border-[#111] bg-[#f3d0d0] px-4 py-2 font-extrabold transition hover:bg-[#eabbbb]"
                    >
                      Clear
                    </button>
                  </div>
                </div>
              </div>
            )}
        </section>

        <aside className="flex min-h-[500px] flex-col rounded-[20px] border-[3px] border-[#111] bg-white p-4 shadow-[0_4px_0_#111]">
          <div className="mb-4">
            <h2 className="text-xl font-extrabold">
              Guesses
            </h2>

            <p className="text-xs text-[#777]">
              {isArtist
                ? "Watch the players guess."
                : "Type your guess below."}
            </p>
          </div>

          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto">
            {guessMessages.length ===
              0 && (
              <div className="rounded-[12px] bg-[#f4f4f4] px-3 py-4 text-center text-sm text-[#777]">
                No guesses yet.
              </div>
            )}

            {guessMessages.map(
              (
                message,
                index
              ) => {
                if (
                  message.type ===
                  "correct"
                ) {
                  return (
                    <div
                      key={`${message.playerId || message.playerName}-${index}`}
                      className="rounded-[12px] bg-[#e8f79c] px-3 py-2 text-sm"
                    >
                      <span className="font-extrabold">
                        {
                          message.playerName
                        }
                      </span>{" "}
                      guessed correctly! 🎉
                    </div>
                  )
                }

                return (
                  <div
                    key={`${message.playerName}-${index}`}
                    className="rounded-[12px] bg-[#f4f4f4] px-3 py-2 text-sm"
                  >
                    <span className="font-extrabold">
                      {
                        message.playerName
                      }
                    </span>
                    :{" "}
                    {
                      message.guess
                    }
                  </div>
                )
              }
            )}
          </div>

          {!isArtist && (
            <form
              onSubmit={
                handleGuessSubmit
              }
              className="mt-4 flex gap-2"
            >
              <input
                type="text"
                value={guess}
                onChange={(
                  event
                ) =>
                  setGuess(
                    event.target
                      .value
                  )
                }
                disabled={
                  phase !==
                    "drawing" ||
                  hasGuessedCorrectly ||
                  timeRemaining <=
                    0
                }
                placeholder={
                  hasGuessedCorrectly
                    ? "Correct!"
                    : "Type your guess..."
                }
                className="min-w-0 flex-1 rounded-full border-[3px] border-[#111] bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-[#e0f878] disabled:bg-[#eee]"
              />

              <button
                type="submit"
                disabled={
                  phase !==
                    "drawing" ||
                  hasGuessedCorrectly ||
                  timeRemaining <=
                    0 ||
                  !guess.trim()
                }
                className="rounded-full border-[3px] border-[#111] bg-[#e0f878] px-5 py-3 font-extrabold transition hover:bg-[#d0e868] disabled:cursor-not-allowed disabled:opacity-40"
              >
                Guess
              </button>
            </form>
          )}

          {isArtist && (
            <div className="mt-4 rounded-[14px] bg-[#f4f4f4] px-4 py-3 text-center text-sm font-bold text-[#666]">
              You are the artist.
            </div>
          )}
        </aside>
      </main>
    </div>
  )
}

export default Game