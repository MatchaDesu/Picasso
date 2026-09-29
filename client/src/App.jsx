import { BrowserRouter, Routes, Route } from "react-router-dom"

import Header from "./components/Header"
import Footer from "./components/Footer"

import Lobby from "./pages/Lobby"
import Room from "./pages/Room"
import RoomSettings from "./pages/RoomSettings"
import RoomWaiting from "./pages/RoomWaiting"
import ScoreSummary from "./pages/ScoreSummary"
import SignIn from "./pages/SignIn"
import SignUp from "./pages/SignUp"

function App() {
  return (
    <BrowserRouter>
      <div className="flex min-h-screen flex-col">
        <Header />

        <main className="flex-1">
          <Routes>
            {/* Lobby */}
            <Route path="/" element={<Lobby />} />

            {/* Room */}
            <Route path="/room" element={<Room />} />
            <Route path="/room/create" element={<RoomSettings />} />
            <Route path="/room/waiting" element={<RoomWaiting />} />

            {/* Game Result */}
            <Route path="/score" element={<ScoreSummary />} />

            {/* Authentication */}
            <Route path="/login" element={<SignIn />} />
            <Route path="/signup" element={<SignUp />} />
          </Routes>
        </main>

        <Footer />
      </div>
    </BrowserRouter>
  )
}

export default App