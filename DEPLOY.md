# Deploy slowly — data + team logos

Two separate things ship to GitHub Pages: **JSON league data** and **PNG logos**.

---

## 1. League data (standings, fixtures, waivers)

The live site reads **`league-data/details.json`** (and other JSON next to it).

### Path A — automatic (recommended)

1. GitHub repo → **Settings** → **Secrets and variables** → **Actions**
2. Add **Repository secret** named exactly: **`FPL_LEAGUE_ID`**
3. Value = the number in your draft URL:  
   `draft.premierleague.com/league/`**`123456`**
4. Push any commit (or run the workflow).

On each build, GitHub runs **`ingest.py`** with that ID, then builds the site.  
**If the secret lived only under “Environment” before, it never reached the build step** — that’s fixed now by tying the build job to the same `github-pages` environment, but **Repository secret** is still the simplest.

You can also set **Repository variable** `FPL_LEAGUE_ID` (Settings → Variables) if you prefer — same name.

### Path B — commit files

```bash
python3 ingest.py YOUR_LEAGUE_ID
cd web && npm run publish-real-league
git add web/public/league-data/
git commit -m "League data" && git push
```

---

## 1b. Live tab — FPL CORS proxy (Cloudflare Worker)

GitHub Pages cannot call `fantasy.premierleague.com` from the browser (CORS). The **Live** tab needs a tiny **proxy**.

1. Deploy the worker once (free Cloudflare account):

   ```bash
   cd web/workers/fpl-proxy
   npx wrangler login
   npx wrangler deploy
   ```

2. Copy the URL Wrangler prints (e.g. `https://tclot-fpl-proxy.yourname.workers.dev`).

3. Add **`VITE_FPL_PROXY_URL`** (no trailing slash). Name must match **exactly**. Use one of:

   - **Settings → Secrets and variables → Actions** → **Secrets** → New repository secret  
   - Or **Variables** on that page (same name) — the workflow reads both.
   - If the build still shows the value empty: **Settings → Environments → `github-pages` → Environment secrets** → add **`VITE_FPL_PROXY_URL`** (the deploy job uses that environment).

4. **Re-run the deploy workflow** after saving (**Actions → Run workflow** or push a commit).  
   Existing site JS **does not** update until a new build runs — `VITE_*` is baked in at build time.

5. Check **`https://YOUR_USER.github.io/YOUR_REPO/deploy-check.json`**: **`liveProxyConfigured`** should be **`true`**.  
   On **Live**, you should see **“Proxy active in this build”**. If you see **“No proxy in this JavaScript build”**, the last build did not receive the secret.

Optional: in `web/workers/fpl-proxy/wrangler.toml`, set `[vars] ALLOW_ORIGIN = "https://YOUR_USER.github.io"` to restrict CORS.

---

## 2. Team logos (PNG)

Logos are **not** fetched from FPL. They only exist if **you** put files in the repo.

1. Put images in **`web/public/team-logos/`**
2. Name them **`{id}.png`** where `id` is each team’s **`league_entries[].id`** from `details.json`
3. Commit and push:

```bash
git add web/public/team-logos/
git commit -m "Logos" && git push
```

The build generates **`team-logos-web/`** from those PNGs. No PNGs in git → site shows letter bubbles only.

---

## 3. Check what actually deployed

After a successful deploy, open (replace with your site):

**`https://YOUR_USER.github.io/YOUR_REPO/deploy-check.json`**

You’ll see something like:

```json
{
  "leagueName": "...",
  "teamCount": 8,
  "isDemoData": false,
  "teamLogosPngInDist": 0,
  ...
}
```

- **`isDemoData: true`** → data path A or B above isn’t wired yet  
- **`teamLogosPngInDist: 0`** → no PNGs were in the repo at build time  

In **Actions → latest run → build job log**, look for:

- `Ingest: league ID is configured` vs `No FPL_LEAGUE_ID`
- `Team logo PNGs in build: N`

---

## 4. Common mistakes

| Symptom | Cause |
|--------|--------|
| **Only README / Markdown, not the dashboard** | **Pages → Build and deployment** is set to **Deploy from a branch**. Switch **Source** to **GitHub Actions** so the workflow’s `dist/` upload is what gets published. |
| **Totally blank / white page** | Wrong URL or **missing trailing slash**. Use **Settings → Pages** “Visit site” link. Must look like `https://USER.github.io/REPO/` (**slash at the end**). |
| Demo league / yellow banner | No `FPL_LEAGUE_ID` and no real committed `league-data` |
| Wrong league | Wrong ID in secret |
| Letter avatars only | `team-logos/*.png` not committed |
