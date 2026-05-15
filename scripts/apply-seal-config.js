import { applySealConfig } from "../server/seal-config.js";

const result = applySealConfig(process.argv[2]);
if (!result.configured) {
  console.log(JSON.stringify({
    configured: false,
    message: "No seal config directory found. Set LOOM_SEAL_CONFIG_DIR or pass a config path.",
  }, null, 2));
  process.exit(0);
}

console.log(JSON.stringify(result, null, 2));
