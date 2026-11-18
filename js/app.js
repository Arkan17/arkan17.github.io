/* Arkan Apps — catalogue logic (vanilla JS, no dependencies) */
(function () {
  "use strict";

  const DATA_URL = "data/apps.json";
  const SCRIPT_URL = document.currentScript && document.currentScript.src;
  const RATINGS_ON = !!window.ARKAN_FIREBASE;
  const DEVELOPER = "Arkan17";

  /* ---------- Helpers ---------- */
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const detailUrl = (a) => "app.html?id=" + encodeURIComponent(a.id);

  function formatDate(iso) {
    if (!iso) return "—";
    const d = new Date(iso + "T00:00:00");
    return isNaN(d) ? iso : d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  }

  function shade(hex, amt) {
    const n = parseInt(String(hex).replace("#", ""), 16);
    const r = Math.max(0, Math.min(255, (n >> 16) + amt));
    const g = Math.max(0, Math.min(255, ((n >> 8) & 255) + amt));
    const b = Math.max(0, Math.min(255, (n & 255) + amt));
    return "#" + ((r << 16) | (g << 8) | b).toString(16).padStart(6, "0");
  }

  const svgUri = (svg) => "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);

  /* Placeholder icon: flat brutalist tile with initials */
  function placeholderIcon(app) {
    const c = app.color || "#4d7cff";
    const initials = app.name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
    return svgUri(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><rect width="128" height="128" fill="${c}"/><circle cx="104" cy="22" r="34" fill="${shade(c, 40)}"/><rect x="-10" y="92" width="70" height="70" rx="10" transform="rotate(-18 25 127)" fill="${shade(c, -40)}"/><text x="64" y="81" font-family="Space Grotesk,Segoe UI,Arial,sans-serif" font-size="48" font-weight="700" fill="#fff" stroke="#111" stroke-width="3" paint-order="stroke" text-anchor="middle">${esc(initials)}</text></svg>`
    );
  }

  /* Placeholder screenshot: stylised phone UI */
  function placeholderShot(app, i) {
    const c = app.color || "#4d7cff";
    const rows = [0, 1, 2, 3, 4].map((k) => `<rect x="22" y="${214 + k * 72}" width="316" height="56" rx="12" fill="#fff" stroke="#111" stroke-width="3"/><rect x="36" y="${227 + k * 72}" width="30" height="30" rx="8" fill="${k % 2 ? "#ffd23f" : c}" stroke="#111" stroke-width="2.5"/><rect x="80" y="${231 + k * 72}" width="${120 + ((k * 37 + i * 23) % 120)}" height="9" rx="4" fill="#111"/><rect x="80" y="${246 + k * 72}" width="${80 + ((k * 19 + i * 31) % 90)}" height="7" rx="3" fill="#999"/>`).join("");
    return svgUri(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 760"><rect width="360" height="760" fill="#fff8e7"/><rect width="360" height="184" fill="${c}" stroke="#111" stroke-width="3"/><text x="22" y="96" font-family="Space Grotesk,Segoe UI,Arial,sans-serif" font-size="28" font-weight="700" fill="#fff" stroke="#111" stroke-width="2" paint-order="stroke">${esc(app.name)}</text><text x="22" y="128" font-family="Space Grotesk,Segoe UI,Arial,sans-serif" font-size="15" font-weight="600" fill="#111">Screen ${i + 1}</text>${rows}<rect x="22" y="676" width="316" height="52" rx="14" fill="#00b86b" stroke="#111" stroke-width="3"/></svg>`
    );
  }

  const iconOf = (app) => app.icon || placeholderIcon(app);
  const shotsOf = (app) => (app.screenshots && app.screenshots.length ? app.screenshots : [0, 1, 2, 3].map((i) => placeholderShot(app, i)));

  const DL_SVG = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12m0 0l-5-5m5 5l5-5M5 21h14"/></svg>`;

  function installButton(app) {
    if (app.downloadUrl) {
      return `<a class="btn btn-install" href="${esc(app.downloadUrl)}" rel="noopener" download>${DL_SVG} Install APK</a>`;
    }
    return `<span class="btn btn-install" aria-disabled="true" title="APK not published yet">Coming soon</span>`;
  }

  function getButton(app) {
    if (app.downloadUrl) {
      return `<a class="get" href="${esc(app.downloadUrl)}" rel="noopener" download aria-label="Download ${esc(app.name)} APK" title="Download APK">${DL_SVG}</a>`;
    }
    return `<span class="get" aria-disabled="true" title="Coming soon" aria-label="${esc(app.name)} coming soon">…</span>`;
  }

  function featCard(a) {
    return `<article class="feat box press">
      <a class="feat-banner" href="${detailUrl(a)}" style="background:${esc(a.color || "#4d7cff")}">
        <img class="app-icon" src="${iconOf(a)}" alt="" width="96" height="96">
      </a>
      <div class="feat-body">
        <div class="info"><h3><a href="${detailUrl(a)}">${esc(a.name)}</a></h3><p>${esc(a.tagline)}</p></div>
        ${getButton(a)}
      </div>
    </article>`;
  }

  function miniCard(a) {
    return `<a class="mini box press" href="${detailUrl(a)}">
      <img class="app-icon" src="${iconOf(a)}" alt="" loading="lazy">
      <div><h3>${esc(a.name)}</h3><div class="sub">${esc(a.size)}</div></div>
    </a>`;
  }

  function toast(msg) {
    let t = $(".toast");
    if (!t) { t = document.createElement("div"); t.className = "toast"; t.setAttribute("role", "status"); document.body.appendChild(t); }
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => t.classList.remove("show"), 2200);
  }

  function wireRail(rail, prev, next) {
    if (!rail) return;
    const step = () => Math.max(rail.clientWidth * 0.8, 260);
    prev && prev.addEventListener("click", () => rail.scrollBy({ left: -step(), behavior: "smooth" }));
    next && next.addEventListener("click", () => rail.scrollBy({ left: step(), behavior: "smooth" }));
  }

  /* ---------- Download counts (real numbers from GitHub Releases) ---------- */
  const RELEASES_API = "https://api.github.com/repos/Arkan17/arkan17.github.io/releases";
  const DL_CACHE = "arkan.downloads.v1";

  function fmtCount(n) {
    if (n < 1000) return String(n);
    if (n < 1e6) return (n / 1e3).toFixed(n < 1e4 ? 1 : 0).replace(/.0$/, "") + "K";
    return (n / 1e6).toFixed(n < 1e7 ? 1 : 0).replace(/.0$/, "") + "M";
  }

  async function loadDownloads() {
    try {
      const c = JSON.parse(sessionStorage.getItem(DL_CACHE) || "null");
      if (c && Date.now() - c.t < 10 * 60 * 1000) return c.m;
    } catch (e) { /* storage unavailable */ }
    const map = {};
    for (let page = 1; page <= 5; page++) {
      const res = await fetch(`${RELEASES_API}?per_page=100&page=${page}`, { headers: { Accept: "application/vnd.github+json" } });
      if (!res.ok) throw new Error("GitHub API " + res.status);
      const rels = await res.json();
      for (const r of rels) {
        const m = /^(.+)-v[0-9A-Za-z._]+$/.exec(r.tag_name || "");
        if (!m) continue;
        const n = (r.assets || []).filter((a) => /.apk$/i.test(a.name)).reduce((t, a) => t + (a.download_count || 0), 0);
        map[m[1]] = (map[m[1]] || 0) + n;
      }
      if (rels.length < 100) break;
    }
    try { sessionStorage.setItem(DL_CACHE, JSON.stringify({ t: Date.now(), m: map })); } catch (e) { /* ignore */ }
    return map;
  }

  /* Fill every [data-dl] / [data-dl-sub] / #stat-dl element once counts arrive */
  async function applyDownloads(apps) {
    applyListRatings(apps);
    let map;
    try { map = await loadDownloads(); } catch (e) { console.warn("Download counts unavailable:", e); }
    document.querySelectorAll("[data-dl]").forEach((el) => {
      el.textContent = map ? fmtCount(map[el.dataset.dl] || 0) : "—";
    });
    document.querySelectorAll("[data-dl-sub]").forEach((el) => {
      const n = map ? map[el.dataset.dlSub] || 0 : 0;
      el.textContent = n ? ` · ${fmtCount(n)} downloads` : "";
    });
    const total = $("#stat-dl");
    if (total) total.textContent = map ? fmtCount(apps.reduce((t, a) => t + (map[a.id] || 0), 0)) : "—";
  }

  /* ---------- Star ratings (Firebase, optional) ---------- */
  let ratingsMod = null;
  function ratingsModule() {
    if (!RATINGS_ON) return Promise.resolve(null);
    if (!ratingsMod) {
      const url = new URL(SCRIPT_URL ? "ratings.js" : "js/ratings.js", SCRIPT_URL || location.href).href;
      ratingsMod = import(url).catch((e) => { console.warn("Ratings unavailable:", e); return null; });
    }
    return ratingsMod;
  }
  const RT_CACHE = "arkan.ratings.v1";
  let listRatings = null;

  async function applyListRatings(apps) {
    if (!RATINGS_ON || !document.querySelector("[data-rt-pill]")) return;
    if (!listRatings) {
      try {
        const c = JSON.parse(sessionStorage.getItem(RT_CACHE) || "null");
        if (c && Date.now() - c.t < 10 * 60 * 1000) listRatings = c.m;
      } catch (e) { /* storage unavailable */ }
    }
    if (!listRatings) {
      const R = await ratingsModule();
      if (!R) return;
      const pairs = await Promise.all(apps.map((a) => R.summary(a.id).then((x) => [a.id, x]).catch(() => [a.id, null])));
      listRatings = Object.fromEntries(pairs);
      try { sessionStorage.setItem(RT_CACHE, JSON.stringify({ t: Date.now(), m: listRatings })); } catch (e) { /* ignore */ }
    }
    document.querySelectorAll("[data-rt-pill]").forEach((el) => {
      const r = listRatings[el.dataset.rtPill];
      if (r && r.n) { el.textContent = "★ " + r.avg.toFixed(1); el.hidden = false; }
    });
  }

  function getLocal(key) { try { return localStorage.getItem(key); } catch (e) { return null; } }
  function setLocal(key, v) { try { localStorage.setItem(key, v); } catch (e) { /* ignore */ } }

  async function initRatingsUI(app) {
    const panel = $("#ratings-panel");
    if (!panel) return;
    const R = await ratingsModule();
    if (!R) return;
    panel.hidden = false;
    const key = "arkan.rated." + app.id;
    let mine = parseInt(getLocal(key) || "0", 10);
    const btns = $$("#rate button");
    const msg = $("#rate-msg");
    const paint = (k) => btns.forEach((b, i) => { b.classList.toggle("on", i < k); b.setAttribute("aria-checked", String(i + 1 === mine)); });
    paint(mine);
    if (mine) msg.textContent = "You rated " + mine + " ★. Tap a star to change it.";

    async function refresh() {
      try {
        const { dist, n, avg } = await R.distribution(app.id);
        const label = n ? fmtCount(n) + " rating" + (n === 1 ? "" : "s") : "No ratings yet";
        $("#rt-avg").textContent = n ? avg.toFixed(1) : "–";
        $("#rt-stars").style.setProperty("--p", (avg / 5) * 100 + "%");
        $("#rt-stars").setAttribute("aria-label", n ? avg.toFixed(1) + " out of 5" : "No ratings yet");
        $("#rt-count").textContent = label;
        $("#rt-bars").innerHTML = [5, 4, 3, 2, 1].map((k) =>
          '<div class="rt-bar"><span>' + k + '</span><div class="rt-track"><div class="rt-fill" style="width:' + (n ? (dist[k] / n) * 100 : 0) + '%"></div></div></div>').join("");
        document.querySelectorAll("[data-rt-avg]").forEach((el) => (el.textContent = n ? avg.toFixed(1) + " ★" : "–"));
        document.querySelectorAll("[data-rt-n]").forEach((el) => (el.textContent = n ? label : "No ratings"));
      } catch (e) {
        console.warn("Couldn’t load ratings:", e);
        $("#rt-count").textContent = "Ratings unavailable right now";
      }
    }

    btns.forEach((b, i) => {
      b.addEventListener("mouseenter", () => paint(i + 1));
      b.addEventListener("mouseleave", () => paint(mine));
      b.addEventListener("click", async () => {
        const k = i + 1;
        btns.forEach((x) => (x.disabled = true));
        msg.textContent = "Saving…";
        try {
          await R.rate(app.id, k);
          mine = k;
          setLocal(key, String(k));
          try { sessionStorage.removeItem(RT_CACHE); } catch (e) { /* ignore */ }
          paint(mine);
          msg.textContent = "Thanks! You rated " + k + " ★. Tap a star to change it.";
          await refresh();
        } catch (e) {
          console.warn(e);
          paint(mine);
          msg.textContent = "Couldn’t save your rating. Please try again.";
        } finally {
          btns.forEach((x) => (x.disabled = false));
        }
      });
    });
    refresh();
  }

  async function loadApps() {
    const res = await fetch(DATA_URL, { cache: "no-cache" });
    if (!res.ok) throw new Error("Could not load " + DATA_URL);
    const json = await res.json();
    return json.apps || [];
  }

  /* ---------- Nav (all pages) ---------- */
  function initNav() {
    const btn = $(".menu-btn");
    const links = $(".nav-links");
    if (btn && links) {
      btn.addEventListener("click", () => btn.setAttribute("aria-expanded", links.classList.toggle("open")));
      links.addEventListener("click", (e) => { if (e.target.tagName === "A") links.classList.remove("open"); });
    }
    const y = $("#year");
    if (y) y.textContent = new Date().getFullYear();
  }

  /* ---------- Home ---------- */
  function initHome(apps) {
    const list = $("#app-grid");
    const input = $("#search");
    const form = $("#search-form");
    const chipsWrap = $("#chips");
    const promo = $$("[data-promo]");
    const listTitle = $("#list-title");
    let activeCat = "All";

    const cats = ["All", ...Array.from(new Set(apps.map((a) => a.category))).sort()];
    chipsWrap.innerHTML = cats.map((c) => `<button class="chip${c === "All" ? " active" : ""}" data-cat="${esc(c)}">${esc(c)}</button>`).join("");
    $("#stat-apps").textContent = apps.length;

    const featured = apps.filter((a) => a.featured);
    $("#featured-rail").innerHTML = (featured.length ? featured : apps.slice(0, 4)).map(featCard).join("");
    wireRail($("#featured-rail"), $("#feat-prev"), $("#feat-next"));

    function render() {
      const q = input.value.trim().toLowerCase();
      const filtering = q || activeCat !== "All";
      promo.forEach((el) => (el.hidden = !!filtering));
      if (!apps.length) $("#featured-sec").hidden = true;
      listTitle.textContent = q ? `Results for “${input.value.trim()}”` : activeCat !== "All" ? activeCat : "All apps";

      const items = apps.filter((a) => {
        const inCat = activeCat === "All" || a.category === activeCat;
        const hay = [a.name, a.tagline, a.description, a.category].join(" ").toLowerCase();
        return inCat && (!q || hay.includes(q));
      });
      if (!items.length) {
        list.innerHTML = `<div class="empty box">${apps.length ? "No apps found. Try another search." : "New apps are coming soon. Check back shortly!"}</div>`;
        return;
      }
      list.innerHTML = items.map((a, i) => `
        <article class="row box press" style="animation-delay:${Math.min(i * 40, 400)}ms">
          <span class="rank">${i + 1}</span>
          <a href="${detailUrl(a)}"><img class="app-icon" src="${iconOf(a)}" alt="${esc(a.name)} icon" loading="lazy" width="64" height="64"></a>
          <a class="info" href="${detailUrl(a)}">
            <h3>${esc(a.name)}</h3>
            <div class="sub">${esc(a.category)} · ${esc(a.size)}<span data-dl-sub="${esc(a.id)}"></span></div>
            <span class="pill">v${esc(a.version)}</span> <span class="pill rt-pill" data-rt-pill="${esc(a.id)}" hidden></span>
          </a>
          ${getButton(a)}
        </article>`).join("");
    }

    chipsWrap.addEventListener("click", (e) => {
      const chip = e.target.closest(".chip");
      if (!chip) return;
      activeCat = chip.dataset.cat;
      $(".chip", chipsWrap).forEach((c) => c.classList.toggle("active", c === chip));
      render();
      applyDownloads(apps);
    });
    input.addEventListener("input", () => { render(); applyDownloads(apps); });
    form.addEventListener("submit", (e) => { e.preventDefault(); render(); $("#apps").scrollIntoView({ behavior: "smooth" }); });

    const q = new URLSearchParams(location.search).get("q");
    if (q) { input.value = q; }
    render();
    applyDownloads(apps);
    if (q) $("#apps").scrollIntoView();
  }

  /* ---------- Detail ---------- */
  function initDetail(apps) {
    const id = new URLSearchParams(location.search).get("id");
    const app = apps.find((a) => a.id === id);
    const root = $("#app-detail");
    if (!app) {
      root.innerHTML = `<div class="empty box" style="margin-top:40px"><h2>App not found</h2><p style="margin:10px 0 22px">The app you’re looking for doesn’t exist.</p><a class="btn btn-yellow" href="index.html#apps">Browse apps</a></div>`;
      return;
    }
    document.title = `${app.name} — Download APK | Arkan Apps`;
    const md = $('meta[name="description"]');
    if (md) md.setAttribute("content", `${app.name}: ${app.tagline}. Download the latest APK (v${app.version}).`);

    const more = apps.filter((a) => a.id !== app.id)
      .sort((a, b) => (b.category === app.category) - (a.category === app.category))
      .slice(0, 8);

    root.innerHTML = `
      <div class="crumbs"><a href="index.html">Home</a> / <a href="index.html?q=${encodeURIComponent(app.category)}">${esc(app.category)}</a> / ${esc(app.name)}</div>
      <div class="d-head">
        <img class="app-icon" src="${iconOf(app)}" alt="${esc(app.name)} icon" width="112" height="112">
        <div>
          <h1>${esc(app.name)}</h1>
          <a class="dev" href="https://github.com/${DEVELOPER}" target="_blank" rel="noopener">${DEVELOPER}</a>
          <div class="sub">${esc(app.tagline)}</div>
        </div>
      </div>
      <div class="d-stats box">
        ${RATINGS_ON ? `<div><strong data-rt-avg>…</strong><small data-rt-n>Ratings</small></div>` : ""}
        <div><strong data-dl="${esc(app.id)}">…</strong><small>Downloads</small></div>
        <div><strong>${esc(app.size)}</strong><small>Size</small></div>
        <div><strong>${esc(app.version)}</strong><small>Version</small></div>
        ${RATINGS_ON ? "" : `<div><strong>${formatDate(app.updated)}</strong><small>Updated</small></div>`}
      </div>
      <div class="d-actions">
        ${installButton(app)}
        <button class="btn" id="share-btn" type="button">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4"/></svg>
          Share
        </button>
      </div>

      <div class="shots">${shotsOf(app).map((s, i) => `<button class="shot box" type="button"><img src="${esc(s)}" alt="${esc(app.name)} screenshot ${i + 1}" loading="lazy"></button>`).join("")}</div>

      <div class="d-grid">
        <div class="d-col">
          <div class="panel box">
            <h2>About this app</h2>
            <p>${esc(app.description)}</p>
            <ul class="feature-list">${(app.features || []).map((f) => `<li>${esc(f)}</li>`).join("")}</ul>
            <div class="tags"><span class="chip">${esc(app.category)}</span></div>
          </div>
          ${RATINGS_ON ? `<div class="panel box" id="ratings-panel" hidden>
            <h2>Ratings</h2>
            <div class="rt-wrap">
              <div class="rt-big"><strong id="rt-avg">…</strong><span class="stars" id="rt-stars" role="img" aria-label="Loading rating"></span><small id="rt-count">Loading…</small></div>
              <div class="rt-bars" id="rt-bars"></div>
            </div>
            <h3 class="rate-title">Rate this app</h3>
            <div class="rate" id="rate" role="radiogroup" aria-label="Rate this app">
              ${[1, 2, 3, 4, 5].map((k) => `<button type="button" role="radio" aria-checked="false" aria-label="${k} star${k > 1 ? "s" : ""}">★</button>`).join("")}
            </div>
            <p class="sub" id="rate-msg">Tap a star to rate. No sign-up needed.</p>
          </div>` : ""}
          <div class="panel box">
            <h2>What’s new</h2>
            <p><strong style="color:var(--text)">v${esc(app.version)}</strong> · ${formatDate(app.updated)}</p>
            <p style="margin-top:6px">${esc(app.changelog)}</p>
          </div>
        </div>
        <div class="d-col">
          <div class="panel box">
            <h2>App info</h2>
            <table class="info-table">
              <tr><td>Downloads</td><td data-dl="${esc(app.id)}">…</td></tr>
              <tr><td>Version</td><td>${esc(app.version)}</td></tr>
              <tr><td>Size</td><td>${esc(app.size)}</td></tr>
              <tr><td>Released</td><td>${formatDate(app.releaseDate)}</td></tr>
              <tr><td>Updated</td><td>${formatDate(app.updated)}</td></tr>
              <tr><td>Requires</td><td>Android ${esc(app.minAndroid)}+</td></tr>
              <tr><td>Developer</td><td>${DEVELOPER}</td></tr>
            </table>
          </div>
          <div class="panel box note">
            <h2>How to install</h2>
            <p>Download the APK, open it, and allow “Install unknown apps” for your browser if Android asks.</p>
          </div>
        </div>
      </div>

      ${more.length ? `<section>
        <div class="section-head"><h2>More apps</h2><div class="arrows"><button class="arrow" id="more-prev" aria-label="Scroll left">←</button><button class="arrow" id="more-next" aria-label="Scroll right">→</button></div></div>
        <div class="rail" id="more-rail">${more.map(miniCard).join("")}</div>
      </section>` : ""}`;

    wireRail($("#more-rail"), $("#more-prev"), $("#more-next"));
    applyDownloads(apps);
    initRatingsUI(app);

    $("#share-btn").addEventListener("click", async () => {
      const data = { title: app.name, text: app.tagline, url: location.href };
      try {
        if (navigator.share) { await navigator.share(data); return; }
        await navigator.clipboard.writeText(location.href);
        toast("Link copied!");
      } catch (e) { /* share cancelled */ }
    });

    const lb = $("#lightbox");
    const lbImg = $("img", lb);
    $$(".shot img", root).forEach((img) =>
      img.parentElement.addEventListener("click", () => { lbImg.src = img.src; lbImg.alt = img.alt; lb.classList.add("open"); })
    );
    lb.addEventListener("click", () => lb.classList.remove("open"));
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") lb.classList.remove("open"); });
  }

  /* ---------- Boot ---------- */
  document.addEventListener("DOMContentLoaded", async () => {
    initNav();
    const page = document.body.dataset.page;
    if (page !== "home" && page !== "detail") return;
    try {
      const apps = await loadApps();
      if (page === "home") initHome(apps);
      else initDetail(apps);
    } catch (err) {
      console.error(err);
      const target = $("#app-grid") || $("#app-detail");
      if (target) target.innerHTML = `<div class="empty box">Couldn’t load the app catalogue. If you opened this file directly, run it through a local web server (see README).</div>`;
    }
  });
})();
