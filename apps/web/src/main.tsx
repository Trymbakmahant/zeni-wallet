import React, { lazy, Suspense } from "react";
import { MotionConfig } from "framer-motion";
import ReactDOM from "react-dom/client";
import { PageLoader } from "./components/PageLoader";
import "./index.css";

const App = lazy(() => import("./App.tsx").then(module => ({ default: module.App })));
const DocsPage = lazy(() => import("./docs/DocsPage").then(module => ({ default: module.DocsPage })));
const VaultPage = lazy(() => import("./vault/VaultPage").then(module => ({ default: module.VaultPage })));
const NotFoundPage = lazy(() => import("./NotFoundPage").then(module => ({ default: module.NotFoundPage })));
const path = window.location.pathname.replace(/\/+$/, "");
const Page = path === "/vault" ? VaultPage : path === "/docs" ? DocsPage : path === "" || path === "/index.html" ? App : NotFoundPage;

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <MotionConfig reducedMotion="user">
      <Suspense fallback={<PageLoader />}><Page /></Suspense>
    </MotionConfig>
  </React.StrictMode>
);
