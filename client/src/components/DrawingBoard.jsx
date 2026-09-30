import { useEffect, useRef, useState } from "react";

import socket from "../socket";

const COLORS = [
  "#000000",
  "#ffffff",
  "#e53935",
  "#fb8c00",
  "#fdd835",
  "#43a047",
  "#1e88e5",
  "#8e24aa",
  "#6d4c41",
];

const BRUSH_SIZES = [4, 8, 14, 22];

function DrawingBoard({ disabled = false }) {
  const canvasRef = useRef(null);

  const containerRef = useRef(null);

  const isDrawingRef = useRef(false);

  const lastPointRef = useRef(null);

  const [color, setColor] = useState("#000000");

  const [brushSize, setBrushSize] = useState(8);

  const [mode, setMode] = useState("draw");

  function getContext() {
    const canvas = canvasRef.current;

    if (!canvas) {
      return null;
    }

    return canvas.getContext("2d");
  }

  function clearCanvas() {
    const canvas = canvasRef.current;

    const context = getContext();

    if (!canvas || !context) {
      return;
    }

    context.save();

    context.globalCompositeOperation = "source-over";

    context.fillStyle = "#ffffff";

    context.fillRect(0, 0, canvas.width, canvas.height);

    context.restore();
  }

  function resizeCanvas() {
    const canvas = canvasRef.current;

    const container = containerRef.current;

    if (!canvas || !container) {
      return;
    }

    const oldCanvas = document.createElement("canvas");

    oldCanvas.width = canvas.width;

    oldCanvas.height = canvas.height;

    if (oldCanvas.width > 0 && oldCanvas.height > 0) {
      const oldContext = oldCanvas.getContext("2d");

      oldContext.drawImage(canvas, 0, 0);
    }

    const rect = container.getBoundingClientRect();

    const width = Math.max(300, Math.floor(rect.width));

    const height = Math.max(300, Math.floor(width * 0.62));

    canvas.width = width;

    canvas.height = height;

    clearCanvas();

    if (oldCanvas.width > 0 && oldCanvas.height > 0) {
      const context = getContext();

      context.drawImage(
        oldCanvas,
        0,
        0,
        oldCanvas.width,
        oldCanvas.height,
        0,
        0,
        width,
        height,
      );
    }
  }

  function drawLine(points, lineColor, lineSize, lineMode) {
    const canvas = canvasRef.current;

    const context = getContext();

    if (!canvas || !context || !Array.isArray(points) || points.length < 2) {
      return;
    }

    context.save();

    context.lineCap = "round";

    context.lineJoin = "round";

    context.lineWidth = lineSize;

    context.globalCompositeOperation =
      lineMode === "erase" ? "destination-out" : "source-over";

    context.strokeStyle = lineColor;

    context.beginPath();

    const first = points[0];

    context.moveTo(first.x * canvas.width, first.y * canvas.height);

    for (let i = 1; i < points.length; i++) {
      const point = points[i];

      context.lineTo(point.x * canvas.width, point.y * canvas.height);
    }

    context.stroke();

    context.restore();
  }

  function drawHistory(strokes) {
    clearCanvas();

    if (!Array.isArray(strokes)) {
      return;
    }

    for (const stroke of strokes) {
      drawLine(stroke.points, stroke.color, stroke.size, stroke.mode);
    }
  }

  function getPoint(event) {
    const canvas = canvasRef.current;

    if (!canvas) {
      return null;
    }

    const rect = canvas.getBoundingClientRect();

    const x = Math.min(
      1,
      Math.max(0, (event.clientX - rect.left) / rect.width),
    );

    const y = Math.min(
      1,
      Math.max(0, (event.clientY - rect.top) / rect.height),
    );

    return {
      x,
      y,
    };
  }

  function handlePointerDown(event) {
    if (disabled) {
      return;
    }

    event.preventDefault();

    const point = getPoint(event);

    if (!point) {
      return;
    }

    isDrawingRef.current = true;

    lastPointRef.current = point;
  }

  function handlePointerMove(event) {
    if (disabled || !isDrawingRef.current) {
      return;
    }

    event.preventDefault();

    const point = getPoint(event);

    const lastPoint = lastPointRef.current;

    if (!point || !lastPoint) {
      return;
    }

    const points = [lastPoint, point];

    drawLine(points, color, brushSize, mode);

    socket.emit("draw:stroke", {
      points,

      color,

      size: brushSize,

      mode,
    });

    lastPointRef.current = point;
  }

  function handlePointerUp() {
    isDrawingRef.current = false;

    lastPointRef.current = null;
  }

  function handleClear() {
    if (disabled) {
      return;
    }

    clearCanvas();

    socket.emit("draw:clear");
  }

  useEffect(() => {
    resizeCanvas();

    function handleResize() {
      resizeCanvas();
    }

    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  useEffect(() => {
    function handleRemoteStroke(stroke) {
      drawLine(stroke.points, stroke.color, stroke.size, stroke.mode);
    }

    function handleRemoteClear() {
      clearCanvas();
    }

    function handleHistory(strokes) {
      drawHistory(strokes);
    }

    socket.on("draw:stroke", handleRemoteStroke);

    socket.on("draw:clear", handleRemoteClear);

    socket.on("draw:history", handleHistory);

    return () => {
      socket.off("draw:stroke", handleRemoteStroke);

      socket.off("draw:clear", handleRemoteClear);

      socket.off("draw:history", handleHistory);
    };
  }, []);

  useEffect(() => {
    clearCanvas();
  }, [disabled]);

  return (
    <div className="flex flex-col gap-3">
      <div
        ref={containerRef}
        className="overflow-hidden rounded-[14px] border-2 border-black bg-white"
      >
        <canvas
          ref={canvasRef}
          className={`block h-auto w-full touch-none ${
            disabled ? "cursor-default" : "cursor-crosshair"
          }`}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onPointerLeave={handlePointerUp}
        />
      </div>

      {!disabled && (
        <div className="flex flex-wrap items-center gap-3 rounded-[14px] border-2 border-black bg-white p-3">
          <div className="flex items-center gap-2">
            {COLORS.map((itemColor) => (
              <button
                key={itemColor}
                type="button"
                onClick={() => {
                  setColor(itemColor);

                  setMode("draw");
                }}
                className={`h-7 w-7 rounded-full border-2 ${
                  color === itemColor && mode === "draw"
                    ? "border-black"
                    : "border-[#cccccc]"
                }`}
                style={{
                  backgroundColor: itemColor,
                }}
              />
            ))}
          </div>

          <div className="h-6 w-px bg-[#cccccc]" />

          <div className="flex items-center gap-2">
            {BRUSH_SIZES.map((size) => (
              <button
                key={size}
                type="button"
                onClick={() => setBrushSize(size)}
                className={`flex h-8 w-8 items-center justify-center rounded-full border-2 ${
                  brushSize === size ? "border-black" : "border-[#cccccc]"
                }`}
              >
                <span
                  className="rounded-full bg-black"
                  style={{
                    width: Math.min(size, 18),

                    height: Math.min(size, 18),
                  }}
                />
              </button>
            ))}
          </div>

          <div className="h-6 w-px bg-[#cccccc]" />

          <button
            type="button"
            onClick={() => setMode(mode === "erase" ? "draw" : "erase")}
            className={`rounded-full border-2 border-black px-4 py-1.5 text-xs font-bold ${
              mode === "erase" ? "bg-black text-white" : "bg-white"
            }`}
          >
            Eraser
          </button>

          <button
            type="button"
            onClick={handleClear}
            className="rounded-full border-2 border-black bg-white px-4 py-1.5 text-xs font-bold transition hover:bg-[#e5e5e5]"
          >
            Clear
          </button>
        </div>
      )}
    </div>
  );
}

export default DrawingBoard;
