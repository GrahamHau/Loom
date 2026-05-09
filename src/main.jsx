import React from "react";
import ReactDOM from "react-dom/client";
import "./legacy/styles.css";

window.React = React;
window.ReactDOM = ReactDOM;

await import("./legacy/components.jsx");
await import("./legacy/tweaks-panel.jsx");
await import("./legacy/screens.jsx");
await import("./App.jsx");
