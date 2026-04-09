import { useEffect, useState } from "react";
import { Alert, Snackbar } from "@mui/material";
import type { AlertColor } from "@mui/material";

type ToastPayload = {
  message: string;
  severity?: AlertColor;
};

let showToastFn: ((payload: ToastPayload) => void) | null = null;

export function showToast(message: string, severity: AlertColor = "success") {
  showToastFn?.({ message, severity });
}

export default function ToastContainer() {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [severity, setSeverity] = useState<AlertColor>("success");

  useEffect(() => {
    showToastFn = ({ message: nextMessage, severity: nextSeverity = "success" }) => {
      setMessage(nextMessage);
      setSeverity(nextSeverity);
      setOpen(true);
    };
    return () => {
      showToastFn = null;
    };
  }, []);

  return (
    <Snackbar
      open={open}
      autoHideDuration={2500}
      onClose={() => setOpen(false)}
      anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
    >
      <Alert
        onClose={() => setOpen(false)}
        severity={severity}
        variant="filled"
        sx={{ borderRadius: 3 }}
      >
        {message}
      </Alert>
    </Snackbar>
  );
}
