import { useEffect } from "react"
import { BrowserRouter, Routes, Route } from "react-router-dom"

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
      <div className="flex min-h-screen flex-col">
        <Header />

        <main className="flex-1">
          <Routes>
            <Route path="/" element={<Lobby />} />
            <Route path="/room" element={<Room />} />
            <Route path="/room/create" element={<RoomSettings />} />
            <Route path="/room/waiting" element={<RoomWaiting />} />
            <Route path="/score" element={<ScoreSummary />} />
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