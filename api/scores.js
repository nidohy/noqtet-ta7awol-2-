// Vercel Serverless Function — backend for "نقطة تحول"
// Deploy: put this file at /api/scores.js in your Vercel project.
//
// Storage:
//   - If you add an Upstash Redis integration (env vars KV_REST_API_URL +
//     KV_REST_API_TOKEN, or UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN)
//     the data is persisted permanently.
//   - Otherwise it falls back to in-memory storage (resets when the serverless
//     instance sleeps) — fine for testing, not for production.
//
// Operator password/keyword is "opp" on the front end; the operator actions
// here are protected by the OPERATOR_KEY env var (default: "opp").

const DEFAULT_MEMBERS = [
  { name: "الكشاف المتقدم/ زكريا", points: 97 },
  { name: "الكشاف محمد إسلام", points: 85 },
  { name: "الكشاف عمر مكاوي", points: 68 },
  { name: "قائد عمر", points: 57 },
  { name: "الكشاف المتقدم/ حمزة", points: 53 },
  { name: "الشبل يوسف صالح", points: 15 },
  { name: "الكشاف المتقدم/ أحمد سيد", points: 10 },
  { name: "الكشاف أحمد سامح", points: 7 },
  { name: "الشبل حمزة عادل", points: 6 },
  { name: "الشبل محمد أحمد", points: 3 },
  { name: "قائد مصطفى", points: 3 },
];

const KEY = "noqta-tahawol:members";
const URL_ =
  process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || "";
const TOKEN =
  process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || "";
const OPERATOR_KEY = process.env.OPERATOR_KEY || "opp";

globalThis.__members = globalThis.__members || null;

async function readAll() {
  if (URL_ && TOKEN) {
    const r = await fetch(`${URL_}/get/${encodeURIComponent(KEY)}`, {
      headers: { Authorization: `Bearer ${TOKEN}` },
    });
    const j = await r.json();
    if (j && j.result) {
      try {
        return JSON.parse(j.result);
      } catch {
        /* ignore */
      }
    }
    await writeAll(DEFAULT_MEMBERS);
    return DEFAULT_MEMBERS;
  }
  if (!globalThis.__members) globalThis.__members = [...DEFAULT_MEMBERS];
  return globalThis.__members;
}

async function writeAll(members) {
  if (URL_ && TOKEN) {
    await fetch(`${URL_}/set/${encodeURIComponent(KEY)}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(members),
    });
  } else {
    globalThis.__members = members;
  }
  return members;
}

const norm = (s) => String(s || "").trim().replace(/\s+/g, " ");

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  if (req.method === "OPTIONS") return res.status(204).end();

  try {
    if (req.method === "GET") {
      const members = await readAll();
      return res
        .status(200)
        .json({ members: [...members].sort((a, b) => b.points - a.points) });
    }

    if (req.method === "POST") {
      const body =
        typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
      const { action } = body;
      let members = await readAll();

      // --- public action: login by name only ---
      if (action === "login") {
        const name = norm(body.name);
        const found = members.find((m) => norm(m.name) === name);
        if (!found)
          return res
            .status(404)
            .json({ error: "NAME_NOT_FOUND", message: "هذا الاسم غير مسجل" });
        return res.status(200).json({ user: found });
      }

      // --- operator actions (require key) ---
      if (norm(body.key) !== OPERATOR_KEY) {
        return res.status(401).json({ error: "UNAUTHORIZED" });
      }

      if (action === "add") {
        const name = norm(body.name);
        if (!name) return res.status(400).json({ error: "NAME_REQUIRED" });
        if (members.some((m) => norm(m.name) === name))
          return res.status(409).json({ error: "NAME_EXISTS" });
        members = [...members, { name, points: Number(body.points) || 0 }];
      } else if (action === "update") {
        const name = norm(body.name);
        members = members.map((m) =>
          norm(m.name) === name
            ? {
                name: norm(body.newName) || m.name,
                points:
                  body.points === undefined ? m.points : Number(body.points) || 0,
              }
            : m,
        );
      } else if (action === "delete") {
        const name = norm(body.name);
        members = members.filter((m) => norm(m.name) !== name);
      } else if (action === "replaceAll") {
        members = (body.members || []).map((m) => ({
          name: norm(m.name),
          points: Number(m.points) || 0,
        }));
      } else {
        return res.status(400).json({ error: "UNKNOWN_ACTION" });
      }

      await writeAll(members);
      return res
        .status(200)
        .json({ members: [...members].sort((a, b) => b.points - a.points) });
    }

    return res.status(405).json({ error: "METHOD_NOT_ALLOWED" });
  } catch (e) {
    return res.status(500).json({ error: "SERVER_ERROR", message: String(e) });
  }
}
