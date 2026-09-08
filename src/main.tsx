import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { applyStoredTheme } from "./lib/themeColors";
import { clearAppCaches, storageUsageBytes } from "./lib/safeStorage";

applyStoredTheme();

// A near-full localStorage makes every write throw, which used to freeze
// typing, sending and chat loading. Reclaim disposable caches on startup.
if (storageUsageBytes() > 3_500_000) clearAppCaches();

createRoot(document.getElementById("root")!).render(<App />);

// The published app is frequently opened from a phone home-screen shortcut.
// Register a tiny network-first worker so those launches get the newest
// published HTML instead of an old browser-cached copy.
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/sw.js", {
      updateViaCache: "none",
    });
  });
}
