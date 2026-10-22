import * as THREE from "three";
import {
  CITIZEN_COUNT,
  HOME_REGION,
  MAP_SIZE,
  SimRunner,
  WORK_REGION,
} from "./sim/index.js";

const DEFAULT_SEED = 42;
const TICKS_PER_FRAME = 2;

const hud = document.getElementById("hud");

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0d1117);

const camera = new THREE.OrthographicCamera(
  -MAP_SIZE / 2,
  MAP_SIZE / 2,
  MAP_SIZE / 2,
  -MAP_SIZE / 2,
  0.1,
  100,
);
camera.position.set(0, 50, 0);
camera.lookAt(0, 0, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const gridHelper = new THREE.GridHelper(MAP_SIZE, MAP_SIZE, 0x30363d, 0x21262d);
gridHelper.position.set(0, 0, 0);
scene.add(gridHelper);

function regionMesh(
  r: { x0: number; y0: number; x1: number; y1: number },
  color: number,
): THREE.Mesh {
  const w = r.x1 - r.x0 + 1;
  const h = r.y1 - r.y0 + 1;
  const geom = new THREE.PlaneGeometry(w, h);
  const mat = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.25,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(geom, mat);
  mesh.rotation.x = -Math.PI / 2;
  const cx = r.x0 + w / 2 - MAP_SIZE / 2;
  const cz = r.y0 + h / 2 - MAP_SIZE / 2;
  mesh.position.set(cx, 0.01, cz);
  return mesh;
}

scene.add(regionMesh(HOME_REGION, 0x3fb950));
scene.add(regionMesh(WORK_REGION, 0x58a6ff));

const dotGeom = new THREE.SphereGeometry(0.18, 8, 8);
const dotMat = new THREE.MeshBasicMaterial({ color: 0xf0f6fc });
const dots: THREE.Mesh[] = [];
for (let i = 0; i < CITIZEN_COUNT; i++) {
  const dot = new THREE.Mesh(dotGeom, dotMat);
  scene.add(dot);
  dots.push(dot);
}

const runner = new SimRunner(DEFAULT_SEED);

function worldPos(gridX: number, gridY: number): THREE.Vector3 {
  return new THREE.Vector3(gridX - MAP_SIZE / 2 + 0.5, 0.2, gridY - MAP_SIZE / 2 + 0.5);
}

function syncDots(): void {
  const snap = runner.snapshot();
  for (let i = 0; i < snap.citizens.length; i++) {
    const c = snap.citizens[i];
    const p = worldPos(c.x, c.y);
    dots[i].position.copy(p);
  }
  if (hud) {
    hud.textContent = `Abundance City M0 — tick ${snap.tick} — ${CITIZEN_COUNT} citizens (seed ${DEFAULT_SEED})`;
  }
}

syncDots();

function onResize(): void {
  const aspect = window.innerWidth / window.innerHeight;
  const half = MAP_SIZE / 2 + 2;
  camera.left = -half * aspect;
  camera.right = half * aspect;
  camera.top = half;
  camera.bottom = -half;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

window.addEventListener("resize", onResize);
onResize();

function animate(): void {
  requestAnimationFrame(animate);
  for (let i = 0; i < TICKS_PER_FRAME; i++) {
    runner.step();
  }
  syncDots();
  renderer.render(scene, camera);
}

animate();
