# Chronicle of Rathe generator proof

This isolated audit evaluates whether the repository's Flesh and Blood catalog and card image CDN can support six nested Streak rounds. Each round contains 3–8 verified illustrations with distinct first commercial release days. The script writes an opaque, shuffled display fixture and keeps the answer, full-card images, and release evidence in the audit output. Run this offline from the application; it does not change the hub or the live catalog.

## Run

Install repository dependencies with `npm ci`. Install each evidence pair in its own temporary directory so the runtime lockfile stays unchanged.

```sh
npm install --prefix /tmp/chronicle-v3 --no-save --ignore-scripts @flesh-and-blood/cards@3.6.239 @flesh-and-blood/types@3.6.238
npm install --prefix /tmp/chronicle-v7 --no-save --ignore-scripts @flesh-and-blood/cards@7.3.20 @flesh-and-blood/types@7.3.20

node --test scripts/chronicle/generator.test.mjs
node_modules/.bin/tsx scripts/chronicle/audit.ts /tmp/chronicle-v3 2026-11-18 /tmp/chronicle-proof-v3
node_modules/.bin/tsx scripts/chronicle/audit.ts /tmp/chronicle-v7 2026-11-18 /tmp/chronicle-proof-v7
```

Provide a fresh output directory for each run. The runner records the installed package versions and uses the cutoff day supplied on the command line. With identical catalog inputs and CDN image bytes, the fixed seed produces identical data and presentation order. Live CDN availability or content can change the evidence.

## Evidence and coverage

- The existing playable catalog selects card families. All printings of those families are inspected before dating, including printings filtered from the playable pool. Promo rarity and the Promos, GEM, and Tournament Pack pseudo-releases are excluded first. The commercial day comes from the package's release registry. Unknown release days, conflicting days, and any malformed row for the named release exclude the family. Releases after the cutoff do not qualify.
- The audit restricts the initial proof to standard Action layouts and samples 120 eligible names by stable name hash, plus Command and Conquer as an explicit audit case. This is a sample of the actual catalog. The coverage totals describe the sampled pool and cannot be extrapolated to the full catalog.
- Image evidence uses the repository resolver and only its two default CDN origins. The audit requires a decodable full result image and an interior crop with sufficient dimensions and variation. It compares 48×40 RGB samples by mean absolute channel difference (MAD). Same-illustration candidates require MAD at most 5 and matching printing credits. Distinct groups require MAD at least 30, an explicit alternate-art treatment, and disjoint printing credits. Same-art groups must match pairwise. Missing images and inconclusive comparisons exclude the family.
- The earliest qualifying date and its full image come from the same canonical printing. Collector codes never break chronological ties in a round. When fewer than eight dates remain, validation fails before offering a partial run.
- Crop geometry and MAD thresholds are conservative proof heuristics. They may discard valid crops, foil treatments, or true reprints and cannot establish a universal artwork identity. Only the sampled output and inspected assets support the gate.

The output directory contains `display.json` with opaque IDs, names, and image references. `report.json` contains canonical release evidence, coverage, exclusions, asset mapping, and answers. Keep the report and full-card files on the audit side.

## Measured on 2026-11-18

| Metric | Cards 3.6.239 / types 3.6.238 | Cards 7.3.20 / types 7.3.20 |
| --- | ---: | ---: |
| Raw cards | 4,560 | 5,370 |
| Release records | 91 (`types.releases`) | 113 (`cards.releases`) |
| Playable catalog printings | 12,394 | 14,244 |
| Supported Action families | 1,605 | 1,891 |
| Audited families / raw printings | 121 / 718 | 121 / 723 |
| Excluded promo / future printings | 45 / 0 | 52 / 1 |
| Validated images / requested unique URLs | 342 / 355 | 362 / 362 |
| Families excluded for unknown release date | 3 | 0 |
| Families excluded for ambiguous art | 14 | 23 |
| Families excluded for unverified images | 8 | 0 |
| Eligible illustrations / distinct dates | 100 / 20 | 101 / 26 |
| Distinct dates beyond one eight-entry run | 12 | 18 |
| Complete nested six-level run | Yes | Yes |

Both runs produced a shuffled display permutation at all six levels, with separate answer arrays and both image files for each entry. A repeat on 7.3.20 produced byte-identical display and report JSON. At the fixed seed the first round uses Overload Script, Tempest Palm Gustwave, and Enlightened Strike. Both versions add Nourishing Emptiness, Jolly Bludger, and Command and Conquer at levels 2–4. The baseline then adds Meganetic Shockwave and Hit the High Notes, while the updated version adds Aether Dart and Agility Stance. The script emits the display and answer permutations and provenance for the selected seed.

### Command and Conquer

| Illustration evidence | Canonical release day in both versions |
| --- | --- |
| ARC159 and 1HP360 share art (crop MAD 3.525). | Arcane Rising, 2020-03-27 |
| DYN000 is a separate illustrated printing. | Dynasty, 2022-11-11 |
| HNT260 is separate. Its extended-art treatment matches the standard crop. | The Hunted, 2025-01-31 |
| PEN319 is separate. ANQ009 is a promo pseudo-release even though its rarity field says Legendary. | Compendium of Rathe, 2026-02-13 |

The date of the History Pack 1 reprint is 2022-05-06. It does not change the Arcane Rising debut date. Promo evidence cannot establish an earlier commercial date. The two catalog versions differ in the capitalization of the Compendium of Rathe release label.

## Refresh the game index

The API uses a checked-in, server-only index at `apps/api/src/server/chronicle/index.generated.json`. It contains all accepted entries for the sampled pool, including embedded WebP crops that remain available independently of live CDN requests. Full-card URLs were verified when the index was generated and can still become unavailable later.

Generate a candidate from npm's public `@flesh-and-blood/cards@latest` tag. The refresh pins the concrete cards version and installs it in a temporary directory. npm resolves the cards package's declared types dependency and records the concrete compatible version and integrity in an isolated lockfile. The repository package.json and lockfile are untouched.

```sh
audit_root=$(mktemp -d)
node scripts/chronicle/refresh-index.mjs "$(date -u +%F)" "$audit_root/candidate"
```

The refresh accepts an explicit cutoff day and publishes the candidate directory only after the audit has validated the candidate and generated all six Streak rounds. An existing output directory is rejected. `source.json` records the registry, concrete versions, dependency constraint, tarball integrity, release source, and index SHA-256. Reproduce the source install by copying `catalog-package.json` and `catalog-package-lock.json` into an isolated directory as `package.json` and `package-lock.json`, then running `npm ci --ignore-scripts` there. Pass that directory and the recorded cutoff to `audit.ts`. Its optional fifth argument writes an index atomically, preserving any previous index if the audit or export fails.

The **Verify Chronicle index refresh** workflow runs weekly when present on the repository default branch, with a manual trigger available under GitHub's workflow dispatch rules. It compares candidate coverage with the checked-in index and uploads the index, audit report, and source provenance. Promote the candidate by replacing the tracked index in an ordinary PR. The previous validated index remains the runtime input until promotion. No card-by-card approval is required. A failed run or a candidate with unacceptable coverage leaves the checked-in index in place.

## Runtime

Chronicle mounts at `/chronicle` and uses the existing web proxy for `/api/chronicle`. Start the API and web app as described in the [repository handoff](../../docs/HANDOFF.md). The guest game does not use database persistence. The API holds a bounded set of active runs in memory. A restart or request routed to another API process can end an active run, so the current deployment expects the same API process to serve a run. The browser saves the latest completed result with its opaque run identifier.

The index is bundled with the API and read on the first Chronicle request. Keep the checked-in index available when deploying the API. The pre-result response contains only the current card names, opaque IDs, cropped images, and round state. The result reveals release days, set names, and full-card URLs. The catalog and committed index can be inspected in the public repository independently of a live round. Chronicle is a guest game with no competitive ranking.
