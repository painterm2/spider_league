import fs from "fs";
import path from "path";
import crypto from "crypto";

/*
 * Storage works in two modes:
 *  - Filesystem (default): plain files under ./data — for local dev and any
 *    host with a persistent disk.
 *  - Vercel Blob: when BLOB_READ_WRITE_TOKEN is present (Vercel injects it
 *    once a Blob store is connected to the project). Teams and spiders are
 *    immutable JSON blobs; photos are public blobs served by Vercel's CDN.
 */

const TEAM_COLORS = [
  "#a4bd4e", "#cf7a5a", "#d9a83e", "#8fb3c9",
  "#b48ead", "#7fbf9e", "#c9705a", "#d9c34d",
];
const FOUNDING_TEAMS = ["Michael", "Connor", "Adam", "Nate", "Sam"];
const BLOB_PREFIX = "spider-league/";

const IS_SERVERLESS = !!process.env.VERCEL;

// Vercel injects BLOB_READ_WRITE_TOKEN, but a store created with a custom
// prefix (or a second store) is named <PREFIX>_BLOB_READ_WRITE_TOKEN. The
// @vercel/blob SDK only auto-reads the unprefixed name, so find whichever one
// exists and pass it explicitly.
function findBlobToken() {
  if (process.env.BLOB_READ_WRITE_TOKEN) return process.env.BLOB_READ_WRITE_TOKEN;
  for (const [k, v] of Object.entries(process.env)) {
    if (k.endsWith("BLOB_READ_WRITE_TOKEN") && v) return v;
  }
  return null;
}
const BLOB_TOKEN = findBlobToken();
const USE_BLOB = !!BLOB_TOKEN;

// On a serverless host without a Blob store there is nowhere to write.
export const storageReady = USE_BLOB || !IS_SERVERLESS;
export const STORAGE_HINT =
  "Storage isn't connected, so spiders can't be signed. In Vercel: Storage → Create → Blob, connect it to this project, then redeploy.";

// Diagnostic (names only, never values) so a deployment can report what it sees.
export function storageDiagnostics() {
  const blobVars = Object.keys(process.env).filter((k) => k.endsWith("BLOB_READ_WRITE_TOKEN"));
  return {
    serverless: IS_SERVERLESS,
    storageReady,
    driver: USE_BLOB ? "vercel-blob" : IS_SERVERLESS ? "none" : "filesystem",
    blobTokenFound: USE_BLOB,
    blobEnvVarNames: blobVars, // e.g. ["BLOB_READ_WRITE_TOKEN"] or a prefixed name
  };
}

export function id() {
  return crypto.randomBytes(8).toString("hex");
}

function slugify(name) {
  return (
    String(name).toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "team"
  );
}

function colorFor(slug) {
  let h = 0;
  for (const c of slug) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return TEAM_COLORS[h % TEAM_COLORS.length];
}

function newTeam(name) {
  const clean = String(name).trim().slice(0, 40);
  const slug = slugify(clean);
  return { id: slug, name: clean, color: colorFor(slug), createdAt: new Date().toISOString() };
}

/* ---------------- filesystem driver ---------------- */

const DATA_DIR = process.env.SPIDER_DATA_DIR || path.resolve("data");
const DB_PATH = path.join(DATA_DIR, "league.json");
export const UPLOADS_DIR = path.join(DATA_DIR, "uploads");

let fsdb = null;

function fsInit() {
  if (fsdb) return fsdb;
  try {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  } catch { /* read-only fs — surfaces via storageReady */ }
  try {
    fsdb = JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
  } catch {
    fsdb = { teams: [], spiders: [] };
  }
  for (const name of FOUNDING_TEAMS) {
    if (!fsdb.teams.some((t) => t.name.toLowerCase() === name.toLowerCase())) {
      fsdb.teams.push(newTeam(name));
    }
  }
  fsPersist();
  return fsdb;
}

function fsPersist() {
  try {
    const tmp = DB_PATH + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(fsdb, null, 2));
    fs.renameSync(tmp, DB_PATH);
  } catch { /* read-only fs */ }
}

/* ---------------- Vercel Blob driver ---------------- */

let loadBlobModule = () => import("@vercel/blob");
// Test hook: lets the driver run against an in-memory fake.
export function _setBlobModuleForTests(mod) {
  loadBlobModule = () => Promise.resolve(mod);
  blobCache = { at: 0, state: null };
}

let blobCache = { at: 0, state: null };
const BLOB_CACHE_MS = 15 * 1000;

// Vercel Blob stores are private by default now, and private stores reject
// access:"public". Everything is written private and read back through the
// SDK's authenticated get(); images are served via the /api/image proxy.
const BLOB_ACCESS = "private";

async function blobGetJson(pathname) {
  const { get } = await loadBlobModule();
  const res = await get(pathname, { access: BLOB_ACCESS, token: BLOB_TOKEN });
  if (!res || !res.stream) return null;
  return JSON.parse(await new Response(res.stream).text());
}

async function blobState() {
  if (blobCache.state && Date.now() - blobCache.at < BLOB_CACHE_MS) return blobCache.state;
  const { list } = await loadBlobModule();

  const blobs = [];
  let cursor;
  do {
    const page = await list({ prefix: BLOB_PREFIX, cursor, limit: 1000, token: BLOB_TOKEN });
    blobs.push(...page.blobs);
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);

  const read = async (b) => {
    try { return await blobGetJson(b.pathname); }
    catch { return null; } // skip a blob that fails to parse rather than break the whole league
  };
  const [teams, spiders] = await Promise.all([
    Promise.all(blobs.filter((b) => b.pathname.startsWith(BLOB_PREFIX + "teams/")).map(read)),
    Promise.all(blobs.filter((b) => b.pathname.startsWith(BLOB_PREFIX + "spiders/")).map(read)),
  ]);

  blobCache = {
    at: Date.now(),
    state: { teams: teams.filter(Boolean), spiders: spiders.filter(Boolean) },
  };
  return blobCache.state;
}

async function blobPutJson(pathname, obj) {
  const { put } = await loadBlobModule();
  await put(pathname, JSON.stringify(obj), {
    access: BLOB_ACCESS,
    contentType: "application/json",
    addRandomSuffix: false,
    allowOverwrite: true,
    token: BLOB_TOKEN,
  });
}

// Stream a stored image back out (private blobs aren't directly URL-fetchable).
export async function getImageStream(pathname) {
  if (!USE_BLOB) return null;
  const p = String(pathname || "");
  if (!p.startsWith(BLOB_PREFIX + "images/")) {
    throw Object.assign(new Error("bad image path"), { status: 400 });
  }
  const { get } = await loadBlobModule();
  const res = await get(p, { access: BLOB_ACCESS, token: BLOB_TOKEN });
  if (!res || !res.stream) return null;
  return { stream: res.stream, contentType: res.blob?.contentType || "image/jpeg" };
}

/* ---------------- shared API ---------------- */

function requireStorage() {
  if (!storageReady) throw Object.assign(new Error(STORAGE_HINT), { status: 503 });
}

async function getState() {
  if (!USE_BLOB) {
    if (!storageReady) {
      return { teams: FOUNDING_TEAMS.map(newTeam), spiders: [] };
    }
    const db = fsInit();
    return { teams: db.teams, spiders: db.spiders };
  }
  const state = await blobState();
  // Founding teams exist virtually until their first signing persists them.
  const teams = [...state.teams];
  for (const name of FOUNDING_TEAMS) {
    if (!teams.some((t) => t.name.toLowerCase() === name.toLowerCase())) {
      teams.push(newTeam(name));
    }
  }
  return { teams, spiders: state.spiders };
}

export async function ensureTeam(name) {
  requireStorage();
  const clean = String(name).trim().slice(0, 40);

  if (!USE_BLOB) {
    const db = fsInit();
    let team = db.teams.find((t) => t.name.toLowerCase() === clean.toLowerCase());
    if (!team) {
      team = newTeam(clean);
      db.teams.push(team);
      fsPersist();
    }
    return team;
  }

  const state = await blobState();
  let team = state.teams.find((t) => t.name.toLowerCase() === clean.toLowerCase());
  if (!team) {
    team = newTeam(clean);
    await blobPutJson(`${BLOB_PREFIX}teams/${team.id}.json`, team);
    state.teams.push(team); // keep the cache warm so the next read sees it
  }
  return team;
}

export async function addSpider(spider) {
  requireStorage();
  if (!USE_BLOB) {
    const db = fsInit();
    db.spiders.push(spider);
    fsPersist();
    return spider;
  }
  await blobPutJson(`${BLOB_PREFIX}spiders/${spider.id}.json`, spider);
  const state = await blobState();
  if (!state.spiders.some((s) => s.id === spider.id)) state.spiders.push(spider);
  return spider;
}

export async function saveImage(base64, mediaType) {
  requireStorage();
  const ext = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" }[mediaType] || "jpg";
  const buffer = Buffer.from(base64, "base64");

  if (!USE_BLOB) {
    fsInit();
    const imageId = `${id()}.${ext}`;
    fs.writeFileSync(path.join(UPLOADS_DIR, imageId), buffer);
    return { imageId, imageUrl: `/images/${imageId}` };
  }

  const { put } = await loadBlobModule();
  const pathname = `${BLOB_PREFIX}images/${id()}.${ext}`;
  await put(pathname, buffer, {
    access: BLOB_ACCESS,
    contentType: mediaType,
    addRandomSuffix: false,
    token: BLOB_TOKEN,
  });
  // Private blobs can't be loaded straight from a CDN URL — go through our proxy.
  return { imageId: pathname, imageUrl: `/api/image?path=${encodeURIComponent(pathname)}` };
}

export async function getLeague() {
  const { teams, spiders } = await getState();

  const ranked = teams.map((team) => {
    const roster = spiders
      .filter((s) => s.teamId === team.id)
      .sort((a, b) => (b.beauty + b.power) - (a.beauty + a.power));
    const beauty = roster.reduce((sum, s) => sum + s.beauty, 0);
    const power = roster.reduce((sum, s) => sum + s.power, 0);
    return {
      ...team,
      roster,
      totals: { beauty, power, overall: beauty + power, spiders: roster.length },
    };
  });
  ranked.sort((a, b) => b.totals.overall - a.totals.overall);

  const recent = [...spiders].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  return { teams: ranked, spiders: recent };
}

export async function getTeamNames() {
  const { teams } = await getState();
  return teams.map((t) => t.name);
}
