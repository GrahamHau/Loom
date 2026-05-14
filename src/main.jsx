import React from "react";
import ReactDOM from "react-dom/client";
import "./legacy/styles.css";

globalThis.React = React;
globalThis.ReactDOM = ReactDOM;

if (window.location.pathname.startsWith("/admin")) {
  const { default: AdminApp } = await import("./admin/AdminApp.jsx");
  ReactDOM.createRoot(document.getElementById("root")).render(<AdminApp />);
} else {
  await import("./legacy/components.jsx");
  await import("./legacy/tweaks-panel.jsx");
  await import("./legacy/screens.jsx");
  await import("./App.jsx");
}
