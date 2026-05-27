import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

type PokemonTcgApiSet = {
  id: string;
  name: string;
  series?: string;
  printedTotal?: number;
  total?: number;
  ptcgoCode?: string;
  releaseDate?: string;
  images?: {
    symbol?: string;
    logo?: string;
  };
};

type PokemonTcgApiResponse = {
  data?: PokemonTcgApiSet[];
  totalCount?: number;
};

type TcgExpansion = {
  id: string;
  name: string;
  series: string;
  printedTotal: number | null;
  total: number | null;
  code: string;
  releaseDate: string | null;
  logoUrl: string | null;
  symbolUrl: string | null;
};

type ExpansionsPayload = {
  expansions: TcgExpansion[];
  message: string;
  source: string;
  total: number;
};

const PAGE_SIZE = 50;
const MAX_FETCH_ATTEMPTS = 3;
let cachedPayload: ExpansionsPayload | null = null;

async function readArchivedExpansions(): Promise<TcgExpansion[] | null> {
  try {
    const file = path.join(process.cwd(), "data", "expansions.json");
    const expansions = JSON.parse(await readFile(file, "utf8")) as TcgExpansion[];
    return Array.isArray(expansions) && expansions.length > 0 ? expansions : null;
  } catch {
    return null;
  }
}

async function fetchSetPage(page: number) {
  const apiUrl = new URL("https://api.pokemontcg.io/v2/sets");
  apiUrl.searchParams.set("orderBy", "-releaseDate");
  apiUrl.searchParams.set("pageSize", String(PAGE_SIZE));
  apiUrl.searchParams.set("page", String(page));
  apiUrl.searchParams.set("select", "id,name,series,printedTotal,total,ptcgoCode,releaseDate,images");

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

export async function GET() {
  if (cachedPayload) {
    return NextResponse.json(cachedPayload);
  }

  const archived = await readArchivedExpansions();
  if (archived) {
    cachedPayload = {
      expansions: archived,
      message: `Loaded ${archived.length} expansion packs.`,
      source: "local-archive",
      total: archived.length,
    };
    return NextResponse.json(cachedPayload);
  }

  try {
    const firstPage = await fetchSetPage(1);
    const totalCount = firstPage.totalCount ?? firstPage.data?.length ?? 0;
    const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
    const remainingPageResults = await Promise.allSettled(
      Array.from({ length: totalPages - 1 }, (_, index) => fetchSetPage(index + 2)),
    );
    const remainingPages = remainingPageResults
      .filter((result): result is PromiseFulfilledResult<PokemonTcgApiResponse> => result.status === "fulfilled")
      .map((result) => result.value);
    const sets = [firstPage, ...remainingPages].flatMap((payload) => payload.data ?? []);
    const expansions = sets.map((set) => ({
      id: set.id,
      name: set.name,
      series: set.series ?? "Pokemon TCG",
      printedTotal: set.printedTotal ?? null,
      total: set.total ?? null,
      code: set.ptcgoCode ?? set.id.toUpperCase(),
      releaseDate: set.releaseDate ?? null,
      logoUrl: set.images?.logo ?? null,
      symbolUrl: set.images?.symbol ?? null,
    }));
    const payload = {
      expansions,
      message: expansions.length
        ? `Loaded ${expansions.length}${totalCount && expansions.length < totalCount ? ` of ${totalCount}` : ""} expansion packs.`
        : "No expansion packs found.",
      source: "pokemontcg.io",
      total: totalCount || expansions.length,
    };
    cachedPayload = payload;

    return NextResponse.json(payload);
  } catch {
    if (cachedPayload) {
      return NextResponse.json(cachedPayload);
    }

    return NextResponse.json(
      { expansions: [], message: "Could not load expansion packs from the TCG database." },
      { status: 502 },
    );
  }
}
