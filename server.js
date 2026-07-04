import "./lib/env.js"; // must stay first — loads .env before analyze.js reads it
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { analyzeSpider, DEMO_MODE } from "./lib/analyze.js";
import * as db from "./lib/db.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(express.json({ limit: "30mb" }));
app.use(
  express.static(path.join(__dirname, "public"), {
    setHeaders(res, filePath) {
      // Always revalidate the HTML so shipped updates can't pair a stale page
      // with fresh scripts (or vice versa).
      if (filePath.endsWith(".html")) res.setHeader("Cache-Control", "no-cache");
    },
  })
);
// Local/filesystem mode serves uploads itself; in Blob mode photos come from the CDN.
app.use("/images", express.static(db.UPLOADS_DIR, { maxAge: "365d", immutable: true }));

// Visit /api/health in a browser to see what the live deployment actually
// detects — safe to expose (env var NAMES only, never their secret values).
app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    demoMode: DEMO_MODE,
    anthropicKeyPresent: !DEMO_MODE,
    storage: db.storageDiagnostics(),
  });
});

app.get("/api/config", async (_req, res) => {
  try {
    res.json({
      demoMode: DEMO_MODE,
      storageReady: db.storageReady,
      storageHint: db.storageReady ? null : db.STORAGE_HINT,
      teams: await db.getTeamNames(),
    });
  } catch (err) {
    console.error("config failed:", err);
    res.status(500).json({ error: "League office error." });
  }
});

app.post("/api/analyze", async (req, res) => {
  try {
    const { image, state } = req.body || {};
    const parsed = parseDataUrl(image);
    if (!parsed) {
      return res.status(400).json({ error: "The photo didn't upload cleanly — try picking it again." });
    }
    if (parsed.unsupported) {
      return res.status(415).json({
        error: `That image format (${parsed.unsupported}) isn't supported — use a JPEG, PNG, or WebP. On iPhone, a screenshot of the photo works too.`,
      });
    }

    const analysis = await analyzeSpider(parsed.base64, parsed.mediaType, { state });
    res.json({ analysis, demoMode: DEMO_MODE });
  } catch (err) {
    console.error("analyze failed:", err);
    // Anthropic SDK errors carry a status + API message; keep it readable.
    const status = Number(err.status) || 500;
    const detail = err.error?.error?.message || err.message || "";
    const friendly =
      status === 401
        ? "The judge's credentials were rejected — check the ANTHROPIC_API_KEY environment variable (no quotes, no spaces) and redeploy/restart."
        : status === 429
          ? "The judge is swamped — wait a moment and resubmit."
          : `The evaluation desk hit a snag${detail ? `: ${detail}` : "."} Try again.`;
    res.status(status).json({ error: friendly });
  }
});

app.post("/api/spiders", async (req, res) => {
  try {
    const { image, submitter, teamName, analysis, state } = req.body || {};
    if (!analysis || typeof analysis !== "object") {
      return res.status(400).json({ error: "Missing evaluation — submit the photo again." });
    }
    if (!analysis.is_spider) {
      return res.status(409).json({ error: "The judge ruled this is not a spider. Not-spiders cannot join the league." });
    }
    if (!teamName || !String(teamName).trim()) {
      return res.status(400).json({ error: "Pick a team name." });
    }
    const parsed = parseDataUrl(image);
    if (!parsed || parsed.unsupported) {
      return res.status(400).json({ error: "The photo didn't come through — submit it again." });
    }

    const team = await db.ensureTeam(teamName);
    const { imageId, imageUrl } = await db.saveImage(parsed.base64, parsed.mediaType);

    const str = (v, n = 400) => String(v ?? "").slice(0, n);
    const clamp = (n) => Math.max(0, Math.min(100, Math.round(Number(n) || 0)));
    // In this league the handler is the team, so the submitter defaults to the
    // team's own name unless one was explicitly provided.
    const spider = await db.addSpider({
      id: db.id(),
      teamId: team.id,
      teamName: team.name,
      submitter: str(submitter, 40) || team.name,
      state: str(state, 30),
      imageId,
      imageUrl,
      commonName: str(analysis.common_name, 80),
      scientificName: str(analysis.scientific_name, 80),
      confidence: str(analysis.confidence, 12),
      nickname: str(analysis.nickname, 60),
      headlineQuote: str(analysis.headline_quote),
      beauty: clamp(analysis.beauty),
      power: clamp(analysis.power),
      beautyNotes: str(analysis.beauty_notes),
      powerNotes: str(analysis.power_notes),
      scoutingReport: str(analysis.scouting_report, 1200),
      funFact: str(analysis.fun_fact),
      danger: str(analysis.danger_to_humans, 30),
      createdAt: new Date().toISOString(),
    });
    res.json({ spider, team });
  } catch (err) {
    console.error("save failed:", err);
    res.status(Number(err.status) || 500).json({ error: err.message || "Could not save the spider. Try again." });
  }
});

app.get("/api/league", async (_req, res) => {
  try {
    res.json(await db.getLeague());
  } catch (err) {
    console.error("league failed:", err);
    res.status(500).json({ error: "Could not load the league." });
  }
});

// ---- Merch (Printful) -------------------------------------------------
// Set PRINTFUL_API_KEY to a Printful private token to list your synced
// store products. Without it the frontend shows a coming-soon rack.
let merchCache = { at: 0, data: null };

app.get("/api/merch", async (_req, res) => {
  const key = process.env.PRINTFUL_API_KEY;
  if (!key) return res.json({ configured: false, products: [] });
  if (Date.now() - merchCache.at < 5 * 60 * 1000 && merchCache.data) {
    return res.json(merchCache.data);
  }
  try {
    const listRes = await fetch("https://api.printful.com/store/products?limit=24", {
      headers: { Authorization: `Bearer ${key}` },
    });
    if (!listRes.ok) throw new Error(`Printful responded ${listRes.status}`);
    const list = await listRes.json();

    // Pull variant pricing for each product (Printful's list endpoint has no prices).
    const products = await Promise.all(
      (list.result || []).map(async (p) => {
        let price = null;
        let currency = "USD";
        try {
          const detailRes = await fetch(`https://api.printful.com/store/products/${p.id}`, {
            headers: { Authorization: `Bearer ${key}` },
          });
          if (detailRes.ok) {
            const detail = await detailRes.json();
            const variants = detail.result?.sync_variants || [];
            const prices = variants.map((v) => parseFloat(v.retail_price)).filter((n) => !isNaN(n));
            if (prices.length) price = Math.min(...prices);
            currency = variants[0]?.currency || currency;
          }
        } catch { /* price is optional */ }
        return { id: p.id, name: p.name, thumbnail: p.thumbnail_url, price, currency };
      })
    );

    merchCache = { at: Date.now(), data: { configured: true, products } };
    res.json(merchCache.data);
  } catch (err) {
    console.error("merch fetch failed:", err.message);
    res.status(502).json({ configured: true, products: [], error: "Could not reach the merch supplier." });
  }
});

function parseDataUrl(dataUrl) {
  if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:")) return null;
  const comma = dataUrl.indexOf(",");
  if (comma === -1) return null;

  const header = dataUrl.slice(5, comma); // e.g. "image/jpeg;base64"
  if (!/base64/i.test(header)) return null;
  const mediaType = header.split(";")[0].trim().toLowerCase();
  if (!/^image\/(jpeg|png|webp|gif)$/.test(mediaType)) {
    return { unsupported: mediaType || "unknown" };
  }

  const base64 = dataUrl.slice(comma + 1).replace(/\s+/g, "");
  // A broken canvas export ("data:,") or empty pick shouldn't reach the judge.
  if (base64.length < 100) return null;
  return { mediaType, base64 };
}

// On Vercel this app is wrapped by api/index.js; locally it listens itself.
const runDirectly = process.argv[1] === fileURLToPath(import.meta.url);
if (runDirectly) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`🕷️  Spider League on http://localhost:${PORT}${DEMO_MODE ? "  (DEMO MODE — set ANTHROPIC_API_KEY for real judging)" : ""}`);
  });
}

export default app;
