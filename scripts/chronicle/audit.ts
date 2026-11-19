import { createHash, randomUUID } from "node:crypto";
import { readFileSync, mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import sharp from "sharp";
import { buildCatalogFromFaBCards } from "../../apps/api/src/server/services/card-catalog-service";
import { resolveCatalogCardArtUrl } from "../../apps/api/src/lib/card-art-url";
import { buildChroniclePool, generateChronicleRounds, makeChronicleFixture, isPromoPrinting, indexCommercialReleaseDays, isChronicleGuideName, normalizeChronicleName, CHRONICLE_STREAK_SIZES } from "./generator.mjs";

const base = process.argv[2];
const asOf = process.argv[3];
const output = process.argv[4];
const indexPath = process.argv[5];
if (!base || !asOf || !output) {
  throw new Error("Usage: tsx scripts/chronicle/audit.ts <package installation directory> <as-of YYYY-MM-DD> <output directory> [index path]");
}

const requirePackage = createRequire(resolve(base, "package.json"));
const cardPackage = requirePackage("@flesh-and-blood/cards");
const requireFromCards = createRequire(requirePackage.resolve("@flesh-and-blood/cards"));
const typePackage = requireFromCards("@flesh-and-blood/types");
const publishedReleases = cardPackage.releases ?? typePackage.releases;
if (!Array.isArray(cardPackage.cards) || !Array.isArray(publishedReleases)) {
  throw new Error("Unsupported cards or releases export");
}
const { allCards } = buildCatalogFromFaBCards(cardPackage.cards);
const digest = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
function packageVersion(entryPath: string): string {
  return JSON.parse(readFileSync(resolve(dirname(entryPath), "../package.json"), "utf8")).version;
}
const releaseDates = indexCommercialReleaseDays(publishedReleases);
const releaseDay = (release: string): string | null => releaseDates.get(release) ?? null;

type Row = (typeof allCards)[number];
const names = new Set(allCards.map((row) => normalizeChronicleName(row.name)));
const families = new Map<string, Row[]>();
// The playable catalog selects eligible families. Include their otherwise filtered
// printings as evidence so a foil or promo cannot silently shift the debut.
for (const fabCard of cardPackage.cards as Row["fabCard"][]) {
  const name = normalizeChronicleName(fabCard.name);
  if (!names.has(name) || fabCard.isCardBack || fabCard.types?.some((type) => type === "Token")) continue;
  const family = families.get(name) ?? [];
  fabCard.printings.forEach((printing, printingIndex) => family.push({
    id: `${fabCard.cardIdentifier}::${printingIndex}::${printing.identifier}`,
    cardIdentifier: fabCard.cardIdentifier,
    printingIdentifier: printing.identifier,
    printingIndex,
    name: fabCard.name,
    imageUrl: printing.image ?? "",
    setKey: String(printing.set),
    fabCard,
    printing,
  }));
  families.set(name, family);
}
const allowedUrls = new Map<string, Promise<Asset | null>>();
type Asset = { pixels: Buffer; crop: Buffer; full: Buffer };

async function fetchAsset(url: string): Promise<Asset | null> {
  try {
    const parsed = new URL(url);
    const supported =
      parsed.origin === "https://product-images.tcgplayer.com" ||
      (parsed.origin === "https://storage.googleapis.com" && parsed.pathname.startsWith("/fabmaster/media/images/"));
    if (!supported) return null;
    const response = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(8000) });
    if (!response.ok || !response.headers.get("content-type")?.startsWith("image/")) return null;
    const full = Buffer.from(await response.arrayBuffer());
    const image = sharp(full, { limitInputPixels: 4_000_000 });
    const { width, height } = await image.metadata();
    if (!width || !height || width < 220 || height < 300 || width / height < 0.66 || width / height > 0.76) return null;
    // A conservative interior crop for standard action/attack card layouts.
    const region = image.extract({
      left: Math.round(width * 0.161),
      top: Math.round(height * 0.138),
      width: Math.round(width * 0.682),
      height: Math.round(height * 0.385),
    }).toColourspace("srgb").removeAlpha();
    const pixels = await region.clone().resize(48, 40, { fit: "fill" }).raw().toBuffer();
    let edges = 0;
    for (let i = 3; i < pixels.length; i++) edges += Math.abs(pixels[i] - pixels[i - 3]);
    if (edges / (pixels.length - 3) < 3) return null;
    return { pixels, crop: await region.png().toBuffer(), full };
  } catch {
    return null;
  }
}

function imageFor(row: Row) {
  // A card default may depict a different printing.
  if (!row.printing.image) return Promise.resolve(null);
  const url = resolveCatalogCardArtUrl(row.imageUrl, row.printing);
  let pending = allowedUrls.get(url);
  if (!pending) {
    pending = fetchAsset(url);
    allowedUrls.set(url, pending);
  }
  return pending;
}

function distance(a: Buffer, b: Buffer) {
  return a.reduce((total, channel, i) => total + Math.abs(channel - b[i]), 0) / a.length;
}

const assets = new Map<string, Asset>();
const canonicalUrls = new Map<string, string>();

function assetReleaseKey(assetId: string, release: string) {
  return JSON.stringify([assetId, release]);
}

async function writeIndex(path: string, playable: ReturnType<typeof buildChroniclePool>["entries"]) {
  const families = new Set(playable.map((entry) => normalizeChronicleName(entry.name)));
  const required = CHRONICLE_STREAK_SIZES.reduce((total, size) => total + size, 0);
  if (families.size < required) throw new Error(`Cannot publish a Chronicle index with fewer than ${required} card families`);

  const ids = new Set<string>();
  const entries = [];
  for (const { id, name, date, release, imageUrl } of playable) {
    const asset = assets.get(imageUrl);
    const fullImageUrl = canonicalUrls.get(assetReleaseKey(imageUrl, release));
    if (!/^[a-f0-9]{64}$/.test(id) || ids.has(id) || !name || !release ||
        releaseDay(release) !== date || !asset || !fullImageUrl) {
      throw new Error("Cannot publish an invalid Chronicle entry");
    }
    const crop = await sharp(asset.crop)
      .resize({ width: 360, withoutEnlargement: true })
      .webp({ quality: 75 })
      .toBuffer();
    entries.push({
      id, name, date, release, fullImageUrl,
      cropDataUrl: `data:image/webp;base64,${crop.toString("base64")}`,
    });
    ids.add(id);
  }
  const target = resolve(path);
  const temporary = `${target}.tmp-${randomUUID()}`;
  try {
    writeFileSync(temporary, JSON.stringify({ version: 1, entries }, null, 2) + "\n", { flag: "wx" });
    renameSync(temporary, target);
  } finally {
    rmSync(temporary, { force: true });
  }
}

async function auditFamily(name: string, rows: Row[]) {
  const commercial = rows.filter((row) => !isPromoPrinting({ release: row.setKey, rarity: row.printing.rarity }));
  const assetRows = commercial.filter((row) => {
    const day = releaseDay(row.setKey);
    return day && day <= asOf;
  });
  const art = await Promise.all(assetRows.map(imageFor));
  const groups: number[][] = [];
  const comparisons = [];
  let ambiguous = false;
  const credits = assetRows.map(({ printing }) => [...new Set(printing.artists)].sort());
  for (let i = 0; i < art.length; i++) {
    const candidate = art[i];
    if (!candidate) continue;
    const matches = new Set<number>();
    for (let j = 0; j < i; j++) {
      const previous = art[j];
      if (!previous) continue;
      const mad = distance(candidate.pixels, previous.pixels);
      const same = mad <= 5 && credits[i].length > 0 && credits[i].join("|") === credits[j].join("|");
      const isAlternate = (row: Row) =>
        (row.printing.treatments ?? [row.printing.treatment]).includes("Alternate Art");
      const distinct = mad >= 30 &&
        (isAlternate(assetRows[i]) || isAlternate(assetRows[j])) &&
        credits[i].length > 0 && credits[j].length > 0 &&
        credits[i].every((artist) => !credits[j].includes(artist));
      if (!same && !distinct) ambiguous = true;
      if (same) matches.add(j);
      comparisons.push({ a: assetRows[i].printing.print, b: assetRows[j].printing.print, mad: Number(mad.toFixed(3)) });
    }
    if (matches.size === 0) {
      groups.push([i]);
    } else {
      const group = groups.find((members) => members.length === matches.size && members.every((j) => matches.has(j)));
      if (group) group.push(i);
      else ambiguous = true;
    }
  }

  const verified = new Map<Row, { fingerprint: string; imageUrl: string }>();
  if (!ambiguous) {
    for (const group of groups) {
      const fingerprint = digest(JSON.stringify([name, group.map((i) => digest(art[i]!.pixels)).sort()]));
      for (const i of group) {
        const assetId = digest(art[i]!.full);
        assets.set(assetId, art[i]!);
        const row = assetRows[i];
        const key = assetReleaseKey(assetId, row.setKey);
        const source = resolveCatalogCardArtUrl(row.imageUrl, row.printing);
        const previous = canonicalUrls.get(key);
        if (!previous || source < previous) canonicalUrls.set(key, source);
        verified.set(row, { fingerprint, imageUrl: assetId });
      }
    }
  }

  return {
    comparisons,
    unresolvedArt: ambiguous,
    records: rows.map((row) => ({
      cardId: row.cardIdentifier,
      name: row.name,
      identifier: row.printingIdentifier,
      release: row.setKey,
      date: releaseDay(row.setKey),
      rarity: row.printing.rarity,
      artists: row.printing.artists,
      alternateArt: (row.printing.treatments ?? [row.printing.treatment]).includes("Alternate Art"),
      imageUrl: null,
      ...(ambiguous ? { unresolvedArt: true } : {}),
      ...verified.get(row),
    })),
  };
}

async function main() {
  const eligibleLayout = [...families].filter(([, rows]) =>
    rows.every(({ fabCard }) => fabCard.types?.length === 1 && fabCard.types[0] === "Action"));
  const candidateFamilies = eligibleLayout
    .sort(([a], [b]) => digest(a).localeCompare(digest(b), "en"))
    .slice(0, 120);
  for (const entry of eligibleLayout) {
    if (entry[0] === "command and conquer" &&
        !candidateFamilies.includes(entry)) candidateFamilies.push(entry);
  }

  const audited = new Map<string, Awaited<ReturnType<typeof auditFamily>>>();
  for (let offset = 0; offset < candidateFamilies.length; offset += 6) {
    const results = await Promise.all(candidateFamilies.slice(offset, offset + 6)
      .map(async ([name, rows]) => [name, await auditFamily(name, rows)] as const));
    for (const [name, result] of results) audited.set(name, result);
  }
  const pool = buildChroniclePool([...audited.values()].flatMap(({ records }) => records), { asOf });

  // Same art under different catalog names is also ineligible when the crops match.
  const sharedAcrossNames = new Set<string>();
  for (const [index, entry] of pool.entries.entries()) {
    for (const other of pool.entries.slice(index + 1)) {
      if (normalizeChronicleName(entry.name) === normalizeChronicleName(other.name)) continue;
      if (distance(assets.get(entry.imageUrl)!.pixels, assets.get(other.imageUrl)!.pixels) <= 5) {
        sharedAcrossNames.add(entry.id);
        sharedAcrossNames.add(other.id);
      }
    }
  }
  const guideExcluded = pool.entries.filter((entry) => isChronicleGuideName(entry.name));
  const playable = pool.entries.filter((entry) => !sharedAcrossNames.has(entry.id) && !isChronicleGuideName(entry.name));
  mkdirSync(output);
  let run = null;
  let failure = null;
  let canonicalEntries = null;
  try {
    const rounds = generateChronicleRounds(playable, { seed: "chronicle-proof-v1" });
    run = makeChronicleFixture(rounds, { seed: "chronicle-proof-v1" });
    canonicalEntries = rounds.flat();
    writeFileSync(resolve(output, "display.json"), JSON.stringify(run.display, null, 2) + "\n");
    for (const entry of canonicalEntries) {
      const asset = assets.get(entry.imageUrl)!;
      writeFileSync(resolve(output, `${entry.imageUrl}.crop.png`), asset.crop);
      writeFileSync(resolve(output, `${entry.imageUrl}.full`), asset.full);
    }
  } catch (error) {
    failure = String(error);
  }

  const report = {
    asOf,
    versions: {
      cards: packageVersion(requirePackage.resolve("@flesh-and-blood/cards")),
      types: packageVersion(requireFromCards.resolve("@flesh-and-blood/types")),
    },
    releaseSource: cardPackage.releases ? "cards.releases" : "types.releases",
    catalogCards: cardPackage.cards.length,
    dateRecords: publishedReleases.length,
    catalogPrintings: allCards.length,
    catalogFamilies: families.size,
    supportedLayoutFamilies: eligibleLayout.length,
    auditedFamilies: audited.size,
    requestedImages: allowedUrls.size,
    availableImages: (await Promise.all(allowedUrls.values())).filter(Boolean).length,
    coverage: pool.coverage,
    crossNameDuplicateExclusions: sharedAcrossNames.size,
    guideArtworkExclusions: guideExcluded.length,
    playableArtworks: playable.length,
    playableFamilies: new Set(playable.map((entry) => normalizeChronicleName(entry.name))).size,
    playableDates: new Set(playable.map((entry) => entry.date)).size,
    exclusions: pool.exclusions,
    commandAndConquer: audited.get("command and conquer"),
    commandAndConquerEntries: pool.entries.filter((entry) => entry.name === "Command and Conquer"),
    failure,
    canonicalEntries,
    run,
  };
  writeFileSync(resolve(output, "report.json"), JSON.stringify(report, null, 2) + "\n");
  if (failure) throw new Error(failure);
  if (indexPath) await writeIndex(indexPath, playable);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
