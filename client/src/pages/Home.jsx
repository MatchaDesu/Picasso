import Header from "../components/Header";
import CharacterCustomizer from "../components/CharacterCustomizer";
import ArtistName from "../components/ArtistName";
import JoinRoom from "../components/JoinRoom";
import Leaderboard from "../components/Leaderboard";
import Footer from "../components/Footer";

function Home() {
  return (
    <div className="flex min-h-screen flex-col bg-white text-black">
      <Header />

      <main className="mx-auto flex w-full max-w-[1080px] flex-1 flex-col gap-6 px-6 py-8">
        {/* Main */}
        <div className="grid grid-cols-[1fr_380px] items-start gap-9">
          {/* Left */}
          <section className="flex flex-col gap-5">
            <CharacterCustomizer />

            <ArtistName />
          </section>

          {/* Right */}
          <section className="flex flex-col gap-[14px]">
            <button
              type="button"
              className="h-12 w-full rounded-full border-2 border-black bg-[#d6f679] text-[17px] font-bold transition hover:opacity-80"
            >
              Quick Match
            </button>

            <button
              type="button"
              className="h-12 w-full rounded-full border-2 border-black bg-white text-[17px] font-bold transition hover:bg-[#e5e5e5]"
            >
              Create Room
            </button>

            <button
              type="button"
              className="h-12 w-full rounded-full border-2 border-black bg-white text-[17px] font-bold transition hover:bg-[#e5e5e5]"
            >
              Browse Room
            </button>

            <JoinRoom />
          </section>
        </div>

        {/* Leaderboard */}
        <Leaderboard />
      </main>

      <Footer />
    </div>
  );
}

export default Home;
