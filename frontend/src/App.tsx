import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { ThemeProvider, CssBaseline } from "@mui/material";
import { AnimatePresence, motion } from "framer-motion";
import theme from "./theme";
import { pageTransition } from "./utils/motion";
import Home from "./pages/Home";
import Diagnosing from "./pages/Diagnosing";
import Report from "./pages/Report";
import History from "./pages/History";
import ScreenshotAnalysis from "./pages/ScreenshotAnalysis";
import ToastContainer from "./components/Toast";
import ErrorBoundary from "./components/ErrorBoundary";
import "./index.css";

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
              <Home />
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
              <Home />
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
              <Diagnosing />
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
              <Report />
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
              <History />
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
              <ScreenshotAnalysis />
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
        <BrowserRouter>
          <AnimatedRoutes />
          <ToastContainer />
        </BrowserRouter>
      </ErrorBoundary>
    </ThemeProvider>
  );
}

export default App;
