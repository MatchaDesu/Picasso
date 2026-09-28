import { Link } from "react-router-dom"

function SignIn() {
  return (
    <div className="flex min-h-full w-full items-center justify-center px-4 py-6">
      <main className="w-full max-w-[480px]">
        <section className="w-full rounded-[36px] border-[3px] border-black bg-white px-9 pb-7 pt-9">
          {/* Title */}
          <h2 className="mb-[22px] text-[26px] font-extrabold text-black">
            Welcome!
          </h2>

          <form>
            {/* Email */}
            <div className="mb-[14px] flex flex-col">
              <label
                htmlFor="email"
                className="mb-1.5 pl-1 text-[13px] font-bold text-[#333]"
              >
                Email
              </label>

              <div className="relative flex items-center">
                <span className="pointer-events-none absolute left-[14px] text-sm opacity-70">
                  ✉️
                </span>

                <input
                  type="email"
                  id="email"
                  placeholder="example@email.com"
                  required
                  className="h-11 w-full rounded-[22px] border-2 border-black bg-[#f1f1f1] pl-[38px] pr-4 text-sm outline-none transition-colors duration-200 focus:bg-white"
                />
              </div>
            </div>

            {/* Password */}
            <div className="mb-[14px] flex flex-col">
              <label
                htmlFor="password"
                className="mb-1.5 pl-1 text-[13px] font-bold text-[#333]"
              >
                Password
              </label>

              <div className="relative flex items-center">
                <span className="pointer-events-none absolute left-[14px] text-sm opacity-70">
                  🔒
                </span>

                <input
                  type="password"
                  id="password"
                  placeholder="••••••••"
                  required
                  className="h-11 w-full rounded-[22px] border-2 border-black bg-[#f1f1f1] pl-[38px] pr-4 text-sm outline-none transition-colors duration-200 focus:bg-white"
                />
              </div>

              {/* Forgot Password */}
              <div className="mt-1.5 flex justify-end">
                <a
                  href="#"
                  className="text-[11px] text-[#888] no-underline hover:underline"
                >
                  Forgot Password
                </a>
              </div>
            </div>

            {/* Don't have an account */}
            <div className="my-[18px] flex items-center text-center">
              <div className="flex-1 border-b border-[#d5d5d5]" />

              <span className="px-3 text-xs text-[#888]">
                don't have an account?
              </span>

              <div className="flex-1 border-b border-[#d5d5d5]" />
            </div>

            {/* Sign Up */}
            <div className="mb-5 flex justify-center">
              <Link
                to="/signup"
                className="inline-flex items-center gap-2 rounded-[22px] border-2 border-black bg-[#e3faa4] px-9 py-2 text-sm font-extrabold hover:bg-[#d6f679]"
              >
                <span>🐾</span>
                Sign Up
              </Link>
            </div>

            {/* Divider */}
            <div className="mb-5 h-px bg-[#f0f0f0]" />

            {/* Actions */}
            <div className="flex items-center justify-between gap-4">
              <Link
                to="/"
                className="rounded-[20px] border-2 border-black bg-transparent px-[18px] py-2 text-xs font-bold hover:bg-[#f5f5f5]"
              >
                Cancel & Exit
              </Link>

              <button
                type="submit"
                className="inline-flex items-center gap-2 rounded-[24px] border-[2.5px] border-black bg-[#d6f679] px-6 py-2.5 text-sm font-extrabold outline-none hover:bg-[#c9ec65]"
              >
                <span>🐾</span>
                Sign in
                <span>→</span>
              </button>
            </div>
          </form>
        </section>
      </main>
    </div>
  )
}

export default SignIn