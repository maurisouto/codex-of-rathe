import { createHash } from "node:crypto";

export const CHRONICLE_STREAK_SIZES = [3, 4, 5, 6, 7, 8];
const guideNames = new Set(["snatch", "art of war", "channel mount heroic"]);

export function normalizeChronicleName(name) {
  return name.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
}

export function isChronicleGuideName(name) {
  return guideNames.has(normalizeChronicleName(name));
}

function compareText(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

function comparePrinting(a, b) {
  return compareText(a.date, b.date)
    || compareText(a.identifier, b.identifier)
    || compareText(a.release, b.release)
    || compareText(a.imageUrl ?? "", b.imageUrl ?? "")
    || compareText(a.cardId, b.cardId)
    || compareText(a.name, b.name);
}

function isDate(date) {
  return typeof date === "string"
    && /^\d{4}-\d{2}-\d{2}$/.test(date)
    && Number.isFinite(Date.parse(date))
    && new Date(date).toISOString().startsWith(date + "T");
}

export function indexCommercialReleaseDays(releases) {
  const days = new Map();
  for (const record of releases) {
    const release = record?.release;
    if (typeof release !== "string" || !release.trim()) continue;

    const timestamp = typeof record.releaseDate === "string" ? record.releaseDate : "";
    const match = /^(\d{4}-\d{2}-\d{2})(?: (?:[01]\d|2[0-3]):[0-5]\d)?$/.exec(timestamp);
    const validType = typeof record.releaseType === "string" && record.releaseType.trim();
    const candidate = validType && isDate(match?.[1]) ? match[1] : null;
    // Once a named release has a malformed row or conflicting day, it stays undated.
    if (!days.has(release)) days.set(release, candidate);
    else if (days.get(release) !== candidate) days.set(release, null);
  }
  return days;
}

function isDistinctArt(a, b) {
  return (a.alternateArt || b.alternateArt)
    && a.artists.length > 0
    && b.artists.length > 0
    && a.artists.every((artist) => !b.artists.includes(artist));
}

function groupArt(rows) {
  const byFingerprint = new Map();
  for (const row of rows) {
    if (!byFingerprint.has(row.fingerprint)) byFingerprint.set(row.fingerprint, []);
    byFingerprint.get(row.fingerprint).push(row);
  }
  const groups = [...byFingerprint.values()];

  for (const [index, group] of groups.entries()) {
    const credits = new Set(group.filter((row) => row.artists.length).map((row) => row.artists.join("\0")));
    if (credits.size > 1) return null;
    for (const other of groups.slice(index + 1)) {
      if (!group.every((a) => other.every((b) => isDistinctArt(a, b)))) return null;
    }
  }
  return groups;
}

function hash(parts) {
  return createHash("sha256").update(JSON.stringify(parts)).digest("hex");
}

export function isPromoPrinting({ rarity, release }) {
  return rarity?.trim().toLowerCase() === "promo"
    || /^(promos?|gem|tournament pack)$/i.test(release?.trim());
}

/**
 * Fingerprints identify decoded CDN art that the adapter verified pairwise within each card family.
 * Different fingerprints require verified different images. The adapter omits the fingerprint for
 * unresolved printings so the family cannot silently enter the pool with an incorrect date.
 */
export function buildChroniclePool(printings, { asOf } = {}) {
  if (asOf !== undefined && !isDate(asOf)) throw new Error("Invalid Chronicle cutoff date");
  const byName = new Map();
  const entries = [];
  const exclusions = [];
  let promoPrintings = 0;
  let futurePrintings = 0;

  for (const printing of printings) {
    if (isPromoPrinting(printing)) {
      promoPrintings++;
      continue;
    }
    if (asOf && isDate(printing.date) && printing.date > asOf) {
      futurePrintings++;
      continue;
    }

    const row = { ...printing, artists: [...new Set(printing.artists ?? [])].sort(compareText) };
    const nameKey = normalizeChronicleName(row.name);
    if (!byName.has(nameKey)) byName.set(nameKey, []);
    byName.get(nameKey).push(row);
  }

  let ambiguousCards = 0;
  let undatedCards = 0;
  let unverifiedImageCards = 0;
  for (const [nameKey, rows] of [...byName].sort(([a], [b]) => compareText(a, b))) {
    const cardIds = [...new Set(rows.map((row) => row.cardId))].sort(compareText);
    const identifiers = [...new Set(rows.map((row) => row.identifier))].sort(compareText);
    if (rows.some((row) => !isDate(row.date))) {
      undatedCards++;
      exclusions.push({ cardId: cardIds[0], cardIds, identifiers, reason: "unknown-release-date" });
      continue;
    }
    if (rows.some((row) => row.unresolvedArt)) {
      ambiguousCards++;
      exclusions.push({ cardId: cardIds[0], cardIds, identifiers, reason: "ambiguous-art" });
      continue;
    }
    if (rows.some((row) => !row.fingerprint || !row.imageUrl)) {
      unverifiedImageCards++;
      exclusions.push({ cardId: cardIds[0], cardIds, identifiers, reason: "unverified-image" });
      continue;
    }
    const groups = groupArt(rows.sort(comparePrinting));
    if (!groups) {
      ambiguousCards++;
      exclusions.push({ cardId: cardIds[0], cardIds, identifiers, reason: "ambiguous-art" });
      continue;
    }
    for (const group of groups) {
      group.sort(comparePrinting);
      const first = group[0];
      const identifiers = [...new Set(group.map((row) => row.identifier))].sort(compareText);
      entries.push({
        id: hash([nameKey, first.fingerprint]),
        cardId: first.cardId,
        name: first.name,
        identifiers,
        date: first.date,
        release: first.release,
        imageUrl: first.imageUrl,
      });
    }
  }
  entries.sort((a, b) => compareText(a.id, b.id));

  return {
    entries,
    exclusions,
    coverage: {
      inputPrintings: printings.length,
      promoPrintings,
      futurePrintings,
      commercialCards: byName.size,
      ambiguousCards,
      undatedCards,
      unverifiedImageCards,
      eligibleArtworks: entries.length,
      eligibleCards: new Set(entries.map((entry) => normalizeChronicleName(entry.name))).size,
      eligibleReleaseDates: new Set(entries.map((entry) => entry.date)).size,
    },
  };
}

export function generateChronicleRounds(
  entries,
  { seed = "chronicle-proof", roundSizes = CHRONICLE_STREAK_SIZES } = {},
) {
  if (!roundSizes.length || roundSizes.some((size) => !Number.isSafeInteger(size) || size < 2)) {
    throw new Error("Chronicle rounds require valid card counts");
  }

  const ranked = entries
    .map((entry) => ({ entry, rank: hash([seed, entry.id]) }))
    .sort((a, b) => compareText(a.rank, b.rank)
      || compareText(a.entry.id, b.entry.id)
      || compareText(a.entry.date, b.entry.date));
  const selected = [];
  const usedNames = new Set();
  const usedIds = new Set();
  const required = roundSizes.reduce((sum, size) => sum + size, 0);
  for (const { entry } of ranked) {
    const name = normalizeChronicleName(entry.name);
    if (!name || guideNames.has(name) || usedNames.has(name) || usedIds.has(entry.id)) continue;
    selected.push(entry);
    usedNames.add(name);
    usedIds.add(entry.id);
    if (selected.length === required) break;
  }
  if (selected.length !== required) {
    throw new Error(`Insufficient distinct card names for Chronicle rounds (need ${required})`);
  }

  let offset = 0;
  return roundSizes.map((size) => {
    const round = selected.slice(offset, offset + size);
    offset += size;
    return round.sort((a, b) => compareText(a.date, b.date));
  });
}

/** Projects separate display, answer, and asset data for the isolated audit. */
export function makeChronicleFixture(rounds, { seed = "chronicle-proof" } = {}) {
  const assets = {};
  const display = [];
  const answers = [];
  for (const [index, round] of rounds.entries()) {
    const answer = round.map((entry) => entry.id);
    const shuffled = [...round].sort((a, b) => (
      compareText(hash([seed, index, a.id]), hash([seed, index, b.id]))
      || compareText(a.id, b.id)
    ));
    const chronologicallySorted = shuffled.every((entry, position) => !position || shuffled[position - 1].date <= entry.date);
    if (chronologicallySorted && shuffled[0].date !== shuffled.at(-1).date) {
      shuffled.push(shuffled.shift());
    }
    display.push(shuffled.map(({ id, name, imageUrl }) => {
      assets[id] = imageUrl;
      return { id, name, imageRef: id };
    }));
    answers.push(answer);
  }
  return { display, answers, assets };
}
