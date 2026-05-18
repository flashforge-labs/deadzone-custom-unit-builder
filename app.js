import { leaderRules } from "./model/leader_rules.js";
import { buildCalculationProfile, calculateWithModel, parseCsv, processPack } from "./model/calculator.js";

const MODEL_PATHS = {
  meta: "model/model_meta.json",
  base: "model/base_model.csv",
  multiplier: "model/multiplier_model.csv",
  rounding: "model/rounding_model.csv",
  vp: "model/vp_model.csv",
};

const el = (id) => document.getElementById(id);
const statusEl = el("status");
const pointsEl = el("points");
const vpOutputEl = el("vpOutput");
const continuousEl = el("continuous");
const nearestEl = el("nearest");
const roundProbabilityEl = el("roundProbability");
const form = el("unit-form");
const armyNameEl = el("armyName");
const armyTotalEl = el("armyTotal");
const armyListEl = el("armyList");
const importArmyFileEl = el("importArmyFile");

let model = null;
const selectedKeywords = {
  model: [],
  specialRules: [],
};
let weaponProfiles = [];
let weaponIdCounter = 0;
let armyUnits = [];
let armyUnitIdCounter = 0;

const UNIT_KEYWORD_NAMES = [
  "Aerial Deployment",
  "Agile",
  "Augmented",
  "Beast",
  "Bike",
  "Cloaking Device",
  "Combat Team Training",
  "Comm-link",
  "Communications Relay",
  "Companion",
  "Construct",
  "Defence Cloud",
  "Defender",
  "Defender Shield",
  "Dismantle",
  "Drop Suit",
  "Elusive(1)",
  "Elusive(2)",
  "Energy Shield(1)",
  "Energy Shield(2)",
  "Energy Shield(3)",
  "Energy Shield(4)",
  "Engineer",
  "Evade",
  "Faithful",
  "Flight",
  "Frenzy(1)",
  "Frenzy(2)",
  "Frenzy(3)",
  "Hacker",
  "Headstrong",
  "Honourable",
  "Horde",
  "Invigorate",
  "Jump Pack",
  "Life Drain",
  "Life Support",
  "Medic",
  "Prey",
  "Psychic",
  "Rampage",
  "Recon(3+)",
  "Recon(4+)",
  "Recon(5+)",
  "Recon(6+)",
  "Resilient(1)",
  "Resilient(2)",
  "Scout",
  "Shield Generator(1)",
  "Shield Generator(2)",
  "Shield Generator(4)",
  "Special Order",
  "Secret Mission",
  "Smokescreen",
  "Solid",
  "Stealthy",
  "Tactician(1)",
  "Tactician(2)",
  "Tactician(3)",
  "Teleport",
  "Tenacious",
  "Tough",
  "Under Control",
  "Vehicle",
  "Walker",
  "Named",
  "Command(1)",
  "Command(2)",
  "Command(3)",
  "Command(4)",
];

const WEAPON_KEYWORD_NAMES = [
  "BOOM!(3)",
  "BOOM!(4)",
  "BOOM!(5)",
  "Blast",
  "Charged",
  "Explosive",
  "Explosive((Blast))",
  "Explosive(blast)",
  "Fire Control",
  "Firing Platform(1)",
  "Firing Platform(2)",
  "Frag(2)",
  "Frag(3)",
  "Frag(4)",
  "Frag(5)",
  "Grenade",
  "Grenade(Shield Generator 1)",
  "Heavy",
  "Holo-Sight",
  "Indirect",
  "Ink Sac",
  "It Burns!",
  "It Burns!(2)",
  "It Burns!(3)",
  "It Burns!(4)",
  "Knockback",
  "Non-Lethal",
  "One-Use",
  "Rapid Fire",
  "Smoke",
  "Smoke(1)",
  "Smash(1)",
  "Smash(2)",
  "Sniper Scope",
  "Stun",
  "Suppression",
  "Toxic",
  "Toxic(1)",
  "Toxic(2)",
  "Toxic(3)",
  "Trap(Frag(3))",
  "Weight of Fire(1)",
  "Weight of Fire(2)",
];

const RANGE_OPTIONS = [
  { value: "CC", label: "CC" },
  ...Array.from({ length: 14 }, (_, index) => ({
    value: String(index + 1),
    label: `R${index + 1}`,
  })),
];

const BASE_SIZE_OPTIONS = ["25mm", "40mm", "50mm", "60mm"];

async function loadCsv(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`Could not load ${path}`);
  return parseCsv(await response.text());
}

function num(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalizeKey(value) {
  return String(value || "").trim().toLowerCase();
}

function splitKeywords(value) {
  return String(value || "")
    .split(/[|,;\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function selectOptions(values, labels = null) {
  return values
    .map((value, index) => `<option value="${escapeHtml(value)}">${escapeHtml(labels ? labels[index] : value)}</option>`)
    .join("");
}

function uniqueSorted(values) {
  return [...new Set(values.filter(Boolean))].sort((left, right) => left.localeCompare(right));
}

function buildKeywordCatalog(meta) {
  const exported = meta.keyword_tags || [];
  return {
    unit: uniqueSorted([...UNIT_KEYWORD_NAMES, ...exported.filter((keyword) => UNIT_KEYWORD_NAMES.includes(keyword))]),
    weapon: uniqueSorted([...WEAPON_KEYWORD_NAMES, ...exported.filter((keyword) => WEAPON_KEYWORD_NAMES.includes(keyword))]),
    specialRules: uniqueSorted(leaderRules.map((rule) => rule.RuleName)),
  };
}

function makeWeaponProfile() {
  weaponIdCounter += 1;
  return {
    id: `weapon-${weaponIdCounter}`,
    name: "",
    range: "6",
    ap: 0,
    keywords: [],
  };
}

function readProfile() {
  const modelKeywords = [...selectedKeywords.model];
  const role = el("role").value;
  const specialRuleKeywords = ["Leader", "Legend"].includes(role) ? [...selectedKeywords.specialRules] : [];
  return buildCalculationProfile({
    unitName: el("unitName").value.trim(),
    role,
    baseSize: el("baseSize").value,
    Qty: num(el("qty").value, 1),
    SP_Advance: num(el("spAdvance").value),
    SP_Sprint: num(el("spSprint").value),
    RA: num(el("ra").value),
    FI: num(el("fi").value),
    SV: num(el("sv").value),
    AR: num(el("ar").value),
    HP: num(el("hp").value),
    SZ: num(el("sz").value),
    ManualAdjustment: num(el("manualAdjustment").value),
    notes: el("notes").value.trim(),
    weapons: weaponProfiles,
    modelKeywords,
    specialRules: specialRuleKeywords,
  });
}

function calculate(profile) {
  return calculateWithModel(model, profile);
}

function updateResult() {
  if (!model) return;
  enforceNumberLimits();
  updateSpecialRulesVisibility();
  const profile = readProfile();
  if (!profile.role || !profile.baseSize) return;
  const result = calculate(profile);
  pointsEl.value = result.final;
  pointsEl.textContent = result.final;
  vpOutputEl.value = result.vp;
  vpOutputEl.textContent = result.vp;
  continuousEl.textContent = result.continuous.toFixed(2);
  nearestEl.textContent = result.nearest.toString();
  roundProbabilityEl.textContent = `${Math.round(result.roundProbability * 100)}%`;
}

function currentUnitRecord() {
  const profile = readProfile();
  const result = calculate(profile);
  return {
    id: `unit-${Date.now()}-${armyUnitIdCounter += 1}`,
    profile: serializeProfile(profile),
    result: {
      final: result.final,
      vp: result.vp,
      continuous: Number(result.continuous.toFixed(3)),
    },
  };
}

function serializeProfile(profile) {
  return {
    unitName: profile.unitName || "Custom unit",
    role: profile.role,
    qty: profile.Qty,
    baseSize: profile.baseSize,
    SP_Advance: profile.SP_Advance,
    SP_Sprint: profile.SP_Sprint,
    RA: profile.RA,
    FI: profile.FI,
    SV: profile.SV,
    AR: profile.AR,
    HP: profile.HP,
    SZ: profile.SZ,
    modelKeywords: [...profile.modelKeywords],
    specialRules: [...selectedKeywords.specialRules],
    weapons: profile.weapons.map((weapon) => ({
      name: weapon.name,
      range: weapon.range,
      ap: weapon.ap,
      keywords: [...weapon.keywords],
    })),
    manualAdjustment: profile.ManualAdjustment,
    notes: profile.notes,
  };
}

function unitTotal(unit) {
  return num(unit.profile.qty, 1) * num(unit.result.final);
}

function renderArmyList() {
  const total = armyUnits.reduce((sum, unit) => sum + unitTotal(unit), 0);
  armyTotalEl.value = total;
  armyTotalEl.textContent = total.toString();

  if (!armyUnits.length) {
    armyListEl.innerHTML = `<div class="army-empty">No units added yet.</div>`;
    return;
  }

  armyListEl.innerHTML = armyUnits
    .map((unit) => `
      <div class="army-row" data-unit-id="${escapeHtml(unit.id)}">
        <div>Qty ${escapeHtml(unit.profile.qty)}</div>
        <div>
          <strong>${escapeHtml(unit.profile.unitName)}</strong>
          <div>${escapeHtml(unit.profile.modelKeywords.join(", ") || "No unit keywords")}</div>
        </div>
        <div class="army-role">${escapeHtml(unit.profile.role)}</div>
        <div class="army-vp">${escapeHtml(unit.result.vp)} VP</div>
        <div>${escapeHtml(unit.result.final)} pts each<br><strong>${escapeHtml(unitTotal(unit))} pts</strong></div>
        <div class="army-row-actions">
          <button type="button" data-action="edit">Edit</button>
          <button type="button" data-action="remove">Remove</button>
        </div>
      </div>
    `)
    .join("");
}

function addCurrentUnitToArmy() {
  if (!model) return;
  armyUnits.push(currentUnitRecord());
  renderArmyList();
}

function loadUnitIntoForm(unit) {
  const profile = unit.profile;
  el("unitName").value = profile.unitName || "";
  el("role").value = profile.role || "Troop";
  el("qty").value = profile.qty || 1;
  el("baseSize").value = profile.baseSize || "25mm";
  el("spAdvance").value = profile.SP_Advance ?? 1;
  el("spSprint").value = profile.SP_Sprint ?? 2;
  el("ra").value = profile.RA ?? 5;
  el("fi").value = profile.FI ?? 5;
  el("sv").value = profile.SV ?? 5;
  el("ar").value = profile.AR ?? 0;
  el("hp").value = profile.HP ?? 1;
  el("sz").value = profile.SZ ?? 1;
  el("manualAdjustment").value = profile.manualAdjustment ?? 0;
  el("notes").value = profile.notes || "";
  selectedKeywords.model = [...(profile.modelKeywords || [])];
  selectedKeywords.specialRules = [...(profile.specialRules || [])];
  weaponProfiles = (profile.weapons || []).map((weapon) => ({
    id: `weapon-${weaponIdCounter += 1}`,
    name: weapon.name || "",
    range: weapon.range || "6",
    ap: num(weapon.ap),
    keywords: [...(weapon.keywords || [])],
  }));
  if (!weaponProfiles.length) weaponProfiles = [makeWeaponProfile()];
  renderKeywordPicker(el("modelKeywordPicker"), "model", model.keywordCatalog?.unit || []);
  renderKeywordPicker(el("specialRulePicker"), "specialRules", model.keywordCatalog?.specialRules || []);
  renderWeaponRows(model.keywordCatalog?.weapon || []);
  updateSpecialRulesVisibility();
  updateResult();
}

function downloadText(filename, text, type = "application/json") {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function exportArmyTemplate() {
  const data = {
    app: "deadzone-custom-unit-builder",
    version: 1,
    armyName: armyNameEl.value.trim(),
    units: armyUnits,
  };
  const safeName = (data.armyName || "deadzone-army").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  downloadText(`${safeName || "deadzone-army"}.json`, JSON.stringify(data, null, 2));
}

async function importArmyTemplate(file) {
  if (!file) return;
  const data = JSON.parse(await file.text());
  armyNameEl.value = data.armyName || "";
  armyUnits = Array.isArray(data.units) ? data.units : [];
  renderArmyList();
  importArmyFileEl.value = "";
}

function populateControls(meta) {
  const roles = meta.categorical_values.Role || [];
  const baseSizes = meta.categorical_values.BaseSize || BASE_SIZE_OPTIONS;
  const keywordCatalog = buildKeywordCatalog(meta);
  el("role").innerHTML = selectOptions(roles);
  el("baseSize").innerHTML = selectOptions(baseSizes);
  el("ra").innerHTML = selectOptions([0, 3, 4, 5, 6], ["-", "3+", "4+", "5+", "6+"]);
  el("fi").innerHTML = selectOptions([0, 3, 4, 5, 6, 7], ["-", "3+", "4+", "5+", "6+", "7+"]);
  el("sv").innerHTML = selectOptions([3, 4, 5, 6, 7], ["3+", "4+", "5+", "6+", "7+"]);
  if (roles.includes("Troop")) el("role").value = "Troop";
  if (baseSizes.includes("25mm")) el("baseSize").value = "25mm";
  el("ra").value = "5";
  el("fi").value = "5";
  el("sv").value = "5";
  model.keywordCatalog = keywordCatalog;
  setupKeywordPicker("modelKeywordPicker", "model", keywordCatalog.unit);
  setupKeywordPicker("specialRulePicker", "specialRules", keywordCatalog.specialRules);
  initializeWeapons(keywordCatalog.weapon);
  updateSpecialRulesVisibility();
}

function setupKeywordPicker(containerId, key, keywords) {
  const container = el(containerId);
  container.dataset.key = key;
  const searchLabel =
    key === "model" ? "Search unit keywords" :
    key === "specialRules" ? "Search special rules" :
    "Search keywords";
  container.innerHTML = `
    <div class="selected-keywords" aria-live="polite"></div>
    <input class="keyword-search" type="search" autocomplete="off" placeholder="${escapeHtml(searchLabel)}" aria-label="${escapeHtml(searchLabel)}" />
    <div class="keyword-options" hidden></div>
  `;
  const selected = container.querySelector(".selected-keywords");
  const search = container.querySelector(".keyword-search");
  const options = container.querySelector(".keyword-options");

  search.addEventListener("focus", () => renderKeywordOptions(container, key, keywords, true));
  search.addEventListener("input", () => renderKeywordOptions(container, key, keywords, true));
  selected.addEventListener("click", () => {
    renderKeywordOptions(container, key, keywords, true);
    search.focus();
  });
  options.addEventListener("click", (event) => {
    const button = event.target.closest("[data-keyword]");
    if (!button) return;
    selectedKeywords[key].push(button.dataset.keyword);
    search.value = "";
    renderKeywordPicker(container, key, keywords, true);
    updateResult();
    search.focus();
  });

  renderKeywordPicker(container, key, keywords);
}

function initializeWeapons(keywords) {
  weaponProfiles = [makeWeaponProfile()];
  renderWeaponRows(keywords);
}

function renderWeaponRows(keywords) {
  const root = el("weaponsRoot");
  root.innerHTML = weaponProfiles
    .map(
      (weapon, index) => `
        <div class="weapon-row" data-weapon-id="${escapeHtml(weapon.id)}">
          <div class="weapon-grid">
            <label>
              <span>Weapon</span>
              <input class="weapon-name" type="text" maxlength="40" value="${escapeHtml(weapon.name)}" placeholder="Weapon ${index + 1}" />
            </label>
            <label>
              <span>Range</span>
              <select class="weapon-range">${RANGE_OPTIONS.map((option) => `<option value="${escapeHtml(option.value)}"${option.value === weapon.range ? " selected" : ""}>${escapeHtml(option.label)}</option>`).join("")}</select>
            </label>
            <label>
              <span>AP</span>
              <input class="weapon-ap" type="number" min="0" max="5" step="1" value="${escapeHtml(weapon.ap)}" />
            </label>
            <div class="weapon-keyword-cell">
              <span class="line-label">Weapon Keywords</span>
              <div class="keyword-picker weapon-keyword-picker"></div>
            </div>
            <div class="weapon-actions">
              <button class="remove-weapon-button" type="button" ${weaponProfiles.length === 1 ? "disabled" : ""} aria-label="Remove weapon ${index + 1}">x</button>
            </div>
          </div>
        </div>
      `,
    )
    .join("");

  root.querySelectorAll(".weapon-row").forEach((row) => {
    const weapon = weaponProfiles.find((entry) => entry.id === row.dataset.weaponId);
    if (!weapon) return;
    row.querySelector(".weapon-name").addEventListener("input", (event) => {
      weapon.name = event.target.value;
      updateResult();
    });
    row.querySelector(".weapon-range").addEventListener("change", (event) => {
      weapon.range = event.target.value;
      updateResult();
    });
    row.querySelector(".weapon-ap").addEventListener("input", (event) => {
      weapon.ap = clamp(num(event.target.value), 0, 5);
      event.target.value = String(weapon.ap);
      updateResult();
    });
    row.querySelector(".remove-weapon-button").addEventListener("click", () => {
      weaponProfiles = weaponProfiles.filter((entry) => entry.id !== weapon.id);
      renderWeaponRows(keywords);
      updateResult();
    });
    setupWeaponKeywordPicker(row.querySelector(".weapon-keyword-picker"), weapon, keywords);
  });
}

function setupWeaponKeywordPicker(container, weapon, keywords) {
  container.innerHTML = `
    <div class="selected-keywords" aria-live="polite"></div>
    <input class="keyword-search" type="search" autocomplete="off" placeholder="Search keywords" aria-label="Search weapon keywords" />
    <div class="keyword-options" hidden></div>
  `;
  const selected = container.querySelector(".selected-keywords");
  const search = container.querySelector(".keyword-search");
  const options = container.querySelector(".keyword-options");

  search.addEventListener("focus", () => renderWeaponKeywordOptions(container, weapon, keywords, true));
  search.addEventListener("input", () => renderWeaponKeywordOptions(container, weapon, keywords, true));
  selected.addEventListener("click", () => {
    renderWeaponKeywordOptions(container, weapon, keywords, true);
    search.focus();
  });
  options.addEventListener("click", (event) => {
    const button = event.target.closest("[data-keyword]");
    if (!button) return;
    weapon.keywords.push(button.dataset.keyword);
    search.value = "";
    renderWeaponKeywordPicker(container, weapon, keywords, true);
    updateResult();
    search.focus();
  });

  renderWeaponKeywordPicker(container, weapon, keywords);
}

function renderKeywordPicker(container, key, keywords, keepOpen = false) {
  const selected = container.querySelector(".selected-keywords");
  selected.innerHTML = selectedKeywords[key].length
    ? selectedKeywords[key]
        .map((keyword, index) => `
          <span class="keyword-chip">
            ${escapeHtml(keyword)}
            <button type="button" aria-label="Remove ${escapeHtml(keyword)}" data-remove-index="${index}">x</button>
          </span>
        `)
        .join("")
    : `<span class="keyword-placeholder">No keywords selected</span>`;

  selected.querySelectorAll("[data-remove-index]").forEach((button) => {
    button.addEventListener("click", () => {
      selectedKeywords[key].splice(Number(button.dataset.removeIndex), 1);
      renderKeywordPicker(container, key, keywords);
      updateResult();
    });
  });
  renderKeywordOptions(container, key, keywords, keepOpen);
}

function renderWeaponKeywordPicker(container, weapon, keywords, keepOpen = false) {
  const selected = container.querySelector(".selected-keywords");
  selected.innerHTML = weapon.keywords.length
    ? weapon.keywords
        .map((keyword, index) => `
          <span class="keyword-chip">
            ${escapeHtml(keyword)}
            <button type="button" aria-label="Remove ${escapeHtml(keyword)}" data-remove-index="${index}">x</button>
          </span>
        `)
        .join("")
    : `<span class="keyword-placeholder">No keywords selected</span>`;

  selected.querySelectorAll("[data-remove-index]").forEach((button) => {
    button.addEventListener("click", () => {
      weapon.keywords.splice(Number(button.dataset.removeIndex), 1);
      renderWeaponKeywordPicker(container, weapon, keywords);
      updateResult();
    });
  });
  renderWeaponKeywordOptions(container, weapon, keywords, keepOpen);
}

function renderKeywordOptions(container, key, keywords, show) {
  const search = container.querySelector(".keyword-search");
  const options = container.querySelector(".keyword-options");
  const query = normalizeKey(search.value);
  const selected = new Set(selectedKeywords[key].map(normalizeKey));
  const matches = keywords
    .filter((keyword) => !selected.has(normalizeKey(keyword)))
    .filter((keyword) => !query || normalizeKey(keyword).includes(query));
  options.innerHTML = matches
    .map((keyword) => `<button class="keyword-option" type="button" data-keyword="${escapeHtml(keyword)}">${escapeHtml(keyword)}</button>`)
    .join("");
  options.hidden = !show || matches.length === 0;
}

function renderWeaponKeywordOptions(container, weapon, keywords, show) {
  const search = container.querySelector(".keyword-search");
  const options = container.querySelector(".keyword-options");
  const query = normalizeKey(search.value);
  const selected = new Set(weapon.keywords.map(normalizeKey));
  const matches = keywords
    .filter((keyword) => !selected.has(normalizeKey(keyword)))
    .filter((keyword) => !query || normalizeKey(keyword).includes(query));
  options.innerHTML = matches
    .map((keyword) => `<button class="keyword-option" type="button" data-keyword="${escapeHtml(keyword)}">${escapeHtml(keyword)}</button>`)
    .join("");
  options.hidden = !show || matches.length === 0;
}

function updateSpecialRulesVisibility() {
  const section = el("specialRulesSection");
  if (!section) return;
  const allowed = ["Leader", "Legend"].includes(el("role").value);
  section.classList.toggle("special-rules-inactive", !allowed);
  const search = section.querySelector(".keyword-search");
  if (search) search.disabled = !allowed;
}

function enforceNumberLimits() {
  form.querySelectorAll('input[type="number"]').forEach((input) => {
    if (input.value === "") return;
    const value = Number(input.value);
    if (!Number.isFinite(value)) return;
    const min = input.min === "" ? -Infinity : Number(input.min);
    const max = input.max === "" ? Infinity : Number(input.max);
    if (value < min) input.value = String(min);
    if (value > max) input.value = String(max);
  });
}

function resetForm() {
  form.reset();
  selectedKeywords.model = [];
  selectedKeywords.specialRules = [];
  renderKeywordPicker(el("modelKeywordPicker"), "model", model.keywordCatalog?.unit || []);
  renderKeywordPicker(el("specialRulePicker"), "specialRules", model.keywordCatalog?.specialRules || []);
  updateSpecialRulesVisibility();
  weaponProfiles = [makeWeaponProfile()];
  renderWeaponRows(model.keywordCatalog?.weapon || []);
  el("qty").value = 1;
  el("spAdvance").value = 1;
  el("spSprint").value = 2;
  el("ra").value = 5;
  el("fi").value = 5;
  el("sv").value = 5;
  el("ar").value = 0;
  el("hp").value = 1;
  el("sz").value = 1;
  el("manualAdjustment").value = 0;
  updateResult();
}

async function loadModel() {
  const [metaResponse, baseRows, multiplierRows, roundingRows, vpRows] = await Promise.all([
    fetch(MODEL_PATHS.meta),
    loadCsv(MODEL_PATHS.base),
    loadCsv(MODEL_PATHS.multiplier),
    loadCsv(MODEL_PATHS.rounding),
    loadCsv(MODEL_PATHS.vp),
  ]);
  if (!metaResponse.ok) throw new Error("Could not load model metadata");
  const meta = await metaResponse.json();
  model = {
    meta,
    base: processPack(baseRows),
    multiplier: processPack(multiplierRows),
    rounding: processPack(roundingRows),
    vp: processPack(vpRows),
  };
  populateControls(meta);
  statusEl.value = "Ready";
  renderArmyList();
  updateResult();
}

form.addEventListener("input", updateResult);
form.addEventListener("change", updateResult);
el("reset").addEventListener("click", resetForm);
el("addWeapon").addEventListener("click", () => {
  if (!model) return;
  if (weaponProfiles.length >= 4) return;
  weaponProfiles.push(makeWeaponProfile());
  renderWeaponRows(model.keywordCatalog?.weapon || []);
  updateResult();
});
el("addUnitToArmy").addEventListener("click", addCurrentUnitToArmy);
el("clearArmy").addEventListener("click", () => {
  armyUnits = [];
  renderArmyList();
});
el("printArmy").addEventListener("click", () => window.print());
el("exportArmy").addEventListener("click", exportArmyTemplate);
el("importArmyButton").addEventListener("click", () => importArmyFileEl.click());
importArmyFileEl.addEventListener("change", () => importArmyTemplate(importArmyFileEl.files?.[0]).catch((error) => {
  console.error(error);
  statusEl.value = "Template failed to load";
}));
armyListEl.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-action]");
  const row = event.target.closest(".army-row");
  if (!button || !row) return;
  const unit = armyUnits.find((entry) => entry.id === row.dataset.unitId);
  if (!unit) return;
  if (button.dataset.action === "remove") {
    armyUnits = armyUnits.filter((entry) => entry.id !== unit.id);
    renderArmyList();
  }
  if (button.dataset.action === "edit") {
    loadUnitIntoForm(unit);
  }
});

loadModel().catch((error) => {
  console.error(error);
  statusEl.value = "Model failed to load";
  pointsEl.value = "!";
  pointsEl.textContent = "!";
  vpOutputEl.value = "!";
  vpOutputEl.textContent = "!";
});

document.addEventListener("click", (event) => {
  document.querySelectorAll(".keyword-picker").forEach((picker) => {
    if (!picker.contains(event.target)) {
      const options = picker.querySelector(".keyword-options");
      if (options) options.hidden = true;
    }
  });
});
