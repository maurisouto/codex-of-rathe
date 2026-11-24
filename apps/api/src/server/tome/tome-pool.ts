import { cards } from "@flesh-and-blood/cards";
import { releases, type Card, type Printing } from "@flesh-and-blood/types";
import { resolveCatalogCardArtUrl } from "@/lib/card-art-url";
import type { ChronicleEntry } from "@/server/chronicle/chronicle-game";
import { loadChronicleIndex } from "@/server/chronicle/chronicle-index";

const prompts = {
  artist: "Who illustrated this artwork?",
  card: "Which card is shown in this artwork?",
  class: "Which class is listed on this card?",
  type: "Which subtype is listed on this card?",
  set: "Which set was the first verified commercial release of this artwork?",
  year: "In what year was this artwork’s first verified commercial release?",
  rarity: "What rarity is this card’s verified printing?",
};

export type TomeCategory = keyof typeof prompts;
export type TomeFact = {
  category: TomeCategory;
  prompt: string;
  answer: string;
  explanation: string;
  excluded: readonly string[];
};
export type TomeArtwork = {
  family: string;
  artUrl: string;
  cardName: string;
  facts: readonly TomeFact[];
  relatedCardNames: readonly string[];
};

function key(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
}

function distinct(values: readonly string[]): string[] {
  return [...new Map(values.filter((value) => key(value)).map((value) => [key(value), value.trim()])).values()];
}

function setOfPrint(printing: Printing): string {
  return String(printing.set);
}

function commercial(printing: Printing): boolean {
  return key(printing.rarity ?? "") !== "promo" &&
    !/^(promos?|gem|tournament pack)$/.test(key(setOfPrint(printing)));
}

function printedSubtypes(card: Card): string[] {
  // The catalog's internal "Non-Attack" marker is not a printed subtype.
  const printed = card.typeText?.split(" - ").slice(1).join(" ").split(/\s+/) ?? [];
  return distinct((card.subtypes ?? []).filter((subtype) => printed.some((word) => key(word) === key(subtype))));
}

function printedClasses(card: Card): string[] {
  const printed = key(card.typeText?.split(" - ", 1)[0] ?? "").split(/\s+/);
  return distinct((card.classes ?? []).filter((cardClass) =>
    key(cardClass) !== "generic" && key(cardClass) !== "notclassed" && printed.includes(key(cardClass))));
}

function sharedValues(family: Card[], valuesOf: (card: Card) => string[]): string[] {
  const [first, ...rest] = family.map(valuesOf);
  return first.filter((value) => rest.every((values) => values.some((candidate) => key(candidate) === key(value))));
}

function exactArtist(printings: Printing[]): string | undefined {
  const credits = printings.map((printing) => distinct(printing.artists ?? []));
  const [first, ...rest] = credits;
  if (first?.length === 1 && rest.every((artists) => artists.length === 1 && key(artists[0]) === key(first[0]))) {
    return first[0];
  }
}

function dateForRelease(records: readonly { release: string; releaseDate: string }[]): Map<string, string | null> {
  const dates = new Map<string, string | null>();
  for (const { release, releaseDate } of records) {
    const match = /^(\d{4}-\d{2}-\d{2})(?: |$)/.exec(releaseDate);
    const date = match?.[1] ?? null;
    dates.set(release, dates.has(release) && dates.get(release) !== date ? null : date);
  }
  return dates;
}

export function createTomePool(
  entries: readonly ChronicleEntry[],
  catalog: readonly Card[],
  releaseRecords: readonly { release: string; releaseDate: string }[],
): TomeArtwork[] {
  const families = new Map<string, Card[]>();
  const cardMetadata = catalog.filter((card) => !card.isCardBack).map((card) => ({
    name: card.name,
    nameKey: key(card.name),
    classes: (card.classes ?? []).map(key),
    subtypes: printedSubtypes(card).map(key),
    sets: card.printings.filter(commercial).map(setOfPrint).map(key),
  }));
  const dates = dateForRelease(releaseRecords);
  const eligible = new Set(entries.map((entry) => key(entry.name)));
  for (const card of catalog) {
    const family = key(card.name);
    if (card.isCardBack || !eligible.has(family)) continue;
    const list = families.get(family) ?? [];
    list.push(card);
    families.set(family, list);
  }

  return entries.flatMap((entry) => {
    const family = families.get(key(entry.name));
    if (!family?.length) return [];
    const printings = family.flatMap((card) => card.printings).filter(commercial);
    // Only join to a printing that identifies the very same verified image.
    const shown = printings.filter((printing) => printing.image &&
      resolveCatalogCardArtUrl(printing.image, printing) === entry.fullImageUrl);
    if (!shown.some((printing) => setOfPrint(printing) === entry.release)) return [];

    const facts: TomeFact[] = [];
    const ownName = key(entry.name);
    const relatedCardNames = distinct(cardMetadata
      .filter((card) => card.nameKey !== ownName)
      .filter((card) => {
        return family.some((own) =>
          (own.classes ?? []).some((value) => card.classes.includes(key(value))) ||
          printedSubtypes(own).some((value) => card.subtypes.includes(key(value))) ||
          own.printings.filter(commercial).some((printing) => card.sets.includes(key(setOfPrint(printing)))));
      })
      .map((card) => card.name));
    if (relatedCardNames.length >= 3) {
      add("card", entry.name, `The artwork shown is ${entry.name}.`, relatedCardNames);
    }
    function add(category: TomeCategory, answer: string, explanation: string, excluded: readonly string[] = []) {
      facts.push({ category, prompt: prompts[category], answer, explanation, excluded });
    }

    const rarities = distinct(shown.map((printing) => printing.rarity ?? "").filter((rarity) => key(rarity) && key(rarity) !== "promo"));
    if (rarities.length === 1) {
      add("rarity", rarities[0], `${entry.name} has a verified ${rarities[0]} printing.`);
    }

    const artist = exactArtist(shown);
    if (artist) add("artist", artist, `${artist} illustrated this artwork for ${entry.name}.`);

    const classes = distinct(family.flatMap((card) => card.classes ?? []));
    const commonClasses = sharedValues(family, printedClasses);
    for (const cardClass of commonClasses) {
      add("class", cardClass, `${cardClass} is listed on ${entry.name}.`, classes);
    }

    const subtypes = distinct(family.flatMap(printedSubtypes));
    for (const subtype of sharedValues(family, printedSubtypes)) {
      add("type", subtype, `${subtype} is a listed subtype of ${entry.name}.`, subtypes);
    }

    if (dates.get(entry.release) === entry.date) {
      // Chronicle verifies earliest commercial appearance by illustration. If
      // candidate printings include multiple sets on that day, only ask its year.
      const sameDay = distinct(printings.map(setOfPrint).filter((set) => dates.get(set) === entry.date));
      const year = entry.date.slice(0, 4);
      if (sameDay.length === 1) {
        add("set", entry.release, `The first verified commercial release of this artwork was in ${entry.release}.`);
      }
      add("year", year, `The first verified commercial release of this artwork was in ${year}.`);
    }

    return [{ family: key(entry.name), artUrl: entry.cropDataUrl, cardName: entry.name, facts, relatedCardNames }];
  });
}

export function loadTomePool(): TomeArtwork[] {
  return createTomePool(loadChronicleIndex(), cards, releases);
}
