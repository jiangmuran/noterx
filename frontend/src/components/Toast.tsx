import { useState, useEffect } from "react";
import { Snackbar, Alert } from "@mui/material";

let showToastFn: ((msg: string) => void) | null = null;

/**
 * 全局 toast 触发函数
 */
export function showToast(message: string) {
  showToastFn?.(message);
}

/**
 * Toast 容器（MUI Snackbar），放在 App 顶层即可
 */
export default function ToastContainer() {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    showToastFn = (msg: string) => {
      setMessage(msg);
      setOpen(true);
    };
    return () => {
      showToastFn = null;
    };
  }, []);

  return (
    <Snackbar
      open={open}
      autoHideDuration={2000}
      onClose={() => setOpen(false)}
      anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
    >
      <Alert
        onClose={() => setOpen(false)}
        severity="success"
        variant="filled"
        sx={{ borderRadius: 3 }}
      >
        {message}
      </Alert>
    </Snackbar>
  );
}
