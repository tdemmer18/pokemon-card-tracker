import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import type { TcgCardPrice } from "@/lib/tcg-price";

type TcgCard = {
  id: string;
  name: string;
  setName: string;
  number: string;
  rarity: string | null;
  artist: string | null;
  imageUrl: string;
  price: TcgCardPrice | null;
};

type IndexedCard = TcgCard & {
  setId: string;
  nameKey: string;
  numberKey: string;
};

let cachedIndex: IndexedCard[] | null = null;
let cacheBuiltAt = 0;
const CACHE_TTL_MS = 5 * 60 * 1000;

function normalizeName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[‘’“”]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normalizeNumber(value: string): string {
  return value.toLowerCase().replace(/^0+/, "").trim();
}

async function buildIndex(): Promise<IndexedCard[]> {
  const now = Date.now();
  if (cachedIndex && now - cacheBuiltAt < CACHE_TTL_MS) {
    return cachedIndex;
  }

  const dir = path.join(process.cwd(), "data", "cards");
  const files = await readdir(dir);
  const all: IndexedCard[] = [];

  for (const file of files) {
    if (!file.endsWith(".json")) continue;
    const setId = file.replace(/\.json$/, "");
    try {
      const cards = JSON.parse(await readFile(path.join(dir, file), "utf8")) as TcgCard[];
      if (!Array.isArray(cards)) continue;
      for (const card of cards) {
        all.push({
          ...card,
          setId,
          nameKey: normalizeName(card.name),
          numberKey: normalizeNumber(card.number),
        });
      }
    } catch {
      continue;
    }
  }

  cachedIndex = all;
  cacheBuiltAt = now;
  return all;
}

function scoreCandidate(card: IndexedCard, nameTokens: string[], numberKey: string | null): number {
  let score = 0;
  if (numberKey && card.numberKey === numberKey) {
    score += 60;
  }
  if (nameTokens.length) {
    const cardTokens = card.nameKey.split(" ").filter(Boolean);
    let hits = 0;
    for (const token of nameTokens) {
      if (token.length < 2) continue;
      if (cardTokens.includes(token)) {
        hits += 1;
      } else if (card.nameKey.includes(token)) {
        hits += 0.6;
      }
    }
    if (hits > 0) {
      score += (hits / Math.max(nameTokens.length, 1)) * 40;
    }
  }
  return score;
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const rawName = url.searchParams.get("name") ?? "";
  const rawNumber = url.searchParams.get("number") ?? "";
  const setId = url.searchParams.get("setId");

  const nameKey = normalizeName(rawName);
  const nameTokens = nameKey.split(" ").filter((token) => token.length > 1);
  const numberKey = rawNumber ? normalizeNumber(rawNumber) : null;

  if (!nameTokens.length && !numberKey) {
    return NextResponse.json(
      { matches: [], message: "Provide a name or number to search for." },
      { status: 400 },
    );
  }

  const index = await buildIndex();
  const pool = setId ? index.filter((card) => card.setId === setId) : index;

  const scored = pool
    .map((card) => ({ card, score: scoreCandidate(card, nameTokens, numberKey) }))
    .filter((entry) => entry.score >= 30)
    .sort((left, right) => right.score - left.score)
    .slice(0, 8);

  const matches = scored.map(({ card, score }) => ({
    id: card.id,
    name: card.name,
    setName: card.setName,
    setId: card.setId,
    number: card.number,
    rarity: card.rarity,
    artist: card.artist,
    imageUrl: card.imageUrl,
    price: card.price,
    score: Math.round(score),
  }));

  return NextResponse.json({
    matches,
    message: matches.length
      ? `Found ${matches.length} possible match${matches.length === 1 ? "" : "es"}.`
      : "No matches found.",
  });
}
