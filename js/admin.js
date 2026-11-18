/* Arkoid — Admin panel
 * Everything runs in the browser and talks to the GitHub API with your token.
 *  - App details + icon + screenshots are committed to the repo (main branch).
 *  - The APK is pushed in chunks to a temporary "apk-upload/..." branch; the
 *    GitHub Action in .github/workflows/publish-apk.yml joins the chunks and
 *    publishes it as a GitHub Release asset, then deletes the branch.
 */
(function () {
  "use strict";

  const OWNER = "Arkan17";
  const REPO = "arkan17.github.io";
  const BRANCH = "main";
  const API = "https://api.github.com";
  const STORE_KEY = "arkanAdmin.v1";
  const CHUNK = 20 * 1024 * 1024; // 20 MB per APK chunk
  const REPO_PATH = `/repos/${OWNER}/${REPO}`;

  let TOKEN = null;
  let catalogue = { apps: [] };
  let editing = null;          // app object being edited, or null for new
  let iconItem = null;         // { file } | { path }
  let shots = [];              // [{ file } | { path }]
  let apkFile = null;
  let busy = false;

  /* ---------- DOM helpers ---------- */
  const $ = (s, r = document) => r.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const views = ["setup", "login", "dash", "form"];
  function show(view) {
    views.forEach((v) => ($("#view-" + v).hidden = v !== view));
    $("#top-actions").hidden = !(view === "dash" || view === "form");
    window.scrollTo(0, 0);
  }
  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => t.classList.remove("show"), 2600);
  }
  const fmtMB = (bytes) => (bytes / 1048576 >= 10 ? Math.round(bytes / 1048576) : (bytes / 1048576).toFixed(1)) + " MB";
  const today = () => new Date().toISOString().slice(0, 10);
  const slugify = (s) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 50);

  /* ---------- Storage (guarded) ---------- */
  const store = {
    get() { try { return JSON.parse(localStorage.getItem(STORE_KEY) || "null"); } catch (e) { return null; } },
    set(v) { try { localStorage.setItem(STORE_KEY, JSON.stringify(v)); return true; } catch (e) { return false; } },
    clear() { try { localStorage.removeItem(STORE_KEY); } catch (e) { /* ignore */ } },
  };

  /* ---------- Base64 / encoding ---------- */
  function bytesToB64(bytes) {
    let bin = "";
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  }
  const b64ToBytes = (b64) => Uint8Array.from(atob(b64.replace(/\s/g, "")), (c) => c.charCodeAt(0));
  const utf8ToB64 = (str) => bytesToB64(new TextEncoder().encode(str));
  const b64ToUtf8 = (b64) => new TextDecoder().decode(b64ToBytes(b64));
  function blobToB64(blob) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result).split(",")[1] || "");
      r.onerror = () => reject(r.error);
      r.readAsDataURL(blob);
    });
  }

  /* ---------- Token encryption (PBKDF2 + AES-GCM) ---------- */
  async function deriveKey(password, salt) {
    const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveKey"]);
    return crypto.subtle.deriveKey({ name: "PBKDF2", salt, iterations: 250000, hash: "SHA-256" }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  }
  async function encryptToken(token, password) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await deriveKey(password, salt);
    const data = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(token)));
    return { salt: bytesToB64(salt), iv: bytesToB64(iv), data: bytesToB64(data) };
  }
  async function decryptToken(saved, password) {
    const key = await deriveKey(password, b64ToBytes(saved.salt));
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: b64ToBytes(saved.iv) }, key, b64ToBytes(saved.data));
    return new TextDecoder().decode(plain);
  }

  /* ---------- GitHub API ---------- */
  async function gh(path, { method = "GET", body, allow404 = false, token = TOKEN } = {}) {
    const res = await fetch(API + path, {
      method,
      cache: "no-store",
      headers: {
        Authorization: "Bearer " + token,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (allow404 && res.status === 404) return null;
    if (res.status === 204) return null;
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = json.message || res.statusText;
      if (res.status === 401) throw new Error("GitHub rejected the token (expired or wrong). Logout and set up again.");
      if (res.status === 403 || res.status === 404) throw new Error(`GitHub says: ${msg}. Check the token has “Contents: Read and write” on ${REPO}.`);
      throw new Error(`GitHub error ${res.status}: ${msg}`);
    }
    return json;
  }

  async function loadCatalogue() {
    const file = await gh(`${REPO_PATH}/contents/data/apps.json?ref=${BRANCH}`);
    catalogue = JSON.parse(b64ToUtf8(file.content));
    if (!Array.isArray(catalogue.apps)) catalogue.apps = [];
    return catalogue;
  }

  async function listDir(path) {
    const res = await gh(`${REPO_PATH}/contents/${path}?ref=${BRANCH}`, { allow404: true });
    return Array.isArray(res) ? res.filter((f) => f.type === "file").map((f) => f.path) : [];
  }

  /* Commit several file changes to main in one commit.
     changes: [{ path, b64 } | { path, delete: true }] */
  async function commitToMain(message, changes) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const ref = await gh(`${REPO_PATH}/git/ref/heads/${BRANCH}`);
      const head = await gh(`${REPO_PATH}/git/commits/${ref.object.sha}`);
      const tree = [];
      for (const c of changes) {
        if (c.delete) tree.push({ path: c.path, mode: "100644", type: "blob", sha: null });
        else {
          const blob = c.sha ? { sha: c.sha } : await gh(`${REPO_PATH}/git/blobs`, { method: "POST", body: { content: c.b64, encoding: "base64" } });
          c.sha = blob.sha; // reuse on retry
          tree.push({ path: c.path, mode: "100644", type: "blob", sha: blob.sha });
        }
      }
      const newTree = await gh(`${REPO_PATH}/git/trees`, { method: "POST", body: { base_tree: head.tree.sha, tree } });
      const commit = await gh(`${REPO_PATH}/git/commits`, { method: "POST", body: { message, tree: newTree.sha, parents: [ref.object.sha] } });
      try {
        await gh(`${REPO_PATH}/git/refs/heads/${BRANCH}`, { method: "PATCH", body: { sha: commit.sha } });
        return commit.sha;
      } catch (e) {
        if (attempt === 1) throw e; // someone else pushed meanwhile — retry once on fresh head
      }
    }
  }

  /* Upload APK in chunks to a temporary branch; the GitHub Action publishes it. */
  async function uploadApk(app, file, onProgress, log) {
    const safeName = app.name.replace(/[^A-Za-z0-9]+/g, "") || app.id;
    const safeVer = app.version.replace(/[^0-9A-Za-z._]+/g, "");
    const tag = `${app.id}-v${safeVer}`;
    const fileName = `${safeName}-${safeVer}.apk`;

    log("Checking APK…");
    const sha256 = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", await file.arrayBuffer())))
      .map((b) => b.toString(16).padStart(2, "0")).join("");

    const url = `https://github.com/${OWNER}/${REPO}/releases/download/${tag}/${fileName}`;
    const rel = await gh(`${REPO_PATH}/releases/tags/${encodeURIComponent(tag)}`, { allow404: true }).catch(() => null);
    const same = rel && rel.assets.find((a) => a.name === fileName && a.state === "uploaded" && a.size === file.size && (!a.digest || a.digest === "sha256:" + sha256));
    if (same) {
      onProgress(1);
      log("This exact APK is already published, skipping upload ✓");
      return { tag, fileName, url, alreadyLive: true };
    }

    const parts = Math.max(1, Math.ceil(file.size / CHUNK));
    const tree = [];
    for (let i = 0; i < parts; i++) {
      const b64 = await blobToB64(file.slice(i * CHUNK, (i + 1) * CHUNK));
      const blob = await gh(`${REPO_PATH}/git/blobs`, { method: "POST", body: { content: b64, encoding: "base64" } });
      tree.push({ path: `_apk_upload/part-${String(i).padStart(3, "0")}`, mode: "100644", type: "blob", sha: blob.sha });
      onProgress((i + 1) / parts);
      log(`Uploaded APK part ${i + 1} of ${parts}`);
    }
    const manifest = { appId: app.id, tag, fileName, title: `${app.name} v${app.version}`, notes: app.changelog || `${app.name} v${app.version}`, size: file.size, sha256 };
    const mBlob = await gh(`${REPO_PATH}/git/blobs`, { method: "POST", body: { content: utf8ToB64(JSON.stringify(manifest, null, 2)), encoding: "base64" } });
    tree.push({ path: "_apk_upload/manifest.json", mode: "100644", type: "blob", sha: mBlob.sha });

    // Base the upload commit on main so the workflow file is present in it.
    const ref = await gh(`${REPO_PATH}/git/ref/heads/${BRANCH}`);
    const head = await gh(`${REPO_PATH}/git/commits/${ref.object.sha}`);
    const newTree = await gh(`${REPO_PATH}/git/trees`, { method: "POST", body: { base_tree: head.tree.sha, tree } });
    const commit = await gh(`${REPO_PATH}/git/commits`, { method: "POST", body: { message: `APK upload: ${app.name} v${app.version}`, tree: newTree.sha, parents: [ref.object.sha] } });
    await gh(`${REPO_PATH}/git/refs`, { method: "POST", body: { ref: `refs/heads/apk-upload/${app.id}-${Date.now()}`, sha: commit.sha } });

    return { tag, fileName, url };
  }

  async function waitForRelease(tag, fileName, size, since, log) {
    const deadline = Date.now() + 10 * 60 * 1000;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 10000));
      const rel = await gh(`${REPO_PATH}/releases/tags/${encodeURIComponent(tag)}`, { allow404: true }).catch(() => null);
      const asset = rel && rel.assets.find((a) => a.name === fileName && a.state === "uploaded" && a.size === size && new Date(a.updated_at).getTime() >= since - 60000);
      if (asset) return true;
    }
    log(`Still processing. Check <a href="https://github.com/${OWNER}/${REPO}/actions" target="_blank" rel="noopener">GitHub Actions</a> for status.`, "err");
    return false;
  }

  /* ---------- Image processing ---------- */
  async function decodeImage(file) {
    try {
      return await createImageBitmap(file);
    } catch (e) {
      const url = URL.createObjectURL(file);
      try {
        const img = new Image();
        img.src = url;
        await img.decode();
        if (!img.naturalWidth) { img.width = 512; img.height = 512; }
        return img;
      } catch (e2) {
        throw new Error(`Can’t read image “${file.name}”. Please use PNG, JPG or WebP (iPhone HEIC photos must be converted first).`);
      } finally {
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
    }
  }

  async function toWebp(file, maxW, maxH, quality) {
    const bmp = await decodeImage(file);
    const scale = Math.min(1, maxW / bmp.width, maxH / bmp.height);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext("2d").drawImage(bmp, 0, 0, canvas.width, canvas.height);
    let blob = await new Promise((r) => canvas.toBlob(r, "image/webp", quality));
    if (!blob || blob.type !== "image/webp") blob = await new Promise((r) => canvas.toBlob(r, "image/png"));
    return { blob, ext: blob.type === "image/webp" ? "webp" : "png" };
  }

  /* ---------- Auth flow ---------- */
  async function verifyToken(token) {
    const repo = await gh(REPO_PATH, { token });
    if (repo.permissions && repo.permissions.push === false) throw new Error("This token can’t write to the repository.");
    // Real write test: create a tiny unreferenced blob (harmless, changes nothing on the site)
    try {
      await gh(`${REPO_PATH}/git/blobs`, { method: "POST", token, body: { content: "arkan-admin-check", encoding: "utf-8" } });
    } catch (e) {
      throw new Error("Token works but has no write access. Edit the token on GitHub → Repository permissions → add “Contents” → set “Read and write” → Update.");
    }
    return repo;
  }

  $("#setup-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const err = $("#setup-error");
    const token = $("#setup-token").value.trim();
    const p1 = $("#setup-pass").value;
    const p2 = $("#setup-pass2").value;
    err.textContent = "";
    if (p1.length < 6) return (err.textContent = "Password must be at least 6 characters.");
    if (p1 !== p2) return (err.textContent = "Passwords don’t match.");
    const btn = e.submitter || $("#setup-form button");
    btn.disabled = true; btn.textContent = "Checking token…";
    try {
      await verifyToken(token);
      const enc = await encryptToken(token, p1);
      if (!store.set(enc)) toast("Browser storage blocked — you’ll need the token again next time.");
      TOKEN = token;
      $("#setup-form").reset();
      openDashboard();
    } catch (ex) {
      err.textContent = ex.message;
    } finally {
      btn.disabled = false; btn.textContent = "Connect & login";
    }
  });

  $("#login-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const err = $("#login-error");
    err.textContent = "";
    const saved = store.get();
    if (!saved) return show("setup");
    try {
      TOKEN = await decryptToken(saved, $("#login-pass").value);
    } catch (ex) {
      err.textContent = "Wrong password.";
      return;
    }
    $("#login-pass").value = "";
    try {
      await verifyToken(TOKEN);
    } catch (ex) {
      TOKEN = null;
      err.textContent = ex.message;
      return;
    }
    openDashboard();
  });

  $("#reset-btn").addEventListener("click", () => {
    if ($("#reset-btn").dataset.armed) {
      store.clear(); TOKEN = null; delete $("#reset-btn").dataset.armed; show("setup");
    } else {
      $("#reset-btn").dataset.armed = "1";
      $("#reset-btn").textContent = "Click again to remove the saved token from this browser";
    }
  });

  $("#logout-btn").addEventListener("click", () => {
    if (busy) return toast("Wait for publishing to finish.");
    TOKEN = null; show("login");
  });

  /* ---------- Dashboard ---------- */
  async function openDashboard() {
    show("dash");
    $("#dash-sub").textContent = "Loading…";
    $("#admin-list").innerHTML = "";
    try {
      await loadCatalogue();
      renderDashboard();
    } catch (ex) {
      $("#dash-sub").textContent = ex.message;
    }
  }

  function iconSrc(a) {
    return a.icon || `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="${a.color || "#4d7cff"}"/><text x="32" y="41" font-family="Arial" font-size="24" font-weight="700" fill="#fff" text-anchor="middle">${esc((a.name || "?")[0])}</text></svg>`)}`;
  }

  function renderDashboard() {
    const apps = catalogue.apps;
    $("#dash-sub").textContent = `${apps.length} app${apps.length === 1 ? "" : "s"} on the website`;
    $("#cat-list").innerHTML = Array.from(new Set(apps.map((a) => a.category))).map((c) => `<option value="${esc(c)}">`).join("");
    if (!apps.length) {
      $("#admin-list").innerHTML = `<div class="empty box">No apps yet. Click “Add new app”.</div>`;
      return;
    }
    $("#admin-list").innerHTML = apps.map((a, i) => `
      <div class="a-row box">
        <img class="app-icon" src="${esc(iconSrc(a))}" alt="" width="64" height="64">
        <div class="info">
          <h3>${esc(a.name)}</h3>
          <div class="sub">${esc(a.category)} · v${esc(a.version)} · ${esc(a.size || "—")}</div>
          <span class="status ${a.downloadUrl ? "ok" : "no"}">${a.downloadUrl ? "APK live" : "No APK"}</span>${a.featured ? `<span class="status ok" style="background:var(--yellow);color:#111">Featured</span>` : ""}
        </div>
        <div class="btns">
          <a class="btn" href="app.html?id=${encodeURIComponent(a.id)}" target="_blank" rel="noopener">View</a>
          <button class="btn btn-yellow" data-edit="${i}" type="button">Edit</button>
          <button class="btn btn-danger" data-del="${i}" type="button">Delete</button>
        </div>
      </div>`).join("");
  }

  $("#admin-list").addEventListener("click", async (e) => {
    const ed = e.target.closest("[data-edit]");
    const del = e.target.closest("[data-del]");
    if (ed) openForm(catalogue.apps[+ed.dataset.edit]);
    if (del) {
      if (busy) return;
      const app = catalogue.apps[+del.dataset.del];
      if (!del.dataset.armed) {
        del.dataset.armed = "1"; del.textContent = "Confirm delete?";
        setTimeout(() => { if (del.isConnected) { delete del.dataset.armed; del.textContent = "Delete"; } }, 4000);
        return;
      }
      del.disabled = true; del.textContent = "Deleting…"; busy = true;
      try {
        await deleteApp(app);
        toast(`${app.name} deleted. Site updates in ~1 minute.`);
        await openDashboard();
      } catch (ex) {
        toast(ex.message);
        del.disabled = false; del.textContent = "Delete";
      } finally { busy = false; }
    }
  });

  async function deleteApp(app) {
    await loadCatalogue();
    catalogue.apps = catalogue.apps.filter((a) => a.id !== app.id);
    const files = await listDir(`assets/apps/${app.id}`);
    await commitToMain(`Admin: delete ${app.name}`, [
      { path: "data/apps.json", b64: utf8ToB64(JSON.stringify(catalogue, null, 2) + "\n") },
      ...files.map((p) => ({ path: p, delete: true })),
    ]);
    // Remove this app's releases (APK files)
    const releases = await gh(`${REPO_PATH}/releases?per_page=100`).catch(() => []);
    const tagRe = new RegExp("^" + app.id + "-v[0-9A-Za-z._]+$");
    for (const r of releases.filter((r) => tagRe.test(r.tag_name))) {
      await gh(`${REPO_PATH}/releases/${r.id}`, { method: "DELETE" }).catch(() => {});
      await gh(`${REPO_PATH}/git/refs/tags/${encodeURIComponent(r.tag_name)}`, { method: "DELETE" }).catch(() => {});
    }
  }

  $("#add-btn").addEventListener("click", () => openForm(null));
  $("#back-btn").addEventListener("click", () => { if (!busy) openDashboard(); });

  /* ---------- Add / edit form ---------- */
  const F = (id) => $("#f-" + id);
  function openForm(app) {
    editing = app;
    apkFile = null;
    iconItem = app && app.icon ? { path: app.icon } : null;
    shots = app && app.screenshots ? app.screenshots.map((p) => ({ path: p })) : [];
    $("#form-title").textContent = app ? `Edit ${app.name}` : "Add new app";
    $("#form-error").textContent = "";
    $("#progress").hidden = true;
    $("#app-form").hidden = false;
    const v = app || {};
    F("name").value = v.name || "";
    F("id").value = v.id || "";
    F("id").readOnly = !!app;
    F("tagline").value = v.tagline || "";
    F("category").value = v.category || "";
    F("version").value = v.version || "";
    F("size").value = v.size || "";
    F("minAndroid").value = v.minAndroid || "8.0";
    F("releaseDate").value = v.releaseDate || today();
    F("color").value = /^#[0-9a-f]{6}$/i.test(v.color || "") ? v.color : "#4d7cff";
    F("description").value = v.description || "";
    F("features").value = (v.features || []).join("\n");
    F("changelog").value = v.changelog || "";
    F("featured").checked = !!v.featured;
    renderApk(); renderIcon(); renderShots();
    show("form");
  }

  F("name").addEventListener("input", () => {
    if (!editing && !F("id").dataset.touched) F("id").value = slugify(F("name").value);
  });
  F("id").addEventListener("input", () => { F("id").dataset.touched = "1"; });

  const previewUrl = (item) => (item.file ? (item.url ||= URL.createObjectURL(item.file)) : item.path);

  function renderApk() {
    const box = $("#apk-info");
    if (apkFile) {
      box.innerHTML = `📦 ${esc(apkFile.name)} · ${fmtMB(apkFile.size)} <button type="button" class="mini-btn del x" id="apk-x" aria-label="Remove APK">✕</button>`;
      $("#apk-x").onclick = () => { apkFile = null; renderApk(); };
    } else if (editing && editing.downloadUrl) {
      box.innerHTML = `Current APK is live. Drop a new APK only if you want to replace it.`;
    } else {
      box.textContent = "";
    }
  }
  function renderIcon() {
    const img = $("#icon-preview");
    img.hidden = !iconItem;
    if (iconItem) img.src = previewUrl(iconItem);
  }
  function renderShots() {
    $("#shot-list").innerHTML = shots.map((s, i) => `
      <div class="shot-item">
        <img src="${esc(previewUrl(s))}" alt="Screenshot ${i + 1}">
        <div class="tools">
          ${i > 0 ? `<button type="button" class="mini-btn" data-left="${i}" aria-label="Move left">←</button>` : ""}
          <button type="button" class="mini-btn del" data-rm="${i}" aria-label="Remove">✕</button>
          ${i < shots.length - 1 ? `<button type="button" class="mini-btn" data-right="${i}" aria-label="Move right">→</button>` : ""}
        </div>
      </div>`).join("");
  }
  $("#shot-list").addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    const i = +(b.dataset.rm ?? b.dataset.left ?? b.dataset.right);
    if (b.dataset.rm !== undefined) shots.splice(i, 1);
    else if (b.dataset.left !== undefined) [shots[i - 1], shots[i]] = [shots[i], shots[i - 1]];
    else if (b.dataset.right !== undefined) [shots[i + 1], shots[i]] = [shots[i], shots[i + 1]];
    renderShots();
  });

  function setupDrop(zoneId, inputId, onFiles) {
    const zone = $("#" + zoneId);
    const input = $("#" + inputId);
    zone.addEventListener("click", () => input.click());
    zone.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); input.click(); } });
    input.addEventListener("change", () => { if (input.files.length) onFiles(Array.from(input.files)); input.value = ""; });
    ["dragenter", "dragover"].forEach((t) => zone.addEventListener(t, (e) => { e.preventDefault(); zone.classList.add("over"); }));
    ["dragleave", "drop"].forEach((t) => zone.addEventListener(t, (e) => { e.preventDefault(); zone.classList.remove("over"); }));
    zone.addEventListener("drop", (e) => { const files = Array.from(e.dataTransfer.files || []); if (files.length) onFiles(files); });
  }
  // Stop the browser from opening files dropped outside the zones
  ["dragover", "drop"].forEach((t) => window.addEventListener(t, (e) => e.preventDefault()));

  setupDrop("drop-apk", "in-apk", (files) => {
    const f = files.find((x) => /\.apk$/i.test(x.name));
    if (!f) return toast("Please choose an .apk file");
    apkFile = f;
    F("size").value = fmtMB(f.size);
    renderApk();
  });
  // Keep only images the browser can actually decode; report the rest by name.
  async function readableImages(files) {
    const ok = [], bad = [];
    for (const f of files) {
      try { await decodeImage(f); ok.push(f); } catch (e) { bad.push(f.name); }
    }
    if (bad.length) {
      $("#form-error").textContent = `Can’t read: ${bad.join(", ")}. Use PNG, JPG or WebP (convert HEIC/iPhone photos first).`;
    } else {
      $("#form-error").textContent = "";
    }
    return ok;
  }
  setupDrop("drop-icon", "in-icon", async (files) => {
    const [f] = await readableImages(files.slice(0, 1));
    if (f) { iconItem = { file: f }; renderIcon(); }
  });
  setupDrop("drop-shots", "in-shots", async (files) => {
    const imgs = await readableImages(files);
    if (!imgs.length) return;
    shots.push(...imgs.map((file) => ({ file })));
    renderShots();
  });

  /* ---------- Publish ---------- */
  const logEl = $("#log");
  function log(html, cls = "") {
    const prev = logEl.lastElementChild;
    if (prev && !prev.classList.contains("err")) prev.classList.add("done");
    const li = document.createElement("li");
    li.innerHTML = html;
    if (cls) li.className = cls;
    logEl.appendChild(li);
  }
  const setBar = (frac) => ($("#bar-fill").style.width = Math.round(frac * 100) + "%");

  window.addEventListener("beforeunload", (e) => { if (busy) { e.preventDefault(); e.returnValue = ""; } });

  $("#app-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (busy) return;
    const err = $("#form-error");
    err.textContent = "";

    const app = {
      id: F("id").value.trim(),
      name: F("name").value.trim(),
      tagline: F("tagline").value.trim(),
      category: F("category").value.trim(),
      description: F("description").value.trim(),
      features: F("features").value.split("\n").map((s) => s.trim()).filter(Boolean),
      version: F("version").value.trim().replace(/^v/i, ""),
      size: F("size").value.trim(),
      releaseDate: F("releaseDate").value || today(),
      updated: today(),
      minAndroid: F("minAndroid").value.trim() || "8.0",
      changelog: F("changelog").value.trim(),
      color: F("color").value,
      icon: "",
      screenshots: [],
      downloadUrl: editing ? editing.downloadUrl || "" : "",
      featured: F("featured").checked,
    };

    const missing = ["name", "id", "tagline", "category", "version", "description"].filter((k) => !app[k]);
    if (missing.length) return (err.textContent = "Please fill: " + missing.join(", "));
    if (!/^[a-z0-9-]+$/.test(app.id)) return (err.textContent = "App ID can only have small letters, numbers and dashes.");
    if (!/^[0-9A-Za-z._]+$/.test(app.version)) return (err.textContent = "Version can only have numbers, letters and dots (e.g. 1.0.0).");
    if (!editing && catalogue.apps.some((a) => a.id === app.id)) return (err.textContent = "An app with this ID already exists.");
    if (editing && apkFile && editing.version === app.version) {
      // Same version re-upload is allowed (it replaces the file), just inform.
      toast("Replacing the APK for the same version");
    }

    busy = true;
    $("#app-form").hidden = true;
    $("#progress").hidden = false;
    logEl.innerHTML = "";
    setBar(0);
    $("#progress h2").textContent = "Publishing…";

    try {
      const started = Date.now();
      log("Processing images…");
      const dir = `assets/apps/${app.id}`;
      const stamp = Date.now().toString(36);
      const changes = [];
      if (iconItem) {
        if (iconItem.file) {
          const { blob, ext } = await toWebp(iconItem.file, 512, 512, 0.9);
          app.icon = `${dir}/icon-${stamp}.${ext}`;
          changes.push({ path: app.icon, b64: await blobToB64(blob) });
        } else app.icon = iconItem.path;
      }
      for (let i = 0; i < shots.length; i++) {
        const s = shots[i];
        if (s.file) {
          const { blob, ext } = await toWebp(s.file, 1080, 2400, 0.82);
          const p = `${dir}/shot-${stamp}-${i + 1}.${ext}`;
          changes.push({ path: p, b64: await blobToB64(blob) });
          app.screenshots.push(p);
        } else app.screenshots.push(s.path);
      }
      setBar(0.1);

      let apk = null;
      if (apkFile) {
        log("Uploading APK to GitHub…");
        apk = await uploadApk(app, apkFile, (f) => setBar(0.1 + f * 0.75), log);
        app.downloadUrl = apk.url;
      }

      setBar(apk ? 0.85 : 0.4);

      log("Saving app details…");
      await loadCatalogue(); // fresh copy
      const idx = catalogue.apps.findIndex((a) => a.id === app.id);
      if (idx >= 0) catalogue.apps[idx] = app; else catalogue.apps.unshift(app);
      changes.push({ path: "data/apps.json", b64: utf8ToB64(JSON.stringify(catalogue, null, 2) + "\n") });

      // Remove old images of this app that are no longer used
      const keep = new Set([app.icon, ...app.screenshots, ...changes.map((c) => c.path)]);
      (await listDir(dir)).filter((p) => !keep.has(p)).forEach((p) => changes.push({ path: p, delete: true }));

      await commitToMain(`Admin: ${editing ? "update" : "add"} ${app.name} v${app.version}`, changes);
      setBar(apk ? 0.9 : 1);
      log(`Website updated ✓ (live in about a minute)`);

      if (apk && !apk.alreadyLive) {
        log("Publishing APK to GitHub Releases (about 1 minute)…");
        const ok = await waitForRelease(apk.tag, apk.fileName, apkFile.size, started, log);
        if (ok) log(`APK is live ✓ <a href="${esc(apk.url)}" target="_blank" rel="noopener">${esc(apk.fileName)}</a>`);
      }
      setBar(1);
      log(`<a href="app.html?id=${encodeURIComponent(app.id)}" target="_blank" rel="noopener">Open app page</a> · <a href="#" id="back-dash">Back to apps</a>`);
      $("#progress h2").textContent = "Done 🎉";
      $("#back-dash").addEventListener("click", (ev) => { ev.preventDefault(); openDashboard(); });
    } catch (ex) {
      console.error(ex);
      log(esc(ex.message), "err");
      $("#progress h2").textContent = "Something went wrong";
      $("#app-form").hidden = false;
    } finally {
      busy = false;
    }
  });

  /* ---------- Boot ---------- */
  if (!window.crypto || !crypto.subtle) {
    document.querySelector("main").innerHTML = `<div class="box auth"><h1>Unsupported browser</h1><p>Please open the admin panel over https in a modern browser.</p></div>`;
    return;
  }
  show(store.get() ? "login" : "setup");
})();
