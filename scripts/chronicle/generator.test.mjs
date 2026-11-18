import assert from "node:assert/strict";
import { test } from "node:test";
import { buildChroniclePool, generateChronicleRounds, indexCommercialReleaseDays, makeChronicleFixture } from "./generator.mjs";

// Synthetic input exercises the rules independently of the changing catalog and CDN.
function printing(overrides = {}) {
  return {
    cardId: "sample-red",
    name: "Sample",
    identifier: "first",
    release: "First Release",
    date: "2020-10-02",
    rarity: "Majestic",
    artists: ["Artist One"],
    imageUrl: "https://example.invalid/first",
    fingerprint: "verified-original",
    ...overrides,
  };
}

test("groups visually verified reprints and pitch variants at their earliest commercial release", () => {
  const earlierPrinting = printing({ identifier: "earlier", date: "2019-10-02", release: "Earlier Release" });
  const reprint = printing({
    cardId: "sample-blue",
    identifier: "reprint",
    date: "2022-03-01",
    imageUrl: "https://example.invalid/reprint",
  });
  const alternate = printing({
    identifier: "alternate",
    alternateArt: true,
    artists: ["Artist Two"],
    fingerprint: "verified-alternate",
    date: "2021-02-01",
    imageUrl: "https://example.invalid/alternate",
  });
  const input = [reprint, alternate, earlierPrinting];
  const result = buildChroniclePool(input);
  assert.deepEqual(result, buildChroniclePool([...input].reverse()));
  assert.equal(result.entries.length, 2);
  const original = result.entries.find((entry) => entry.identifiers.includes("reprint"));
  assert.deepEqual(original.identifiers, ["earlier", "reprint"]);
  assert.equal(original.date, "2019-10-02");
  assert.equal(original.release, "Earlier Release");
  assert.equal(result.entries.find((entry) => entry.identifiers.includes("alternate")).date, "2021-02-01");
});

test("excludes promo printings by rarity and pseudo-release before considering dates or art", () => {
  const result = buildChroniclePool([
    printing(),
    printing({ identifier: "promo-rarity", rarity: "Promo", date: "2018-01-01" }),
    printing({ identifier: "promo-release", release: "Promos", fingerprint: null, date: undefined }),
    printing({ identifier: "promo-gem", release: "GEM", date: "2018-01-01" }),
    printing({ identifier: "promo-tournament", release: "Tournament Pack", date: "2018-01-01" }),
  ]);
  assert.equal(result.coverage.promoPrintings, 4);
  assert.deepEqual(result.exclusions, []);
  assert.deepEqual(result.entries[0].identifiers, ["first"]);
  assert.equal(result.entries[0].date, "2020-10-02");
});

test("requires valid dates and applies an explicit inclusive cutoff to future releases", () => {
  const base = printing({ date: "2020-02-29" });
  const future = printing({ identifier: "future", date: "2020-03-01", fingerprint: null });
  const result = buildChroniclePool([base, future], { asOf: "2020-02-29" });
  assert.equal(result.coverage.futurePrintings, 1);
  assert.equal(result.entries[0].date, "2020-02-29");
  assert.throws(() => buildChroniclePool([base], { asOf: "2020-02-30" }), /Invalid Chronicle cutoff/);
  for (const date of [null, "2020-02-30", "2020-02-29T00:00:00Z"]) {
    const undated = buildChroniclePool([base, printing({ date })]);
    assert.equal(undated.entries.length, 0);
    assert.equal(undated.exclusions[0].reason, "unknown-release-date");
  }
});

test("excludes families with failed CDN evidence or inconclusive illustration relationships", () => {
  const missingEvidence = buildChroniclePool([printing(), printing({ fingerprint: null })]);
  assert.equal(missingEvidence.entries.length, 0);
  assert.equal(missingEvidence.exclusions[0].reason, "unverified-image");
  const unresolved = buildChroniclePool([printing(), printing({ fingerprint: null, unresolvedArt: true })]);
  assert.equal(unresolved.exclusions[0].reason, "ambiguous-art");
  const variants = [
    { fingerprint: "different", alternateArt: true },
    { fingerprint: "different", artists: ["Artist Two"] },
    { alternateArt: true, artists: ["Artist Two"] },
  ];
  for (const variant of variants) {
    const ambiguous = buildChroniclePool([printing(), printing({ identifier: "other", ...variant })]);
    assert.equal(ambiguous.entries.length, 0);
    assert.equal(ambiguous.exclusions[0].reason, "ambiguous-art");
  }
});

test("new catalog revisions can add reprints or clarify earlier art without a manual map", () => {
  const initial = printing({ identifier: "current" });
  const later = printing({ identifier: "added-reprint", date: "2024-11-01" });
  const earlier = printing({ identifier: "discovered-original", date: "2018-12-01" });
  const [before] = buildChroniclePool([initial]).entries;
  const [after] = buildChroniclePool([later, initial, earlier]).entries;
  assert.equal(after.id, before.id);
  assert.equal(after.date, "2018-12-01");
  assert.deepEqual(after.identifiers, ["added-reprint", "current", "discovered-original"]);
});

test("builds six nested rounds with unique dates and separate opaque display and answer data", () => {
  const rows = Array.from({ length: 8 }, (_, index) => printing({
    name: "Card " + index,
    cardId: "card-" + index,
    identifier: "collector-" + index,
    date: "2022-04-0" + (index + 1),
  }));
  const tied = printing({ name: "Tied Card", cardId: "tied", date: rows[2].date });
  const entries = buildChroniclePool([...rows, tied]).entries;
  const seed = "fixture";
  const rounds = generateChronicleRounds(entries, { seed });
  assert.deepEqual(rounds.map((round) => round.length), [3, 4, 5, 6, 7, 8]);
  assert.deepEqual(rounds, generateChronicleRounds([...entries].reverse(), { seed }));
  assert.ok(rounds.every((round) => new Set(round.map((entry) => entry.date)).size === round.length));
  assert.ok(rounds.every((round, index) => !index || rounds[index - 1].every((card) => round.includes(card))));
  const fixture = makeChronicleFixture(rounds, { seed });
  assert.deepEqual(fixture, makeChronicleFixture(rounds, { seed }));
  for (const [index, round] of fixture.display.entries()) {
    assert.notDeepEqual(round.map((card) => card.id), fixture.answers[index]);
    assert.deepEqual(new Set(round.map((card) => card.id)), new Set(fixture.answers[index]));
    assert.ok(round.every((card) => Object.keys(card).sort().join() === "id,imageRef,name"));
    assert.ok(round.every((card) => fixture.assets[card.imageRef]));
  }
});

test("fails closed when ties leave fewer than eight dates for the six-round fixture", () => {
  const entries = buildChroniclePool([
    printing(),
    printing({ cardId: "other", name: "Other" }),
  ]).entries;
  assert.throws(() => generateChronicleRounds(entries), /Insufficient distinct commercial release dates/);
});

test("never selects the same opaque illustration ID twice even if the input dates conflict", () => {
  const entries = buildChroniclePool([
    printing(),
    printing({ cardId: "other", name: "Other", date: "2020-10-03" }),
    printing({ cardId: "third", name: "Third", date: "2020-10-05" }),
  ]).entries;
  const repeated = { ...entries[0], date: "2020-10-06" };
  const input = [repeated, ...entries];
  const rounds = generateChronicleRounds(input, { roundSizes: [3] });
  assert.deepEqual(rounds, generateChronicleRounds([...input].reverse(), { roundSizes: [3] }));
  assert.equal(new Set(rounds[0].map(({ id }) => id)).size, 3);
  assert.ok(!rounds[0].includes(repeated));
});


test("a valid release row cannot mask a malformed or conflicting row", () => {
  const valid = { release: "Launch", releaseType: "Standalone Booster", releaseDate: "2020-10-02 12:00" };
  const matching = { ...valid, releaseDate: "2020-10-02" };
  assert.equal(indexCommercialReleaseDays([valid, matching]).get("Launch"), "2020-10-02");

  const invalidRows = [
    { ...valid, releaseDate: "2020-10-03" },
    { ...valid, releaseDate: "2020-02-30" },
    { ...valid, releaseDate: "2020-10-02 25:00" },
    { ...valid, releaseDate: undefined },
    { ...valid, releaseType: undefined },
  ];
  for (const invalid of invalidRows) {
    for (const rows of [[valid, invalid, matching], [invalid, valid, matching]]) {
      assert.equal(indexCommercialReleaseDays(rows).get("Launch"), null);
    }
  }
});
