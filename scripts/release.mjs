import { readFileSync, writeFileSync, readdirSync, existsSync, rmSync } from "fs";
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
  console.log("Step 1/9: Checking git status...");
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
  console.log("Step 2/9: Syncing version numbers...");
  run(`node scripts/sync-version.mjs ${version}\n`);

  // 3. Commit version bump
  console.log("Step 3/9: Committing version bump...");
  run(`git add package.json src-tauri/Cargo.toml src-tauri/tauri.conf.json`);
  const hasStaged = runQuiet("git diff --cached --quiet || echo changed").includes("changed");
  if (hasStaged) {
    run(`git commit -m "chore: bump version to ${version}"\n`);
    bumpCommitted = true;
  } else {
    console.log("  No version changes to commit (already up to date).\n");
  }

  // 4. Lint
  console.log("Step 4/9: Running lint...");
  try {
    run("bun run lint");
    console.log("  Lint passed.\n");
  } catch {
    rollbackCommit();
    exit("Lint failed. Fix errors and try again.");
  }

  // 5. Clean old NSIS artifacts
  console.log("Step 5/9: Cleaning old NSIS artifacts...");
  if (existsSync(nsisDir)) {
    const oldFiles = readdirSync(nsisDir).filter(
      (f) => f.endsWith("_x64-setup.exe") || f.endsWith("_x64-setup.exe.sig")
    );
    for (const f of oldFiles) {
      rmSync(join(nsisDir, f));
      console.log(`  Removed: ${f}`);
    }
    if (oldFiles.length === 0) console.log("  No old artifacts found.");
  }
  console.log();

  // 6. Build
  console.log("Step 6/9: Building Tauri app...");

  const conf = JSON.parse(readFileSync(files.tauriConf, "utf-8"));
  const keyName = conf.productName.toLowerCase();
  const keyPath = join(homedir(), ".tauri", `${keyName}.key`);

  if (!process.env.TAURI_SIGNING_PRIVATE_KEY) {
    try {
      process.env.TAURI_SIGNING_PRIVATE_KEY = readFileSync(keyPath, "utf-8").trim();
      console.log("  Signing key loaded successfully");
    } catch {
      exit(
        `Signing key not found at ${keyPath}\n\n` +
        `To generate a signing key, run:\n` +
        `  tauri signer generate -w ${keyPath} -p <password> --ci\n\n` +
        `This will create:\n` +
        `  ${keyPath}       (private key, keep secret)\n` +
        `  ${keyPath}.pub   (public key, add to tauri.conf.json > plugins.updater.pubkey)`
      );
    }
  }

  const keyPassPath = join(homedir(), ".tauri", `${keyName}.key.password`);
  if (!process.env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD) {
    try {
      process.env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD = readFileSync(keyPassPath, "utf-8").trim();
      console.log("  Signing key password loaded successfully\n");
    } catch {
      exit(
        `Signing key password not found at ${keyPassPath}\n\n` +
        `Create it with:\n` +
        `  echo YOUR_PASSWORD > ${keyPassPath}\n\n` +
        `Or set TAURI_SIGNING_PRIVATE_KEY_PASSWORD environment variable.`
      );
    }
  }

  try {
    run(`bun run tauri build -- --config bundle.createUpdaterArtifacts=true`);
    console.log("  Build succeeded.\n");
  } catch {
    rollbackCommit();
    exit("Build failed. See errors above.");
  }

  // 7. Collect artifacts
  console.log("Step 7/9: Collecting build artifacts...");
  const productName = JSON.parse(readFileSync(files.tauriConf, "utf-8")).productName;
  const nsisFiles = readdirSync(nsisDir);
  const exeFile = nsisFiles.find((f) => f.endsWith("_x64-setup.exe"));
  if (!exeFile) {
    exit(`No NSIS installer found in ${nsisDir}`);
  }
  const sigFile = exeFile + ".sig";
  console.log(`  Installer: ${exeFile}`);
  if (!existsSync(join(nsisDir, sigFile))) {
    exit(
      `Signature file not found: ${join(nsisDir, sigFile)}\n` +
      `Update artifacts must be signed. Check that TAURI_SIGNING_PRIVATE_KEY is set correctly.`
    );
  }
  console.log(`  Signature: ${sigFile}`);

  const builtVersion = exeFile.match(/_(\d+\.\d+\.\d+)_/)?.[1];
  if (builtVersion && builtVersion !== version) {
    exit(
      `Version mismatch: exe has ${builtVersion}, expected ${version}.\n` +
      `Make sure sync-version ran correctly and rebuild.`
    );
  }
  console.log();

  // 8. Generate latest.json
  console.log("Step 8/9: Generating latest.json...");
  let signature = readFileSync(join(nsisDir, sigFile), "utf-8").trim();

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

  // 9. Tag, push, and create GitHub Release
  console.log("Step 9/9: Creating git tag and GitHub Release...");
  run(`git tag ${tag}`);

  console.log("  Pushing commit and tag...");
  run("git push");
  run(`git push origin ${tag}`);

  const uploadFiles = [join(nsisDir, exeFile), join(nsisDir, sigFile), latestJsonPath];

  const ghCmd = `gh release create ${tag} ${uploadFiles.map((f) => `"${f}"`).join(" ")} --title "${tag}" --generate-notes`;
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
