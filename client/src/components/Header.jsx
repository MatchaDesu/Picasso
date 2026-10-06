import { useState } from "react";
import { Link } from "react-router-dom";
import PicassoLogo from "../assets/Picasso.png"

import AuthModal from "./AuthModal";
import { logout, useAuthUser } from "../auth";

function Header() {
  const user = useAuthUser();

  const [isAuthOpen, setIsAuthOpen] = useState(false);

  return (
    <header className="sticky top-0 z-100 flex h-[72px] w-full items-center justify-between border-b-2 border-black bg-white px-9">
      {/* Logo */}
      <Link to="/" className="flex items-center">
        <img
          src={PicassoLogo}
          alt="Picasso Logo"
          className="h-12 w-auto object-contain"
        />
      </Link>

      {/* Sign in / Signed in user */}
      {user ? (
        <div className="flex items-center gap-3">
          <span className="text-sm font-bold">👤 {user.username}</span>

          <button
            type="button"
            onClick={logout}
            className="rounded-[20px] border-2 border-black bg-white px-5 py-1.5 text-sm font-bold transition hover:bg-black hover:text-white"
          >
            Sign out
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setIsAuthOpen(true)}
          className="rounded-[20px] border-2 border-black bg-white px-6 py-1.5 text-sm font-bold transition hover:bg-black hover:text-white"
        >
          Sign in
        </button>
      )}

      {isAuthOpen && <AuthModal onClose={() => setIsAuthOpen(false)} />}
    </header>
  );
}

export default Header;
