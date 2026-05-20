export function num(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function normalizeKey(value) {
  return String(value || "").trim().toLowerCase();
}

export function parseCsv(text) {
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

export function processPack(rows) {
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
        support: num(row.Support),
      })),
  };
}

function keywordValue(keywords, prefix) {
  const match = keywords
    .map((keyword) => String(keyword))
    .map((keyword) => keyword.match(new RegExp(`^${prefix}\\((\\d+)`)))
    .find(Boolean);
  return match ? num(match[1]) : 0;
}

function reconScore() {
  return 0;
}

function isWeaponRanged(weapon) {
  return weapon.range !== "CC" && num(weapon.range) > 0;
}

function isStrongRangedWeapon(weapon) {
  if (!isWeaponRanged(weapon)) return false;
  const keywordSet = new Set((weapon.keywords || []).map(normalizeKey));
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

function keywordBase(value) {
  return normalizeKey(value).replace(/\(\s*\d+\+?\s*\)/g, "").trim();
}

function hasKeyword(profile, keyword) {
  return profile.keywordSet.has(normalizeKey(keyword));
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

function scoreStatForBase(value) {
  return value > 0 ? 9 - value : 0;
}

function scoreStatOrZero(value) {
  return value > 0 ? 9 - value : 0;
}

export function buildCalculationProfile(input) {
  const role = input.role || "Troop";
  const modelKeywords = [...(input.modelKeywords || [])];
  const specialRuleKeywords = ["Leader", "Legend"].includes(role) ? [...(input.specialRules || [])] : [];
  const activeWeapons = (input.weapons || []).filter(
    (weapon) => String(weapon.name || "").trim() || weapon.range === "CC" || num(weapon.ap) > 0 || (weapon.keywords || []).length,
  );
  const normalizedWeapons = activeWeapons.map((weapon) => ({
    name: String(weapon.name || ""),
    range: weapon.range === "CC" ? "CC" : String(num(weapon.range)),
    ap: num(weapon.ap),
    keywords: [...(weapon.keywords || [])],
  }));
  const weaponKeywords = normalizedWeapons.flatMap((weapon) => weapon.keywords);
  const rangedWeapons = normalizedWeapons.filter(isWeaponRanged);
  const strongRangedWeapons = rangedWeapons.filter(isStrongRangedWeapon);
  const meleeWeapons = normalizedWeapons.filter((weapon) => weapon.range === "CC");
  const allKeywords = [...modelKeywords, ...weaponKeywords, ...specialRuleKeywords];
  const tacticianValue = keywordValue(allKeywords, "Tactician");
  const reconValue = reconScore(allKeywords);
  const commandValue = tacticianValue
    + (allKeywords.some((keyword) => normalizeKey(keyword) === "communications relay") ? 1 : 0)
    + (allKeywords.some((keyword) => normalizeKey(keyword) === "combat team training") ? 1 : 0);

  return {
    unitName: input.unitName || "",
    role,
    baseSize: input.baseSize || "25mm",
    Qty: num(input.Qty, 1),
    SP_Advance: num(input.SP_Advance),
    SP_Sprint: num(input.SP_Sprint),
    RA: num(input.RA),
    FI: num(input.FI),
    SV: num(input.SV),
    AR: num(input.AR),
    HP: num(input.HP),
    SZ: num(input.SZ),
    MaxRange: rangedWeapons.length ? Math.max(...rangedWeapons.map((weapon) => num(weapon.range))) : 0,
    MaxAP: normalizedWeapons.length ? Math.max(...normalizedWeapons.map((weapon) => num(weapon.ap))) : 0,
    WeaponCount: normalizedWeapons.length,
    RangedWeaponCount: rangedWeapons.length,
    StrongRangedWeaponCount: strongRangedWeapons.length,
    HasMeleeInput: meleeWeapons.length > 0,
    TacticianValue: tacticianValue,
    ReconScore: reconValue,
    CommandValue: commandValue,
    ManualAdjustment: num(input.ManualAdjustment),
    notes: input.notes || "",
    weapons: normalizedWeapons,
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
    RA_Score: scoreStatForBase(profile.RA),
    FI_Score: scoreStatForBase(profile.FI),
    SV_Score: scoreStatForBase(profile.SV),
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

  add(profile.RA > 0, "HasRA");
  add(profile.RA <= 0, "NoRA");
  add(profile.FI > 0, "HasFI");
  add(profile.FI <= 0, "NoFI");
  add(profile.AR > 0, "HasAR");
  add(profile.AR <= 0, "NoAR");
  add(hasMelee, "HasMelee");
  add(hasRanged, "HasRangedWeapon");
  add(hasMelee && !hasRanged, "MeleeOnly");
  add(hasRanged && !hasMelee, "RangedOnly");
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
  const raScore = scoreStatOrZero(profile.RA);
  const fiScore = scoreStatOrZero(profile.FI);
  const svScore = scoreStatOrZero(profile.SV);
  const keywordCount = profile.allKeywords.length;
  const statQuality = raScore + fiScore + svScore + profile.SP_Advance + profile.SP_Sprint + profile.AR + profile.HP + profile.SZ;
  const combatQuality = raScore + fiScore + svScore + profile.AR + profile.HP + profile.MaxRange + profile.MaxAP + profile.StrongRangedWeaponCount;
  return {
    BasePrediction: basePrediction,
    LogBasePrediction: Math.log(Math.max(0.1, basePrediction)),
    KeywordCount: keywordCount,
    ModelKeywordCount: profile.modelKeywords.length,
    WeaponKeywordCount: profile.weaponKeywords.length,
    StatQuality: statQuality,
    CombatQuality: combatQuality,
    RA_Score: raScore,
    FI_Score: fiScore,
    SV_Score: svScore,
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

export function calculateVp(model, profile, result) {
  if (!model.vp || !model.meta.vp) return 1;
  const active = activeFeatures(profile);
  const rawVp = contribution(model.vp, vpNumeric(profile, result), active, model.meta.vp.intercept);
  const minVp = model.meta.vp.min_vp ?? 0;
  const maxVp = model.meta.vp.max_vp ?? 5;
  const roleMinVp = profile.role === "Troop" ? Math.max(1, minVp) : minVp;
  return clamp(Math.round(rawVp), roleMinVp, maxVp);
}

export function calculateWithModel(model, profile) {
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
  const vp = calculateVp(model, profile, {
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
