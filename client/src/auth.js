import { useSyncExternalStore } from "react";

/*
 * Login / Register ผ่าน Auth Lambda (API Gateway)
 *
 * VITE_AUTH_API_URL = URL ของ API Gateway
 * เว้นว่าง = เรียก /auth ใน origin เดียวกัน (ตอน dev Vite proxy ไป local Lambda)
 */
const AUTH_API_URL = (import.meta.env.VITE_AUTH_API_URL || "").replace(/\/$/, "");

const TOKEN_KEY = "picassoAuthToken";
const USER_KEY = "picassoAuthUser";

const listeners = new Set();

function readStorage(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key, value) {
  try {
    if (value === null) {
      localStorage.removeItem(key);
    } else {
      localStorage.setItem(key, value);
    }
  } catch {
    // storage unavailable
  }
}

/*
 * token หมดอายุแล้วหรือยัง (อ่าน exp จาก payload)
 * server ตรวจลายเซ็นจริงอีกที ตรงนี้แค่กัน UI แสดงว่ายัง login อยู่
 */
function isTokenExpired(token) {
  try {
    const payload = JSON.parse(
      atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")),
    );

    return !payload.exp || payload.exp * 1000 < Date.now();
  } catch {
    return true;
  }
}

function loadUser() {
  const token = readStorage(TOKEN_KEY);

  if (!token || isTokenExpired(token)) {
    writeStorage(TOKEN_KEY, null);
    writeStorage(USER_KEY, null);
    return null;
  }

  try {
    return JSON.parse(readStorage(USER_KEY));
  } catch {
    return null;
  }
}

let currentUser = loadUser();

function setSession(token, user) {
  writeStorage(TOKEN_KEY, token);
  writeStorage(USER_KEY, user ? JSON.stringify(user) : null);

  currentUser = user;

  listeners.forEach((listener) => listener());
}

export function getToken() {
  return currentUser ? readStorage(TOKEN_KEY) : null;
}

export function getUser() {
  return currentUser;
}

export function subscribeAuth(listener) {
  listeners.add(listener);

  return () => listeners.delete(listener);
}

/*
 * React hook: user ปัจจุบัน (null = guest)
 */
export function useAuthUser() {
  return useSyncExternalStore(subscribeAuth, getUser);
}

export class AuthError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

async function postAuth(path, body) {
  let response;

  try {
    response = await fetch(`${AUTH_API_URL}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  } catch {
    throw new AuthError("NETWORK_ERROR");
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new AuthError(data.error || "SERVER_ERROR");
  }

  setSession(data.token, data.user);

  return data.user;
}

export function login(username, password) {
  return postAuth("/auth/login", { username, password });
}

export function register(username, password) {
  return postAuth("/auth/register", { username, password });
}

export function logout() {
  setSession(null, null);
}
