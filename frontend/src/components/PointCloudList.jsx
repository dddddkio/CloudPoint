function fmtSize(bytes) {
  const mb = bytes / (1024 * 1024);
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${(bytes / 1024).toFixed(0)} KB`;
}

function fmtDate(iso) {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function PointCloudList({ items, selectedId, onSelect }) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Point clouds
        </h2>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
          {items.length}
        </span>
      </div>

      {items.length === 0 ? (
        <p className="px-5 py-10 text-center text-sm text-slate-400">
          No point clouds uploaded yet.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-slate-400">
                <th className="px-5 py-2 font-medium">File</th>
                <th className="px-3 py-2 font-medium">Version</th>
                <th className="px-3 py-2 font-medium">Points</th>
                <th className="px-3 py-2 font-medium">RGB</th>
                <th className="px-3 py-2 font-medium">Size</th>
                <th className="px-3 py-2 font-medium">Uploaded</th>
                <th className="px-5 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((pc) => (
                <tr
                  key={pc.id}
                  className={`transition ${pc.id === selectedId ? "bg-indigo-50" : "hover:bg-slate-50"}`}
                >
                  <td className="max-w-[220px] truncate px-5 py-3 font-medium text-slate-700" title={pc.original_filename}>
                    {pc.original_filename}
                  </td>
                  <td className="px-3 py-3 text-slate-600">{pc.las_version ?? "—"}</td>
                  <td className="px-3 py-3 tabular-nums text-slate-600">{pc.point_count?.toLocaleString() ?? "—"}</td>
                  <td className="px-3 py-3 text-slate-600">{pc.has_rgb ? "✓" : "—"}</td>
                  <td className="px-3 py-3 tabular-nums text-slate-600">{fmtSize(pc.size_bytes)}</td>
                  <td className="px-3 py-3 whitespace-nowrap text-slate-500">{fmtDate(pc.created_at)}</td>
                  <td className="px-5 py-3 text-right">
                    <button
                      onClick={() => onSelect(pc)}
                      className="rounded-md border border-slate-200 px-3 py-1 text-xs font-medium text-slate-700 transition hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700"
                    >
                      View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
