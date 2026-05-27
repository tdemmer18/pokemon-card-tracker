// Downloads Pokemon TCG set + card metadata into local JSON snapshots so the
// app can serve expansion data without hitting the slow/rate-limited live API.
//
// Usage:
//   node scripts/fetch-tcg-data.mjs           # download, skipping sets already saved
//   node scripts/fetch-tcg-data.mjs --force    # re-download every set
//   POKEMON_TCG_API_KEY=xxx node scripts/fetch-tcg-data.mjs   # higher rate limits

import { mkdir, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

const API_BASE = "https://api.pokemontcg.io/v2";
const SETS_SELECT = "id,name,series,printedTotal,total,ptcgoCode,releaseDate,images";
const CARDS_SELECT = "id,name,number,artist,rarity,images";
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
      const response = await fetch(url, { headers, signal: AbortSignal.timeout(30_000) });
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

function toCard(card, setName) {
  return {
    id: card.id,
    name: card.name,
    setName,
    number: card.number,
    rarity: card.rarity ?? null,
    artist: card.artist ?? null,
    imageUrl: card.images?.large ?? card.images?.small ?? "",
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
  let done = 0;
  for (const set of rawSets) {
    if (alreadySaved.has(set.id)) {
      done += 1;
      continue;
    }
    try {
      const rawCards = await fetchAllPages(
        (page) =>
          `${API_BASE}/cards?q=set.id:${set.id}&pageSize=${PAGE_SIZE}&page=${page}&select=${CARDS_SELECT}`,
      );
      const cards = rawCards
        .map((card) => toCard(card, set.name))
        .filter((card) => card.imageUrl)
        .sort((a, b) => a.number.localeCompare(b.number, undefined, { numeric: true }));
      await writeFile(path.join(cardsDir, `${set.id}.json`), `${JSON.stringify(cards, null, 2)}\n`);
      done += 1;
      console.log(`[${done}/${rawSets.length}] ${set.name} (${set.id}): ${cards.length} cards`);
    } catch (error) {
      console.error(`Failed ${set.name} (${set.id}): ${error?.message ?? error}`);
    }
  }

  console.log("Done.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
