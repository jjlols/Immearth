import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { assignShells, prepareLayerPixels } from "../globe/layerShells.js";

const imageCache = new Map();

function loadImage(url) {
  if (!imageCache.has(url)) {
    imageCache.set(url, new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error(`Map image failed to load: ${url}`));
      image.src = url;
    }));
  }
  return imageCache.get(url);
}

function canvasFromImage(image) {
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth || image.width;
  canvas.height = image.naturalHeight || image.height;
  return canvas;
}

async function preparedCanvas(url, layerId) {
  const image = await loadImage(url);
  const canvas = canvasFromImage(image);
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (layerId === "basemap") {
    context.fillStyle = "#0c233b";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0);
    return canvas;
  }
  context.drawImage(image, 0, 0);
  const frame = context.getImageData(0, 0, canvas.width, canvas.height);
  prepareLayerPixels(frame.data, canvas.width, canvas.height, layerId);
  context.putImageData(frame, 0, 0);
  return canvas;
}

function makeTexture(canvas, renderer) {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  texture.needsUpdate = true;
  return texture;
}

function attachPeel(material) {
  const peel = { start: { value: -10 }, end: { value: -9 } };
  material.userData.peel = peel;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.peelStart = peel.start;
    shader.uniforms.peelEnd = peel.end;
    shader.vertexShader = shader.vertexShader
      .replace("#include <uv_pars_vertex>", "#include <uv_pars_vertex>\nvarying vec3 vPeelView;")
      .replace("#include <project_vertex>", "#include <project_vertex>\n  vPeelView = mvPosition.xyz;");
    shader.fragmentShader = shader.fragmentShader
      .replace("uniform float opacity;", "uniform float opacity;\nuniform float peelStart;\nuniform float peelEnd;\nvarying vec3 vPeelView;")
      .replace("#include <map_fragment>", "#include <map_fragment>\n  diffuseColor.a *= smoothstep(peelStart, peelEnd, vPeelView.x + vPeelView.y * 0.18);");
  };
  material.customProgramCacheKey = () => "layer-shell-peel";
  return material;
}

function disposeMesh(mesh) {
  mesh.geometry.dispose();
  mesh.material.dispose();
}

export default function LayerGlobe({ layers, settings, focus, onlySelected, showGeography }) {
  const mountRef = useRef(null);
  const turnRef = useRef(() => {});
  const apiRef = useRef(null);
  const [status, setStatus] = useState("Drawing the globes…");

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return undefined;
    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      setStatus("This display could not start the globe. The flat map still works.");
      return undefined;
    }
    if (!renderer.getContext()) {
      setStatus("This display could not start the globe. The flat map still works.");
      renderer.dispose();
      return undefined;
    }

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 20);
    camera.position.set(0, 0.18, 3.35);
    const globe = new THREE.Group();
    globe.rotation.x = 0.28;
    globe.rotation.y = 0.55;
    scene.add(globe);

    const earth = new THREE.Mesh(
      new THREE.SphereGeometry(1, 80, 48),
      new THREE.MeshBasicMaterial({ color: 0x0c233b }),
    );
    globe.add(earth);

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.domElement.setAttribute("aria-hidden", "true");
    mount.appendChild(renderer.domElement);

    const shells = [];
    const textures = new Map();
    const canvasJobs = new Map();
    let frame = 0;
    let stopped = false;
    let generation = 0;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let spinning = !reducedMotion;
    let spinTimer = 0;

    function resize() {
      const width = mount.clientWidth || 1;
      const height = mount.clientHeight || 1;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
    }
    const observer = new ResizeObserver(resize);
    observer.observe(mount);
    resize();

    function onPointerDown(event) {
      spinning = false;
      window.clearTimeout(spinTimer);
      mount.setPointerCapture(event.pointerId);
      mount.dataset.dragX = String(event.clientX);
      mount.dataset.dragY = String(event.clientY);
      mount.dataset.dragging = "true";
    }
    function onPointerMove(event) {
      if (mount.dataset.dragging !== "true") return;
      globe.rotation.y += (event.clientX - Number(mount.dataset.dragX)) * 0.005;
      globe.rotation.x = THREE.MathUtils.clamp(
        globe.rotation.x + (event.clientY - Number(mount.dataset.dragY)) * 0.004,
        -0.9,
        0.9,
      );
      mount.dataset.dragX = String(event.clientX);
      mount.dataset.dragY = String(event.clientY);
    }
    function endDrag() {
      if (mount.dataset.dragging !== "true") return;
      mount.dataset.dragging = "false";
      if (!reducedMotion) spinTimer = window.setTimeout(() => { spinning = true; }, 1800);
    }
    mount.addEventListener("pointerdown", onPointerDown);
    mount.addEventListener("pointermove", onPointerMove);
    mount.addEventListener("pointerup", endDrag);
    mount.addEventListener("pointercancel", endDrag);
    turnRef.current = (delta) => {
      spinning = false;
      window.clearTimeout(spinTimer);
      globe.rotation.y += delta;
      if (!reducedMotion) spinTimer = window.setTimeout(() => { spinning = true; }, 1800);
    };

    function animate() {
      if (stopped) return;
      if (spinning && document.visibilityState !== "hidden") globe.rotation.y += 0.0014;
      renderer.render(scene, camera);
      frame = window.requestAnimationFrame(animate);
    }
    animate();

    async function canvasFor(id, url) {
      if (!canvasJobs.has(id)) canvasJobs.set(id, preparedCanvas(url, id));
      return canvasJobs.get(id);
    }

    async function textureFor(id, url) {
      if (!textures.has(id)) {
        const canvas = await canvasFor(id, url);
        textures.set(id, makeTexture(canvas, renderer));
      }
      return textures.get(id);
    }

    function clearShells() {
      shells.forEach((mesh) => {
        globe.remove(mesh);
        disposeMesh(mesh);
      });
      shells.length = 0;
    }

    apiRef.current = {
      async sync({ layers: nextLayers, settings: nextSettings, focus: nextFocus, onlySelected: nextSolo, showGeography: nextGeography }) {
        const ticket = ++generation;
        const base = import.meta.env.BASE_URL;
        try {
          if (nextGeography) {
            const texture = await textureFor("basemap", `${base}assets/basemap.png`);
            if (stopped || ticket !== generation) return;
            earth.material.map = texture;
            earth.material.color.set(0xffffff);
          } else if (ticket === generation) {
            earth.material.map = null;
            earth.material.color.set(0x0c233b);
          }
          earth.material.needsUpdate = true;
          const layout = assignShells(nextLayers, { settings: nextSettings, focus: nextFocus, onlySelected: nextSolo });
          const built = [];
          for (const shell of layout) {
            const texture = await textureFor(shell.id, `${base}assets/${shell.id}.png`);
            if (stopped || ticket !== generation) {
              built.forEach(disposeMesh);
              return;
            }
            const material = attachPeel(new THREE.MeshBasicMaterial({
              map: texture,
              transparent: true,
              opacity: shell.opacity,
              depthWrite: false,
              side: THREE.FrontSide,
            }));
            material.userData.peel.start.value = shell.peel.start;
            material.userData.peel.end.value = shell.peel.end;
            const mesh = new THREE.Mesh(new THREE.SphereGeometry(shell.radius, 80, 48), material);
            mesh.renderOrder = built.length + 1;
            built.push(mesh);
          }
          if (stopped || ticket !== generation) {
            built.forEach(disposeMesh);
            return;
          }
          clearShells();
          built.forEach((mesh) => {
            globe.add(mesh);
            shells.push(mesh);
          });
          setStatus("");
        } catch (error) {
          if (!stopped && ticket === generation) setStatus(error.message);
        }
      },
    };

    return () => {
      stopped = true;
      generation += 1;
      apiRef.current = null;
      window.cancelAnimationFrame(frame);
      window.clearTimeout(spinTimer);
      observer.disconnect();
      mount.removeEventListener("pointerdown", onPointerDown);
      mount.removeEventListener("pointermove", onPointerMove);
      mount.removeEventListener("pointerup", endDrag);
      mount.removeEventListener("pointercancel", endDrag);
      turnRef.current = () => {};
      clearShells();
      disposeMesh(earth);
      textures.forEach((texture) => texture.dispose());
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  useEffect(() => {
    const api = apiRef.current;
    if (!api) return undefined;
    let cancelled = false;
    api.sync({ layers, settings, focus, onlySelected, showGeography }).catch((error) => {
      if (!cancelled) setStatus(error.message);
    });
    return () => { cancelled = true; };
  }, [layers, settings, focus, onlySelected, showGeography]);

  return (
    <div className="globe-stage">
      <div ref={mountRef} className="globe-canvas" />
      <p className="globe-note">Turn left and Turn right turn the globe. Dragging the picture is optional.</p>
      <div className="globe-turn">
        <button type="button" onClick={() => turnRef.current(-0.5)}>Turn left</button>
        <button type="button" onClick={() => turnRef.current(0.5)}>Turn right</button>
      </div>
      {status && <p className="globe-status" role="status">{status}</p>}
    </div>
  );
}
