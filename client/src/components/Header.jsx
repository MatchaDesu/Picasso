import { Link } from "react-router-dom";
import PicassoLogo from "../assets/Picasso.png"

function Header() {
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

      {/* Sign in */}
      <button
        type="button"
        className="rounded-[20px] border-2 border-black bg-white px-6 py-1.5 text-sm font-bold transition hover:bg-black hover:text-white"
      >
        Sign in
      </button>
    </header>
  );
}

export default Header;
