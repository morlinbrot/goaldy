import { RouterProvider } from "@tanstack/react-router";
import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import { runMigrations } from "./lib/migrations";
import { router } from "./router";

// Run migrations before rendering the app
runMigrations()
  .then((result) => {
    if (result.errors.length > 0) {
      console.error('[App] Migration errors:', result.errors);
    }
    if (result.applied.length > 0) {
      console.log('[App] Applied migrations:', result.applied);
    }
  })
  .catch((error) => {
    console.error('[App] Failed to run migrations:', error);
  })
  .finally(() => {
    ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
      <React.StrictMode>
        <RouterProvider router={router} />
      </React.StrictMode>,
    );
  });
