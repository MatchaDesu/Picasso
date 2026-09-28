import { Link } from "react-router-dom"

function SignUp() {
  return (
    <div className="flex min-h-[calc(100vh-73px)] flex-col bg-white">
      <main className="mx-auto flex w-full max-w-[1080px] flex-1 items-center justify-center px-6 py-8">
        <section className="w-full max-w-[480px] rounded-[36px] border-[3px] border-black bg-white px-9 pb-8 pt-10">
          <h2 className="mb-7 text-[26px] font-extrabold text-black">
            Create your Account
          </h2>

          <form>
            <div className="mb-5 flex flex-col">
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

            <div className="mb-5 flex flex-col">
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
            </div>

            <div className="mb-5 flex flex-col">
              <label
                htmlFor="confirm-password"
                className="mb-1.5 pl-1 text-[13px] font-bold text-[#333]"
              >
                Confirm Password
              </label>

              <div className="relative flex items-center">
                <span className="pointer-events-none absolute left-[14px] text-sm opacity-70">
                  🔒
                </span>

                <input
                  type="password"
                  id="confirm-password"
                  placeholder="••••••••"
                  required
                  className="h-11 w-full rounded-[22px] border-2 border-black bg-[#f1f1f1] pl-[38px] pr-4 text-sm outline-none transition-colors duration-200 focus:bg-white"
                />
              </div>
            </div>

            <div className="my-6 h-px bg-[#f0f0f0]" />

            <div className="flex items-center justify-between gap-4">
              <Link
                to="/"
                className="rounded-[20px] border-2 border-black bg-transparent px-[18px] py-2 text-xs font-bold hover:bg-[#f5f5f5]"
              >
                Cancel & Exit
              </Link>

              <button
                type="submit"
                className="inline-flex items-center gap-2 rounded-[24px] border-[2.5px] border-black bg-[#d6f679] px-6 py-2.5 text-sm font-extrabold hover:bg-[#c9ec65]"
              >
                <span>🐾</span>
                Get Start
                <span>→</span>
              </button>
            </div>
          </form>
        </section>
      </main>
    </div>
  )
}

export default SignUp