import { createRoot } from "react-dom/client";
import App from "./App";
import { installGlobalErrorCapture } from "./lib/global-error-capture";
import "./index.css";

installGlobalErrorCapture();
createRoot(document.getElementById("root")!).render(<App />);
