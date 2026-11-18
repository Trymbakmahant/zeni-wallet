import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App.tsx";
import "./index.css";

if (new URLSearchParams(window.location.search).get("approval") === "1") {
  document.body.classList.add("approval-window");
  document.title = "Review request — Zeni Wallet";
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
