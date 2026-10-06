import { useState } from "react";

import { login, register } from "../auth";

const ERROR_MESSAGES = {
  INVALID_USERNAME: "Username must be 3–20 letters, numbers or _.",
  INVALID_PASSWORD: "Password must be 6–100 characters.",
  USERNAME_TAKEN: "This username is already taken.",
  INVALID_CREDENTIALS: "Wrong username or password.",
  NETWORK_ERROR: "Cannot reach the server. Please try again.",
  TOO_MANY_REQUESTS: "Too many attempts. Please wait a moment and try again.",
};

function AuthModal({ onClose }) {
  const [mode, setMode] = useState("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isLogin = mode === "login";

  function switchMode(nextMode) {
    setMode(nextMode);
    setError("");
  }

  async function handleSubmit(event) {
    event.preventDefault();

    if (isSubmitting) {
      return;
    }

    setError("");
    setIsSubmitting(true);

    try {
      if (isLogin) {
        await login(username.trim(), password);
      } else {
        await register(username.trim(), password);
      }

      onClose();
    } catch (authError) {
      setError(
        ERROR_MESSAGES[authError.code] || "Something went wrong. Try again.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center bg-black/30 px-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[420px] rounded-[20px] border-[3px] border-black bg-white p-7 shadow-[0_8px_0_#111111]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-6 grid grid-cols-2 gap-2 rounded-full bg-[#ebebeb] p-1">
          {[
            ["login", "Sign in"],
            ["register", "Create account"],
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => switchMode(value)}
              className={`rounded-full py-2 text-sm font-bold transition ${
                mode === value ? "bg-black text-white" : "text-[#666666]"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label htmlFor="auth-username" className="mb-2 block text-sm font-bold">
              Username
            </label>

            <input
              id="auth-username"
              type="text"
              autoComplete="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="3–20 letters, numbers or _"
              className="h-11 w-full rounded-full border-2 border-black px-5 text-sm outline-none placeholder:text-[#999999]"
            />
          </div>

          <div>
            <label htmlFor="auth-password" className="mb-2 block text-sm font-bold">
              Password
            </label>

            <input
              id="auth-password"
              type="password"
              autoComplete={isLogin ? "current-password" : "new-password"}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="At least 6 characters"
              className="h-11 w-full rounded-full border-2 border-black px-5 text-sm outline-none placeholder:text-[#999999]"
            />
          </div>

          {error && (
            <div className="rounded-[12px] border-2 border-black bg-[#ffe7e7] p-3 text-sm font-bold">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={isSubmitting || !username.trim() || !password}
            className="mt-2 h-12 rounded-full border-2 border-black bg-[#d6f679] text-sm font-bold transition hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSubmitting
              ? "Please wait..."
              : isLogin
                ? "Sign in"
                : "Create account"}
          </button>

          <button
            type="button"
            onClick={onClose}
            className="text-sm font-bold text-[#666666] hover:text-black"
          >
            Continue as guest
          </button>
        </form>
      </div>
    </div>
  );
}

export default AuthModal;
