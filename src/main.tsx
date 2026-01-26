import { RouterProvider } from "@tanstack/react-router";
import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import { runMigrations } from "./lib/migrations";
import { router } from "./router";

// Run migrations before rendering the app
// We MUST wait for migrations to complete before rendering,
// otherwise auth and other services may try to access tables that don't exist yet
async function initializeApp() {
  try {
    const result = await runMigrations();
    if (result.errors.length > 0) {
      console.error('[App] Migration errors:', result.errors);
    }
    if (result.applied.length > 0) {
      console.log('[App] Applied migrations:', result.applied);
    }
  } catch (error) {
    console.error('[App] Failed to run migrations:', error);
    // Continue anyway - the app may still work if tables exist from a previous run
  }

  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      <RouterProvider router={router} />
    </React.StrictMode>,
  );
}

initializeApp();
