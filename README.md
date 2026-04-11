# Pokémon Card Tracker

Streamlit checklist for tracking your Pokédex. Run locally:

```bash
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
streamlit run app.py
```

## GitHub (private repo)

1. On [github.com/new](https://github.com/new): choose **Private**, create the repo (no README if you already have this folder).
2. In a terminal on your machine:

```bash
cd /path/to/pokemon
git init -b main
git add app.py requirements.txt .streamlit/config.toml data/pokedex.json .gitignore README.md
git commit -m "Initial commit: Pokémon Card Tracker"
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
git push -u origin main
```

`data/progress.json` is ignored so each clone (and the cloud app) starts with its own progress unless you add persistence later.

## Publish to a URL (Streamlit Community Cloud)

1. Push the repo to GitHub (steps above).
2. Sign in at [share.streamlit.io](https://share.streamlit.io) with GitHub.
3. **New app** → pick the repo, branch `main`, main file **`app.py`**.
4. Deploy. Cloud will install dependencies from `requirements.txt`.

### Durable data (PostgreSQL)

Streamlit Community Cloud’s filesystem is **not** reliable for `data/progress.json`. This app uses **PostgreSQL** when configured.

1. Create a free database (e.g. [Neon](https://neon.tech) or [Supabase](https://supabase.com)) and copy the **connection string** (must start with `postgresql://` or `postgres://`).
2. In Streamlit Cloud: **App settings → Secrets** and add:

   ```toml
   DATABASE_URL = "postgresql://USER:PASSWORD@HOST/DBNAME?sslmode=require"
   ```

3. Redeploy. Tables (`tracker_user`, `collection_entry`, `app_setting`) are created automatically on first run.

If `DATABASE_URL` is missing, the app keeps using **`data/progress.json`** (good for local development).

**Note:** The app does not implement login. Everyone hitting your public Streamlit URL shares the same database (same as sharing one `progress.json`). That is usually fine for a personal or household deployment; add authentication later if you need isolated cloud accounts.

For **private** apps on the community tier, check Streamlit’s current docs for [app visibility](https://docs.streamlit.io/streamlit-community-cloud) and plans.

Alternatives: **Railway**, **Render**, or **Fly.io** with `streamlit run app.py --server.port $PORT --server.address 0.0.0.0`.
