import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { buildCalculationProfile, calculateWithModel } from "../model/calculator.js";
import { loadModel } from "./model-io.mjs";

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));
const defaultFixturePath = resolve(rootDir, "..", "deadzone-points-builder", "data", "prebuilt_army_lists.json");
const fixturePath = process.argv[2] || defaultFixturePath;

if (!existsSync(fixturePath)) {
  console.error(`Missing prebuilt list fixture file: ${fixturePath}`);
  process.exit(1);
}

const model = await loadModel(rootDir);
const lists = JSON.parse(await readFile(fixturePath, "utf8"));
const specialRuleSurcharge = Number(process.env.SPECIAL_RULE_SURCHARGE || "0");
const rows = [];

for (const list of lists) {
  const unitRows = [];
  let predictedTotal = 0;

  for (const unit of list.units || []) {
    const qty = Number(unit.qty || unit.Qty || 1);
    const profile = buildCalculationProfile({ Qty: qty, ...unit });
    const result = calculateWithModel(model, profile);
    const specialRuleCount = (unit.specialRules || []).length;
    const adjustedCost = result.final + specialRuleSurcharge * specialRuleCount;
    const lineTotal = adjustedCost * qty;
    predictedTotal += lineTotal;
    unitRows.push({
      unitName: unit.unitName,
      role: unit.role,
      qty,
      predicted: result.final,
      specialRuleCount,
      adjustedCost,
      lineTotal,
      vp: result.vp,
    });
  }

  const expectedTotal = Number(list.expectedTotal || 0);
  rows.push({
    listName: list.name,
    sourceStatus: list.sourceStatus || "",
    expectedTotal,
    predictedTotal,
    delta: predictedTotal - expectedTotal,
    deltaPct: expectedTotal ? (predictedTotal - expectedTotal) / expectedTotal : 0,
    unitRows,
  });
}

console.log("Prebuilt army list validation");
if (specialRuleSurcharge) {
  console.log(`Special rule surcharge: +${specialRuleSurcharge} per listed special rule`);
}
for (const row of rows) {
  const sign = row.delta > 0 ? "+" : "";
  console.log(
    `${row.listName}: ${row.predictedTotal} / ${row.expectedTotal} (${sign}${row.delta}, ${(row.deltaPct * 100).toFixed(1)}%)`,
  );
}

const worst = [...rows].sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
console.log("\nWorst lists");
for (const row of worst) {
  const sign = row.delta > 0 ? "+" : "";
  console.log(`- ${row.listName}: ${sign}${row.delta}`);
}
