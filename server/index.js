// 보물찾기 서버: REST(헌트/보물 관리) + WebSocket(실시간 위치/힌트/수집)
// 보물 좌표는 서버만 알고 있고, 찾는 사람에게는 거리/방향 힌트만 내려줍니다.
import express from 'express';
import http from 'http';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { WebSocketServer } from 'ws';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3001;
const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, 'data.json');

const CLAIM_RADIUS_M = 20; // 이 거리 안에서만 보물을 열 수 있음
const BEARING_HINT_M = 80; // 이 거리 안에서만 방향 힌트 제공
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

// ---------- 저장소 ----------
/** @type {Record<string, any>} */
let hunts = {};
try {
  hunts = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
} catch {
  hunts = {};
}
let saveTimer = null;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    fs.writeFile(DATA_FILE, JSON.stringify(hunts), () => {});
  }, 300);
}

const rooms = new Map(); // code -> Set<ws>

// ---------- 지리 계산 ----------
const R = 6371000;
const rad = (d) => (d * Math.PI) / 180;
const deg = (r) => (r * 180) / Math.PI;
function distance(a, b) {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}
function bearing(a, b) {
  const y = Math.sin(rad(b.lng - a.lng)) * Math.cos(rad(b.lat));
  const x =
    Math.cos(rad(a.lat)) * Math.sin(rad(b.lat)) -
    Math.sin(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(rad(b.lng - a.lng));
  return (deg(Math.atan2(y, x)) + 360) % 360;
}

// ---------- 뷰 ----------
function hostView(h) {
  const online = new Set();
  for (const ws of rooms.get(h.code) ?? []) if (ws.ctx?.pid) online.add(ws.ctx.pid);
  return {
    role: 'host',
    code: h.code,
    name: h.name,
    treasures: h.treasures.map((t) => ({
      ...t,
      foundBy: Object.values(h.players)
        .filter((p) => p.found.includes(t.id))
        .map((p) => ({ id: p.id, name: p.name })),
    })),
    players: Object.values(h.players).map((p) => ({
      id: p.id,
      name: p.name,
      lat: p.lat,
      lng: p.lng,
      acc: p.acc,
      ts: p.ts,
      found: p.found.length,
      online: online.has(p.id),
    })),
  };
}

function playerView(h, pid) {
  const me = h.players[pid];
  const pos = me && me.lat != null ? { lat: me.lat, lng: me.lng } : null;
  const hints = [];
  if (pos) {
    for (const t of h.treasures) {
      if (me.found.includes(t.id)) continue;
      const d = distance(pos, t);
      hints.push({
        id: t.id,
        distance: Math.round(d),
        bearing: d <= BEARING_HINT_M ? Math.round(bearing(pos, t)) : null,
      });
    }
    hints.sort((a, b) => a.distance - b.distance);
  }
  return {
    role: 'player',
    code: h.code,
    name: h.name,
    total: h.treasures.length,
    claimRadius: CLAIM_RADIUS_M,
    found: h.treasures
      .filter((t) => me.found.includes(t.id))
      .map((t) => ({ id: t.id, name: t.name, message: t.message })),
    hints,
    board: Object.values(h.players)
      .map((p) => ({ id: p.id, name: p.name, found: p.found.length }))
      .sort((a, b) => b.found - a.found),
  };
}

function send(ws, msg) {
  if (ws.readyState === 1) ws.send(JSON.stringify(msg));
}
function push(code, only) {
  const h = hunts[code];
  if (!h) return;
  for (const ws of rooms.get(code) ?? []) {
    const { role, pid } = ws.ctx ?? {};
    if (only && only !== role) continue;
    if (role === 'host') send(ws, { t: 'view', view: hostView(h) });
    else if (role === 'player') send(ws, { t: 'view', view: playerView(h, pid) });
  }
}

// ---------- REST ----------
const app = express();
app.use(express.json());

function newCode() {
  for (;;) {
    const code = Array.from({ length: 5 }, () => ALPHABET[crypto.randomInt(ALPHABET.length)]).join('');
    if (!hunts[code]) return code;
  }
}
const clean = (s, n) => String(s ?? '').trim().slice(0, n);
const validPos = (lat, lng) =>
  Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;

app.post('/api/hunts', (req, res) => {
  const name = clean(req.body?.name, 40) || '우리의 보물찾기';
  const code = newCode();
  const hostToken = crypto.randomBytes(16).toString('hex');
  hunts[code] = { code, name, hostToken, createdAt: Date.now(), treasures: [], players: {} };
  save();
  res.json({ code, hostToken });
});

app.get('/api/hunts/:code', (req, res) => {
  const h = hunts[req.params.code.toUpperCase()];
  if (!h) return res.status(404).json({ error: 'not_found' });
  res.json({ code: h.code, name: h.name });
});

function hostAuth(req, res, next) {
  const h = hunts[req.params.code.toUpperCase()];
  if (!h) return res.status(404).json({ error: 'not_found' });
  if (req.get('x-host-token') !== h.hostToken) return res.status(403).json({ error: 'forbidden' });
  req.hunt = h;
  next();
}

app.post('/api/hunts/:code/treasures', hostAuth, (req, res) => {
  const { lat, lng } = req.body ?? {};
  if (!validPos(lat, lng)) return res.status(400).json({ error: 'bad_position' });
  if (req.hunt.treasures.length >= 50) return res.status(400).json({ error: 'too_many' });
  const t = {
    id: crypto.randomBytes(4).toString('hex'),
    name: clean(req.body.name, 40) || `보물 ${req.hunt.treasures.length + 1}`,
    message: clean(req.body.message, 200),
    lat,
    lng,
  };
  req.hunt.treasures.push(t);
  save();
  push(req.hunt.code);
  res.json(t);
});

app.delete('/api/hunts/:code/treasures/:id', hostAuth, (req, res) => {
  req.hunt.treasures = req.hunt.treasures.filter((t) => t.id !== req.params.id);
  for (const p of Object.values(req.hunt.players)) p.found = p.found.filter((id) => id !== req.params.id);
  save();
  push(req.hunt.code);
  res.json({ ok: true });
});

// 프로덕션: 빌드된 프런트 서빙
const dist = path.join(__dirname, '..', 'dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

// ---------- WebSocket ----------
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (ws) => {
  ws.ctx = null;
  ws.on('message', (raw) => {
    let m;
    try {
      m = JSON.parse(raw.toString());
    } catch {
      return;
    }
    if (m.t === 'host') {
      const h = hunts[String(m.code).toUpperCase()];
      if (!h || m.token !== h.hostToken) return send(ws, { t: 'error', msg: 'forbidden' });
      attach(ws, h.code, { role: 'host' });
      return push(h.code, 'host');
    }
    if (m.t === 'join') {
      const h = hunts[String(m.code).toUpperCase()];
      if (!h) return send(ws, { t: 'error', msg: 'not_found' });
      const pid = clean(m.pid, 64);
      if (!pid) return;
      if (!h.players[pid]) {
        h.players[pid] = { id: pid, name: clean(m.name, 20) || '탐험가', lat: null, lng: null, acc: null, ts: 0, found: [] };
        save();
      } else if (m.name) {
        h.players[pid].name = clean(m.name, 20) || h.players[pid].name;
      }
      attach(ws, h.code, { role: 'player', pid });
      return push(h.code);
    }
    const ctx = ws.ctx;
    if (!ctx) return;
    const h = hunts[ctx.code];
    if (!h || ctx.role !== 'player') return;
    const me = h.players[ctx.pid];

    if (m.t === 'pos' && validPos(m.lat, m.lng)) {
      Object.assign(me, { lat: m.lat, lng: m.lng, acc: Number(m.acc) || null, ts: Date.now() });
      send(ws, { t: 'view', view: playerView(h, ctx.pid) });
      push(h.code, 'host');
    } else if (m.t === 'claim') {
      const t = h.treasures.find((x) => x.id === m.id);
      if (!t || me.lat == null || me.found.includes(t.id)) return send(ws, { t: 'claim', ok: false });
      const d = distance(me, t);
      if (d > CLAIM_RADIUS_M) return send(ws, { t: 'claim', ok: false, distance: Math.round(d) });
      me.found.push(t.id);
      save();
      send(ws, { t: 'claim', ok: true, treasure: { id: t.id, name: t.name, message: t.message } });
      push(h.code);
    }
  });
  ws.on('close', () => {
    if (!ws.ctx) return;
    rooms.get(ws.ctx.code)?.delete(ws);
    push(ws.ctx.code, 'host');
  });
});

function attach(ws, code, ctx) {
  if (ws.ctx) rooms.get(ws.ctx.code)?.delete(ws);
  ws.ctx = { code, ...ctx };
  if (!rooms.has(code)) rooms.set(code, new Set());
  rooms.get(code).add(ws);
}

server.listen(PORT, () => console.log(`treasure server on :${PORT}`));
