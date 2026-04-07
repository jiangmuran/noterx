import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ThemeProvider, CssBaseline } from "@mui/material";
import theme from "./theme";
import Home from "./pages/Home";
import Diagnosing from "./pages/Diagnosing";
import Report from "./pages/Report";
import ToastContainer from "./components/Toast";
import ErrorBoundary from "./components/ErrorBoundary";
import "./index.css";

/**
 * NoteRx 根组件
 */
function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <ErrorBoundary>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/diagnosing" element={<Diagnosing />} />
            <Route path="/report" element={<Report />} />
          </Routes>
          <ToastContainer />
        </BrowserRouter>
      </ErrorBoundary>
    </ThemeProvider>
  );
}

export default App;
