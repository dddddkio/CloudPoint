import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { getDownloadUrl } from "../api.js";
import { parseLas } from "../lib/lasLoader.js";

// Height-ramp fallback colour when a cloud has no RGB.
function elevationColors(positions) {
  const colors = new Float32Array(positions.length);
  let minZ = Infinity, maxZ = -Infinity;
  for (let i = 2; i < positions.length; i += 3) {
    const z = positions[i];
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
  }
  const span = maxZ - minZ || 1;
  const c = new THREE.Color();
  for (let i = 0; i < positions.length; i += 3) {
    const t = (positions[i + 2] - minZ) / span;
    c.setHSL(0.66 - 0.66 * t, 0.75, 0.5); // blue(low) -> red(high)
    colors[i] = c.r;
    colors[i + 1] = c.g;
    colors[i + 2] = c.b;
  }
  return colors;
}

export default function PointCloudViewer({ pointCloud }) {
  const mountRef = useRef(null);
  const [status, setStatus] = useState("idle"); // idle | loading | ready | error
  const [error, setError] = useState("");
  const [stats, setStats] = useState(null);

  useEffect(() => {
    if (!pointCloud) {
      setStatus("idle");
      return;
    }

    let disposed = false;
    const mount = mountRef.current;
    setStatus("loading");
    setError("");
    setStats(null);

    // --- scene / camera / renderer ---
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0b0b17);
    const camera = new THREE.PerspectiveCamera(60, 1, 0.01, 1e7);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    mount.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    // rotate = left drag, zoom = wheel, pan = right drag / two-finger
    controls.mouseButtons = {
      LEFT: THREE.MOUSE.ROTATE,
      MIDDLE: THREE.MOUSE.DOLLY,
      RIGHT: THREE.MOUSE.PAN,
    };

    let points = null;
    let raf = 0;

    function resize() {
      if (!mount) return;
      const w = mount.clientWidth || 1;
      const h = mount.clientHeight || 1;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
    const ro = new ResizeObserver(resize);
    ro.observe(mount);

    function animate() {
      raf = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    }

    (async () => {
      try {
        const url = await getDownloadUrl(pointCloud.id);
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Download failed: ${res.status}`);
        const buf = await res.arrayBuffer();
        if (disposed) return;

        const cloud = parseLas(buf);
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute("position", new THREE.BufferAttribute(cloud.positions, 3));
        const colors = cloud.colors ?? elevationColors(cloud.positions);
        geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));

        const maxDim = Math.max(...cloud.size);
        const material = new THREE.PointsMaterial({
          size: Math.max(maxDim / 600, 0.02),
          sizeAttenuation: true,
          vertexColors: true,
        });
        points = new THREE.Points(geometry, material);
        scene.add(points);

        // frame the cloud
        geometry.computeBoundingSphere();
        const { radius } = geometry.boundingSphere;
        const dist = radius / Math.sin((camera.fov * Math.PI) / 360);
        camera.position.set(dist * 0.7, dist * 0.5, dist * 0.9);
        camera.lookAt(0, 0, 0);
        controls.target.set(0, 0, 0);
        controls.update();

        resize();
        animate();
        if (disposed) return;
        setStats({
          loaded: cloud.loadedPoints,
          total: cloud.totalPoints,
          subsampled: cloud.subsampled,
          rgb: !!cloud.colors,
        });
        setStatus("ready");
      } catch (err) {
        if (!disposed) {
          setError(err.message);
          setStatus("error");
        }
      }
    })();

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      controls.dispose();
      if (points) {
        points.geometry.dispose();
        points.material.dispose();
      }
      renderer.dispose();
      if (renderer.domElement.parentNode === mount) {
        mount.removeChild(renderer.domElement);
      }
    };
  }, [pointCloud]);

  return (
    <div className="relative h-[520px] w-full overflow-hidden rounded-xl bg-ink ring-1 ring-slate-900/10">
      <div ref={mountRef} className="h-full w-full" />

      {!pointCloud && (
        <div className="absolute inset-0 grid place-items-center text-center text-slate-400">
          <p>Select a point cloud to view.</p>
        </div>
      )}

      {status === "loading" && (
        <div className="absolute inset-0 grid place-items-center bg-ink/60 backdrop-blur-sm">
          <div className="flex items-center gap-3 text-slate-200">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-500 border-t-indigo-400" />
            Loading point cloud…
          </div>
        </div>
      )}

      {status === "error" && (
        <div className="absolute inset-0 grid place-items-center p-6 text-center text-rose-300">
          <p>Failed to load: {error}</p>
        </div>
      )}

      {status === "ready" && stats && (
        <div className="pointer-events-none absolute bottom-3 left-3 flex flex-wrap gap-2 text-xs">
          <span className="rounded-md bg-black/50 px-2 py-1 text-slate-200 backdrop-blur">
            {stats.loaded.toLocaleString()} pts rendered
            {stats.subsampled && ` (of ${stats.total.toLocaleString()})`}
          </span>
          <span className="rounded-md bg-black/50 px-2 py-1 text-slate-200 backdrop-blur">
            {stats.rgb ? "RGB" : "elevation colour"}
          </span>
          <span className="rounded-md bg-black/50 px-2 py-1 text-slate-200 backdrop-blur">
            drag rotate · wheel zoom · right-drag pan
          </span>
        </div>
      )}
    </div>
  );
}
