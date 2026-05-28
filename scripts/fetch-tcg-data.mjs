// Downloads Pokemon TCG set + card metadata into local JSON snapshots so the
// app can serve expansion data without hitting the slow/rate-limited live API.
//
// =============================================================================
// HOW TO UPDATE THE EXPANSION DATA IN THE FUTURE
// =============================================================================
// The app serves expansion packs and their cards from the snapshot files in
// `data/` (data/expansions.json + data/cards/<setId>.json). The API routes read
// these first and only fall back to the live pokemontcg.io API for sets that are
// missing. So whenever a NEW set is released (roughly monthly) and you want it to
// show up fast in the app, re-run this script to pull it into the snapshot.
//
// STEPS:
//   1. (Recommended) Get a free API key from https://dev.pokemontcg.io/ — without
//      one, requests are throttled and many sets time out.
//   2. Run the downloader from the project root:
//
//        npm run fetch:tcg                              # incremental: only fetches
//                                                       # sets not already in data/
//
//        POKEMON_TCG_API_KEY=your_key npm run fetch:tcg # faster + far fewer timeouts
//
//        npm run fetch:tcg -- --force                   # re-download EVERY set from
//                                                       # scratch (use if data looks
//                                                       # stale or corrupted)
//
//   3. If the run reports "Still missing N set(s)" at the end, that's just the
//      flaky API timing out. Simply run the same command again — it skips what's
//      already saved and retries only the missing ones. Using an API key (step 1)
//      usually makes everything succeed on the first pass.
//
//   4. Commit the changed/new files under `data/` (and a `data/expansions.json`
//      that now includes the new set). The new set will then load instantly.
//
// Notes:
//   - Only card METADATA is stored (name, number, rarity, artist, image URL). The
//     card IMAGES themselves still stream from their CDN at runtime — that part is
//     already fast and is intentionally not downloaded.
//   - This script needs no extra dependencies (plain Node + global fetch).
// =============================================================================

import { mkdir, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

const API_BASE = "https://api.pokemontcg.io/v2";
const SETS_SELECT = "id,name,series,printedTotal,total,ptcgoCode,releaseDate,images";
const CARDS_SELECT = "id,name,number,artist,rarity,images,tcgplayer";
const TCGPLAYER_VARIANT_PRIORITY = [
  "holofoil",
  "reverseHolofoil",
  "normal",
  "1stEditionHolofoil",
  "1stEditionNormal",
  "1stEdition",
  "unlimitedHolofoil",
  "unlimited",
];
const PAGE_SIZE = 250;
const MAX_ATTEMPTS = 4;

const dataDir = path.join(process.cwd(), "data");
const cardsDir = path.join(dataDir, "cards");
const force = process.argv.includes("--force");
const apiKey = process.env.POKEMON_TCG_API_KEY;

async function fetchJson(url) {
  const headers = { Accept: "application/json" };
  if (apiKey) headers["X-Api-Key"] = apiKey;

  let lastError;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(url, { headers, signal: AbortSignal.timeout(60_000) });
      if (response.status === 429) {
        await sleep(2_000 * attempt);
        throw new Error("rate limited (429)");
      }
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      lastError = error;
      if (attempt < MAX_ATTEMPTS) await sleep(1_000 * attempt);
    }
  }
  throw lastError;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchAllPages(buildUrl) {
  const first = await fetchJson(buildUrl(1));
  const totalCount = first.totalCount ?? first.data?.length ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const rows = [...(first.data ?? [])];
  for (let page = 2; page <= totalPages; page += 1) {
    const next = await fetchJson(buildUrl(page));
    rows.push(...(next.data ?? []));
  }
  return rows;
}

function toExpansion(set) {
  return {
    id: set.id,
    name: set.name,
    series: set.series ?? "Pokemon TCG",
    printedTotal: set.printedTotal ?? null,
    total: set.total ?? null,
    code: set.ptcgoCode ?? set.id.toUpperCase(),
    releaseDate: set.releaseDate ?? null,
    logoUrl: set.images?.logo ?? null,
    symbolUrl: set.images?.symbol ?? null,
  };
}

function extractPrice(card) {
  const prices = card.tcgplayer?.prices;
  if (!prices) return null;
  const keys = Object.keys(prices);
  if (keys.length === 0) return null;
  const variantKey = TCGPLAYER_VARIANT_PRIORITY.find((key) => prices[key]) ?? keys[0];
  const variant = prices[variantKey];
  if (!variant) return null;
  const market = variant.market ?? variant.mid ?? null;
  const low = variant.low ?? null;
  const high = variant.high ?? null;
  if (market === null && low === null && high === null) return null;
  return { market, low, high };
}

function toCard(card, setName) {
  return {
    id: card.id,
    name: card.name,
    setName,
    number: card.number,
    rarity: card.rarity ?? null,
    artist: card.artist ?? null,
    imageUrl: card.images?.large ?? card.images?.small ?? "",
    price: extractPrice(card),
  };
}

async function existingCardSetIds() {
  try {
    const files = await readdir(cardsDir);
    return new Set(files.filter((f) => f.endsWith(".json")).map((f) => f.replace(/\.json$/, "")));
  } catch {
    return new Set();
  }
}

const MAX_PASSES = 4;

async function downloadSet(set) {
  const rawCards = await fetchAllPages(
    (page) =>
      `${API_BASE}/cards?q=set.id:${set.id}&pageSize=${PAGE_SIZE}&page=${page}&select=${CARDS_SELECT}`,
  );
  const cards = rawCards
    .map((card) => toCard(card, set.name))
    .filter((card) => card.imageUrl)
    .sort((a, b) => a.number.localeCompare(b.number, undefined, { numeric: true }));
  await writeFile(path.join(cardsDir, `${set.id}.json`), `${JSON.stringify(cards, null, 2)}\n`);
  return cards.length;
}

async function main() {
  await mkdir(cardsDir, { recursive: true });

  console.log("Fetching set list...");
  const rawSets = await fetchAllPages(
    (page) => `${API_BASE}/sets?orderBy=-releaseDate&pageSize=${PAGE_SIZE}&page=${page}&select=${SETS_SELECT}`,
  );
  const expansions = rawSets.map(toExpansion);
  await writeFile(path.join(dataDir, "expansions.json"), `${JSON.stringify(expansions, null, 2)}\n`);
  console.log(`Saved ${expansions.length} expansions.`);

  const alreadySaved = force ? new Set() : await existingCardSetIds();
  let pending = rawSets.filter((set) => !alreadySaved.has(set.id));
  console.log(`${rawSets.length - pending.length} already saved, ${pending.length} to download.`);

  for (let pass = 1; pass <= MAX_PASSES && pending.length > 0; pass += 1) {
    if (pass > 1) {
      console.log(`\nRetry pass ${pass} for ${pending.length} failed set(s)...`);
      await sleep(3_000);
    }
    const stillPending = [];
    for (const set of pending) {
      try {
        const count = await downloadSet(set);
        console.log(`OK ${set.name} (${set.id}): ${count} cards`);
      } catch (error) {
        console.error(`Failed ${set.name} (${set.id}): ${error?.message ?? error}`);
        stillPending.push(set);
      }
    }
    pending = stillPending;
  }

  if (pending.length > 0) {
    console.log(`\nStill missing ${pending.length} set(s): ${pending.map((s) => s.id).join(", ")}`);
    console.log("Re-run `npm run fetch:tcg` to retry just these.");
    process.exitCode = 1;
  } else {
    console.log("\nDone. All sets saved.");
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
