import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import "./styles/theme.css";

// ── Startup store sanitizer ───────────────────────────────────────────────────
// Runs before React mounts. Silently wipes any store whose persisted JSON is
// corrupt or structurally wrong so non-technical users never see a black screen.
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
    if (!raw) continue;
    const parsed = JSON.parse(raw);
    // Zustand persist wraps state in { state: {...}, version: n }
    // If that envelope is missing or state is not an object, wipe it.
    if (typeof parsed !== 'object' || parsed === null || typeof parsed.state !== 'object') {
      throw new Error('invalid store envelope');
    }
  } catch {
    console.warn(`[startup] Wiping corrupt store: ${key}`);
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
