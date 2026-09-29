import { useEffect } from "react"
import {
  BrowserRouter,
  Routes,
  Route,
  useLocation,
} from "react-router-dom"

import socket from "./socket"

import Header from "./components/Header"
import Footer from "./components/Footer"

import Lobby from "./pages/Lobby"
import Room from "./pages/Room"
import RoomSettings from "./pages/RoomSettings"
import RoomWaiting from "./pages/RoomWaiting"
import ScoreSummary from "./pages/ScoreSummary"
import SignIn from "./pages/SignIn"
import SignUp from "./pages/SignUp"
import Game from "./pages/Game"

function AppContent() {
  const location = useLocation()

  const isGamePage = location.pathname === "/game"

  return (
    <div className="flex min-h-screen flex-col">
      {!isGamePage && <Header />}

      <main className="flex-1">
        <Routes>
          <Route path="/" element={<Lobby />} />
          <Route path="/room" element={<Room />} />
          <Route
            path="/room/create"
            element={<RoomSettings />}
          />
          <Route
            path="/room/waiting"
            element={<RoomWaiting />}
          />
          <Route path="/game" element={<Game />} />
          <Route
            path="/score"
            element={<ScoreSummary />}
          />
          <Route path="/login" element={<SignIn />} />
          <Route path="/signup" element={<SignUp />} />
        </Routes>
      </main>

      {!isGamePage && <Footer />}
    </div>
  )
}

function App() {
  useEffect(() => {
    socket.on("connect", () => {
      console.log("Connected to server:", socket.id)
    })

    socket.on("disconnect", () => {
      console.log("Disconnected from server")
    })

    return () => {
      socket.off("connect")
      socket.off("disconnect")
    }
  }, [])

  return (
    <BrowserRouter>
      <AppContent />
    </BrowserRouter>
  )
}

export default App