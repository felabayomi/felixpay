import { createRoot } from "react-dom/client";
import { ClerkProvider } from "@clerk/clerk-react";
import App from "./App";
import "./index.css";

const publishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
if (!publishableKey) throw new Error("VITE_CLERK_PUBLISHABLE_KEY must be set");

createRoot(document.getElementById("root")!).render(
  <ClerkProvider publishableKey={publishableKey} afterSignOutUrl="/">
    <App />
  </ClerkProvider>,
);
