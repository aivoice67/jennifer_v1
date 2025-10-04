import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Hard reset session on full page refresh and force redirect to /login
// This executes before React mounts to guarantee a fresh session.
if (typeof window !== "undefined") {
	try {
		sessionStorage.clear();
	} catch {
		// ignore storage errors (private mode, etc.)
	}
	if (window.location.pathname !== "/login") {
		const url = new URL(window.location.href);
		url.pathname = "/login";
		url.search = "";
		url.hash = "";
		window.location.replace(url.toString());
	}
}

createRoot(document.getElementById("root")!).render(<App />);
