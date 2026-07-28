import { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { getDownloadUrl, getRenderSampleUrl } from "../api.js";
import { loadLasInWorker } from "../lib/loadLasInWorker.js";
import { renderPointBudget } from "../lib/renderBudget.js";
import { FullscreenIcon, ResetIcon, TopViewIcon, ViewerIcon } from "./Icons.jsx";

function elevationColors(positions) {
  const colors = new Float32Array(positions.length);
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (let index = 2; index < positions.length; index += 3) {
    minZ = Math.min(minZ, positions[index]);
    maxZ = Math.max(maxZ, positions[index]);
  }
  const span = maxZ - minZ || 1;
  const color = new THREE.Color();
  for (let index = 0; index < positions.length; index += 3) {
    const height = (positions[index + 2] - minZ) / span;
    color.setHSL(0.58 - 0.5 * height, 0.82, 0.54);
    colors[index] = color.r;
    colors[index + 1] = color.g;
    colors[index + 2] = color.b;
  }
  return colors;
}

function IconButton({ label, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className="grid h-8 w-8 place-items-center rounded-md border border-white/10 text-slate-300 hover:bg-white/10 hover:text-white"
    >
      {children}
    </button>
  );
}

export default function PointCloudViewer({ pointCloud }) {
  const mountRef = useRef(null);
  const panelRef = useRef(null);
  const materialRef = useRef(null);
  const geometryRef = useRef(null);
  const cloudRef = useRef(null);
  const cameraRef = useRef(null);
  const controlsRef = useRef(null);
  const frameDistanceRef = useRef(10);
  const basePointSizeRef = useRef(0.02);
  const fitViewRef = useRef(null);
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");
  const [stats, setStats] = useState(null);
  const [colorMode, setColorMode] = useState("rgb");
  const [pointSize, setPointSize] = useState(100);
  const [loadProgress, setLoadProgress] = useState({
    phase: "connecting",
    percent: null,
  });

  const setCameraView = useCallback((mode = "perspective") => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls) return;

    const distance = frameDistanceRef.current;
    if (mode === "top") {
      camera.up.set(0, 1, 0);
      camera.position.set(0, 0, distance);
    } else {
      camera.up.set(0, 0, 1);
      const direction = new THREE.Vector3(1, -1, 0.72).normalize();
      camera.position.copy(direction.multiplyScalar(distance));
    }
    controls.target.set(0, 0, 0);
    camera.lookAt(controls.target);
    controls.update();
  }, []);

  useEffect(() => {
    if (!pointCloud) {
      setStatus("idle");
      setStats(null);
      return undefined;
    }

    let disposed = false;
    const mount = mountRef.current;
    setStatus("loading");
    setError("");
    setStats(null);
    setLoadProgress({ phase: "connecting", percent: null });

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x07111a);
    const camera = new THREE.PerspectiveCamera(52, 1, 0.01, 1e7);
    camera.up.set(0, 0, 1);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    mount.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controlsRef.current = controls;
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.screenSpacePanning = true;
    controls.mouseButtons = {
      LEFT: THREE.MOUSE.ROTATE,
      MIDDLE: THREE.MOUSE.DOLLY,
      RIGHT: THREE.MOUSE.PAN,
    };

    let points = null;
    let grid = null;
    let animationFrame = 0;
    let loadTask = null;

    function resize() {
      const width = Math.max(mount.clientWidth, 1);
      const height = Math.max(mount.clientHeight, 1);
      // Keep the canvas CSS size equal to its container. With a device pixel
      // ratio above 1, disabling the style update makes the canvas appear
      // physically larger than the viewport and clips its center to the
      // bottom-right corner.
      renderer.setSize(width, height);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    }

    function fitView(radius) {
      resize();
      const verticalFov = THREE.MathUtils.degToRad(camera.fov);
      const limitingFov = camera.aspect < 1
        ? 2 * Math.atan(Math.tan(verticalFov / 2) * camera.aspect)
        : verticalFov;
      const distance = (radius / Math.sin(limitingFov / 2)) * 1.18;
      frameDistanceRef.current = Math.max(distance, 1);
      camera.near = Math.max(distance / 1000, 0.001);
      camera.far = distance * 100;
      camera.updateProjectionMatrix();
      controls.minDistance = Math.max(radius * 0.05, 0.01);
      controls.maxDistance = distance * 20;
      setCameraView("perspective");
    }
    fitViewRef.current = fitView;

    const observer = new ResizeObserver(resize);
    observer.observe(mount);

    function animate() {
      animationFrame = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    }

    (async () => {
      try {
        const pointBudget = renderPointBudget(pointCloud);
        const url = pointBudget
          ? getRenderSampleUrl(pointCloud.id, pointBudget)
          : await getDownloadUrl(pointCloud.id);
        if (disposed) return;
        loadTask = loadLasInWorker(url, {
          maxPoints: 2_000_000,
          onProgress: (progress) => {
            if (!disposed) setLoadProgress(progress);
          },
        });
        const cloud = await loadTask.promise;
        if (disposed) return;

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute("position", new THREE.BufferAttribute(cloud.positions, 3));
        geometry.computeBoundingBox();

        // LAS headers are not always a tight fit for the actual points. Recenter
        // using the geometry itself so the orbit target and visible cloud agree.
        const actualCenter = new THREE.Vector3();
        geometry.boundingBox.getCenter(actualCenter);
        geometry.translate(-actualCenter.x, -actualCenter.y, -actualCenter.z);
        geometry.computeBoundingBox();
        geometry.computeBoundingSphere();

        const actualSize = new THREE.Vector3();
        geometry.boundingBox.getSize(actualSize);
        const elevation = elevationColors(geometry.attributes.position.array);
        cloudRef.current = { ...cloud, elevation };
        geometry.setAttribute("color", new THREE.BufferAttribute(cloud.colors ?? elevation, 3));
        geometryRef.current = geometry;

        const maxDimension = Math.max(actualSize.x, actualSize.y, actualSize.z, 1);
        basePointSizeRef.current = Math.max(maxDimension / 650, 0.012);
        const material = new THREE.PointsMaterial({
          size: basePointSizeRef.current,
          sizeAttenuation: true,
          vertexColors: true,
          transparent: true,
          opacity: 0.98,
        });
        materialRef.current = material;
        points = new THREE.Points(geometry, material);
        scene.add(points);

        const gridSize = Math.max(actualSize.x, actualSize.y, 1) * 1.5;
        grid = new THREE.GridHelper(gridSize, 20, 0x24536a, 0x153443);
        grid.rotation.x = Math.PI / 2;
        grid.position.z = geometry.boundingBox.min.z;
        grid.material.transparent = true;
        grid.material.opacity = 0.32;
        scene.add(grid);

        fitView(Math.max(geometry.boundingSphere.radius, 0.5));
        animate();
        if (disposed) return;

        setColorMode(cloud.colors ? "rgb" : "elevation");
        setStats({
          loaded: cloud.loadedPoints,
          total: cloud.sourceTotalPoints || cloud.totalPoints,
          available: cloud.serverSampled
            ? (cloud.sourceTotalPoints || cloud.totalPoints)
            : cloud.availablePoints,
          subsampled: cloud.subsampled || cloud.serverSampled,
          serverSampled: cloud.serverSampled,
          truncated: cloud.truncated,
          rgb: Boolean(cloud.colors),
          size: [actualSize.x, actualSize.y, actualSize.z],
        });
        setStatus("ready");
      } catch (err) {
        if (!disposed && err.name !== "AbortError") {
          setError(err.message);
          setStatus("error");
        }
      }
    })();

    return () => {
      disposed = true;
      loadTask?.cancel();
      cancelAnimationFrame(animationFrame);
      observer.disconnect();
      controls.dispose();
      if (points) {
        points.geometry.dispose();
        points.material.dispose();
      }
      if (grid) {
        grid.geometry.dispose();
        grid.material.dispose();
      }
      geometryRef.current = null;
      materialRef.current = null;
      cloudRef.current = null;
      cameraRef.current = null;
      controlsRef.current = null;
      fitViewRef.current = null;
      renderer.dispose();
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
    };
  }, [pointCloud, setCameraView]);

  useEffect(() => {
    if (!geometryRef.current || !cloudRef.current) return;
    const colors = colorMode === "rgb" && cloudRef.current.colors
      ? cloudRef.current.colors
      : cloudRef.current.elevation;
    geometryRef.current.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geometryRef.current.attributes.color.needsUpdate = true;
  }, [colorMode]);

  useEffect(() => {
    if (materialRef.current) {
      materialRef.current.size = basePointSizeRef.current * (pointSize / 100);
    }
  }, [pointSize]);

  return (
    <section ref={panelRef} className="overflow-hidden rounded-xl border border-slate-800 bg-[#07121c] shadow-[0_12px_32px_rgba(15,23,42,0.12)]">
      <header className="flex min-h-16 items-center justify-between gap-3 border-b border-white/10 bg-[#0b1822] px-5 py-3">
        <div className="min-w-0">
          <h2 className="text-base font-medium text-white">3D viewer</h2>
          <p className="mt-0.5 max-w-[420px] truncate text-xs text-slate-400" title={pointCloud?.original_filename}>
            {pointCloud?.original_filename || "Select a dataset to begin"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <IconButton label="Reset view" onClick={() => setCameraView("perspective")}>
            <ResetIcon className="h-4 w-4" />
          </IconButton>
          <IconButton label="Top view" onClick={() => setCameraView("top")}>
            <TopViewIcon className="h-4 w-4" />
          </IconButton>
          <IconButton label="Fullscreen" onClick={() => panelRef.current?.requestFullscreen?.()}>
            <FullscreenIcon className="h-4 w-4" />
          </IconButton>
        </div>
      </header>

      <div className="grid lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="relative h-[clamp(500px,62vh,680px)] min-w-0 overflow-hidden viewer-shell">
          <div ref={mountRef} className="h-full w-full" />

          <div className="pointer-events-none absolute left-5 top-5 flex items-center gap-2 rounded-md border border-white/10 bg-[#06111a]/85 px-2.5 py-1.5 shadow-sm backdrop-blur">
            <span className={`h-1.5 w-1.5 rounded-full ${status === "ready" ? "bg-emerald-400" : "bg-slate-500"}`} />
            <span className="text-xs capitalize text-slate-300">{status === "ready" ? "Ready" : status}</span>
          </div>

          {!pointCloud && (
            <div className="absolute inset-0 grid place-items-center text-center">
              <div>
                <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-white/5 text-slate-500">
                  <ViewerIcon className="h-7 w-7" />
                </div>
                <p className="mt-4 text-sm font-medium text-slate-300">No dataset selected</p>
                <p className="mt-1 text-xs text-slate-500">Choose a dataset above or from the datasets page.</p>
              </div>
            </div>
          )}

          {status === "loading" && (
            <div className="absolute inset-0 grid place-items-center bg-[#061019]/80">
              <div className="w-64 text-center">
                <span className="mx-auto block h-6 w-6 animate-spin rounded-full border-2 border-slate-700 border-t-blue-400" />
                <p className="mt-3 text-sm text-slate-300">
                  {loadProgress.phase === "downloading"
                    ? "Downloading point cloud…"
                    : loadProgress.phase === "retrying"
                      ? "Reconnecting to storage…"
                    : loadProgress.phase === "processing"
                      ? "Sampling point records…"
                      : loadProgress.phase === "preparing"
                        ? "Preparing 3D scene…"
                        : "Connecting to storage…"}
                </p>
                {loadProgress.phase === "downloading" && loadProgress.percent !== null && (
                  <>
                    <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
                      <div
                        className="h-full rounded-full bg-blue-500 transition-[width] duration-200"
                        style={{ width: `${loadProgress.percent}%` }}
                      />
                    </div>
                    <p className="mt-2 text-xs tabular-nums text-slate-500">
                      {loadProgress.percent}%
                    </p>
                  </>
                )}
              </div>
            </div>
          )}

          {status === "error" && (
            <div className="absolute inset-0 grid place-items-center p-6 text-center text-sm text-rose-300">
              <p>Could not load the point cloud: {error}</p>
            </div>
          )}

          {status === "ready" && stats && (
            <div className="pointer-events-none absolute bottom-5 left-5 flex flex-wrap gap-2 text-xs text-slate-400">
              <span className="rounded bg-black/45 px-2 py-1.5">Drag to rotate</span>
              <span className="rounded bg-black/45 px-2 py-1.5">Scroll to zoom</span>
              <span className="rounded bg-black/45 px-2 py-1.5">Right drag to pan</span>
            </div>
          )}
        </div>

        <aside className="border-t border-white/10 bg-[#0b1822] p-5 text-slate-300 lg:border-l lg:border-t-0">
          <h3 className="text-base font-medium text-white">Display settings</h3>
          {status === "ready" && stats ? (
            <div className="mt-5 space-y-6">
              <div>
                <div className="mb-2 flex justify-between text-xs text-slate-400">
                  <span>Color</span>
                  <span>{colorMode === "rgb" ? "RGB" : "Elevation"}</span>
                </div>
                <div className="grid grid-cols-2 gap-1 rounded-md bg-white/5 p-1">
                  <button disabled={!stats.rgb} onClick={() => setColorMode("rgb")} className={`rounded px-2 py-2 text-xs ${colorMode === "rgb" ? "bg-blue-600 text-white" : "text-slate-400 hover:text-white disabled:opacity-30"}`}>RGB</button>
                  <button onClick={() => setColorMode("elevation")} className={`rounded px-2 py-2 text-xs ${colorMode === "elevation" ? "bg-blue-600 text-white" : "text-slate-400 hover:text-white"}`}>Elevation</button>
                </div>
              </div>

              <div>
                <div className="mb-2 flex justify-between text-xs text-slate-400"><span>Point size</span><span>{pointSize}%</span></div>
                <input aria-label="Point size" type="range" min="40" max="180" value={pointSize} onChange={(event) => setPointSize(Number(event.target.value))} className="viewer-range w-full" />
              </div>

              <dl className="space-y-3 border-t border-white/10 pt-4 text-xs">
                <div className="flex justify-between"><dt className="text-slate-500">Rendered points</dt><dd className="text-white">{stats.loaded.toLocaleString()}</dd></div>
                <div className="flex justify-between"><dt className="text-slate-500">Width</dt><dd className="text-white">{stats.size[0].toFixed(2)}</dd></div>
                <div className="flex justify-between"><dt className="text-slate-500">Depth</dt><dd className="text-white">{stats.size[1].toFixed(2)}</dd></div>
                <div className="flex justify-between"><dt className="text-slate-500">Height</dt><dd className="text-white">{stats.size[2].toFixed(2)}</dd></div>
              </dl>

              {stats.truncated && (
                <p className="rounded-md bg-amber-400/10 p-3 text-xs leading-5 text-amber-200">
                  The LAS header declares {stats.total.toLocaleString()} points, but the file contains
                  {" "}{stats.available.toLocaleString()} complete records. Available data was loaded safely.
                </p>
              )}

              {stats.subsampled && (
                <p className="rounded-md bg-amber-400/10 p-3 text-xs leading-5 text-amber-200">
                  Showing {stats.loaded.toLocaleString()} of {stats.available.toLocaleString()} points
                  {stats.serverSampled ? " using a distributed server-side sample." : " for browser performance."}
                </p>
              )}
            </div>
          ) : (
            <p className="mt-3 text-xs leading-5 text-slate-500">Display controls become available after a dataset is loaded.</p>
          )}
        </aside>
      </div>
    </section>
  );
}
