from __future__ import annotations

import base64
import csv
import io
import json
from pathlib import Path
from typing import Iterable

import streamlit as st
import streamlit.components.v1 as components

import persistence


BASE_DIR = Path(__file__).parent
DATA_PATH = BASE_DIR / "data" / "pokedex.json"
PROGRESS_PATH = BASE_DIR / "data" / "progress.json"
APP_ICON_PATH = BASE_DIR / "app-icon.png"
DEFAULT_USER = "Owen"

GENERATION_NAMES = {
    1: "Kanto",
    2: "Johto",
    3: "Hoenn",
    4: "Sinnoh",
    5: "Unova",
    6: "Kalos",
    7: "Alola",
    8: "Galar",
    9: "Paldea",
}

# Paginated grid: keep page sizes bounded so cloud deploys do not render the full Pokédex at once.
PAGE_SIZE_OPTIONS: list[int] = [16, 32, 64]

# CSS variable bundles for apply_theme (light + dark + popular editor-style schemes).
THEME_PALETTES: dict[str, dict[str, str]] = {
    "light": {
        "bg": "#f8fafc",
        "surface": "#ffffff",
        "muted": "#eef2ff",
        "card": "#ffffff",
        "border": "#dbe4ff",
        "text": "#0f172a",
        "soft": "#475569",
        "accent": "#2563eb",
        "accent_2": "#10b981",
        "success_bg": "rgba(220, 252, 231, 0.96)",
        "success_bg_2": "rgba(240, 253, 244, 0.98)",
        "success_border": "#22c55e",
        "success_text": "#166534",
        "track": "rgba(148, 163, 184, 0.18)",
        "input_bg": "#ffffff",
        "shadow": "0 18px 48px rgba(37, 99, 235, 0.14)",
    },
    "dark": {
        "bg": "#303446",
        "surface": "#414559",
        "muted": "#51576d",
        "card": "#3a3f55",
        "border": "#626880",
        "text": "#c6d0f5",
        "soft": "#a5adce",
        "accent": "#8caaee",
        "accent_2": "#81c8be",
        "success_bg": "rgba(129, 200, 190, 0.22)",
        "success_bg_2": "rgba(166, 209, 137, 0.18)",
        "success_border": "#a6d189",
        "success_text": "#e5c890",
        "track": "rgba(165, 173, 206, 0.26)",
        "input_bg": "#292c3c",
        "shadow": "0 20px 60px rgba(17, 17, 27, 0.34)",
    },
    "nord": {
        "bg": "#2e3440",
        "surface": "#3b4252",
        "muted": "#434c5e",
        "card": "#3b4252",
        "border": "#4c566a",
        "text": "#eceff4",
        "soft": "#d8dee9",
        "accent": "#88c0d0",
        "accent_2": "#8fbcbb",
        "success_bg": "rgba(163, 190, 140, 0.22)",
        "success_bg_2": "rgba(143, 188, 187, 0.14)",
        "success_border": "#a3be8c",
        "success_text": "#eceff4",
        "track": "rgba(216, 222, 233, 0.12)",
        "input_bg": "#2e3440",
        "shadow": "0 18px 44px rgba(46, 52, 64, 0.55)",
    },
    "everforest": {
        "bg": "#2d353b",
        "surface": "#343f44",
        "muted": "#3d484d",
        "card": "#343f44",
        "border": "#475258",
        "text": "#d3c6aa",
        "soft": "#9da9a0",
        "accent": "#a7c080",
        "accent_2": "#7fbbb3",
        "success_bg": "rgba(167, 192, 128, 0.18)",
        "success_bg_2": "rgba(127, 187, 179, 0.12)",
        "success_border": "#a7c080",
        "success_text": "#d3c6aa",
        "track": "rgba(157, 169, 160, 0.2)",
        "input_bg": "#2d353b",
        "shadow": "0 18px 48px rgba(20, 25, 28, 0.45)",
    },
    "tokyo_night": {
        "bg": "#1a1b26",
        "surface": "#24283b",
        "muted": "#292e42",
        "card": "#24283b",
        "border": "#3b4261",
        "text": "#c0caf5",
        "soft": "#a9b1d6",
        "accent": "#7aa2f7",
        "accent_2": "#bb9af7",
        "success_bg": "rgba(158, 206, 106, 0.16)",
        "success_bg_2": "rgba(122, 162, 247, 0.1)",
        "success_border": "#9ece6a",
        "success_text": "#c0caf5",
        "track": "rgba(86, 95, 137, 0.35)",
        "input_bg": "#16161e",
        "shadow": "0 20px 56px rgba(0, 0, 0, 0.5)",
    },
    "kanagawa": {
        "bg": "#1f1f28",
        "surface": "#2a2a37",
        "muted": "#363646",
        "card": "#2a2a37",
        "border": "#54546d",
        "text": "#dcd7ba",
        "soft": "#c8c093",
        "accent": "#7e9cd8",
        "accent_2": "#957fb8",
        "success_bg": "rgba(106, 149, 137, 0.2)",
        "success_bg_2": "rgba(125, 103, 207, 0.12)",
        "success_border": "#6a9589",
        "success_text": "#dcd7ba",
        "track": "rgba(200, 192, 147, 0.12)",
        "input_bg": "#16161d",
        "shadow": "0 20px 56px rgba(0, 0, 0, 0.55)",
    },
}

THEME_LABELS: list[tuple[str, str]] = [
    ("light", "Light"),
    ("dark", "Catppuccin Frappe"),
    ("nord", "Nord"),
    ("everforest", "Everforest"),
    ("tokyo_night", "Tokyo Night"),
    ("kanagawa", "Kanagawa"),
]

THEME_LABEL_BY_KEY = dict(THEME_LABELS)

# Persisted preferences for Owen.
PREFS_KEYS: tuple[str, ...] = (
    "theme",
    "search",
    "sort_by",
    "generation",
    "completion",
    "type_filter",
    "page_size",
    "grid_page",
)

TYPE_COLORS = {
    "Normal": ("#d6d3d1", "#292524"),
    "Fire": ("#fb7185", "#fff1f2"),
    "Water": ("#60a5fa", "#eff6ff"),
    "Electric": ("#facc15", "#422006"),
    "Grass": ("#4ade80", "#052e16"),
    "Ice": ("#67e8f9", "#083344"),
    "Fighting": ("#f97316", "#fff7ed"),
    "Poison": ("#c084fc", "#2e1065"),
    "Ground": ("#f59e0b", "#451a03"),
    "Flying": ("#93c5fd", "#172554"),
    "Psychic": ("#f9a8d4", "#500724"),
    "Bug": ("#a3e635", "#1a2e05"),
    "Rock": ("#ca8a04", "#fefce8"),
    "Ghost": ("#a78bfa", "#1e1b4b"),
    "Dragon": ("#818cf8", "#1e1b4b"),
    "Dark": ("#57534e", "#fafaf9"),
    "Steel": ("#94a3b8", "#0f172a"),
    "Fairy": ("#f9a8d4", "#500724"),
}


st.set_page_config(
    page_title="Pokédex Checklist",
    page_icon=str(APP_ICON_PATH),
    layout="wide",
    initial_sidebar_state="expanded",
)
st.set_option("client.toolbarMode", "minimal")


@st.cache_resource
def _ensure_database() -> bool:
    """Initialize PostgreSQL engine when DATABASE_URL is configured; return True if using DB."""
    url = persistence.get_database_url()
    if not url:
        return False
    persistence.init_db_engine(url)
    return True


@st.cache_data
def load_pokedex(_data_version: int) -> list[dict]:
    return json.loads(DATA_PATH.read_text())


def gather_session_preferences() -> dict[str, object]:
    prefs = {k: st.session_state.get(k) for k in PREFS_KEYS}
    if "search_header" in st.session_state and isinstance(st.session_state.search_header, str):
        prefs["search"] = st.session_state.search_header
    return prefs


def apply_session_preferences(prefs: dict[str, object]) -> None:
    if not prefs:
        return
    t = prefs.get("theme")
    if isinstance(t, str) and t in THEME_PALETTES:
        st.session_state.theme = t
        st.session_state.theme_picker = t
    if "search" in prefs and isinstance(prefs["search"], str):
        st.session_state.search = prefs["search"]
        st.session_state.search_header = prefs["search"]
    elif "search_prefix" in prefs and isinstance(prefs["search_prefix"], str):
        st.session_state.search = prefs["search_prefix"]
        st.session_state.search_header = prefs["search_prefix"]
    sb = prefs.get("sort_by")
    if isinstance(sb, str) and sb in ("number-asc", "number-desc", "name-asc", "name-desc"):
        st.session_state.sort_by = sb
    gen = prefs.get("generation")
    if isinstance(gen, str):
        st.session_state.generation = gen
    comp = prefs.get("completion")
    if isinstance(comp, str):
        st.session_state.completion = comp
    type_filter = prefs.get("type_filter")
    if isinstance(type_filter, str):
        st.session_state.type_filter = type_filter
    else:
        stypes = prefs.get("selected_types")
        if isinstance(stypes, list) and stypes:
            st.session_state.type_filter = str(stypes[0])
    ps = prefs.get("page_size")
    if ps in PAGE_SIZE_OPTIONS or (isinstance(ps, int) and ps in PAGE_SIZE_OPTIONS):
        st.session_state.page_size = ps
    elif isinstance(ps, str) and ps.isdigit():
        n = int(ps)
        if n in PAGE_SIZE_OPTIONS:
            st.session_state.page_size = n
    gp = prefs.get("grid_page")
    if isinstance(gp, int) and gp >= 1:
        st.session_state.grid_page = gp
    elif isinstance(gp, str) and gp.isdigit():
        st.session_state.grid_page = max(1, int(gp))


def read_full_store() -> tuple[str, dict[str, dict[int, bool]], dict[str, dict[str, object]]]:
    _ensure_database()
    if persistence.db_engine_ready():
        return persistence.db_read_full(DEFAULT_USER)
    return persistence.file_read_full(PROGRESS_PATH, DEFAULT_USER)


def migrate_to_single_user(
    current_user: str,
    users: dict[str, dict[int, bool]],
    prefs_map: dict[str, dict[str, object]] | None = None,
) -> tuple[str, dict[str, dict[int, bool]], dict[str, dict[str, object]], bool]:
    prefs = dict(prefs_map or {})
    if list(users.keys()) == [DEFAULT_USER] and set(prefs.keys()) <= {DEFAULT_USER} and current_user == DEFAULT_USER:
        return current_user, users, prefs, False

    owen_progress = dict(users.get(DEFAULT_USER, {}))
    owen_prefs = dict(prefs.get(DEFAULT_USER, {}))
    return DEFAULT_USER, {DEFAULT_USER: owen_progress}, {DEFAULT_USER: owen_prefs}, True


def write_progress_store(progress: dict[int, bool]) -> None:
    prefs = gather_session_preferences()
    if persistence.db_engine_ready():
        persistence.db_write_full(DEFAULT_USER, {DEFAULT_USER: progress}, prefs)
    else:
        persistence.file_write_full(PROGRESS_PATH, DEFAULT_USER, {DEFAULT_USER: progress}, prefs)


def save_preferences_only() -> None:
    if st.session_state.shared_mode:
        return
    prefs = gather_session_preferences()
    snap = json.dumps(prefs, sort_keys=True, default=str)
    if persistence.db_engine_ready():
        persistence.db_save_preferences_only(DEFAULT_USER, prefs)
    else:
        persistence.file_save_preferences_only(PROGRESS_PATH, DEFAULT_USER, DEFAULT_USER, prefs)
    st.session_state._last_saved_prefs_snap = snap


def autosave_preferences_if_needed() -> None:
    if st.session_state.get("shared_mode"):
        return
    snap = json.dumps(gather_session_preferences(), sort_keys=True, default=str)
    if snap != st.session_state.get("_last_saved_prefs_snap"):
        save_preferences_only()


def get_display_name(pokemon: dict, language: str) -> str:
    return pokemon.get("names", {}).get(language) or pokemon.get("name", "Unknown")


def encode_share_state(progress: dict[int, bool]) -> str:
    selected_ids = sorted(int(pid) for pid, checked in progress.items() if checked)
    payload = json.dumps(selected_ids, separators=(",", ":")).encode("utf-8")
    return base64.urlsafe_b64encode(payload).decode("ascii")


def decode_share_state(token: str) -> dict[int, bool]:
    padding = "=" * (-len(token) % 4)
    payload = base64.urlsafe_b64decode(token + padding)
    ids = json.loads(payload.decode("utf-8"))
    return {int(pid): True for pid in ids}


def progress_to_csv(progress: dict[int, bool], pokemon: Iterable[dict], language: str) -> str:
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(["Pokedex Number", "Name", "Collected"])
    for entry in pokemon:
        writer.writerow(
            [
                entry["number"],
                get_display_name(entry, language),
                "true" if progress.get(entry["id"], False) else "false",
            ]
        )
    return buffer.getvalue()


def ensure_state() -> None:
    defaults = {
        "theme": "tokyo_night",
        "search": "",
        "number_filter": "All",
        "sort_by": "number-asc",
        "generation": "All",
        "completion": "Full Pokédex",
        "type_filter": "All Types",
        "page_size": PAGE_SIZE_OPTIONS[0],
        "grid_page": 1,
    }
    for key, value in defaults.items():
        if key not in st.session_state:
            st.session_state[key] = value

    if st.session_state.get("theme") not in THEME_PALETTES:
        st.session_state.theme = "tokyo_night"
    if st.session_state.get("page_size") not in PAGE_SIZE_OPTIONS:
        st.session_state.page_size = PAGE_SIZE_OPTIONS[0]
    if st.session_state.get("theme_picker") not in THEME_PALETTES:
        st.session_state.theme_picker = st.session_state.theme
    if "search_header" not in st.session_state:
        st.session_state.search_header = st.session_state.search

    if "progress" not in st.session_state or "shared_mode" not in st.session_state:
        shared = st.query_params.get("shared")
        if shared:
            try:
                st.session_state.progress = decode_share_state(shared)
                st.session_state.shared_mode = True
                st.session_state.active_user = "Shared view"
            except Exception:
                current_user, users, prefs_map = read_full_store()
                current_user, users, prefs_map, changed = migrate_to_single_user(
                    current_user,
                    users,
                    prefs_map,
                )
                st.session_state.progress = dict(users[DEFAULT_USER])
                st.session_state.shared_mode = False
                st.session_state.active_user = DEFAULT_USER
                apply_session_preferences(prefs_map.get(DEFAULT_USER, {}))
                if changed:
                    if persistence.db_engine_ready():
                        persistence.db_write_full(DEFAULT_USER, users, prefs_map.get(DEFAULT_USER, {}))
                    else:
                        persistence.file_write_full(PROGRESS_PATH, DEFAULT_USER, users, prefs_map.get(DEFAULT_USER, {}))
        else:
            current_user, users, prefs_map = read_full_store()
            current_user, users, prefs_map, changed = migrate_to_single_user(
                current_user,
                users,
                prefs_map,
            )
            st.session_state.progress = dict(users[DEFAULT_USER])
            st.session_state.shared_mode = False
            st.session_state.active_user = DEFAULT_USER
            apply_session_preferences(prefs_map.get(DEFAULT_USER, {}))
            if changed:
                if persistence.db_engine_ready():
                    persistence.db_write_full(DEFAULT_USER, users, prefs_map.get(DEFAULT_USER, {}))
                else:
                    persistence.file_write_full(PROGRESS_PATH, DEFAULT_USER, users, prefs_map.get(DEFAULT_USER, {}))
    if not st.session_state.shared_mode:
        st.session_state._last_saved_prefs_snap = json.dumps(
            gather_session_preferences(), sort_keys=True, default=str
        )
    st.session_state.initialized = True


def persist_current_progress(pokemon_id: int | None = None, checked: bool | None = None) -> None:
    if st.session_state.shared_mode:
        return
    if pokemon_id is not None and checked is not None:
        if persistence.db_engine_ready() and hasattr(persistence, "db_set_collection_entry"):
            persistence.db_set_collection_entry(DEFAULT_USER, pokemon_id, checked)
            persistence.db_save_preferences_only(
                DEFAULT_USER,
                gather_session_preferences(),
            )
        elif hasattr(persistence, "file_set_collection_entry"):
            persistence.file_set_collection_entry(
                PROGRESS_PATH,
                DEFAULT_USER,
                DEFAULT_USER,
                pokemon_id,
                checked,
            )
        else:
            write_progress_store(dict(st.session_state.progress))
    else:
        write_progress_store(dict(st.session_state.progress))


def get_current_page() -> str:
    return str(st.query_params.get("page", "tracker"))


def set_current_page(page: str) -> None:
    params = {}
    shared = st.query_params.get("shared")
    if shared:
        params["shared"] = shared
    if page != "tracker":
        params["page"] = page
    st.query_params.clear()
    for key, value in params.items():
        st.query_params[key] = value


def apply_theme(theme: str) -> None:
    palette = THEME_PALETTES.get(theme, THEME_PALETTES["tokyo_night"])
    st.markdown(
        f"""
        <style>
        :root {{
            --bg: {palette["bg"]};
            --surface: {palette["surface"]};
            --muted: {palette["muted"]};
            --card: {palette["card"]};
            --border: {palette["border"]};
            --text: {palette["text"]};
            --soft: {palette["soft"]};
            --accent: {palette["accent"]};
            --accent-2: {palette["accent_2"]};
            --success-bg: {palette["success_bg"]};
            --success-bg-2: {palette["success_bg_2"]};
            --success-border: {palette["success_border"]};
            --success-text: {palette["success_text"]};
            --track: {palette["track"]};
            --input-bg: {palette["input_bg"]};
            --shadow: {palette["shadow"]};
        }}
        .stApp {{
            background:
                radial-gradient(circle at top left, color-mix(in srgb, var(--accent) 24%, transparent), transparent 25%),
                radial-gradient(circle at top right, color-mix(in srgb, var(--accent-2) 24%, transparent), transparent 22%),
                linear-gradient(180deg, var(--bg), var(--bg));
            color: var(--text);
        }}
        .stApp, [data-testid="stSidebar"], [data-testid="stSidebar"] * {{
            color: var(--text);
        }}
        /* Keep only the sidebar toggle visible; remove the top bar chrome. */
        [data-testid="stHeader"] {{
            background: transparent !important;
            border-bottom: 0 !important;
            height: 2.75rem !important;
        }}
        [data-testid="stToolbar"] {{
            background: transparent !important;
            display: block !important;
            visibility: visible !important;
        }}
        [data-testid="stHeader"] button,
        [data-testid="stToolbar"] button,
        [data-testid="stHeader"] a,
        [data-testid="stToolbar"] a {{
            color: var(--text) !important;
        }}
        [data-testid="stHeader"] svg,
        [data-testid="stToolbar"] svg {{
            fill: var(--text) !important;
        }}
        [data-testid="collapsedControl"] {{
            position: fixed !important;
            top: 0.85rem;
            left: 0.85rem;
            z-index: 1000;
            display: flex !important;
            visibility: visible !important;
            background: color-mix(in srgb, var(--surface) 92%, transparent) !important;
            border: 1px solid var(--border) !important;
            border-radius: 12px !important;
            box-shadow: var(--shadow);
        }}
        /* Top-of-app “running” / loading bar during reruns */
        [data-testid="stStatusWidget"] {{
            display: none !important;
        }}
        [data-testid="stSidebar"] {{
            background: linear-gradient(180deg, var(--surface), var(--muted));
            border-right: 1px solid var(--border);
        }}
        [data-testid="stSidebarUserContent"] {{
            min-height: 100vh;
            display: flex;
            flex-direction: column;
        }}
        .block-container {{
            padding-top: 1.4rem;
            padding-bottom: 2rem;
            max-width: 1100px;
        }}
        .hero {{
            background:
                radial-gradient(circle at 15% 20%, color-mix(in srgb, var(--accent) 28%, transparent), transparent 28%),
                linear-gradient(135deg, var(--surface), var(--muted));
            border: 1px solid var(--border);
            border-radius: 28px;
            padding: 1.6rem 1.8rem;
            box-shadow: var(--shadow);
            margin-bottom: 1.2rem;
            position: relative;
        }}
        .hero-actions {{
            position: absolute;
            top: 1rem;
            right: 1rem;
            display: flex;
            gap: 0.6rem;
            align-items: center;
        }}
        .hero-action-button {{
            width: 2.7rem;
            height: 2.7rem;
            border-radius: 999px;
            border: 1px solid color-mix(in srgb, var(--accent) 24%, var(--border));
            background: linear-gradient(180deg, color-mix(in srgb, var(--card) 92%, var(--surface)), var(--muted));
            box-shadow: var(--shadow);
            display: inline-flex;
            align-items: center;
            justify-content: center;
            font-size: 1.15rem;
            line-height: 1;
            color: var(--accent);
            cursor: pointer;
            user-select: none;
            text-decoration: none;
        }}
        .hero-action-button svg {{
            width: 1.35rem;
            height: 1.35rem;
            fill: currentColor;
            display: block;
        }}
        .hero-action-button:hover {{
            border-color: var(--accent);
            transform: translateY(-1px);
        }}
        .hero h1 {{
            margin: 0;
            font-size: 2.85rem;
            line-height: 1.1;
            color: var(--accent);
            text-align: left;
            padding-right: 6.4rem;
        }}
        .hero p, .meta, .empty, .share-note {{
            color: var(--soft);
        }}
        .stat-grid {{
            display: flex;
            align-items: stretch;
            gap: 1.05rem;
            margin-top: 1.15rem;
        }}
        .stat-card {{
            flex: 1 1 0;
            min-width: 0;
            background: var(--card);
            border: 1px solid var(--border);
            border-radius: 22px;
            padding: 1.35rem 1.25rem;
            text-align: center;
        }}
        .stat-label {{
            font-size: 1.08rem;
            text-transform: uppercase;
            letter-spacing: 0.08em;
            color: var(--soft);
        }}
        .stat-value {{
            font-size: 2.55rem;
            font-weight: 800;
            margin-top: 0.5rem;
            line-height: 1.15;
            color: var(--text);
        }}
        .progress-shell {{
            margin-top: 1rem;
            background: var(--track);
            border-radius: 999px;
            height: 14px;
            overflow: hidden;
        }}
        .progress-bar {{
            height: 14px;
            border-radius: 999px;
            background: linear-gradient(90deg, var(--accent), var(--accent-2));
        }}
        .pokemon-grid {{
            display: grid;
            grid-template-columns: repeat(4, minmax(0, 1fr));
            gap: 1rem;
            align-items: stretch;
        }}
        .pokemon-card {{
            background: linear-gradient(180deg, var(--card), var(--surface));
            border: 1px solid var(--border);
            border-radius: 18px;
            padding: 0.65rem 0.75rem 0.72rem;
            box-shadow: var(--shadow);
            margin-bottom: 0.75rem;
            margin-left: auto;
            margin-right: auto;
            width: 100%;
            max-width: 15rem;
            height: 11.25rem;
            transition: border-color 0.2s ease, background 0.2s ease, transform 0.2s ease;
            position: relative;
            box-sizing: border-box;
            display: flex;
            flex-direction: column;
            align-items: center;
            overflow: hidden;
            user-select: none;
            -webkit-tap-highlight-color: transparent;
        }}
        .pokemon-card::after {{
            content: "";
            position: absolute;
            inset: 0;
            background: color-mix(in srgb, var(--accent) 12%, transparent);
            opacity: 0;
            transition: opacity 0.14s ease;
            pointer-events: none;
        }}
        .pokemon-card:hover {{
            border-color: color-mix(in srgb, var(--accent) 40%, var(--border));
            transform: translateY(-2px);
        }}
        .pokemon-card.is-pressing {{
            transform: scale(0.975);
            border-color: color-mix(in srgb, var(--accent) 68%, var(--border));
        }}
        .pokemon-card.is-pressing::after {{
            opacity: 1;
        }}
        .pokemon-header {{
            width: 100%;
            height: 100%;
        }}
        .pokemon-main {{
            display: flex;
            flex-direction: column;
            align-items: flex-start;
            justify-content: center;
            gap: 0.22rem;
            min-width: 0;
            width: 100%;
            text-align: left;
            padding-right: 0;
            padding-left: 0.55rem;
            height: 100%;
        }}
        .pokemon-thumb {{
            width: clamp(74px, 6.2vw, 102px);
            height: clamp(74px, 6.2vw, 102px);
            filter: drop-shadow(0 8px 14px rgba(15, 23, 42, 0.16));
            transition: transform 0.18s ease;
            transform-origin: center;
            flex-shrink: 0;
            align-self: flex-start;
            margin-top: auto;
            margin-left: 0.5rem;
            margin-bottom: 0.12rem;
            order: 2;
        }}
        .pokemon-thumb:hover {{
            transform: scale(1.35);
        }}
        .pokemon-number {{
            font-size: clamp(1rem, 0.95vw, 1.18rem);
            font-weight: 700;
            letter-spacing: 0.08em;
            text-transform: uppercase;
            color: var(--soft);
            line-height: 1;
            padding-left: 0.08rem;
        }}
        .pokemon-name {{
            font-size: clamp(1.35rem, 1.45vw, 1.72rem);
            font-weight: 800;
            color: var(--text);
            margin: 0;
            line-height: 1.02;
            word-break: break-word;
            text-align: left;
        }}
        .pokemon-copy {{
            min-width: 0;
            display: flex;
            flex-direction: column;
            align-items: flex-start;
            justify-content: center;
            gap: 0.2rem;
            width: 100%;
            order: 1;
        }}
        .pokemon-gen {{
            font-size: 0.95rem;
            color: var(--soft);
        }}
        .status-badge {{
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 2.1rem;
            height: 2.1rem;
            border-radius: 0.6rem;
            padding: 0;
            font-size: 1.2rem;
            font-weight: 900;
            white-space: nowrap;
            border: 1px solid var(--border);
            color: var(--soft);
            background: color-mix(in srgb, var(--soft) 12%, transparent);
            flex-shrink: 0;
            position: absolute;
            top: 0.6rem;
            right: 0.6rem;
        }}
        .status-badge.collected {{
            background: #22c55e;
            color: #f0fdf4;
            border-color: #16a34a;
            box-shadow: 0 10px 18px rgba(34, 197, 94, 0.28);
        }}
        .type-row {{
            display: flex;
            flex-direction: column;
            align-items: stretch;
            gap: 0.22rem;
            width: max-content;
            max-width: calc(100% - 1rem);
            position: absolute;
            right: 0.5rem;
            bottom: 0.5rem;
        }}
        .type-pill {{
            display: inline-flex;
            align-items: center;
            justify-content: center;
            border-radius: 999px;
            padding: 0.2rem 0.48rem;
            font-size: 0.72rem;
            font-weight: 700;
            width: 100%;
            box-sizing: border-box;
        }}
        .pokemon-card {{
            cursor: pointer;
        }}
        .pokemon-card-readonly {{
            cursor: not-allowed;
            pointer-events: none;
            opacity: 0.88;
        }}
        /* Card tap triggers a hidden Streamlit button (scripts in markdown do not run in Streamlit 1.40+). */
        div[class*="st-key-card_toggle_"] {{
            min-height: 0 !important;
            margin: 0 !important;
            padding: 0 !important;
        }}
        div[class*="st-key-card_toggle_"] button {{
            position: absolute !important;
            width: 1px !important;
            height: 1px !important;
            padding: 0 !important;
            margin: -1px !important;
            overflow: hidden !important;
            clip: rect(0, 0, 0, 0) !important;
            white-space: nowrap !important;
            border: 0 !important;
            opacity: 0 !important;
            pointer-events: none !important;
        }}
        div[class*="st-key-hero_theme_toggle"] {{
            min-height: 0 !important;
            margin: 0 !important;
            padding: 0 !important;
        }}
        div[class*="st-key-hero_theme_toggle"] button {{
            position: absolute !important;
            width: 1px !important;
            height: 1px !important;
            padding: 0 !important;
            margin: -1px !important;
            overflow: hidden !important;
            clip: rect(0, 0, 0, 0) !important;
            white-space: nowrap !important;
            border: 0 !important;
            opacity: 0 !important;
            pointer-events: none !important;
        }}
        .shared-banner {{
            background: color-mix(in srgb, #e5c890 20%, transparent);
            border: 1px solid color-mix(in srgb, #e5c890 45%, transparent);
            color: var(--text);
            border-radius: 16px;
            padding: 0.8rem 1rem;
            margin-bottom: 1rem;
        }}
        .sidebar-user-label {{
            font-size: 0.78rem;
            text-transform: uppercase;
            letter-spacing: 0.08em;
            color: var(--soft);
            margin-bottom: 0.25rem;
        }}
        .sidebar-user-value {{
            font-size: 1rem;
            font-weight: 700;
            color: var(--text);
            margin-bottom: 1rem;
        }}
        .settings-spacer {{
            flex: 1 1 auto;
            min-height: 1rem;
        }}
        .stTextInput label,
        .stSelectbox label,
        .stNumberInput label,
        .stMultiSelect label,
        .stPills label,
        .stRadio label,
        .stDownloadButton label,
        .stSubheader,
        .stCaption,
        [data-testid="stWidgetLabel"] {{
            color: var(--text) !important;
        }}
        .stTextInput input,
        .stNumberInput input,
        .stTextInput [data-baseweb="base-input"] > div,
        .stNumberInput [data-baseweb="base-input"] > div,
        .stSelectbox [data-baseweb="select"] > div,
        .stMultiSelect [data-baseweb="select"] > div {{
            background: var(--input-bg) !important;
            color: var(--text) !important;
            border-color: var(--border) !important;
            border-radius: 14px !important;
            box-shadow: none !important;
        }}
        .stTextInput [data-baseweb="base-input"],
        .stNumberInput [data-baseweb="base-input"] {{
            border-radius: 14px !important;
            background: var(--input-bg) !important;
        }}
        .stTextInput [data-baseweb="base-input"] > div,
        .stTextInput [data-baseweb="base-input"] > div > input,
        .stTextInput div[data-baseweb="input"] > div,
        .stTextInput div[data-baseweb="input"] input,
        .stTextInput input[type="text"] {{
            background: var(--input-bg) !important;
            background-color: var(--input-bg) !important;
            color: var(--text) !important;
            -webkit-text-fill-color: var(--text) !important;
            border-radius: 14px !important;
        }}
        .stTextInput input::placeholder,
        .stNumberInput input::placeholder {{
            color: var(--soft) !important;
            opacity: 1;
        }}
        .stTextInput input,
        .stNumberInput input {{
            background: var(--input-bg) !important;
            background-color: var(--input-bg) !important;
            box-shadow: none !important;
            outline: none !important;
        }}
        .stTextInput input:-webkit-autofill,
        .stTextInput input:-webkit-autofill:hover,
        .stTextInput input:-webkit-autofill:focus {{
            -webkit-text-fill-color: var(--text) !important;
            -webkit-box-shadow: 0 0 0 1000px var(--input-bg) inset !important;
            transition: background-color 9999s ease-out 0s;
        }}
        .stTextInput input:focus,
        .stNumberInput input:focus,
        .stTextInput [data-baseweb="base-input"]:focus-within > div,
        .stNumberInput [data-baseweb="base-input"]:focus-within > div,
        .stSelectbox [data-baseweb="select"] > div:focus-within,
        .stMultiSelect [data-baseweb="select"] > div:focus-within {{
            border-color: var(--accent) !important;
            box-shadow: 0 0 0 1px var(--accent) !important;
            outline: none !important;
        }}
        .st-key-number_filter {{
            position: sticky;
            top: 0.65rem;
            z-index: 40;
            padding: 0.35rem 0 0.7rem;
            background:
                linear-gradient(
                    180deg,
                    color-mix(in srgb, var(--bg) 96%, transparent),
                    color-mix(in srgb, var(--bg) 84%, transparent) 72%,
                    transparent
                );
        }}
        div[class*="st-key-tracker_filters_row"] [data-testid="stHorizontalBlock"] {{
            flex-wrap: nowrap !important;
            align-items: end !important;
            gap: 0.75rem !important;
        }}
        div[class*="st-key-tracker_filters_row"] [data-testid="stHorizontalBlock"] > [data-testid="column"] {{
            flex: 1 1 0 !important;
            min-width: 0 !important;
        }}
        .stSelectbox svg,
        .stMultiSelect svg,
        .stNumberInput svg {{
            fill: var(--text) !important;
        }}
        .stMultiSelect [data-baseweb="tag"] {{
            background: color-mix(in srgb, var(--accent) 18%, var(--surface)) !important;
            color: var(--text) !important;
            border: 1px solid color-mix(in srgb, var(--accent) 34%, transparent) !important;
        }}
        .stRadio [role="radiogroup"] label,
        .stRadio [role="radiogroup"] div {{
            color: var(--text) !important;
        }}
        .stRadio [data-baseweb="radio"] > div:first-child {{
            background: var(--input-bg) !important;
            border-color: var(--border) !important;
        }}
        .stButton button,
        .stDownloadButton button {{
            background: linear-gradient(180deg, var(--card), var(--surface)) !important;
            color: var(--text) !important;
            border: 1px solid var(--border) !important;
            border-radius: 14px !important;
        }}
        .stButton button:hover,
        .stDownloadButton button:hover {{
            border-color: var(--accent) !important;
            color: var(--accent) !important;
        }}
        .stButton button:disabled,
        .stDownloadButton button:disabled {{
            background: var(--muted) !important;
            color: var(--soft) !important;
            border-color: var(--border) !important;
            opacity: 0.72;
        }}
        @media (max-width: 900px) {{
            .block-container {{
                padding-top: 1.75rem;
                padding-left: 1rem;
                padding-right: 1rem;
                max-width: 100%;
            }}
            .hero {{
                padding: 1.15rem 1rem;
                border-radius: 22px;
            }}
            .hero h1 {{
                font-size: 2.1rem;
            }}
            .stat-grid {{
                display: flex;
                gap: 0.7rem;
            }}
            .stat-card {{
                padding: 1.05rem 0.9rem;
                border-radius: 18px;
            }}
            .stat-label {{
                font-size: 0.82rem;
            }}
            .stat-value {{
                font-size: 1.42rem;
            }}
        }}
        @media (max-width: 1400px) {{
            .pokemon-grid {{
                grid-template-columns: repeat(2, minmax(0, 1fr));
                gap: 0.8rem;
            }}
            .pokemon-card {{
                width: 100%;
                max-width: none;
                height: 11rem;
                padding: 0.95rem 1rem 0.9rem;
                align-items: stretch;
            }}
            .pokemon-header {{
                width: 100%;
            }}
            .pokemon-main {{
                flex-direction: row;
                align-items: center;
                justify-content: flex-start;
                gap: 0.85rem;
                text-align: left;
                padding-right: 2.35rem;
            }}
            .pokemon-thumb {{
                width: 124px;
                height: 124px;
                flex-shrink: 0;
                order: 1;
                margin-top: 0;
                margin-left: 0;
                margin-bottom: 0;
            }}
            .pokemon-copy {{
                align-items: flex-start;
                justify-content: center;
                gap: 0.24rem;
                order: 2;
            }}
            .pokemon-number {{
                font-size: 1.3rem;
            }}
            .pokemon-name {{
                font-size: 2.15rem;
            }}
        }}
        @media (max-width: 640px) {{
            div[class*="st-key-tracker_filters_row"] [data-testid="stHorizontalBlock"] {{
                flex-wrap: wrap !important;
                gap: 0.55rem !important;
            }}
            div[class*="st-key-tracker_filters_row"] [data-testid="stHorizontalBlock"] > [data-testid="column"] {{
                flex: 1 1 100% !important;
                width: 100% !important;
            }}
            .pokemon-grid {{
                grid-template-columns: 1fr;
                gap: 0.7rem;
            }}
            .pokemon-card {{
                width: 100%;
                max-width: none;
                min-height: 0;
                height: 9.6rem;
                padding: 0.8rem 0.9rem 0.8rem;
                align-items: stretch;
            }}
            .pokemon-header {{
                width: 100%;
            }}
            .pokemon-main {{
                flex-direction: row;
                align-items: center;
                justify-content: flex-start;
                gap: 0.65rem;
                text-align: left;
                padding-right: 2.05rem;
            }}
            .pokemon-thumb {{
                width: 112px;
                height: 112px;
                flex-shrink: 0;
            }}
            .pokemon-copy {{
                align-items: flex-start;
                gap: 0.12rem;
            }}
            .pokemon-number {{
                font-size: 1.08rem;
            }}
            .pokemon-name {{
                font-size: 1.95rem;
                line-height: 1;
            }}
            .type-row {{
                right: 0.45rem;
                bottom: 0.45rem;
            }}
        }}
        </style>
        """,
        unsafe_allow_html=True,
    )


def _sync_theme_from_picker() -> None:
    picked = st.session_state.get("theme_picker")
    if isinstance(picked, str) and picked in THEME_PALETTES:
        st.session_state.theme = picked


def _sync_theme_from_mode_toggle() -> None:
    dark_enabled = bool(st.session_state.get("theme_mode_toggle", True))
    st.session_state.theme = "tokyo_night" if dark_enabled else "light"
    st.session_state.theme_picker = st.session_state.theme


def toggle_theme() -> None:
    st.session_state.theme = "light" if st.session_state.theme != "light" else "tokyo_night"
    st.session_state.theme_picker = st.session_state.theme


def hero_actions_markup() -> str:
    is_dark = st.session_state.theme != "light"
    theme_icon = (
        '<svg viewBox="0 -960 960 960" aria-hidden="true">'
        '<path d="M480-240q100 0 170-70t70-170q0-100-70-170t-170-70q-100 0-170 70t-70 170q0 100 70 170t170 70Zm0 80q-134 0-227-93t-93-227q0-134 93-227t227-93q134 0 227 93t93 227q0 134-93 227t-227 93Zm0-520Zm0 680q-17 0-28.5-11.5T440-40v-80q0-17 11.5-28.5T480-160q17 0 28.5 11.5T520-120v80q0 17-11.5 28.5T480 0Zm0-800q-17 0-28.5-11.5T440-840v-80q0-17 11.5-28.5T480-960q17 0 28.5 11.5T520-920v80q0 17-11.5 28.5T480-800ZM160-440H80q-17 0-28.5-11.5T40-480q0-17 11.5-28.5T80-520h80q17 0 28.5 11.5T200-480q0 17-11.5 28.5T160-440Zm720 0h-80q-17 0-28.5-11.5T760-480q0-17 11.5-28.5T800-520h80q17 0 28.5 11.5T920-480q0 17-11.5 28.5T880-440ZM256-664l-56-56q-12-12-12-28t12-28q12-12 28-12t28 12l56 56q12 12 12 28t-12 28q-12 12-28 12t-28-12Zm448 448-56-56q-12-12-12-28t12-28q12-12 28-12t28 12l56 56q12 12 12 28t-12 28q-12 12-28 12t-28-12ZM200-172q-12-12-12-28t12-28l56-56q12-12 28-12t28 12q12 12 12 28t-12 28l-56 56q-12 12-28 12t-28-12Zm448-448q-12-12-12-28t12-28l56-56q12-12 28-12t28 12q12 12 12 28t-12 28l-56 56q-12 12-28 12t-28-12Z"/>'
        '</svg>'
        if is_dark
        else '<svg viewBox="0 -960 960 960" aria-hidden="true"><path d="M484-80q-84 0-157-31.5T200-197.5q-54-54-85-127T84-482q0-115 55-214.5T287-863q5-3 10.5-1t7.5 7q2 5 0 10t-7 8q-42 34-66 85.5T208-640q0 113 79.5 192.5T480-368q65 0 122-27.5T698-473q3-5 8-7t10 0q5 2 7 7.5t-1 10.5q-67 93-166 148.5T484-80Z"/></svg>'
    )
    theme_label = "Switch to Light Mode" if is_dark else "Switch to Tokyo Night"
    return (
        '<div class="hero-actions">'
        '<button type="button" class="hero-action-button hero-theme-button" '
        f'aria-label="{theme_label}" '
        f'title="{theme_label}">{theme_icon}</button>'
        '</div>'
    )


def render_hero(total: int, collected: int, percentage: float) -> None:
    active_user = st.session_state.active_user or "Trainer"
    st.markdown(
        f"""
        <section class="hero">
            {hero_actions_markup()}
            <h1>{active_user}&#39;s Pokémon Card Tracker</h1>
            <div class="stat-grid">
                <div class="stat-card">
                    <div class="stat-label">Collected</div>
                    <div class="stat-value">{collected:,}</div>
                </div>
                <div class="stat-card">
                    <div class="stat-label">Total Pokemon</div>
                    <div class="stat-value">{total:,}</div>
                </div>
                <div class="stat-card">
                    <div class="stat-label">Completion</div>
                    <div class="stat-value">{percentage:.1f}%</div>
                </div>
            </div>
            <div class="progress-shell">
                <div class="progress-bar" style="width: {percentage}%;"></div>
            </div>
        </section>
        """,
        unsafe_allow_html=True,
    )
    if st.button("ThemeToggle", key="hero_theme_toggle"):
        toggle_theme()
        st.rerun()
    components.html(
        """
        <script>
        (function bindHeroThemeToggle() {
            function appDocument() {
                var w = window;
                for (var depth = 0; depth < 10; depth++) {
                    try {
                        var d = w.document;
                        if (d.querySelector(".hero-theme-button")) {
                            return d;
                        }
                    } catch (e) {}
                    if (!w.parent || w.parent === w) {
                        break;
                    }
                    w = w.parent;
                }
                try {
                    return window.parent.document;
                } catch (e2) {
                    return document;
                }
            }

            function bind(doc) {
                var trigger = doc.querySelector(".hero-theme-button");
                if (!trigger || trigger.dataset.themeToggleBound === "1") {
                    return;
                }
                trigger.dataset.themeToggleBound = "1";
                trigger.addEventListener("click", function () {
                    var hiddenButton = doc.querySelector('div[class*="st-key-hero_theme_toggle"] button');
                    if (hiddenButton) {
                        hiddenButton.click();
                    }
                });
            }

            bind(appDocument());
        })();
        </script>
        """,
        height=0,
    )


def filter_and_sort(pokedex: list[dict]) -> list[dict]:
    progress = st.session_state.progress
    selected_number = st.session_state.get("number_filter", "All")
    generation = st.session_state.generation
    completion = st.session_state.completion
    type_filter = st.session_state.type_filter

    results = pokedex
    if selected_number != "All":
        results = [entry for entry in results if str(entry["id"]) == str(selected_number)]
    if generation != "All":
        gen_number = int(generation.split(" ")[1])
        results = [entry for entry in results if entry["generation"] == gen_number]
    if completion == "Completed only":
        results = [entry for entry in results if progress.get(entry["id"], False)]
    elif completion == "Missing only":
        results = [entry for entry in results if not progress.get(entry["id"], False)]
    if type_filter != "All Types":
        results = [entry for entry in results if type_filter in entry["types"]]

    sort_by = st.session_state.sort_by
    if sort_by == "number-desc":
        results = sorted(results, key=lambda item: item["id"], reverse=True)
    elif sort_by == "name-asc":
        results = sorted(results, key=lambda item: get_display_name(item, "en"))
    elif sort_by == "name-desc":
        results = sorted(results, key=lambda item: get_display_name(item, "en"), reverse=True)
    else:
        results = sorted(results, key=lambda item: item["id"])
    return results


def paginate_entries(entries: list[dict]) -> tuple[list[dict], int, int]:
    page_size = st.session_state.get("page_size", PAGE_SIZE_OPTIONS[0])
    if page_size not in PAGE_SIZE_OPTIONS:
        page_size = PAGE_SIZE_OPTIONS[0]
        st.session_state.page_size = page_size

    total_pages = max(1, (len(entries) + page_size - 1) // page_size)
    current_page = st.session_state.get("grid_page", 1)
    if not isinstance(current_page, int):
        try:
            current_page = int(current_page)
        except (TypeError, ValueError):
            current_page = 1
    current_page = min(max(1, current_page), total_pages)
    st.session_state.grid_page = current_page

    start_index = (current_page - 1) * page_size
    end_index = start_index + page_size
    return entries[start_index:end_index], current_page, total_pages


def render_tracker_filters(all_types: list[str]) -> None:
    if st.session_state.get("type_filter") not in {"All Types", *all_types}:
        st.session_state.type_filter = "All Types"
    with st.expander("Filters", expanded=False):
        with st.container(key="tracker_filters_row"):
            generation_col, completion_col, type_col = st.columns(3)
            with generation_col:
                st.selectbox(
                    "Generation",
                    options=["All"] + [f"Gen {gen} - {name}" for gen, name in GENERATION_NAMES.items()],
                    key="generation",
                )
            with completion_col:
                st.selectbox(
                    "Completion",
                    options=["Full Pokédex", "Completed only", "Missing only"],
                    key="completion",
                )
            with type_col:
                st.selectbox(
                    "Type",
                    options=["All Types"] + all_types,
                    key="type_filter",
                )


def render_sidebar(pokedex: list[dict], current_page: str) -> None:
    with st.sidebar:
        if st.session_state.shared_mode:
            st.caption("Shared view is read-only.")

        if current_page == "tracker":
            st.selectbox(
                "Sort by",
                options=["number-asc", "number-desc", "name-asc", "name-desc"],
                format_func=lambda value: {
                    "number-asc": "Number (1-1025)",
                    "number-desc": "Number (1025-1)",
                    "name-asc": "Name (A-Z)",
                    "name-desc": "Name (Z-A)",
                }[value],
                key="sort_by",
            )

        st.markdown('<div class="settings-spacer"></div>', unsafe_allow_html=True)
        if st.button("⚙ Settings", use_container_width=True):
            set_current_page("settings")
            st.rerun()

def toggle_pokemon(pokemon_id: int, checked: bool) -> None:
    updated = dict(st.session_state.progress)
    if checked:
        updated[pokemon_id] = True
    else:
        updated.pop(pokemon_id, None)
    st.session_state.progress = updated
    if not st.session_state.shared_mode:
        persist_current_progress(pokemon_id, checked)


def render_settings_page(pokedex: list[dict]) -> None:
    st.markdown(
        """
        <section class="hero">
            <h1>Settings</h1>
            <p>Adjust appearance and export Owen's checklist.</p>
        </section>
        """,
        unsafe_allow_html=True,
    )

    st.subheader("Appearance")
    # Use a separate widget key so `theme` remains plain session state across pages.
    _theme_options = ["light", "tokyo_night"]
    if st.session_state.get("theme_picker") not in _theme_options:
        st.session_state.theme_picker = "light" if st.session_state.theme == "light" else "tokyo_night"
    st.selectbox(
        "Color theme",
        options=_theme_options,
        format_func=lambda k: THEME_LABEL_BY_KEY.get(k, k),
        key="theme_picker",
        on_change=_sync_theme_from_picker,
    )

    st.subheader("Import / Export")
    csv_data = progress_to_csv(st.session_state.progress, pokedex, "en")
    st.download_button(
        "Export CSV",
        data=csv_data,
        file_name="pokemon-checklist.csv",
        mime="text/csv",
        use_container_width=True,
    )

    if st.session_state.shared_mode:
        st.warning("User settings are unavailable in shared view.")
        if st.button("Back to tracker"):
            set_current_page("tracker")
            st.rerun()
        return

    if st.button("Back to tracker", use_container_width=True):
        set_current_page("tracker")
        st.rerun()


def render_pokemon_grid(entries: list[dict], all_types: list[str]) -> None:
    render_tracker_filters(all_types)

    if st.session_state.get("number_filter") is None:
        st.session_state.number_filter = "All"
    number_options = ["All"] + [str(i) for i in range(1, 1026)]
    if st.session_state.number_filter not in number_options:
        st.session_state.number_filter = "All"
    st.selectbox(
        "Pokemon Number",
        options=number_options,
        key="number_filter",
    )

    if not entries:
        st.markdown('<p class="empty">No Pokémon found for the current filters.</p>', unsafe_allow_html=True)
        return

    paged_entries, current_page, total_pages = paginate_entries(entries)
    pager_left, pager_center, pager_right = st.columns([1, 1.4, 1])
    with pager_left:
        st.selectbox(
            "Cards per page",
            options=PAGE_SIZE_OPTIONS,
            key="page_size",
        )
        if total_pages < st.session_state.grid_page:
            st.session_state.grid_page = total_pages
            current_page = total_pages
            paged_entries, current_page, total_pages = paginate_entries(entries)
    with pager_center:
        st.caption(
            f"Showing {len(paged_entries)} of {len(entries)} Pokémon | Page {current_page} of {total_pages}"
        )
    with pager_right:
        nav_prev, nav_next = st.columns(2)
        with nav_prev:
            if st.button("Previous", disabled=current_page <= 1, use_container_width=True):
                st.session_state.grid_page = current_page - 1
                st.rerun()
        with nav_next:
            if st.button("Next", disabled=current_page >= total_pages, use_container_width=True):
                st.session_state.grid_page = current_page + 1
                st.rerun()

    card_markup_parts: list[str] = ['<div class="pokemon-grid">']
    for entry in paged_entries:
        checked = st.session_state.progress.get(entry["id"], False)
        name = get_display_name(entry, "en")
        card_class = "pokemon-card collected" if checked else "pokemon-card"
        status_markup = '<div class="status-badge collected" aria-label="Collected">✓</div>' if checked else ""
        types_markup = "".join(
            f'<span class="type-pill" style="background:{TYPE_COLORS.get(ptype, ("#e2e8f0", "#0f172a"))[0]};color:{TYPE_COLORS.get(ptype, ("#e2e8f0", "#0f172a"))[1]};">{ptype}</span>'
            for ptype in entry["types"]
        )
        card_id = entry["id"]
        readonly_class = " pokemon-card-readonly" if st.session_state.shared_mode else ""
        card_markup_parts.append(
            f'<div class="{card_class}{readonly_class}" id="pokemon-card-{card_id}">'
            '<div class="pokemon-header">'
            '<div class="pokemon-main">'
            '<div class="pokemon-copy">'
            f'<div class="pokemon-number">#{entry["number"]}</div>'
            f'<div class="pokemon-name">{name}</div>'
            '</div>'
            f'<img class="pokemon-thumb" src="{entry["imageUrl"]}" alt="{name}" loading="lazy" decoding="async" />'
            '</div>'
            f'{status_markup}'
            '</div>'
            f'<div class="type-row">{types_markup}</div>'
            '</div>'
        )
    card_markup_parts.append("</div>")
    st.markdown("".join(card_markup_parts), unsafe_allow_html=True)

    for entry in paged_entries:
        checked = st.session_state.progress.get(entry["id"], False)
        if st.button(
            f"Toggle##{entry['id']}",
            key=f"card_toggle_{entry['id']}",
            disabled=st.session_state.shared_mode,
        ):
            toggle_pokemon(entry["id"], not checked)
            st.rerun()

    components.html(
        """
        <script>
        (function forwardPokemonCardClicks() {
            function appDocument() {
                var w = window;
                for (var depth = 0; depth < 10; depth++) {
                    try {
                        var d = w.document;
                        if (d.querySelector('[id^="pokemon-card-"]')) {
                            return d;
                        }
                    } catch (e) {}
                    if (!w.parent || w.parent === w) {
                        break;
                    }
                    w = w.parent;
                }
                try {
                    return window.parent.document;
                } catch (e2) {
                    return document;
                }
            }

            function bind(doc) {
                var cards = doc.querySelectorAll('[id^="pokemon-card-"]');
                for (var i = 0; i < cards.length; i++) {
                    (function (card) {
                        if (card.dataset.pokemonCardBound === "1") {
                            return;
                        }
                        if (card.classList.contains("pokemon-card-readonly")) {
                            return;
                        }
                        function setPressingState(pressing) {
                            if (pressing) {
                                card.classList.add("is-pressing");
                            } else {
                                card.classList.remove("is-pressing");
                            }
                        }
                        card.dataset.pokemonCardBound = "1";
                        card.style.cursor = "pointer";
                        card.setAttribute("role", "button");
                        card.setAttribute("tabindex", "0");
                        card.addEventListener("pointerdown", function () {
                            setPressingState(true);
                        });
                        card.addEventListener("pointerup", function () {
                            setPressingState(false);
                        });
                        card.addEventListener("pointerleave", function () {
                            setPressingState(false);
                        });
                        card.addEventListener("pointercancel", function () {
                            setPressingState(false);
                        });
                        card.addEventListener("blur", function () {
                            setPressingState(false);
                        });
                        card.addEventListener("keydown", function (event) {
                            if (event.key === "Enter" || event.key === " ") {
                                if (event.key === " ") {
                                    event.preventDefault();
                                }
                                setPressingState(true);
                            }
                        });
                        card.addEventListener("keyup", function (event) {
                            if (event.key === "Enter" || event.key === " ") {
                                setPressingState(false);
                                card.click();
                            }
                        });
                        card.addEventListener(
                            "click",
                            function () {
                                setPressingState(false);
                                var cardId = card.id.replace("pokemon-card-", "");
                                var buttons = doc.querySelectorAll("button");
                                for (var j = 0; j < buttons.length; j++) {
                                    var label = buttons[j].textContent || "";
                                    if (label.indexOf("Toggle##" + cardId) !== -1) {
                                        buttons[j].click();
                                        return;
                                    }
                                }
                            },
                            false
                        );
                    })(cards[i]);
                }
            }

            function tick() {
                var doc = appDocument();
                bind(doc);
            }

            tick();
            var passes = 0;
            var timer = window.setInterval(function () {
                passes += 1;
                tick();
                if (passes > 10) {
                    window.clearInterval(timer);
                }
            }, 200);
        })();
        </script>
        """,
        height=1,
    )


def handle_toggle_query() -> None:
    """Apply a collection toggle from ?toggle=<id> (set by card click), then strip it from the URL."""
    try:
        toggle_param = st.query_params.get("toggle")
    except Exception:
        toggle_param = None
    if not toggle_param:
        return
    try:
        tid = int(toggle_param)
    except (TypeError, ValueError):
        st.query_params.pop("toggle", None)
        st.query_params.pop("_tc", None)
        return

    if st.session_state.shared_mode:
        st.query_params.pop("toggle", None)
        st.query_params.pop("_tc", None)
        return

    current = st.session_state.progress.get(tid, False)
    toggle_pokemon(tid, not current)
    st.query_params.pop("toggle", None)
    st.query_params.pop("_tc", None)

def main() -> None:
    ensure_state()
    apply_theme(st.session_state.theme)
    handle_toggle_query()
    pokedex = load_pokedex(DATA_PATH.stat().st_mtime_ns)
    current_page = get_current_page()

    try:
        if current_page == "settings":
            render_settings_page(pokedex)
        else:
            total = len(pokedex)
            collected = sum(1 for checked in st.session_state.progress.values() if checked)
            percentage = 100 * collected / total if total else 0

            if st.session_state.shared_mode:
                st.markdown(
                    '<div class="shared-banner">Shared view detected. Checklist editing is disabled until you remove the `shared` query parameter.</div>',
                    unsafe_allow_html=True,
                )

            render_hero(total, collected, percentage)
            entries = filter_and_sort(pokedex)
            all_types = sorted({ptype for entry in pokedex for ptype in entry["types"]})
            render_pokemon_grid(entries, all_types)
    finally:
        autosave_preferences_if_needed()


if __name__ == "__main__":
    main()
