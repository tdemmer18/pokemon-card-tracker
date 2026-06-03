import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";

type HashEntry = {
  hash: string;
  setId: string;
  name: string;
  setName: string;
  number: string;
  imageUrl: string;
};

type HashIndex = {
  hashes: Record<string, HashEntry>;
};

type Match = HashEntry & {
  id: string;
  distance: number;
  confidence: number;
};

let cachedIndex: HashIndex | null = null;
let cacheBuiltAt = 0;
const CACHE_TTL_MS = 5 * 60 * 1000;

async function loadIndex(): Promise<HashIndex | null> {
  const now = Date.now();
  if (cachedIndex && now - cacheBuiltAt < CACHE_TTL_MS) {
    return cachedIndex;
  }
  try {
    const file = path.join(process.cwd(), "data", "card-hashes.json");
    const raw = await readFile(file, "utf8");
    const parsed = JSON.parse(raw) as HashIndex;
    cachedIndex = parsed;
    cacheBuiltAt = now;
    return parsed;
  } catch {
    return null;
  }
}

const POP_COUNT = (() => {
  const table = new Uint8Array(256);
  for (let i = 0; i < 256; i += 1) {
    let count = 0;
    let value = i;
    while (value) {
      count += value & 1;
      value >>= 1;
    }
    table[i] = count;
  }
  return table;
})();

function hexToBytes(hex: string): Uint8Array | null {
  if (!/^[0-9a-f]+$/i.test(hex) || hex.length % 2 !== 0) return null;
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i += 1) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function hamming(a: Uint8Array, b: Uint8Array): number {
  const length = Math.min(a.length, b.length);
  let distance = 0;
  for (let i = 0; i < length; i += 1) {
    distance += POP_COUNT[a[i] ^ b[i]];
  }
  // If lengths differ, count the extra bytes as flipped.
  if (a.length !== b.length) {
    const longer = a.length > b.length ? a : b;
    for (let i = length; i < longer.length; i += 1) {
      distance += POP_COUNT[longer[i]];
    }
  }
  return distance;
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as {
    hash?: string;
    topN?: number;
  };

  const hash = (body.hash ?? "").trim().toLowerCase();
  const topN = Math.max(1, Math.min(Number(body.topN ?? 6), 20));

  const probeBytes = hexToBytes(hash);
  if (!probeBytes) {
    return NextResponse.json(
      { matches: [], message: "Invalid hash." },
      { status: 400 },
    );
  }

  const index = await loadIndex();
  if (!index || !Object.keys(index.hashes).length) {
    return NextResponse.json(
      {
        matches: [],
        message:
          "Card hash index is empty. Run `npm run build:hash` to build the perceptual-hash database.",
      },
      { status: 503 },
    );
  }

  const totalBits = probeBytes.length * 8;
  const heap: Match[] = [];

  for (const [id, entry] of Object.entries(index.hashes)) {
    const candidateBytes = hexToBytes(entry.hash);
    if (!candidateBytes) continue;
    const distance = hamming(probeBytes, candidateBytes);
    const confidence = Math.round(((totalBits - distance) / totalBits) * 100);
    const match: Match = { ...entry, id, distance, confidence };

    if (heap.length < topN) {
      heap.push(match);
      heap.sort((left, right) => left.distance - right.distance);
    } else if (distance < heap[heap.length - 1].distance) {
      heap[heap.length - 1] = match;
      heap.sort((left, right) => left.distance - right.distance);
    }
  }

  return NextResponse.json({
    matches: heap,
    message: heap.length
      ? `Closest ${heap.length} match${heap.length === 1 ? "" : "es"} by perceptual hash.`
      : "No candidates in the index.",
  });
}
