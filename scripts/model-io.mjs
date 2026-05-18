import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { parseCsv, processPack } from "../model/calculator.js";

export async function loadModel(rootDir) {
  const meta = JSON.parse(await readFile(join(rootDir, "model", "model_meta.json"), "utf8"));
  return {
    meta,
    base: processPack(parseCsv(await readFile(join(rootDir, "model", "base_model.csv"), "utf8"))),
    multiplier: processPack(parseCsv(await readFile(join(rootDir, "model", "multiplier_model.csv"), "utf8"))),
    rounding: processPack(parseCsv(await readFile(join(rootDir, "model", "rounding_model.csv"), "utf8"))),
    vp: processPack(parseCsv(await readFile(join(rootDir, "model", "vp_model.csv"), "utf8"))),
  };
}
