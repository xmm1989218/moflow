import { readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const files = {
  packageJson: resolve(root, "package.json"),
  cargoToml: resolve(root, "src-tauri", "Cargo.toml"),
  tauriConf: resolve(root, "src-tauri", "tauri.conf.json"),
};

function syncVersion(newVersion) {
  if (!/^\d+\.\d+\.\d+$/.test(newVersion)) {
    console.error(`Invalid version format: "${newVersion}". Expected x.y.z`);
    process.exit(1);
  }

  console.log(`Syncing version to ${newVersion}...\n`);

  console.log(`  package.json`);
  const pkg = JSON.parse(readFileSync(files.packageJson, "utf-8"));
  pkg.version = newVersion;
  writeFileSync(files.packageJson, JSON.stringify(pkg, null, 2) + "\n");

  console.log(`  src-tauri/Cargo.toml`);
  let cargo = readFileSync(files.cargoToml, "utf-8");
  cargo = cargo.replace(/^version\s*=\s*".*"/m, `version = "${newVersion}"`);
  writeFileSync(files.cargoToml, cargo);

  console.log(`  src-tauri/tauri.conf.json`);
  const conf = JSON.parse(readFileSync(files.tauriConf, "utf-8"));
  conf.version = newVersion;
  writeFileSync(files.tauriConf, JSON.stringify(conf, null, 2) + "\n");

  console.log(`\nDone. All files synced to v${newVersion}.`);
}

const version = process.argv[2];
if (!version) {
  console.error("Usage: node scripts/sync-version.mjs <version>");
  console.error("Example: node scripts/sync-version.mjs 0.2.0");
  process.exit(1);
}

syncVersion(version);
