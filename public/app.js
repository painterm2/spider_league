/* Spider League front office */

const $ = (id) => document.getElementById(id);

const state = {
  imageDataUrl: null, // downscaled JPEG sent to the judge
  result: null,       // { token, imageId, analysis }
  saved: false,
};

/* ---------- tabs ---------- */
document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t === tab));
    $("tab-submit").classList.toggle("hidden", tab.dataset.tab !== "submit");
    $("tab-league").classList.toggle("hidden", tab.dataset.tab !== "league");
    if (tab.dataset.tab === "league") loadLeague();
  });
});

/* ---------- config ---------- */
fetch("/api/config")
  .then((r) => r.json())
  .then((cfg) => {
    if (cfg.demoMode) $("demo-banner").classList.remove("hidden");
    fillTeamList(cfg.teams);
  })
  .catch(() => {});

function fillTeamList(teams) {
  $("team-list").innerHTML = (teams || []).map((t) => `<option value="${esc(t)}">`).join("");
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
  if (!file || !file.type.startsWith("image/")) return;
  hideError();
  state.imageDataUrl = await downscale(file, 1568, 0.88);
  $("preview").src = state.imageDataUrl;
  $("preview").classList.remove("hidden");
  dropzone.querySelector(".dropzone-idle").classList.add("hidden");
  $("btn-analyze").disabled = false;
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
  "Deliberating on stage presence…",
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
        submitter: $("submitter").value.trim(),
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "The judge is unavailable.");
    state.result = data;
    state.saved = false;
    renderResult(data);
    show("step-judging", false);
    show("step-result", true);
  } catch (err) {
    show("step-judging", false);
    show("step-upload", true);
    showError(err.message);
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
  $("result-nickname").textContent = `“${a.nickname}”`;
  $("result-common").textContent = a.common_name;
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

  const isSpider = !!a.is_spider;
  show("not-spider-box", !isSpider);
  if (!isSpider) $("not-spider-text").textContent = a.verdict_if_not_spider;
  $("save-controls").style.display = isSpider ? "" : "none";
  show("save-confirm", false);

  $("btn-share").classList.toggle("hidden", !navigator.canShare);
}

/* ---------- save to team ---------- */
$("btn-save").addEventListener("click", async () => {
  const teamName = $("team-name").value.trim();
  if (!teamName) return showError("Pick a team name first.");
  hideError();
  $("btn-save").disabled = true;
  try {
    const res = await fetch("/api/spiders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: state.result.token, teamName }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Could not save.");
    state.saved = true;
    $("save-confirm").textContent = `✅ ${data.spider.nickname} signed to ${data.team.name}!`;
    show("save-confirm", true);
    $("save-controls").style.display = "none";
    fetch("/api/config").then((r) => r.json()).then((cfg) => fillTeamList(cfg.teams)).catch(() => {});
  } catch (err) {
    showError(err.message);
  } finally {
    $("btn-save").disabled = false;
  }
});

/* ---------- share card ---------- */
async function makeCardBlob() {
  const a = state.result.analysis;
  return drawShareCard($("card-canvas"), {
    photo: state.imageDataUrl,
    nickname: a.nickname,
    commonName: a.common_name,
    scientificName: a.scientific_name,
    beauty: a.beauty,
    power: a.power,
    report: a.scouting_report,
    grade: grade((a.beauty + a.power) / 2),
    submitter: $("submitter").value.trim(),
    teamName: state.saved ? $("team-name").value.trim() : "",
    isSpider: !!a.is_spider,
  });
}

$("btn-card").addEventListener("click", async () => {
  const blob = await makeCardBlob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = slug(state.result.analysis.nickname) + "-spider-league.png";
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
    text: `${a.nickname} — ${a.common_name}. Beauty ${a.beauty} / Power ${a.power}. 🕷️`,
  };
  try {
    if (navigator.canShare && navigator.canShare(payload)) await navigator.share(payload);
  } catch { /* user cancelled */ }
});

$("btn-again").addEventListener("click", () => {
  state.imageDataUrl = null;
  state.result = null;
  state.saved = false;
  fileInput.value = "";
  $("preview").classList.add("hidden");
  dropzone.querySelector(".dropzone-idle").classList.remove("hidden");
  $("btn-analyze").disabled = true;
  show("step-result", false);
  show("step-upload", true);
  hideError();
});

/* ---------- league ---------- */
async function loadLeague() {
  const { teams, spiders } = await fetch("/api/league").then((r) => r.json());

  const standings = $("standings");
  if (!teams.length) {
    standings.innerHTML = `<p class="empty-state">No teams yet. The league awaits its first spider. 🕸️</p>`;
  } else {
    const medals = ["🥇", "🥈", "🥉"];
    standings.innerHTML = teams
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
      .join("");
  }

  renderAward("award-beauty", best(spiders, "beauty"), "beauty");
  renderAward("award-power", best(spiders, "power"), "power");

  const grid = $("recent-spiders");
  grid.innerHTML = spiders.length
    ? spiders
        .slice(0, 24)
        .map(
          (s) => `
        <div class="spider-card">
          <img src="/images/${esc(s.imageId)}" alt="${esc(s.commonName)}" loading="lazy" />
          <div class="spider-card-body">
            <strong>“${esc(s.nickname)}”</strong>
            <span class="species">${esc(s.commonName)}</span>
            <div class="spider-card-stats"><span class="b">B ${s.beauty}</span><span class="p">P ${s.power}</span></div>
            <div class="meta">${esc(s.teamName)} · scouted by ${esc(s.submitter)}</div>
          </div>
        </div>`
        )
        .join("")
    : `<p class="empty-state">No signings yet.</p>`;
}

function best(spiders, stat) {
  return spiders.reduce((top, s) => (!top || s[stat] > top[stat] ? s : top), null);
}

function renderAward(elId, spider, stat) {
  $(elId).innerHTML = spider
    ? `<img src="/images/${esc(spider.imageId)}" alt="" />
       <div><strong>“${esc(spider.nickname)}”</strong>${esc(spider.commonName)}<br>${esc(spider.teamName)}</div>
       <span class="score ${stat === "beauty" ? "beauty" : "power"}">${spider[stat]}</span>`
    : `<p class="empty-state">Vacant title.</p>`;
}

/* ---------- helpers ---------- */
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
