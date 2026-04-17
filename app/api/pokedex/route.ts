import { NextResponse } from "next/server";
import { allTypes, seedPokemon } from "@/lib/seed";

export async function GET() {
  const entries = seedPokemon();

  return NextResponse.json({
    entries,
    message: `Synced ${entries.length} Pokemon from the National Dex.`,
    total: entries.length,
    generations: [...new Set(entries.map((entry) => entry.generation))].length,
    types: allTypes(entries),
    source: "local-seed",
  });
}
