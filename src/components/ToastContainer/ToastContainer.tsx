import { useEffect, useRef } from "react";
import { CheckCircle, AlertCircle, Info, X } from "lucide-react";
import { useToastStore, type Toast, type ToastType } from "../../stores/toastStore";

const TYPE_ICON: Record<ToastType, { icon: React.ReactNode; border: string }> = {
  success: { icon: <CheckCircle size={16} className="text-[#38a169] shrink-0" />, border: "border-l-[3px] border-l-[#38a169]" },
  error: { icon: <AlertCircle size={16} className="text-[#e53e3e] shrink-0" />, border: "border-l-[3px] border-l-[#e53e3e]" },
  info: { icon: <Info size={16} className="text-ui-accent shrink-0" />, border: "border-l-[3px] border-l-ui-accent" },
};

function ToastItem({ toast }: { toast: Toast }) {
  const removeToast = useToastStore((s) => s.removeToast);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startRef = useRef(0);
  const pausedRef = useRef(0);
  const { icon, border } = TYPE_ICON[toast.type];

  useEffect(() => {
    const scheduleRemove = (delay: number) => {
      timerRef.current = setTimeout(() => removeToast(toast.id), delay);
    };
    startRef.current = Date.now();
    scheduleRemove(toast.duration);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [toast.id, toast.duration, removeToast]);

  const handleMouseEnter = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    pausedRef.current += Date.now() - startRef.current;
  };

  const handleMouseLeave = () => {
    const elapsed = pausedRef.current;
    const remaining = Math.max(0, toast.duration - elapsed);
    startRef.current = Date.now();
    timerRef.current = setTimeout(() => removeToast(toast.id), remaining);
  };

  return (
    <div
      role="status"
      aria-live="polite"
      className={`flex items-start gap-2.5 p-3 min-w-[260px] max-w-[360px] bg-ui-bg border border-ui-border rounded-[10px] shadow-toast animate-toast-in pointer-events-auto ${border}`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {icon}
      <div className="flex-1 min-w-0 text-[13px] text-ui-text leading-snug break-words">
        {toast.message}
      </div>
      <button
        className="shrink-0 w-5 h-5 flex items-center justify-center text-ui-text-secondary hover:text-ui-text cursor-pointer border-none bg-transparent text-sm leading-none p-0"
        onClick={() => removeToast(toast.id)}
        aria-label="Close"
      >
        <X size={14} />
      </button>
    </div>
  );
}

export default function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-5 right-5 z-[1000] flex flex-col gap-2 pointer-events-none">
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} />
      ))}
    </div>
  );
}
