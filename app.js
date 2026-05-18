import { leaderRules } from "./model/leader_rules.js";

const MODEL_PATHS = {
  meta: "model/model_meta.json",
  base: "model/base_model.csv",
  multiplier: "model/multiplier_model.csv",
  rounding: "model/rounding_model.csv",
  vp: "model/vp_model.csv",
};
const MODEL_BUNDLE_PATH = "./model/model_bundle.js";

const el = (id) => document.getElementById(id);
const statusEl = el("status");
const pointsEl = el("points");
const vpOutputEl = el("vpOutput");
const continuousEl = el("continuous");
const nearestEl = el("nearest");
const roundProbabilityEl = el("roundProbability");
const form = el("unit-form");

let model = null;
const selectedKeywords = {
  model: [],
  specialRules: [],
};
let weaponProfiles = [];
let weaponIdCounter = 0;

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

function keywordValue(keywords, prefix) {
  const match = keywords
    .map((keyword) => String(keyword))
    .map((keyword) => keyword.match(new RegExp(`^${prefix}\\((\\d+)`)))
    .find(Boolean);
  return match ? num(match[1]) : 0;
}

function reconScore(keywords) {
  return 0;
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

function isWeaponRanged(weapon) {
  return weapon.range !== "CC" && num(weapon.range) > 0;
}

function isStrongRangedWeapon(weapon) {
  if (!isWeaponRanged(weapon)) return false;
  const keywordSet = new Set(weapon.keywords.map(normalizeKey));
  if (num(weapon.ap) >= 2) return true;
  return [
    "heavy",
    "sniper",
    "suppression",
    "rapid fire",
    "weight of fire(1)",
    "frag(3)",
    "frag",
    "explosive",
    "indirect",
    "fire(1)",
  ].some((keyword) => keywordSet.has(keyword));
}

function hasKeyword(profile, keyword) {
  return profile.keywordSet.has(normalizeKey(keyword));
}

function keywordBase(value) {
  return normalizeKey(value).replace(/\(\s*\d+\+?\s*\)/g, "").trim();
}

function hasKeywordBase(profile, keyword) {
  const wanted = keywordBase(keyword);
  return profile.allKeywords.some((value) => keywordBase(value) === wanted);
}

function hasAnyKeyword(profile, keywords) {
  return keywords.some((keyword) => hasKeyword(profile, keyword));
}

function hasAnyKeywordBase(profile, keywords) {
  return keywords.some((keyword) => hasKeywordBase(profile, keyword));
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
  const modelKeywords = [...selectedKeywords.model];
  const specialRuleKeywords = [...selectedKeywords.specialRules];
  const activeWeapons = weaponProfiles.filter((weapon) => weapon.name.trim() || weapon.range === "CC" || num(weapon.ap) > 0 || weapon.keywords.length);
  const weaponKeywords = activeWeapons.flatMap((weapon) => weapon.keywords);
  const rangedWeapons = activeWeapons.filter(isWeaponRanged);
  const strongRangedWeapons = rangedWeapons.filter(isStrongRangedWeapon);
  const meleeWeapons = activeWeapons.filter((weapon) => weapon.range === "CC");
  const allKeywords = [...modelKeywords, ...weaponKeywords, ...specialRuleKeywords];
  const tacticianValue = keywordValue(allKeywords, "Tactician");
  const reconValue = reconScore(allKeywords);
  const commandValue = tacticianValue
    + (allKeywords.some((keyword) => normalizeKey(keyword) === "communications relay") ? 1 : 0)
    + (allKeywords.some((keyword) => normalizeKey(keyword) === "combat team training") ? 1 : 0);
  return {
    unitName: el("unitName").value.trim(),
    role: el("role").value,
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
    MaxRange: rangedWeapons.length ? Math.max(...rangedWeapons.map((weapon) => num(weapon.range))) : 0,
    MaxAP: activeWeapons.length ? Math.max(...activeWeapons.map((weapon) => num(weapon.ap))) : 0,
    WeaponCount: activeWeapons.length,
    RangedWeaponCount: rangedWeapons.length,
    StrongRangedWeaponCount: strongRangedWeapons.length,
    HasMeleeInput: meleeWeapons.length > 0,
    TacticianValue: tacticianValue,
    ReconScore: reconValue,
    CommandValue: commandValue,
    ManualAdjustment: num(el("manualAdjustment").value),
    weapons: activeWeapons,
    modelKeywords,
    specialRules: specialRuleKeywords,
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
  const hasBlastOrFrag = hasAnyKeywordBase(profile, ["Blast", "Frag"]);
  const hasIndirect = hasKeyword(profile, "Indirect");
  const hasSuppression = hasKeyword(profile, "Suppression");
  const hasSniper = hasKeywordBase(profile, "Sniper");
  const hasRapidFire = hasKeyword(profile, "Rapid Fire");
  const hasWeightOfFire = hasKeywordBase(profile, "Weight of Fire");
  const hasFlight = hasKeyword(profile, "Flight");
  const hasTactician = hasKeyword(profile, "Tactician") || profile.TacticianValue > 0;
  const hasCommunicationsRelay = hasKeyword(profile, "Communications Relay");
  const hasCombatTeamTraining = hasKeyword(profile, "Combat Team Training");
  const hasCommandKeyword = hasTactician || profile.CommandValue > 0 || hasKeyword(profile, "Command");
  const hasSpecialOrder = profile.specialRules.length > 0 || hasKeyword(profile, "Special Order");
  const hasFireControl = hasKeyword(profile, "Fire Control");
  const hasRampage = hasKeyword(profile, "Rampage");
  const supportAura = hasTactician || hasAnyKeywordBase(profile, [
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
  const mobility = hasFlight || hasAnyKeyword(profile, ["Agile", "Scout", "Teleport", "Jump Pack", "Bike"]);
  const objectiveRunner = mobility && profile.SZ <= 2 && !["Leader", "Legend", "Support"].includes(role);
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
  add(hasFireControl && profile.RangedWeaponCount >= 2 && profile.StrongRangedWeaponCount >= 2, "FireControlStrongMultiWeapon");
  add(hasFireControl && duplicateRanged, "FireControlDuplicateRangedWeapon");
  add(hasCommandKeyword || hasSpecialOrder, "CommandSupport");
  add((role === "Leader" || role === "Legend") && (hasCommandKeyword || hasSpecialOrder), "RoleCommandLeader");
  add(role === "Support" && hasHeavy, "RoleHeavySupport");
  add(role === "Legend", "NamedOrLegend");
  add(["Leader", "Specialist", "Support"].includes(role), "SecretMissionTarget");
  add(mobility, "HasMobilityKeyword");
  add(dropSuit, "HasDropSuit");
  add(deployment, "HasDeploymentTrick");
  add(objectiveRunner && hasRanged, "MobileShooter");
  add(objectiveRunner && profile.FI > 0 && profile.FI <= 4 && hasMelee, "MobileMeleeThreat");
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

function vpNumeric(profile, result) {
  return {
    ...baseNumeric(profile),
    PredictedCostForVP: result.final,
    PredictedCostContinuousForVP: result.continuous,
    LogPredictedCostForVP: Math.log(Math.max(0.1, result.continuous)),
    KeywordCountForVP: profile.allKeywords.length,
  };
}

function calculateVp(profile, result) {
  if (!model.vp || !model.meta.vp) return 1;
  const active = activeFeatures(profile);
  const rawVp = contribution(model.vp, vpNumeric(profile, result), active, model.meta.vp.intercept);
  const minVp = model.meta.vp.min_vp ?? 0;
  const maxVp = model.meta.vp.max_vp ?? 5;
  return clamp(Math.round(rawVp), minVp, maxVp);
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
  const vp = calculateVp(profile, {
    rawBase,
    multiplier,
    continuous: floored,
    nearest: Math.round(floored),
    roundProbability,
    rounded,
    final,
  });
  return {
    rawBase,
    multiplier,
    continuous: floored,
    nearest: Math.round(floored),
    roundProbability,
    rounded,
    final,
    vp,
  };
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

function populateControls(meta) {
  const roles = meta.categorical_values.Role || [];
  const baseSizes = meta.categorical_values.BaseSize || [];
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
  section.hidden = !["Leader", "Legend"].includes(el("role").value);
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
  let meta;
  let baseRows;
  let multiplierRows;
  let roundingRows;
  let vpRows;
  try {
    const [metaResponse, fetchedBaseRows, fetchedMultiplierRows, fetchedRoundingRows, fetchedVpRows] = await Promise.all([
      fetch(MODEL_PATHS.meta),
      loadCsv(MODEL_PATHS.base),
      loadCsv(MODEL_PATHS.multiplier),
      loadCsv(MODEL_PATHS.rounding),
      loadCsv(MODEL_PATHS.vp),
    ]);
    if (!metaResponse.ok) throw new Error("Could not load model metadata");
    meta = await metaResponse.json();
    baseRows = fetchedBaseRows;
    multiplierRows = fetchedMultiplierRows;
    roundingRows = fetchedRoundingRows;
    vpRows = fetchedVpRows;
  } catch (fetchError) {
    const bundled = await import(MODEL_BUNDLE_PATH);
    meta = bundled.meta;
    baseRows = parseCsv(bundled.baseCsv);
    multiplierRows = parseCsv(bundled.multiplierCsv);
    roundingRows = parseCsv(bundled.roundingCsv);
    vpRows = parseCsv(bundled.vpCsv);
    console.warn("Using bundled model fallback", fetchError);
  }
  model = {
    meta,
    base: processPack(baseRows),
    multiplier: processPack(multiplierRows),
    rounding: processPack(roundingRows),
    vp: processPack(vpRows),
  };
  populateControls(meta);
  statusEl.value = "Ready";
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
