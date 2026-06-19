import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import Admin from "./Admin.jsx";

// Routage minimal sans dépendance : /admin -> dashboard, tout le reste -> espace client
const Component = window.location.pathname.startsWith("/admin") ? Admin : App;

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <Component />
  </React.StrictMode>,
);
