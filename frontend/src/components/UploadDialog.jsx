import { useEffect, useState } from "react";
import UploadForm from "./UploadForm.jsx";
import { CloseIcon } from "./Icons.jsx";

export default function UploadDialog({ open, onClose, onUploaded }) {
  const [busy, setBusy] = useState(false);

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

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[65] grid place-items-center overflow-y-auto bg-slate-950/35 p-4 backdrop-blur-[1px]">
      <button
        className="absolute inset-0 cursor-default"
        onClick={() => !busy && onClose()}
        aria-label="Close upload dialog"
      />
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="upload-dialog-title"
        className="relative my-6 w-full max-w-2xl overflow-hidden rounded-lg border border-slate-200 bg-white shadow-[0_24px_64px_rgba(15,23,42,0.24)] animate-dialog-in"
      >
        <header className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
          <div>
            <h2 id="upload-dialog-title" className="text-base font-semibold text-slate-900">Add point cloud</h2>
            <p className="mt-1 text-sm text-slate-500">Upload an uncompressed LAS file to this workspace.</p>
          </div>
          <button
            onClick={onClose}
            disabled={busy}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-30"
            aria-label="Close upload dialog"
          >
            <CloseIcon className="h-4 w-4" />
          </button>
        </header>

        <UploadForm
          embedded
          onCancel={onClose}
          onBusyChange={setBusy}
          onUploaded={onUploaded}
        />

        <footer className="border-t border-slate-200 bg-slate-50 px-5 py-3 text-xs text-slate-500">
          Accepted: LAS 1.0–1.4 · Maximum 500 MB · File signature and metadata are validated before storage
        </footer>
      </section>
    </div>
  );
}
