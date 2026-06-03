import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";

type CardMeta = {
  setId: string;
  name: string;
  setName: string;
  number: string;
  imageUrl: string;
};

type EmbedMeta = {
  dim: number;
  scale: number;
  version?: number;
  alpha?: number;
  ids: string[];
  cards: Record<string, CardMeta>;
};

type Loaded = {
  meta: EmbedMeta;
  // int8 quantised, rows of length meta.dim, total length = ids.length * dim
  data: Int8Array;
};

let cache: Loaded | null = null;
let cacheBuiltAt = 0;
const CACHE_TTL_MS = 5 * 60 * 1000;

async function loadIndex(): Promise<Loaded | null> {
  const now = Date.now();
  if (cache && now - cacheBuiltAt < CACHE_TTL_MS) return cache;
  try {
    const cwd = process.cwd();
    const [metaRaw, binRaw] = await Promise.all([
      readFile(path.join(cwd, "data", "card-embeddings.meta.json"), "utf8"),
      readFile(path.join(cwd, "data", "card-embeddings.bin")),
    ]);
    const meta = JSON.parse(metaRaw) as EmbedMeta;
    const expectedLength = meta.ids.length * meta.dim;
    if (binRaw.length < expectedLength) {
      return null;
    }
    const trimmed = binRaw.subarray(0, expectedLength);
    const data = new Int8Array(trimmed.buffer, trimmed.byteOffset, expectedLength);
    cache = { meta, data };
    cacheBuiltAt = now;
    return cache;
  } catch {
    return null;
  }
}

function dot(a: Int8Array, aOffset: number, b: Float32Array, length: number): number {
  let sum = 0;
  for (let i = 0; i < length; i += 1) {
    sum += a[aOffset + i] * b[i];
  }
  return sum;
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as {
    embedding?: number[];
    topN?: number;
  };

  const probe = Array.isArray(body.embedding) ? body.embedding : null;
  const topN = Math.max(1, Math.min(Number(body.topN ?? 25), 50));

  if (!probe || !probe.length) {
    return NextResponse.json(
      { matches: [], message: "Missing embedding vector." },
      { status: 400 },
    );
  }

  const loaded = await loadIndex();
  if (!loaded || !loaded.meta.ids.length) {
    return NextResponse.json(
      {
        matches: [],
        message:
          "Embedding index is empty. Run `npm run build:embed` to generate it.",
      },
      { status: 503 },
    );
  }

  const { meta, data } = loaded;
  if (probe.length !== meta.dim) {
    return NextResponse.json(
      {
        matches: [],
        message: `Embedding dim mismatch (got ${probe.length}, expected ${meta.dim}).`,
      },
      { status: 400 },
    );
  }

  // L2-normalise the probe so dot(probe, candidate) is cosine similarity.
  const probeF32 = new Float32Array(meta.dim);
  let norm = 0;
  for (let i = 0; i < meta.dim; i += 1) norm += probe[i] * probe[i];
  norm = Math.sqrt(norm) || 1;
  for (let i = 0; i < meta.dim; i += 1) probeF32[i] = probe[i] / norm;

  // The bin is int8 quantised with scale s; cosine ~= dot(probe, candidate)/s.
  const invScale = 1 / meta.scale;

  // Track top-N by similarity. Small N → simple array+sort is plenty.
  type Heap = Array<{ id: string; sim: number }>;
  const heap: Heap = [];

  for (let i = 0; i < meta.ids.length; i += 1) {
    const raw = dot(data, i * meta.dim, probeF32, meta.dim);
    const sim = raw * invScale;
    if (heap.length < topN) {
      heap.push({ id: meta.ids[i], sim });
      heap.sort((left, right) => right.sim - left.sim);
    } else if (sim > heap[heap.length - 1].sim) {
      heap[heap.length - 1] = { id: meta.ids[i], sim };
      heap.sort((left, right) => right.sim - left.sim);
    }
  }

  const matches = heap.map(({ id, sim }) => {
    const card = meta.cards[id];
    return {
      id,
      similarity: sim,
      confidence: Math.max(0, Math.min(100, Math.round(sim * 100))),
      name: card.name,
      setName: card.setName,
      setId: card.setId,
      number: card.number,
      imageUrl: card.imageUrl,
    };
  });

  return NextResponse.json({
    matches,
    message: matches.length
      ? `Top ${matches.length} by MobileNet embedding.`
      : "No candidates.",
  });
}
