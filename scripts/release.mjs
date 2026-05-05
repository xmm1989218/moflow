import { readFileSync, writeFileSync, readdirSync, existsSync } from "fs";
import { resolve, dirname, join } from "path";
import { homedir } from "os";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const nsisDir = resolve(root, "src-tauri", "target", "release", "bundle", "nsis");
const latestJsonPath = resolve(root, "latest.json");

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

function rollbackCommit() {
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

  // 2. Sync version
  console.log("Step 2/8: Syncing version numbers...");
  run(`node scripts/sync-version.mjs ${version}\n`);

  // 3. Commit version bump
  console.log("Step 3/8: Committing version bump...");
  run(`git add package.json src-tauri/Cargo.toml src-tauri/tauri.conf.json`);
  run(`git commit -m "chore: bump version to ${version}"\n`);

  // 4. Lint
  console.log("Step 4/8: Running lint...");
  try {
    run("bun run lint");
    console.log("  Lint passed.\n");
  } catch {
    rollbackCommit();
    exit("Lint failed. Fix errors and try again.");
  }

  // 5. Build
  console.log("Step 5/8: Building Tauri app...");

  if (!process.env.TAURI_SIGNING_PRIVATE_KEY) {
    const conf = JSON.parse(readFileSync(files.tauriConf, "utf-8"));
    const keyName = conf.productName.toLowerCase();
    const keyPath = join(homedir(), ".tauri", `${keyName}.key`);

    try {
      process.env.TAURI_SIGNING_PRIVATE_KEY = readFileSync(keyPath, "utf-8").trim();
      console.log(`  Signing key loaded from ${keyPath}\n`);
    } catch {
      exit(
        `Signing key not found at ${keyPath}\n\n` +
        `To generate a signing key, run:\n` +
        `  tauri signer generate -w ${keyPath}\n\n` +
        `This will create:\n` +
        `  ${keyPath}       (private key, keep secret)\n` +
        `  ${keyPath}.pub   (public key, add to tauri.conf.json > plugins.updater.pubkey)`
      );
    }
  }

  try {
    run("bun run tauri build");
    console.log("  Build succeeded.\n");
  } catch {
    rollbackCommit();
    exit("Build failed. See errors above.");
  }

  // 6. Collect artifacts
  console.log("Step 6/8: Collecting build artifacts...");
  let exeFile, sigFile;
  try {
    const nsisFiles = readdirSync(nsisDir);
    exeFile = nsisFiles.find((f) => f.endsWith("_x64-setup.exe"));
    sigFile = nsisFiles.find((f) => f.endsWith("_x64-setup.exe.sig"));
    if (!exeFile) exit(`Installer .exe not found in ${nsisDir}`);
    console.log(`  Installer: ${exeFile}`);
    if (sigFile) {
      console.log(`  Signature: ${sigFile}`);
    } else {
      console.log("  Signature: not found (build without signing key)");
    }
    console.log();
  } catch {
    exit(`Cannot read NSIS output directory: ${nsisDir}`);
  }

  // 7. Generate latest.json
  console.log("Step 7/8: Generating latest.json...");
  let signature = "";
  if (sigFile) {
    signature = readFileSync(join(nsisDir, sigFile), "utf-8").trim();
  }

  const latestJson = {
    version: version,
    notes: `## v${version}`,
    pub_date: new Date().toISOString(),
    platforms: {
      "windows-x86_64": {
        signature: signature,
        url: `https://github.com/xmm1989218/moflow/releases/download/${tag}/${exeFile}`,
      },
    },
  };

  writeFileSync(latestJsonPath, JSON.stringify(latestJson, null, 2) + "\n");
  console.log(`  Written to ${latestJsonPath}`);
  console.log(`  ${JSON.stringify(latestJson, null, 2)}\n`);

  // 8. Tag, push, and create GitHub Release
  console.log("Step 8/8: Creating git tag and GitHub Release...");
  run(`git tag ${tag}`);

  console.log("  Pushing commit and tag...");
  run("git push");
  run(`git push origin ${tag}`);

  const uploadFiles = [join(nsisDir, exeFile)];
  if (sigFile) uploadFiles.push(join(nsisDir, sigFile));
  uploadFiles.push(latestJsonPath);

  const releaseNotes = `## What's Changed in v${version}\n\nSee commit history for details.`;
  const ghCmd = `gh release create ${tag} ${uploadFiles.map((f) => `"${f}"`).join(" ")} --title "${tag}" --notes "${releaseNotes}"`;
  try {
    run(ghCmd);
    console.log(`\n=== Release ${tag} published successfully! ===`);
    console.log(`  https://github.com/xmm1989218/moflow/releases/tag/${tag}\n`);
  } catch {
    console.error(`\nGitHub Release creation failed. You can create it manually:`);
    console.error(`  ${ghCmd}\n`);
    console.error(`Or upload these files to an existing release:`);
    uploadFiles.forEach((f) => console.error(`  - ${f}`));
    console.error();
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
