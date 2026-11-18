import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const [asOf, output] = process.argv.slice(2);
const cutoff = new Date(asOf);
if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf ?? "") || !Number.isFinite(cutoff.getTime()) ||
    cutoff.toISOString().slice(0, 10) !== asOf || !output) {
  throw new Error("Usage: node scripts/chronicle/refresh-index.mjs <as-of YYYY-MM-DD> <new output directory>");
}

const root = fileURLToPath(new URL("../../", import.meta.url));
const destination = resolve(output);
if (existsSync(destination)) throw new Error("Provide a new output directory");

const registry = "https://registry.npmjs.org";
const cardsName = "@flesh-and-blood/cards";
const typesName = "@flesh-and-blood/types";
const temporary = mkdtempSync(join(dirname(destination), ".chronicle-refresh-"));
const installation = join(temporary, "package-source");
const candidate = join(temporary, "candidate");
const index = join(candidate, "index.generated.json");

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function registryArguments(args) {
  return [...args, "--registry", registry, "--no-update-notifier"];
}

function dependencyMetadata(lock, key) {
  const entry = lock.packages[key];
  if (!entry?.version || !entry.integrity ||
      typeof entry.resolved !== "string" || !entry.resolved.startsWith(registry + "/")) {
    throw new Error("Unexpected Chronicle package source");
  }
  return { version: entry.version, tarball: entry.resolved, integrity: entry.integrity };
}

try {
  mkdirSync(installation);
  writeFileSync(join(installation, "package.json"), '{"name":"chronicle-catalog-source","version":"0.0.0","private":true}\n');
  const cardsVersion = JSON.parse(execFileSync("npm", registryArguments([
    "view", `${cardsName}@latest`, "version", "--json",
  ]), { cwd: installation, encoding: "utf8" }));
  if (typeof cardsVersion !== "string" || !/^\d+\.\d+\.\d+$/.test(cardsVersion)) {
    throw new Error("Upstream latest tag did not resolve to a concrete stable version");
  }

  execFileSync("npm", registryArguments([
    "install", "--ignore-scripts", "--no-audit", "--no-fund",
    "--package-lock", "--save-exact", `${cardsName}@${cardsVersion}`,
  ]), { cwd: installation, stdio: "inherit" });

  const lockPath = join(installation, "package-lock.json");
  const lock = readJson(lockPath);
  const cardsKey = `node_modules/${cardsName}`;
  const typesKey = `node_modules/${typesName}`;
  const cards = dependencyMetadata(lock, cardsKey);
  const types = dependencyMetadata(lock, lock.packages[`${cardsKey}/${typesKey}`]
    ? `${cardsKey}/${typesKey}`
    : typesKey);
  const typesRequirement = lock.packages[cardsKey]?.dependencies?.[typesName];
  if (cards.version !== cardsVersion || !typesRequirement) {
    throw new Error("Upstream cards lookup and installation do not agree");
  }

  execFileSync(process.execPath, [
    "--import", "tsx", "scripts/chronicle/audit.ts", installation, asOf, candidate, index,
  ], { cwd: root, stdio: "inherit" });

  const report = readJson(join(candidate, "report.json"));
  if (report.versions.cards !== cards.version || report.versions.types !== types.version) {
    throw new Error("Audited catalog versions do not match the isolated lockfile");
  }
  const indexSha256 = createHash("sha256").update(readFileSync(index)).digest("hex");
  writeFileSync(join(candidate, "source.json"), JSON.stringify({
    asOf,
    registry,
    cards: { ...cards, tag: "latest" },
    types: { ...types, requirement: typesRequirement },
    releaseSource: report.releaseSource,
    indexSha256,
  }, null, 2) + "\n");
  copyFileSync(lockPath, join(candidate, "catalog-package-lock.json"));
  copyFileSync(join(installation, "package.json"), join(candidate, "catalog-package.json"));

  if (existsSync(destination)) throw new Error("Candidate destination already exists");
  renameSync(candidate, destination);
  console.log(`Verified cards ${cards.version}, types ${types.version}: ${report.playableArtworks} illustrations on ${report.playableDates} dates`);
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
