import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "@/app/App";
import "@/styles/index.css";

const container = document.getElementById("root");
if (!container) {
  throw new Error("Orbit: #root container is missing from index.html");
}

// 规范 §36.1: 默认深色，避免首帧闪白。
if (!document.documentElement.dataset.theme) {
  document.documentElement.dataset.theme = "dark";
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
