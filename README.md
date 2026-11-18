# Arkoid

A static Android app download marketplace for **https://arkan17.github.io**, built with plain HTML, CSS and vanilla JavaScript. It has no backend and uses no paid services. APK files are hosted on **GitHub Releases**, not in this repository.

## Project structure

```
arkan17.github.io/
├── index.html        Home: hero, catalogue (search + category filters), contact
├── app.html          App detail page (app.html?id=<app-id>)
├── about.html        About page
├── privacy.html      Privacy Policy
├── 404.html          Not-found page
├── data/apps.json    ← The app catalogue (edit this file to manage apps)
├── css/style.css     Styles (dark theme, responsive)
├── js/app.js         Catalogue rendering, search, filters, detail page
├── assets/           favicon.svg, og-image.svg, (your icons/screenshots)
├── robots.txt / sitemap.xml
└── .nojekyll         Tells GitHub Pages to serve files as-is
```

## 1. Publish the website on GitHub Pages

1. Create a **public** repository named exactly `arkan17.github.io` under the `Arkan17` account.
2. Upload all files in this folder to the `main` branch, using either:
   - **Web upload:** on the repo page, click **Add file → Upload files**, drag in the *contents* of this folder (not the folder itself), then commit.
   - **git:**
     ```bash
     git init
     git add .
     git commit -m "Initial site"
     git branch -M main
     git remote add origin https://github.com/Arkan17/arkan17.github.io.git
     git push -u origin main
     ```
3. Go to **Settings → Pages**. Under **Build and deployment**, set *Source* to **Deploy from a branch**, set *Branch* to `main` and the folder to `/ (root)`, then click **Save**.
4. Wait 1–2 minutes, then open **https://arkan17.github.io**.

## 2. Host APKs with GitHub Releases

Don't commit APK files to this repo, because GitHub blocks files over 100 MB and large files bloat the repository. Instead:

1. Create a repository for each app, for example `Arkan17/task-flow`, or a single `Arkan17/apk-releases` repository.
2. Open **Releases → Draft a new release**, create a tag such as `v1.0.0`, and attach the `.apk` file. Each release asset can be up to 2 GB.
3. Click **Publish release**, then right-click the APK in the release and copy the link. It will look like this:
   ```
   https://github.com/Arkan17/task-flow/releases/download/v1.0.0/TaskFlow-1.0.0.apk
   ```
4. Paste that link into the app's `downloadUrl` field in `data/apps.json`.

Tip: `https://github.com/Arkan17/<repo>/releases/latest/download/<file>.apk` always points to the newest release, provided the filename stays the same across versions.

## 3. Add or edit apps

Each entry in `data/apps.json` looks like this:

```json
{
  "id": "task-flow",                 // unique, used in the URL: app.html?id=task-flow
  "name": "TaskFlow",
  "tagline": "Short one-line pitch",
  "category": "Productivity",        // category filter chips are generated automatically
  "description": "Longer description.",
  "features": ["Feature 1", "Feature 2"],
  "version": "1.0.0",
  "size": "52 MB",
  "releaseDate": "2026-01-15",       // YYYY-MM-DD
  "updated": "2026-10-02",
  "minAndroid": "8.0",
  "changelog": "What's new in this version.",
  "color": "#7c5cff",                // accent for the generated placeholder icon
  "icon": "assets/icons/task-flow.png",          // optional; empty = generated icon
  "screenshots": ["assets/shots/task-flow-1.png"], // optional; empty = placeholders
  "downloadUrl": ""                  // empty = "Coming soon" button
}
```

(JSON doesn't allow comments. The comments above are only for explanation.)

The sample entries are placeholders. Replace them with your real apps, icons, screenshots and Release links. Keep icons around 256×256 and screenshots small (WebP or PNG under 300 KB).

## 4. Preview locally

The site loads `data/apps.json` with `fetch`, so opening `index.html` by double-clicking won't load the catalogue. Run a local server instead:

```bash
npx serve .            # Node.js
# or
python -m http.server  # Python
```

Then open the URL it prints, for example http://localhost:3000.

## License

© Arkan17. All rights reserved.
