import type { CompletionId, SortId, ThemeId } from "@/lib/seed";

export type ProgressState = {
  users: string[];
  currentUser: string;
  caughtByUser: Record<string, Record<string, boolean>>;
  theme: ThemeId;
  search: string;
  sortBy: SortId;
  generation: string;
  completion: CompletionId;
  typeFilter: string;
  pageSize: number;
  page: number;
  userColor: string;
};

const DEFAULT_USER = "Owen";

const THEME_IDS = new Set<ThemeId>(["auto", "light", "frappe", "nord", "everforest", "tokyo-night"]);
const SORT_IDS = new Set<SortId>(["number-asc", "number-desc", "name-asc", "name-desc"]);
const COMPLETION_IDS = new Set<CompletionId>(["all", "completed", "missing"]);

export const defaultProgressState: ProgressState = {
  users: [DEFAULT_USER],
  currentUser: DEFAULT_USER,
  caughtByUser: { [DEFAULT_USER]: {} },
  theme: "tokyo-night",
  search: "",
  sortBy: "number-asc",
  generation: "All",
  completion: "all",
  typeFilter: "All Types",
  pageSize: 32,
  page: 1,
  userColor: "#ff4f6d",
};

export function defaultProgressStateForUser(user: string): ProgressState {
  const name = user.trim() || DEFAULT_USER;
  return {
    ...defaultProgressState,
    users: [name],
    currentUser: name,
    caughtByUser: { [name]: {} },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function normalizeColor(value: unknown) {
  return typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value)
    ? value
    : defaultProgressState.userColor;
}

function normalizeCaughtByUser(value: unknown, users: string[]) {
  const next: Record<string, Record<string, boolean>> = {};
  const source = isRecord(value) ? value : {};

  for (const user of users) {
    const caught = isRecord(source[user]) ? source[user] : {};
    next[user] = {};

    for (const [pokemonId, isCaught] of Object.entries(caught)) {
      if (isCaught === true && /^\d+$/.test(pokemonId)) {
        next[user][pokemonId] = true;
      }
    }
  }

  return next;
}

export function normalizeProgressState(value: unknown): ProgressState {
  const source = isRecord(value) ? value : {};
  const users = Array.isArray(source.users)
    ? source.users.filter((user): user is string => typeof user === "string" && Boolean(user.trim())).map((user) => user.trim())
    : defaultProgressState.users;
  const uniqueUsers = [...new Set(users)].length ? [...new Set(users)] : defaultProgressState.users;
  const currentUser = typeof source.currentUser === "string" && uniqueUsers.includes(source.currentUser)
    ? source.currentUser
    : uniqueUsers[0];
  const theme = typeof source.theme === "string" && THEME_IDS.has(source.theme as ThemeId)
    ? source.theme as ThemeId
    : defaultProgressState.theme;
  const sortBy = typeof source.sortBy === "string" && SORT_IDS.has(source.sortBy as SortId)
    ? source.sortBy as SortId
    : defaultProgressState.sortBy;
  const completion = typeof source.completion === "string" && COMPLETION_IDS.has(source.completion as CompletionId)
    ? source.completion as CompletionId
    : defaultProgressState.completion;

  return {
    users: uniqueUsers,
    currentUser,
    caughtByUser: normalizeCaughtByUser(source.caughtByUser, uniqueUsers),
    theme,
    search: typeof source.search === "string" ? source.search : defaultProgressState.search,
    sortBy,
    generation: typeof source.generation === "string" ? source.generation : defaultProgressState.generation,
    completion,
    typeFilter: typeof source.typeFilter === "string" ? source.typeFilter : defaultProgressState.typeFilter,
    pageSize: typeof source.pageSize === "number" ? source.pageSize : defaultProgressState.pageSize,
    page: typeof source.page === "number" ? source.page : defaultProgressState.page,
    userColor: normalizeColor(source.userColor),
  };
}
