import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { AuthProvider } from "./contexts/AuthContext";
import { DebugProvider } from "./contexts/DebugContext";
import { SyncProvider } from "./contexts/SyncContext";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <AuthProvider>
      <SyncProvider>
        <DebugProvider>
          <App />
        </DebugProvider>
      </SyncProvider>
    </AuthProvider>
  </React.StrictMode>,
);
