import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider, createBrowserRouter } from "react-router";
import { routes } from "./app/routes";
import { startEventBridge } from "./lib/events";
import "./styles/tokens.css";

// Queries read the local Rust core, not the network, so there is nothing to refetch on focus.
const queryClient = new QueryClient({
  defaultOptions: { queries: { refetchOnWindowFocus: false, networkMode: "always" } },
});
const router = createBrowserRouter(routes);

if ("__TAURI_INTERNALS__" in window) void startEventBridge(queryClient);

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </StrictMode>,
  );
}
