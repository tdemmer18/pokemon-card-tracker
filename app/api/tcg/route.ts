import { NextRequest, NextResponse } from "next/server";

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
};

type PokemonTcgApiResponse = {
  data?: PokemonTcgApiCard[];
  totalCount?: number;
};

export async function GET(request: NextRequest) {
  const numberParam = request.nextUrl.searchParams.get("number");
  const name = request.nextUrl.searchParams.get("name") ?? "Pokemon";
  const nationalNumber = Number(numberParam);

  if (!Number.isInteger(nationalNumber) || nationalNumber < 1) {
    return NextResponse.json({ cards: [], message: "Missing a valid National Dex number." }, { status: 400 });
  }

  const apiUrl = new URL("https://api.pokemontcg.io/v2/cards");
  apiUrl.searchParams.set("q", `nationalPokedexNumbers:${nationalNumber}`);
  apiUrl.searchParams.set("pageSize", "250");
  apiUrl.searchParams.set("orderBy", "-set.releaseDate");

  try {
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

    const payload = (await response.json()) as PokemonTcgApiResponse;
    const cards = (payload.data ?? [])
      .filter((card) => card.images?.large || card.images?.small)
      .map((card) => ({
        id: card.id,
        name: card.name,
        setName: card.set?.name ?? "Unknown set",
        number: card.number,
        rarity: card.rarity ?? null,
        artist: card.artist ?? null,
        imageUrl: card.images?.large ?? card.images?.small ?? "",
      }));

    return NextResponse.json({
      cards,
      message: cards.length
        ? `Loaded ${cards.length} ${name} card image${cards.length === 1 ? "" : "s"}.`
        : `No ${name} card images found.`,
      source: "pokemontcg.io",
      total: payload.totalCount ?? cards.length,
    });
  } catch {
    return NextResponse.json(
      { cards: [], message: "Could not load card images from the TCG database." },
      { status: 502 },
    );
  }
}
