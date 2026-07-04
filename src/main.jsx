import { createRoot } from "react-dom/client";
import { configureMapRuntime } from "./runtime/assets.js";
import { startTranslator } from "./runtime/translator.js";
import App from "./App.jsx";
import AuthGate from "./Auth/AuthGate.jsx";
import "maplibre-gl/dist/maplibre-gl.css";
import "./styles.css";

configureMapRuntime();

createRoot(document.getElementById("root")).render(
  <AuthGate>
    <App />
  </AuthGate>,
);

// Live-translates the UI when a non-English language is set in Settings.
// Left outside AuthGate on purpose: it depends on GET/PUT /api/lang/:code,
// which stays public (unauthenticated) so translation keeps working through
// the Setup/Login screens too — gating it behind auth would flash English on
// the very screens that decide the account.
startTranslator();

if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
        navigator.serviceWorker.register("/sw.js").catch((error) => {
            console.warn("Service worker registration failed:", error);
        });
    });
}
