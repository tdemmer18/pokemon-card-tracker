import { NextRequest, NextResponse } from "next/server";

type PokemonTcgApiCard = {
  id: string;
  name: string;
  number: string;
  artist?: string;
  rarity?: string;
  set?: {
    name?: string;
  };
  images?: {
    large?: string;
    small?: string;
  };
};

type PokemonTcgApiResponse = {
  data?: PokemonTcgApiCard[];
  totalCount?: number;
};

type TcgCard = {
  id: string;
  name: string;
  setName: string;
  number: string;
  rarity: string | null;
  artist: string | null;
  imageUrl: string;
};

type ExpansionCardsPayload = {
  cards: TcgCard[];
  message: string;
  source: string;
  total: number;
};

const PAGE_SIZE = 250;
const MAX_FETCH_ATTEMPTS = 3;
const cachedPayloads = new Map<string, ExpansionCardsPayload>();

async function fetchCardPage(setId: string, page: number) {
  const apiUrl = `https://api.pokemontcg.io/v2/cards?q=set.id:${setId}&pageSize=${PAGE_SIZE}&page=${page}&orderBy=number`;

  for (let attempt = 1; attempt <= MAX_FETCH_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(apiUrl, {
        headers: {
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(15_000),
        next: {
          revalidate: 60 * 60 * 12,
        },
      });

      if (!response.ok) {
        throw new Error(`Pokemon TCG API returned ${response.status}`);
      }

      return response.json() as Promise<PokemonTcgApiResponse>;
    } catch (error) {
      if (attempt === MAX_FETCH_ATTEMPTS) {
        throw error;
      }
    }
  }

  throw new Error("Pokemon TCG API request failed");
}

export async function GET(request: NextRequest) {
  const setId = request.nextUrl.searchParams.get("setId")?.trim() ?? "";
  const setName = request.nextUrl.searchParams.get("setName") ?? "Expansion";

  if (!/^[a-z0-9]+$/i.test(setId)) {
    return NextResponse.json({ cards: [], message: "Missing a valid expansion set ID." }, { status: 400 });
  }

  const cacheKey = `${setId}:${setName}`;
  const cachedPayload = cachedPayloads.get(cacheKey);
  if (cachedPayload) {
    return NextResponse.json(cachedPayload);
  }

  try {
    const firstPage = await fetchCardPage(setId, 1);
    const totalCount = firstPage.totalCount ?? firstPage.data?.length ?? 0;
    const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
    const remainingPageResults = await Promise.allSettled(
      Array.from({ length: totalPages - 1 }, (_, index) => fetchCardPage(setId, index + 2)),
    );
    const remainingPages = remainingPageResults
      .filter((result): result is PromiseFulfilledResult<PokemonTcgApiResponse> => result.status === "fulfilled")
      .map((result) => result.value);
    const cards = [firstPage, ...remainingPages]
      .flatMap((payload) => payload.data ?? [])
      .sort((left, right) => left.number.localeCompare(right.number, undefined, { numeric: true }))
      .filter((card) => card.images?.large || card.images?.small)
      .map((card) => ({
        id: card.id,
        name: card.name,
        setName: card.set?.name ?? setName,
        number: card.number,
        rarity: card.rarity ?? null,
        artist: card.artist ?? null,
        imageUrl: card.images?.large ?? card.images?.small ?? "",
      }));
    const payload = {
      cards,
      message: cards.length
        ? `Loaded ${cards.length}${totalCount && cards.length < totalCount ? ` of ${totalCount}` : ""} ${setName} cards.`
        : `No ${setName} cards found.`,
      source: "pokemontcg.io",
      total: totalCount || cards.length,
    };
    cachedPayloads.set(cacheKey, payload);

    return NextResponse.json(payload);
  } catch {
    const cachedPayload = cachedPayloads.get(cacheKey);
    if (cachedPayload) {
      return NextResponse.json(cachedPayload);
    }

    return NextResponse.json(
      { cards: [], message: "Could not load cards from the TCG database." },
      { status: 502 },
    );
  }
}
