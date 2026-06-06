import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { applyStoredTheme } from "./lib/themeColors";

applyStoredTheme();

createRoot(document.getElementById("root")!).render(<App />);
