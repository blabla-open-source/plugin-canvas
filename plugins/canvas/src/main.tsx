import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { CanvasApp } from "./app/canvas-app";
import "./styles.css";

const root = document.getElementById("root");

if (!root) {
  throw new Error("Missing #root");
}

createRoot(root).render(
  <StrictMode>
    <CanvasApp />
  </StrictMode>
);
