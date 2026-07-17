import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import App from "./App";

// ── Suppress benign runtime noise ──────────────────────────────────────────
// 1. lightweight-charts "Object is disposed": thrown from a pending RAF after
//    chart.remove() is called — cosmetic only, chart is already gone.
// 2. ResizeObserver loop: benign browser timing notice, not a real error.
// All three handlers below guard different entry points the overlay uses.

const SUPPRESS = (msg) =>
  typeof msg === 'string' && (
    msg.includes('Object is disposed') ||
    msg.includes('ResizeObserver loop completed') ||
    msg.includes('ResizeObserver loop limit exceeded')
  );

// (a) Capture-phase listener — fires before CRA overlay's bubble-phase listener
window.addEventListener('error', (e) => {
  if (SUPPRESS(e.message)) {
    e.stopImmediatePropagation();
    e.preventDefault();
  }
}, true);

// (b) window.onerror — catches errors from RAF callbacks in some browsers
window.onerror = (message) => {
  if (SUPPRESS(message)) return true; // returning true = suppressed
  return false;
};

// (c) unhandledrejection — in case the chart error leaks as a rejected promise
window.addEventListener('unhandledrejection', (e) => {
  if (SUPPRESS(e.reason?.message)) {
    e.stopImmediatePropagation();
    e.preventDefault();
  }
}, true);
// ────────────────────────────────────────────────────────────────────────────

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
