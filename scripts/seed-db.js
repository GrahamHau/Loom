import { ensureSeed, saveState } from "../server/db.js";
import { loadSeedData } from "../server/seed.js";

const seed = loadSeedData();
ensureSeed(seed);

if (process.argv.includes("--force")) {
  saveState(seed);
}

console.log("Seed data is ready.");
