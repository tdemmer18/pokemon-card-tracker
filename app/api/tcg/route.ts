import { NextRequest, NextResponse } from "next/server";
import { extractTcgPrice, type Tcgplayer } from "@/lib/tcg-price";

type PokemonTcgApiCard = {
  id: string;
  name: string;
  number: string;
  artist?: string;
  rarity?: string;
  set?: {
    name?: string;
    releaseDate?: string;
  };
  images?: {
    large?: string;
    small?: string;
  };
  tcgplayer?: Tcgplayer;
};

type PokemonTcgApiResponse = {
  data?: PokemonTcgApiCard[];
  totalCount?: number;
};

const PAGE_SIZE = 250;

async function fetchCardPage(nationalNumber: number, page: number) {
  const apiUrl = new URL("https://api.pokemontcg.io/v2/cards");
  apiUrl.searchParams.set("q", `nationalPokedexNumbers:${nationalNumber}`);
  apiUrl.searchParams.set("pageSize", String(PAGE_SIZE));
  apiUrl.searchParams.set("page", String(page));
  apiUrl.searchParams.set("orderBy", "-set.releaseDate");

  const response = await fetch(apiUrl, {
    headers: {
      Accept: "application/json",
    },
    next: {
      revalidate: 60 * 60 * 12,
    },
  });

  if (!response.ok) {
    throw new Error(`Pokemon TCG API returned ${response.status}`);
  }

  return response.json() as Promise<PokemonTcgApiResponse>;
}

export async function GET(request: NextRequest) {
  const numberParam = request.nextUrl.searchParams.get("number");
  const name = request.nextUrl.searchParams.get("name") ?? "Pokemon";
  const nationalNumber = Number(numberParam);

  if (!Number.isInteger(nationalNumber) || nationalNumber < 1) {
    return NextResponse.json({ cards: [], message: "Missing a valid National Dex number." }, { status: 400 });
  }

  try {
    const firstPage = await fetchCardPage(nationalNumber, 1);
    const totalCount = firstPage.totalCount ?? firstPage.data?.length ?? 0;
    const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
    const remainingPageResults = await Promise.allSettled(
      Array.from({ length: totalPages - 1 }, (_, index) => fetchCardPage(nationalNumber, index + 2)),
    );
    const remainingPages = remainingPageResults
      .filter((result): result is PromiseFulfilledResult<PokemonTcgApiResponse> => result.status === "fulfilled")
      .map((result) => result.value);
    const cards = [firstPage, ...remainingPages]
      .flatMap((payload) => payload.data ?? [])
      .filter((card) => card.images?.large || card.images?.small)
      .map((card) => ({
        id: card.id,
        name: card.name,
        setName: card.set?.name ?? "Unknown set",
        number: card.number,
        rarity: card.rarity ?? null,
        artist: card.artist ?? null,
        imageUrl: card.images?.large ?? card.images?.small ?? "",
        price: extractTcgPrice(card.tcgplayer),
      }));

    return NextResponse.json({
      cards,
      message: cards.length
        ? `Loaded ${cards.length}${totalCount && cards.length < totalCount ? ` of ${totalCount}` : ""} ${name} card image${cards.length === 1 ? "" : "s"}.`
        : `No ${name} card images found.`,
      source: "pokemontcg.io",
      total: totalCount || cards.length,
    });
  } catch {
    return NextResponse.json(
      { cards: [], message: "Could not load card images from the TCG database." },
      { status: 502 },
    );
  }
}
