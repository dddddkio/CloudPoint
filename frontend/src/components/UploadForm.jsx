import { useEffect, useRef, useState } from "react";
import { uploadPointCloud } from "../api.js";
import { CheckIcon, UploadIcon } from "./Icons.jsx";

const MAX_BYTES = 500 * 1024 * 1024;

function formatBytes(bytes) {
  return bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export default function UploadForm({
  embedded = false,
  onCancel,
  onBusyChange,
  onUploaded,
}) {
  const inputRef = useRef(null);
  const [file, setFile] = useState(null);
  const [phase, setPhase] = useState("idle");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);

  async function pick(candidate) {
    setError("");
    setProgress(0);
    setPhase("validating");
    setFile(candidate ?? null);

    if (!candidate) {
      setPhase("idle");
      return;
    }
    if (!candidate.name.toLowerCase().endsWith(".las")) {
      const message = "Choose an uncompressed .las file.";
      setError(message);
      setFile(null);
      setPhase("error");
      return;
    }
    if (!candidate.size || candidate.size > MAX_BYTES) {
      const message = "The file must be smaller than 500 MB.";
      setError(message);
      setFile(null);
      setPhase("error");
      return;
    }

    try {
      const signature = new TextDecoder().decode(await candidate.slice(0, 4).arrayBuffer());
      if (signature !== "LASF") throw new Error("This file does not have a valid LAS signature.");
      setPhase("ready");
    } catch (err) {
      setError(err.message || "The file could not be validated.");
      setFile(null);
      setPhase("error");
    }
  }

  async function submit() {
    if (!file || phase !== "ready") return;
    setPhase("uploading");
    setProgress(0);
    setError("");
    try {
      const created = await uploadPointCloud(file, setProgress);
      setPhase("success");
      onUploaded?.(created);
      setTimeout(() => {
        setFile(null);
        setProgress(0);
        setPhase("idle");
        if (inputRef.current) inputRef.current.value = "";
      }, 1600);
    } catch (err) {
      setError(err.message);
      setPhase("error");
    }
  }

  const busy = phase === "uploading" || phase === "validating";

  useEffect(() => {
    onBusyChange?.(busy);
  }, [busy, onBusyChange]);

  return (
    <div className={embedded ? "bg-white" : "rounded-lg border border-slate-200 bg-white"}>
      {!embedded && <div className="border-b border-slate-200 px-5 py-4">
        <h2 className="text-base font-medium text-slate-900">Upload point cloud</h2>
        <p className="mt-1 text-sm text-slate-500">LAS files are validated before upload.</p>
      </div>}

      <div className="p-5">
        <div
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            void pick(event.dataTransfer.files?.[0]);
          }}
          className={`rounded-lg border-2 border-dashed p-6 text-center transition ${
            dragging ? "border-blue-500 bg-blue-50" : "border-slate-300 bg-slate-50/60"
          }`}
        >
          <div className="mx-auto grid h-10 w-10 place-items-center rounded-full bg-blue-50 text-blue-600">
            {busy ? (
              <span className="h-5 w-5 animate-spin rounded-full border-2 border-blue-200 border-t-blue-600" />
            ) : phase === "success" ? (
              <CheckIcon className="h-5 w-5 text-emerald-600" />
            ) : (
              <UploadIcon className="h-5 w-5" />
            )}
          </div>

          {file ? (
            <div className="mt-3">
              <p className="truncate text-sm font-medium text-slate-800" title={file.name}>{file.name}</p>
              <p className="mt-1 text-xs text-slate-500">
                {formatBytes(file.size)}
                {phase === "ready" && <span className="ml-2 text-emerald-700">Validated</span>}
              </p>
            </div>
          ) : (
            <div className="mt-3">
              <p className="text-sm text-slate-700">Drag and drop a LAS file here</p>
              <p className="mt-1 text-xs text-slate-500">or select a file from your computer</p>
            </div>
          )}

          <button
            type="button"
            onClick={() => !busy && inputRef.current?.click()}
            disabled={busy}
            className="mt-4 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50"
          >
            Choose file
          </button>
          <input ref={inputRef} type="file" accept=".las" className="hidden" onChange={(event) => void pick(event.target.files?.[0])} />
        </div>

        {(phase === "uploading" || phase === "success") && (
          <div className="mt-4">
            <div className="mb-2 flex justify-between text-xs text-slate-600">
              <span>{phase === "success" ? "Upload complete" : "Uploading"}</span>
              <span>{progress}%</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-slate-200">
              <div className="h-full rounded-full bg-blue-600 transition-all duration-300" style={{ width: `${progress}%` }} />
            </div>
          </div>
        )}

        {error && <div className="mt-4 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</div>}

        <div className="mt-5 flex items-center justify-between gap-3">
          <span className="text-xs text-slate-500">Maximum file size: 500 MB</span>
          <div className="flex items-center gap-2">
            {onCancel && (
              <button
                onClick={onCancel}
                disabled={busy}
                className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Cancel
              </button>
            )}
            <button
              onClick={submit}
              disabled={phase !== "ready"}
              className="rounded-md bg-blue-700 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-800 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
            >
              Upload
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
