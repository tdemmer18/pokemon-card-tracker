// Compute a perceptual hash (dHash, 64-bit) for every card image referenced by
// the local TCG snapshot files in data/cards/*.json, then write the index to
// data/card-hashes.json so the scanner can match a photo against the library
// without OCR.
//
// Usage:
//   npm run build:hash                # only fetch+hash entries missing from the index
//   npm run build:hash -- --force     # re-hash every card from scratch
//   npm run build:hash -- --set base1 # only build (or refresh) one set
//
// Resumable: progress is saved after every set, so killing the script and
// restarting picks up where it left off.

import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const CARDS_DIR = path.join(ROOT, "data", "cards");
const OUTPUT = path.join(ROOT, "data", "card-hashes.json");
const CONCURRENCY = 12;
const MAX_RETRIES = 3;
const REQUEST_TIMEOUT_MS = 15000;

const args = new Set(process.argv.slice(2));
const FORCE = args.has("--force");
const ONLY_SET = (() => {
  const idx = process.argv.indexOf("--set");
  return idx >= 0 ? process.argv[idx + 1] : null;
})();

async function loadExisting() {
  try {
    const raw = await readFile(OUTPUT, "utf8");
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && parsed.hashes ? parsed : { hashes: {} };
  } catch {
    return { hashes: {} };
  }
}

async function fetchImageBuffer(url) {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const buffer = Buffer.from(await response.arrayBuffer());
      return buffer;
    } catch (error) {
      if (attempt === MAX_RETRIES) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 600 * attempt));
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error("unreachable");
}

// dHash: resize to 9x8 grayscale, then for each row output 1 if pixel < next.
// Yields a 64-bit hash returned as a 16-char lowercase hex string.
async function computeDhash(buffer) {
  const raw = await sharp(buffer)
    .grayscale()
    .resize(9, 8, { fit: "fill" })
    .raw()
    .toBuffer();

  let bits = "";
  for (let y = 0; y < 8; y += 1) {
    for (let x = 0; x < 8; x += 1) {
      const left = raw[y * 9 + x];
      const right = raw[y * 9 + x + 1];
      bits += left < right ? "1" : "0";
    }
  }

  let hex = "";
  for (let i = 0; i < 64; i += 4) {
    hex += parseInt(bits.slice(i, i + 4), 2).toString(16);
  }
  return hex;
}

async function hashCard(card) {
  // Prefer hi-res; some snapshots only have one URL.
  const candidates = [card.imageUrl, card.imageUrlLow].filter(Boolean);
  let lastError = null;
  for (const url of candidates) {
    try {
      const buffer = await fetchImageBuffer(url);
      return await computeDhash(buffer);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError ?? new Error("no image url");
}

async function runWithPool(items, worker) {
  const queue = items.slice();
  const inFlight = new Set();
  const results = { ok: 0, failed: 0 };

  async function spawn() {
    while (queue.length && inFlight.size < CONCURRENCY) {
      const item = queue.shift();
      const promise = (async () => {
        try {
          await worker(item);
          results.ok += 1;
        } catch (error) {
          results.failed += 1;
          console.warn(`  failed ${item.id}: ${error.message ?? error}`);
        } finally {
          inFlight.delete(promise);
        }
      })();
      inFlight.add(promise);
    }
  }

  await spawn();
  while (inFlight.size) {
    await Promise.race(inFlight);
    await spawn();
  }
  return results;
}

async function persist(index) {
  await writeFile(OUTPUT, JSON.stringify(index, null, 2));
}

async function main() {
  const index = await loadExisting();
  const files = (await readdir(CARDS_DIR))
    .filter((file) => file.endsWith(".json"))
    .filter((file) => !ONLY_SET || file === `${ONLY_SET}.json`)
    .sort();

  let totalProcessed = 0;
  let totalFailed = 0;
  const startedAt = Date.now();

  for (const file of files) {
    const setId = file.replace(/\.json$/, "");
    const cards = JSON.parse(await readFile(path.join(CARDS_DIR, file), "utf8"));
    if (!Array.isArray(cards)) continue;

    const pending = cards.filter((card) => {
      if (!card?.id || !card?.imageUrl) return false;
      if (FORCE) return true;
      return !index.hashes[card.id];
    });

    if (!pending.length) {
      continue;
    }

    process.stdout.write(`${setId}: hashing ${pending.length}/${cards.length} card(s)... `);
    const results = await runWithPool(pending, async (card) => {
      const hash = await hashCard(card);
      index.hashes[card.id] = {
        hash,
        setId,
        name: card.name,
        setName: card.setName,
        number: card.number,
        imageUrl: card.imageUrl,
      };
    });

    totalProcessed += results.ok;
    totalFailed += results.failed;
    await persist(index);
    process.stdout.write(`ok=${results.ok} fail=${results.failed}\n`);
  }

  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log(`\nDone. Hashed ${totalProcessed} new card(s) (${totalFailed} failed) in ${elapsed}s.`);
  console.log(`Total entries in index: ${Object.keys(index.hashes).length}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
