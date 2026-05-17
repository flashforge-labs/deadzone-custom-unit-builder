const MODEL_PATHS = {
  meta: "model/model_meta.json",
  base: "model/base_model.csv",
  multiplier: "model/multiplier_model.csv",
  rounding: "model/rounding_model.csv",
};

const el = (id) => document.getElementById(id);
const statusEl = el("status");
const pointsEl = el("points");
const continuousEl = el("continuous");
const nearestEl = el("nearest");
const roundProbabilityEl = el("roundProbability");
const summaryEl = el("unit-summary");
const form = el("unit-form");

let model = null;

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];
    if (quoted) {
      if (char === '"' && next === '"') {
        field += '"';
        i += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (char !== "\r") {
      field += char;
    }
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  const headers = rows.shift();
  return rows
    .filter((items) => items.some((value) => value !== ""))
    .map((items) => Object.fromEntries(headers.map((key, index) => [key, items[index] ?? ""])));
}

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

function hasKeyword(profile, keyword) {
  return profile.keywordSet.has(normalizeKey(keyword));
}

function hasAnyKeyword(profile, keywords) {
  return keywords.some((keyword) => hasKeyword(profile, keyword));
}

function scoreStat(value) {
  return value > 0 ? 9 - value : 0;
}

function processPack(rows) {
  return {
    numeric: rows
      .filter((row) => row.FeatureType === "numeric")
      .map((row) => ({
        feature: row.Feature,
        coefficient: num(row.Coefficient),
        median: num(row.Median),
        mean: num(row.Mean),
        scale: num(row.Scale, 1) || 1,
      })),
    simple: rows
      .filter((row) => ["binary", "keyword", "categorical"].includes(row.FeatureType))
      .map((row) => ({ feature: row.Feature, coefficient: num(row.Coefficient) })),
    interactions: rows
      .filter((row) => row.FeatureType === "interaction")
      .map((row) => ({
        items: String(row.Items || "").split(" | ").filter(Boolean),
        coefficient: num(row.Coefficient),
      })),
  };
}

function readProfile() {
  const modelKeywords = splitKeywords(el("modelKeywords").value);
  const weaponKeywords = splitKeywords(el("weaponKeywords").value);
  const allKeywords = [...modelKeywords, ...weaponKeywords];
  return {
    unitName: el("unitName").value.trim(),
    role: el("role").value,
    baseSize: el("baseSize").value,
    VP: num(el("vp").value),
    SP_Advance: num(el("spAdvance").value),
    SP_Sprint: num(el("spSprint").value),
    RA: num(el("ra").value),
    FI: num(el("fi").value),
    SV: num(el("sv").value),
    AR: num(el("ar").value),
    HP: num(el("hp").value),
    SZ: num(el("sz").value),
    MaxRange: num(el("maxRange").value),
    MaxAP: num(el("maxAP").value),
    WeaponCount: num(el("weaponCount").value),
    RangedWeaponCount: num(el("rangedWeaponCount").value),
    StrongRangedWeaponCount: num(el("strongRangedWeaponCount").value),
    HasMeleeInput: el("hasMelee").checked,
    TacticianValue: num(el("tacticianValue").value),
    ReconScore: num(el("reconScore").value),
    CommandValue: num(el("commandValue").value),
    ManualAdjustment: num(el("manualAdjustment").value),
    modelKeywords,
    weaponKeywords,
    allKeywords,
    keywordSet: new Set(allKeywords.map(normalizeKey)),
  };
}

function baseNumeric(profile) {
  return {
    SP_Advance: profile.SP_Advance,
    SP_Sprint: profile.SP_Sprint,
    RA_Score: scoreStat(profile.RA),
    FI_Score: scoreStat(profile.FI),
    SV_Score: scoreStat(profile.SV),
    AR: profile.AR,
    HP: profile.HP,
    SZ: profile.SZ,
    VP: profile.VP,
    MaxRange: profile.MaxRange,
    MaxAP: profile.MaxAP,
    WeaponCount: profile.WeaponCount,
    RangedWeaponCount: profile.RangedWeaponCount,
    StrongRangedWeaponCount: profile.StrongRangedWeaponCount,
    TacticianValue: profile.TacticianValue,
    ReconScore: profile.ReconScore,
    CommandValue: profile.CommandValue,
  };
}

function binaryFeatures(profile, predictionForCostFlags = null) {
  const active = new Set();
  const role = profile.role;
  const hasRanged = profile.MaxRange > 0 || profile.RangedWeaponCount > 0;
  const hasMelee = profile.HasMeleeInput;
  const hasHeavy = hasKeyword(profile, "Heavy");
  const hasBlastOrFrag = hasAnyKeyword(profile, ["Blast", "Frag", "Frag(3)", "Explosive"]);
  const hasIndirect = hasKeyword(profile, "Indirect");
  const hasSuppression = hasKeyword(profile, "Suppression");
  const hasSniper = hasKeyword(profile, "Sniper");
  const hasRapidFire = hasKeyword(profile, "Rapid Fire");
  const hasWeightOfFire = hasKeyword(profile, "Weight of Fire(1)");
  const hasFlight = hasAnyKeyword(profile, ["Flight", "Aerial Deployment"]);
  const hasTactician = hasKeyword(profile, "Tactician") || profile.TacticianValue > 0;
  const hasCommunicationsRelay = hasKeyword(profile, "Communications Relay");
  const hasCombatTeamTraining = hasKeyword(profile, "Combat Team Training");
  const hasCommandKeyword = hasTactician || profile.CommandValue > 0 || hasKeyword(profile, "Command");
  const hasSpecialOrder = hasKeyword(profile, "Special Order");
  const hasFireControl = hasKeyword(profile, "Fire Control");
  const hasRampage = hasKeyword(profile, "Rampage");
  const supportAura = hasTactician || hasAnyKeyword(profile, [
    "Medic",
    "Engineer",
    "Communications Relay",
    "Combat Team Training",
    "Shield Generator",
    "Defender Shield",
  ]);
  const durable = profile.AR >= 2 || profile.HP >= 3;
  const armouredDurable = profile.AR >= 2 && profile.HP >= 2;
  const longRangeAP = profile.MaxRange >= 8 && profile.MaxAP >= 2;
  const fastMelee = profile.SP_Advance >= 2 && profile.FI > 0 && profile.FI <= 4;
  const eliteAllRounder = profile.RA > 0 && profile.RA <= 4 && profile.FI > 0 && profile.FI <= 4 && profile.SV > 0 && profile.SV <= 4 && profile.AR >= 1;
  const duplicateRanged = profile.RangedWeaponCount >= 2;
  const highVP = profile.VP >= 2;
  const highValue = highVP || role === "Legend" || role === "Support" || profile.HP >= 4;
  const mobility = hasFlight || hasAnyKeyword(profile, ["Agile", "Scout", "Teleport", "Jump Pack", "Bike"]);
  const dropSuit = hasKeyword(profile, "Drop Suit");
  const deployment = dropSuit || hasAnyKeyword(profile, ["Aerial Deployment", "Scout", "Infiltrate"]);
  const specialist = ["Specialist", "Troop Specialist", "Specialist Troop"].includes(role);
  const troop = ["Troop", "Troop Specialist", "Specialist Troop"].includes(role);

  const add = (condition, feature) => {
    if (condition) active.add(feature);
  };

  add(hasMelee, "HasMelee");
  add(hasRanged, "HasRangedWeapon");
  add(hasHeavy, "HasHeavyWeapon");
  add(hasBlastOrFrag, "HasBlastOrFrag");
  add(hasIndirect, "HasIndirect");
  add(hasSuppression, "HasSuppression");
  add(hasSniper, "HasSniper");
  add(hasRapidFire, "HasRapidFire");
  add(hasWeightOfFire, "HasWeightOfFire");
  add(fastMelee, "FastMelee");
  add(durable, "Durable");
  add(armouredDurable, "ArmouredDurable");
  add(longRangeAP, "LongRangeAP");
  add(hasFlight && hasRanged, "FlyingShooter");
  add(supportAura, "SupportAura");
  add(eliteAllRounder, "EliteAllRounder");
  add(role === "Leader", "IsLeader");
  add(role === "Legend", "IsLegend");
  add(role === "Support", "IsSupport");
  add(specialist, "IsSpecialist");
  add(troop, "IsTroop");
  add(hasTactician, "HasTactician");
  add(hasCommunicationsRelay, "HasCommunicationsRelay");
  add(hasCombatTeamTraining, "HasCombatTeamTraining");
  add(hasCommandKeyword, "HasCommandKeyword");
  add(hasSpecialOrder, "HasSpecialOrder");
  add(hasFireControl, "HasFireControl");
  add(hasRampage, "HasRampage");
  add(duplicateRanged, "HasDuplicateRangedWeapon");
  add(hasFireControl && profile.RangedWeaponCount >= 2, "FireControlMultiWeapon");
  add(hasFireControl && profile.RangedWeaponCount >= 2 && profile.StrongRangedWeaponCount >= 1, "FireControlStrongMultiWeapon");
  add(hasFireControl && duplicateRanged, "FireControlDuplicateRangedWeapon");
  add(hasCommandKeyword && supportAura, "CommandSupport");
  add(role === "Leader" && hasCommandKeyword, "RoleCommandLeader");
  add(role === "Support" && hasHeavy, "RoleHeavySupport");
  add(role === "Legend" || hasKeyword(profile, "Named"), "NamedOrLegend");
  add(hasKeyword(profile, "Secret Mission"), "SecretMissionTarget");
  add(highVP, "HighVP");
  add(highValue, "HighValueTarget");
  add(mobility, "HasMobilityKeyword");
  add(dropSuit, "HasDropSuit");
  add(deployment, "HasDeploymentTrick");
  add(troop && profile.VP >= 1 && profile.SP_Advance >= 2, "ObjectiveRunner");
  add(mobility && hasRanged, "MobileShooter");
  add(mobility && hasMelee, "MobileMeleeThreat");
  add(specialist && deployment, "RoleDeploymentSpecialist");
  add(deployment && hasMelee, "DeploymentMeleeThreat");
  add(deployment && hasRanged, "DeploymentShooter");
  add(hasRampage && hasMelee && profile.RangedWeaponCount === 0, "RampageMeleeOnly");
  add(hasRampage && mobility && hasMelee, "RampageMobileMelee");
  add(hasRampage && durable, "RampageDurable");
  add(hasRampage && profile.FI > 0 && profile.FI <= 4 && profile.AR >= 1, "RampageEliteMelee");
  add(hasFireControl && longRangeAP, "FireControlLongRangeAP");
  add(hasFireControl && hasSuppression, "FireControlSuppression");
  add(hasFireControl && (hasRapidFire || hasWeightOfFire), "FireControlRapidWeight");
  add(hasIndirect && hasBlastOrFrag, "IndirectBlastFrag");
  add(hasIndirect && hasSuppression, "IndirectSuppression");
  add(hasTactician && durable, "TacticianDurable");
  add(supportAura && durable, "SupportAuraDurable");

  if (predictionForCostFlags !== null) {
    const keywordCount = profile.allKeywords.length;
    add(predictionForCostFlags < 7, "PredLT7");
    add(predictionForCostFlags < 8, "PredLT8");
    add(predictionForCostFlags < 9, "PredLT9");
    add(predictionForCostFlags < 10, "PredLT10");
    add(predictionForCostFlags < 11, "PredLT11");
    add(predictionForCostFlags >= 13, "PredGE13");
    add(predictionForCostFlags >= 16, "PredGE16");
    add(predictionForCostFlags >= 20, "PredGE20");
    add(keywordCount <= 2, "SimpleProfile");
    add(keywordCount >= 4, "ComplexProfile");
    add(role === "Troop" && predictionForCostFlags <= 11 && keywordCount <= 2, "CheapSimpleTroop");
    add(role === "Troop" && predictionForCostFlags >= 13, "HighCostTroop");
  }

  return active;
}

function activeFeatures(profile, predictionForCostFlags = null) {
  const active = binaryFeatures(profile, predictionForCostFlags);
  active.add(`Role_${profile.role}`);
  active.add(`BaseSize_${profile.baseSize}`);
  for (const keyword of profile.allKeywords) {
    active.add(`KW_${keyword}`);
  }
  return active;
}

function contribution(pack, values, active, intercept) {
  let total = intercept;
  for (const row of pack.numeric) {
    const value = values[row.feature] ?? row.median;
    total += ((value - row.mean) / row.scale) * row.coefficient;
  }
  for (const row of pack.simple) {
    if (active.has(row.feature)) total += row.coefficient;
  }
  for (const row of pack.interactions) {
    if (row.items.every((item) => active.has(item))) total += row.coefficient;
  }
  return total;
}

function multiplierNumeric(profile, basePrediction) {
  const base = baseNumeric(profile);
  const keywordCount = profile.allKeywords.length;
  const statQuality = base.RA_Score + base.FI_Score + base.SV_Score + profile.SP_Advance + profile.SP_Sprint + profile.AR + profile.HP + profile.SZ;
  const combatQuality = base.RA_Score + base.FI_Score + base.SV_Score + profile.AR + profile.HP + profile.MaxRange + profile.MaxAP + profile.StrongRangedWeaponCount;
  return {
    BasePrediction: basePrediction,
    LogBasePrediction: Math.log(Math.max(0.1, basePrediction)),
    KeywordCount: keywordCount,
    ModelKeywordCount: profile.modelKeywords.length,
    WeaponKeywordCount: profile.weaponKeywords.length,
    StatQuality: statQuality,
    CombatQuality: combatQuality,
    RA_Score: base.RA_Score,
    FI_Score: base.FI_Score,
    SV_Score: base.SV_Score,
    SP_Advance: profile.SP_Advance,
    SP_Sprint: profile.SP_Sprint,
    AR: profile.AR,
    HP: profile.HP,
    SZ: profile.SZ,
    MaxRange: profile.MaxRange,
    MaxAP: profile.MaxAP,
    WeaponCount: profile.WeaponCount,
    RangedWeaponCount: profile.RangedWeaponCount,
    StrongRangedWeaponCount: profile.StrongRangedWeaponCount,
  };
}

function roundingNumeric(profile, continuousPrediction) {
  const lower = Math.floor(continuousPrediction);
  const upper = Math.ceil(continuousPrediction);
  return {
    ...multiplierNumeric(profile, continuousPrediction),
    ContinuousPrediction: continuousPrediction,
    LowerInteger: lower,
    UpperInteger: upper,
    FractionalPart: continuousPrediction - lower,
    DistanceToLower: continuousPrediction - lower,
    DistanceToUpper: upper - continuousPrediction,
  };
}

function calculate(profile) {
  const baseActive = activeFeatures(profile);
  const rawBase = contribution(model.base, baseNumeric(profile), baseActive, model.meta.intercept);
  const multActive = activeFeatures(profile, rawBase);
  const logMultiplier = contribution(model.multiplier, multiplierNumeric(profile, rawBase), multActive, model.meta.multiplier.intercept);
  const multiplier = clamp(Math.exp(logMultiplier), model.meta.multiplier.min_multiplier, model.meta.multiplier.max_multiplier);
  const floored = Math.max(model.meta.role_cost_floors[profile.role] ?? 0, rawBase * multiplier);
  const roundingActive = activeFeatures(profile, floored);
  const roundScore = contribution(model.rounding, roundingNumeric(profile, floored), roundingActive, model.meta.rounding.intercept);
  const roundProbability = 1 / (1 + Math.exp(-roundScore));
  const rounded = roundProbability >= model.meta.rounding.threshold ? Math.ceil(floored) : Math.floor(floored);
  const final = Math.max(1, Math.round(rounded + profile.ManualAdjustment));
  return {
    rawBase,
    multiplier,
    continuous: floored,
    nearest: Math.round(floored),
    roundProbability,
    rounded,
    final,
  };
}

function updateResult() {
  if (!model) return;
  const profile = readProfile();
  if (!profile.role || !profile.baseSize) return;
  const result = calculate(profile);
  pointsEl.value = result.final;
  continuousEl.textContent = result.continuous.toFixed(2);
  nearestEl.textContent = result.nearest.toString();
  roundProbabilityEl.textContent = `${Math.round(result.roundProbability * 100)}%`;
  const label = profile.unitName || "Custom unit";
  summaryEl.textContent = `${label} · ${profile.role} · ${profile.baseSize}`;
}

function populateControls(meta) {
  const roles = meta.categorical_values.Role || [];
  const baseSizes = meta.categorical_values.BaseSize || [];
  el("role").innerHTML = roles.map((role) => `<option value="${role}">${role}</option>`).join("");
  el("baseSize").innerHTML = baseSizes.map((size) => `<option value="${size}">${size}</option>`).join("");
  if (roles.includes("Troop")) el("role").value = "Troop";
  if (baseSizes.includes("25mm")) el("baseSize").value = "25mm";

  const keywordList = el("keyword-list");
  keywordList.innerHTML = (meta.keyword_tags || [])
    .map((keyword) => `<option value="${keyword}"></option>`)
    .join("");
  el("modelKeywords").setAttribute("list", "keyword-list");
  el("weaponKeywords").setAttribute("list", "keyword-list");
}

function resetForm() {
  form.reset();
  el("vp").value = 1;
  el("spAdvance").value = 1;
  el("spSprint").value = 2;
  el("ra").value = 5;
  el("fi").value = 5;
  el("sv").value = 5;
  el("ar").value = 0;
  el("hp").value = 1;
  el("sz").value = 1;
  el("maxRange").value = 6;
  el("weaponCount").value = 1;
  el("rangedWeaponCount").value = 1;
  el("manualAdjustment").value = 0;
  updateResult();
}

async function loadModel() {
  const [metaResponse, baseRows, multiplierRows, roundingRows] = await Promise.all([
    fetch(MODEL_PATHS.meta),
    loadCsv(MODEL_PATHS.base),
    loadCsv(MODEL_PATHS.multiplier),
    loadCsv(MODEL_PATHS.rounding),
  ]);
  if (!metaResponse.ok) throw new Error("Could not load model metadata");
  const meta = await metaResponse.json();
  model = {
    meta,
    base: processPack(baseRows),
    multiplier: processPack(multiplierRows),
    rounding: processPack(roundingRows),
  };
  populateControls(meta);
  statusEl.value = "Ready";
  updateResult();
}

form.addEventListener("input", updateResult);
form.addEventListener("change", updateResult);
el("reset").addEventListener("click", resetForm);

loadModel().catch((error) => {
  console.error(error);
  statusEl.value = "Model failed to load";
  pointsEl.value = "!";
  summaryEl.textContent = "The model files could not be loaded.";
});
