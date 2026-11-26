const assert = require("assert");
const { analyze } = require("../public/engine.js");
const candles = require("../api/candles.js");
const calendar = require("../api/calendar.js");
const analyse = require("../api/analyse.js");

function gen(n, step, seed) { let p = 3560, t = Date.now() - n * step, r = seed; const o = [];
  const rnd = () => { r = (r * 16807) % 2147483647; return r / 2147483647 - 0.5; };
  for (let i = 0; i < n; i++) { const op = p; p += rnd() * 8 + Math.sin(i / 25) * 1.2; o.push({ t: t + i * step, o: op, h: Math.max(op, p) + Math.abs(rnd()) * 4, l: Math.min(op, p) - Math.abs(rnd()) * 4, c: p }); } return o; }
function res() { return { code: 0, body: null, headers: {}, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; }, setHeader(k, v) { this.headers[k] = v; } }; }

(async () => {
  // moteur : plans cohérents, tailles d'historique réelles (192 M15, 180 H4)
  const seen = {};
  for (let s = 1; s <= 300; s++) {
    const a = analyze(gen(192, 9e5, s * 7919), gen(180, 144e5, s * 104729), Date.now(), [], { ltf: "M15", htf: "H4" });
    seen[a.verdict] = (seen[a.verdict] || 0) + 1;
    if (a.plan) { const p = a.plan, d = p.dir;
      assert(d * (p.entry - p.sl) > 0 && d * (p.tp1 - p.entry) > 0 && d * (p.tp2 - p.entry) >= d * (p.tp1 - p.entry) - 1e-9, "plan incohérent");
      assert(p.dist >= a.atr * 0.99 && p.dist <= a.atr * 3.51, "stop hors bornes"); }
  }
  // garde-fou annonce : jamais de signal 10 min avant une annonce forte
  for (let s = 1; s <= 300; s++) {
    const a = analyze(gen(192, 9e5, s * 7919), gen(180, 144e5, s * 104729), Date.now(), [{ t: new Date(Date.now() + 6e5).toISOString(), impact: "high", title: "NFP" }], { ltf: "M15", htf: "H4" });
    assert.strictEqual(a.verdict, "wait");
  }
  assert.strictEqual(analyze(gen(30, 9e5, 5), [], Date.now(), [], { ltf: "M15", htf: "H4" }), null);

  // /api/candles : normalisation (barre ouverte en premier, tri ascendant)
  const realFetch = global.fetch;
  global.fetch = async (url) => { assert(String(url).includes("/api/XAUUSD/ohlc?interval=15m&limit=192")); return { ok: true, json: async () => ({ symbol: "XAUUSD", interval: "15m", bars: [
    { openTime: "2026-11-26T08:15:00Z", open: 3564.8, high: 3566.8, low: 3562.4, close: 3566.5, isOpen: true },
    { openTime: "2026-11-26T08:00:00Z", open: 3565.0, high: 3570.2, low: 3563.5, close: 3564.8 },
    { openTime: "bad", open: 1, high: 1, low: 1, close: 1 }] }) }; };
  let r = res(); await candles({ query: { tf: "15m" } }, r);
  assert.strictEqual(r.code, 200); assert.strictEqual(r.body.candles.length, 2); assert(r.body.candles[0].t < r.body.candles[1].t); assert.strictEqual(r.body.candles[1].open, true);
  r = res(); await candles({ query: { tf: "7m" } }, r); assert.strictEqual(r.code, 400);
  global.fetch = async () => ({ ok: false, status: 500 }); r = res(); await candles({ query: { tf: "1h" } }, r); assert.strictEqual(r.code, 502);

  // /api/calendar
  global.fetch = async () => ({ ok: true, json: async () => [{ time: "2026-12-04T13:30:00Z", name: "Nonfarm Payrolls", importance: "high", timeMode: "exact", forecast: null }, { time: "x", name: "bad" }] });
  r = res(); await calendar({}, r); assert.strictEqual(r.body.events.length, 1); assert.strictEqual(r.body.events[0].exact, true);

  // /api/analyse : garde-fous puis appel
  delete process.env.ANTHROPIC_API_KEY; delete process.env.DESK_CODE;
  r = res(); await analyse({ method: "POST", headers: {}, body: {} }, r); assert.strictEqual(r.code, 503);
  process.env.ANTHROPIC_API_KEY = "test-key"; process.env.DESK_CODE = "abc123";
  r = res(); await analyse({ method: "GET", headers: {} }, r); assert.strictEqual(r.code, 405);
  r = res(); await analyse({ method: "POST", headers: { "x-desk-code": "nope" }, body: { state: {} } }, r); assert.strictEqual(r.code, 401);
  r = res(); await analyse({ method: "POST", headers: { "x-desk-code": "abc123" }, body: { state: { x: "y".repeat(9000) } } }, r); assert.strictEqual(r.code, 413);
  let sent = null;
  global.fetch = async (url, o) => { sent = { url, o }; return { ok: true, json: async () => ({ content: [{ type: "text", text: "Lecture test" }] }) }; };
  r = res(); await analyse({ method: "POST", headers: { "x-desk-code": "abc123" }, body: JSON.stringify({ state: { prix: 3566.5 } }) }, r);
  assert.strictEqual(r.code, 200); assert.strictEqual(r.body.text, "Lecture test");
  assert.strictEqual(sent.url, "https://api.anthropic.com/v1/messages"); assert.strictEqual(sent.o.headers["x-api-key"], "test-key");
  const b = JSON.parse(sent.o.body); assert.strictEqual(b.model, "claude-haiku-5-5"); assert.strictEqual(b.max_tokens, 500);
  global.fetch = realFetch;
  console.log("OK", seen);
})().catch((e) => { console.error("ECHEC", e); process.exit(1); });
