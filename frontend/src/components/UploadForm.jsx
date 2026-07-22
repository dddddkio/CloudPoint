import { useRef, useState } from "react";
import { uploadPointCloud } from "../api.js";

export default function UploadForm({ onUploaded }) {
  const inputRef = useRef(null);
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);

  function pick(f) {
    setError("");
    if (f && !f.name.toLowerCase().endsWith(".las")) {
      setError("Please choose a .las file.");
      setFile(null);
      return;
    }
    setFile(f ?? null);
  }

  async function submit() {
    if (!file) {
      setError("Please choose a .las file first.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const created = await uploadPointCloud(file);
      setFile(null);
      if (inputRef.current) inputRef.current.value = "";
      onUploaded?.(created);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
        Upload
      </h2>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          pick(e.dataTransfer.files?.[0]);
        }}
        onClick={() => inputRef.current?.click()}
        className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-6 py-8 text-center transition
          ${dragging ? "border-indigo-400 bg-indigo-50" : "border-slate-300 hover:border-indigo-300 hover:bg-slate-50"}`}
      >
        <svg className="h-8 w-8 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V9m0 0-3 3m3-3 3 3M6.75 19.5a4.5 4.5 0 0 1-1.41-8.775 5.25 5.25 0 0 1 10.233-2.33 3 3 0 0 1 3.758 3.848A3.752 3.752 0 0 1 18 19.5H6.75Z" />
        </svg>
        {file ? (
          <p className="text-sm font-medium text-slate-700">{file.name}</p>
        ) : (
          <p className="text-sm text-slate-500">
            Drag & drop a <span className="font-medium">.las</span> file, or click to browse
          </p>
        )}
        <input
          ref={inputRef}
          type="file"
          accept=".las"
          className="hidden"
          onChange={(e) => pick(e.target.files?.[0])}
        />
      </div>

      <div className="mt-4 flex items-center justify-between gap-3">
        <p className="text-sm text-rose-600">{error}</p>
        <button
          onClick={submit}
          disabled={busy || !file}
          className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy && <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />}
          {busy ? "Uploading…" : "Upload"}
        </button>
      </div>
    </div>
  );
}
