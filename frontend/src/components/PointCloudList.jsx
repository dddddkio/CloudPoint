import { useMemo, useState } from "react";
import { SearchIcon, UploadIcon, ViewerIcon } from "./Icons.jsx";

function fmtSize(bytes) {
  const mb = bytes / (1024 * 1024);
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${(bytes / 1024).toFixed(0)} KB`;
}

function fmtDate(iso) {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function PointCloudList({ items, onSelect, onUpload }) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(
    () => items.filter((item) => item.original_filename.toLowerCase().includes(query.toLowerCase())),
    [items, query],
  );

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
      <div className="flex flex-col justify-between gap-3 border-b border-slate-200 px-5 py-4 sm:flex-row sm:items-center">
        <div>
          <h2 className="text-base font-medium text-slate-900">Point cloud library</h2>
          <p className="mt-1 text-sm text-slate-500">{items.length} file{items.length === 1 ? "" : "s"} ready for inspection</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <label className="relative block w-full sm:w-64">
            <SearchIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search point clouds"
              aria-label="Search point clouds"
              className="h-9 w-full rounded-md border border-slate-300 bg-white pl-9 pr-3 text-sm text-slate-700 outline-none placeholder:text-slate-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
          </label>
          <button onClick={onUpload} className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-blue-700 px-3 text-sm font-medium text-white hover:bg-blue-800">
            <UploadIcon className="h-4 w-4" />
            Upload
          </button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="px-5 py-12 text-center">
          <p className="text-sm text-slate-600">{items.length ? "No point clouds match this search." : "No point clouds have been uploaded."}</p>
          <p className="mt-1 text-xs text-slate-500">{items.length ? "Try another file name." : "Upload a LAS file to start your library."}</p>
          {!items.length && (
            <button onClick={onUpload} className="mt-4 inline-flex items-center gap-2 rounded-md bg-blue-700 px-3 py-2 text-sm font-medium text-white hover:bg-blue-800">
              <UploadIcon className="h-4 w-4" />
              Upload LAS file
            </button>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-600">
              <tr>
                <th className="px-5 py-3 font-medium">Name</th>
                <th className="px-3 py-3 font-medium">Status</th>
                <th className="px-3 py-3 font-medium">LAS version</th>
                <th className="px-3 py-3 font-medium">Points</th>
                <th className="px-3 py-3 font-medium">Color</th>
                <th className="px-3 py-3 font-medium">Size</th>
                <th className="px-3 py-3 font-medium">Uploaded</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filtered.map((cloud) => {
                return (
                  <tr key={cloud.id} className="hover:bg-slate-50">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-blue-50 text-blue-600">
                          <ViewerIcon className="h-4 w-4" />
                        </span>
                        <span className="max-w-[220px] truncate font-medium text-slate-800" title={cloud.original_filename}>{cloud.original_filename}</span>
                      </div>
                    </td>
                    <td className="px-3 py-3"><span className="inline-flex items-center gap-1.5 text-sm text-slate-700"><span className="h-2 w-2 rounded-full bg-emerald-500" />Ready</span></td>
                    <td className="px-3 py-3 text-slate-600">{cloud.las_version ?? "—"}</td>
                    <td className="px-3 py-3 tabular-nums text-slate-600">{cloud.point_count?.toLocaleString() ?? "—"}</td>
                    <td className="px-3 py-3 text-slate-600">{cloud.has_rgb ? "RGB" : "Elevation"}</td>
                    <td className="px-3 py-3 tabular-nums text-slate-600">{fmtSize(cloud.size_bytes)}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-slate-600">{fmtDate(cloud.created_at)}</td>
                    <td className="px-5 py-3 text-right">
                      <button
                        onClick={() => onSelect(cloud)}
                        className="inline-flex items-center gap-2 whitespace-nowrap rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm hover:border-blue-300 hover:bg-blue-50 hover:text-blue-800"
                      >
                        <ViewerIcon className="h-4 w-4" />
                        View in 3D
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <div className="border-t border-slate-200 bg-white px-5 py-3 text-xs text-slate-500">
        Showing {filtered.length} of {items.length}
      </div>
    </div>
  );
}
