// One-off extraction tool. Run manually with:
//   node scripts/extract-model-library.mjs [path/to/autoload_expo3d.html]
// Pulls window.MODEL_LIBRARY (per-asset base64 .glb) out of the reference
// kiosk HTML into public/models/<cat>/<slug>.glb + public/models/manifest.json,
// and sanity-checks window.TEXTURAS_BASE against the textures already present
// under public/textures/. Not wired into next build/dev — never re-run
// automatically.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const defaultHtml = path.resolve(
  repoRoot,
  "..",
  "ExpoPostos",
  "autoload_expo3d.html"
);
const htmlPath = process.argv[2] ? path.resolve(process.argv[2]) : defaultHtml;

function extractAssignment(html, varName) {
  const marker = `window.${varName} = `;
  const start = html.indexOf(marker);
  if (start === -1) throw new Error(`Could not find "${marker}" in ${htmlPath}`);
  const jsonStart = start + marker.length;
  const end = html.indexOf(";\n", jsonStart);
  if (end === -1) throw new Error(`Could not find terminator for ${varName}`);
  return html.slice(jsonStart, end);
}

console.log(`Reading ${htmlPath} ...`);
const html = fs.readFileSync(htmlPath, "utf8");

// ---- MODEL_LIBRARY -> public/models/<cat>/<slug>.glb + manifest.json ----
console.log("Parsing window.MODEL_LIBRARY ...");
const modelLibrary = JSON.parse(extractAssignment(html, "MODEL_LIBRARY"));

const modelsDir = path.join(repoRoot, "public", "models");
fs.mkdirSync(modelsDir, { recursive: true });

const manifest = {};
let ok = 0;
let failed = 0;
let totalBytes = 0;

for (const [id, entry] of Object.entries(modelLibrary)) {
  try {
    const { b64, ...meta } = entry;
    const buf = Buffer.from(b64, "base64");
    const outPath = path.join(modelsDir, `${id}.glb`);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, buf);
    manifest[id] = meta;
    totalBytes += buf.length;
    ok++;
  } catch (err) {
    failed++;
    console.error(`  FAILED "${id}": ${err.message}`);
  }
}

fs.writeFileSync(
  path.join(modelsDir, "manifest.json"),
  JSON.stringify(manifest, null, 2)
);

console.log(
  `MODEL_LIBRARY: ${ok} models written (${(totalBytes / 1024 / 1024).toFixed(1)} MB), ${failed} failed.`
);

// ---- TEXTURAS_BASE -> sanity check only, no files written ----
console.log("Parsing window.TEXTURAS_BASE for sanity check ...");
const texturas = JSON.parse(extractAssignment(html, "TEXTURAS_BASE"));
const texturesDir = path.join(repoRoot, "public", "textures");
const existing = new Set(
  fs.existsSync(texturesDir) ? fs.readdirSync(texturesDir) : []
);

function kebab(name) {
  return name.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
}

for (const key of Object.keys(texturas)) {
  const candidates = [`${key}.jpg`, `${kebab(key)}.jpg`];
  const found = candidates.find((c) => existing.has(c));
  if (!found) {
    console.warn(`  WARNING: no public/textures file found for "${key}" (tried ${candidates.join(", ")})`);
  }
}
console.log("Textures check done (no files written/overwritten).");
