/**
 * Ensure local runtime assets before `npm run dev` / `npm start`.
 * Skips work when ECDICT and Scrapling are already present.
 * Set SKIP_SETUP=1 to bypass, or SKIP_DICT=1 / SKIP_SCRAPLING=1 for partial skips.
 */
import { execFile } from "node:child_process";
import { access, copyFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const root = path.resolve(import.meta.dirname, "..");
const dbPath = process.env.ECDICT_PATH || path.join(root, "data", "stardict.db");
const envLocal = path.join(root, ".env.local");
const envExample = path.join(root, ".env.example");
const requirements = path.join(root, "requirements.txt");
const fetchScript = path.join(root, "scripts", "fetch-ecdict.mjs");

async function exists(file) {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

async function run(command, args, opts = {}) {
  await execFileAsync(command, args, {
    cwd: root,
    windowsHide: true,
    stdio: "inherit",
    ...opts,
  });
}

async function findPython() {
  if (process.env.PYTHON) return process.env.PYTHON;
  const candidates =
    process.platform === "win32"
      ? [
          ["python", []],
          ["py", ["-3"]],
          ["python3", []],
        ]
      : [
          ["python3", []],
          ["python", []],
        ];
  for (const [bin, prefix] of candidates) {
    try {
      await execFileAsync(bin, [...prefix, "--version"], { windowsHide: true });
      return prefix.length ? [bin, ...prefix] : bin;
    } catch {
      // try next
    }
  }
  return null;
}

function asCommand(python) {
  return Array.isArray(python) ? { bin: python[0], prefix: python.slice(1) } : { bin: python, prefix: [] };
}

async function ensureEnvLocal() {
  if (await exists(envLocal)) return;
  if (!(await exists(envExample))) return;
  await copyFile(envExample, envLocal);
  console.log("Created .env.local from .env.example — fill in LLM_API_KEY before chatting.");
}

async function ensureDict() {
  if (process.env.SKIP_DICT === "1") {
    console.log("SKIP_DICT=1 — skipping ECDICT.");
    return;
  }
  if (await exists(dbPath)) {
    console.log(`ECDICT present: ${dbPath}`);
    return;
  }
  console.log("ECDICT missing — downloading (first run may take a few minutes)...");
  await run(process.execPath, [fetchScript]);
}

async function ensureScrapling() {
  if (process.env.SKIP_SCRAPLING === "1") {
    console.log("SKIP_SCRAPLING=1 — skipping Scrapling.");
    return;
  }
  const python = await findPython();
  if (!python) {
    console.warn(
      "Python not found on PATH. Article fetch will use the Readability fallback. Set PYTHON to enable Scrapling.",
    );
    return;
  }
  const { bin, prefix } = asCommand(python);
  try {
    await execFileAsync(bin, [...prefix, "-c", "import scrapling"], { windowsHide: true });
    console.log("Scrapling already installed.");
    return;
  } catch {
    // install below
  }
  console.log("Scrapling missing — installing from requirements.txt...");
  try {
    await run(bin, [...prefix, "-m", "pip", "install", "-r", requirements]);
  } catch (error) {
    console.warn(
      "Failed to install Scrapling. Article fetch will use the Readability fallback.",
      error instanceof Error ? error.message : error,
    );
  }
}

if (process.env.SKIP_SETUP === "1") {
  console.log("SKIP_SETUP=1 — skipping ensure-setup.");
  process.exit(0);
}

console.log("Ensuring local setup...");
await ensureEnvLocal();
await ensureDict();
await ensureScrapling();
console.log("Setup check done.");
