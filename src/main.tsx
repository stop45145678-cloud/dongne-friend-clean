import "./styles.css";

import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Home from "./pages/Home";
import Call from "./pages/Call";
import Ranking from "./pages/Ranking";
import Shop from "./pages/Shop";
import Missions from "./pages/Missions";
import Friends from "./pages/Friends";
import Moments from "./pages/Moments";
import Letters from "./pages/Letters";
import Policies from "./pages/Policies";
import AdminModeration from "./pages/AdminModeration";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <BrowserRouter>
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/moments" element={<Moments />} />
      <Route path="/call" element={<Call />} />
      <Route path="/letters" element={<Letters />} />
      <Route path="/ranking" element={<Ranking />} />
      <Route path="/shop" element={<Shop />} />
      <Route path="/missions" element={<Missions />} />
      <Route path="/friends" element={<Friends />} />
      <Route path="/privacy" element={<Policies />} />
      <Route path="/terms" element={<Policies />} />
      <Route path="/community" element={<Policies />} />
      <Route path="/delete-account" element={<Policies />} />
      <Route path="/admin/moderation" element={<AdminModeration />} />
    </Routes>
  </BrowserRouter>
);
