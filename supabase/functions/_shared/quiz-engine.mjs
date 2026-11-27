// Quiz-Engine (Roadmap 7.3): erzeugt aus dem Song-Pool eines Quiz-Raums die Fragen für „Musikwissen“ (Quiz-Art B).
// Reine Funktion ohne Datenbank/Netz, deterministisch über den Startwert (gleicher Pool + Startwert = gleiches Quiz).
// Fragetypen: year (Erscheinungsjahr schätzen), older (welcher Song ist älter?), cover (Album zum Cover erraten),
// seit 7.12: intro (Song am Intro erkennen), album (auf welchem Album ist der Song?).
// seit 7.10 («Unter Freunden», nur in Räumen mit quiz_kind = friends, gemischt mit den Typen oben): whose (wessen Song?),
// rank (wer hat X auf Platz N?), fans (wer hört alles X?), common (welchen Künstler haben A und B beide in den Top 20?).
// Jede Frage hat einen öffentlichen Teil (prompt) und die Lösung (solution, erst nach dem Aufdecken lesbar).

export const QUIZ_ENGINE_VERSION = 3;
export const QUIZ_KINDS = ["year", "older", "cover", "intro", "album"];
// Ältere Apps kennen nur diese Typen (mb-quiz-start ohne „kinds“ im Aufruf)
export const QUIZ_KINDS_V1 = ["year", "older", "cover"];
// 7.10 (Entscheid J, Details 27.11.2026): Fragen über die Personen. Antwort ist eine Person (whose, rank), mehrere
// Personen (fans) oder einer von 4 Künstlern (common). Personen-Fragen erst ab 3 Personen mit Spotify-Daten
// (zu zweit hätte man oft nur einen Knopf), «Gemeinsamkeit» ab 2 mit Daten und mindestens 3 Mitspielenden.
// «hört» = Künstler steht in den Top 50 Künstlern der Person (Spotify, ca. letzte 6 Monate) – ein einzelner Song zählt nicht.
export const FRIEND_KINDS = ["whose", "rank", "fans", "common"];
export const FRIENDS = { minPeople: 3, rankMax: 20, commonTop: 20 };
// 7.12 „knapper vergleichen“: höchstens 3 Jahre auseinander; im selben Jahr nur mit Tagesdatum und ≥ 30 Tagen Abstand
const OLDER_MAX_YEARS = 3, OLDER_MIN_DAYS = 30;

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
    // Tagesdatum nur, wenn es zum verwendeten Jahr passt (ein früheres Profil-Jahr hat kein Datum)
    const date = /^\d{4}-\d{2}-\d{2}$/.test(String(t.release_date || "")) && Number(t.release_date.slice(0, 4)) === year ? t.release_date : null;
    seen.set(t.spotify_track_id, { ...t, year, date, yearReliable, suppliers: [t.member_id].filter(Boolean) });
  }
  for (const t of pool || []) {
    const e = seen.get(t?.spotify_track_id);
    if (e && t.member_id && !e.suppliers.includes(t.member_id)) e.suppliers.push(t.member_id);
  }
  return [...seen.values()];
}

// 7.11 (Entscheid J): Wer einen Song der Frage geliefert hat, ist bei dieser Frage ausgesetzt («Deine Frage – schau
// zu», keine Punkte). Erst ab zwei Mitspielern – im Solo sind alle Songs die eigenen. Auch für 7.10 gedacht:
// eine Frage trägt in sitting_out die Mitglieder, die sie nicht beantworten (mb_quiz_store_game legt sie ab).
export function sittingOut(tracks, players) {
  if ((players || []).length < 2) return [];
  return players.filter((p) => (tracks || []).some((t) => (t?.suppliers || []).includes(p)));
}

// Top-Künstler je Person (7.10): member_id → Map(artist_id → {id, name, image_url, rank}); nur Mitspielende
export function artistsByMember(artists, players = []) {
  const inRoom = new Set(players || []), by = new Map();
  for (const a of artists || []) {
    const rank = Number(a?.rank);
    if (!a?.member_id || !a.spotify_artist_id || !a.name || !(rank >= 1) || (inRoom.size && !inRoom.has(a.member_id))) continue;
    if (!by.has(a.member_id)) by.set(a.member_id, new Map());
    const list = by.get(a.member_id);
    if (!list.has(a.spotify_artist_id)) list.set(a.spotify_artist_id, { id: a.spotify_artist_id, name: a.name, image_url: a.image_url || null, rank });
  }
  return by;
}

// «Wer hört alles X?» (7.10, Teilpunkte): jede richtig gewählte Person gibt einen Anteil, jede falsche zieht einen ab,
// nie unter 0. Sich selbst wählt man nicht – man wird nur nach den anderen beurteilt. Hört ausser einem selbst
// niemand X, ist «niemand gewählt» richtig.
export function fansAccuracy(chosen, fans, self) {
  const right = new Set((fans || []).filter((m) => m !== self)), picked = new Set((chosen || []).filter((m) => m !== self));
  if (!right.size) return picked.size ? 0 : 1;
  let hits = 0;
  for (const m of picked) if (right.has(m)) hits++;
  return Math.max(0, (hits - (picked.size - hits)) / right.size);
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
    solution: { choice: olderFirst(first, second) ? 1 : 2, years: [first.year, second.year], dates: [first.date, second.date] },
    track_ids: [first.spotify_track_id, second.spotify_track_id],
  };
}

const olderFirst = (a, b) => (a.year !== b.year ? a.year < b.year : a.date < b.date);
// Paar für „Welcher Song ist älter?“: nah beieinander, aber eindeutig
export function olderClose(a, b) {
  const dy = Math.abs(a.year - b.year);
  if (dy > OLDER_MAX_YEARS) return false;
  if (dy > 0) return true;
  return Boolean(a.date && b.date) && Math.abs(Date.parse(a.date) - Date.parse(b.date)) >= OLDER_MIN_DAYS * 864e5;
}

const titleLabel = (o) => String(o.title || "").trim().toLowerCase();
const albumLabel = (o) => String(o.album || "").trim().toLowerCase();
// „Welches Album?“ nur mit echten Alben – eine Single heisst meist wie der Song
const isAlbumTrack = (o) => o.album_type === "album" && Boolean(o.album) && albumLabel(o) !== titleLabel(o);

// Intro erraten (7.12): Song läuft beim Host ab Sekunde 0, Titel und Cover verdeckt, 4 Titel zur Wahl, möglichst
// vom selben Künstler. Die Song-ID steht nur in der Lösung – der Host holt sie über mb_quiz_host_play.
function introQuestion(t, all, rng) {
  const artist = primaryArtist(t);
  const titles = new Map();
  for (const o of all) { const k = titleLabel(o); if (k && k !== titleLabel(t) && !titles.has(k)) titles.set(k, o); }
  const distractors = shuffle([...titles.values()], rng).sort((x, y) => (primaryArtist(x) === artist ? 0 : 1) - (primaryArtist(y) === artist ? 0 : 1)).slice(0, 3);
  if (distractors.length < 3) return null;
  const options = shuffle([t, ...distractors], rng);
  return {
    kind: "intro",
    prompt: { options: options.map((o) => ({ title: o.title })), play: null },
    solution: { choice: options.indexOf(t) + 1, ...songInfo(t), album: t.album, cover_url: t.cover_url || null, play: { track_id: t.spotify_track_id, start_ms: 0 } },
    track_ids: [t.spotify_track_id],
  };
}

// Welches Album? (7.12): Songtitel und Künstler sichtbar, 4 Alben desselben Künstlers zur Wahl (ohne Cover)
function albumQuestion(t, all, rng) {
  const artist = primaryArtist(t);
  const albums = new Map();
  for (const o of all) { const k = albumLabel(o); if (primaryArtist(o) === artist && isAlbumTrack(o) && k !== albumLabel(t) && !albums.has(k)) albums.set(k, o); }
  const distractors = shuffle([...albums.values()], rng).slice(0, 3);
  if (distractors.length < 3) return null;
  const options = shuffle([t, ...distractors], rng);
  return {
    kind: "album",
    prompt: { ...songInfo(t), options: options.map((o) => ({ album: o.album })), play: { track_id: t.spotify_track_id, start_ms: startMs(t) } },
    solution: { choice: options.indexOf(t) + 1, album: t.album, cover_url: t.cover_url || null },
    track_ids: [t.spotify_track_id],
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
  const score = (o) => (primaryArtist(o) === artist ? 0 : t.year && o.year && Math.abs(o.year - t.year) <= 2 ? 1 : 2);
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
// avoid (7.7, „Nochmal“): Song-IDs aus früheren Quiz desselben Raums. Sie werden gemieden, solange daraus genug
// Fragen entstehen; sonst wird der ganze Pool verwendet.
// players (7.11): Mitglieds-IDs aller Mitspielenden. Jede Frage bekommt sitting_out (siehe sittingOut); Fragen, bei
// denen alle ausgesetzt wären, entstehen nicht.
// artists (7.10): Top-Künstler der Mitspielenden ({member_id, spotify_artist_id, name, rank, image_url}) für rank/fans/common.
export function generateQuiz(pool, { count = 10, seed = "", years = {}, kinds = QUIZ_KINDS, avoid = [], players = [], artists = [] } = {}) {
  const skip = new Set(avoid || []);
  if (skip.size) {
    const fresh = generateQuiz((pool || []).filter((t) => !skip.has(t?.spotify_track_id)), { count, seed, years, kinds, players, artists });
    if (fresh.length >= count) return fresh;
  }
  const rng = createRng(seed);
  const all = preparePool(pool, years);
  const used = new Set();
  const byId = new Map(all.map((t) => [t.spotify_track_id, t]));
  const nobodyLeft = (tracks) => players.length >= 2 && sittingOut(tracks, players).length === players.length;
  // Songs je Person gemischt, Personen reihum → gleichmässige Mischung
  const bySupplier = new Map();
  for (const t of shuffle(all, rng)) { const k = t.suppliers[0] || "?"; if (!bySupplier.has(k)) bySupplier.set(k, []); bySupplier.get(k).push(t); }
  const queues = shuffle([...bySupplier.values()], rng);
  const order = [];
  for (let i = 0; queues.some((q) => i < q.length); i++) for (const q of queues) if (i < q.length) order.push(q[i]);

  let lastArtist = "";
  // erster freier passender Song, möglichst nicht vom Künstler der letzten Frage (prüft ok() nur so weit wie nötig)
  const pick = (ok) => {
    let fallback = null;
    for (const t of order) {
      if (used.has(t.spotify_track_id) || (fallback && primaryArtist(t) === lastArtist) || nobodyLeft([t]) || !ok(t)) continue;
      if (primaryArtist(t) !== lastArtist) { used.add(t.spotify_track_id); return t; }
      fallback = t;
    }
    if (fallback) used.add(fallback.spotify_track_id);
    return fallback;
  };
  // Songs mit verlässlichem Jahr nach Jahr (Partnersuche für „älter“ nur in den Nachbarjahren)
  const byYear = new Map(), yearArtists = new Map(), yearDates = new Map();
  for (const t of order) if (t.yearReliable) {
    if (!byYear.has(t.year)) { byYear.set(t.year, []); yearArtists.set(t.year, new Set()); yearDates.set(t.year, [Infinity, -Infinity]); }
    byYear.get(t.year).push(t); yearArtists.get(t.year).add(primaryArtist(t));
    if (t.date) { const d = Date.parse(t.date), r = yearDates.get(t.year); r[0] = Math.min(r[0], d); r[1] = Math.max(r[1], d); }
  }
  // gibt es im selben Jahr überhaupt ein Datum mit genug Abstand?
  const sameYearPossible = (a) => { const d = Date.parse(a.date), [lo, hi] = yearDates.get(a.year); return d - lo >= OLDER_MIN_DAYS * 864e5 || hi - d >= OLDER_MIN_DAYS * 864e5; };
  let olderDone = false;   // kein Paar mehr → bleibt so (es werden nur Songs verbraucht)
  const olderPartner = (a) => {
    for (let y = a.year - OLDER_MAX_YEARS; y <= a.year + OLDER_MAX_YEARS; y++) {
      const artists = yearArtists.get(y);
      if (!artists || (artists.size === 1 && artists.has(primaryArtist(a))) || (y === a.year && !(a.date && sameYearPossible(a)))) continue;   // schnell überspringen (grosse Pools)
      const b = byYear.get(y).find((x) => !used.has(x.spotify_track_id) && primaryArtist(x) !== primaryArtist(a) && olderClose(a, x) && !nobodyLeft([a, x]));
      if (b) return b;
    }
    return null;
  };
  // Künstler mit mindestens 4 verschiedenen Alben im Pool (Voraussetzung für „Welches Album?“)
  const artistAlbums = new Map();
  for (const t of all) if (isAlbumTrack(t)) { const k = primaryArtist(t); if (!artistAlbums.has(k)) artistAlbums.set(k, new Set()); artistAlbums.get(k).add(albumLabel(t)); }
  const withRetry = (t, q) => { if (t && !q) used.delete(t.spotify_track_id); return q; };

  // 7.10 «Unter Freunden»: Personen mit Daten (nur Mitspielende), Songs nur einer Person (auch nicht in anderer Fassung)
  const inRoom = (m) => !players.length || players.includes(m);
  const songPeople = [...new Set(all.flatMap((t) => t.suppliers))].filter(inRoom);
  const songOwners = new Map();
  for (const t of all) { const k = `${primaryArtist(t)}|${titleLabel(t)}`; if (!songOwners.has(k)) songOwners.set(k, new Set()); for (const m of t.suppliers) songOwners.get(k).add(m); }
  const onlyOwner = (t) => t.suppliers.length === 1 && songOwners.get(`${primaryArtist(t)}|${titleLabel(t)}`).size === 1 && inRoom(t.suppliers[0]);
  const people = artistsByMember(artists, players), dataPeople = [...people.keys()];
  const usedArtists = new Set();
  const personOptions = (ids) => shuffle(ids, rng).map((member_id) => ({ member_id }));
  const artistInfo = (a) => ({ name: a.name, image_url: a.image_url });
  const friends = {
    whose: () => {
      if (songPeople.length < FRIENDS.minPeople) return null;
      const t = pick(onlyOwner); if (!t) return null;
      return {
        kind: "whose",
        prompt: { ...songInfo(t), cover_url: t.cover_url || null, options: personOptions(songPeople), play: { track_id: t.spotify_track_id, start_ms: startMs(t) } },
        solution: { member_ids: [t.suppliers[0]] },
        track_ids: [t.spotify_track_id],
      };
    },
    rank: () => {
      if (dataPeople.length < FRIENDS.minPeople) return null;
      for (const m of shuffle(dataPeople, rng)) {
        const own = [...people.get(m).values()].filter((a) => a.rank <= FRIENDS.rankMax && !usedArtists.has(a.id)
          && !dataPeople.some((o) => o !== m && people.get(o).get(a.id)?.rank === a.rank));   // Platz muss eindeutig sein
        if (!own.length) continue;
        const a = own[Math.floor(rng() * own.length)];
        usedArtists.add(a.id);
        return { kind: "rank", prompt: { artist: artistInfo(a), rank: a.rank, options: personOptions(dataPeople), play: null }, solution: { member_ids: [m] }, track_ids: [], sitting_out: [m] };
      }
      return null;
    },
    fans: () => {
      if (dataPeople.length < FRIENDS.minPeople) return null;
      const fansOf = new Map(), info = new Map();
      for (const [m, list] of people) for (const a of list.values()) { if (!fansOf.has(a.id)) { fansOf.set(a.id, []); info.set(a.id, a); } fansOf.get(a.id).push(m); }
      // nicht alle hören X; bevorzugt Künstler, die mehrere hören (spannender als «nur einer»)
      const open = [...fansOf].filter(([id, f]) => f.length < dataPeople.length && !usedArtists.has(id));
      const several = open.filter(([, f]) => f.length >= 2), from = several.length ? several : open;
      if (!from.length) return null;
      const [id, fans] = from[Math.floor(rng() * from.length)];
      usedArtists.add(id);
      return { kind: "fans", prompt: { artist: artistInfo(info.get(id)), options: personOptions(dataPeople), play: null }, solution: { member_ids: fans }, track_ids: [], sitting_out: [] };
    },
    common: () => {
      if (dataPeople.length < 2 || players.length < 3) return null;
      const top = FRIENDS.commonTop, pairs = [];
      for (let i = 0; i < dataPeople.length; i++) for (let j = i + 1; j < dataPeople.length; j++) pairs.push([dataPeople[i], dataPeople[j]]);
      for (const [a, b] of shuffle(pairs, rng)) {
        const la = people.get(a), lb = people.get(b), inTop = (l, id) => (l.get(id)?.rank ?? Infinity) <= top;
        const shared = [...la.values()].filter((x) => x.rank <= top && inTop(lb, x.id) && !usedArtists.has(x.id));
        if (!shared.length) continue;
        // Ablenker: in den Top 20 von A oder B, beim anderen gar nicht in den Top-Künstlern; abwechselnd aus beiden Listen
        const onlyA = shuffle([...la.values()].filter((x) => x.rank <= top && !lb.has(x.id)), rng);
        const onlyB = shuffle([...lb.values()].filter((x) => x.rank <= top && !la.has(x.id)), rng);
        const distractors = [];
        while (distractors.length < 3 && (onlyA.length || onlyB.length)) distractors.push(((distractors.length % 2 ? onlyB : onlyA).length ? (distractors.length % 2 ? onlyB : onlyA) : onlyA.length ? onlyA : onlyB).shift());
        if (distractors.length < 3) continue;
        const x = shared[Math.floor(rng() * shared.length)];
        usedArtists.add(x.id);
        const options = shuffle([x, ...distractors], rng);
        return {
          kind: "common",
          prompt: { members: [a, b], options: options.map(artistInfo), play: null },
          solution: { choice: options.indexOf(x) + 1, name: x.name, ranks: [la.get(x.id).rank, lb.get(x.id).rank] },
          track_ids: [], sitting_out: [a, b],
        };
      }
      return null;
    },
  };
  const build = {
    year: () => { const t = pick((x) => x.yearReliable); return t ? yearQuestion(t) : null; },
    older: () => {
      if (olderDone) return null;
      const a = pick((x) => x.yearReliable && Boolean(olderPartner(x))); if (!a) { olderDone = true; return null; }
      const b = olderPartner(a); used.add(b.spotify_track_id);
      return olderQuestion(a, b, rng);
    },
    cover: () => { const t = pick((x) => Boolean(x.cover_url) && Boolean(x.album)); return t ? withRetry(t, coverQuestion(t, all, rng)) : null; },
    intro: () => { const t = pick(() => true); return t ? withRetry(t, introQuestion(t, all, rng)) : null; },
    album: () => { const t = pick((x) => isAlbumTrack(x) && artistAlbums.get(primaryArtist(x)).size >= 4); return t ? withRetry(t, albumQuestion(t, all, rng)) : null; },
    ...friends,
  };

  const questions = [];
  const plan = [];
  if (!kinds.some((k) => build[k]) || count < 1) return questions;
  // «Unter Freunden»: Personen-Fragen doppelt im Plan → etwa zwei Drittel der Fragen sind über die Personen (wo möglich)
  while (plan.length < count) plan.push(...shuffle([...kinds, ...kinds.filter((k) => FRIEND_KINDS.includes(k))].filter((k) => build[k]), rng));
  for (let i = 0; questions.length < count && i < plan.length + count * kinds.length; i++) {
    const preferred = plan[i % plan.length];
    let q = null;
    for (const k of [preferred, ...shuffle(kinds.filter((x) => x !== preferred && build[x]), rng)]) { q = build[k](); if (q) break; }
    if (!q) break;   // Pool erschöpft
    lastArtist = primaryArtist(order.find((t) => t.spotify_track_id === q.track_ids[q.track_ids.length - 1]) || {});
    questions.push({ question_no: questions.length + 1, ...q, sitting_out: q.sitting_out ?? sittingOut(q.track_ids.map((id) => byId.get(id)), players) });
  }
  return questions;
}

// Alle Song-IDs einer gespeicherten Frage (Prompt + Lösung), z. B. um sie beim nächsten Quiz zu meiden
export function questionTrackIds(prompt, solution) {
  const ids = [prompt?.track_id, prompt?.play?.track_id, solution?.track_id, solution?.play?.track_id, ...(prompt?.options || []).map((o) => o?.track_id)];
  return [...new Set(ids.filter(Boolean))];
}

// Punkte (Roadmap 7.4, Entscheidung I: richtig + Tempo-Bonus, beim Jahr „je näher, desto mehr“).
// Punkte = Treffer × (500 + 500 × Tempo), auf 10 gerundet. Tempo = 1 bei sofortiger Antwort, 0 bei Ablauf der Zeit.
// Treffer: Auswahl-Fragen 1 (richtig) oder 0; Jahr 1 bei exakt, −0,25 pro Jahr daneben, ab 4 Jahren 0 (7.12, Entscheidung L).
// → richtig und sofort 1000, richtig in letzter Sekunde 500, Jahr 1 daneben nach halber Zeit 560.
export const QUIZ_SCORING = { base: 500, speedBonus: 500, yearStep: 0.25, limitMs: 20000 };

// memberId: wer geantwortet hat (nur für «Wer hört alles X?» nötig – die eigene Person zählt dort nicht)
export function answerAccuracy(kind, answer, solution, memberId = null) {
  if (!answer || !solution) return 0;
  if (kind === "year") {
    const diff = Math.abs(Number(answer.year) - Number(solution.year));
    return Number.isFinite(diff) ? Math.max(0, 1 - diff * QUIZ_SCORING.yearStep) : 0;
  }
  if (kind === "whose" || kind === "rank") return (solution.member_ids || []).includes(answer.member_id) ? 1 : 0;
  if (kind === "fans") return Array.isArray(answer.member_ids) ? fansAccuracy(answer.member_ids, solution.member_ids, memberId) : 0;
  return Number(answer.choice) === Number(solution.choice) ? 1 : 0;
}

export function scoreAnswer(kind, answer, solution, answerMs, limitMs = QUIZ_SCORING.limitMs, memberId = null) {
  const accuracy = answerAccuracy(kind, answer, solution, memberId);
  if (accuracy <= 0) return 0;
  const ms = Math.max(0, Number(answerMs) || 0), limit = Math.max(1, Number(limitMs) || QUIZ_SCORING.limitMs);
  const speed = Math.min(1, Math.max(0, 1 - ms / limit));
  return Math.round((accuracy * (QUIZ_SCORING.base + QUIZ_SCORING.speedBonus * speed)) / 10) * 10;
}
