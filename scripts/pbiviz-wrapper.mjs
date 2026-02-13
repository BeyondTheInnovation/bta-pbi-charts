import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import fs from "node:fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");

const shimDir = path.join(repoRoot, "scripts", "shims");
const localBin = path.join(process.cwd(), "node_modules", ".bin");
const rootBin = path.join(repoRoot, "node_modules", ".bin");

const existingPath = process.env.PATH ?? "";
// Prefer repo-root binaries so stale workspace-local node_modules don't pin old pbiviz versions.
process.env.PATH = [shimDir, rootBin, localBin, existingPath].filter(Boolean).join(path.delimiter);

const readJson = (filePath) => {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
};

// `powerbi-visuals-tools` expects `node_modules/powerbi-visuals-api` in the visual folder.
// With Bun workspaces and older local links, this can drift and trigger `npm install` attempts.
// Keep a local link aligned to the API version declared in pbiviz.json.
try {
  const pbivizManifest = readJson(path.join(process.cwd(), "pbiviz.json"));
  const desiredApiVersion = typeof pbivizManifest?.apiVersion === "string"
    ? pbivizManifest.apiVersion.trim()
    : "";

  const localApi = path.join(process.cwd(), "node_modules", "powerbi-visuals-api");
  if (!fs.existsSync(localApi)) {
    const rootApi = path.join(repoRoot, "node_modules", "powerbi-visuals-api");
    if (fs.existsSync(rootApi)) {
      fs.mkdirSync(path.dirname(localApi), { recursive: true });
      fs.symlinkSync(rootApi, localApi, process.platform === "win32" ? "junction" : "dir");
    }
  } else if (desiredApiVersion) {
    const localApiPkg = readJson(path.join(localApi, "package.json"));
    const localApiVersion = typeof localApiPkg?.version === "string" ? localApiPkg.version : "";
    const rootApi = path.join(repoRoot, "node_modules", "powerbi-visuals-api");
    const rootApiPkg = readJson(path.join(rootApi, "package.json"));
    const rootApiVersion = typeof rootApiPkg?.version === "string" ? rootApiPkg.version : "";

    if (rootApiVersion === desiredApiVersion && localApiVersion !== desiredApiVersion) {
      fs.rmSync(localApi, { recursive: true, force: true });
      fs.mkdirSync(path.dirname(localApi), { recursive: true });
      fs.symlinkSync(rootApi, localApi, process.platform === "win32" ? "junction" : "dir");
    }
  }
} catch {
  // Best-effort; if it fails, pbiviz will fall back to its own install logic.
}

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error("Usage: pbiviz-wrapper.mjs <pbiviz-args...>");
  process.exit(2);
}

const command = process.platform === "win32" ? "pbiviz.cmd" : "pbiviz";
const child = spawn(command, args, {
  stdio: "inherit",
  shell: process.platform === "win32",
});

child.on("exit", (code) => process.exit(code ?? 1));
