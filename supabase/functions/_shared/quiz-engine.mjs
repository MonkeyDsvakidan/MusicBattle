// Quiz-Engine (Roadmap 7.3): erzeugt aus dem Song-Pool eines Quiz-Raums die Fragen für „Musikwissen“ (Quiz-Art B).
// Reine Funktion ohne Datenbank/Netz, deterministisch über den Startwert (gleicher Pool + Startwert = gleiches Quiz).
// Fragetypen: year (Erscheinungsjahr schätzen), older (welcher Song ist älter?), cover (Album zum Cover erraten).
// Jede Frage hat einen öffentlichen Teil (prompt) und die Lösung (solution, erst nach dem Aufdecken lesbar).

export const QUIZ_ENGINE_VERSION = 1;
export const QUIZ_KINDS = ["year", "older", "cover"];

// Alben, deren Datum oft nicht das Original-Erscheinungsjahr ist
const UNRELIABLE_ALBUM = /\b(remaster(ed)?|deluxe|anniversary|greatest hits|best of|the best|collection|essentials|hits|edition|reissue|anthology|gold|platinum|jubil[äa]um|live)\b/i;

// Kleiner, deterministischer Zufallsgenerator (mulberry32) aus einem Text-Startwert
export function createRng(seed) {
  let h = 1779033703 ^ String(seed ?? "").length;
  for (const ch of String(seed ?? "")) { h = Math.imul(h ^ ch.charCodeAt(0), 3432918353); h = (h << 13) | (h >>> 19); }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle(list, rng) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

const primaryArtist = (t) => String(t.artist || "").split(",")[0].trim().toLowerCase();
const albumKey = (t) => t.spotify_album_id || `${String(t.album || "").toLowerCase()}|${primaryArtist(t)}`;

// Pool vorbereiten: ein Eintrag pro Song (mehrere Personen können denselben liefern), verlässliches Jahr,
// Jahr aus dem Song-Profil (MusicBrainz, frühestes Jahr), wenn es früher liegt als das Spotify-Album.
export function preparePool(pool, years = {}) {
  const seen = new Map();
  for (const t of pool || []) {
    if (!t?.spotify_track_id || !t.title || !t.artist || seen.has(t.spotify_track_id)) continue;
    const profileYear = Number(years[t.spotify_track_id]) || null;
    const spotifyYear = Number(t.release_year) || null;
    const year = [spotifyYear, profileYear].filter((y) => y && y >= 1900 && y <= 2100).sort((a, b) => a - b)[0] || null;
    const yearReliable = Boolean(year) && (Boolean(profileYear) || (t.album_type !== "compilation" && !UNRELIABLE_ALBUM.test(String(t.album || ""))));
    seen.set(t.spotify_track_id, { ...t, year, yearReliable, suppliers: [t.member_id].filter(Boolean) });
  }
  for (const t of pool || []) {
    const e = seen.get(t?.spotify_track_id);
    if (e && t.member_id && !e.suppliers.includes(t.member_id)) e.suppliers.push(t.member_id);
  }
  return [...seen.values()];
}

// Startpunkt beim Abspielen: nach dem Intro, aber nie über die Mitte hinaus
export function startMs(track) {
  const d = Number(track?.duration_ms) || 0;
  return d > 60000 ? Math.min(30000, Math.round(d * 0.3)) : 0;
}

const songInfo = (t) => ({ track_id: t.spotify_track_id, title: t.title, artist: t.artist });

function yearQuestion(t) {
  return {
    kind: "year",
    prompt: { ...songInfo(t), cover_url: t.cover_url || null, play: { track_id: t.spotify_track_id, start_ms: startMs(t) } },
    solution: { year: t.year },
    track_ids: [t.spotify_track_id],
  };
}

function olderQuestion(a, b, rng) {
  const [first, second] = rng() < 0.5 ? [a, b] : [b, a];
  return {
    kind: "older",
    prompt: { options: [first, second].map((t) => ({ ...songInfo(t), cover_url: t.cover_url || null })), play: null },
    solution: { choice: first.year < second.year ? 1 : 2, years: [first.year, second.year] },
    track_ids: [first.spotify_track_id, second.spotify_track_id],
  };
}

// Cover-Frage: 4 verschiedene Alben; Ablenker bevorzugt vom selben Künstler, sonst aus derselben Zeit.
// Musik erst nach dem Aufdecken (die Spotify-App zeigt sonst Titel und Cover) → Song steht nur in der Lösung.
function coverQuestion(t, all, rng) {
  const artist = primaryArtist(t);
  const label = (o) => `${String(o.album || "").trim().toLowerCase()}|${primaryArtist(o)}`;   // so steht es auf dem Knopf
  const albums = new Map();
  for (const o of all) { const k = label(o); if (k !== label(t) && albumKey(o) !== albumKey(t) && o.album && !albums.has(k)) albums.set(k, o); }
  const candidates = shuffle([...albums.values()], rng);
  const score = (o) => (primaryArtist(o) === artist ? 0 : t.year && o.year && Math.abs(o.year - t.year) <= 5 ? 1 : 2);
  const distractors = candidates.sort((x, y) => score(x) - score(y)).slice(0, 3);
  if (distractors.length < 3) return null;
  const options = shuffle([t, ...distractors], rng);
  return {
    kind: "cover",
    prompt: { cover_url: t.cover_url, options: options.map((o) => ({ album: o.album, artist: o.artist })), play: null },
    solution: { choice: options.indexOf(t) + 1, ...songInfo(t), album: t.album, play: { track_id: t.spotify_track_id, start_ms: startMs(t) } },
    track_ids: [t.spotify_track_id],
  };
}

// count Fragen aus dem Pool. Fragetypen wechseln sich ab (gemischte Reihenfolge), jeder Song kommt höchstens
// einmal als Lösung vor, Personen mit vielen Songs dominieren nicht (abwechselnd aus den Songs jeder Person),
// derselbe Künstler nicht zweimal hintereinander. Fehlen Daten für einen Typ, springt ein anderer ein.
export function generateQuiz(pool, { count = 10, seed = "", years = {}, kinds = QUIZ_KINDS } = {}) {
  const rng = createRng(seed);
  const all = preparePool(pool, years);
  const used = new Set();
  // Songs je Person gemischt, Personen reihum → gleichmässige Mischung
  const bySupplier = new Map();
  for (const t of shuffle(all, rng)) { const k = t.suppliers[0] || "?"; if (!bySupplier.has(k)) bySupplier.set(k, []); bySupplier.get(k).push(t); }
  const queues = shuffle([...bySupplier.values()], rng);
  const order = [];
  for (let i = 0; queues.some((q) => i < q.length); i++) for (const q of queues) if (i < q.length) order.push(q[i]);

  let lastArtist = "";
  const pick = (ok) => {
    const free = order.filter((t) => !used.has(t.spotify_track_id) && ok(t));
    const t = free.find((x) => primaryArtist(x) !== lastArtist) || free[0];
    if (t) used.add(t.spotify_track_id);
    return t || null;
  };
  const build = {
    year: () => { const t = pick((x) => x.yearReliable); return t ? yearQuestion(t) : null; },
    older: () => {
      const a = pick((x) => x.yearReliable); if (!a) return null;
      const b = pick((x) => x.yearReliable && Math.abs(x.year - a.year) >= 2 && primaryArtist(x) !== primaryArtist(a));
      if (!b) { used.delete(a.spotify_track_id); return null; }
      return olderQuestion(a, b, rng);
    },
    cover: () => { const t = pick((x) => Boolean(x.cover_url) && Boolean(x.album)); if (!t) return null; const q = coverQuestion(t, all, rng); if (!q) used.delete(t.spotify_track_id); return q; },
  };

  const questions = [];
  const plan = [];
  if (!kinds.some((k) => build[k]) || count < 1) return questions;
  while (plan.length < count) plan.push(...shuffle(kinds.filter((k) => build[k]), rng));
  for (let i = 0; questions.length < count && i < plan.length + count * kinds.length; i++) {
    const preferred = plan[i % plan.length];
    let q = null;
    for (const k of [preferred, ...shuffle(kinds.filter((x) => x !== preferred && build[x]), rng)]) { q = build[k](); if (q) break; }
    if (!q) break;   // Pool erschöpft
    lastArtist = primaryArtist(order.find((t) => t.spotify_track_id === q.track_ids[q.track_ids.length - 1]) || {});
    questions.push({ question_no: questions.length + 1, ...q });
  }
  return questions;
}

// Punkte (Roadmap 7.4, Entscheidung I: richtig + Tempo-Bonus, beim Jahr „je näher, desto mehr“).
// Punkte = Treffer × (500 + 500 × Tempo), auf 10 gerundet. Tempo = 1 bei sofortiger Antwort, 0 bei Ablauf der Zeit.
// Treffer: Auswahl-Fragen 1 (richtig) oder 0; Jahr 1 bei exakt, −0,1 pro Jahr daneben, ab 10 Jahren 0.
// → richtig und sofort 1000, richtig in letzter Sekunde 500, Jahr 3 daneben nach halber Zeit 530.
export const QUIZ_SCORING = { base: 500, speedBonus: 500, yearStep: 0.1, limitMs: 20000 };

export function answerAccuracy(kind, answer, solution) {
  if (!answer || !solution) return 0;
  if (kind === "year") {
    const diff = Math.abs(Number(answer.year) - Number(solution.year));
    return Number.isFinite(diff) ? Math.max(0, 1 - diff * QUIZ_SCORING.yearStep) : 0;
  }
  if (kind === "whose") return (solution.member_ids || []).includes(answer.member_id) ? 1 : 0;
  return Number(answer.choice) === Number(solution.choice) ? 1 : 0;
}

export function scoreAnswer(kind, answer, solution, answerMs, limitMs = QUIZ_SCORING.limitMs) {
  const accuracy = answerAccuracy(kind, answer, solution);
  if (accuracy <= 0) return 0;
  const ms = Math.max(0, Number(answerMs) || 0), limit = Math.max(1, Number(limitMs) || QUIZ_SCORING.limitMs);
  const speed = Math.min(1, Math.max(0, 1 - ms / limit));
  return Math.round((accuracy * (QUIZ_SCORING.base + QUIZ_SCORING.speedBonus * speed)) / 10) * 10;
}
