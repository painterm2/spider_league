import fs from "fs";
import path from "path";
import crypto from "crypto";

const DATA_DIR = process.env.SPIDER_DATA_DIR || path.resolve("data");
const DB_PATH = path.join(DATA_DIR, "league.json");
export const UPLOADS_DIR = path.join(DATA_DIR, "uploads");

const TEAM_COLORS = [
  "#8ef53f", "#ff5c8a", "#5cc8ff", "#ffb84d",
  "#c58bff", "#4dffc3", "#ff7a4d", "#f5e94d",
];

fs.mkdirSync(UPLOADS_DIR, { recursive: true });

function load() {
  try {
    return JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
  } catch {
    return { teams: [], spiders: [] };
  }
}

function persist(db) {
  const tmp = DB_PATH + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, DB_PATH);
}

const db = load();

export function id() {
  return crypto.randomBytes(8).toString("hex");
}

export function saveImage(base64, mediaType) {
  const ext = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" }[mediaType] || "jpg";
  const imageId = `${id()}.${ext}`;
  fs.writeFileSync(path.join(UPLOADS_DIR, imageId), Buffer.from(base64, "base64"));
  return imageId;
}

export function ensureTeam(name) {
  const clean = String(name).trim().slice(0, 40);
  let team = db.teams.find((t) => t.name.toLowerCase() === clean.toLowerCase());
  if (!team) {
    team = {
      id: id(),
      name: clean,
      color: TEAM_COLORS[db.teams.length % TEAM_COLORS.length],
      createdAt: new Date().toISOString(),
    };
    db.teams.push(team);
    persist(db);
  }
  return team;
}

export function addSpider(spider) {
  db.spiders.push(spider);
  persist(db);
  return spider;
}

export function getLeague() {
  const teams = db.teams.map((team) => {
    const roster = db.spiders
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
  teams.sort((a, b) => b.totals.overall - a.totals.overall);

  const spiders = [...db.spiders].sort(
    (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
  );

  return { teams, spiders };
}

export function getTeamNames() {
  return db.teams.map((t) => t.name);
}
