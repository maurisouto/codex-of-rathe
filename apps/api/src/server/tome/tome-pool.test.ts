import type { Card, Printing } from "@flesh-and-blood/types";
import { describe, expect, it } from "vitest";
import type { ChronicleEntry } from "@/server/chronicle/chronicle-game";
import { createTomePool } from "./tome-pool";

const entry: ChronicleEntry = {
  id: "a".repeat(64),
  name: "Test Card",
  date: "2020-01-01",
  release: "First Set",
  fullImageUrl: "https://storage.googleapis.com/fabmaster/media/images/first.width-450.png",
  cropDataUrl: "data:image/webp;base64,AAAA",
};
const firstPrint = { image: "first", set: "First Set", artists: ["First Artist"] } as unknown as Printing;
const variantPrint = { image: "variant", set: "Second Set", artists: ["Other Artist"] } as unknown as Printing;
const releases = [
  { release: "First Set", releaseDate: "2020-01-01 12:00" },
  { release: "Second Set", releaseDate: "2020-01-01 12:00" },
];

function card(printings: Printing[], classes: string[], typeText: string, subtypes: string[] = []) {
  return { name: entry.name, printings, classes, typeText, subtypes } as Card;
}

describe("Tome artwork and metadata eligibility", () => {
  it("joins only matching verified images instead of guessing from the card name and set", () => {
    const wrongImage = { ...firstPrint, image: "not-the-verified-image" };
    expect(createTomePool([entry], [card([wrongImage], ["Ranger"], "Ranger Action")], releases)).toEqual([]);
  });

  it("suppresses semantically ambiguous questions while retaining verified artwork facts", () => {
    const original = card([firstPrint], ["Ranger"], "Ranger Action - Arrow Attack", ["Arrow", "Attack"]);
    const variant = card([variantPrint], ["Assassin"], "Assassin Action - Attack", ["Attack"]);
    const [artwork] = createTomePool([entry], [original, variant], releases);
    expect(artwork.facts.map(({ category, answer }) => [category, answer])).toEqual([
      ["artist", "First Artist"], ["type", "Attack"], ["year", "2020"],
    ]);
    expect(artwork.facts[1].excluded).toEqual(["Arrow", "Attack"]);
  });

  it("omits inconsistent artist credits, catalog-only class markers, and uncertain release dates", () => {
    const conflictingCredit = { ...firstPrint, artists: ["Other Artist"] };
    const original = card([firstPrint, conflictingCredit], ["NotClassed", "Ranger"], "Action");
    const conflictingDate = { release: entry.release, releaseDate: "2020-05-01 12:00" };
    const [artwork] = createTomePool([entry], [original], [...releases, conflictingDate]);
    expect(artwork.facts).toEqual([]);
  });
});
