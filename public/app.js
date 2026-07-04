/* Spider League front office */

const $ = (id) => document.getElementById(id);

const state = {
  imageDataUrl: null, // downscaled JPEG sent to the evaluation desk
  result: null,       // { token, imageId, analysis }
  saved: false,
};

/* A verdict is "extra scary" when the desk flags real danger or top-bracket power.
   If public/img/scared.jpg exists, it appears as the correspondent's live reaction. */
const SCARY_POWER = 80;
function isExtraScary(a) {
  return a.is_spider && (a.power >= SCARY_POWER || a.danger_to_humans === "medically significant");
}

/* ---------- tabs ---------- */
document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t === tab));
    ["league", "teams", "merch"].forEach((name) =>
      $("tab-" + name).classList.toggle("hidden", tab.dataset.tab !== name)
    );
    if (tab.dataset.tab === "league") loadLeague();
    if (tab.dataset.tab === "teams") loadTeams();
    if (tab.dataset.tab === "merch") loadMerch();
  });
});

/* ---------- modal ---------- */
const modal = $("modal");

$("btn-add").addEventListener("click", () => {
  resetSubmitFlow();
  modal.classList.remove("hidden");
  document.body.style.overflow = "hidden";
});

modal.addEventListener("click", (e) => {
  if (e.target.closest("[data-close]")) closeModal();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !modal.classList.contains("hidden")) closeModal();
});

function closeModal() {
  modal.classList.add("hidden");
  document.body.style.overflow = "";
  if (state.saved) loadLeague();
}

function resetSubmitFlow() {
  state.imageDataUrl = null;
  state.result = null;
  state.saved = false;
  fileInput.value = "";
  $("preview").classList.add("hidden");
  dropzone.querySelector(".dropzone-idle").classList.remove("hidden");
  $("btn-analyze").disabled = true;
  show("step-upload", true);
  show("step-judging", false);
  show("step-result", false);
  hideError();
}

/* ---------- config + hero ---------- */
async function loadConfig() {
  try {
    const res = await fetch("/api/config", { cache: "no-store" });
    if (!res.ok) throw new Error();
    const cfg = await res.json();
    const notes = [];
    if (cfg.demoMode) notes.push("DEMO MODE — the evaluation desk is improvising. Set the ANTHROPIC_API_KEY environment variable for real spider identification.");
    if (cfg.storageReady === false) notes.push("⚠️ " + (cfg.storageHint || "Storage isn't connected, so spiders can't be saved."));
    if (notes.length) {
      $("demo-banner").textContent = notes.join(" ");
      $("demo-banner").classList.remove("hidden");
    }
    fillTeamList(cfg.teams);
  } catch {
    // Backend unreachable — say so plainly instead of failing cryptically later.
    fillTeamList([]);
    const banner = $("demo-banner");
    banner.textContent =
      "⚠️ Can't reach the league office (the site's server isn't answering). If this is a hosted deployment, check the latest deploy finished cleanly; running locally, start it with `npm start`.";
    banner.classList.remove("hidden");
  }
}
loadConfig();

/* Translate raw browser/network failures into something actionable. */
function friendlyError(err) {
  const msg = err?.message || String(err);
  if (
    err instanceof TypeError ||
    /did not match the (expected )?pattern|failed to fetch|load failed|networkerror|unexpected token|json parse/i.test(msg)
  ) {
    return "Couldn't reach the league office. Make sure the server is running (npm start) and reload the page.";
  }
  return msg;
}

function fillTeamList(teams) {
  const select = $("team-select");
  const current = select.value;
  select.innerHTML =
    (teams || []).map((t) => `<option value="${esc(t)}">${esc(t)}</option>`).join("") +
    `<option value="__new__">＋ New name…</option>`;
  if ([...select.options].some((o) => o.value === current)) select.value = current;
  toggleNewTeamField();
}

function toggleNewTeamField() {
  show("new-team-field", $("team-select").value === "__new__");
}
$("team-select").addEventListener("change", toggleNewTeamField);

/* ---------- state picker ---------- */
const US_STATES = [
  "Illinois", "Ohio", "Indiana", "Michigan", "Wisconsin", "Iowa", "Missouri",
  "Minnesota", "Kentucky", "Alabama", "Alaska", "Arizona", "Arkansas",
  "California", "Colorado", "Connecticut", "Delaware", "Florida", "Georgia",
  "Hawaii", "Idaho", "Kansas", "Louisiana", "Maine", "Maryland",
  "Massachusetts", "Mississippi", "Montana", "Nebraska", "Nevada",
  "New Hampshire", "New Jersey", "New Mexico", "New York", "North Carolina",
  "North Dakota", "Oklahoma", "Oregon", "Pennsylvania", "Rhode Island",
  "South Carolina", "South Dakota", "Tennessee", "Texas", "Utah", "Vermont",
  "Virginia", "Washington", "West Virginia", "Wyoming", "Outside the US",
];
const DEFAULT_STATE = "Illinois"; // most submissions are Midwest
(function fillStates() {
  const sel = $("state-select");
  sel.innerHTML =
    `<option value="">Not sure / skip</option>` +
    US_STATES.map((s) => `<option value="${esc(s)}"${s === DEFAULT_STATE ? " selected" : ""}>${esc(s)}</option>`).join("");
})();

function updateHero(count, awards) {
  $("stat-spiders").textContent = count;
  const p = awards.power, b = awards.beauty;
  $("stat-power").textContent = p ? p.power : "—";
  $("stat-power-name").textContent = p ? p.commonName : "";
  $("stat-beauty").textContent = b ? b.beauty : "—";
  $("stat-beauty-name").textContent = b ? b.commonName : "";
}

/* ---------- image pick + downscale ---------- */
const fileInput = $("file-input");
const dropzone = $("dropzone");

fileInput.addEventListener("change", () => handleFile(fileInput.files[0]));

["dragover", "dragleave", "drop"].forEach((evt) =>
  dropzone.addEventListener(evt, (e) => {
    e.preventDefault();
    dropzone.classList.toggle("dragover", evt === "dragover");
    if (evt === "drop") handleFile(e.dataTransfer.files[0]);
  })
);

async function handleFile(file) {
  if (!file) return;
  hideError();
  try {
    const dataUrl = await downscale(file, 1568, 0.88);
    if (!dataUrl.startsWith("data:image/jpeg") || dataUrl.length < 200) {
      throw new Error("That photo couldn't be read. Try a JPEG or PNG — on iPhone, a screenshot of the photo always works.");
    }
    state.imageDataUrl = dataUrl;
    $("preview").src = state.imageDataUrl;
    $("preview").classList.remove("hidden");
    dropzone.querySelector(".dropzone-idle").classList.add("hidden");
    $("btn-analyze").disabled = false;
  } catch (err) {
    showError(err.message || "That photo couldn't be read — try another one.");
  }
}

function downscale(file, maxEdge, quality) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, maxEdge / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Could not read that image.")); };
    img.src = url;
  });
}

/* ---------- judging ---------- */
const JUDGING_LINES = [
  "Measuring leg span…",
  "Counting eyes (expecting eight)…",
  "Consulting the taxonomy archives…",
  "Reviewing web craftsmanship…",
  "Checking fang certification…",
  "Comparing against last season's roster…",
  "The correspondent is getting emotional…",
];
let judgingTimer = null;

$("btn-analyze").addEventListener("click", async () => {
  if (!state.imageDataUrl) return;
  hideError();
  show("step-judging", true);
  show("step-upload", false);
  show("step-result", false);

  let i = 0;
  $("judging-line").textContent = JUDGING_LINES[0];
  judgingTimer = setInterval(() => {
    i = (i + 1) % JUDGING_LINES.length;
    $("judging-line").textContent = JUDGING_LINES[i];
  }, 2200);

  try {
    const res = await fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        image: state.imageDataUrl,
        state: $("state-select").value,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `The evaluation desk returned an error (${res.status}).`);
    state.result = data;
    state.saved = false;
    renderResult(data);
    show("step-judging", false);
    show("step-result", true);
  } catch (err) {
    show("step-judging", false);
    show("step-upload", true);
    showError(friendlyError(err));
  } finally {
    clearInterval(judgingTimer);
  }
});

/* ---------- render verdict ---------- */
function grade(avg) {
  if (avg >= 85) return "S";
  if (avg >= 70) return "A";
  if (avg >= 55) return "B";
  if (avg >= 40) return "C";
  return "D";
}

function renderResult({ analysis: a }) {
  $("result-photo").src = state.imageDataUrl;
  $("result-nickname").textContent = a.common_name;
  $("result-quote").textContent = a.headline_quote;
  $("result-sci").textContent = a.scientific_name;
  $("result-confidence").textContent = `${a.confidence} confidence ID`;
  $("result-grade").textContent = grade((a.beauty + a.power) / 2);

  $("beauty-num").textContent = a.beauty;
  $("power-num").textContent = a.power;
  $("beauty-notes").textContent = a.beauty_notes;
  $("power-notes").textContent = a.power_notes;
  requestAnimationFrame(() => {
    $("beauty-bar").style.width = a.beauty + "%";
    $("power-bar").style.width = a.power + "%";
  });

  $("result-report").textContent = a.scouting_report;
  $("result-fact").textContent = a.fun_fact;

  const dangerEl = $("result-danger");
  dangerEl.classList.toggle("danger-hot", a.danger_to_humans === "medically significant");
  dangerEl.textContent =
    a.danger_to_humans === "medically significant"
      ? "⚠️ Medically significant venom — admire from a distance, do not handle."
      : a.danger_to_humans === "mildly venomous"
        ? "Mildly venomous — a nip you'd notice, nothing more."
        : "Harmless to humans.";

  renderScaredReaction(a);

  const isSpider = !!a.is_spider;
  show("not-spider-box", !isSpider);
  if (!isSpider) $("not-spider-text").textContent = a.verdict_if_not_spider;
  $("save-controls").style.display = isSpider ? "" : "none";
  show("save-confirm", false);

  $("btn-share").classList.toggle("hidden", !navigator.canShare);
}

/* The correspondent's reaction photo, shown only on extra-scary verdicts.
   Drop your reaction image at public/img/scared.jpg to enable it. */
function renderScaredReaction(a) {
  document.querySelector(".reaction-bubble")?.remove();
  if (!isExtraScary(a)) return;
  const img = new Image();
  img.onload = () => {
    const bubble = document.createElement("div");
    bubble.className = "reaction-bubble";
    bubble.title = "The correspondent's live reaction";
    bubble.appendChild(img);
    const label = document.createElement("span");
    label.textContent = "LIVE REACTION";
    bubble.appendChild(label);
    document.querySelector(".result-photo-wrap").appendChild(bubble);
  };
  img.src = "img/scared.jpg"; // silently absent until you add the file
}

/* ---------- save to team ---------- */
$("btn-save").addEventListener("click", async () => {
  const selected = $("team-select").value;
  const teamName = selected === "__new__" ? $("team-name").value.trim() : selected;
  if (!teamName) return showError("Give the new team a name first.");
  hideError();
  $("btn-save").disabled = true;
  try {
    const res = await fetch("/api/spiders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        image: state.imageDataUrl,
        state: $("state-select").value,
        teamName,
        analysis: state.result.analysis,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Could not save (${res.status}).`);
    state.saved = true;
    state.savedTeam = data.team.name;
    $("save-confirm").textContent = `✅ ${data.spider.commonName} signed to Team ${data.team.name}!`;
    show("save-confirm", true);
    $("save-controls").style.display = "none";
    loadConfig();
  } catch (err) {
    showError(friendlyError(err));
  } finally {
    $("btn-save").disabled = false;
  }
});

/* ---------- share card ---------- */
async function makeCardBlob() {
  const a = state.result.analysis;
  return drawShareCard($("card-canvas"), {
    photo: state.imageDataUrl,
    quote: a.headline_quote,
    commonName: a.common_name,
    scientificName: a.scientific_name,
    beauty: a.beauty,
    power: a.power,
    report: a.scouting_report,
    grade: grade((a.beauty + a.power) / 2),
    teamName: state.saved ? state.savedTeam : "",
    state: $("state-select").value,
    isSpider: !!a.is_spider,
    extraScary: isExtraScary(a),
  });
}

$("btn-card").addEventListener("click", async () => {
  const blob = await makeCardBlob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = slug(state.result.analysis.common_name) + "-spider-league.png";
  link.click();
  URL.revokeObjectURL(url);
});

$("btn-share").addEventListener("click", async () => {
  const blob = await makeCardBlob();
  const file = new File([blob], "spider-league.png", { type: "image/png" });
  const a = state.result.analysis;
  const payload = {
    files: [file],
    title: "Spider League",
    text: `${a.common_name} — Beauty ${a.beauty} / Power ${a.power}. 🕷️`,
  };
  try {
    if (navigator.canShare && navigator.canShare(payload)) await navigator.share(payload);
  } catch { /* user cancelled */ }
});

$("btn-again").addEventListener("click", resetSubmitFlow);

/* ---------- leaderboard ---------- */
let leagueCache = null;

async function loadLeague() {
  try {
    leagueCache = await fetch("/api/league", { cache: "no-store" }).then((r) => r.json());
  } catch {
    $("standings").innerHTML = `<p class="empty-state">Can't reach the league office — is the server running?</p>`;
    return;
  }
  fillTeamList(leagueCache.teams.map((t) => t.name)); // backup fill in case /api/config was missed
  buildHistoryBar(leagueCache.spiders);
  renderSnapshot(null); // "Live"
}

/* Recompute standings, awards, and recent signings as they stood at `asOf`
   (a timestamp), or right now when asOf is null. Every spider carries a
   createdAt, so past standings are reconstructed, not stored. */
function renderSnapshot(asOf) {
  if (!leagueCache) return;
  const cutoff = asOf == null ? Infinity : asOf;
  const base = leagueCache.teams.map((t) => ({ id: t.id, name: t.name, color: t.color }));
  const spiders = leagueCache.spiders
    .filter((s) => new Date(s.createdAt).getTime() <= cutoff)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  const teams = base
    .map((t) => {
      const roster = spiders
        .filter((s) => s.teamId === t.id)
        .sort((a, b) => (b.beauty + b.power) - (a.beauty + a.power));
      const beauty = roster.reduce((sum, s) => sum + s.beauty, 0);
      const power = roster.reduce((sum, s) => sum + s.power, 0);
      return { ...t, roster, totals: { beauty, power, overall: beauty + power, spiders: roster.length } };
    })
    .sort((a, b) => b.totals.overall - a.totals.overall);

  const awards = { beauty: best(spiders, "beauty"), power: best(spiders, "power") };
  updateHero(spiders.length, awards);

  const medals = ["🥇", "🥈", "🥉"];
  $("standings").innerHTML = spiders.length
    ? teams
        .map(
          (t, i) => `
        <div class="standing">
          <div class="standing-rank">${medals[i] || i + 1}</div>
          <div class="standing-team">
            <strong><span class="team-dot" style="background:${t.color}"></span>${esc(t.name)}</strong>
            <span>${t.totals.spiders} spider${t.totals.spiders === 1 ? "" : "s"} · beauty ${t.totals.beauty} · power ${t.totals.power}</span>
          </div>
          <div class="standing-score"><strong>${t.totals.overall}</strong><span>total pts</span></div>
        </div>`
        )
        .join("")
    : `<p class="empty-state">No spiders on the board at this point yet. 🕸️</p>`;

  renderAward("award-beauty", awards.beauty, "beauty");
  renderAward("award-power", awards.power, "power");

  $("recent-spiders").innerHTML = spiders.length
    ? spiders.slice(0, 12).map(spiderCard).join("")
    : `<p class="empty-state">No signings yet.</p>`;
}

/* Build the clickable "standings as of…" chips. Daily granularity for a young
   league, weekly/monthly as it grows, capped so the row stays tidy. */
function buildHistoryBar(spiders) {
  const bar = $("history-bar");
  if (!bar) return;
  const cutoffs = snapshotCutoffs(spiders);

  if (!cutoffs.length) {
    bar.innerHTML = spiders.length
      ? `<span class="history-label">Showing <b>Live</b> standings · past days will appear here as the league plays on.</span>`
      : "";
    return;
  }

  bar.innerHTML =
    `<span class="history-label">Standings:</span>` +
    `<button class="snap-chip active" data-as="">Live</button>` +
    cutoffs.map((t) => `<button class="snap-chip" data-as="${t}">${esc(fmtDay(t))}</button>`).join("");

  bar.querySelectorAll(".snap-chip").forEach((chip) =>
    chip.addEventListener("click", () => {
      bar.querySelectorAll(".snap-chip").forEach((c) => c.classList.toggle("active", c === chip));
      renderSnapshot(chip.dataset.as ? Number(chip.dataset.as) : null);
    })
  );
}

function snapshotCutoffs(spiders) {
  if (!spiders.length) return [];
  const dayMs = 86400000;
  const firstT = Math.min(...spiders.map((s) => new Date(s.createdAt).getTime()));
  const spanDays = Math.max(1, Math.ceil((Date.now() - firstT) / dayMs));
  const stepDays = spanDays <= 12 ? 1 : spanDays <= 84 ? 7 : 28;

  const points = [];
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  d.setDate(d.getDate() - 1); // start at end of yesterday
  while (points.length < 12) {
    const t = d.getTime();
    if (t < firstT) break;
    points.push(t);
    d.setDate(d.getDate() - stepDays);
  }
  return points; // newest first
}

function fmtDay(t) {
  return new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function spiderPhoto(s) {
  return s.imageUrl || "/images/" + s.imageId;
}

function spiderCard(s) {
  return `
    <div class="spider-card">
      <img src="${esc(spiderPhoto(s))}" alt="${esc(s.commonName)}" loading="lazy" />
      <div class="spider-card-body">
        <strong>${esc(s.commonName)}</strong>
        <span class="species"><i>${esc(s.scientificName)}</i></span>
        ${s.headlineQuote ? `<p class="spider-card-quote">“${esc(s.headlineQuote)}”</p>` : ""}
        <div class="spider-card-stats"><span class="b">B ${s.beauty}</span><span class="p">P ${s.power}</span></div>
        <div class="meta">Team ${esc(s.teamName)}${s.state ? ` · found in ${esc(s.state)}` : ""}</div>
      </div>
    </div>`;
}

function best(spiders, stat) {
  return spiders.reduce((top, s) => (!top || s[stat] > top[stat] ? s : top), null);
}

function renderAward(elId, spider, stat) {
  $(elId).innerHTML = spider
    ? `<img src="${esc(spiderPhoto(spider))}" alt="" />
       <div><strong>${esc(spider.commonName)}</strong><i>${esc(spider.scientificName)}</i><br>Team ${esc(spider.teamName)}</div>
       <span class="score ${stat === "beauty" ? "beauty" : "power"}">${spider[stat]}</span>`
    : `<p class="empty-state">Vacant title.</p>`;
}

/* ---------- teams tab ---------- */
async function loadTeams() {
  const { teams } = await fetch("/api/league").then((r) => r.json());
  $("teams-list").innerHTML = teams.length
    ? teams
        .map(
          (t, i) => `
        <details class="team-acc" ${i === 0 ? "open" : ""}>
          <summary>
            <span class="team-dot" style="background:${t.color}"></span>
            <span class="team-acc-name">
              <strong>${esc(t.name)}</strong>
              <span>${t.totals.spiders} spider${t.totals.spiders === 1 ? "" : "s"} on the roster</span>
            </span>
            <span class="team-acc-pts"><strong>${t.totals.overall}</strong><span>pts</span></span>
            <span class="team-acc-chev">▾</span>
          </summary>
          <div class="team-acc-roster">
            <div class="spider-grid">
              ${t.roster.length ? t.roster.map(spiderCard).join("") : `<p class="empty-state">Empty roster.</p>`}
            </div>
          </div>
        </details>`
        )
        .join("")
    : `<p class="empty-state">No teams yet — sign the first spider and found a dynasty.</p>`;
}

/* ---------- merch tab ---------- */
async function loadMerch() {
  const grid = $("merch-grid");
  grid.innerHTML = `<p class="empty-state">Opening the equipment room…</p>`;
  let data = { configured: false, products: [] };
  try {
    data = await fetch("/api/merch").then((r) => r.json());
  } catch { /* fall through to placeholders */ }

  if (data.configured && data.products.length) {
    grid.innerHTML = data.products
      .map(
        (p) => `
        <div class="merch-card">
          ${p.thumbnail ? `<img class="merch-img" src="${esc(p.thumbnail)}" alt="${esc(p.name)}" loading="lazy" />` : `<div class="merch-img-placeholder">🕷️</div>`}
          <div class="merch-card-body">
            <strong>${esc(p.name)}</strong>
            ${p.price != null ? `<span class="price">from ${formatPrice(p.price, p.currency)}</span>` : ""}
          </div>
        </div>`
      )
      .join("");
  } else {
    grid.innerHTML = `<div class="merch-soon"><div class="merch-soon-icon">🕷️</div><strong>Coming soon</strong></div>`;
  }
}

/* ---------- helpers ---------- */
function formatPrice(n, currency) {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency: currency || "USD" }).format(n);
  } catch {
    return `$${n}`;
  }
}
function show(elId, visible) {
  $(elId).classList.toggle("hidden", !visible);
}
function showError(msg) {
  $("submit-error").textContent = msg;
  show("submit-error", true);
}
function hideError() {
  show("submit-error", false);
}
function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function slug(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "spider";
}

/* ---------- boot ---------- */
loadLeague();
