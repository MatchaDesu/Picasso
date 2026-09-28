import { Link, NavLink } from "react-router-dom";

function Header() {
  return (
    <header className="relative sticky top-0 z-100 flex w-full items-center justify-between border-b-2 border-black bg-white px-9 py-4">
      {/* Logo */}
      <div className="flex flex-1 items-center">
        <Link to="/">
          <img
            src="/Picasso_.png"
            alt="Picasso Logo"
            className="h-auto w-32 cursor-pointer"
          />
        </Link>
      </div>

      {/* Lobby / Room */}
      <div className="absolute left-1/2 flex -translate-x-1/2 rounded-full border-[1.5px] border-[#d0d0d0] bg-[#e5e5e5] p-[3px]">
        <NavLink
          to="/"
          end
          className={({ isActive }) =>
            `rounded-full border-[1.5px] px-5 py-1.5 text-[13px] font-bold ${
              isActive
                ? "border-black bg-white"
                : "border-transparent"
            }`
          }
        >
          Lobby
        </NavLink>

        <NavLink
          to="/room"
          className={({ isActive }) =>
            `rounded-full border-[1.5px] px-5 py-1.5 text-[13px] font-bold ${
              isActive
                ? "border-black bg-white"
                : "border-transparent"
            }`
          }
        >
          Room
        </NavLink>
      </div>

      {/* Sign in / Profile */}
      <div className="flex flex-1 justify-end">
        {localStorage.getItem("isLoggedIn") === "true" ? (
          <Link
            to="/profile"
            className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-black text-lg hover:bg-[#f2f2f2]"
          >
            👤
          </Link>
        ) : (
          <Link
            to="/login"
            className="rounded-full border-2 border-black bg-white px-6 py-1.5 text-sm font-bold"
          >
            Sign in
          </Link>
        )}
      </div>
    </header>
  );
}

export default Header;