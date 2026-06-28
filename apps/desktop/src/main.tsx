import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import "./styles/theme.css";

// On startup, validate persisted stores. If any are unparseable, wipe them
// so a corrupt agent run can never cause a permanent black screen.
const STORE_KEYS = [
  'nano-bricks-run',
  'nano-bricks-history',
  'nano-bricks-session',
  'nano-bricks-theme',
  'nano-bricks-tools',
  'nano-bricks-memory',
  'nano-bricks-projects',
  'nano-bricks-scheduler',
  'nano-bricks-onboarding',
];
for (const key of STORE_KEYS) {
  try {
    const raw = localStorage.getItem(key);
    if (raw) JSON.parse(raw);
  } catch {
    console.warn(`[startup] Clearing corrupt store: ${key}`);
    localStorage.removeItem(key);
  }
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);
