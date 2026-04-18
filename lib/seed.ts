import pokedex from "@/data/pokedex.json";

export type ThemeId = "tokyo-night" | "one-dark-pro" | "github-dark" | "github-light";

export type SortId = "number-asc" | "number-desc" | "name-asc" | "name-desc";

export type CompletionId = "all" | "completed" | "missing";

export type PokemonEntry = {
  id: number;
  name: string;
  number: string;
  generation: number;
  imageUrl: string;
  types: string[];
  names: Record<string, string>;
};

export const GENERATION_NAMES: Record<number, string> = {
  1: "Kanto",
  2: "Johto",
  3: "Hoenn",
  4: "Sinnoh",
  5: "Unova",
  6: "Kalos",
  7: "Alola",
  8: "Galar",
  9: "Paldea",
};

export const PAGE_SIZE_OPTIONS = [32, 16, 8, 0] as const;

export const THEMES: Array<{ id: ThemeId; label: string }> = [
  { id: "tokyo-night", label: "Tokyo Night" },
  { id: "one-dark-pro", label: "One Dark Pro" },
  { id: "github-dark", label: "GitHub Dark" },
  { id: "github-light", label: "GitHub Light" },
];

export const SORT_OPTIONS: Array<{ id: SortId; label: string }> = [
  { id: "number-asc", label: "National Dex ↑" },
  { id: "number-desc", label: "National Dex ↓" },
  { id: "name-asc", label: "Name A–Z" },
  { id: "name-desc", label: "Name Z–A" },
];

export const COMPLETION_OPTIONS: Array<{ id: CompletionId; label: string }> = [
  { id: "all", label: "Full Pokedex" },
  { id: "completed", label: "Caught only" },
  { id: "missing", label: "Missing only" },
];

export function seedPokemon(): PokemonEntry[] {
  return pokedex as PokemonEntry[];
}

export function allTypes(entries: PokemonEntry[]): string[] {
  return [...new Set(entries.flatMap((entry) => entry.types))].sort((left, right) => left.localeCompare(right));
}
