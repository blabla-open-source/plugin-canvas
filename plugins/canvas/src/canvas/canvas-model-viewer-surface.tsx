import { useEffect, useRef, useState } from "react";

type ThreeModule = typeof import("three");
type Object3D = import("three").Object3D;
type PerspectiveCamera = import("three").PerspectiveCamera;

type ModelFileFormat = "glb" | "gltf" | "obj" | "stl";

interface CanvasModelViewerSurfaceProps {
  className?: string;
  errorLabel?: string;
  loadingLabel?: string;
  name: string;
  sourceUrl: string;
  testId?: string;
  visible: boolean;
}

const OBJ_MATERIAL_LIBRARY_RE = /^\s*mtllib\s+(.+?)\s*$/im;
const MODEL_EXTERNAL_URL_RE = /^(?:data|blob|https?):/i;
const MODEL_URL_CLEAN_PATH_RE = /[?#]/;

export function CanvasModelViewerSurface({
  className,
  errorLabel = "Unable to load model",
  loadingLabel = "Loading model...",
  name,
  sourceUrl,
  testId = "canvas-model-viewer",
  visible
}: CanvasModelViewerSurfaceProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [status, setStatus] = useState<"error" | "loading" | "ready">(
    "loading"
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!(container && visible)) {
      return undefined;
    }

    const host = container;
    let disposed = false;
    let frameId: number | null = null;
    let disposeScene = () => undefined;
    setStatus("loading");

    async function mountViewer() {
      const format = modelFileFormatFromName(name);
      if (!format) {
        throw new Error(`Unsupported model format: ${name}`);
      }

      const THREE = await import("three");
      const [{ OrbitControls }, object] = await Promise.all([
        import("three/examples/jsm/controls/OrbitControls.js"),
        loadModelObject({ THREE, format, sourceUrl })
      ]);
      if (disposed) {
        disposeObject(object);
        return;
      }

      const renderer = new THREE.WebGLRenderer({
        alpha: true,
        antialias: true,
        powerPreference: "high-performance"
      });
      renderer.setClearColor(0x000000, 0);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.domElement.className = "canvas-model-viewer-canvas";

      const scene = new THREE.Scene();
      scene.background = null;
      const camera = new THREE.PerspectiveCamera(42, 1, 0.01, 10_000);
      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.08;

      scene.add(new THREE.HemisphereLight(0xffffff, 0x2f3747, 2.5));
      const keyLight = new THREE.DirectionalLight(0xffffff, 2.4);
      keyLight.position.set(3, 4, 5);
      scene.add(keyLight);
      scene.add(object);
      fitCameraToObject(THREE, camera, controls, object);

      const resize = () => {
        const rect = host.getBoundingClientRect();
        const width = Math.max(1, Math.floor(rect.width));
        const height = Math.max(1, Math.floor(rect.height));
        renderer.setSize(width, height, false);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
      };
      const observer =
        typeof ResizeObserver === "undefined"
          ? null
          : new ResizeObserver(resize);
      observer?.observe(host);
      window.addEventListener("resize", resize);
      host.appendChild(renderer.domElement);
      resize();

      const animate = () => {
        controls.update();
        renderer.render(scene, camera);
        frameId = window.requestAnimationFrame(animate);
      };
      frameId = window.requestAnimationFrame(animate);
      setStatus("ready");

      disposeScene = () => {
        observer?.disconnect();
        window.removeEventListener("resize", resize);
        controls.dispose();
        disposeObject(object);
        renderer.dispose();
        renderer.forceContextLoss();
        renderer.domElement.remove();
      };
    }

    mountViewer().catch((error: unknown) => {
      console.warn("[model-viewer] failed to load model:", error);
      if (!disposed) {
        setStatus("error");
      }
    });

    return () => {
      disposed = true;
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
      }
      disposeScene();
    };
  }, [name, sourceUrl, visible]);

  return (
    <div
      className={["canvas-model-viewer", className].filter(Boolean).join(" ")}
      data-testid={testId}
      ref={containerRef}
    >
      {status === "loading" ? (
        <div className="canvas-model-viewer-status">{loadingLabel}</div>
      ) : null}
      {status === "error" ? (
        <div className="canvas-model-viewer-status">{errorLabel}</div>
      ) : null}
    </div>
  );
}

function modelFileFormatFromName(name: string): ModelFileFormat | null {
  const normalizedName = name.trim().toLowerCase();
  const dotIndex = normalizedName.lastIndexOf(".");
  if (dotIndex < 0 || dotIndex === normalizedName.length - 1) {
    return null;
  }

  const extension = normalizedName.slice(dotIndex + 1);
  return extension === "glb" ||
    extension === "gltf" ||
    extension === "obj" ||
    extension === "stl"
    ? extension
    : null;
}

async function loadModelObject(input: {
  THREE: ThreeModule;
  format: ModelFileFormat;
  sourceUrl: string;
}): Promise<Object3D> {
  if (input.format === "glb" || input.format === "gltf") {
    const { GLTFLoader } = await import(
      "three/examples/jsm/loaders/GLTFLoader.js"
    );
    const gltf = await new GLTFLoader(
      createResourceLoadingManager(input.THREE, input.sourceUrl)
    ).loadAsync(input.sourceUrl);
    return gltf.scene;
  }

  if (input.format === "obj") {
    const [{ OBJLoader }, { MTLLoader }] = await Promise.all([
      import("three/examples/jsm/loaders/OBJLoader.js"),
      import("three/examples/jsm/loaders/MTLLoader.js")
    ]);
    const objText = await fetchText(input.sourceUrl);
    const loader = new OBJLoader(
      createResourceLoadingManager(input.THREE, input.sourceUrl)
    );
    const materialPath = firstObjMaterialLibrary(objText);
    if (materialPath) {
      const materialUrl = resolveModelResourceUrl(
        input.sourceUrl,
        materialPath
      );
      const materials = await new MTLLoader(
        createResourceLoadingManager(input.THREE, materialUrl)
      ).loadAsync(materialUrl);
      materials.preload();
      loader.setMaterials(materials);
    }
    return loader.parse(objText);
  }

  const { STLLoader } = await import("three/examples/jsm/loaders/STLLoader.js");
  const geometry = await new STLLoader(
    createResourceLoadingManager(input.THREE, input.sourceUrl)
  ).loadAsync(input.sourceUrl);
  geometry.computeVertexNormals();
  return new input.THREE.Mesh(
    geometry,
    new input.THREE.MeshStandardMaterial({
      color: 0xc8d8e8,
      metalness: 0.12,
      roughness: 0.58
    })
  );
}

function createResourceLoadingManager(
  THREE: ThreeModule,
  sourceUrl: string
): import("three").LoadingManager {
  const manager = new THREE.LoadingManager();
  manager.setURLModifier((url) => resolveModelResourceUrl(sourceUrl, url));
  return manager;
}

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load model source: ${response.status}`);
  }
  return response.text();
}

function firstObjMaterialLibrary(objText: string): string | null {
  const match = OBJ_MATERIAL_LIBRARY_RE.exec(objText);
  return match?.[1]?.trim() || null;
}

function resolveModelResourceUrl(
  sourceUrl: string,
  resourceUrl: string
): string {
  if (MODEL_EXTERNAL_URL_RE.test(resourceUrl)) {
    return resourceUrl;
  }

  const source = new URL(sourceUrl);
  if (source.protocol !== "app-file:") {
    return new URL(resourceUrl, sourceUrl).toString();
  }

  const parsedResourceUrl = parseUrl(resourceUrl);
  if (
    parsedResourceUrl?.protocol === "app-file:" &&
    (parsedResourceUrl.searchParams.has("assetId") ||
      parsedResourceUrl.searchParams.has("canvasId"))
  ) {
    return resourceUrl;
  }

  const currentPath = source.searchParams.get("path") ?? "";
  const rawPath = resourcePathFromUrl(resourceUrl);
  const resolvedPath = normalizeModelResourcePath(currentPath, rawPath);
  if (!resolvedPath) {
    return resourceUrl;
  }

  const next = new URL(sourceUrl);
  next.searchParams.set("path", resolvedPath);
  return next.toString();
}

function resourcePathFromUrl(resourceUrl: string): string {
  const parsed = parseUrl(resourceUrl);
  if (parsed?.protocol === "app-file:") {
    return parsed.searchParams.get("path") ?? parsed.pathname;
  }
  return resourceUrl;
}

function parseUrl(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function normalizeModelResourcePath(
  currentPath: string,
  rawResourcePath: string
): string | null {
  const cleanPath = rawResourcePath.split(MODEL_URL_CLEAN_PATH_RE, 1)[0] ?? "";
  let decodedPath: string;
  try {
    decodedPath = decodeURIComponent(cleanPath);
  } catch {
    decodedPath = cleanPath;
  }

  const currentSegments = currentPath.split("/").filter(Boolean);
  const baseSegments = currentSegments.slice(0, -1);
  const resourceSegments = decodedPath
    .replaceAll("\\", "/")
    .split("/")
    .filter(Boolean);
  const resolvedSegments: string[] = [];

  for (const segment of [...baseSegments, ...resourceSegments]) {
    if (segment === ".") {
      continue;
    }
    if (segment === "..") {
      if (resolvedSegments.length === 0) {
        return null;
      }
      resolvedSegments.pop();
      continue;
    }
    resolvedSegments.push(segment);
  }

  return resolvedSegments.length > 0 ? resolvedSegments.join("/") : null;
}

function fitCameraToObject(
  THREE: ThreeModule,
  camera: PerspectiveCamera,
  controls: {
    maxDistance: number;
    target: import("three").Vector3;
    update: () => void;
  },
  object: Object3D
) {
  const box = new THREE.Box3().setFromObject(object);
  if (box.isEmpty()) {
    camera.position.set(0, 0, 6);
    controls.target.set(0, 0, 0);
    controls.update();
    return;
  }

  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const maxDimension = Math.max(size.x, size.y, size.z, 1);
  const distance =
    (maxDimension / (2 * Math.tan((camera.fov * Math.PI) / 360))) * 1.8;
  const direction = new THREE.Vector3(1, 0.78, 1).normalize();

  camera.near = Math.max(0.001, distance / 100);
  camera.far = Math.max(1000, distance * 100);
  camera.position.copy(center).add(direction.multiplyScalar(distance));
  camera.updateProjectionMatrix();
  controls.maxDistance = distance * 8;
  controls.target.copy(center);
  controls.update();
}

function disposeObject(object: Object3D) {
  object.traverse((node) => {
    const mesh = node as {
      geometry?: { dispose: () => void };
      material?: unknown;
    };
    mesh.geometry?.dispose();
    disposeMaterial(mesh.material);
  });
}

function disposeMaterial(material: unknown) {
  if (Array.isArray(material)) {
    for (const entry of material) {
      disposeMaterial(entry);
    }
    return;
  }

  if (!material || typeof material !== "object") {
    return;
  }

  const disposable = material as { dispose?: () => void };
  disposable.dispose?.();
}
