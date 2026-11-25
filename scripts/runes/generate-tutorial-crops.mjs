import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import sharp from "sharp";

const require = createRequire(import.meta.url);
const { cards } = require("@flesh-and-blood/cards");
const fixtures = [
  { name: "Rune Flash", print: "ARC100-First", image: "ARC100", file: "pool-01.webp" },
  { name: "Read the Runes", print: "ARC109-First", image: "ARC109", file: "pool-02.webp" },
  { name: "Mauvrion Skies", print: "CRU145-First", image: "CRU145", file: "pool-03.webp" },
  { name: "Zap", print: "ARC144-First", image: "ARC144", file: "pool-04.webp" },
];
const outputDir = resolve("apps/web/public/runes/crops");

await mkdir(outputDir, { recursive: true });
for (const fixture of fixtures) {
  const card = cards.find((row) => row.name === fixture.name && !row.isCardBack);
  const printing = card?.printings.find((row) => row.print === fixture.print);
  if (!printing || printing.edition !== "First" || printing.foiling || printing.image !== fixture.image) {
    throw new Error(`Catalog fixture verification failed for ${fixture.name} (${fixture.print})`);
  }
  const sourceUrl = `https://storage.googleapis.com/fabmaster/media/images/${fixture.image}.width-450.png`;
  const response = await fetch(sourceUrl, { redirect: "error", signal: AbortSignal.timeout(20_000) });
  if (!response.ok || !response.headers.get("content-type")?.startsWith("image/")) {
    throw new Error(`Could not fetch verified artwork source for ${fixture.print}`);
  }
  const source = Buffer.from(await response.arrayBuffer());
  const metadata = await sharp(source, { limitInputPixels: 1_000_000 }).metadata();
  if (metadata.width !== 450 || metadata.height !== 628) {
    throw new Error(`${fixture.print} source changed dimensions; revalidate the approved art crop`);
  }
  const crop = await sharp(source)
    .extract({ left: 60, top: 95, width: 330, height: 276 })
    .webp({ quality: 88 })
    .toBuffer();
  const cropMetadata = await sharp(crop).metadata();
  if (cropMetadata.width !== 330 || cropMetadata.height !== 276) throw new Error(`Invalid crop output for ${fixture.print}`);
  await writeFile(resolve(outputDir, fixture.file), crop);
  console.log(`${fixture.file} sha256=${createHash("sha256").update(crop).digest("hex")}`);
}
