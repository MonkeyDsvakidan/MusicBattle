// Reine Funktionen für Song-Profile (Roadmap 3.3). Ohne Netz, ohne Seiteneffekte –
// genutzt von der Edge Function mb-track-profile (Deno) und getestet mit node --test.

// Version der Profil-Logik. Erhöhen, wenn sich die Berechnung ändert → Profile werden neu erstellt.
export const PROFILE_VERSION = 2;

// Häufige Funktionswörter zur groben Spracherkennung (keine Themen-Schlüsselwörter)
const STOP_DE = new Set(["und", "ich", "nicht", "der", "das", "ist", "du", "mit", "auf", "für", "wir", "ein", "eine", "mein", "meine", "dich", "mich", "mir", "dir", "nur", "auch", "noch", "wie", "was", "bin", "bist", "sind", "kein", "keine", "wenn", "aber", "oder", "weil", "immer", "alles", "jetzt", "hab", "habe"]);
const STOP_EN = new Set(["the", "and", "you", "me", "my", "it", "to", "is", "that", "on", "for", "we", "your", "with", "all", "like", "just", "what", "this", "they", "i'm", "im", "don't", "dont", "can't", "got", "get", "know", "when", "but", "be", "are", "was", "she", "he", "her", "his"]);

// Kleinschreibung, Unicode-normalisiert, alles ausser Buchstaben/Ziffern/Apostroph → Leerzeichen
export function normalizeText(text) {
  return String(text ?? "")
    .normalize("NFC")
    .toLowerCase()
    .replace(/[’`´]/g, "'")
    .replace(/[^\p{L}\p{N}']+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function words(text) {
  const n = normalizeText(text);
  return n ? n.split(" ") : [];
}

// "de" | "en" | "mixed" | null (zu wenig Text)
export function detectLanguage(text) {
  const ws = words(text);
  if (ws.length < 20) return null;
  let de = 0, en = 0;
  for (const w of ws) {
    if (STOP_DE.has(w)) de++;
    if (STOP_EN.has(w)) en++;
  }
  if (de + en < 5) return null;
  if (de >= en * 2) return "de";
  if (en >= de * 2) return "en";
  return "mixed";
}

// Alle Schlüsselwörter aus themes.json, eindeutig (DE und EN zusammengeführt, da zweideutige
// Wörter ausgeschlossen sind; „baby“ in beiden Listen zählt nur einmal): [{ keyword, key }]
export function keywordIndex(themes) {
  const seen = new Map();
  for (const cat of themes.categories) {
    for (const t of cat.themes) {
      for (const lang of ["de", "en"]) {
        for (const kw of t.keywords?.[lang] ?? []) {
          const norm = normalizeText(kw);
          if (norm && !seen.has(norm)) seen.set(norm, { keyword: norm, key: norm });
        }
      }
    }
  }
  return [...seen.values()];
}

// Zählt ganze Wörter bzw. Phrasen (Wortgrenzen) im normalisierten Text.
// Ergebnis nur mit Treffern > 0: { "nacht": 3, "night": 1 }
export function countKeywordHits(text, index) {
  const padded = ` ${normalizeText(text)} `;
  const hits = {};
  if (padded.trim() === "") return hits;
  for (const { keyword, key } of index) {
    let count = 0, from = 0;
    const needle = ` ${keyword} `;
    for (;;) {
      const i = padded.indexOf(needle, from);
      if (i < 0) break;
      count++;
      from = i + needle.length - 1; // überlappende Leerzeichen erlauben
    }
    if (count > 0) hits[key] = count;
  }
  return hits;
}

// Abgeleitete Lyrics-Merkmale – der Text selbst wird nicht zurückgegeben
export function lyricsFeatures({ plainLyrics, instrumental }, themes) {
  const text = String(plainLyrics ?? "");
  const hasLyrics = text.trim().length > 0;
  return {
    has_lyrics: hasLyrics,
    instrumental: Boolean(instrumental),
    language: hasLyrics ? detectLanguage(text) : null,
    word_count: hasLyrics ? words(text).length : 0,
    keyword_hits: hasLyrics ? countKeywordHits(text, keywordIndex(themes)) : {},
    keywords_version: themes.version ?? null,
  };
}

// Erstes Jahr 1900–2099 aus einem Datum wie "2012-05-01", "2012" oder "05/2012"
export function releaseYear(value) {
  const m = String(value ?? "").match(/(?:19|20)\d{2}/);
  return m ? Number(m[0]) : null;
}

// Frühestes plausibles Jahr aus mehreren Quellen (Spotify nennt oft Re-Releases)
export function earliestYear(...values) {
  const years = values.map(releaseYear).filter(y => y !== null && y >= 1900 && y <= 2100);
  return years.length ? Math.min(...years) : null;
}

// Tags zusammenführen: [{ name, count, source }], klein, ohne Duplikate je Quelle, max. 30
export function mergeTags(...lists) {
  const out = [];
  const seen = new Set();
  for (const list of lists) {
    for (const t of list ?? []) {
      const name = normalizeText(t?.name).slice(0, 60);
      if (!name || !t?.source) continue;
      const key = `${t.source}:${name}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ name, count: Number.isFinite(Number(t.count)) ? Number(t.count) : null, source: t.source });
    }
  }
  return out.slice(0, 30);
}

// Titel ohne Zusätze wie „(feat. X)“, „[with Y]“, „- feat. Z“ – für die Suche in Lyrics-/Tag-Quellen
export function cleanTitle(title) {
  return String(title ?? "")
    .replace(/\s*[([](?:feat|ft|with|featuring)\.?\s[^)\]]*[)\]]/gi, "")
    .replace(/\s+-\s+(?:feat|ft|featuring)\.?\s.*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Erster Künstler aus „A, B & C“ / „A feat. B“ / „A x B“ (Ersatz, wenn kein Draft-Künstler bekannt ist)
export function primaryArtist(name) {
  const s = String(name ?? "").trim();
  const first = s.split(/\s*,\s*|\s+&\s+|\s+(?:feat|ft|featuring)\.?\s+|\s+x\s+/i)[0];
  return (first || s).trim();
}

// Passt ein von einer Quelle gemeldeter Künstler zum gesuchten? (Schutz vor Namensvettern)
export function sameArtist(found, wanted) {
  const a = normalizeText(found), b = normalizeText(wanted);
  if (!a || !b) return false;
  return a === b || a.includes(b) || b.includes(a);
}
