import { readFileSync } from "node:fs";
import type { ChronicleEntry } from "./chronicle-game";

function isResultImage(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return (url.origin === "https://product-images.tcgplayer.com" ||
      (url.origin === "https://storage.googleapis.com" && url.pathname.startsWith("/fabmaster/media/images/"))) &&
      !url.username && !url.password;
  } catch {
    return false;
  }
}

function isEntry(value: unknown): value is ChronicleEntry {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return typeof row.id === "string" && /^[a-f0-9]{64}$/.test(row.id) &&
    typeof row.name === "string" && !!row.name.trim() &&
    typeof row.release === "string" && !!row.release.trim() &&
    typeof row.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(row.date) &&
    Number.isFinite(Date.parse(row.date)) && new Date(row.date).toISOString().slice(0, 10) === row.date &&
    typeof row.cropDataUrl === "string" && /^data:image\/webp;base64,[A-Za-z0-9+/]+={0,2}$/.test(row.cropDataUrl) &&
    isResultImage(row.fullImageUrl);
}

export function loadChronicleIndex(): readonly ChronicleEntry[] {
  try {
    const index: unknown = JSON.parse(readFileSync(new URL("./index.generated.json", import.meta.url), "utf8"));
    if (!index || typeof index !== "object" || !("version" in index) || index.version !== 1 ||
      !("entries" in index) || !Array.isArray(index.entries) || !index.entries.every(isEntry) ||
      new Set(index.entries.map(({ id }) => id)).size !== index.entries.length ||
      new Set(index.entries.map(({ date }) => date)).size < 8) {
      throw new Error("Invalid Chronicle index.");
    }
    return index.entries;
  } catch (error) {
    console.warn("[gac-api] Chronicle index could not be loaded.", error);
    return [];
  }
}
