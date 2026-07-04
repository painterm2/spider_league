import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { analyzeSpider, DEMO_MODE } from "./lib/analyze.js";
import * as db from "./lib/db.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: "30mb" }));
app.use(express.static(path.join(__dirname, "public")));
app.use("/images", express.static(db.UPLOADS_DIR, { maxAge: "365d", immutable: true }));

// Analyses that came back from the judge but haven't been saved to a team yet.
const pending = new Map();

app.get("/api/config", (_req, res) => {
  res.json({ demoMode: DEMO_MODE, teams: db.getTeamNames() });
});

app.post("/api/analyze", async (req, res) => {
  try {
    const { image, submitter } = req.body || {};
    const parsed = parseDataUrl(image);
    if (!parsed) {
      return res.status(400).json({ error: "Send `image` as a data URL (jpeg/png/webp/gif)." });
    }

    const analysis = await analyzeSpider(parsed.base64, parsed.mediaType, submitter);
    const imageId = db.saveImage(parsed.base64, parsed.mediaType);

    const token = db.id();
    pending.set(token, { analysis, imageId, submitter: cleanName(submitter) });
    // Don't let unsaved analyses pile up forever.
    setTimeout(() => pending.delete(token), 60 * 60 * 1000).unref();

    res.json({ token, imageId, analysis, demoMode: DEMO_MODE });
  } catch (err) {
    console.error("analyze failed:", err);
    res.status(err.status || 500).json({ error: err.message || "The judge is unavailable. Try again." });
  }
});

app.post("/api/spiders", (req, res) => {
  const { token, teamName } = req.body || {};
  const entry = pending.get(token);
  if (!entry) {
    return res.status(404).json({ error: "That evaluation expired or was already saved. Submit the photo again." });
  }
  if (!entry.analysis.is_spider) {
    return res.status(409).json({ error: "The judge ruled this is not a spider. Not-spiders cannot join the league." });
  }
  if (!teamName || !String(teamName).trim()) {
    return res.status(400).json({ error: "Pick a team name." });
  }

  const team = db.ensureTeam(teamName);
  const a = entry.analysis;
  const spider = db.addSpider({
    id: db.id(),
    teamId: team.id,
    teamName: team.name,
    submitter: entry.submitter || "Anonymous Handler",
    imageId: entry.imageId,
    commonName: a.common_name,
    scientificName: a.scientific_name,
    confidence: a.confidence,
    nickname: a.nickname,
    headlineQuote: a.headline_quote,
    beauty: a.beauty,
    power: a.power,
    beautyNotes: a.beauty_notes,
    powerNotes: a.power_notes,
    scoutingReport: a.scouting_report,
    funFact: a.fun_fact,
    danger: a.danger_to_humans,
    createdAt: new Date().toISOString(),
  });
  pending.delete(token);
  res.json({ spider, team });
});

app.get("/api/league", (_req, res) => {
  res.json(db.getLeague());
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

app.listen(PORT, () => {
  console.log(`🕷️  Spider League on http://localhost:${PORT}${DEMO_MODE ? "  (DEMO MODE — set ANTHROPIC_API_KEY for real judging)" : ""}`);
});

function parseDataUrl(dataUrl) {
  const match = /^data:(image\/(?:jpeg|png|webp|gif));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl || "");
  if (!match) return null;
  return { mediaType: match[1], base64: match[2] };
}

function cleanName(name) {
  return String(name || "").trim().slice(0, 40);
}
