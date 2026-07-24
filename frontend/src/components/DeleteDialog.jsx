import { useEffect } from "react";
import { CloseIcon, TrashIcon } from "./Icons.jsx";

export default function DeleteDialog({
  open,
  pointCloud,
  busy,
  onClose,
  onConfirm,
}) {
  useEffect(() => {
    if (!open) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function onKeyDown(event) {
      if (event.key === "Escape" && !busy) onClose();
    }

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [busy, onClose, open]);

  if (!open || !pointCloud) return null;

  return (
    <div className="fixed inset-0 z-[65] grid place-items-center bg-slate-950/35 p-4 backdrop-blur-[1px]">
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        onClick={() => !busy && onClose()}
        aria-label="Close delete dialog"
      />
      <section
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="delete-dialog-title"
        aria-describedby="delete-dialog-description"
        className="relative w-full max-w-md overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_24px_64px_rgba(15,23,42,0.24)] animate-dialog-in"
      >
        <div className="p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-rose-50 text-rose-700">
              <TrashIcon className="h-5 w-5" />
            </div>
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="grid h-8 w-8 place-items-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-40"
              aria-label="Close delete dialog"
            >
              <CloseIcon className="h-4 w-4" />
            </button>
          </div>
          <h2 id="delete-dialog-title" className="mt-4 text-lg font-semibold text-slate-900">
            Delete point cloud?
          </h2>
          <p id="delete-dialog-description" className="mt-2 text-sm leading-6 text-slate-600">
            <span className="font-medium text-slate-800">{pointCloud.original_filename}</span> and its
            stored LAS source will be permanently removed. This action cannot be undone.
          </p>
        </div>
        <footer className="flex justify-end gap-2 border-t border-slate-200 bg-slate-50 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="inline-flex min-w-28 items-center justify-center gap-2 rounded-md bg-rose-700 px-4 py-2 text-sm font-medium text-white hover:bg-rose-800 disabled:cursor-wait disabled:opacity-60"
          >
            {busy && <span className="h-4 w-4 animate-spin rounded-full border-2 border-rose-300 border-t-white" />}
            {busy ? "Deleting" : "Delete"}
          </button>
        </footer>
      </section>
    </div>
  );
}
