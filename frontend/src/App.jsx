import { useEffect, useState } from "react";
import UploadForm from "./components/UploadForm.jsx";
import PointCloudList from "./components/PointCloudList.jsx";
import PointCloudViewer from "./components/PointCloudViewer.jsx";
import { listPointClouds } from "./api.js";

export default function App() {
  const [items, setItems] = useState([]);
  const [selected, setSelected] = useState(null);
  const [error, setError] = useState("");

  async function refresh() {
    try {
      setItems(await listPointClouds());
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  function handleUploaded(created) {
    setItems((prev) => [created, ...prev]);
    setSelected(created);
  }

  return (
    <div className="min-h-full">
      {/* header */}
      <header className="border-b border-slate-200 bg-white/70 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-6 py-4">
          <div className="grid h-9 w-9 place-items-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-sm">
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 3 3 7.5 12 12l9-4.5L12 3ZM3 16.5 12 21l9-4.5M3 12l9 4.5L21 12" />
            </svg>
          </div>
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-slate-900">CloudPoint</h1>
            <p className="text-xs text-slate-500">Upload, manage & view LAS point clouds in the browser</p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-6 px-6 py-8">
        {error && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-1">
            <UploadForm onUploaded={handleUploaded} />
          </div>

          <section className="animate-fade-in lg:col-span-2">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Viewer</h2>
              {selected && (
                <span className="truncate text-sm font-medium text-slate-600" title={selected.original_filename}>
                  {selected.original_filename}
                </span>
              )}
            </div>
            <PointCloudViewer pointCloud={selected} />
          </section>
        </div>

        <PointCloudList items={items} selectedId={selected?.id} onSelect={setSelected} />
      </main>
    </div>
  );
}
