import { BrowserRouter, Routes, Route } from "react-router-dom";

import Home from "./pages/Home";
import CreateRoom from "./pages/CreateRoom";
import BrowseRoom from "./pages/BrowseRoom";
import WaitingRoom from "./pages/WaitingRoom";
import Game from "./pages/Game";
import Result from "./pages/Result";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />

        <Route path="/create-room" element={<CreateRoom />} />

        <Route path="/browse-room" element={<BrowseRoom />} />

        <Route path="/waiting-room" element={<WaitingRoom />} />

        <Route path="/game" element={<Game />} />

        <Route path="/result" element={<Result />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
