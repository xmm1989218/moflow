import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

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

function rollbackVersion() {
  console.log("\nRolling back version changes...");
  try {
    runQuiet("git checkout -- package.json src-tauri/Cargo.toml src-tauri/tauri.conf.json");
    console.log("Rollback complete. Version files restored.");
  } catch {
    console.error("Failed to rollback. Please manually restore the version files.");
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
  console.log("Step 1/8: Checking git status...");
  const branch = runQuiet("git rev-parse --abbrev-ref HEAD");
  if (branch !== "master" && branch !== "main") {
    exit(`Not on master/main branch (current: ${branch})`);
  }
  const status = runQuiet("git status --porcelain");
  if (status) {
    exit("Working directory is not clean. Commit or stash your changes first.");
  }
  console.log(`  Branch: ${branch}, working directory clean.\n`);

  // 2. Check CHANGELOG
  console.log("Step 2/8: Checking CHANGELOG.md...");
  const changelogPath = resolve(root, "CHANGELOG.md");
  if (!existsSync(changelogPath)) {
    exit("CHANGELOG.md not found. Create it with an entry for v" + version + " before releasing.");
  }
  const changelogContent = readFileSync(changelogPath, "utf-8");
  if (!changelogContent.includes(`## v${version}`)) {
    exit(`CHANGELOG.md does not contain an entry for v${version}. Update CHANGELOG.md before releasing.`);
  }
  console.log(`  CHANGELOG.md has entry for v${version}.\n`);

  // 3. Sync version
  console.log("Step 3/8: Syncing version numbers...");
  run(`node scripts/sync-version.mjs ${version}\n`);

  // 4. Lint
  console.log("Step 4/8: Running lint...");
  try {
    run("bun run lint");
    console.log("  Lint passed.\n");
  } catch {
    rollbackVersion();
    exit("Lint failed. Fix errors and try again.");
  }

  // 5. Type check & build
  console.log("Step 5/8: Running type check and build...");
  try {
    run("bun run build");
    console.log("  Build passed.\n");
  } catch {
    rollbackVersion();
    exit("Build failed. Fix errors and try again.");
  }

  // 6. Test
  console.log("Step 6/8: Running tests...");
  try {
    run("bun test");
    console.log("  Tests passed.\n");
  } catch {
    rollbackVersion();
    exit("Tests failed. Fix errors and try again.");
  }

  // 7. Rust check
  console.log("Step 7/8: Running Rust check...");
  try {
    run("cargo check", { cwd: resolve(root, "src-tauri") });
    console.log("  Rust check passed.\n");
  } catch {
    rollbackVersion();
    exit("Rust check failed. Fix errors and try again.");
  }

  // 8. Commit, tag and push
  console.log("Step 8/8: Committing, tagging and pushing...");
  run(`git add package.json src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/tauri.conf.json CHANGELOG.md`);
  const hasStaged = runQuiet("git diff --cached --quiet || echo changed").includes("changed");
  if (hasStaged) {
    run(`git commit -m "chore: bump version to ${version}"\n`);
  } else {
    console.log("  No version changes to commit (already up to date).\n");
  }
  run(`git tag ${tag}`);
  run("git push");
  run(`git push origin refs/tags/${tag}`);
  console.log(`\n=== Pushed ${tag}. GitHub Actions will build and publish the release. ===`);
  console.log(`  https://github.com/xmm1989218/moflow/actions\n`);
}

main().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
