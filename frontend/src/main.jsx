import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { AuthProvider } from "./context/AuthContext";
import { PreferencesProvider } from "./context/PreferencesContext";
import { TrackingProvider } from "./context/TrackingContext";
import "./styles.css";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <PreferencesProvider><BrowserRouter>
      <AuthProvider><TrackingProvider><App /></TrackingProvider></AuthProvider>
    </BrowserRouter></PreferencesProvider>
  </React.StrictMode>,
);
