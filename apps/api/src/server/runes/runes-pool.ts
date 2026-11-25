import { readFileSync } from "node:fs";
import { randomUUID, createHash } from "node:crypto";
import { cards } from "@flesh-and-blood/cards";
import type { Printing } from "@flesh-and-blood/types";
import { resolveFabCardArtUrl } from "@/lib/card-art-url";
import { loadChronicleIndex } from "@/server/chronicle/chronicle-index";
import type { ChronicleEntry } from "@/server/chronicle/chronicle-game";
import { loadTomePool } from "@/server/tome/tome-pool";
import type { RunesArtwork, RunesClue } from "./runes-game";

const tutorialSources = [
  { cardIdentifier: "rune-flash-red", name: "Rune Flash", print: "ARC100-First", set: "Arcane Rising", image: "ARC100", crop: "pool-02.webp" },
  { cardIdentifier: "read-the-runes-red", name: "Read the Runes", print: "ARC109-First", set: "Arcane Rising", image: "ARC109", crop: "pool-01.webp" },
  { cardIdentifier: "mauvrion-skies-red", name: "Mauvrion Skies", print: "CRU145-First", set: "Crucible of War", image: "CRU145", crop: "pool-03.webp" },
  { cardIdentifier: "zap-red", name: "Zap", print: "ARC144-First", set: "Arcane Rising", image: "ARC144", crop: "pool-04.webp" },
] as const;

function normalize(value: string) { return value.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase(); }

function printingByExactName(cardIdentifier: string, printName: string): Printing | null {
  const card = cards.find((candidate) => candidate.cardIdentifier === cardIdentifier && !candidate.isCardBack &&
    candidate.printings.some((printing) => printing.print === printName));
  return card?.printings.find((printing) => printing.print === printName) ?? null;
}

function cropDataUrl(file: string): string | null {
  try {
    const url = new URL(`../../../../../apps/web/public/runes/crops/${file}`, import.meta.url);
    const data = readFileSync(url);
    if (data.length < 100 || data.toString("ascii", 0, 4) !== "RIFF" || data.toString("ascii", 8, 12) !== "WEBP" ||
      !isTutorialCropSize(data)) return null;
    return `data:image/webp;base64,${data.toString("base64")}`;
  } catch {
    return null;
  }
}

function isTutorialCropSize(data: Buffer) {
  const kind = data.toString("ascii", 12, 16);
  let width = 0;
  let height = 0;
  if (kind === "VP8X" && data.length >= 30) {
    width = 1 + data[24]! + (data[25]! << 8) + (data[26]! << 16);
    height = 1 + data[27]! + (data[28]! << 8) + (data[29]! << 16);
  } else if (kind === "VP8L" && data.length >= 25 && data[20] === 0x2f) {
    const bits = data[21]! | (data[22]! << 8) | (data[23]! << 16) | (data[24]! << 24);
    width = (bits & 0x3fff) + 1;
    height = ((bits >>> 14) & 0x3fff) + 1;
  } else if (kind === "VP8 " && data.length >= 30 && data[23] === 0x9d && data[24] === 0x01 && data[25] === 0x2a) {
    width = data.readUInt16LE(26) & 0x3fff;
    height = data.readUInt16LE(28) & 0x3fff;
  }
  return width === 330 && height === 276;
}

function catalogClues(cardIdentifier: string, printing: Printing): RunesClue[] {
  const card = cards.find((candidate) => candidate.cardIdentifier === cardIdentifier && candidate.printings.includes(printing));
  if (!card) return [];
  const artists = [...new Set((printing.artists ?? []).map((artist) => artist.trim()).filter(Boolean))];
  const classes = (card.classes ?? []).filter((value) => value !== "Generic" && value !== "NotClassed");
  const clues: RunesClue[] = [];
  if (classes.length === 1) clues.push({ category: "class", label: "Class", value: classes[0]! });
  if (artists.length === 1) clues.push({ category: "artist", label: "Illustrated by", value: artists[0]! });
  const types = [...new Set((card.types ?? []).map((value) => value.trim()).filter(Boolean))];
  if (types.length === 1) clues.push({ category: "form", label: "Card type", value: types[0]! });
  if (typeof card.cost === "number") clues.push({ category: "cost", label: "Resource cost", value: String(card.cost) });
  if (typeof card.defense === "number") clues.push({ category: "defense", label: "Defense", value: String(card.defense) });
  if (typeof card.pitch === "number") clues.push({ category: "pitch", label: "Pitch", value: String(card.pitch) });
  if (printing.rarity?.trim()) clues.push({ category: "rarity", label: "Rarity", value: printing.rarity.trim() });
  if (printing.set?.trim()) clues.push({ category: "set", label: "Set", value: printing.set.trim() });
  return clues;
}

export function createRunesTutorialPool(crops: readonly (string | null)[]): RunesArtwork[] {
  if (crops.length !== tutorialSources.length || crops.some((crop) => !crop || !crop.startsWith("data:image/webp;base64,"))) return [];
  const result: RunesArtwork[] = [];
  for (let index = 0; index < tutorialSources.length; index++) {
    const source = tutorialSources[index]!;
    const { cardIdentifier, name, print } = source;
    const printing = printingByExactName(cardIdentifier, print);
    const crop = crops[index]!;
    if (!printing || printing.edition !== "First" || printing.foiling || printing.set !== source.set || printing.image !== source.image) return [];
    const clues = catalogClues(cardIdentifier, printing);
    if (clues.length === 0) return [];
    result.push({
      id: randomUUID(), name, cropUrl: crop,
      fullImageUrl: resolveFabCardArtUrl(printing.image),
      set: printing.set, facts: clues, sourceCardIdentifier: cardIdentifier, sourcePrint: print,
    });
  }
  const target = result[1];
  if (!target || target.name !== "Read the Runes" || target.facts.length < 4 ||
    target.facts[0]?.value !== "Runeblade" || target.facts[1]?.value !== "Max Kostin" ||
    new Set(target.facts.slice(0, 4).map(({ category }) => category)).size !== 4 ||
    new Set(result.map(({ cropUrl }) => cropUrl)).size !== 4) return [];
  return result;
}

export function loadRunesTutorialPool(): RunesArtwork[] {
  return createRunesTutorialPool(tutorialSources.map(({ crop }) => cropDataUrl(crop)));
}

function buildRunesArtworkPool(): RunesArtwork[] {
  const entries = loadChronicleIndex();
  const byCrop = new Map<string, ChronicleEntry>();
  for (const entry of entries) byCrop.set(entry.cropDataUrl, entry);
  const artworks: RunesArtwork[] = [];
  const seen = new Set<string>();
  for (const art of loadTomePool()) {
    const entry = byCrop.get(art.artUrl);
    if (!entry || !art.facts.length) continue;
    const fingerprint = createHash("sha256").update(art.artUrl).digest("hex");
    if (seen.has(fingerprint)) continue;
    seen.add(fingerprint);
    const facts = art.facts.filter(({ category }) => category !== "card").map(({ category, prompt, answer }) => ({
      category, label: ({ artist: "Illustrated by", card: "Artwork", class: "Class", type: "Subtype", set: "First release", year: "First release year", rarity: "Rarity" } as Record<string, string>)[category] ?? prompt,
      value: answer,
    }));
    artworks.push({ id: randomUUID(), name: art.cardName, cropUrl: art.artUrl, fullImageUrl: entry.fullImageUrl, set: entry.release, facts });
  }
  return artworks;
}

export function createCachedRunesPool(loader: () => RunesArtwork[]) {
  let cached: RunesArtwork[] | undefined;
  return () => cached ??= Object.freeze(loader().map((art) => Object.freeze({
    ...art,
    facts: Object.freeze(art.facts.map((fact) => Object.freeze({ ...fact }))),
  }))) as unknown as RunesArtwork[];
}

export const loadRunesArtworkPool = createCachedRunesPool(buildRunesArtworkPool);
export const loadRunesTutorialPoolCached = createCachedRunesPool(loadRunesTutorialPool);

