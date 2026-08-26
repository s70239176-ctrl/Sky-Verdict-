import React, { createContext, useCallback, useContext, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

const ToastContext = createContext(null);
let idCounter = 0;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const dismiss = useCallback((id) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  const push = useCallback(
    (message, { tone = "info", duration = 5000 } = {}) => {
      const id = ++idCounter;
      setToasts((t) => [...t, { id, message, tone }]);
      if (duration) setTimeout(() => dismiss(id), duration);
      return id;
    },
    [dismiss]
  );

  const toast = {
    info: (msg, opts) => push(msg, { tone: "info", ...opts }),
    success: (msg, opts) => push(msg, { tone: "success", ...opts }),
    error: (msg, opts) => push(msg, { tone: "error", duration: 8000, ...opts }),
  };

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 w-[min(92vw,380px)]">
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, y: 12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.98 }}
              className={`border px-4 py-3 text-sm shadow-lg backdrop-blur-md ${
                t.tone === "success"
                  ? "bg-green/10 border-green/40 text-green"
                  : t.tone === "error"
                  ? "bg-amber/10 border-amber/40 text-amber"
                  : "bg-near-black/95 border-ivory-soft/15 text-ivory"
              }`}
              role="status"
            >
              {t.message}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside ToastProvider");
  return ctx;
}
