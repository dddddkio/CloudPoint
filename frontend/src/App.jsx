import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import DeleteDialog from "./components/DeleteDialog.jsx";
import UploadDialog from "./components/UploadDialog.jsx";
import PointCloudList from "./components/PointCloudList.jsx";
import ToastRegion from "./components/ToastRegion.jsx";
import {
  ArrowLeftIcon,
  CloseIcon,
  CollapseIcon,
  DatabaseIcon,
  DownloadIcon,
  MenuIcon,
  OverviewIcon,
  PointCloudLogo,
  UserIcon,
} from "./components/Icons.jsx";
import {
  deletePointCloud,
  getDownloadUrl,
  getHealth,
  getSession,
  listPointClouds,
} from "./api.js";

const PointCloudViewer = lazy(() => import("./components/PointCloudViewer.jsx"));

const pages = {
  overview: { label: "Workspace", description: "Review activity and continue working with recent point clouds" },
  viewer: { label: "3D workspace", description: "Inspect point cloud geometry and rendering" },
  datasets: { label: "Point clouds", description: "Manage LAS files and open them in the 3D workspace" },
};

const navItems = [
  { key: "overview", Icon: OverviewIcon },
  { key: "datasets", Icon: DatabaseIcon },
];

function routeFromHash() {
  const [key, encodedId] = window.location.hash.replace(/^#\/?/, "").split("/");
  if (key === "viewer") return { page: "viewer", itemId: encodedId ? decodeURIComponent(encodedId) : null };
  if (key === "upload") return { page: "datasets", itemId: null, openUpload: true };
  return { page: pages[key] ? key : "overview", itemId: null };
}

function StatCard({ label, value, detail }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <p className="text-sm text-slate-600">{label}</p>
      <p className="mt-2 text-2xl font-medium tracking-tight text-slate-900">{value}</p>
      <p className="mt-1 text-xs text-slate-500">{detail}</p>
    </div>
  );
}

export default function App() {
  const [route, setRoute] = useState(routeFromHash);
  const [items, setItems] = useState([]);
  const [selected, setSelected] = useState(null);
  const [error, setError] = useState("");
  const [serviceOnline, setServiceOnline] = useState(null);
  const [identity, setIdentity] = useState(null);
  const [maxUploadMb, setMaxUploadMb] = useState(95);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => window.localStorage.getItem("cloudpoint.sidebar.collapsed") === "true",
  );
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [downloadBusy, setDownloadBusy] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [messages, setMessages] = useState([]);
  const messageTimers = useRef(new Map());

  const dismissMessage = useCallback((id) => {
    const timer = messageTimers.current.get(id);
    if (timer) clearTimeout(timer);
    setMessages((current) => current.map((message) => (
      message.id === id ? { ...message, leaving: true } : message
    )));
    const removalTimer = setTimeout(() => {
      setMessages((current) => current.filter((message) => message.id !== id));
      messageTimers.current.delete(id);
    }, 170);
    messageTimers.current.set(id, removalTimer);
  }, []);

  const notify = useCallback(({ type = "info", title, detail = "" }) => {
    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const duration = type === "error" ? 8000 : type === "success" ? 4000 : 5000;
    setMessages((current) => [...current.slice(-2), { id, type, title, detail, duration, leaving: false }]);
    const timer = setTimeout(() => dismissMessage(id), duration);
    messageTimers.current.set(id, timer);
  }, [dismissMessage]);

  function toggleSidebar() {
    const next = !sidebarCollapsed;
    setSidebarCollapsed(next);
    window.localStorage.setItem("cloudpoint.sidebar.collapsed", String(next));
  }

  const page = route.page;
  const openUpload = useCallback(() => setUploadOpen(true), []);
  const closeUpload = useCallback(() => setUploadOpen(false), []);

  function navigate(nextPage, itemId = null) {
    window.location.hash = itemId
      ? `#/${nextPage}/${encodeURIComponent(itemId)}`
      : `#/${nextPage}`;
  }

  async function refresh() {
    try {
      setItems(await listPointClouds());
      setError("");
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    const onHashChange = () => setRoute(routeFromHash());
    window.addEventListener("hashchange", onHashChange);
    if (!window.location.hash.startsWith("#/")) {
      window.history.replaceState(null, "", `#/overview`);
      setRoute({ page: "overview", itemId: null });
    }
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  useEffect(() => {
    if (!route.openUpload) return;
    setUploadOpen(true);
    window.history.replaceState(null, "", "#/datasets");
    setRoute({ page: "datasets", itemId: null });
  }, [route.openUpload]);

  useEffect(() => {
    if (page !== "viewer") return;
    if (!route.itemId) {
      navigate("datasets");
      return;
    }
    const routedItem = items.find((item) => String(item.id) === route.itemId);
    setSelected(routedItem || null);
  }, [items, page, route.itemId]);

  useEffect(() => () => {
    for (const timer of messageTimers.current.values()) clearTimeout(timer);
  }, []);

  useEffect(() => {
    refresh();
    getSession()
      .then((session) => {
        setIdentity(session);
        if (Number.isFinite(session.max_upload_mb)) {
          setMaxUploadMb(session.max_upload_mb);
        }
      })
      .catch(() => setIdentity(null));
    let active = true;
    async function checkService() {
      try {
        await getHealth();
        if (active) setServiceOnline(true);
      } catch {
        if (active) setServiceOnline(false);
      }
    }
    checkService();
    const timer = setInterval(checkService, 30000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

  function openDataset(item) {
    setSelected(item);
    navigate("viewer", item.id);
  }

  function handleUploaded(created) {
    setItems((previous) => [created, ...previous]);
    notify({ type: "success", title: "Point cloud added", detail: `${created.original_filename} is ready in the library.` });
    setSelected(created);
    closeUpload();
    navigate("datasets");
  }

  async function downloadSelected() {
    if (!selected || downloadBusy) return;
    setDownloadBusy(true);
    try {
      const url = await getDownloadUrl(selected.id, { download: true });
      const link = document.createElement("a");
      link.href = url;
      link.download = selected.original_filename;
      link.rel = "noopener";
      document.body.appendChild(link);
      link.click();
      link.remove();
      notify({ type: "success", title: "Download started", detail: selected.original_filename });
    } catch (err) {
      notify({ type: "error", title: "Download could not start", detail: err.message });
    } finally {
      setDownloadBusy(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget || deleteBusy) return;
    setDeleteBusy(true);
    try {
      await deletePointCloud(deleteTarget.id);
      setItems((current) => current.filter((item) => item.id !== deleteTarget.id));
      if (selected?.id === deleteTarget.id) setSelected(null);
      notify({
        type: "success",
        title: "Point cloud deleted",
        detail: `${deleteTarget.original_filename} was removed from storage.`,
      });
      setDeleteTarget(null);
    } catch (err) {
      notify({ type: "error", title: "Point cloud could not be deleted", detail: err.message });
    } finally {
      setDeleteBusy(false);
    }
  }

  const totalPoints = items.reduce((sum, item) => sum + (item.point_count || 0), 0);
  const totalBytes = items.reduce((sum, item) => sum + (item.size_bytes || 0), 0);
  const rgbCount = items.filter((item) => item.has_rgb).length;
  const storage = totalBytes < 1024 * 1024
    ? `${Math.round(totalBytes / 1024)} KB`
    : `${(totalBytes / (1024 * 1024)).toFixed(1)} MB`;

  return (
    <div className="min-h-full bg-[#f8f9fa] text-slate-800">
      <ToastRegion messages={messages} onDismiss={dismissMessage} />
      <UploadDialog
        open={uploadOpen}
        onClose={closeUpload}
        onUploaded={handleUploaded}
        maxUploadMb={maxUploadMb}
      />
      <DeleteDialog
        open={Boolean(deleteTarget)}
        pointCloud={deleteTarget}
        busy={deleteBusy}
        onClose={() => !deleteBusy && setDeleteTarget(null)}
        onConfirm={confirmDelete}
      />
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-[1480px] items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <button onClick={() => setMobileSidebarOpen(true)} className="grid h-9 w-9 place-items-center rounded-md text-slate-600 hover:bg-slate-100 md:hidden" aria-label="Open navigation">
              <MenuIcon className="h-5 w-5" />
            </button>
            <PointCloudLogo className="h-10 w-10 shrink-0" />
            <span className="truncate text-lg font-semibold tracking-tight text-slate-900">CloudPoint</span>
            <span className="hidden h-6 w-px bg-slate-200 sm:block" />
            <span className="hidden truncate text-sm text-slate-500 sm:block">{page === "viewer" ? "Point clouds" : pages[page].label}</span>
          </div>
          <div className="ml-4 flex shrink-0 items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm">
            <span className={`h-2 w-2 rounded-full ${serviceOnline === true ? "bg-emerald-500" : serviceOnline === false ? "bg-rose-500" : "bg-slate-300"}`} />
            <span className="hidden text-slate-600 sm:inline">
              {serviceOnline === true ? "Service available" : serviceOnline === false ? "Service unavailable" : "Checking service"}
            </span>
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-[1480px]">
        {mobileSidebarOpen && <button className="fixed inset-0 top-16 z-40 bg-slate-900/30 md:hidden" onClick={() => setMobileSidebarOpen(false)} aria-label="Close navigation overlay" />}
        <aside className={`${mobileSidebarOpen ? "fixed bottom-0 left-0 top-16 z-50 flex w-64" : "hidden"} overflow-hidden flex-col shrink-0 border-r border-slate-200 bg-white px-3 py-4 transition-[width] duration-200 md:sticky md:top-16 md:z-auto md:flex md:h-[calc(100vh-4rem)] ${sidebarCollapsed ? "md:w-[68px]" : "md:w-56"}`}>
          <div className={`relative mb-3 flex h-12 items-center border-b border-slate-200 pb-3 ${sidebarCollapsed ? "md:justify-center" : "justify-between px-2"}`}>
            <p className={`whitespace-nowrap text-xs font-medium text-slate-500 transition-opacity duration-100 ${sidebarCollapsed ? "md:pointer-events-none md:absolute md:w-0 md:overflow-hidden md:opacity-0 md:invisible" : "delay-150 opacity-100"}`}>Cloud workspace</p>
            <button
              type="button"
              onClick={toggleSidebar}
              className="relative z-10 hidden h-9 w-9 shrink-0 place-items-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-800 md:grid"
              aria-label={sidebarCollapsed ? "Expand navigation" : "Collapse navigation"}
              title={sidebarCollapsed ? "Expand navigation" : "Collapse navigation"}
            >
              <CollapseIcon collapsed={sidebarCollapsed} className="h-4 w-4" />
            </button>
            <button onClick={() => setMobileSidebarOpen(false)} className="grid h-7 w-7 place-items-center rounded-md text-slate-500 hover:bg-slate-100 md:hidden" aria-label="Close navigation">
              <CloseIcon className="h-4 w-4" />
            </button>
          </div>
          <nav className="space-y-1" aria-label="Workspace navigation">
            {navItems.map((item) => {
              const NavIcon = item.Icon;
              const active = item.key === "datasets"
                ? page === "datasets" || page === "viewer"
                : page === item.key;
              return (
              <a
                key={item.key}
                href={`#/${item.key}`}
                onClick={() => setMobileSidebarOpen(false)}
                aria-current={active ? "page" : undefined}
                title={sidebarCollapsed ? pages[item.key].label : undefined}
                className={`flex h-10 items-center gap-3 overflow-hidden rounded-md px-3 text-sm transition ${sidebarCollapsed ? "md:gap-0 md:justify-center md:px-0" : ""} ${
                  active ? "bg-blue-50 font-medium text-blue-800" : "text-slate-700 hover:bg-slate-100 hover:text-slate-950"
                }`}
              >
                <NavIcon className={`h-5 w-5 shrink-0 ${active ? "text-blue-700" : "text-slate-500"}`} />
                <span className={`whitespace-nowrap transition-opacity duration-100 ${sidebarCollapsed ? "md:w-0 md:opacity-0" : "delay-150 opacity-100"}`}>{pages[item.key].label}</span>
              </a>
              );
            })}
          </nav>
          <div className="mt-auto border-t border-slate-200 pt-4">
            <div className={`flex items-center gap-3 px-2 ${sidebarCollapsed ? "md:gap-0 md:justify-center md:px-0" : ""}`} title={sidebarCollapsed ? `${identity?.name || "Demo Reviewer"} · ${identity?.role || "Workspace editor"}` : undefined}>
              <div className="relative grid h-9 w-9 shrink-0 place-items-center rounded-full bg-slate-200 text-slate-600">
                <UserIcon className="h-5 w-5" />
                <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-white bg-emerald-500" />
              </div>
              <div className={`min-w-0 whitespace-nowrap transition-opacity duration-100 ${sidebarCollapsed ? "md:w-0 md:opacity-0" : "delay-150 opacity-100"}`}>
                <p className="truncate text-sm font-medium text-slate-800">{identity?.name || "Demo Reviewer"}</p>
                <p className="truncate text-xs text-slate-500">{identity?.role || "Authenticated reviewer"}</p>
              </div>
            </div>
            <div className={`mt-3 whitespace-nowrap rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-500 transition-opacity duration-100 ${sidebarCollapsed ? "md:mt-0 md:h-0 md:w-0 md:overflow-hidden md:px-0 md:py-0 md:opacity-0" : "delay-150 opacity-100"}`}>
              {identity?.auth_type === "development" ? "Local development session" : "Verified by Cloudflare Access"}
            </div>
          </div>
        </aside>

        <main className="min-w-0 flex-1 px-4 py-6 lg:px-8 lg:py-8">
          {page !== "viewer" && <div className="mb-6">
            <p className="mb-1 text-sm text-slate-500">CloudPoint / {pages[page].label}</p>
            <h1 className="text-2xl font-medium tracking-tight text-slate-900">{pages[page].label}</h1>
            <p className="mt-2 text-sm text-slate-600">{pages[page].description}</p>
          </div>}

          {error && (
            <div className="mb-5 flex items-start justify-between gap-4 rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
              <span>{error}</span>
              <button onClick={refresh} className="font-medium underline underline-offset-2">Retry</button>
            </div>
          )}

          {page === "overview" && (
            <div>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <StatCard label="Point clouds" value={items.length.toLocaleString()} detail="Uploaded LAS files" />
                <StatCard label="Total points" value={totalPoints.toLocaleString()} detail="Available for rendering" />
                <StatCard label="Storage used" value={storage} detail="Raw object storage" />
                <StatCard label="RGB datasets" value={`${rgbCount} of ${items.length}`} detail="Color data available" />
              </div>

              <div className="mt-6 grid gap-6 lg:grid-cols-2">
                <section className="rounded-lg border border-slate-200 bg-white">
                  <div className="border-b border-slate-200 px-5 py-4">
                    <h2 className="text-base font-medium text-slate-900">Recent point clouds</h2>
                  </div>
                  {items.length === 0 ? (
                    <p className="px-5 py-8 text-sm text-slate-500">No point clouds uploaded yet.</p>
                  ) : (
                    <div className="divide-y divide-slate-200">
                      {items.slice(0, 5).map((item) => (
                        <button key={item.id} onClick={() => openDataset(item)} className="flex w-full items-center justify-between gap-3 px-5 py-3 text-left hover:bg-slate-50">
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-medium text-slate-800">{item.original_filename}</span>
                            <span className="mt-0.5 block text-xs text-slate-500">{item.point_count?.toLocaleString()} points · {item.has_rgb ? "RGB" : "Elevation"}</span>
                          </span>
                          <span className="text-sm font-medium text-blue-700">View in 3D</span>
                        </button>
                      ))}
                    </div>
                  )}
                </section>

                <section className="rounded-lg border border-slate-200 bg-white p-5">
                  <h2 className="text-base font-medium text-slate-900">Quick actions</h2>
                  <div className="mt-4 space-y-3">
                    <button onClick={openUpload} className="flex w-full items-center justify-between rounded-md border border-slate-200 px-4 py-3 text-left hover:bg-slate-50">
                      <span><span className="block text-sm font-medium text-slate-800">Upload a point cloud</span><span className="mt-0.5 block text-xs text-slate-500">Validate and store a LAS file</span></span><span className="text-blue-700">→</span>
                    </button>
                    <button onClick={() => navigate("datasets")} className="flex w-full items-center justify-between rounded-md border border-slate-200 px-4 py-3 text-left hover:bg-slate-50">
                      <span><span className="block text-sm font-medium text-slate-800">Browse point clouds</span><span className="mt-0.5 block text-xs text-slate-500">Search files and open the 3D workspace</span></span><span className="text-blue-700">→</span>
                    </button>
                  </div>
                </section>
              </div>
            </div>
          )}

          {page === "viewer" && (
            <div className="mx-auto max-w-[1280px] space-y-5 pb-8">
              <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
                <div className="flex flex-col justify-between gap-5 px-5 py-5 sm:flex-row sm:items-center lg:px-6">
                  <div className="flex min-w-0 items-center gap-3">
                    <button onClick={() => navigate("datasets")} className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-slate-300 text-slate-600 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-800" aria-label="Back to point clouds">
                      <ArrowLeftIcon className="h-4 w-4" />
                    </button>
                    <div className="min-w-0">
                      <p className="text-sm text-slate-500">Point clouds <span className="mx-1 text-slate-300">/</span> 3D workspace</p>
                      <h1 className="mt-1 truncate text-2xl font-semibold tracking-tight text-slate-900">{selected?.original_filename || "Point cloud not found"}</h1>
                    </div>
                  </div>
                  <div className="flex items-center">
                    <button
                      onClick={downloadSelected}
                      disabled={!selected || downloadBusy}
                      className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 shadow-sm hover:border-blue-300 hover:bg-blue-50 hover:text-blue-800 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {downloadBusy ? (
                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-slate-700" />
                      ) : (
                        <DownloadIcon className="h-4 w-4" />
                      )}
                      Download LAS
                    </button>
                  </div>
                </div>
                {selected && (
                  <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-b-xl border-t border-slate-200 bg-slate-200 text-sm sm:grid-cols-4">
                    <div className="bg-slate-50 px-5 py-4 lg:px-6"><dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Points</dt><dd className="mt-1.5 font-semibold tabular-nums text-slate-800">{selected.point_count?.toLocaleString() || "—"}</dd></div>
                    <div className="bg-slate-50 px-5 py-4 lg:px-6"><dt className="text-xs font-medium uppercase tracking-wide text-slate-500">LAS version</dt><dd className="mt-1.5 font-semibold text-slate-800">{selected.las_version || "—"}</dd></div>
                    <div className="bg-slate-50 px-5 py-4 lg:px-6"><dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Color source</dt><dd className="mt-1.5 font-semibold text-slate-800">{selected.has_rgb ? "RGB available" : "Elevation"}</dd></div>
                    <div className="bg-slate-50 px-5 py-4 lg:px-6"><dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Status</dt><dd className="mt-1.5 inline-flex items-center gap-2 font-semibold text-slate-800"><span className="h-2 w-2 rounded-full bg-emerald-500" />Ready</dd></div>
                  </dl>
                )}
              </section>
              <Suspense fallback={(
                <div className="grid min-h-[620px] place-items-center rounded-xl border border-slate-800 bg-[#07121c]">
                  <div className="text-center">
                    <span className="mx-auto block h-6 w-6 animate-spin rounded-full border-2 border-slate-700 border-t-blue-400" />
                    <p className="mt-3 text-sm text-slate-400">Preparing 3D workspace…</p>
                  </div>
                </div>
              )}>
                <PointCloudViewer pointCloud={selected} />
              </Suspense>
            </div>
          )}

          {page === "datasets" && (
            <PointCloudList
              items={items}
              onSelect={openDataset}
              onUpload={openUpload}
              onDelete={setDeleteTarget}
            />
          )}
        </main>
      </div>
    </div>
  );
}
