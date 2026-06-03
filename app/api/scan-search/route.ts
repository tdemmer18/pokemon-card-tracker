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
  nameTokens: string[];
  numberKey: string;
};

let cachedIndex: IndexedCard[] | null = null;
let cacheBuiltAt = 0;
const CACHE_TTL_MS = 5 * 60 * 1000;

const STOP_TOKENS = new Set([
  "the",
  "and",
  "for",
  "from",
  "with",
  "this",
  "that",
  "ex",
  "gx",
  "vmax",
  "vstar",
  "tag",
  "team",
  "card",
  "cards",
  "pokemon",
  "hp",
  "weakness",
  "resistance",
  "retreat",
  "damage",
  "attack",
  "ability",
  "energy",
  "trainer",
  "stage",
  "basic",
  "evolves",
]);

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

function tokenize(value: string): string[] {
  return normalizeName(value)
    .split(" ")
    .filter((token) => token.length >= 3 && !STOP_TOKENS.has(token));
}

function extractNumbers(value: string): string[] {
  const numbers = new Set<string>();
  const pattern = /(\d{1,4})\s*[\/\\|]\s*(\d{1,4})/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(value)) !== null) {
    numbers.add(normalizeNumber(match[1]));
  }
  return [...numbers];
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
        const nameKey = normalizeName(card.name);
        all.push({
          ...card,
          setId,
          nameKey,
          nameTokens: nameKey.split(" ").filter((token) => token.length >= 3),
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

function scoreCandidate(
  card: IndexedCard,
  scanTokenSet: Set<string>,
  numberKeys: string[],
  setNameTokenSet: Set<string>,
): number {
  let score = 0;

  if (numberKeys.length && numberKeys.includes(card.numberKey)) {
    score += 55;
  }

  if (card.nameTokens.length) {
    let nameHits = 0;
    for (const token of card.nameTokens) {
      if (scanTokenSet.has(token)) {
        nameHits += 1;
      }
    }
    const nameRatio = nameHits / card.nameTokens.length;
    score += nameRatio * 45;
  }

  if (setNameTokenSet.size) {
    const setTokens = normalizeName(card.setName)
      .split(" ")
      .filter((token) => token.length >= 3 && !STOP_TOKENS.has(token));
    let setHits = 0;
    for (const token of setTokens) {
      if (setNameTokenSet.has(token)) {
        setHits += 1;
      }
    }
    if (setTokens.length && setHits > 0) {
      score += (setHits / setTokens.length) * 15;
    }
  }

  return score;
}

async function search({
  text,
  name,
  number,
  setId,
}: {
  text: string;
  name: string;
  number: string;
  setId: string | null;
}) {
  const haystack = [text, name].filter(Boolean).join("\n");
  const tokenSet = new Set(tokenize(haystack));
  const setNameTokens = new Set(tokenize(text));
  const numberKeys = extractNumbers(haystack);
  if (number) {
    const explicit = normalizeNumber(number);
    if (explicit && !numberKeys.includes(explicit)) {
      numberKeys.push(explicit);
    }
  }

  if (!tokenSet.size && !numberKeys.length) {
    return {
      matches: [] as Array<ScanMatchResponse>,
      message: "Could not read any text from the photo.",
      status: 400,
    };
  }

  const index = await buildIndex();
  const pool = setId ? index.filter((card) => card.setId === setId) : index;

  const scored = pool
    .map((card) => ({ card, score: scoreCandidate(card, tokenSet, numberKeys, setNameTokens) }))
    .filter((entry) => entry.score >= 18)
    .sort((left, right) => right.score - left.score)
    .slice(0, 10);

  const matches: ScanMatchResponse[] = scored.map(({ card, score }) => ({
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

  return {
    matches,
    message: matches.length
      ? `Found ${matches.length} possible match${matches.length === 1 ? "" : "es"}.`
      : "No matches found. Try a clearer photo or include the card number.",
    status: 200,
  };
}

type ScanMatchResponse = {
  id: string;
  name: string;
  setName: string;
  setId: string;
  number: string;
  rarity: string | null;
  artist: string | null;
  imageUrl: string;
  price: TcgCardPrice | null;
  score: number;
};

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const result = await search({
    text: url.searchParams.get("text") ?? "",
    name: url.searchParams.get("name") ?? "",
    number: url.searchParams.get("number") ?? "",
    setId: url.searchParams.get("setId"),
  });
  return NextResponse.json(
    { matches: result.matches, message: result.message },
    { status: result.status },
  );
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as {
    text?: string;
    name?: string;
    number?: string;
    setId?: string | null;
  };
  const result = await search({
    text: body.text ?? "",
    name: body.name ?? "",
    number: body.number ?? "",
    setId: body.setId ?? null,
  });
  return NextResponse.json(
    { matches: result.matches, message: result.message },
    { status: result.status },
  );
}
