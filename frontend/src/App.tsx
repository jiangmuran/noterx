import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { ThemeProvider, CssBaseline } from "@mui/material";
import { AnimatePresence, motion } from "framer-motion";
import theme from "./theme";
import { pageTransition } from "./utils/motion";
import ToastContainer from "./components/Toast";
import ErrorBoundary from "./components/ErrorBoundary";
import "./index.css";

/* ── Lazy-loaded pages ── */
const Home = lazy(() => import("./pages/Home"));
const Diagnosing = lazy(() => import("./pages/Diagnosing"));
const Report = lazy(() => import("./pages/Report"));
const History = lazy(() => import("./pages/History"));
const ScreenshotAnalysis = lazy(() => import("./pages/ScreenshotAnalysis"));

/* ── Minimal loading fallback ── */
function PageLoader() {
  return (
    <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "60vh" }}>
      <div style={{ width: 28, height: 28, border: "3px solid #eee", borderTopColor: "#ff2442", borderRadius: "50%", animation: "spin 0.6s linear infinite" }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

/**
 * Animated route wrapper — gives every page enter/exit transitions
 * powered by Framer Motion's AnimatePresence.
 */
function AnimatedRoutes() {
  const location = useLocation();

  return (
    <AnimatePresence mode="wait">
      <Routes location={location} key={location.pathname}>
        <Route
          path="/app"
          element={
            <motion.div
              variants={pageTransition}
              initial="initial"
              animate="animate"
              exit="exit"
              style={{ minHeight: "100vh" }}
            >
              <Suspense fallback={<PageLoader />}>
                <Home />
              </Suspense>
            </motion.div>
          }
        />
        <Route
          path="/"
          element={
            <motion.div
              variants={pageTransition}
              initial="initial"
              animate="animate"
              exit="exit"
              style={{ minHeight: "100vh" }}
            >
              <Suspense fallback={<PageLoader />}>
                <Home />
              </Suspense>
            </motion.div>
          }
        />
        <Route
          path="/diagnosing"
          element={
            <motion.div
              variants={pageTransition}
              initial="initial"
              animate="animate"
              exit="exit"
              style={{ minHeight: "100vh" }}
            >
              <Suspense fallback={<PageLoader />}>
                <Diagnosing />
              </Suspense>
            </motion.div>
          }
        />
        <Route
          path="/report"
          element={
            <motion.div
              variants={pageTransition}
              initial="initial"
              animate="animate"
              exit="exit"
              style={{ minHeight: "100vh" }}
            >
              <Suspense fallback={<PageLoader />}>
                <Report />
              </Suspense>
            </motion.div>
          }
        />
        <Route
          path="/history"
          element={
            <motion.div
              variants={pageTransition}
              initial="initial"
              animate="animate"
              exit="exit"
              style={{ minHeight: "100vh" }}
            >
              <Suspense fallback={<PageLoader />}>
                <History />
              </Suspense>
            </motion.div>
          }
        />
        <Route
          path="/screenshot"
          element={
            <motion.div
              variants={pageTransition}
              initial="initial"
              animate="animate"
              exit="exit"
              style={{ minHeight: "100vh" }}
            >
              <Suspense fallback={<PageLoader />}>
                <ScreenshotAnalysis />
              </Suspense>
            </motion.div>
          }
        />
      </Routes>
    </AnimatePresence>
  );
}

/**
 * NoteRx Root Component
 */
function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <ErrorBoundary>
        <BrowserRouter basename="/app">
          <AnimatedRoutes />
          <ToastContainer />
        </BrowserRouter>
      </ErrorBoundary>
    </ThemeProvider>
  );
}

export default App;
