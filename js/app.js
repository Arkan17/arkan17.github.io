/* Arkan Apps — catalogue logic (vanilla JS, no dependencies) */
(function () {
  "use strict";

  const DATA_URL = "data/apps.json";

  /* ---------- Helpers ---------- */
  const $ = (sel, root = document) => root.querySelector(sel);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  function formatDate(iso) {
    if (!iso) return "—";
    const d = new Date(iso + "T00:00:00");
    return isNaN(d) ? iso : d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  }

  function shade(hex, amt) {
    const n = parseInt(hex.replace("#", ""), 16);
    const r = Math.max(0, Math.min(255, (n >> 16) + amt));
    const g = Math.max(0, Math.min(255, ((n >> 8) & 255) + amt));
    const b = Math.max(0, Math.min(255, (n & 255) + amt));
    return "#" + ((r << 16) | (g << 8) | b).toString(16).padStart(6, "0");
  }

  const svgUri = (svg) => "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);

  /* Placeholder icon: gradient tile with initials */
  function placeholderIcon(app) {
    const c = app.color || "#7c5cff";
    const initials = app.name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
    return svgUri(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c}"/><stop offset="1" stop-color="${shade(c, -70)}"/></linearGradient></defs><rect width="128" height="128" rx="30" fill="url(#g)"/><text x="64" y="80" font-family="Segoe UI,Arial,sans-serif" font-size="46" font-weight="800" fill="#fff" text-anchor="middle">${esc(initials)}</text></svg>`
    );
  }

  /* Placeholder screenshot: stylised phone UI */
  function placeholderShot(app, i) {
    const c = app.color || "#7c5cff";
    const rows = [0, 1, 2, 3, 4].map((k) => `<rect x="24" y="${210 + k * 70}" width="312" height="54" rx="12" fill="#1b2032"/><rect x="38" y="${224 + k * 70}" width="26" height="26" rx="8" fill="${c}" opacity="${0.5 + k * 0.1}"/><rect x="78" y="${228 + k * 70}" width="${120 + ((k * 37 + i * 23) % 120)}" height="8" rx="4" fill="#3a4260"/><rect x="78" y="${242 + k * 70}" width="${80 + ((k * 19 + i * 31) % 90)}" height="6" rx="3" fill="#2a3048"/>`).join("");
    return svgUri(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 760"><defs><linearGradient id="h" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c}"/><stop offset="1" stop-color="${shade(c, -80)}"/></linearGradient></defs><rect width="360" height="760" fill="#0f1220"/><rect width="360" height="180" fill="url(#h)"/><text x="24" y="90" font-family="Segoe UI,Arial,sans-serif" font-size="26" font-weight="800" fill="#fff">${esc(app.name)}</text><text x="24" y="122" font-family="Segoe UI,Arial,sans-serif" font-size="14" fill="#ffffffcc">Screen ${i + 1}</text>${rows}<rect x="24" y="680" width="312" height="48" rx="24" fill="${c}"/></svg>`
    );
  }

  const iconOf = (app) => app.icon || placeholderIcon(app);
  const shotsOf = (app) => (app.screenshots && app.screenshots.length ? app.screenshots : [0, 1, 2, 3].map((i) => placeholderShot(app, i)));

  function downloadButton(app, extraClass = "") {
    if (app.downloadUrl) {
      return `<a class="btn btn-primary ${extraClass}" href="${esc(app.downloadUrl)}" rel="noopener" download>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12m0 0l-5-5m5 5l5-5M5 21h14"/></svg>
        Download APK</a>`;
    }
    return `<span class="btn btn-primary ${extraClass}" aria-disabled="true" title="APK not published yet">Coming soon</span>`;
  }

  async function loadApps() {
    const res = await fetch(DATA_URL, { cache: "no-cache" });
    if (!res.ok) throw new Error("Could not load " + DATA_URL);
    const json = await res.json();
    return json.apps || [];
  }

  /* ---------- Mobile nav ---------- */
  function initNav() {
    const btn = $(".menu-btn");
    const links = $(".nav-links");
    if (btn && links) {
      btn.addEventListener("click", () => {
        const open = links.classList.toggle("open");
        btn.setAttribute("aria-expanded", open);
      });
      links.addEventListener("click", (e) => { if (e.target.tagName === "A") links.classList.remove("open"); });
    }
    const y = $("#year");
    if (y) y.textContent = new Date().getFullYear();
  }

  /* ---------- Home page ---------- */
  function initHome(apps) {
    const grid = $("#app-grid");
    const search = $("#search");
    const chipsWrap = $("#chips");
    let activeCat = "All";

    const cats = ["All", ...Array.from(new Set(apps.map((a) => a.category))).sort()];
    chipsWrap.innerHTML = cats.map((c) => `<button class="chip${c === "All" ? " active" : ""}" data-cat="${esc(c)}">${esc(c)}</button>`).join("");

    $("#stat-apps").textContent = apps.length;
    $("#stat-cats").textContent = cats.length - 1;

    function render() {
      const q = search.value.trim().toLowerCase();
      const list = apps.filter((a) => {
        const inCat = activeCat === "All" || a.category === activeCat;
        const hay = [a.name, a.tagline, a.description, a.category].join(" ").toLowerCase();
        return inCat && (!q || hay.includes(q));
      });
      if (!list.length) {
        grid.innerHTML = `<div class="empty">No apps match your search.</div>`;
        return;
      }
      grid.innerHTML = list.map((a, i) => `
        <article class="card" style="animation-delay:${Math.min(i * 50, 500)}ms">
          <a class="card-top" href="app.html?id=${encodeURIComponent(a.id)}">
            <img class="app-icon" src="${iconOf(a)}" alt="${esc(a.name)} icon" loading="lazy" width="64" height="64">
            <div><h3>${esc(a.name)}</h3><div class="cat">${esc(a.category)}</div></div>
          </a>
          <p>${esc(a.tagline)}</p>
          <div class="meta"><span>v${esc(a.version)}</span><span>${esc(a.size)}</span><span>Updated ${formatDate(a.updated)}</span></div>
          <div class="card-actions">
            <a class="btn btn-ghost" href="app.html?id=${encodeURIComponent(a.id)}">Details</a>
            ${downloadButton(a)}
          </div>
        </article>`).join("");
    }

    chipsWrap.addEventListener("click", (e) => {
      const chip = e.target.closest(".chip");
      if (!chip) return;
      activeCat = chip.dataset.cat;
      chipsWrap.querySelectorAll(".chip").forEach((c) => c.classList.toggle("active", c === chip));
      render();
    });
    search.addEventListener("input", render);
    render();
  }

  /* ---------- Detail page ---------- */
  function initDetail(apps) {
    const id = new URLSearchParams(location.search).get("id");
    const app = apps.find((a) => a.id === id);
    const root = $("#app-detail");
    if (!app) {
      root.innerHTML = `<div class="empty"><h2>App not found</h2><p style="margin:12px 0 24px">The app you’re looking for doesn’t exist.</p><a class="btn btn-primary" href="index.html#apps">Browse apps</a></div>`;
      return;
    }
    document.title = `${app.name} — Download APK | Arkan Apps`;
    const md = document.querySelector('meta[name="description"]');
    if (md) md.setAttribute("content", `${app.name}: ${app.tagline}. Download the latest APK (v${app.version}).`);

    root.innerHTML = `
      <div class="detail-head">
        <img class="app-icon" src="${iconOf(app)}" alt="${esc(app.name)} icon" width="120" height="120">
        <div>
          <div class="cat">${esc(app.category)}</div>
          <h1>${esc(app.name)}</h1>
          <div class="tagline">${esc(app.tagline)}</div>
          <div class="hero-actions" style="justify-content:flex-start">
            ${downloadButton(app)}
            <a class="btn btn-ghost" href="index.html#apps">All apps</a>
          </div>
        </div>
      </div>
      <div class="info-grid">
        <div class="info"><small>Version</small><strong>${esc(app.version)}</strong></div>
        <div class="info"><small>Size</small><strong>${esc(app.size)}</strong></div>
        <div class="info"><small>Released</small><strong>${formatDate(app.releaseDate)}</strong></div>
        <div class="info"><small>Updated</small><strong>${formatDate(app.updated)}</strong></div>
        <div class="info"><small>Requires</small><strong>Android ${esc(app.minAndroid)}+</strong></div>
      </div>
      <h2 style="margin-bottom:16px">Screenshots</h2>
      <div class="shots">${shotsOf(app).map((s, i) => `<div class="shot"><img src="${esc(s)}" alt="${esc(app.name)} screenshot ${i + 1}" loading="lazy"></div>`).join("")}</div>
      <div class="two-col">
        <div class="panel">
          <h2>About this app</h2>
          <p>${esc(app.description)}</p>
          <h2 style="margin-top:22px">Features</h2>
          <ul>${(app.features || []).map((f) => `<li>${esc(f)}</li>`).join("")}</ul>
        </div>
        <div class="panel">
          <h2>What’s new</h2>
          <p><strong style="color:var(--text)">v${esc(app.version)}</strong> · ${formatDate(app.updated)}</p>
          <p style="margin-top:8px">${esc(app.changelog)}</p>
          <p class="notice">To install, allow “Install unknown apps” for your browser in Android settings, then open the downloaded APK.</p>
        </div>
      </div>`;

    const lb = $("#lightbox");
    const lbImg = $("#lightbox img");
    root.querySelectorAll(".shot img").forEach((img) =>
      img.addEventListener("click", () => { lbImg.src = img.src; lbImg.alt = img.alt; lb.classList.add("open"); })
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
      if (target) target.innerHTML = `<div class="empty">Couldn’t load the app catalogue. If you opened this file directly, run it through a local web server (see README).</div>`;
    }
  });
})();
