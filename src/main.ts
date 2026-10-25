import * as THREE from "three";
import {
  CITIZEN_COUNT,
  HOME_REGION,
  MAP_SIZE,
  SimRunner,
  WORK_REGION,
} from "./sim/index.js";
import { buildM2aWorld } from "./sim/m2a/worldgen.js";
import type { IncomeFifth } from "./economy/sectors/cost-of-living.js";
import type { WagePolicyName } from "./economy/m2a/wage-policy.js";
import {
  POLICY_COLORS,
  costOfLivingIndex,
  formatIncomeUsd,
  formatIndex,
  householdPanelModel,
  initialViewSelection,
  layoutHouseholdResidences,
  loadBundledSectorRoadmap,
  mapHouseholdsToIncomeFifths,
  residenceColorHex,
  sidePanelModel,
} from "./view/roadmap-view.js";

const DEFAULT_SEED = 42;
const TICKS_PER_FRAME = 2;

const roadmap = loadBundledSectorRoadmap();
const world = buildM2aWorld(DEFAULT_SEED);
const fifthByHousehold = mapHouseholdsToIncomeFifths(world.households);
const incomeByHousehold = new Map(world.households.map((household) => [household.id, household.incomeAnnualUsd]));
const plots = layoutHouseholdResidences(world.households.map((household) => household.id));
const plotById = new Map(plots.map((plot) => [plot.householdId, plot]));

const selection = initialViewSelection(window.location.search);
const state: {
  year: number;
  wagePolicy: WagePolicyName;
  selectedHouseholdId: number | null;
} = {
  year: selection.year,
  wagePolicy: selection.wagePolicy,
  selectedHouseholdId:
    selection.householdId !== null && fifthByHousehold.has(selection.householdId) ? selection.householdId : null,
};

const hudStatus = requireEl<HTMLElement>("hud-status");
const yearSlider = requireEl<HTMLInputElement>("year-slider");
const yearReadout = requireEl<HTMLElement>("year-readout");
const policyMarket = requireEl<HTMLButtonElement>("policy-market");
const policyGuarantee = requireEl<HTMLButtonElement>("policy-guarantee");
const sidePanel = requireEl<HTMLElement>("side-panel");
const householdPanel = requireEl<HTMLElement>("household-panel");
const householdTitle = requireEl<HTMLElement>("household-title");
const householdMeta = requireEl<HTMLElement>("household-meta");
const householdBasket = requireEl<HTMLElement>("household-basket");
const householdChart = requireEl<HTMLElement>("household-chart");
const hoverLabel = requireEl<HTMLElement>("hover-label");
const colorScaleBar = requireEl<HTMLElement>("color-scale-bar");

colorScaleBar.style.background = `linear-gradient(90deg, ${residenceColorHex(1)}, ${residenceColorHex(0.6)})`;
const swatches = document.querySelectorAll<HTMLElement>("[data-policy-swatch]");
for (let i = 0; i < swatches.length; i++) {
  const swatch = swatches[i];
  const policy = swatch.getAttribute("data-policy-swatch");
  if (policy === "MarketWages" || policy === "WageGuarantee") {
    swatch.style.background = POLICY_COLORS[policy];
  }
}

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0d1117);

const camera = new THREE.OrthographicCamera(-MAP_SIZE / 2, MAP_SIZE / 2, MAP_SIZE / 2, -MAP_SIZE / 2, 0.1, 100);
camera.position.set(0, 50, 0);
camera.lookAt(0, 0, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const gridHelper = new THREE.GridHelper(MAP_SIZE, MAP_SIZE, 0x30363d, 0x21262d);
gridHelper.position.set(0, 0, 0);
scene.add(gridHelper);

function regionMesh(r: { x0: number; y0: number; x1: number; y1: number }, color: number): THREE.Mesh {
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

function gridToWorld(gridX: number, gridY: number, height: number): THREE.Vector3 {
  return new THREE.Vector3(gridX - MAP_SIZE / 2 + 0.5, height, gridY - MAP_SIZE / 2 + 0.5);
}

interface ResidenceView {
  householdId: number;
  quintile: IncomeFifth;
  material: THREE.MeshBasicMaterial;
}

const residenceGeom = new THREE.PlaneGeometry(0.78, 0.78);
const residences: ResidenceView[] = [];
const residenceMeshes: THREE.Mesh[] = [];
for (const plot of plots) {
  const quintile = fifthByHousehold.get(plot.householdId);
  if (quintile === undefined) throw new Error(`No income fifth for household ${plot.householdId}`);
  const material = new THREE.MeshBasicMaterial({ color: residenceColorHex(1) });
  const mesh = new THREE.Mesh(residenceGeom, material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.copy(gridToWorld(plot.x, plot.y, 0.05));
  mesh.userData.householdId = plot.householdId;
  scene.add(mesh);
  residences.push({ householdId: plot.householdId, quintile, material });
  residenceMeshes.push(mesh);
}

const selectMesh = new THREE.Mesh(
  new THREE.PlaneGeometry(0.96, 0.96),
  new THREE.MeshBasicMaterial({ color: 0xf0f6fc, depthWrite: false }),
);
selectMesh.rotation.x = -Math.PI / 2;
selectMesh.visible = false;
scene.add(selectMesh);

const dotGeom = new THREE.SphereGeometry(0.18, 8, 8);
const dotMat = new THREE.MeshBasicMaterial({ color: 0xf0f6fc });
const dots: THREE.Mesh[] = [];
for (let i = 0; i < CITIZEN_COUNT; i++) {
  const dot = new THREE.Mesh(dotGeom, dotMat);
  scene.add(dot);
  dots.push(dot);
}

const runner = new SimRunner(DEFAULT_SEED);
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let hoveredId: number | null = null;

function syncDots(): void {
  const snap = runner.snapshot();
  for (let i = 0; i < snap.citizens.length; i++) {
    const citizen = snap.citizens[i];
    dots[i].position.copy(gridToWorld(citizen.x, citizen.y, 0.2));
  }
  hudStatus.textContent = `tick ${snap.tick} · seed ${DEFAULT_SEED} · ${residences.length} residences`;
}

function applyResidenceColors(): void {
  for (const residence of residences) {
    const index = costOfLivingIndex(roadmap, state.year, state.wagePolicy, residence.quintile);
    residence.material.color.set(residenceColorHex(index));
  }
}

function placeSelection(): void {
  if (state.selectedHouseholdId === null) {
    selectMesh.visible = false;
    return;
  }
  const plot = plotById.get(state.selectedHouseholdId);
  if (!plot) {
    selectMesh.visible = false;
    return;
  }
  selectMesh.position.copy(gridToWorld(plot.x, plot.y, 0.03));
  selectMesh.visible = true;
}

function renderSidePanel(): void {
  const model = sidePanelModel(roadmap, state.year, state.wagePolicy);
  const title = document.createElement("p");
  title.className = "panel-title";
  title.textContent = `Year ${model.year} · ${model.wagePolicy}`;
  sidePanel.replaceChildren(
    title,
    kicker("Sector price indexes"),
    table(
      ["Sector", "Index"],
      model.sectors.map((row) => [row.label, row.priceText]),
    ),
    kicker("Basket by income fifth"),
    table(
      ["Fifth", "Basket", "vs year 0"],
      model.fifths.map((row) => [row.label, row.costText, row.indexText]),
    ),
  );
}

function renderHouseholdPanel(): void {
  const id = state.selectedHouseholdId;
  if (id === null) {
    householdPanel.hidden = true;
    return;
  }
  const quintile = fifthByHousehold.get(id);
  const income = incomeByHousehold.get(id);
  if (quintile === undefined || income === undefined) {
    householdPanel.hidden = true;
    return;
  }
  const model = householdPanelModel(
    roadmap,
    { id, incomeAnnualUsd: income },
    quintile,
    state.year,
    state.wagePolicy,
  );
  householdPanel.hidden = false;
  householdTitle.textContent = `Household ${model.householdId}`;
  householdMeta.textContent = `Fifth ${model.quintile} of 5 (${model.quintileLabel}) · income ${formatIncomeUsd(model.incomeAnnualUsd)}`;
  householdBasket.textContent = `Year ${model.year} · ${model.wagePolicy} · basket ${model.costText} · index ${model.indexText}`;
  householdChart.innerHTML = model.chartSvg;
}

function refreshHover(): void {
  if (hoveredId === null) return;
  const quintile = fifthByHousehold.get(hoveredId);
  if (quintile === undefined) return;
  const index = costOfLivingIndex(roadmap, state.year, state.wagePolicy, quintile);
  hoverLabel.textContent = `Household ${hoveredId} · fifth ${quintile} · index ${formatIndex(index)}`;
}

function publish(): void {
  yearSlider.value = String(state.year);
  yearReadout.textContent = String(state.year);
  yearSlider.setAttribute("aria-valuenow", String(state.year));
  yearSlider.setAttribute("aria-valuetext", `Year ${state.year}`);
  policyMarket.setAttribute("aria-pressed", String(state.wagePolicy === "MarketWages"));
  policyGuarantee.setAttribute("aria-pressed", String(state.wagePolicy === "WageGuarantee"));
  document.body.dataset.year = String(state.year);
  document.body.dataset.wagePolicy = state.wagePolicy;
  document.body.dataset.residences = String(residences.length);
  document.body.dataset.ready = "true";
  if (state.selectedHouseholdId === null) delete document.body.dataset.household;
  else document.body.dataset.household = String(state.selectedHouseholdId);
  applyResidenceColors();
  placeSelection();
  renderSidePanel();
  renderHouseholdPanel();
  refreshHover();
}

function pickResidence(event: PointerEvent): number | null {
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(residenceMeshes, false);
  for (const hit of hits) {
    const id = hit.object.userData.householdId;
    if (typeof id === "number") return id;
  }
  return null;
}

function moveHover(event: PointerEvent): void {
  const offset = 14;
  const width = hoverLabel.offsetWidth || 180;
  const left = event.clientX + offset + width > window.innerWidth ? event.clientX - width - offset : event.clientX + offset;
  hoverLabel.style.left = `${Math.max(8, left)}px`;
  hoverLabel.style.top = `${event.clientY + offset}px`;
}

yearSlider.addEventListener("input", () => {
  state.year = Number(yearSlider.value);
  publish();
});

policyMarket.addEventListener("click", () => {
  state.wagePolicy = "MarketWages";
  publish();
});

policyGuarantee.addEventListener("click", () => {
  state.wagePolicy = "WageGuarantee";
  publish();
});

requireEl<HTMLButtonElement>("household-close").addEventListener("click", () => {
  state.selectedHouseholdId = null;
  publish();
});

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && state.selectedHouseholdId !== null) {
    state.selectedHouseholdId = null;
    publish();
  }
});

renderer.domElement.addEventListener("pointerdown", (event) => {
  if (event.button !== 0) return;
  state.selectedHouseholdId = pickResidence(event);
  publish();
});

renderer.domElement.addEventListener("pointermove", (event) => {
  const id = pickResidence(event);
  renderer.domElement.style.cursor = id === null ? "default" : "pointer";
  if (id === null) {
    hoveredId = null;
    hoverLabel.hidden = true;
    return;
  }
  hoveredId = id;
  hoverLabel.hidden = false;
  refreshHover();
  moveHover(event);
});

renderer.domElement.addEventListener("pointerleave", () => {
  hoveredId = null;
  hoverLabel.hidden = true;
  renderer.domElement.style.cursor = "default";
});

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
publish();
syncDots();

function animate(): void {
  requestAnimationFrame(animate);
  for (let i = 0; i < TICKS_PER_FRAME; i++) runner.step();
  syncDots();
  renderer.render(scene, camera);
}

animate();

function requireEl<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing #${id}`);
  return element as T;
}

function kicker(text: string): HTMLParagraphElement {
  const paragraph = document.createElement("p");
  paragraph.className = "kicker";
  paragraph.textContent = text;
  return paragraph;
}

function table(headers: string[], rows: string[][]): HTMLTableElement {
  const element = document.createElement("table");
  const head = document.createElement("tr");
  for (const header of headers) {
    const cell = document.createElement("th");
    cell.textContent = header;
    cell.scope = "col";
    head.append(cell);
  }
  element.append(head);
  for (const row of rows) {
    const tr = document.createElement("tr");
    row.forEach((value, index) => {
      const cell = document.createElement("td");
      cell.textContent = value;
      if (index > 0) cell.className = "num";
      tr.append(cell);
    });
    element.append(tr);
  }
  return element;
}
