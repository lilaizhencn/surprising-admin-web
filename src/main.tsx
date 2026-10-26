import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";
import "./components/ConsoleShell.css";
import { initialTheme, saveTheme } from "./lib/theme";

saveTheme(initialTheme());

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
