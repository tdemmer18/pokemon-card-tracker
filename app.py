from __future__ import annotations

import base64
import csv
import io
import json
from pathlib import Path
from typing import Iterable

import streamlit as st
import streamlit.components.v1 as components


BASE_DIR = Path(__file__).parent
DATA_PATH = BASE_DIR / "data" / "pokedex.json"
PROGRESS_PATH = BASE_DIR / "data" / "progress.json"
DEFAULT_USER = "Player 1"

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

# Paginated grid: 16, 32, … up to 1040, plus show-everything.
PAGE_SIZE_OPTIONS: list[int | str] = [n for n in range(16, 16 * 65 + 1, 16)] + ["All"]

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
    page_icon="📘",
    layout="wide",
    initial_sidebar_state="expanded",
)
st.set_option("client.toolbarMode", "minimal")


@st.cache_data
def load_pokedex() -> list[dict]:
    return json.loads(DATA_PATH.read_text())


def normalize_progress(raw_progress: dict) -> dict[int, bool]:
    return {int(key): bool(value) for key, value in raw_progress.items() if value}


def sanitize_username(name: str) -> str:
    return " ".join(name.strip().split())


def read_progress_store() -> tuple[str, dict[str, dict[int, bool]]]:
    if not PROGRESS_PATH.exists():
        return DEFAULT_USER, {DEFAULT_USER: {}}
    try:
        raw = json.loads(PROGRESS_PATH.read_text())
    except json.JSONDecodeError:
        return DEFAULT_USER, {DEFAULT_USER: {}}

    if isinstance(raw, dict) and "users" in raw:
        users_raw = raw.get("users", {})
        users: dict[str, dict[int, bool]] = {}
        if isinstance(users_raw, dict):
            for username, user_progress in users_raw.items():
                normalized_name = sanitize_username(str(username))
                if not normalized_name or not isinstance(user_progress, dict):
                    continue
                users[normalized_name] = normalize_progress(user_progress)
        if not users:
            users = {DEFAULT_USER: {}}
        current_user = sanitize_username(str(raw.get("current_user", DEFAULT_USER)))
        if current_user not in users:
            current_user = next(iter(users))
        return current_user, users

    if isinstance(raw, dict):
        return DEFAULT_USER, {DEFAULT_USER: normalize_progress(raw)}

    return DEFAULT_USER, {DEFAULT_USER: {}}


def write_progress_store(current_user: str, users: dict[str, dict[int, bool]]) -> None:
    serializable_users = {
        username: {str(key): value for key, value in progress.items() if value}
        for username, progress in sorted(users.items())
    }
    payload = {
        "current_user": current_user,
        "users": serializable_users,
    }
    PROGRESS_PATH.write_text(json.dumps(payload, indent=2, sort_keys=True))


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
        "theme": "dark",
        "search": "",
        "sort_by": "number-asc",
        "generation": "All",
        "completion": "Full Pokédex",
        "selected_types": [],
        "compare_left_user": "",
        "compare_right_user": "",
        "page_size": 16,
        "grid_page": 1,
    }
    for key, value in defaults.items():
        if key not in st.session_state:
            st.session_state[key] = value

    if "progress" not in st.session_state or "shared_mode" not in st.session_state:
        shared = st.query_params.get("shared")
        if shared:
            try:
                st.session_state.progress = decode_share_state(shared)
                st.session_state.shared_mode = True
                st.session_state.active_user = "Shared view"
                st.session_state.users = {}
            except Exception:
                current_user, users = read_progress_store()
                st.session_state.progress = dict(users[current_user])
                st.session_state.shared_mode = False
                st.session_state.active_user = current_user
                st.session_state.users = users
        else:
            current_user, users = read_progress_store()
            st.session_state.progress = dict(users[current_user])
            st.session_state.shared_mode = False
            st.session_state.active_user = current_user
            st.session_state.users = users
    st.session_state.initialized = True


def persist_current_progress() -> None:
    if st.session_state.shared_mode:
        return
    users = dict(st.session_state.users)
    users[st.session_state.active_user] = dict(st.session_state.progress)
    st.session_state.users = users
    write_progress_store(st.session_state.active_user, users)


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
    palette = {
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
    }[theme]
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
        /* Keep the header visible so the sidebar open/close control stays available (it lives in the header). */
        [data-testid="stHeader"] {{
            background: linear-gradient(180deg, var(--surface), var(--muted)) !important;
            border-bottom: 1px solid var(--border);
        }}
        [data-testid="stToolbar"] {{
            background: transparent !important;
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
            padding-top: 2.75rem;
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
        }}
        .hero h1 {{
            margin: 0;
            font-size: 2rem;
            line-height: 1.1;
            color: var(--accent);
        }}
        .hero p, .meta, .empty, .share-note {{
            color: var(--soft);
        }}
        .stat-grid {{
            display: grid;
            grid-template-columns: repeat(3, minmax(0, 1fr));
            gap: 0.8rem;
            margin-top: 1rem;
        }}
        .stat-card {{
            background: var(--card);
            border: 1px solid var(--border);
            border-radius: 20px;
            padding: 1rem;
        }}
        .stat-label {{
            font-size: 0.78rem;
            text-transform: uppercase;
            letter-spacing: 0.08em;
            color: var(--soft);
        }}
        .stat-value {{
            font-size: 1.45rem;
            font-weight: 700;
            margin-top: 0.2rem;
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
        .pokemon-card {{
            background: linear-gradient(180deg, var(--card), var(--surface));
            border: 1px solid var(--border);
            border-radius: 22px;
            padding: 0.95rem 1rem 0.85rem;
            box-shadow: var(--shadow);
            margin-bottom: 1rem;
            min-height: 0;
            transition: border-color 0.2s ease, background 0.2s ease, transform 0.2s ease;
            position: relative;
        }}
        .pokemon-card.collected {{
            background: linear-gradient(180deg, var(--success-bg), var(--success-bg-2));
            border: 2px solid var(--success-border);
            box-shadow: 0 16px 38px color-mix(in srgb, var(--success-border) 18%, transparent);
        }}
        .pokemon-header {{
            display: flex;
            align-items: flex-start;
            justify-content: space-between;
            gap: 0.85rem;
        }}
        .pokemon-main {{
            display: flex;
            align-items: center;
            gap: 0.85rem;
            min-width: 0;
            flex: 1;
        }}
        .pokemon-thumb {{
            width: 68px;
            height: 68px;
            image-rendering: pixelated;
            filter: drop-shadow(0 12px 20px rgba(15, 23, 42, 0.18));
        }}
        .pokemon-number {{
            font-size: 0.9rem;
            letter-spacing: 0.08em;
            text-transform: uppercase;
            color: var(--soft);
        }}
        .pokemon-name {{
            font-size: 1.2rem;
            font-weight: 700;
            color: var(--text);
            margin: 0.15rem 0;
        }}
        .pokemon-copy {{
            min-width: 0;
        }}
        .pokemon-gen {{
            font-size: 0.96rem;
            color: var(--soft);
        }}
        .status-badge {{
            display: inline-flex;
            align-items: center;
            justify-content: center;
            border-radius: 999px;
            padding: 0.38rem 0.65rem;
            font-size: 0.72rem;
            font-weight: 800;
            letter-spacing: 0.05em;
            text-transform: uppercase;
            white-space: nowrap;
            border: 1px solid var(--border);
            color: var(--soft);
            background: color-mix(in srgb, var(--soft) 12%, transparent);
        }}
        .status-badge.collected {{
            background: color-mix(in srgb, var(--success-border) 22%, transparent);
            color: var(--success-text);
            border-color: color-mix(in srgb, var(--success-border) 42%, transparent);
        }}
        .type-row {{
            display: flex;
            gap: 0.35rem;
            flex-wrap: wrap;
            margin-top: 0.8rem;
        }}
        .type-pill {{
            display: inline-flex;
            align-items: center;
            border-radius: 999px;
            padding: 0.3rem 0.65rem;
            font-size: 0.78rem;
            font-weight: 700;
        }}
        .card-meta-row {{
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 0.75rem;
            margin-top: 0.75rem;
        }}
        .card-note {{
            font-size: 0.9rem;
            color: var(--soft);
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
        .compare-grid {{
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 1rem;
            margin-top: 1rem;
        }}
        .compare-summary {{
            margin-bottom: 1.25rem;
        }}
        .compare-panel {{
            background: linear-gradient(180deg, var(--card), var(--surface));
            border: 1px solid var(--border);
            border-radius: 22px;
            padding: 1rem;
            box-shadow: var(--shadow);
        }}
        .compare-panel h3 {{
            margin: 0 0 0.3rem 0;
            color: var(--text);
        }}
        .compare-stats {{
            display: grid;
            grid-template-columns: repeat(3, minmax(0, 1fr));
            gap: 0.6rem;
            margin: 0.85rem 0 1rem;
        }}
        .compare-stat {{
            background: color-mix(in srgb, var(--muted) 78%, var(--surface));
            border: 1px solid var(--border);
            border-radius: 16px;
            padding: 0.7rem 0.75rem;
        }}
        .compact-list {{
            display: flex;
            flex-direction: column;
            gap: 0.45rem;
            max-height: 68vh;
            overflow: auto;
            overflow-anchor: none;
            overscroll-behavior: contain;
            padding-right: 0.15rem;
        }}
        .compact-row {{
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 0.8rem;
            padding: 0.6rem 0.75rem;
            border: 1px solid var(--border);
            border-radius: 14px;
            background: color-mix(in srgb, var(--surface) 88%, var(--muted));
            content-visibility: auto;
            contain-intrinsic-size: auto 3.75rem;
        }}
        .compact-row.collected {{
            border-color: var(--success-border);
            background: var(--success-bg);
        }}
        .compact-copy {{
            min-width: 0;
        }}
        .compact-title {{
            font-size: 1.08rem;
            font-weight: 700;
            color: var(--text);
            line-height: 1.2;
        }}
        .compact-meta {{
            font-size: 0.9rem;
            color: var(--soft);
            margin-top: 0.14rem;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }}
        .compact-status {{
            flex-shrink: 0;
            border-radius: 999px;
            padding: 0.25rem 0.55rem;
            font-size: 0.7rem;
            font-weight: 700;
            border: 1px solid var(--border);
            color: var(--soft);
        }}
        .compact-status.collected {{
            background: color-mix(in srgb, var(--success-bg) 90%, transparent);
            border-color: var(--success-border);
            color: var(--success-text);
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
        }}
        .stTextInput input::placeholder,
        .stNumberInput input::placeholder {{
            color: var(--soft) !important;
            opacity: 1;
        }}
        .stTextInput input,
        .stNumberInput input {{
            box-shadow: none !important;
            outline: none !important;
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
                font-size: 1.55rem;
            }}
            .stat-grid {{
                grid-template-columns: repeat(3, minmax(0, 1fr));
                gap: 0.55rem;
            }}
            .stat-card {{
                padding: 0.8rem;
                border-radius: 16px;
            }}
            .stat-value {{
                font-size: 1.15rem;
            }}
            .pokemon-card {{
                padding: 0.78rem 0.82rem;
                border-radius: 18px;
            }}
            .pokemon-thumb {{
                width: 56px;
                height: 56px;
            }}
            .pokemon-header {{
                gap: 0.65rem;
            }}
            .pokemon-main {{
                gap: 0.65rem;
            }}
            .pokemon-name {{
                font-size: 1.08rem;
            }}
            .pokemon-gen {{
                font-size: 0.88rem;
            }}
            .status-badge {{
                padding: 0.3rem 0.52rem;
                font-size: 0.66rem;
            }}

            .compare-grid,
            .compare-stats {{
                grid-template-columns: 1fr;
            }}
            .type-pill {{
                padding: 0.22rem 0.5rem;
                font-size: 0.72rem;
            }}
        }}
        @media (max-width: 640px) {{
            .stat-grid {{
                grid-template-columns: 1fr;
            }}
        }}
        </style>
        """,
        unsafe_allow_html=True,
    )


def render_hero(total: int, collected: int, percentage: float) -> None:
    st.markdown(
        f"""
        <section class="hero">
            <h1>Pokémon Card Tracker</h1>
            <p>Gotta Check 'Em All! Build and share your Pokédex, one card at a time.</p>
            <p class="meta">Active user: {st.session_state.active_user}</p>
            <div class="stat-grid">
                <div class="stat-card">
                    <div class="stat-label">Collected</div>
                    <div class="stat-value">{collected:,}</div>
                </div>
                <div class="stat-card">
                    <div class="stat-label">Total Species</div>
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


def filter_and_sort(pokedex: list[dict]) -> list[dict]:
    progress = st.session_state.progress
    search = st.session_state.search.strip().lower()
    generation = st.session_state.generation
    completion = st.session_state.completion
    selected_types = st.session_state.selected_types

    results = pokedex
    if search:
        results = [
            entry
            for entry in results
            if search in get_display_name(entry, "en").lower()
            or search in entry["number"]
        ]
    if generation != "All":
        gen_number = int(generation.split(" ")[1])
        results = [entry for entry in results if entry["generation"] == gen_number]
    if completion == "Completed only":
        results = [entry for entry in results if progress.get(entry["id"], False)]
    elif completion == "Missing only":
        results = [entry for entry in results if not progress.get(entry["id"], False)]
    if selected_types:
        results = [entry for entry in results if any(t in entry["types"] for t in selected_types)]

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


def build_comparison_entries(pokedex: list[dict]) -> list[dict]:
    return sorted(pokedex, key=lambda item: item["id"])


def render_comparison_panel(username: str, progress: dict[int, bool], entries: list[dict]) -> None:
    collected = sum(1 for entry in entries if progress.get(entry["id"], False))
    total = len(entries)
    missing = total - collected
    completion = (100 * collected / total) if total else 0
    rows: list[str] = []
    for entry in entries:
        is_collected = progress.get(entry["id"], False)
        row_class = "compact-row collected" if is_collected else "compact-row"
        status_class = "compact-status collected" if is_collected else "compact-status"
        status_text = "Owned" if is_collected else "Missing"
        rows.append(
            (
                f'<div class="{row_class}">'
                f'<div class="compact-copy">'
                f'<div class="compact-title">#{entry["number"]} {get_display_name(entry, "en")}</div>'
                f'<div class="compact-meta">{GENERATION_NAMES[entry["generation"]]} · {", ".join(entry["types"])}</div>'
                f"</div>"
                f'<div class="{status_class}">{status_text}</div>'
                f"</div>"
            )
        )
    list_markup = "".join(rows)

    st.markdown(
        f"""
        <div class="compare-panel">
            <h3>{username}</h3>
            <div class="compare-stats">
                <div class="compare-stat">
                    <div class="stat-label">Collected</div>
                    <div class="stat-value">{collected:,}</div>
                </div>
                <div class="compare-stat">
                    <div class="stat-label">Missing</div>
                    <div class="stat-value">{missing:,}</div>
                </div>
                <div class="compare-stat">
                    <div class="stat-label">Completion</div>
                    <div class="stat-value">{completion:.1f}%</div>
                </div>
            </div>
            <div class="compact-list">{list_markup}</div>
        </div>
        """,
        unsafe_allow_html=True,
    )


def render_sidebar(pokedex: list[dict], current_page: str) -> None:
    all_types = sorted({ptype for entry in pokedex for ptype in entry["types"]})

    with st.sidebar:
        st.markdown('<div class="sidebar-user-label">Active user</div>', unsafe_allow_html=True)
        st.markdown(f'<div class="sidebar-user-value">{st.session_state.active_user}</div>', unsafe_allow_html=True)

        if st.session_state.shared_mode:
            st.caption("Shared view is read-only. User switching is disabled.")
        else:
            user_options = list(st.session_state.users)
            selected_user = st.selectbox(
                "Active user",
                options=user_options,
                index=user_options.index(st.session_state.active_user),
            )
            if selected_user != st.session_state.active_user:
                st.session_state.active_user = selected_user
                st.session_state.progress = dict(st.session_state.users[selected_user])
                write_progress_store(st.session_state.active_user, st.session_state.users)
                st.rerun()

        st.subheader("Pages")
        nav_home, nav_compare = st.columns(2)
        with nav_home:
            if st.button(
                "Home",
                use_container_width=True,
                type="primary" if current_page == "tracker" else "secondary",
            ):
                set_current_page("tracker")
                st.rerun()
        with nav_compare:
            if st.button(
                "Compare",
                use_container_width=True,
                type="primary" if current_page == "compare" else "secondary",
            ):
                set_current_page("compare")
                st.rerun()

        if current_page == "tracker":
            st.subheader("Search & Filter")
            st.text_input("Search Pokémon", key="search", placeholder="Name or Pokédex number")
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
            st.selectbox(
                "Generation",
                options=["All"] + [f"Gen {gen} - {name}" for gen, name in GENERATION_NAMES.items()],
                key="generation",
            )
            st.selectbox(
                "Completion",
                options=["Full Pokédex", "Completed only", "Missing only"],
                key="completion",
            )
            st.multiselect(
                "Types",
                options=all_types,
                key="selected_types",
                placeholder="All types",
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
        persist_current_progress()


def render_settings_page(pokedex: list[dict]) -> None:
    st.markdown(
        """
        <section class="hero">
            <h1>Settings</h1>
            <p>Adjust appearance, export your checklist, and manage user profiles.</p>
        </section>
        """,
        unsafe_allow_html=True,
    )

    st.subheader("Appearance")
    st.radio("Theme", options=["dark", "light"], key="theme", horizontal=True)

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

    left, right = st.columns([2, 1])
    with left:
        with st.form("settings_create_user_form", clear_on_submit=True):
            new_user = st.text_input("New user name", placeholder="Misty")
            create_user = st.form_submit_button("Create user", use_container_width=True)
        if create_user:
            username = sanitize_username(new_user)
            if not username:
                st.warning("Enter a user name.")
            elif username in st.session_state.users:
                st.warning("That user already exists.")
            else:
                updated_users = dict(st.session_state.users)
                updated_users[username] = {}
                st.session_state.users = updated_users
                st.session_state.active_user = username
                st.session_state.progress = {}
                write_progress_store(username, updated_users)
                set_current_page("tracker")
                st.rerun()

    with right:
        st.markdown("### Users")
        for username in st.session_state.users:
            marker = " (active)" if username == st.session_state.active_user else ""
            st.write(f"{username}{marker}")
        if st.button("Back to tracker", use_container_width=True):
            set_current_page("tracker")
            st.rerun()


def render_compare_page(pokedex: list[dict]) -> None:
    """Dedicated Compare page: side-by-side checklists for two users."""
    st.markdown(
        """
        <section class="hero">
            <h1>Compare users</h1>
            <p>Compare collection totals and inspect both checklists side by side.</p>
        </section>
        """,
        unsafe_allow_html=True,
    )

    if st.session_state.shared_mode:
        st.warning("Comparison is unavailable in shared view.")
        return

    user_options = list(st.session_state.users)
    if not user_options:
        st.info("Create a user first.")
        return

    left_default = (
        st.session_state.compare_left_user
        if st.session_state.compare_left_user in user_options
        else st.session_state.active_user
    )
    right_fallback = next((user for user in user_options if user != left_default), left_default)
    right_default = (
        st.session_state.compare_right_user
        if st.session_state.compare_right_user in user_options
        else right_fallback
    )

    selector_left, selector_right = st.columns(2)
    with selector_left:
        left_user = st.selectbox(
            "Left user",
            options=user_options,
            index=user_options.index(left_default),
            key="compare_left_selector",
        )
    with selector_right:
        right_user = st.selectbox(
            "Right user",
            options=user_options,
            index=user_options.index(right_default),
            key="compare_right_selector",
        )

    st.session_state.compare_left_user = left_user
    st.session_state.compare_right_user = right_user

    entries = build_comparison_entries(pokedex)
    left_progress = st.session_state.users.get(left_user, {})
    right_progress = st.session_state.users.get(right_user, {})

    only_left = sum(1 for entry in entries if left_progress.get(entry["id"], False) and not right_progress.get(entry["id"], False))
    only_right = sum(1 for entry in entries if right_progress.get(entry["id"], False) and not left_progress.get(entry["id"], False))
    overlap = sum(1 for entry in entries if right_progress.get(entry["id"], False) and left_progress.get(entry["id"], False))

    st.markdown(
        f"""
        <div class="stat-grid compare-summary">
            <div class="stat-card">
                <div class="stat-label">Shared cards</div>
                <div class="stat-value">{overlap:,}</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">Only {left_user}</div>
                <div class="stat-value">{only_left:,}</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">Only {right_user}</div>
                <div class="stat-value">{only_right:,}</div>
            </div>
        </div>
        """,
        unsafe_allow_html=True,
    )

    compare_left_col, compare_right_col = st.columns(2)
    with compare_left_col:
        render_comparison_panel(left_user, left_progress, entries)
    with compare_right_col:
        render_comparison_panel(right_user, right_progress, entries)


def render_pokemon_grid(entries: list[dict]) -> None:
    if not entries:
        st.markdown('<p class="empty">No Pokémon found for the current filters.</p>', unsafe_allow_html=True)
        return

    if st.session_state.page_size not in PAGE_SIZE_OPTIONS:
        st.session_state.page_size = 16

    raw_page_size = st.session_state.page_size
    if raw_page_size == "All":
        page_size = len(entries)
    else:
        page_size = int(raw_page_size)

    total_pages = max(1, (len(entries) + page_size - 1) // page_size)

    # Migrate legacy session key (older builds used key="page" on the number input).
    if "grid_page" not in st.session_state:
        st.session_state.grid_page = int(st.session_state.pop("page", 1))
    st.session_state.pop("page", None)

    if raw_page_size != "All" and st.session_state.pop("_grid_nav_dirty", False):
        st.session_state.pop("grid_page_input", None)

    st.session_state.grid_page = int(min(max(1, int(st.session_state.grid_page)), total_pages))
    if "grid_page_input" in st.session_state and raw_page_size != "All":
        st.session_state.grid_page_input = int(
            min(max(1, st.session_state.grid_page_input), total_pages)
        )

    nav_left, nav_mid, nav_right = st.columns([1, 1, 2])
    with nav_left:
        st.selectbox(
            "Page size",
            options=PAGE_SIZE_OPTIONS,
            format_func=lambda x: "All (every card)" if x == "All" else str(x),
            key="page_size",
        )
    with nav_mid:
        if raw_page_size == "All":
            st.number_input(
                "Page",
                min_value=1,
                max_value=1,
                step=1,
                value=1,
                disabled=True,
                key="grid_page_input_idle",
            )
        else:
            st.number_input(
                "Page",
                min_value=1,
                max_value=total_pages,
                value=st.session_state.grid_page,
                step=1,
                key="grid_page_input",
            )
            st.session_state.grid_page = int(st.session_state.grid_page_input)
    with nav_right:
        if raw_page_size == "All":
            meta = f'<p class="meta">Showing all {len(entries):,} Pokémon on one page.</p>'
        else:
            meta = f'<p class="meta">Showing {len(entries):,} Pokémon across {total_pages} pages.</p>'
        st.markdown(meta, unsafe_allow_html=True)

    start = (st.session_state.grid_page - 1) * page_size
    page_entries = entries[start : start + page_size]

    for row_start in range(0, len(page_entries), 2):
        cols = st.columns(2)
        for col, entry in zip(cols, page_entries[row_start : row_start + 2]):
            with col:
                checked = st.session_state.progress.get(entry["id"], False)
                name = get_display_name(entry, "en")
                card_class = "pokemon-card collected" if checked else "pokemon-card"
                status_class = "status-badge collected" if checked else "status-badge"
                status_text = "Collected" if checked else "Open"
                card_note = "Tap card to remove from collection" if checked else "Tap card to add this card"
                card_id = entry["id"]
                readonly_class = " pokemon-card-readonly" if st.session_state.shared_mode else ""
                st.markdown(
                    f"""
                    <div class="{card_class}{readonly_class}" id="pokemon-card-{card_id}">
                        <div class="pokemon-header">
                            <div class="pokemon-main">
                                <img class="pokemon-thumb" src="{entry["imageUrl"]}" alt="{name}" />
                                <div class="pokemon-copy">
                                    <div class="pokemon-number">#{entry["number"]}</div>
                                    <div class="pokemon-name">{name}</div>
                                    <div class="pokemon-gen">{GENERATION_NAMES[entry["generation"]]} · Gen {entry["generation"]}</div>
                                </div>
                            </div>
                            <div class="{status_class}">{status_text}</div>
                        </div>
                        <div class="type-row">
                            {"".join(
                                f'<span class="type-pill" style="background:{TYPE_COLORS.get(ptype, ("#e2e8f0", "#0f172a"))[0]};color:{TYPE_COLORS.get(ptype, ("#e2e8f0", "#0f172a"))[1]};">{ptype}</span>'
                                for ptype in entry["types"]
                            )}
                        </div>
                        <div class="card-meta-row">
                            <div class="card-note">{card_note}</div>
                        </div>
                    </div>
                    """,
                    unsafe_allow_html=True,
                )
                if st.button(
                    f"Toggle##{entry['id']}",
                    key=f"card_toggle_{entry['id']}",
                    disabled=st.session_state.shared_mode,
                ):
                    toggle_pokemon(entry["id"], not checked)
                    st.rerun()

    if raw_page_size != "All" and total_pages > 1:
        st.divider()
        prev_col, mid_col, next_col = st.columns([1, 2, 1])
        with prev_col:
            if st.button(
                "← Previous",
                key="page_nav_prev_bottom",
                disabled=st.session_state.grid_page <= 1,
                use_container_width=True,
            ):
                st.session_state.grid_page = max(1, int(st.session_state.grid_page) - 1)
                st.session_state._grid_nav_dirty = True
                st.rerun()
        with mid_col:
            st.markdown(
                f'<p class="meta" style="text-align:center;margin:0.65rem 0 0;">Page {st.session_state.grid_page} of {total_pages}</p>',
                unsafe_allow_html=True,
            )
        with next_col:
            if st.button(
                "Next →",
                key="page_nav_next_bottom",
                disabled=st.session_state.grid_page >= total_pages,
                use_container_width=True,
            ):
                st.session_state.grid_page = min(
                    total_pages, int(st.session_state.grid_page) + 1
                )
                st.session_state._grid_nav_dirty = True
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
                        card.dataset.pokemonCardBound = "1";
                        card.style.cursor = "pointer";
                        card.addEventListener(
                            "click",
                            function () {
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
                bind(appDocument());
            }

            tick();
            var passes = 0;
            var timer = window.setInterval(function () {
                passes += 1;
                tick();
                if (passes > 60) {
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
    pokedex = load_pokedex()
    current_page = get_current_page()
    render_sidebar(pokedex, current_page)

    if current_page == "settings":
        render_settings_page(pokedex)
        return

    if current_page == "compare":
        if st.session_state.shared_mode:
            st.markdown(
                '<div class="shared-banner">Shared view detected. Checklist editing is disabled until you remove the `shared` query parameter.</div>',
                unsafe_allow_html=True,
            )
        render_compare_page(pokedex)
        return

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
    render_pokemon_grid(entries)


if __name__ == "__main__":
    main()
