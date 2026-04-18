"use client";

import Image from "next/image";
import type { CSSProperties, FormEvent } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
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
};

type TcgGalleryPokemon = Pick<PokemonEntry, "id" | "name" | "number">;

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
  const [pageSize, setPageSize] = useState<number>(PAGE_SIZE_OPTIONS[0]);
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
  const tcgCaughtTotal = Object.values(tcgCaughtByUser[currentUser] ?? {}).filter(Boolean).length;
  const combinedCaughtTotal = stats.totalCaught + tcgCaughtTotal;
  const heroModeLabel = isCombinedProgress ? "Pokedex" : "All caught";

  const generationOptions = useMemo(
    () => ["All", ...[...new Set(entries.map((entry) => entry.generation))].sort((left, right) => left - right).map((value) => `Gen ${value}`)],
    [entries],
  );

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
      setTcgStatus(`${nextCaught ? "Caught" : "Missing"} ${card.name} from ${card.setName}.`);
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
          className={`quick-toggle-button ${completion === "all" ? "is-active" : ""}`}
          onClick={() => {
            setCompletion("all");
            setPage(1);
          }}
          aria-pressed={completion === "all"}
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
                  value={typeFilter}
                  onChange={(event) => {
                    setTypeFilter(event.target.value);
                    setPage(1);
                  }}
                >
                  <option value="All Types">All Types</option>
                  {types.map((type) => (
                    <option key={type} value={type}>{type}</option>
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
        <section className="main-card">
          <div className="main-toolbar">
            <input
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
                          src={entry.imageUrl}
                          alt={entry.name}
                          width={132}
                          height={132}
                          className="pokemon-image"
                          priority={index < 8}
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
      </div>
    </main>
  );
}
