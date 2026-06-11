"use client";

import Image from "next/image";
import type { CSSProperties, FormEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  allTypes,
  COMPLETION_OPTIONS,
  GENERATION_NAMES,
  PAGE_SIZE_OPTIONS,
  seedPokemon,
  SORT_OPTIONS,
  THEMES,
  type CompletionId,
  type PokemonEntry,
  type SortId,
  type ThemeId,
} from "@/lib/seed";
import type { ProgressState } from "@/lib/progress";
import type { TcgCardPrice } from "@/lib/tcg-price";

const STORAGE_KEY = "pokemon-web:v1";
const TCG_STORAGE_KEY = "pokemon-web:tcg-cards:v1";
const DEFAULT_USER = "Owen";

const TYPE_ACCENTS: Record<string, string> = {
  Bug: "#8bd450",
  Dark: "#6f5d4a",
  Dragon: "#6c7cf5",
  Electric: "#f4c542",
  Fairy: "#f3a6d5",
  Fighting: "#d56723",
  Fire: "#ef7d57",
  Flying: "#93b2ff",
  Ghost: "#7b62a3",
  Grass: "#62c26f",
  Ground: "#c8a15a",
  Ice: "#73cec0",
  Normal: "#b6b29f",
  Poison: "#b468cf",
  Psychic: "#f26d91",
  Rock: "#b8a15b",
  Steel: "#8fa3b7",
  Water: "#5aa9f6",
};

const USER_COLOR_OPTIONS = [
  "#ff4f6d",
  "#f7768e",
  "#e0af68",
  "#9ece6a",
  "#5aa9f6",
  "#7aa2f7",
  "#bb9af7",
  "#f3a6d5",
] as const;

type PersistedState = Partial<ProgressState>;
type AuthUser = {
  id: string;
  username: string;
};

type CommunityAccount = {
  id: string;
  username: string;
  createdAt: string | null;
  updatedAt: string | null;
  progress: ProgressState;
};

type TcgCard = {
  id: string;
  name: string;
  setName: string;
  number: string;
  rarity: string | null;
  artist: string | null;
  imageUrl: string;
  price?: TcgCardPrice | null;
};

type TcgGalleryPokemon = Pick<PokemonEntry, "id" | "name" | "number">;
type AppView = "deck" | "expansions" | "types";
type BottomNavIconName = "deck" | "expansions" | "search" | "types" | "scan";

type ScanMatch = {
  id: string;
  name: string;
  setName: string;
  setId: string;
  number: string;
  imageUrl: string;
  distance: number;
  confidence: number;
  embedSimilarity?: number;
};

type EmbedMatch = {
  id: string;
  name: string;
  setName: string;
  setId: string;
  number: string;
  imageUrl: string;
  similarity: number;
  confidence: number;
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

function BottomNavIcon({ name }: { name: BottomNavIconName }) {
  if (name === "deck") {
    return (
      <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true" focusable="false">
        <rect x="6" y="3" width="12" height="18" rx="2.5" fill="none" stroke="currentColor" strokeWidth="2" />
        <path d="M9 7h6M9 17h6" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
        <circle cx="12" cy="12" r="2.4" fill="none" stroke="currentColor" strokeWidth="2" />
      </svg>
    );
  }

  if (name === "expansions") {
    return (
      <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true" focusable="false">
        <path d="m12 3 8 4-8 4-8-4 8-4Z" fill="none" stroke="currentColor" strokeLinejoin="round" strokeWidth="2" />
        <path d="m4 12 8 4 8-4M4 17l8 4 8-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
      </svg>
    );
  }

  if (name === "types") {
    return (
      <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true" focusable="false">
        <circle cx="8" cy="8.5" r="3.2" fill="none" stroke="currentColor" strokeWidth="2" />
        <circle cx="16" cy="8.5" r="3.2" fill="none" stroke="currentColor" strokeWidth="2" />
        <circle cx="12" cy="16" r="3.2" fill="none" stroke="currentColor" strokeWidth="2" />
      </svg>
    );
  }

  if (name === "scan") {
    return (
      <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true" focusable="false">
        <path
          d="M4 8.5V7a2 2 0 0 1 2-2h2.2L9.5 3.5h5L15.8 5H18a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8.5Z"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
        />
        <circle cx="12" cy="13" r="3.8" fill="none" stroke="currentColor" strokeWidth="2" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true" focusable="false">
      <circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="m16.5 16.5 4 4" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
    </svg>
  );
}

function formatExpansionDate(value: string | null) {
  if (!value) return "No release date";

  const date = new Date(`${value.replace(/\//g, "-")}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("en", {
    month: "short",
    year: "numeric",
  }).format(date);
}

function pokemonImageRoute(id: number) {
  return `/api/pokemon-image/${id}`;
}

function userColor(name: string): string {
  if (name.trim().toLowerCase() === "owen") {
    return "#ff4f6d";
  }
  let hash = 0;
  for (let index = 0; index < name.length; index += 1) {
    hash = (hash * 31 + name.charCodeAt(index)) >>> 0;
  }
  return `hsl(${hash % 360}, 70%, 56%)`;
}

function clampPage(page: number, totalPages: number) {
  return Math.min(Math.max(page, 1), Math.max(totalPages, 1));
}

function formatTcgPrice(price?: TcgCardPrice | null): string | null {
  if (!price) return null;
  const usd = (value: number) => `$${value.toFixed(2)}`;
  const { market, low, high } = price;
  const range = low != null && high != null && low !== high ? `${usd(low)}–${usd(high)}` : null;
  if (market != null) return range ? `${usd(market)} · ${range}` : usd(market);
  if (range) return range;
  const single = low ?? high;
  return single != null ? usd(single) : null;
}

function completionLabel(caught: number, total: number) {
  const missing = Math.max(total - caught, 0);
  if (!total) return "0% complete (0 missing)";
  return `${Math.round((caught / total) * 100)}% complete (${missing} missing)`;
}

export default function HomePage() {
  const [entries, setEntries] = useState<PokemonEntry[]>(() => seedPokemon());
  const [users, setUsers] = useState<string[]>([DEFAULT_USER]);
  const [currentUser, setCurrentUser] = useState<string>(DEFAULT_USER);
  const [caughtByUser, setCaughtByUser] = useState<Record<string, Record<string, boolean>>>({
    [DEFAULT_USER]: {},
  });
  const [theme, setTheme] = useState<ThemeId>("github-dark");
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<SortId>("number-asc");
  const [generation, setGeneration] = useState("All");
  const [completion, setCompletion] = useState<CompletionId>("all");
  const [typeFilter, setTypeFilter] = useState("All Types");
  const [pageSize, setPageSize] = useState<number>(0);
  const [page, setPage] = useState(1);
  const [selectedUserColor, setSelectedUserColor] = useState<string>(USER_COLOR_OPTIONS[0]);
  const [userAlias, setUserAlias] = useState(DEFAULT_USER);
  const [status, setStatus] = useState("Ready.");
  const [isSyncing, setIsSyncing] = useState(false);
  const [isHydrated, setIsHydrated] = useState(false);
  const [isRemoteProgressEnabled, setIsRemoteProgressEnabled] = useState(false);
  const [isRemoteProgressReady, setIsRemoteProgressReady] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");
  const [authUsername, setAuthUsername] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [isAuthLoading, setIsAuthLoading] = useState(false);
  const [authStatus, setAuthStatus] = useState("");
  const [isPeopleOpen, setIsPeopleOpen] = useState(false);
  const [isPeopleLoading, setIsPeopleLoading] = useState(false);
  const [peopleStatus, setPeopleStatus] = useState("");
  const [communityAccounts, setCommunityAccounts] = useState<CommunityAccount[]>([]);
  const [viewingAccount, setViewingAccount] = useState<CommunityAccount | null>(null);
  const [isColorPickerOpen, setIsColorPickerOpen] = useState(false);
  const [tcgGalleryPokemon, setTcgGalleryPokemon] = useState<TcgGalleryPokemon | null>(null);
  const [tcgCards, setTcgCards] = useState<TcgCard[]>([]);
  const [isTcgLoading, setIsTcgLoading] = useState(false);
  const [tcgStatus, setTcgStatus] = useState("");
  const [tcgCaughtByUser, setTcgCaughtByUser] = useState<Record<string, Record<string, boolean>>>({
    [DEFAULT_USER]: {},
  });
  const [previewTcgCard, setPreviewTcgCard] = useState<TcgCard | null>(null);
  const [isCombinedProgress, setIsCombinedProgress] = useState(false);
  const [activeView, setActiveView] = useState<AppView>("deck");
  const [expansions, setExpansions] = useState<TcgExpansion[]>([]);
  const [selectedExpansion, setSelectedExpansion] = useState<TcgExpansion | null>(null);
  const [expansionSearch, setExpansionSearch] = useState("");
  const [isExpansionsLoading, setIsExpansionsLoading] = useState(false);
  const [expansionsStatus, setExpansionsStatus] = useState("Expansion packs ready.");
  const [isExpansionCardsLoading, setIsExpansionCardsLoading] = useState(false);
  const [expansionCardsStatus, setExpansionCardsStatus] = useState("");
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [scanStatus, setScanStatus] = useState("Take a photo of a card to identify it.");
  const [scanPreviewUrl, setScanPreviewUrl] = useState<string | null>(null);
  const [scanMatches, setScanMatches] = useState<ScanMatch[]>([]);
  const [confirmedScanId, setConfirmedScanId] = useState<string | null>(null);
  const [scanCameraActive, setScanCameraActive] = useState(false);
  const [scanCameraError, setScanCameraError] = useState<string | null>(null);
  const [autoCaptureProgress, setAutoCaptureProgress] = useState(0);
  const deckSearchInputRef = useRef<HTMLInputElement>(null);
  const expansionSearchInputRef = useRef<HTMLInputElement>(null);
  const scanFileInputRef = useRef<HTMLInputElement>(null);
  const scanVideoRef = useRef<HTMLVideoElement>(null);
  const scanStreamRef = useRef<MediaStream | null>(null);
  const scanFrameTimerRef = useRef<number | null>(null);
  const scanLastHashRef = useRef<string>("");
  const scanSteadyCountRef = useRef<number>(0);
  const scanCapturedRef = useRef<boolean>(false);
  // Lazily loaded MobileNet model. Typed loose to avoid bundling tfjs types in
  // the main build; the dynamic import resolves the real module at runtime.
  const mobilenetModelRef = useRef<{
    infer: (input: HTMLCanvasElement | HTMLImageElement, embedding?: boolean) => {
      data: () => Promise<Float32Array>;
      dispose: () => void;
    };
  } | null>(null);
  const expansionCardsCacheRef = useRef<Map<string, { cards: TcgCard[]; status: string }>>(new Map());
  const ownCaught = caughtByUser[currentUser] ?? {};
  const viewingTrainer = viewingAccount?.progress.currentUser ?? "";
  const viewedCaught = viewingAccount
    ? viewingAccount.progress.caughtByUser[viewingTrainer] ?? {}
    : ownCaught;
  const isViewingReadOnly = Boolean(viewingAccount);
  const previewTcgCardIndex = previewTcgCard
    ? tcgCards.findIndex((card) => card.id === previewTcgCard.id)
    : -1;
  const canCyclePreview = previewTcgCardIndex >= 0 && tcgCards.length > 1;

  const cyclePreviewTcgCard = useCallback((direction: -1 | 1) => {
    if (previewTcgCardIndex < 0 || tcgCards.length < 2) return;
    const nextIndex = (previewTcgCardIndex + direction + tcgCards.length) % tcgCards.length;
    setPreviewTcgCard(tcgCards[nextIndex]);
  }, [previewTcgCardIndex, tcgCards]);

  useEffect(() => {
    if (!isSettingsOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsSettingsOpen(false);
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [isSettingsOpen]);

  useEffect(() => {
    if (!isScannerOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeScanner();
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isScannerOpen]);

  useEffect(() => {
    return () => {
      if (scanPreviewUrl && scanPreviewUrl.startsWith("blob:")) {
        URL.revokeObjectURL(scanPreviewUrl);
      }
    };
  }, [scanPreviewUrl]);

  useEffect(() => {
    if (!tcgGalleryPokemon) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && previewTcgCard) {
        setPreviewTcgCard(null);
        return;
      }
      if (event.key === "Escape") {
        setTcgGalleryPokemon(null);
        return;
      }
      if (!previewTcgCard) return;
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        cyclePreviewTcgCard(-1);
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        cyclePreviewTcgCard(1);
      }
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [cyclePreviewTcgCard, previewTcgCard, tcgGalleryPokemon]);

  const applyProgressState = useCallback((saved: PersistedState) => {
    if (saved.users?.length) setUsers(saved.users);
    if (saved.currentUser) setCurrentUser(saved.currentUser);
    if (saved.caughtByUser) setCaughtByUser(saved.caughtByUser);
    if (saved.theme) setTheme(saved.theme);
    if (typeof saved.search === "string") setSearch(saved.search);
    if (saved.sortBy) setSortBy(saved.sortBy);
    if (saved.generation) setGeneration(saved.generation);
    if (saved.completion) setCompletion(saved.completion);
    if (saved.typeFilter) setTypeFilter(saved.typeFilter);
    if (typeof saved.pageSize === "number") setPageSize(saved.pageSize);
    if (typeof saved.page === "number") setPage(saved.page);
    if (saved.userColor) setSelectedUserColor(saved.userColor);
    if (saved.userAlias) setUserAlias(saved.userAlias);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute("data-theme", theme);
  }, [theme]);

  useEffect(() => {
    if (process.env.NODE_ENV !== "development" || !("serviceWorker" in navigator)) return;

    void navigator.serviceWorker.getRegistrations().then((registrations) => {
      if (!registrations.length) return;

      registrations.forEach((registration) => {
        void registration.unregister();
      });

      if (navigator.serviceWorker.controller && !window.sessionStorage.getItem("pokemon-web:sw-cleaned")) {
        window.sessionStorage.setItem("pokemon-web:sw-cleaned", "true");
        window.location.reload();
      }
    });
  }, []);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        applyProgressState(JSON.parse(raw) as PersistedState);
      }
      const rawTcg = window.localStorage.getItem(TCG_STORAGE_KEY);
      if (rawTcg) {
        const parsed = JSON.parse(rawTcg) as Record<string, Record<string, boolean>>;
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          setTcgCaughtByUser(parsed);
        }
      }
    } catch {
      // ignore bad local state
    }
    setIsHydrated(true);
  }, [applyProgressState]);

  const loadRemoteProgress = useCallback(async () => {
      try {
        const response = await fetch("/api/progress", { cache: "no-store" });
        const payload = (await response.json()) as {
          configured: boolean;
          authenticated?: boolean;
          user?: AuthUser;
          progress?: ProgressState | null;
          message?: string;
        };

        setIsRemoteProgressEnabled(payload.configured);

        if (!response.ok) {
          if (response.status === 401 && payload.configured) {
            setAuthUser(null);
            setStatus(payload.message ?? "Sign in to save progress to the database.");
            return;
          }
          throw new Error(`Progress sync failed with status ${response.status}`);
        }

        if (payload.user) {
          setAuthUser(payload.user);
        }
        if (payload.configured && payload.progress) {
          applyProgressState(payload.progress);
          setStatus("Loaded shared progress from database.");
        } else if (payload.message) {
          setStatus(payload.message);
        }
      } catch {
        setIsRemoteProgressEnabled(false);
        setStatus("Using local browser progress.");
      } finally {
        setIsRemoteProgressReady(true);
      }
  }, [applyProgressState]);

  useEffect(() => {
    if (!isHydrated) return;

    let isCancelled = false;
    void loadRemoteProgress().then(() => {
      if (isCancelled) return;
    });
    return () => {
      isCancelled = true;
    };
  }, [isHydrated, loadRemoteProgress]);

  useEffect(() => {
    if (!isHydrated) return;
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        users,
        currentUser,
        caughtByUser,
        theme,
        search,
        sortBy,
        generation,
        completion,
        typeFilter,
        pageSize,
        page,
        userColor: selectedUserColor,
        userAlias,
      } satisfies PersistedState),
    );
  }, [isHydrated, users, currentUser, caughtByUser, theme, search, sortBy, generation, completion, typeFilter, pageSize, page, selectedUserColor, userAlias]);

  useEffect(() => {
    if (!isHydrated) return;
    window.localStorage.setItem(TCG_STORAGE_KEY, JSON.stringify(tcgCaughtByUser));
  }, [isHydrated, tcgCaughtByUser]);

  useEffect(() => {
    if (!isHydrated || !isRemoteProgressReady || !isRemoteProgressEnabled || !authUser) return;

    const progress: ProgressState = {
      users,
      currentUser,
      caughtByUser,
      theme,
      search,
      sortBy,
      generation,
      completion,
      typeFilter,
      pageSize,
      page,
      userColor: selectedUserColor,
      userAlias,
    };

    const timeout = window.setTimeout(() => {
      void fetch("/api/progress", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(progress),
      }).catch(() => {
        setStatus("Could not save to database. Local progress is still saved.");
      });
    }, 500);

    return () => window.clearTimeout(timeout);
  }, [authUser, caughtByUser, completion, currentUser, generation, isHydrated, isRemoteProgressEnabled, isRemoteProgressReady, page, pageSize, search, selectedUserColor, sortBy, theme, typeFilter, userAlias, users]);

  const syncPokedex = async () => {
    setIsSyncing(true);
    try {
      const response = await fetch("/api/pokedex", { cache: "no-store" });
      if (!response.ok) {
        throw new Error(`Sync failed with status ${response.status}`);
      }
      const payload = (await response.json()) as { entries: PokemonEntry[]; message: string };
      if (payload.entries?.length) {
        setEntries(payload.entries);
      }
      setStatus(payload.message);
    } catch {
      setEntries((current) => (current.length ? current : seedPokemon()));
      setStatus("Loaded bundled Pokedex data.");
    } finally {
      setIsSyncing(false);
    }
  };

  useEffect(() => {
    void syncPokedex();
  }, []);

  const types = useMemo(() => allTypes(entries), [entries]);

  useEffect(() => {
    if (!types.length) return;
    if (typeFilter !== "All Types" && !types.includes(typeFilter)) {
      setTypeFilter("All Types");
    }
  }, [typeFilter, types]);

  const filteredEntries = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    const next = entries.filter((entry) => {
      const matchesSearch =
        !normalizedSearch ||
        entry.name.toLowerCase().includes(normalizedSearch) ||
        entry.number.includes(normalizedSearch) ||
        entry.types.some((type) => type.toLowerCase().includes(normalizedSearch));

      const matchesGeneration =
        generation === "All" || entry.generation === Number(generation.replace("Gen ", ""));

      const isCaught = Boolean(viewedCaught[entry.id]);
      const matchesCompletion =
        completion === "all" ||
        (completion === "completed" && isCaught) ||
        (completion === "missing" && !isCaught);

      const matchesType = typeFilter === "All Types" || entry.types.includes(typeFilter);

      return matchesSearch && matchesGeneration && matchesCompletion && matchesType;
    });

    next.sort((left, right) => {
      switch (sortBy) {
        case "number-desc":
          return right.id - left.id;
        case "name-asc":
          return left.name.localeCompare(right.name);
        case "name-desc":
          return right.name.localeCompare(left.name);
        case "number-asc":
        default:
          return left.id - right.id;
      }
    });

    return next;
  }, [completion, entries, generation, search, sortBy, typeFilter, viewedCaught]);

  const totalPages = pageSize === 0 ? 1 : Math.max(1, Math.ceil(filteredEntries.length / pageSize));
  const safePage = clampPage(page, totalPages);

  useEffect(() => {
    if (page !== safePage) {
      setPage(safePage);
    }
  }, [page, safePage]);

  const visibleEntries = useMemo(() => {
    if (pageSize === 0) return filteredEntries;
    const start = (safePage - 1) * pageSize;
    return filteredEntries.slice(start, start + pageSize);
  }, [filteredEntries, pageSize, safePage]);

  const stats = useMemo(() => {
    const totalCaught = Object.values(viewedCaught).filter(Boolean).length;
    return {
      totalCaught,
      total: entries.length,
      percentage: entries.length ? Math.round((totalCaught / entries.length) * 100) : 0,
      visible: filteredEntries.length,
    };
  }, [entries.length, filteredEntries.length, viewedCaught]);

  const typeProgress = useMemo(() => {
    const counts = new Map<string, { caught: number; total: number }>();
    for (const type of types) {
      counts.set(type, { caught: 0, total: 0 });
    }
    for (const entry of entries) {
      const isCaught = Boolean(viewedCaught[entry.id]);
      for (const type of entry.types) {
        const bucket = counts.get(type);
        if (!bucket) continue;
        bucket.total += 1;
        if (isCaught) bucket.caught += 1;
      }
    }
    return types.map((type) => {
      const { caught, total } = counts.get(type) ?? { caught: 0, total: 0 };
      const percentage = total ? Math.round((caught / total) * 100) : 0;
      return { type, caught, total, percentage };
    });
  }, [entries, types, viewedCaught]);
  const tcgCaughtTotal = Object.values(tcgCaughtByUser[currentUser] ?? {}).filter(Boolean).length;
  const combinedCaughtTotal = stats.totalCaught + tcgCaughtTotal;
  const heroModeLabel = isCombinedProgress ? "Pokedex" : "All caught";
  const isShowingAllPokemon =
    completion === "all" &&
    generation === "All" &&
    typeFilter === "All Types" &&
    !search.trim() &&
    pageSize === 0;

  const generationOptions = useMemo(
    () => ["All", ...[...new Set(entries.map((entry) => entry.generation))].sort((left, right) => left - right).map((value) => `Gen ${value}`)],
    [entries],
  );

  const filteredExpansions = useMemo(() => {
    const normalizedSearch = expansionSearch.trim().toLowerCase();
    if (!normalizedSearch) return expansions;

    return expansions.filter((expansion) => {
      return (
        expansion.name.toLowerCase().includes(normalizedSearch) ||
        expansion.series.toLowerCase().includes(normalizedSearch) ||
        expansion.code.toLowerCase().includes(normalizedSearch)
      );
    });
  }, [expansionSearch, expansions]);

  const tcgCaughtBySet = useMemo(() => {
    const counts: Record<string, number> = {};
    const caught = tcgCaughtByUser[currentUser] ?? {};
    for (const [cardId, isCaught] of Object.entries(caught)) {
      if (!isCaught) continue;
      const separator = cardId.indexOf("-");
      if (separator <= 0) continue;
      const setId = cardId.slice(0, separator);
      counts[setId] = (counts[setId] ?? 0) + 1;
    }
    return counts;
  }, [tcgCaughtByUser, currentUser]);

  const setCaughtStatus = (pokemonId: number, nextCaught: boolean) => {
    setCaughtByUser((current) => {
      const currentUserCaught = { ...(current[currentUser] ?? {}) };
      if (nextCaught) {
        currentUserCaught[pokemonId] = true;
      } else {
        delete currentUserCaught[pokemonId];
      }
      return { ...current, [currentUser]: currentUserCaught };
    });

    const entry = entries.find((item) => item.id === pokemonId);
    if (entry) {
      setStatus(`${currentUser}: ${nextCaught ? "caught" : "removed"} ${entry.name}.`);
    }
  };

  const setTcgCaughtStatus = (cardId: string, nextCaught: boolean) => {
    setTcgCaughtByUser((current) => {
      const currentUserCaught = { ...(current[currentUser] ?? {}) };
      if (nextCaught) {
        currentUserCaught[cardId] = true;
      } else {
        delete currentUserCaught[cardId];
      }

      return {
        ...current,
        [currentUser]: currentUserCaught,
      };
    });

    const card = tcgCards.find((item) => item.id === cardId);
    if (card) {
      const message = `${nextCaught ? "Caught" : "Missing"} ${card.name} from ${card.setName}.`;
      setTcgStatus(message);
      if (selectedExpansion) {
        setExpansionCardsStatus(message);
      }
    }
  };

  const openTcgGallery = async (entry: PokemonEntry) => {
    setTcgGalleryPokemon({ id: entry.id, name: entry.name, number: entry.number });
    setTcgCards([]);
    setIsTcgLoading(true);
    setTcgStatus(`Loading ${entry.name} card images...`);

    try {
      const response = await fetch(`/api/tcg?number=${entry.id}&name=${encodeURIComponent(entry.name)}`, {
        cache: "no-store",
      });
      const payload = (await response.json()) as {
        cards?: TcgCard[];
        message?: string;
      };

      if (!response.ok) {
        throw new Error(payload.message ?? "Could not load cards.");
      }

      setTcgCards(payload.cards ?? []);
      setTcgStatus(payload.message ?? `Loaded ${payload.cards?.length ?? 0} card images.`);
    } catch {
      setTcgCards([]);
      setTcgStatus("Could not load card images right now.");
    } finally {
      setIsTcgLoading(false);
    }
  };

  const showDeck = () => {
    setActiveView("deck");
    setSelectedExpansion(null);
    setStatus(`Viewing ${currentUser}'s deck.`);
  };

  const showTypes = () => {
    setActiveView("types");
    setSelectedExpansion(null);
  };

  const openTypeDeck = (type: string) => {
    setTypeFilter(type);
    setPage(1);
    setActiveView("deck");
    setSelectedExpansion(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
    setStatus(type === "All Types" ? "Showing all types." : `Filtering deck by ${type}.`);
  };

  const showAllPokemon = () => {
    setSearch("");
    setGeneration("All");
    setCompletion("all");
    setTypeFilter("All Types");
    setPageSize(0);
    setPage(1);
    setActiveView("deck");
    setSelectedExpansion(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
    setStatus(`Showing all ${entries.length} Pokemon.`);
  };

  const showSearch = () => {
    if (activeView === "expansions") {
      expansionSearchInputRef.current?.focus();
      expansionSearchInputRef.current?.select();
      return;
    }

    setActiveView("deck");
    window.setTimeout(() => {
      deckSearchInputRef.current?.focus();
      deckSearchInputRef.current?.select();
    }, 0);
  };

  const stopCamera = useCallback(() => {
    if (scanFrameTimerRef.current !== null) {
      window.clearInterval(scanFrameTimerRef.current);
      scanFrameTimerRef.current = null;
    }
    const stream = scanStreamRef.current;
    if (stream) {
      for (const track of stream.getTracks()) {
        track.stop();
      }
      scanStreamRef.current = null;
    }
    if (scanVideoRef.current) {
      scanVideoRef.current.srcObject = null;
    }
    scanLastHashRef.current = "";
    scanSteadyCountRef.current = 0;
    scanCapturedRef.current = false;
    setScanCameraActive(false);
    setAutoCaptureProgress(0);
  }, []);

  const resetScannerState = useCallback(() => {
    stopCamera();
    setScanPreviewUrl((current) => {
      if (current && current.startsWith("blob:")) {
        URL.revokeObjectURL(current);
      }
      return null;
    });
    setScanMatches([]);
    setConfirmedScanId(null);
    setIsScanning(false);
    setScanCameraError(null);
    setScanStatus("Starting camera…");
  }, [stopCamera]);

  const startCamera = useCallback(async () => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setScanCameraError("Camera API not available in this browser.");
      setScanStatus("Tap to upload a photo instead.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1280 },
          height: { ideal: 1280 },
        },
        audio: false,
      });
      scanStreamRef.current = stream;
      setScanCameraActive(true);
      setScanCameraError(null);
      setScanStatus("Aim at the card. Hold steady to auto-capture.");

      // Wait until video element mounts and is ready.
      window.setTimeout(async () => {
        const video = scanVideoRef.current;
        if (!video) return;
        video.srcObject = stream;
        try {
          await video.play();
        } catch {
          // Some browsers need a user gesture; play will resume on next render.
        }
      }, 60);
    } catch (error) {
      console.warn("camera start failed", error);
      const message =
        error instanceof DOMException && error.name === "NotAllowedError"
          ? "Camera permission denied. Tap to upload a photo instead."
          : "Live camera unavailable. Tap to upload a photo instead.";
      setScanCameraError(message);
      setScanStatus(message);
    }
  }, []);

  const openScanner = () => {
    resetScannerState();
    setIsScannerOpen(true);
    void startCamera();
  };

  const closeScanner = () => {
    setIsScannerOpen(false);
    resetScannerState();
    if (scanFileInputRef.current) {
      scanFileInputRef.current.value = "";
    }
  };

  const loadImageFromBlob = (blob: Blob): Promise<HTMLImageElement> =>
    new Promise((resolve, reject) => {
      const objectUrl = URL.createObjectURL(blob);
      const image = new window.Image();
      image.onload = () => {
        URL.revokeObjectURL(objectUrl);
        resolve(image);
      };
      image.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error("Could not decode image."));
      };
      image.src = objectUrl;
    });

  // Client-side dHash matching the server-side build (9x8 grayscale, row
  // adjacency compare). Returns 16 hex chars representing a 64-bit hash. The
  // optional `rotationDegrees` rotates the cropped region so we can probe at
  // 0/90/180/270 in case the user holds the phone landscape.
  const computeDhashFromImage = (
    image: HTMLImageElement,
    crop?: { x: number; y: number; width: number; height: number },
    rotationDegrees: 0 | 90 | 180 | 270 = 0,
  ): string => {
    const canvas = document.createElement("canvas");
    canvas.width = 9;
    canvas.height = 8;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas not available.");

    const sourceX = crop?.x ?? 0;
    const sourceY = crop?.y ?? 0;
    const sourceW = crop?.width ?? image.naturalWidth;
    const sourceH = crop?.height ?? image.naturalHeight;

    if (rotationDegrees === 0) {
      ctx.drawImage(image, sourceX, sourceY, sourceW, sourceH, 0, 0, 9, 8);
    } else {
      // Render the (cropped) source into an intermediate canvas at a sane
      // size, then rotate that into the 9x8 target. Avoids floating point
      // weirdness with very small rotated draws.
      const intermediate = document.createElement("canvas");
      intermediate.width = 72;
      intermediate.height = 72;
      const ictx = intermediate.getContext("2d");
      if (!ictx) throw new Error("Canvas not available.");
      ictx.drawImage(image, sourceX, sourceY, sourceW, sourceH, 0, 0, 72, 72);

      ctx.save();
      ctx.translate(4.5, 4);
      ctx.rotate((rotationDegrees * Math.PI) / 180);
      ctx.drawImage(intermediate, -4.5, -4, 9, 8);
      ctx.restore();
    }

    const { data } = ctx.getImageData(0, 0, 9, 8);
    const gray = new Uint8Array(72);
    for (let i = 0; i < 72; i += 1) {
      const r = data[i * 4];
      const g = data[i * 4 + 1];
      const b = data[i * 4 + 2];
      gray[i] = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
    }

    let bits = "";
    for (let y = 0; y < 8; y += 1) {
      for (let x = 0; x < 8; x += 1) {
        bits += gray[y * 9 + x] < gray[y * 9 + x + 1] ? "1" : "0";
      }
    }

    let hex = "";
    for (let i = 0; i < 64; i += 4) {
      hex += parseInt(bits.slice(i, i + 4), 2).toString(16);
    }
    return hex;
  };

  // Card aspect is 63:88 (~0.716). Crop a centered rectangle of that aspect
  // from the captured photo so the hash isn't polluted by table / hand.
  const centerCardCrop = (image: HTMLImageElement) => {
    const cardRatio = 63 / 88;
    const imgRatio = image.naturalWidth / image.naturalHeight;
    let width: number;
    let height: number;
    if (imgRatio > cardRatio) {
      height = image.naturalHeight;
      width = Math.round(height * cardRatio);
    } else {
      width = image.naturalWidth;
      height = Math.round(width / cardRatio);
    }
    const x = Math.round((image.naturalWidth - width) / 2);
    const y = Math.round((image.naturalHeight - height) / 2);
    return { x, y, width, height };
  };

  // Tighter crop matching the on-screen aim rectangle (~72% of the smaller
  // dimension, at card aspect). Used in addition to the full-frame crop above.
  const aimRectCrop = (image: HTMLImageElement) => {
    const cardRatio = 63 / 88;
    const smaller = Math.min(image.naturalWidth, image.naturalHeight);
    const target = smaller * 0.72;
    let width = target * cardRatio;
    let height = target;
    if (height > image.naturalHeight) {
      height = image.naturalHeight;
      width = height * cardRatio;
    }
    if (width > image.naturalWidth) {
      width = image.naturalWidth;
      height = width / cardRatio;
    }
    return {
      x: Math.round((image.naturalWidth - width) / 2),
      y: Math.round((image.naturalHeight - height) / 2),
      width: Math.round(width),
      height: Math.round(height),
    };
  };

  const normalizeText = (value: string): string =>
    value
      .toLowerCase()
      .replace(/[‘’“”]/g, "")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();

  const tokenizeText = (value: string): Set<string> => {
    const stop = new Set([
      "the",
      "and",
      "for",
      "this",
      "that",
      "from",
      "with",
      "hp",
      "ex",
      "gx",
      "vmax",
      "vstar",
      "pokemon",
      "stage",
      "basic",
      "evolves",
      "weakness",
      "resistance",
      "retreat",
      "energy",
      "trainer",
      "ability",
      "attack",
      "damage",
    ]);
    return new Set(
      normalizeText(value)
        .split(" ")
        .filter((token) => token.length >= 3 && !stop.has(token)),
    );
  };

  const ocrFromBlob = async (blob: Blob): Promise<string> => {
    try {
      const tesseract = await import("tesseract.js");
      const result = await tesseract.recognize(blob, "eng");
      return result.data.text ?? "";
    } catch (error) {
      console.warn("ocr failed", error);
      return "";
    }
  };

  const loadMobileNet = async () => {
    if (mobilenetModelRef.current) return mobilenetModelRef.current;
    const [tf, mobilenet] = await Promise.all([
      import("@tensorflow/tfjs"),
      import("@tensorflow-models/mobilenet"),
    ]);
    await tf.ready();
    const model = await mobilenet.load({ version: 2, alpha: 1.0 });
    mobilenetModelRef.current = model as unknown as typeof mobilenetModelRef.current extends infer T
      ? T
      : never;
    return mobilenetModelRef.current!;
  };

  const extractEmbedding = async (
    image: HTMLImageElement,
    crop: { x: number; y: number; width: number; height: number },
  ): Promise<number[] | null> => {
    try {
      const canvas = document.createElement("canvas");
      canvas.width = 224;
      canvas.height = 224;
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;
      ctx.drawImage(image, crop.x, crop.y, crop.width, crop.height, 0, 0, 224, 224);

      const model = await loadMobileNet();
      const tensor = model.infer(canvas, true);
      const data = await tensor.data();
      tensor.dispose();
      return Array.from(data);
    } catch (error) {
      console.warn("mobilenet failed", error);
      return null;
    }
  };

  const runScan = async (file: Blob) => {
    setIsScanning(true);
    setScanMatches([]);
    setConfirmedScanId(null);
    setScanStatus("Analysing photo...");

    setScanPreviewUrl((current) => {
      if (current && current.startsWith("blob:")) {
        URL.revokeObjectURL(current);
      }
      return URL.createObjectURL(file);
    });

    try {
      const image = await loadImageFromBlob(file);
      const fullCrop = { x: 0, y: 0, width: image.naturalWidth, height: image.naturalHeight };
      const centerCrop = centerCardCrop(image);
      const aimCrop = aimRectCrop(image);

      const rotations: Array<0 | 90 | 180 | 270> = [0, 90, 180, 270];
      const hashSet = new Set<string>();
      for (const crop of [aimCrop, centerCrop, fullCrop]) {
        for (const rotation of rotations) {
          hashSet.add(computeDhashFromImage(image, crop, rotation));
        }
      }
      const hashes = [...hashSet];

      setScanStatus("Loading visual model…");

      const embeddingPromise = extractEmbedding(image, aimCrop);

      setScanStatus("Matching against the card library…");

      const hashRequest = fetch("/api/scan-match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hashes, topN: 25 }),
      }).then((response) => response.json()) as Promise<{
        matches?: ScanMatch[];
        message?: string;
      }>;

      const embeddingRequest = embeddingPromise.then(async (embedding) => {
        if (!embedding) {
          return { matches: [] as EmbedMatch[], message: "embedding skipped" };
        }
        const response = await fetch("/api/scan-embed", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ embedding, topN: 25 }),
        });
        return (await response.json()) as { matches?: EmbedMatch[]; message?: string };
      });

      const [hashResult, embedResult, ocrText] = await Promise.all([
        hashRequest,
        embeddingRequest,
        ocrFromBlob(file),
      ]);

      const hashMatches = hashResult?.matches ?? [];
      const embedMatches = embedResult?.matches ?? [];

      if (!hashMatches.length && !embedMatches.length) {
        setScanStatus(
          embedResult?.message ??
            hashResult?.message ??
            "No close matches. Try a sharper, glare-free photo of the full card.",
        );
        return;
      }

      // Merge candidates by id, carrying whatever signals we have for each.
      type Candidate = {
        id: string;
        name: string;
        setName: string;
        setId: string;
        number: string;
        imageUrl: string;
        hashDistance: number | null;
        embedSim: number | null;
      };
      const merged = new Map<string, Candidate>();
      for (const match of hashMatches) {
        merged.set(match.id, {
          id: match.id,
          name: match.name,
          setName: match.setName,
          setId: match.setId,
          number: match.number,
          imageUrl: match.imageUrl,
          hashDistance: match.distance,
          embedSim: null,
        });
      }
      for (const match of embedMatches) {
        const existing = merged.get(match.id);
        if (existing) {
          existing.embedSim = match.similarity;
        } else {
          merged.set(match.id, {
            id: match.id,
            name: match.name,
            setName: match.setName,
            setId: match.setId,
            number: match.number,
            imageUrl: match.imageUrl,
            hashDistance: null,
            embedSim: match.similarity,
          });
        }
      }

      const ocrTokens = tokenizeText(ocrText);
      const scored = [...merged.values()].map((candidate) => {
        const nameTokens = tokenizeText(candidate.name);
        const setTokens = tokenizeText(candidate.setName);
        let nameHits = 0;
        for (const token of nameTokens) if (ocrTokens.has(token)) nameHits += 1;
        let setHits = 0;
        for (const token of setTokens) if (ocrTokens.has(token)) setHits += 1;
        const nameRatio = nameTokens.size ? nameHits / nameTokens.size : 0;
        const setRatio = setTokens.size ? setHits / setTokens.size : 0;

        // Hash: 1.0 at distance 0, decays to 0 by distance 32. Null → 0.
        const hashScore = candidate.hashDistance === null
          ? 0
          : Math.max(0, 1 - candidate.hashDistance / 32);

        // Embed cosine similarity is in [-1, 1]; clamp to [0, 1].
        const embedScore = candidate.embedSim === null
          ? 0
          : Math.max(0, candidate.embedSim);

        const ocrBoost = nameRatio * 0.7 + setRatio * 0.3;

        // MobileNet is the strongest signal; hash is the second; OCR rerank.
        const composite = embedScore * 0.6 + hashScore * 0.2 + ocrBoost * 0.2;

        return { candidate, composite, embedScore, hashScore, nameHits, ocrBoost };
      });
      scored.sort((left, right) => right.composite - left.composite);

      const ranked = scored.slice(0, 8).map(({ candidate, composite, embedScore }) => ({
        id: candidate.id,
        name: candidate.name,
        setName: candidate.setName,
        setId: candidate.setId,
        number: candidate.number,
        imageUrl: candidate.imageUrl,
        distance: candidate.hashDistance ?? 64,
        confidence: Math.round(composite * 100),
        embedSimilarity: embedScore,
      }));

      setScanMatches(ranked);

      const top = scored[0];
      const runnerUp = scored[1]?.composite ?? 0;
      const compositeLead = top.composite - runnerUp;
      const embedLead = top.embedScore - (scored[1]?.embedScore ?? 0);
      const ocrAgrees = top.nameHits > 0;

      const isStrong =
        (top.embedScore >= 0.85 && embedLead >= 0.05) ||
        (top.embedScore >= 0.7 && ocrAgrees && compositeLead >= 0.06) ||
        (top.hashScore >= 0.85 && compositeLead >= 0.08);

      if (isStrong) {
        setTcgCaughtStatus(top.candidate.id, true);
        setConfirmedScanId(top.candidate.id);
        setScanStatus(
          `Caught ${top.candidate.name} from ${top.candidate.setName} (${Math.round(
            top.composite * 100,
          )}% confidence).`,
        );
      } else {
        setScanStatus(
          `${ranked.length} candidate${ranked.length === 1 ? "" : "s"} found. Pick the right printing.`,
        );
      }
    } catch (error) {
      console.error(error);
      setScanStatus("Could not scan the card. Try again.");
    } finally {
      setIsScanning(false);
    }
  };


  const handleScanFile = (event: FormEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) return;
    void runScan(file);
    input.value = "";
  };

  const captureFromVideo = useCallback(async () => {
    const video = scanVideoRef.current;
    if (!video) return;
    const width = video.videoWidth;
    const height = video.videoHeight;
    if (!width || !height) return;

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);

    stopCamera();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.92),
    );
    if (!blob) {
      setScanStatus("Could not capture frame. Try again.");
      return;
    }
    await runScan(blob);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stopCamera]);

  // Frame-by-frame analysis: hash each ~150ms frame and watch for a steady
  // run of low-distance hashes. When the camera has been still long enough
  // we trigger the high-res capture.
  useEffect(() => {
    if (!scanCameraActive) return;

    const STEADY_FRAMES_NEEDED = 4;
    const FRAME_INTERVAL_MS = 160;
    const STEADY_DISTANCE = 3;

    const tick = () => {
      const video = scanVideoRef.current;
      if (!video || video.readyState < 2 || scanCapturedRef.current) return;
      if (video.videoWidth === 0) return;

      const small = document.createElement("canvas");
      small.width = 9;
      small.height = 8;
      const ctx = small.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(video, 0, 0, 9, 8);
      const { data } = ctx.getImageData(0, 0, 9, 8);
      const gray = new Uint8Array(72);
      for (let i = 0; i < 72; i += 1) {
        gray[i] = Math.round(
          0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2],
        );
      }
      let bits = "";
      for (let y = 0; y < 8; y += 1) {
        for (let x = 0; x < 8; x += 1) {
          bits += gray[y * 9 + x] < gray[y * 9 + x + 1] ? "1" : "0";
        }
      }
      let hex = "";
      for (let i = 0; i < 64; i += 4) {
        hex += parseInt(bits.slice(i, i + 4), 2).toString(16);
      }

      const previous = scanLastHashRef.current;
      if (previous) {
        let distance = 0;
        for (let i = 0; i < hex.length; i += 1) {
          let xor = parseInt(hex[i], 16) ^ parseInt(previous[i], 16);
          while (xor) {
            distance += xor & 1;
            xor >>= 1;
          }
        }
        if (distance <= STEADY_DISTANCE) {
          scanSteadyCountRef.current += 1;
        } else {
          scanSteadyCountRef.current = 0;
        }
      }
      scanLastHashRef.current = hex;

      const progress = Math.min(scanSteadyCountRef.current / STEADY_FRAMES_NEEDED, 1);
      setAutoCaptureProgress(progress);

      if (scanSteadyCountRef.current >= STEADY_FRAMES_NEEDED) {
        scanCapturedRef.current = true;
        setScanStatus("Captured. Identifying card…");
        void captureFromVideo();
      }
    };

    const id = window.setInterval(tick, FRAME_INTERVAL_MS);
    scanFrameTimerRef.current = id;
    return () => {
      window.clearInterval(id);
      if (scanFrameTimerRef.current === id) {
        scanFrameTimerRef.current = null;
      }
    };
  }, [scanCameraActive, captureFromVideo]);

  const confirmScanMatch = (match: ScanMatch) => {
    setTcgCaughtStatus(match.id, true);
    setConfirmedScanId(match.id);
    setScanStatus(`Caught ${match.name} from ${match.setName}.`);
  };

  const loadExpansions = async (force = false) => {
    setActiveView("expansions");
    setSelectedExpansion(null);

    if (!force && expansions.length > 0) {
      return;
    }

    setIsExpansionsLoading(true);
    setExpansionsStatus("Loading expansion packs...");

    try {
      const response = await fetch("/api/expansions", { cache: "no-store" });
      const payload = (await response.json()) as {
        expansions?: TcgExpansion[];
        message?: string;
      };

      if (!response.ok) {
        throw new Error(payload.message ?? "Could not load expansion packs.");
      }

      setExpansions(payload.expansions ?? []);
      setExpansionsStatus(payload.message ?? `Loaded ${payload.expansions?.length ?? 0} expansion packs.`);
    } catch {
      setExpansions([]);
      setExpansionsStatus("Could not load expansion packs right now.");
    } finally {
      setIsExpansionsLoading(false);
    }
  };

  const openExpansionCards = async (expansion: TcgExpansion) => {
    setSelectedExpansion(expansion);
    setPreviewTcgCard(null);
    window.scrollTo({ top: 0, behavior: "smooth" });

    const cached = expansionCardsCacheRef.current.get(expansion.id);
    if (cached) {
      setTcgCards(cached.cards);
      setExpansionCardsStatus(cached.status);
      setIsExpansionCardsLoading(false);
      return;
    }

    setTcgCards([]);
    setIsExpansionCardsLoading(true);
    setExpansionCardsStatus(`Loading ${expansion.name} cards...`);

    try {
      const response = await fetch(
        `/api/expansion-cards?setId=${encodeURIComponent(expansion.id)}&setName=${encodeURIComponent(expansion.name)}`,
        { cache: "no-store" },
      );
      const payload = (await response.json()) as {
        cards?: TcgCard[];
        message?: string;
      };

      if (!response.ok) {
        throw new Error(payload.message ?? "Could not load cards.");
      }

      const cards = payload.cards ?? [];
      const status = payload.message ?? `Loaded ${cards.length} ${expansion.name} cards.`;
      expansionCardsCacheRef.current.set(expansion.id, { cards, status });
      setTcgCards(cards);
      setExpansionCardsStatus(status);
    } catch {
      setTcgCards([]);
      setExpansionCardsStatus("Could not load cards right now.");
    } finally {
      setIsExpansionCardsLoading(false);
    }
  };

  const displayName = userAlias.trim() || currentUser;
  const viewedDisplayName = viewingAccount
    ? viewingAccount.progress.userAlias.trim() || viewingAccount.progress.currentUser || viewingAccount.username
    : displayName;
  const headerChipName = isViewingReadOnly ? viewedDisplayName : displayName;
  const headerChipLabel = isViewingReadOnly ? "Viewing" : "Tracking as";
  const headerChipColor = isViewingReadOnly ? userColor(headerChipName) : selectedUserColor;
  const pagerControls = pageSize === 0 ? null : (
    <div className="pager">
      <button
        type="button"
        className="pager-button"
        onClick={() => setPage((current) => clampPage(current - 1, totalPages))}
        disabled={safePage <= 1}
      >
        Prev
      </button>
      <span className="pager-meta">
        Page {safePage} / {totalPages}
      </span>
      <button
        type="button"
        className="pager-button"
        onClick={() => setPage((current) => clampPage(current + 1, totalPages))}
        disabled={safePage >= totalPages}
      >
        Next
      </button>
    </div>
  );

  const submitAuth = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsAuthLoading(true);
    setAuthStatus("");

    try {
      const response = await fetch("/api/auth", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          mode: authMode,
          username: authUsername,
          password: authPassword,
        }),
      });
      const payload = (await response.json()) as {
        user?: AuthUser;
        error?: string;
        message?: string;
      };

      if (!response.ok || !payload.user) {
        throw new Error(payload.error ?? "Could not sign in.");
      }

      setAuthUser(payload.user);
      setAuthPassword("");
      setAuthStatus(payload.message ?? "Signed in.");
      setStatus(`Signed in as ${payload.user.username}.`);
      await loadRemoteProgress();
    } catch (error) {
      setAuthStatus(error instanceof Error ? error.message : "Could not sign in.");
    } finally {
      setIsAuthLoading(false);
    }
  };

  const loadPeople = async () => {
    setIsPeopleOpen(true);
    setIsPeopleLoading(true);
    setPeopleStatus("");

    try {
      const response = await fetch("/api/community", { cache: "no-store" });
      const payload = (await response.json()) as {
        people?: CommunityAccount[];
        message?: string;
        error?: string;
      };

      if (!response.ok) {
        throw new Error(payload.message ?? payload.error ?? "Could not load other people.");
      }

      const people = payload.people ?? [];
      setCommunityAccounts(people);
      setPeopleStatus(people.length ? `${people.length} ${people.length === 1 ? "person" : "people"} found.` : "No other people have signed in yet.");
    } catch (error) {
      setPeopleStatus(error instanceof Error ? error.message : "Could not load other people.");
    } finally {
      setIsPeopleLoading(false);
    }
  };

  const viewCommunityAccount = (account: CommunityAccount) => {
    setViewingAccount(account);
    setPage(1);
    setIsSettingsOpen(false);
    setStatus(`Viewing ${account.username}'s cards.`);
  };

  const stopViewingAccount = () => {
    if (viewingAccount) {
      setStatus(`Back to ${currentUser}'s cards.`);
    }
    setViewingAccount(null);
    setPage(1);
  };

  const signOut = async () => {
    await fetch("/api/auth", { method: "DELETE" }).catch(() => undefined);
    setAuthUser(null);
    setViewingAccount(null);
    setCommunityAccounts([]);
    setIsPeopleOpen(false);
    setPeopleStatus("");
    setStatus("Signed out. Local browser progress is still available.");
    setIsSettingsOpen(false);
  };

  if (isRemoteProgressEnabled && isRemoteProgressReady && !authUser) {
    return (
      <main className="app-shell auth-shell">
        <section className="auth-card">
          <h1 className="app-title">Pokedex</h1>
          <p className="auth-copy">Sign in to save your progress from any device.</p>
          <form className="auth-form" onSubmit={submitAuth}>
            <div className="auth-tabs" role="tablist" aria-label="Account mode">
              <button
                type="button"
                className={`auth-tab ${authMode === "login" ? "is-active" : ""}`}
                onClick={() => {
                  setAuthMode("login");
                  setAuthStatus("");
                }}
              >
                Sign In
              </button>
              <button
                type="button"
                className={`auth-tab ${authMode === "signup" ? "is-active" : ""}`}
                onClick={() => {
                  setAuthMode("signup");
                  setAuthStatus("");
                }}
              >
                Create Account
              </button>
            </div>
            <input
              className="control"
              type="text"
              value={authUsername}
              onChange={(event) => setAuthUsername(event.target.value)}
              placeholder="Username"
              autoComplete="username"
            />
            <input
              className="control"
              type="password"
              value={authPassword}
              onChange={(event) => setAuthPassword(event.target.value)}
              placeholder="Password"
              autoComplete={authMode === "signup" ? "new-password" : "current-password"}
            />
            <button
              type="submit"
              className="action-button action-button-wide"
              disabled={isAuthLoading || !authUsername.trim() || authPassword.length < 8}
            >
              {isAuthLoading ? "Working..." : authMode === "signup" ? "Create Account" : "Sign In"}
            </button>
            {authStatus ? <p className="auth-status">{authStatus}</p> : null}
          </form>
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell">
      {activeView === "deck" ? (
        <>
          <header className="app-header">
            <div className="app-header-main">
              <h1 className="app-title">Pokedex</h1>
            </div>
            <div className="app-header-actions">
              <button
                type="button"
                className="picker-chip"
                style={{ borderColor: headerChipColor }}
                onClick={() => {
                  if (isViewingReadOnly) return;
                  if (users.length <= 1) return;
                  const idx = users.indexOf(currentUser);
                  const next = users[(idx + 1) % users.length];
                  setCurrentUser(next);
                  setStatus(`Switched to ${next}.`);
                }}
                aria-label={isViewingReadOnly ? `Viewing ${headerChipName}` : users.length > 1 ? "Switch trainer" : `Tracking as ${displayName}`}
                disabled={isViewingReadOnly || users.length <= 1}
              >
                <span className="picker-chip-avatar" aria-hidden="true" style={{ background: headerChipColor }}>
                  {headerChipName.charAt(0).toUpperCase()}
                </span>
                <span className="picker-chip-body">
                  <span className="picker-chip-label">{headerChipLabel}</span>
                  <span className="picker-chip-name" style={{ color: headerChipColor }}>
                    {headerChipName}
                  </span>
                </span>
              </button>
              {authUser ? (
                <button type="button" className="auth-user-chip" onClick={() => setIsSettingsOpen(true)}>
                  {authUser.username}
                </button>
              ) : null}
              <button
                type="button"
                className="settings-toggle"
                onClick={() => setIsSettingsOpen(true)}
                aria-label="Open settings"
              >
                <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false">
                  <path
                    fill="currentColor"
                    d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.56-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94 0 .31.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"
                  />
                </svg>
              </button>
            </div>
          </header>

          <section className={`hero-card ${isCombinedProgress ? "is-combined" : ""}`}>
            <button
              type="button"
              className="hero-mode-toggle"
              onClick={() => setIsCombinedProgress((current) => !current)}
              aria-pressed={isCombinedProgress}
            >
              {heroModeLabel}
            </button>
            <p className="hero-kicker">
              {isCombinedProgress
                ? "All Caught"
                : isViewingReadOnly && viewingAccount
                  ? `Viewing ${viewingAccount.username}`
                  : "Progress"}
            </p>
            <div className="hero-row">
              <h2 className="hero-value">
                {isCombinedProgress ? combinedCaughtTotal : stats.totalCaught}
                <span>{isCombinedProgress ? " total" : ` / ${stats.total}`}</span>
              </h2>
              <div className="hero-meter">
                <div className="hero-meter-bar" style={{ width: `${isCombinedProgress ? stats.percentage : stats.percentage}%` }} />
              </div>
            </div>
            <p className="hero-meta">
              {isCombinedProgress
                ? `${stats.totalCaught} Pokemon caught + ${tcgCaughtTotal} card variants caught`
                : completionLabel(stats.totalCaught, stats.total)}
            </p>
          </section>

          <div className="quick-toggle-row" aria-label="Pokemon visibility filter">
            <button
              type="button"
              className={`quick-toggle-button ${isShowingAllPokemon ? "is-active" : ""}`}
              onClick={showAllPokemon}
              aria-pressed={isShowingAllPokemon}
            >
              ALL
            </button>
            <button
              type="button"
              className={`quick-toggle-button ${completion === "completed" ? "is-active" : ""}`}
              onClick={() => {
                setCompletion("completed");
                setPage(1);
              }}
              aria-pressed={completion === "completed"}
            >
              CAUGHT
            </button>
            <button
              type="button"
              className={`quick-toggle-button ${completion === "missing" ? "is-active" : ""}`}
              onClick={() => {
                setCompletion("missing");
                setPage(1);
              }}
              aria-pressed={completion === "missing"}
            >
              MISSING
            </button>
          </div>

          {isViewingReadOnly && viewingAccount ? (
            <section className="viewing-banner" aria-live="polite">
              <div className="viewing-banner-copy">
                <span className="viewing-banner-kicker">Read-only cards</span>
                <strong>{viewedDisplayName}</strong>
              </div>
              <button type="button" className="action-button viewing-banner-button" onClick={stopViewingAccount}>
                Back to My Cards
              </button>
            </section>
          ) : null}
        </>
      ) : null}

      {isSettingsOpen ? (
        <div
          className="settings-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Settings"
          onClick={() => setIsSettingsOpen(false)}
        >
          <aside
            className="settings-panel sidebar-card"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="settings-panel-header">
              <h2 className="settings-panel-title">Settings</h2>
              <button
                type="button"
                className="settings-close"
                onClick={() => setIsSettingsOpen(false)}
                aria-label="Close settings"
              >
                <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
                  <path
                    fill="currentColor"
                    d="M18.3 5.71a1 1 0 0 0-1.41 0L12 10.59 7.11 5.7a1 1 0 1 0-1.41 1.41L10.59 12 5.7 16.89a1 1 0 1 0 1.41 1.41L12 13.41l4.89 4.89a1 1 0 0 0 1.41-1.41L13.41 12l4.89-4.89a1 1 0 0 0 0-1.4Z"
                  />
                </svg>
              </button>
            </header>

            <section className="sidebar-section">
              <h2 className="sidebar-heading">Trainer</h2>
              <select
                className="control"
                value={currentUser}
                onChange={(event) => {
                  setCurrentUser(event.target.value);
                  setStatus(`Switched to ${event.target.value}.`);
                }}
              >
                {users.map((user) => (
                  <option key={user} value={user}>{user}</option>
                ))}
              </select>
              <input
                className="control trainer-alias-control"
                type="text"
                value={userAlias}
                maxLength={24}
                onChange={(event) => {
                  setUserAlias(event.target.value);
                  setStatus("Alias updated.");
                }}
                placeholder={currentUser}
                aria-label="Trainer alias"
              />
              {authUser ? (
                <button type="button" className="action-button action-button-wide sign-out-button" onClick={() => void signOut()}>
                  Sign Out
                </button>
              ) : null}
            </section>

            <section className="sidebar-section">
              <h2 className="sidebar-heading">People</h2>
              <button
                type="button"
                className="action-button action-button-wide"
                onClick={() => void loadPeople()}
                disabled={isPeopleLoading}
              >
                {isPeopleLoading ? "Loading People..." : isPeopleOpen ? "Refresh People" : "Show People"}
              </button>
              {isPeopleOpen ? (
                <div className="people-panel">
                  {peopleStatus ? <p className="people-status">{peopleStatus}</p> : null}
                  {communityAccounts.length ? (
                    <div className="people-list">
                      {communityAccounts.map((account) => {
                        const accountTrainer = account.progress.currentUser;
                        const accountDisplayName = account.progress.userAlias.trim() || accountTrainer || account.username;
                        const accountCaught = Object.values(account.progress.caughtByUser[accountTrainer] ?? {}).filter(Boolean).length;
                        const isViewingAccount = viewingAccount?.id === account.id;

                        return (
                          <div key={account.id} className={`person-row ${isViewingAccount ? "is-current" : ""}`}>
                            <div className="person-meta">
                              <span className="person-name">{account.username}</span>
                              <span className="person-progress">
                                {accountDisplayName} · {accountCaught} caught
                              </span>
                            </div>
                            <button
                              type="button"
                              className="person-view-button"
                              onClick={() => viewCommunityAccount(account)}
                              disabled={isViewingAccount}
                            >
                              {isViewingAccount ? "Viewing" : "View Cards"}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </section>

            <section className="sidebar-section">
              <h2 className="sidebar-heading">Trainer Color</h2>
              <button
                type="button"
                className="color-picker-toggle"
                onClick={() => setIsColorPickerOpen((current) => !current)}
                aria-expanded={isColorPickerOpen}
                aria-controls="trainer-color-options"
                aria-label="Choose trainer color"
                style={{ "--selected-color": selectedUserColor } as CSSProperties}
              />
              {isColorPickerOpen ? (
                <div id="trainer-color-options" className="color-picker-panel">
                  <div className="color-options" role="radiogroup" aria-label="Trainer color">
                    {USER_COLOR_OPTIONS.map((color) => (
                      <button
                        key={color}
                        type="button"
                        role="radio"
                        aria-checked={selectedUserColor === color}
                        className={`color-option ${selectedUserColor === color ? "is-active" : ""}`}
                        style={{ "--swatch-color": color } as CSSProperties}
                        onClick={() => {
                          setSelectedUserColor(color);
                          setIsColorPickerOpen(false);
                          setStatus("Trainer color updated.");
                        }}
                        aria-label={`Use color ${color}`}
                      />
                    ))}
                  </div>
                  <input
                    className="control color-input"
                    type="color"
                    value={selectedUserColor}
                    onChange={(event) => {
                      setSelectedUserColor(event.target.value);
                      setStatus("Trainer color updated.");
                    }}
                    aria-label="Custom trainer color"
                  />
                </div>
              ) : null}
            </section>

            <section className="sidebar-section">
              <h2 className="sidebar-heading">Filters</h2>
              <div className="filter-stack">
                <select className="control" value={sortBy} onChange={(event) => setSortBy(event.target.value as SortId)}>
                  {SORT_OPTIONS.map((option) => (
                    <option key={option.id} value={option.id}>{option.label}</option>
                  ))}
                </select>

                <select
                  className="control"
                  value={generation}
                  onChange={(event) => {
                    setGeneration(event.target.value);
                    setPage(1);
                  }}
                >
                  {generationOptions.map((option) => (
                    <option key={option} value={option}>
                      {option === "All" ? "All Generations" : `${option} · ${GENERATION_NAMES[Number(option.replace("Gen ", ""))]}`}
                    </option>
                  ))}
                </select>

                <select
                  className="control"
                  value={completion}
                  onChange={(event) => {
                    setCompletion(event.target.value as CompletionId);
                    setPage(1);
                  }}
                >
                  {COMPLETION_OPTIONS.map((option) => (
                    <option key={option.id} value={option.id}>{option.label}</option>
                  ))}
                </select>

                <select
                  className="control"
                  value={String(pageSize)}
                  onChange={(event) => {
                    setPageSize(Number(event.target.value));
                    setPage(1);
                  }}
                >
                  {PAGE_SIZE_OPTIONS.map((size) => (
                    <option key={size} value={size}>
                      {size === 0 ? "Show All" : `${size} per page`}
                    </option>
                  ))}
                </select>
              </div>
            </section>

            <section className="sidebar-section">
              <h2 className="sidebar-heading">Theme</h2>
              <div className="theme-options" role="radiogroup" aria-label="Theme">
                {THEMES.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    role="radio"
                    aria-checked={theme === option.id}
                    className={`theme-option ${theme === option.id ? "is-active" : ""}`}
                    onClick={() => {
                      setTheme(option.id);
                      setStatus(`Theme: ${option.label}.`);
                    }}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </section>

            <section className="sidebar-section">
              <button
                type="button"
                className="action-button action-button-wide"
                onClick={() => void syncPokedex()}
                disabled={isSyncing}
              >
                {isSyncing ? "Syncing..." : "Sync Pokedex"}
              </button>
            </section>
          </aside>
        </div>
      ) : null}

      {isScannerOpen ? (
        <div
          className="settings-overlay scan-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Scan a card"
          onClick={closeScanner}
        >
          <aside
            className="settings-panel sidebar-card scan-panel"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="settings-panel-header">
              <h2 className="settings-panel-title">Scan a Card</h2>
              <button
                type="button"
                className="settings-close"
                onClick={closeScanner}
                aria-label="Close scanner"
              >
                <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
                  <path
                    fill="currentColor"
                    d="M18.3 5.71a1 1 0 0 0-1.41 0L12 10.59 7.11 5.7a1 1 0 1 0-1.41 1.41L10.59 12 5.7 16.89a1 1 0 1 0 1.41 1.41L12 13.41l4.89 4.89a1 1 0 0 0 1.41-1.41L13.41 12l4.89-4.89a1 1 0 0 0 0-1.4Z"
                  />
                </svg>
              </button>
            </header>

            <input
              ref={scanFileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="scan-file-input"
              onChange={handleScanFile}
              aria-hidden="true"
            />

            <p className="scan-status">{scanStatus}</p>

            {scanCameraActive && !scanPreviewUrl ? (
              <div className="scan-camera">
                <video
                  ref={scanVideoRef}
                  className="scan-camera-video"
                  playsInline
                  muted
                  autoPlay
                />
                <div className="scan-aim" aria-hidden="true">
                  <span className="scan-aim-corner scan-aim-corner-tl" />
                  <span className="scan-aim-corner scan-aim-corner-tr" />
                  <span className="scan-aim-corner scan-aim-corner-bl" />
                  <span className="scan-aim-corner scan-aim-corner-br" />
                </div>
                <div
                  className="scan-aim-progress"
                  style={{ width: `${Math.round(autoCaptureProgress * 100)}%` }}
                  aria-hidden="true"
                />
                <button
                  type="button"
                  className="scan-capture-button"
                  onClick={() => {
                    if (scanCapturedRef.current) return;
                    scanCapturedRef.current = true;
                    void captureFromVideo();
                  }}
                  aria-label="Capture card now"
                >
                  <span className="scan-capture-ring" />
                </button>
              </div>
            ) : scanPreviewUrl ? (
              <div className="scan-preview">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={scanPreviewUrl} alt="Captured card" />
                {isScanning ? <div className="scan-preview-overlay">Scanning…</div> : null}
              </div>
            ) : (
              <div className="scan-empty">
                <button
                  type="button"
                  className="action-button action-button-wide"
                  onClick={() => scanFileInputRef.current?.click()}
                  disabled={isScanning}
                >
                  {scanCameraError ? "Upload a photo" : "Take a photo"}
                </button>
              </div>
            )}

            {scanPreviewUrl && !isScanning ? (
              <button
                type="button"
                className="scan-rescan-button"
                onClick={() => {
                  if (confirmedScanId) {
                    setTcgCaughtStatus(confirmedScanId, false);
                  }
                  resetScannerState();
                  void startCamera();
                }}
              >
                {confirmedScanId ? "Wrong card? Undo & rescan" : "Rescan"}
              </button>
            ) : null}

            {scanMatches.length ? (
              <section className="sidebar-section">
                <h2 className="sidebar-heading">Matches</h2>
                <div className="scan-match-list">
                  {scanMatches.map((match) => {
                    const isCaught = Boolean(tcgCaughtByUser[currentUser]?.[match.id]);
                    const isConfirmed = confirmedScanId === match.id;
                    return (
                      <article
                        key={match.id}
                        className={`scan-match-row ${isConfirmed ? "is-confirmed" : ""}`}
                      >
                        <Image
                          src={match.imageUrl}
                          alt={`${match.name} from ${match.setName}`}
                          width={88}
                          height={122}
                          className="scan-match-image"
                          sizes="88px"
                          unoptimized
                        />
                        <div className="scan-match-copy">
                          <h3>{match.name}</h3>
                          <p>{match.setName} · {match.number}</p>
                          <p className="scan-match-score">
                            {match.confidence}% match
                            {typeof match.embedSimilarity === "number"
                              ? ` · visual ${Math.round(match.embedSimilarity * 100)}%`
                              : ""}
                          </p>
                        </div>
                        <button
                          type="button"
                          className={`scan-match-button ${isCaught ? "is-caught" : ""}`}
                          onClick={() => confirmScanMatch(match)}
                          aria-pressed={isCaught}
                        >
                          {isCaught ? "Caught" : "Catch"}
                        </button>
                      </article>
                    );
                  })}
                </div>
              </section>
            ) : null}

          </aside>
        </div>
      ) : null}

      {tcgGalleryPokemon ? (
        <section
          className="tcg-gallery-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="tcg-gallery-title"
        >
          <div className="tcg-gallery-panel">
            <header className="tcg-gallery-header">
              <div>
                <p className="hero-kicker">TCG Cards</p>
                <h2 id="tcg-gallery-title" className="tcg-gallery-title">
                  {tcgGalleryPokemon.name} #{tcgGalleryPokemon.number}
                </h2>
                <p className="tcg-gallery-status">{tcgStatus}</p>
              </div>
              <button
                type="button"
                className="action-button tcg-gallery-back"
                onClick={() => {
                  setPreviewTcgCard(null);
                  setTcgGalleryPokemon(null);
                }}
              >
                Back
              </button>
            </header>

            {isTcgLoading ? (
              <div className="tcg-gallery-empty">Loading card images...</div>
            ) : tcgCards.length ? (
              <div className="tcg-card-grid">
                {tcgCards.map((card) => {
                  const isTcgCaught = Boolean(tcgCaughtByUser[currentUser]?.[card.id]);
                  const priceLabel = formatTcgPrice(card.price);

                  return (
                    <article
                      className={`tcg-card ${isTcgCaught ? "is-caught" : ""}`}
                      key={card.id}
                      onClick={() => setPreviewTcgCard(card)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          setPreviewTcgCard(card);
                        }
                      }}
                      aria-label={`View ${card.name} from ${card.setName}`}
                    >
                      <Image
                        src={card.imageUrl}
                        alt={`${card.name} from ${card.setName}`}
                        width={488}
                        height={680}
                        className="tcg-card-image"
                        sizes="(max-width: 700px) 45vw, (max-width: 1100px) 28vw, 220px"
                      />
                      <div className="tcg-card-meta">
                        <div className="tcg-card-copy">
                          <h3>{card.name}</h3>
                          <p>{card.setName} · {card.number}</p>
                          <p>{[card.rarity, card.artist].filter(Boolean).join(" · ")}</p>
                          {priceLabel ? <p className="tcg-card-price">{priceLabel}</p> : null}
                        </div>
                        <button
                          type="button"
                          className={`tcg-card-status-button ${isTcgCaught ? "is-caught" : ""}`}
                          onClick={(event) => {
                            event.stopPropagation();
                            setTcgCaughtStatus(card.id, !isTcgCaught);
                          }}
                          aria-pressed={isTcgCaught}
                          aria-label={`${isTcgCaught ? "Mark" : "Unmark"} ${card.name} from ${card.setName} ${isTcgCaught ? "missing" : "caught"}`}
                        >
                          {isTcgCaught ? "Caught" : "Missing"}
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="tcg-gallery-empty">{tcgStatus}</div>
            )}
          </div>
        </section>
      ) : null}

      {previewTcgCard ? (
        <section
          className="tcg-preview-overlay"
          role="dialog"
          aria-modal="true"
          aria-label={`${previewTcgCard.name} card preview`}
          onClick={() => setPreviewTcgCard(null)}
        >
          <button
            type="button"
            className="settings-close tcg-preview-close"
            onClick={() => setPreviewTcgCard(null)}
            aria-label="Close card preview"
          >
            ×
          </button>
          <button
            type="button"
            className={`tcg-preview-status-button ${tcgCaughtByUser[currentUser]?.[previewTcgCard.id] ? "is-caught" : ""}`}
            onClick={(event) => {
              event.stopPropagation();
              setTcgCaughtStatus(previewTcgCard.id, !tcgCaughtByUser[currentUser]?.[previewTcgCard.id]);
            }}
            aria-pressed={Boolean(tcgCaughtByUser[currentUser]?.[previewTcgCard.id])}
            aria-label={`${tcgCaughtByUser[currentUser]?.[previewTcgCard.id] ? "Mark" : "Unmark"} ${previewTcgCard.name} from ${previewTcgCard.setName} ${tcgCaughtByUser[currentUser]?.[previewTcgCard.id] ? "missing" : "caught"}`}
          >
            {tcgCaughtByUser[currentUser]?.[previewTcgCard.id] ? "Caught" : "Missing"}
          </button>
          {canCyclePreview ? (
            <>
              <button
                type="button"
                className="tcg-preview-nav tcg-preview-nav-prev"
                onClick={(event) => {
                  event.stopPropagation();
                  cyclePreviewTcgCard(-1);
                }}
                aria-label="View previous card"
              >
                ‹
              </button>
              <button
                type="button"
                className="tcg-preview-nav tcg-preview-nav-next"
                onClick={(event) => {
                  event.stopPropagation();
                  cyclePreviewTcgCard(1);
                }}
                aria-label="View next card"
              >
                ›
              </button>
            </>
          ) : null}
          <Image
            src={previewTcgCard.imageUrl}
            alt={`${previewTcgCard.name} from ${previewTcgCard.setName}`}
            width={734}
            height={1024}
            className="tcg-preview-image"
            onClick={(event) => event.stopPropagation()}
          />
        </section>
      ) : null}

      <div className="shell-grid">
        {activeView === "expansions" ? (
          <section className="main-card expansions-card">
            <header className="expansions-header">
              <div>
                <p className="hero-kicker">{selectedExpansion ? "Expansion Cards" : "Expansion Packs"}</p>
                <h2 className="section-title">All Expansions</h2>
                {selectedExpansion ? (
                  <p className="expansion-selected-title">{selectedExpansion.name}</p>
                ) : null}
              </div>
              <button
                type="button"
                className="action-button expansions-refresh-button"
                onClick={() => {
                  if (selectedExpansion) {
                    setSelectedExpansion(null);
                    setTcgCards([]);
                    setPreviewTcgCard(null);
                    setExpansionCardsStatus("");
                    return;
                  }

                  void loadExpansions(true);
                }}
                disabled={isExpansionsLoading || isExpansionCardsLoading}
              >
                {selectedExpansion ? "Back" : isExpansionsLoading ? "Loading..." : "Refresh"}
              </button>
            </header>

            {selectedExpansion ? (
              <>
                <p className="expansion-cards-status">
                  {isExpansionCardsLoading ? "Loading cards..." : expansionCardsStatus}
                </p>
                {isExpansionCardsLoading ? (
                  <div className="expansions-empty">Loading cards...</div>
                ) : tcgCards.length ? (
                  <div className="tcg-card-grid expansion-card-grid">
                    {tcgCards.map((card) => {
                      const isTcgCaught = Boolean(tcgCaughtByUser[currentUser]?.[card.id]);
                      const priceLabel = formatTcgPrice(card.price);

                      return (
                        <article
                          className={`tcg-card ${isTcgCaught ? "is-caught" : ""}`}
                          key={card.id}
                          onClick={() => setPreviewTcgCard(card)}
                          role="button"
                          tabIndex={0}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              setPreviewTcgCard(card);
                            }
                          }}
                          aria-label={`View ${card.name} from ${card.setName}`}
                        >
                          <Image
                            src={card.imageUrl}
                            alt={`${card.name} from ${card.setName}`}
                            width={488}
                            height={680}
                            className="tcg-card-image"
                            sizes="(max-width: 700px) 45vw, (max-width: 1100px) 28vw, 220px"
                          />
                          <div className="tcg-card-meta">
                            <div className="tcg-card-copy">
                              <h3>{card.name}</h3>
                              <p>{card.setName} · {card.number}</p>
                              <p>{[card.rarity, card.artist].filter(Boolean).join(" · ")}</p>
                              {priceLabel ? <p className="tcg-card-price">{priceLabel}</p> : null}
                            </div>
                            <button
                              type="button"
                              className={`tcg-card-status-button ${isTcgCaught ? "is-caught" : ""}`}
                              onClick={(event) => {
                                event.stopPropagation();
                                setTcgCaughtStatus(card.id, !isTcgCaught);
                              }}
                              aria-pressed={isTcgCaught}
                              aria-label={`${isTcgCaught ? "Mark" : "Unmark"} ${card.name} from ${card.setName} ${isTcgCaught ? "missing" : "caught"}`}
                            >
                              {isTcgCaught ? "Caught" : "Missing"}
                            </button>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                ) : (
                  <div className="expansions-empty">{expansionCardsStatus || "No cards loaded."}</div>
                )}
              </>
            ) : (
              <>
                <div className="expansions-toolbar">
                  <input
                    ref={expansionSearchInputRef}
                    className="control expansions-search-control"
                    type="search"
                    value={expansionSearch}
                    onChange={(event) => setExpansionSearch(event.target.value)}
                    placeholder="Search by name, series, or code"
                  />
                  <div className="toolbar-meta">
                    {isExpansionsLoading ? "Loading" : `${filteredExpansions.length} visible`}
                  </div>
                </div>

                {isExpansionsLoading ? (
                  <div className="expansions-empty">Loading expansion packs...</div>
                ) : filteredExpansions.length ? (
                  <div className="expansions-list">
                    {filteredExpansions.map((expansion) => {
                      const cardTotal = expansion.printedTotal ?? expansion.total;
                      const caughtCount = tcgCaughtBySet[expansion.id] ?? 0;
                      const isComplete = Boolean(cardTotal) && caughtCount >= (cardTotal ?? 0);

                      return (
                        <article
                          className="expansion-row"
                          key={expansion.id}
                          onClick={() => void openExpansionCards(expansion)}
                          role="button"
                          tabIndex={0}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              void openExpansionCards(expansion);
                            }
                          }}
                          aria-label={`View all cards in ${expansion.name}`}
                        >
                          <div className="expansion-art">
                            {expansion.logoUrl ? (
                              <Image
                                src={expansion.logoUrl}
                                alt={`${expansion.name} logo`}
                                width={176}
                                height={72}
                                className="expansion-logo"
                              />
                            ) : expansion.symbolUrl ? (
                              <Image
                                src={expansion.symbolUrl}
                                alt={`${expansion.name} symbol`}
                                width={56}
                                height={56}
                                className="expansion-symbol"
                              />
                            ) : (
                              <span>{expansion.code.slice(0, 3)}</span>
                            )}
                          </div>
                          <div className="expansion-copy">
                            <h3>{expansion.name}</h3>
                            <p>{expansion.series}</p>
                            <p>
                              {[cardTotal ? `${cardTotal} cards` : null, formatExpansionDate(expansion.releaseDate)]
                                .filter(Boolean)
                                .join(" · ")}
                            </p>
                          </div>
                          <div className="expansion-side">
                            <span className={`expansion-progress ${isComplete ? "is-complete" : ""}`}>
                              {caughtCount}/{cardTotal ?? "?"}
                            </span>
                            <span className="expansion-code">{expansion.code}</span>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                ) : (
                  <div className="expansions-empty">{expansionsStatus}</div>
                )}
              </>
            )}
          </section>
        ) : activeView === "types" ? (
          <section className="main-card expansions-card">
            <header className="expansions-header">
              <div>
                <p className="hero-kicker">Pokemon Types</p>
                <h2 className="section-title">All Types</h2>
              </div>
            </header>

            <div className="expansions-list">
              <article
                className="expansion-row type-list-row"
                key="__all"
                onClick={showAllPokemon}
                role="button"
                tabIndex={0}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    showAllPokemon();
                  }
                }}
                aria-label="View all Pokemon regardless of type"
              >
                <div
                  className="expansion-art type-art"
                  style={{
                    background:
                      "linear-gradient(135deg, color-mix(in srgb, var(--accent) 32%, transparent), color-mix(in srgb, var(--accent) 8%, transparent))",
                  }}
                >
                  <span className="type-art-label">ALL</span>
                </div>
                <div className="expansion-copy">
                  <h3>All Types</h3>
                  <p>Show every Pokemon</p>
                  <p>{stats.totalCaught} / {stats.total} caught · {stats.percentage}%</p>
                </div>
                <span className="expansion-code">ALL</span>
              </article>

              {typeProgress.map(({ type, caught, total, percentage }) => {
                const accent = TYPE_ACCENTS[type] ?? "#94a3b8";
                return (
                  <article
                    className="expansion-row type-list-row"
                    key={type}
                    onClick={() => openTypeDeck(type)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        openTypeDeck(type);
                      }
                    }}
                    aria-label={`View ${type} Pokemon`}
                  >
                    <div
                      className="expansion-art type-art"
                      style={{
                        background: `linear-gradient(135deg, color-mix(in srgb, ${accent} 60%, transparent), color-mix(in srgb, ${accent} 14%, transparent))`,
                        borderColor: accent,
                      }}
                    >
                      <span className="type-art-label">{type.slice(0, 3).toUpperCase()}</span>
                    </div>
                    <div className="expansion-copy">
                      <h3>{type}</h3>
                      <p>{caught} / {total} caught</p>
                      <p>{percentage}% complete</p>
                    </div>
                    <span
                      className="expansion-code type-code"
                      style={{ borderColor: accent, color: accent }}
                    >
                      {type.slice(0, 3).toUpperCase()}
                    </span>
                  </article>
                );
              })}
            </div>
          </section>
        ) : (
          <section className="main-card">
            <div className="main-toolbar">
              <input
                ref={deckSearchInputRef}
                className="control search-control"
                type="search"
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(1);
                }}
                placeholder="Search by name, number, or type"
              />
              <div className="toolbar-meta">{stats.visible} visible</div>
            </div>

            <div className="page-header">
              {pagerControls}
            </div>

            <div className="pokemon-grid">
              {visibleEntries.length ? (
                visibleEntries.map((entry, index) => {
                  const isCaught = Boolean(viewedCaught[entry.id]);
                  const cardContent = (
                    <>
                      <div className="pokemon-card-top">
                        <span className="pokemon-number">#{entry.number}</span>
                        <span className={`capture-pill ${isCaught ? "is-caught" : ""}`}>
                          {isCaught ? "Caught" : "Missing"}
                        </span>
                      </div>

                      <div className="pokemon-card-content">
                        <div className="pokemon-image-wrap">
                          <Image
                            src={pokemonImageRoute(entry.id)}
                            alt={entry.name}
                            width={132}
                            height={132}
                            className="pokemon-image"
                            priority={index < 8}
                            unoptimized
                          />
                        </div>

                        <div className="pokemon-card-body">
                          <h3 className="pokemon-name">{entry.name}</h3>
                          <p className="pokemon-region">
                            Gen {entry.generation} · {GENERATION_NAMES[entry.generation]}
                          </p>
                        </div>
                      </div>
                    </>
                  );
                  const typeActions = (
                    <div className="type-row pokemon-action-row">
                      {entry.types.map((type) => (
                        <span
                          key={type}
                          className="type-pill"
                          style={{ background: `color-mix(in srgb, ${TYPE_ACCENTS[type] ?? "#94a3b8"} 18%, var(--surface-strong))`, borderColor: TYPE_ACCENTS[type] ?? "#94a3b8" }}
                        >
                          {type}
                        </span>
                      ))}
                      <button
                        type="button"
                        className="pokemon-variations-link"
                        onClick={() => void openTcgGallery(entry)}
                        title={`Show ${entry.name} TCG cards`}
                        aria-label={`Show ${entry.name} TCG card images in this app`}
                      >
                        Cards
                      </button>
                    </div>
                  );

                  if (isViewingReadOnly) {
                    return (
                      <article
                        key={entry.id}
                        className={`pokemon-card ${isCaught ? "is-caught" : ""}`}
                        aria-label={`${entry.name} is ${isCaught ? "caught" : "missing"} for ${viewedDisplayName}`}
                      >
                        <div className={`pokemon-card-toggle is-read-only ${isCaught ? "is-caught" : ""}`}>
                          {cardContent}
                        </div>
                        {typeActions}
                      </article>
                    );
                  }

                  return (
                    <article
                      key={entry.id}
                      className={`pokemon-card ${isCaught ? "is-caught" : ""}`}
                    >
                      <button
                        type="button"
                        className={`pokemon-card-toggle ${isCaught ? "is-caught" : ""}`}
                        onClick={() => setCaughtStatus(entry.id, !isCaught)}
                        aria-pressed={isCaught}
                        aria-label={`${isCaught ? "Unmark" : "Mark"} ${entry.name} as caught`}
                      >
                        {cardContent}
                      </button>
                      {typeActions}
                    </article>
                  );
                })
              ) : (
                <div className="empty-state">No Pokemon match this filter set.</div>
              )}
            </div>
            {pagerControls ? <div className="page-footer">{pagerControls}</div> : null}
          </section>
        )}
      </div>

      <nav className="bottom-nav" aria-label="Primary card navigation">
        <button
          type="button"
          className={`bottom-nav-button ${activeView === "deck" ? "is-active" : ""}`}
          onClick={showDeck}
          aria-label="My deck"
          aria-pressed={activeView === "deck"}
          title="My deck"
        >
          <BottomNavIcon name="deck" />
        </button>
        <button
          type="button"
          className={`bottom-nav-button ${activeView === "expansions" ? "is-active" : ""}`}
          onClick={() => void loadExpansions()}
          aria-label="All expansion packs"
          aria-pressed={activeView === "expansions"}
          title="All expansion packs"
        >
          <BottomNavIcon name="expansions" />
        </button>
        <button
          type="button"
          className={`bottom-nav-button ${activeView === "types" ? "is-active" : ""}`}
          onClick={showTypes}
          aria-label="Pokemon types"
          aria-pressed={activeView === "types"}
          title="Pokemon types"
        >
          <BottomNavIcon name="types" />
        </button>
        <button
          type="button"
          className={`bottom-nav-button ${isScannerOpen ? "is-active" : ""}`}
          onClick={openScanner}
          aria-label="Scan a card"
          aria-pressed={isScannerOpen}
          title="Scan a card"
        >
          <BottomNavIcon name="scan" />
        </button>
        <button
          type="button"
          className="bottom-nav-button"
          onClick={showSearch}
          aria-label="Search"
          title="Search"
        >
          <BottomNavIcon name="search" />
        </button>
      </nav>
    </main>
  );
}
