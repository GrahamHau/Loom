import { applySealConfig } from "../server/seal-config.js";

const result = applySealConfig(process.argv[2]);
if (!result.configured) {
  console.error("No seal config directory found. Set LOOM_SEAL_CONFIG_DIR or pass a config path.");
  process.exit(1);
}

console.log(JSON.stringify(result, null, 2));
