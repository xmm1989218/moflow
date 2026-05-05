import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const files = {
  packageJson: resolve(root, "package.json"),
  cargoToml: resolve(root, "src-tauri", "Cargo.toml"),
  tauriConf: resolve(root, "src-tauri", "tauri.conf.json"),
};

function run(cmd, options = {}) {
  console.log(`  > ${cmd}`);
  return execSync(cmd, { stdio: "inherit", cwd: root, ...options });
}

function runQuiet(cmd, options = {}) {
  return execSync(cmd, { encoding: "utf-8", cwd: root, ...options }).trim();
}

function exit(msg) {
  console.error(`\nERROR: ${msg}`);
  process.exit(1);
}

let bumpCommitted = false;

function rollbackCommit() {
  if (!bumpCommitted) return;
  console.log("\nRolling back version bump commit...");
  try {
    runQuiet("git reset HEAD~1");
    console.log("Rollback complete. Version bump commit undone.");
  } catch {
    console.error("Failed to rollback commit. Please manually run: git reset HEAD~1");
  }
}

async function main() {
  const version = process.argv[2];
  if (!version) {
    console.error("Usage: node scripts/release.mjs <version>");
    console.error("Example: node scripts/release.mjs 0.2.0");
    process.exit(1);
  }

  if (!/^\d+\.\d+\.\d+$/.test(version)) {
    exit(`Invalid version format: "${version}". Expected x.y.z`);
  }

  const tag = `v${version}`;

  console.log(`\n=== MoFlow Release v${version} ===\n`);

  // 1. Git status check
  console.log("Step 1/5: Checking git status...");
  const branch = runQuiet("git rev-parse --abbrev-ref HEAD");
  if (branch !== "master" && branch !== "main") {
    exit(`Not on master/main branch (current: ${branch})`);
  }
  const status = runQuiet("git status --porcelain");
  if (status) {
    exit("Working directory is not clean. Commit or stash your changes first.");
  }
  console.log(`  Branch: ${branch}, working directory clean.\n`);

  // 2. Sync version
  console.log("Step 2/5: Syncing version numbers...");
  run(`node scripts/sync-version.mjs ${version}\n`);

  // 3. Commit version bump
  console.log("Step 3/5: Committing version bump...");
  run(`git add package.json src-tauri/Cargo.toml src-tauri/tauri.conf.json`);
  const hasStaged = runQuiet("git diff --cached --quiet || echo changed").includes("changed");
  if (hasStaged) {
    run(`git commit -m "chore: bump version to ${version}"\n`);
    bumpCommitted = true;
  } else {
    console.log("  No version changes to commit (already up to date).\n");
  }

  // 4. Lint
  console.log("Step 4/5: Running lint...");
  try {
    run("bun run lint");
    console.log("  Lint passed.\n");
  } catch {
    rollbackCommit();
    exit("Lint failed. Fix errors and try again.");
  }

  // 5. Tag and push (CI will build and publish the release)
  console.log("Step 5/5: Creating git tag and pushing...");
  run(`git tag ${tag}`);
  run("git push");
  run(`git push origin ${tag}`);
  console.log(`\n=== Pushed ${tag}. GitHub Actions will build and publish the release. ===`);
  console.log(`  https://github.com/xmm1989218/moflow/actions\n`);
}

main().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
