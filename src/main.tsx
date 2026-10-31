import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource/ibm-plex-sans/latin-400.css";
import "@fontsource/ibm-plex-sans/latin-500.css";
import "@fontsource/ibm-plex-sans/latin-600.css";
import "@fontsource/ibm-plex-sans/latin-700.css";
import "@fontsource/ibm-plex-mono/latin-400.css";
import "@fontsource/ibm-plex-mono/latin-500.css";
import "@fontsource/ibm-plex-mono/latin-600.css";
import "./index.css";
import App from "./App.tsx";
import { applyTheme, watchSystemTheme } from "./utils/theme";

applyTheme();
watchSystemTheme();

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Root element #root not found in DOM");

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
