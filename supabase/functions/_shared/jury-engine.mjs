// Jury-Engine (Roadmap 3.6): reine Funktion, keine Netzwerkzugriffe, deterministisch.
// Vergleicht zwei Song-Profile mit einem Themen-Profil nach den fünf Juror-Profilen (jurors.json)
// und liefert je Juror eine Scorecard. Gleichstand oder fehlende Daten → 10–10 (Entscheidung C).
import { normalizeText, keywordIndex, countKeywordHits, cleanTitle } from "./track-features.mjs";

export const ENGINE_VERSION = 1;

const clamp01 = (x) => Math.max(0, Math.min(1, x));
const round2 = (x) => Math.round(x * 100) / 100;
// Weiche Sättigung: mehr zählt mehr, aber mit abnehmendem Zuwachs (statt harter Kappung)
const saturate = (x, scale) => 1 - Math.exp(-Math.max(0, x) / scale);

// Tausendertrennzeichen nach Schweizer Art (’)
export function formatNumber(n) {
  return String(Math.round(Number(n))).replace(/\B(?=(\d{3})+(?!\d))/g, "’");
}

// Stabiler Hash (FNV-1a) für die deterministische Textauswahl
function hash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

function keywordWeight(config, kw) {
  const w = config.keyword_weights?.[kw];
  return typeof w === "number" ? w : 1;
}

function themeKeywordIndex(theme) {
  return keywordIndex({ categories: [{ themes: [theme] }] });
}

function songTags(song) {
  return (Array.isArray(song?.tags) ? song.tags : []).map((t) => normalizeText(t?.name)).filter(Boolean);
}

function listeners(song) {
  const v = song?.lastfm_listeners ?? song?.lb_user_count;
  return v === null || v === undefined ? null : Number(v);
}

// --- Merkmale je Song (0–1 oder null = keine Daten) ---------------------------------------------

export function computeFeatures(song, theme, config, year) {
  const index = themeKeywordIndex(theme);
  const lf = song?.lyrics_features ?? {};
  const hasLyrics = Boolean(lf.has_lyrics) && Number(lf.word_count) > 0;
  const tags = songTags(song);
  const f = {};
  const facts = {};

  // Titel
  const titleHits = countKeywordHits(cleanTitle(song?.title) || song?.title, index);
  const titleSum = Object.entries(titleHits).reduce((s, [k, n]) => s + n * keywordWeight(config, k), 0);
  f.title_keywords = index.length ? saturate(titleSum, 1) : null;
  facts.title_hits = Object.keys(titleHits);

  // Lyrics: nur Schlüsselwörter dieses Themas, gewichtet, pro 100 Wörter
  if (hasLyrics && index.length) {
    const hits = lf.keyword_hits ?? {};
    let sum = 0;
    const found = [];
    for (const { key } of index) {
      const n = Number(hits[key] || 0);
      if (n > 0) { sum += n * keywordWeight(config, key); found.push([key, n]); }
    }
    const per100 = (sum / Math.max(Number(lf.word_count), 100)) * 100;
    f.lyrics_keywords = saturate(per100, 3);
    facts.lyrics_hits = found.sort((a, b) => b[1] - a[1]);
    facts.lyrics_hit_total = found.reduce((s, [, n]) => s + n, 0);
  } else {
    f.lyrics_keywords = null;
  }
  f.lyrics_density = hasLyrics ? clamp01(Number(lf.word_count) / 450) : null;
  facts.word_count = hasLyrics ? Number(lf.word_count) : null;

  // Tags gegen Themen-Tags
  if (tags.length && theme?.tags?.length) {
    const matched = theme.tags.filter((tt) => tags.some((st) => st === tt || st.includes(tt) || tt.includes(st)));
    f.tag_match = clamp01(matched.length / Math.min(3, theme.tags.length));
    facts.tag_hits = matched;
  } else {
    f.tag_match = null;
  }
  f.tag_depth = tags.length ? clamp01(new Set(tags).size / 8) : null;

  // Energie aus Tags
  const high = config.energy_tags?.high ?? [], low = config.energy_tags?.low ?? [];
  const hi = tags.filter((t) => high.some((h) => t === h || t.includes(h))).length;
  const lo = tags.filter((t) => low.some((l) => t === l || t.includes(l))).length;
  if ((hi + lo) > 0 && theme?.energy) {
    const e = (hi - lo) / (hi + lo);
    const target = theme.energy === "high" ? 1 : theme.energy === "low" ? -1 : 0;
    f.energy_match = clamp01(1 - Math.abs(e - target) / 2);
    facts.energy = e > 0.33 ? "hoch" : e < -0.33 ? "tief" : "mittel";
  } else {
    f.energy_match = null;
  }

  // Jahr / Ära / Alter
  const y = song?.release_year ? Number(song.release_year) : null;
  facts.year = y;
  if (theme?.era && y) {
    const { from, to } = theme.era;
    f.era_match = y >= from && y <= to ? 1 : (y >= from - 1 && y <= to + 1 ? 0.4 : 0);
  } else {
    f.era_match = null;
  }
  f.age = y ? clamp01((year - y) / 20) : null;

  // Bekanntheit
  const l = listeners(song);
  f.obscurity = l === null ? null : clamp01(1 - Math.log10(l + 1) / 6.5);
  facts.listeners = l;

  // Albumtyp
  const at = String(song?.album_type || "").toLowerCase();
  f.album_track = at === "album" ? 1 : at === "compilation" ? 0.5 : at === "single" ? 0 : null;
  facts.album_type = at || null;

  return { features: f, facts };
}

// Thematische Passung (Mittel der vorhandenen Themen-Merkmale) – für Snoop Underdoggs theme_gate
function themeFit(f) {
  const vals = ["title_keywords", "lyrics_keywords", "tag_match", "era_match"].map((k) => f[k]).filter((v) => v !== null && v !== undefined);
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
}

function hasData(kind, song, f) {
  if (kind === "lyrics") return f.lyrics_density !== null;
  if (kind === "tags") return f.tag_depth !== null;
  if (kind === "popularity") return f.obscurity !== null;
  if (kind === "release_year") return f.age !== null;
  return false;
}

function requirementsMet(juror, songA, songB, fa, fb) {
  const both = juror.requires.map((r) => hasData(r, songA, fa) && hasData(r, songB, fb));
  return juror.requires_mode === "all" ? both.every(Boolean) : both.some(Boolean);
}

// --- Fakten-Texte ------------------------------------------------------------------------------

const ALBUM_TYPE_DE = { album: "Albumtrack", single: "Single", compilation: "Compilation-Track" };

function factText(feature, side, other, names) {
  const [w, l] = names;
  switch (feature) {
    case "title_keywords":
      return side.facts.title_hits.length ? `der Titel „${w}“ trifft schon das Motiv (${side.facts.title_hits.slice(0, 3).join(", ")})` : null;
    case "lyrics_keywords": {
      const n = side.facts.lyrics_hit_total || 0, m = other.facts.lyrics_hit_total || 0;
      if (!n) return null;
      const words = (side.facts.lyrics_hits || []).slice(0, 3).map(([k]) => k).join(", ");
      return `${n} passende Motive im Text (${words})${m ? `, bei „${l}“ nur ${m}` : `, bei „${l}“ keine`}`;
    }
    case "tag_match":
      return side.facts.tag_hits?.length ? `Tags wie ${side.facts.tag_hits.slice(0, 3).join(", ")}` : null;
    case "energy_match":
      return side.facts.energy ? `Energie ${side.facts.energy}${other.facts.energy ? ` statt ${other.facts.energy}` : ""}` : null;
    case "era_match":
      return side.facts.year ? `Release ${side.facts.year}${other.facts.year ? ` gegenüber ${other.facts.year}` : ""}` : null;
    case "lyrics_density":
      return side.facts.word_count ? `${formatNumber(side.facts.word_count)} Wörter Text${other.facts.word_count ? ` gegenüber ${formatNumber(other.facts.word_count)}` : ""}` : null;
    case "obscurity":
      return side.facts.listeners !== null && other.facts.listeners !== null ? `${formatNumber(side.facts.listeners)} gegenüber ${formatNumber(other.facts.listeners)} Hörern` : null;
    case "album_track":
      return side.facts.album_type ? `${ALBUM_TYPE_DE[side.facts.album_type] || side.facts.album_type}${other.facts.album_type && other.facts.album_type !== side.facts.album_type ? ` statt ${ALBUM_TYPE_DE[other.facts.album_type] || other.facts.album_type}` : ""}` : null;
    case "age":
      return side.facts.year ? `aus ${side.facts.year}` : null;
    case "tag_depth":
      return null;
    default:
      return null;
  }
}

// Neutraler Vergleich beider Werte für 10–10-Begründungen („3 zu 4 passende Motive im Text“)
function tieFactText(feature, A, B) {
  const a = A.facts, b = B.facts;
  switch (feature) {
    case "lyrics_keywords": return (a.lyrics_hit_total || b.lyrics_hit_total) ? `${a.lyrics_hit_total || 0} zu ${b.lyrics_hit_total || 0} passende Motive im Text` : null;
    case "lyrics_density": return a.word_count && b.word_count ? `${formatNumber(a.word_count)} zu ${formatNumber(b.word_count)} Wörter Text` : null;
    case "obscurity": return a.listeners !== null && b.listeners !== null ? `${formatNumber(a.listeners)} zu ${formatNumber(b.listeners)} Hörer` : null;
    case "era_match": case "age": return a.year && b.year ? `Release ${a.year} und ${b.year}` : null;
    case "tag_match": return (a.tag_hits?.length || b.tag_hits?.length) ? `${a.tag_hits?.length || 0} zu ${b.tag_hits?.length || 0} passende Tags` : null;
    case "energy_match": return a.energy && b.energy ? `Energie ${a.energy} und ${b.energy}` : null;
    case "album_track": return a.album_type && b.album_type ? `${ALBUM_TYPE_DE[a.album_type] || a.album_type} und ${ALBUM_TYPE_DE[b.album_type] || b.album_type}` : null;
    default: return null;
  }
}

function fill(template, values) {
  return template.replace(/\{(\w+)\}/g, (_, k) => (values[k] ?? ""));
}

function pick(list, seed) {
  return list[hash(seed) % list.length];
}

// --- Hauptfunktion -------------------------------------------------------------------------------

/**
 * @param {object} songA  Song-Profil A (Zeile aus mb_track_profiles oder gleich aufgebautes Objekt)
 * @param {object} songB  Song-Profil B
 * @param {object} theme  Themen-Profil aus themes.json (inkl. theme, tags, keywords, energy, era)
 * @param {object} config Inhalt von jurors.json
 * @param {object} [opts] { year: aktuelles Jahr (Standard: Jahr von Date.now) }
 * @returns {Array} 5 Scorecards { key, name, role, score_a, score_b, verdict: "a"|"b"|"tie", weak, reason, facts, points }
 */
export function scoreRound(songA, songB, theme, config, opts = {}) {
  const year = opts.year ?? new Date().getFullYear();
  const A = computeFeatures(songA, theme, config, year);
  const B = computeFeatures(songB, theme, config, year);
  const titleA = songA?.title || "Song A", titleB = songB?.title || "Song B";
  const eps = config.tie_epsilon ?? 0.15;

  return config.jurors.map((juror) => {
    const seed = `${juror.key}|${songA?.spotify_track_id || titleA}|${songB?.spotify_track_id || titleB}|${theme?.id || theme?.theme}`;
    const base = { key: juror.key, name: juror.name, role: juror.role };

    if (!requirementsMet(juror, songA, songB, A.features, B.features)) {
      return { ...base, score_a: 10, score_b: 10, verdict: "tie", weak: true, reason: fill(pick(juror.texts.weak, seed), { theme: theme?.theme }), facts: [], points: { a: null, b: null } };
    }

    // Nur Merkmale, die für beide Songs vorhanden sind
    let pa = 0, pb = 0;
    const contrib = [];
    for (const [feature, weight] of Object.entries(juror.weights)) {
      const va = A.features[feature], vb = B.features[feature];
      if (va === null || va === undefined || vb === null || vb === undefined) continue;
      pa += weight * va; pb += weight * vb;
      contrib.push({ feature, diff: weight * (va - vb) });
    }
    pa = round2(pa); pb = round2(pb);
    const diff = pa - pb;

    if (Math.abs(diff) < eps) {
      const facts = contrib.map((c) => tieFactText(c.feature, A, B)).filter(Boolean).slice(0, 2).join(", ") || "kein Song hebt sich ab";
      return { ...base, score_a: 10, score_b: 10, verdict: "tie", weak: false, reason: fill(pick(juror.texts.tie, seed), { theme: theme?.theme, facts }), facts: [facts], points: { a: pa, b: pb } };
    }

    let winner = diff > 0 ? "a" : "b";
    let kind = "win";

    // Snoop Underdogg: der kleinere Song gewinnt nur, wenn er thematisch genug mithält
    if (juror.theme_gate) {
      const fitA = themeFit(A.features), fitB = themeFit(B.features);
      const obscureSide = (A.features.obscurity ?? 0) >= (B.features.obscurity ?? 0) ? "a" : "b";
      const fitW = winner === "a" ? fitA : fitB, fitL = winner === "a" ? fitB : fitA;
      if (winner === obscureSide && fitW !== null && fitL !== null && fitL > 0 && fitW < juror.theme_gate * fitL) {
        winner = winner === "a" ? "b" : "a";
        kind = "win_gate";
      }
    }

    const W = winner === "a" ? A : B, L = winner === "a" ? B : A;
    const names = winner === "a" ? [titleA, titleB] : [titleB, titleA];
    const margin = Math.abs(diff);
    const clear = kind === "win" && margin >= juror.margins.clear;

    // Fakten: die Merkmale, die am stärksten für den Gewinner sprechen
    const sign = winner === "a" ? 1 : -1;
    const factList = contrib
      .filter((c) => c.diff * sign > 0)
      .sort((x, y) => Math.abs(y.diff) - Math.abs(x.diff))
      .map((c) => factText(c.feature, W, L, names))
      .filter(Boolean)
      .slice(0, 2);

    // Ära-Themen: eigener Text, wenn das Jahr den Ausschlag gibt
    const top = contrib.filter((c) => c.diff * sign > 0).sort((x, y) => Math.abs(y.diff) - Math.abs(x.diff))[0];
    if (kind === "win" && top?.feature === "era_match" && juror.texts.win_era) kind = "win_era";

    let winnerValue = "", loserValue = "";
    if (kind === "win_era") { winnerValue = String(W.facts.year ?? "unbekannt"); loserValue = String(L.facts.year ?? "unbekannt"); }
    if (juror.key === "underdog" && W.facts.listeners !== null && L.facts.listeners !== null) { winnerValue = formatNumber(W.facts.listeners); loserValue = formatNumber(L.facts.listeners); }
    const templates = juror.texts[kind]?.length ? juror.texts[kind] : juror.texts.win;
    // Underdog-Text mit Hörerzahlen nur, wenn der Gewinner wirklich der kleinere ist
    const usable = juror.key === "underdog" && kind === "win" && !(W.facts.listeners !== null && L.facts.listeners !== null && W.facts.listeners < L.facts.listeners)
      ? templates.filter((t) => !t.includes("{winner_value}"))
      : templates;
    const reason = fill(pick(usable.length ? usable : templates, seed), {
      winner: names[0], loser: names[1], theme: theme?.theme,
      facts: factList.length ? factList.join("; ") : "die Daten sprechen knapp dafür",
      winner_value: winnerValue, loser_value: loserValue,
    });

    return {
      ...base,
      score_a: winner === "a" ? 10 : (clear ? 8 : 9),
      score_b: winner === "b" ? 10 : (clear ? 8 : 9),
      verdict: winner, weak: false, reason, facts: factList, points: { a: pa, b: pb },
    };
  });
}

// Gesamtergebnis der Jury: Summe der Punkte; Gleichstand → kein automatischer Sieger (Entscheidung C)
export function juryTotal(cards) {
  const a = cards.reduce((s, c) => s + c.score_a, 0), b = cards.reduce((s, c) => s + c.score_b, 0);
  return { a, b, winner: a === b ? null : a > b ? 1 : 2 };
}
