import { execFile } from "node:child_process";
import { createWriteStream } from "node:fs";
import { access, mkdir, readdir, rename, stat } from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const root = path.resolve(import.meta.dirname, "..");
const dataDir = path.join(root, "data");
const zipPath = path.join(dataDir, "ecdict-sqlite-28.zip");
const dbPath = path.join(dataDir, "stardict.db");
const releaseUrl =
  "https://github.com/skywind3000/ECDICT/releases/download/1.0.28/ecdict-sqlite-28.zip";

async function exists(file) {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

async function download() {
  console.log(`Downloading ${releaseUrl}`);
  const response = await fetch(releaseUrl, { redirect: "follow" });
  if (!response.ok || !response.body) {
    throw new Error(`Download failed: ${response.status}`);
  }
  await pipeline(response.body, createWriteStream(zipPath));
}

async function findDatabase(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isFile() && entry.name.endsWith(".db")) return full;
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const nested = await findDatabase(path.join(dir, entry.name));
    if (nested) return nested;
  }
  return null;
}

async function extract() {
  await execFileAsync("tar", ["-xf", zipPath, "-C", dataDir]);
  const extracted = await findDatabase(dataDir);
  if (!extracted) {
    throw new Error("Archive did not contain a .db file");
  }
  if (path.resolve(extracted) !== path.resolve(dbPath)) {
    await rename(extracted, dbPath);
  }
  const info = await stat(dbPath);
  console.log(`ECDICT ready: ${dbPath} (${info.size} bytes)`);
}

if (await exists(dbPath)) {
  const info = await stat(dbPath);
  if (info.size > 1_000_000) {
    console.log(`ECDICT already present: ${dbPath}`);
    process.exit(0);
  }
}

await mkdir(dataDir, { recursive: true });
if (!(await exists(zipPath)) || (await stat(zipPath)).size < 1_000_000) {
  await download();
}
await extract();
