import { NextResponse } from "next/server";

const CACHE_CONTROL = "public, max-age=86400, s-maxage=604800, stale-while-revalidate=2592000";
const MAX_POKEMON_ID = 1025;

function pokemonAssetId(id: number) {
  return id < 1000 ? String(id).padStart(3, "0") : String(id);
}

function pokemonImageSources(id: number) {
  return [
    `https://assets.pokemon.com/assets/cms2/img/pokedex/full/${pokemonAssetId(id)}.png`,
    `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${id}.png`,
    `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${id}.png`,
  ];
}

async function fetchImage(url: string) {
  try {
    const response = await fetch(url, {
      headers: {
        Accept: "image/avif,image/webp,image/png,image/*,*/*;q=0.8",
        "User-Agent": "Pokedex Checklist image proxy",
      },
      next: { revalidate: 60 * 60 * 24 * 7 },
    });

    const contentType = response.headers.get("content-type") ?? "";
    if (!response.ok || !contentType.startsWith("image/") || !response.body) {
      return null;
    }

    return new NextResponse(response.body, {
      status: 200,
      headers: {
        "Cache-Control": CACHE_CONTROL,
        "Content-Type": contentType,
      },
    });
  } catch {
    return null;
  }
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: rawId } = await params;
  const id = Number(rawId);

  if (!Number.isInteger(id) || id < 1 || id > MAX_POKEMON_ID) {
    return NextResponse.json({ message: "Invalid Pokemon id." }, { status: 400 });
  }

  for (const source of pokemonImageSources(id)) {
    const image = await fetchImage(source);
    if (image) return image;
  }

  return NextResponse.json({ message: "Pokemon image not found." }, { status: 404 });
}
