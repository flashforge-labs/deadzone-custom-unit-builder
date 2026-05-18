import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { buildCalculationProfile, calculateWithModel } from "../model/calculator.js";
import { loadModel } from "./model-io.mjs";

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));
const defaultPrivateFixturePath = join(rootDir, "test", "private-parity-fixtures.json");
const defaultSampleFixturePath = join(rootDir, "test", "parity-fixtures.sample.json");
const fixturePath = process.argv[2] || (existsSync(defaultPrivateFixturePath) ? defaultPrivateFixturePath : defaultSampleFixturePath);
const tolerance = Number(process.env.PARITY_TOLERANCE || "0.000001");

if (!existsSync(fixturePath)) {
  console.error(`Missing parity fixture file: ${fixturePath}`);
  console.error("Generate the private full-list fixture with: npm run fixtures:parity");
  process.exit(1);
}

const model = await loadModel(rootDir);
const fixtures = JSON.parse(await readFile(fixturePath, "utf8"));
const failures = [];

for (const fixture of fixtures) {
  const profile = buildCalculationProfile(fixture.input);
  const actual = calculateWithModel(model, profile);
  const expected = fixture.expected || {};

  const checks = [
    ["final", actual.final, expected.final],
    ["vp", actual.vp, expected.vp],
    ["continuous", actual.continuous, expected.continuous],
    ["rawBase", actual.rawBase, expected.rawBase],
    ["multiplier", actual.multiplier, expected.multiplier],
  ];

  for (const [field, actualValue, expectedValue] of checks) {
    if (expectedValue === undefined || expectedValue === null) continue;
    if (Math.abs(Number(actualValue) - Number(expectedValue)) > tolerance) {
      failures.push({
        id: fixture.id,
        name: fixture.name,
        field,
        expected: expectedValue,
        actual: actualValue,
      });
    }
  }
}

if (failures.length) {
  console.error(`Parity failed: ${failures.length} mismatches across ${fixtures.length} fixtures.`);
  console.error(JSON.stringify(failures.slice(0, 20), null, 2));
  if (failures.length > 20) console.error(`...and ${failures.length - 20} more.`);
  process.exit(1);
}

console.log(`Parity passed: ${fixtures.length} fixtures matched the app model output.`);
