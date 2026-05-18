import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { buildCalculationProfile, calculateWithModel, num, parseCsv } from "../model/calculator.js";
import { loadModel } from "./model-io.mjs";

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));
const defaultCalibrationPath = resolve(rootDir, "..", "deadzone-points-builder", "data", "calibration_data_clean.csv");
const inputPath = process.argv[2] || defaultCalibrationPath;
const outputPath = process.argv[3] || join(rootDir, "test", "private-parity-fixtures.json");

function splitKeywords(value) {
  return String(value || "")
    .split(/[|,;\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function weaponFromRow(row, index) {
  const name = row[`Weapon${index}Name`] || "";
  const range = row[`Weapon${index}Range`] || "";
  const ap = row[`Weapon${index}AP`] || 0;
  const keywords = splitKeywords(row[`Weapon${index}Keywords`]);
  if (!name && !range && !num(ap) && !keywords.length) return null;
  return {
    name,
    range: num(range) === 0 && String(range).trim() !== "" ? "CC" : String(num(range)),
    ap: num(ap),
    keywords,
  };
}

function inputFromRow(row) {
  const weapons = [1, 2, 3, 4]
    .map((index) => weaponFromRow(row, index))
    .filter(Boolean);
  return {
    unitName: row.UnitName || "",
    role: row.Role || "Troop",
    baseSize: row.BaseSize || "25mm",
    Qty: 1,
    SP_Advance: num(row.SP_Advance),
    SP_Sprint: num(row.SP_Sprint),
    RA: num(row.RA),
    FI: num(row.FI),
    SV: num(row.SV),
    AR: num(row.AR),
    HP: num(row.HP),
    SZ: num(row.SZ),
    ManualAdjustment: 0,
    modelKeywords: splitKeywords(row.ModelKeywords),
    specialRules: splitKeywords(row.EquipmentText),
    weapons,
  };
}

const model = await loadModel(rootDir);
const rows = parseCsv(await readFile(inputPath, "utf8"));
const fixtures = rows.map((row, index) => {
  const input = inputFromRow(row);
  const result = calculateWithModel(model, buildCalculationProfile(input));
  return {
    id: row.SourceNotes?.match(/ProfileID:\s*([^|]+)/)?.[1]?.trim() || `row-${index + 1}`,
    name: row.UnitName || `Row ${index + 1}`,
    input,
    expected: {
      final: result.final,
      vp: result.vp,
      continuous: result.continuous,
      rawBase: result.rawBase,
      multiplier: result.multiplier,
    },
  };
});

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(fixtures, null, 2)}\n`);
console.log(`Wrote ${fixtures.length} parity fixtures to ${outputPath}`);
