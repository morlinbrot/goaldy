import { AutoshipButton, AutoshipProvider } from "@autoship/react";
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { AuthProvider } from "./contexts/AuthContext";
import { DebugProvider } from "./contexts/DebugContext";
import { SyncProvider } from "./contexts/SyncContext";
import "./index.css";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "./lib/supabase-config";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <AuthProvider>
      <SyncProvider>
        <DebugProvider>
          <AutoshipProvider
            supabaseUrl={SUPABASE_URL}
            supabaseAnonKey={SUPABASE_ANON_KEY}
          >
            <App />
            <AutoshipButton position="bottom-left" />
          </AutoshipProvider>
        </DebugProvider>
      </SyncProvider>
    </AuthProvider>
  </React.StrictMode>,
);
