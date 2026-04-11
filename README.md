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

For **private** apps on the community tier, check Streamlit’s current docs for [app visibility](https://docs.streamlit.io/streamlit-community-cloud) and plans.

Alternatives: **Railway**, **Render**, or **Fly.io** with `streamlit run app.py --server.port $PORT --server.address 0.0.0.0`.
