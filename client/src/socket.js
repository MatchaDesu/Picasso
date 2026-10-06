import { io } from "socket.io-client"

const socket = io(import.meta.env.VITE_SOCKET_URL)

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
