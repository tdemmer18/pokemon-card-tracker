// Extract MobileNet feature embeddings for every card image referenced in
// data/cards/*.json so the scanner can fall back to a real ML signal when
// pHash + OCR aren't decisive.
//
// Writes two files:
//   data/card-embeddings.bin       — packed int8 quantised embeddings
//   data/card-embeddings.meta.json — { dim, scale, ids: [...], cards: {...} }
//                                    where order in ids matches the binary
//                                    rows (id i = bytes [i*dim, (i+1)*dim))
//
// Usage:
//   npm run build:embed                # incremental
//   npm run build:embed -- --force     # rebuild every card
//   npm run build:embed -- --set base1 # only one set
//
// The script is resumable — partial progress is flushed every ~250 cards.

import util from "node:util";
// tfjs-node 4.22 still uses util.isNullOrUndefined which Node 22+ removed.
if (typeof util.isNullOrUndefined !== "function") {
  util.isNullOrUndefined = (value) => value === null || value === undefined;
}

import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import tfModule from "@tensorflow/tfjs-node";
import * as mobilenet from "@tensorflow-models/mobilenet";
const tf = tfModule;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const CARDS_DIR = path.join(ROOT, "data", "cards");
const BIN_PATH = path.join(ROOT, "data", "card-embeddings.bin");
const META_PATH = path.join(ROOT, "data", "card-embeddings.meta.json");
const INPUT_SIZE = 224;
const MOBILENET_VERSION = 2;
const MOBILENET_ALPHA = 1.0;
const EMBED_DIM = 1280; // MobileNetV2 alpha=1.0 embedding length
const FLUSH_EVERY = 250;
const MAX_RETRIES = 3;
const REQUEST_TIMEOUT_MS = 20000;

const args = new Set(process.argv.slice(2));
const FORCE = args.has("--force");
const ONLY_SET = (() => {
  const idx = process.argv.indexOf("--set");
  return idx >= 0 ? process.argv[idx + 1] : null;
})();

async function loadExistingMeta() {
  try {
    const raw = await readFile(META_PATH, "utf8");
    const parsed = JSON.parse(raw);
    if (parsed && Array.isArray(parsed.ids) && parsed.cards && parsed.dim) {
      return parsed;
    }
  } catch {
    // fresh build
  }
  return {
    dim: EMBED_DIM,
    scale: 127,
    version: MOBILENET_VERSION,
    alpha: MOBILENET_ALPHA,
    ids: [],
    cards: {},
  };
}

async function loadExistingBin(rows) {
  try {
    const buffer = await readFile(BIN_PATH);
    const expected = rows * EMBED_DIM;
    if (buffer.length === expected) {
      return Buffer.from(buffer);
    }
    if (buffer.length > expected) {
      return Buffer.from(buffer.subarray(0, expected));
    }
  } catch {
    // missing
  }
  return Buffer.alloc(0);
}

async function fetchImageBuffer(url) {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return Buffer.from(await response.arrayBuffer());
    } catch (error) {
      if (attempt === MAX_RETRIES) throw error;
      await new Promise((resolve) => setTimeout(resolve, 700 * attempt));
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error("unreachable");
}

async function preprocessToTensor(buffer) {
  // Resize+center-crop to a tight portrait that's mostly the card art.
  const pixels = await sharp(buffer)
    .resize(INPUT_SIZE, INPUT_SIZE, { fit: "cover" })
    .removeAlpha()
    .raw()
    .toBuffer();
  return tf.tidy(() => {
    const flat = new Uint8Array(pixels);
    return tf.tensor3d(flat, [INPUT_SIZE, INPUT_SIZE, 3], "int32");
  });
}

function quantize(float32, scale) {
  const out = new Int8Array(float32.length);
  for (let i = 0; i < float32.length; i += 1) {
    let v = Math.round(float32[i] * scale);
    if (v > 127) v = 127;
    else if (v < -128) v = -128;
    out[i] = v;
  }
  return out;
}

async function persistMeta(meta) {
  await writeFile(META_PATH, JSON.stringify(meta));
}

async function persistBin(buffer) {
  await writeFile(BIN_PATH, buffer);
}

async function main() {
  process.stdout.write("Loading MobileNet... ");
  const model = await mobilenet.load({
    version: MOBILENET_VERSION,
    alpha: MOBILENET_ALPHA,
  });
  console.log("ready.");

  const meta = await loadExistingMeta();
  let binBuffer = await loadExistingBin(meta.ids.length);
  if (FORCE) {
    meta.ids = [];
    meta.cards = {};
    binBuffer = Buffer.alloc(0);
  }

  const existing = new Set(meta.ids);
  const files = (await readdir(CARDS_DIR))
    .filter((file) => file.endsWith(".json"))
    .filter((file) => !ONLY_SET || file === `${ONLY_SET}.json`)
    .sort();

  let processed = 0;
  let failed = 0;
  let sinceFlush = 0;
  const startedAt = Date.now();

  const flush = async () => {
    await persistBin(binBuffer);
    await persistMeta(meta);
  };

  for (const file of files) {
    const setId = file.replace(/\.json$/, "");
    const cards = JSON.parse(await readFile(path.join(CARDS_DIR, file), "utf8"));
    if (!Array.isArray(cards)) continue;

    const pending = cards.filter((card) => {
      if (!card?.id || !card?.imageUrl) return false;
      return !existing.has(card.id);
    });
    if (!pending.length) continue;

    process.stdout.write(`${setId}: embedding ${pending.length}/${cards.length}... `);
    let setOk = 0;
    let setFailed = 0;
    for (const card of pending) {
      try {
        const buffer = await fetchImageBuffer(card.imageUrl);
        const tensor = await preprocessToTensor(buffer);
        // MobileNet v2 .infer(input, true) returns logits before softmax — a
        // 1280-d feature vector for v2/alpha=1.0.
        const embeddingTensor = model.infer(tensor, true);
        const data = await embeddingTensor.data();
        tensor.dispose();
        embeddingTensor.dispose();

        // L2-normalise so cosine similarity == dot product later.
        let norm = 0;
        for (let i = 0; i < data.length; i += 1) norm += data[i] * data[i];
        norm = Math.sqrt(norm) || 1;
        const normalized = new Float32Array(data.length);
        for (let i = 0; i < data.length; i += 1) normalized[i] = data[i] / norm;

        const quant = quantize(normalized, meta.scale);
        binBuffer = Buffer.concat([binBuffer, Buffer.from(quant.buffer)]);
        meta.ids.push(card.id);
        meta.cards[card.id] = {
          setId,
          name: card.name,
          setName: card.setName,
          number: card.number,
          imageUrl: card.imageUrl,
        };
        existing.add(card.id);
        setOk += 1;
        sinceFlush += 1;
      } catch (error) {
        setFailed += 1;
        console.warn(`\n  failed ${card.id}: ${error.message ?? error}`);
      }

      if (sinceFlush >= FLUSH_EVERY) {
        await flush();
        sinceFlush = 0;
      }
    }
    processed += setOk;
    failed += setFailed;
    await flush();
    process.stdout.write(`ok=${setOk} fail=${setFailed}\n`);
  }

  await flush();
  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log(
    `\nDone. Embedded ${processed} new card(s) (${failed} failed) in ${elapsed}s.`,
  );
  console.log(`Total entries: ${meta.ids.length}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
