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

  // เก็บสถานะ canvas ปัจจุบันไว้
  // เพื่อไม่ให้ React/game state ทำให้ภาพหาย
  const canvasReadyRef = useRef(false);

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

    const rect = container.getBoundingClientRect();

    const width = Math.max(300, Math.floor(rect.width));

    const height = Math.max(300, Math.floor(width * 0.62));

    // ถ้าขนาดเท่าเดิม ไม่ต้องทำอะไร
    // สำคัญมาก เพราะไม่ควรแตะ canvas โดยไม่จำเป็น
    if (
      canvas.width === width &&
      canvas.height === height &&
      canvasReadyRef.current
    ) {
      return;
    }

    // เก็บภาพเดิม
    let oldCanvas = null;

    if (canvas.width > 0 && canvas.height > 0 && canvasReadyRef.current) {
      oldCanvas = document.createElement("canvas");

      oldCanvas.width = canvas.width;
      oldCanvas.height = canvas.height;

      const oldContext = oldCanvas.getContext("2d");

      if (oldContext) {
        oldContext.drawImage(canvas, 0, 0);
      }
    }

    // เปลี่ยนขนาด canvas
    canvas.width = width;
    canvas.height = height;

    clearCanvas();

    // คืนภาพเดิมกลับมา
    if (oldCanvas && oldCanvas.width > 0 && oldCanvas.height > 0) {
      const context = getContext();

      if (context) {
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

    canvasReadyRef.current = true;
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
    if (!Array.isArray(strokes)) {
      return;
    }

    // history คือการ sync canvas จาก server
    // ดังนั้นตรงนี้ค่อย clear ได้
    clearCanvas();

    for (const stroke of strokes) {
      if (
        !stroke ||
        !Array.isArray(stroke.points) ||
        stroke.points.length < 2
      ) {
        continue;
      }

      drawLine(stroke.points, stroke.color, stroke.size, stroke.mode);
    }

    canvasReadyRef.current = true;
  }

  function getPoint(event) {
    const canvas = canvasRef.current;

    if (!canvas) {
      return null;
    }

    const rect = canvas.getBoundingClientRect();

    if (rect.width <= 0 || rect.height <= 0) {
      return null;
    }

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

    // ป้องกัน pointer หลุดตอนลาก
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // ignore
    }
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

    // วาด local ก่อน
    drawLine(points, color, brushSize, mode);

    // ส่งไป server
    socket.emit("draw:stroke", {
      points,
      color,
      size: brushSize,
      mode,
    });

    lastPointRef.current = point;
  }

  function handlePointerUp(event) {
    isDrawingRef.current = false;
    lastPointRef.current = null;

    try {
      if (
        event?.currentTarget &&
        event.currentTarget.hasPointerCapture?.(event.pointerId)
      ) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    } catch {
      // ignore
    }
  }

  function handleClear() {
    if (disabled) {
      return;
    }

    clearCanvas();

    canvasReadyRef.current = true;

    socket.emit("draw:clear");
  }

  /*
   * Initial canvas setup
   *
   * สำคัญ:
   * effect นี้ทำงานเฉพาะตอน mount
   * ไม่ผูกกับ gameState / hint / round
   */
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

  /*
   * Socket drawing events
   *
   * effect นี้ก็ทำงานแค่ตอน mount
   * hint เปลี่ยนจะไม่สร้าง socket listener ใหม่
   */
  useEffect(() => {
    function handleRemoteStroke(stroke) {
      if (!stroke) {
        return;
      }

      drawLine(stroke.points, stroke.color, stroke.size, stroke.mode);

      canvasReadyRef.current = true;
    }

    function handleRemoteClear() {
      clearCanvas();

      canvasReadyRef.current = true;
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

  /*
   * ห้ามมี:
   *
   * useEffect(() => {
   *   clearCanvas();
   * }, [disabled]);
   *
   * เพราะ disabled เปลี่ยนตอนเริ่ม/จบ turn
   * และไม่ควรให้การเปลี่ยน permission ของคนวาด
   * ไปทำลายภาพบนกระดาน
   */

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
          {/* Colors */}
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

          {/* Brush sizes */}
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

          {/* Eraser */}
          <button
            type="button"
            onClick={() => setMode(mode === "erase" ? "draw" : "erase")}
            className={`rounded-full border-2 border-black px-4 py-1.5 text-xs font-bold ${
              mode === "erase" ? "bg-black text-white" : "bg-white"
            }`}
          >
            Eraser
          </button>

          {/* Clear */}
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
