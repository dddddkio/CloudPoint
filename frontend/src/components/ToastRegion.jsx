import { CheckIcon, CloseIcon, ErrorIcon, InfoIcon } from "./Icons.jsx";

const styles = {
  success: {
    icon: CheckIcon,
    iconClass: "text-emerald-400",
  },
  error: {
    icon: ErrorIcon,
    iconClass: "text-rose-400",
  },
  info: {
    icon: InfoIcon,
    iconClass: "text-blue-300",
  },
};

export default function ToastRegion({ messages, onDismiss }) {
  return (
    <div
      className="pointer-events-none fixed bottom-5 left-1/2 z-[70] flex w-[min(420px,calc(100vw-2rem))] -translate-x-1/2 flex-col gap-2"
      aria-live="polite"
      aria-label="Notifications"
    >
      {messages.map((message) => {
        const style = styles[message.type] || styles.info;
        const StatusIcon = style.icon;
        return (
          <div
            key={message.id}
            role={message.type === "error" ? "alert" : "status"}
            aria-atomic="true"
            className={`pointer-events-auto flex min-h-12 w-full items-start gap-3 rounded-md border border-white/10 bg-slate-900/95 px-3.5 py-3 shadow-[0_12px_32px_rgba(15,23,42,0.28)] backdrop-blur ${
              message.leaving ? "animate-toast-out" : "animate-toast-in"
            }`}
          >
            <StatusIcon className={`mt-0.5 h-[18px] w-[18px] shrink-0 ${style.iconClass}`} />
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-medium leading-5 text-white">{message.title}</p>
              {message.detail && <p className="text-[13px] leading-5 text-slate-300">{message.detail}</p>}
            </div>
            <button
              onClick={() => onDismiss(message.id)}
              disabled={message.leaving}
              className="grid h-7 w-7 shrink-0 place-items-center rounded text-slate-400 transition hover:bg-white/10 hover:text-white disabled:opacity-30"
              aria-label="Dismiss notification"
            >
              <CloseIcon className="h-3.5 w-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
