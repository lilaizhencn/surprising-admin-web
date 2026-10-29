import React from "react";
import { createRoot } from "react-dom/client";
import { restoreBrowserSession } from "./api/client";
import App from "./App";
import "./styles.css";
import "./components/ConsoleShell.css";
import { initialTheme, saveTheme } from "./lib/theme";

saveTheme(initialTheme());

const element = document.getElementById("root")!;
const root = createRoot(element);
async function start() {
  root.render(<p role="status">正在恢复安全会话…</p>);
  try {
    await restoreBrowserSession();
    root.render(<React.StrictMode><App /></React.StrictMode>);
  } catch {
    root.render(<div role="alert">暂时无法恢复登录会话。<button onClick={() => void start()}>重试</button></div>);
  }
}
void start();
