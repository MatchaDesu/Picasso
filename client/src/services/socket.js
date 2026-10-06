import { io } from "socket.io-client"

import { getToken, subscribeAuth } from "./auth"

// ไม่ตั้ง VITE_SOCKET_URL = ต่อ origin เดียวกับหน้าเว็บ (ผ่าน proxy ของ Vite / nginx)
// ต้องเป็น undefined ไม่ใช่ "" เพราะ io("") จะต่อไปที่ URL ผิด
const socket = io(import.meta.env.VITE_SOCKET_URL || undefined, {
  /*
   * ใช้ WebSocket อย่างเดียว
   * มี server หลายเครื่องหลัง ALB -> ถ้าใช้ polling แต่ละ request
   * อาจไปคนละเครื่อง (ต้องตั้ง sticky session ข้ามโดเมน ยุ่งมาก)
   * WebSocket ต่อครั้งเดียวค้างไว้กับเครื่องเดิมตลอด
   */
  transports: ["websocket"],

  // ส่ง token ทุกครั้งที่ต่อ (server ตรวจแล้วตั้งชื่อตาม username)
  auth: (callback) => callback({ token: getToken() }),
})

/*
 * login / logout แล้วต่อใหม่ ให้ server รู้ตัวตนใหม่
 * (ถ้าอยู่ในห้อง จะ resume กลับห้องเดิมให้เอง)
 */
subscribeAuth(() => {
  if (socket.connected) {
    socket.disconnect().connect()
  }
})

/*
 * server สั่งตัดการเชื่อมต่อ (เช่น ตอน deploy / scale-in)
 * socket.io จะไม่ต่อใหม่เอง ต้องสั่งเอง
 */
socket.on("disconnect", (reason) => {
  if (reason === "io server disconnect") {
    socket.connect()
  }
})

/*
 * --------------------------------------------------
 * Session (ใช้กลับเข้าห้องเดิมหลัง refresh / หลุด)
 * --------------------------------------------------
 */

const ROOM_ID_KEY = "picassoRoomId"
const PLAYER_ID_KEY = "picassoPlayerId"
const RESUME_TOKEN_KEY = "picassoResumeToken"

const MAX_RESUME_RETRIES = 5
const RESUME_RETRY_DELAY = 1000

let resumeRetries = 0

export function getSession() {
  try {
    return {
      roomId: sessionStorage.getItem(ROOM_ID_KEY),
      playerId: sessionStorage.getItem(PLAYER_ID_KEY),
      resumeToken: sessionStorage.getItem(RESUME_TOKEN_KEY),
    }
  } catch {
    return {}
  }
}

export function saveSession({ roomId, playerId, resumeToken }) {
  try {
    if (roomId) sessionStorage.setItem(ROOM_ID_KEY, roomId)
    if (playerId) sessionStorage.setItem(PLAYER_ID_KEY, playerId)
    if (resumeToken) sessionStorage.setItem(RESUME_TOKEN_KEY, resumeToken)
  } catch {
    // storage unavailable
  }
}

export function clearSession() {
  try {
    sessionStorage.removeItem(ROOM_ID_KEY)
    sessionStorage.removeItem(PLAYER_ID_KEY)
    sessionStorage.removeItem(RESUME_TOKEN_KEY)
  } catch {
    // storage unavailable
  }
}

/*
 * ขอกลับเข้าห้องเดิม ถ้า socket id เปลี่ยนไปจากที่เก็บไว้
 *
 * return true ถ้าส่ง resumeRoom ไปแล้ว
 * (server จะตอบ roomResumed หรือ resumeFailed)
 */
export function resumeSession() {
  const { roomId, playerId, resumeToken } = getSession()

  if (!socket.connected || !roomId || !playerId || !resumeToken) {
    return false
  }

  if (playerId === socket.id) {
    return false
  }

  socket.emit("resumeRoom", {
    roomId,
    oldPlayerId: playerId,
    resumeToken,
  })

  return true
}

socket.on("connect", () => {
  resumeRetries = 0
})

socket.on("roomResumed", (room) => {
  resumeRetries = 0

  // socket id เปลี่ยนทุกครั้งที่ต่อใหม่ ต้องเก็บ id ล่าสุดไว้
  saveSession({
    roomId: room?.id,
    playerId: socket.id,
  })
})

let resumeRetrying = false

/*
 * listener นี้ลงทะเบียนตอนโหลด module
 * จึงทำงานก่อน listener ของแต่ละหน้าเสมอ
 */
socket.on("resumeFailed", (data) => {
  // socket เก่ายังไม่หลุดจาก server (เช่นตอน refresh) ลองใหม่อีกครั้ง
  resumeRetrying =
    data?.error === "PLAYER_STILL_CONNECTED" &&
    resumeRetries < MAX_RESUME_RETRIES

  if (resumeRetrying) {
    resumeRetries += 1
    setTimeout(resumeSession, RESUME_RETRY_DELAY)
  }
})

/*
 * ใช้ใน handler resumeFailed ของแต่ละหน้า
 * true = กำลัง retry อยู่ ยังไม่ต้องพาออกจากห้อง
 */
export function isResumeRetrying() {
  return resumeRetrying
}

export default socket
