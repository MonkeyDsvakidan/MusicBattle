// Tests für die Jury-Engine (Roadmap 3.6). Ausführen im Repo-Root: node --test
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { scoreRound, juryTotal, computeFeatures, formatNumber } from "../supabase/functions/_shared/jury-engine.mjs";
import { lyricsFeatures } from "../supabase/functions/_shared/track-features.mjs";

const read = (f) => JSON.parse(fs.readFileSync(new URL(`../supabase/functions/_shared/${f}`, import.meta.url), "utf8"));
const themes = read("themes.json");
const config = read("jurors.json");
const theme = (id) => themes.categories.flatMap((c) => c.themes).find((t) => t.id === id);
const YEAR = 2026;

function song(over = {}, lyrics = null) {
  return {
    spotify_track_id: over.id || over.title,
    title: "Song", release_year: 2019, album_type: "single", lastfm_listeners: 50000,
    tags: [{ name: "hip hop", source: "lastfm" }],
    lyrics_features: lyrics === null ? { has_lyrics: false, word_count: 0, keyword_hits: {} } : lyricsFeatures({ plainLyrics: lyrics }, themes),
    ...over,
  };
}
const filler = (n) => Array.from({ length: n }, (_, i) => ["and", "the", "you", "we", "on", "it"][i % 6]).join(" ");
const byKey = (cards) => Object.fromEntries(cards.map((c) => [c.key, c]));
const validScore = (c) => (c.score_a === 10 && [8, 9, 10].includes(c.score_b)) || (c.score_b === 10 && [8, 9].includes(c.score_a));

test("Nachtfahrt: Song mit Nacht-Motiven gewinnt Themen- und Lyrics-Juror, Fakten nennen echte Werte", () => {
  const night = theme("nachtfahrt-grossstadt");
  const a = song({ title: "Midnight Drive", tags: [{ name: "night", source: "lastfm" }, { name: "driving", source: "lastfm" }, { name: "chill", source: "lastfm" }] },
    "midnight city lights we drive through the night the night is ours city lights " + filler(80));
  const b = song({ title: "Sonntag", tags: [{ name: "happy", source: "lastfm" }, { name: "party", source: "lastfm" }] },
    "sonntag morgen kaffee im bett " + filler(80));
  const cards = byKey(scoreRound(a, b, night, config, { year: YEAR }));
  assert.equal(cards.theme.verdict, "a");
  assert.equal(cards.lyrics.verdict, "a");
  assert.equal(cards.vibe.verdict, "a");
  assert.match(cards.lyrics.reason, /Midnight Drive/);
  assert.match(cards.lyrics.reason, /passende Motive im Text/);
  assert.ok(!/undefined|null|NaN/.test(Object.values(cards).map((c) => c.reason).join(" ")), "keine leeren Platzhalter");
});

test("Fehlende Lyrics bei einem Song: Lyricboss sagt „zu wenig Daten“ (10–10) statt A automatisch zu bevorzugen", () => {
  const night = theme("nachtfahrt-grossstadt");
  const a = song({ title: "Mit Text" }, "night night city lights " + filler(60));
  const b = song({ title: "Ohne Text" });
  const lyr = byKey(scoreRound(a, b, night, config, { year: YEAR })).lyrics;
  assert.equal(lyr.verdict, "tie");
  assert.equal(lyr.weak, true);
  assert.equal(lyr.score_a, 10);
  assert.equal(lyr.score_b, 10);
  assert.match(lyr.reason, /10–10/);
});

test("Gleiche Profile: alle Juroren 10–10, kein Münzwurf", () => {
  const night = theme("nachtfahrt-grossstadt");
  const a = song({ title: "Gleich", id: "x1" }, "night city " + filler(60));
  const b = song({ title: "Gleich", id: "x2" }, "night city " + filler(60));
  const cards = scoreRound(a, b, night, config, { year: YEAR });
  for (const c of cards) {
    assert.equal(c.verdict, "tie", c.key);
    assert.equal(c.score_a + c.score_b, 20, c.key);
  }
  assert.equal(juryTotal(cards).winner, null);
});

test("Zeitmaschine 2012: Release-Jahr entscheidet, Text nennt die Jahre", () => {
  const t = theme("2012-banger");
  const a = song({ title: "Alt", release_year: 2012 });
  const b = song({ title: "Neu", release_year: 2019 });
  const c = byKey(scoreRound(a, b, t, config, { year: YEAR })).theme;
  assert.equal(c.verdict, "a");
  assert.match(c.reason, /2012/);
  assert.match(c.reason, /2019/);
  assert.equal(c.score_b, 8, "klarer Ära-Entscheid = 10–8");
});

test("Snoop Underdogg: kleiner Song gewinnt mit Hörerzahlen im Text", () => {
  const t = theme("street-anthem");
  const small = song({ title: "Klein", lastfm_listeners: 1200, tags: [{ name: "street", source: "lastfm" }] }, "block hood strasse " + filler(60));
  const big = song({ title: "Gross", lastfm_listeners: 4800000, tags: [{ name: "street", source: "lastfm" }] }, "block hood strasse " + filler(60));
  const c = byKey(scoreRound(small, big, t, config, { year: YEAR })).underdog;
  assert.equal(c.verdict, "a");
  assert.match(c.reason, /1’200/);
  assert.match(c.reason, /4’800’000/);
});

test("Snoop Underdogg: Themen-Schwelle – thematisch klar schwächerer Underdog verliert", () => {
  const t = theme("street-anthem");
  const small = song({ title: "Klein ohne Thema", lastfm_listeners: 900, tags: [{ name: "sad", source: "lastfm" }] }, "sonne kaffee bett " + filler(60));
  const big = song({ title: "Gross mit Thema", lastfm_listeners: 3000000, tags: [{ name: "street", source: "lastfm" }, { name: "gangsta rap", source: "lastfm" }] }, "block hood strasse ghetto viertel " + filler(60));
  const c = byKey(scoreRound(small, big, t, config, { year: YEAR })).underdog;
  assert.equal(c.verdict, "b");
  assert.match(c.reason, /passt thematisch zu wenig/);
});

test("Allgemeine Wörter zählen wenig: viele „now“ schlagen echte Motive nicht", () => {
  const t = theme("alles-oder-nichts");
  const generic = song({ title: "Generisch" }, Array(12).fill("now").join(" ") + " " + filler(60));
  const real = song({ title: "Echt" }, "chance finale sieg chance " + filler(60));
  const c = byKey(scoreRound(generic, real, t, config, { year: YEAR })).lyrics;
  assert.equal(c.verdict, "b");
});

test("Deterministisch und spiegelbar", () => {
  const night = theme("nachtfahrt-grossstadt");
  const a = song({ title: "A", id: "a", lastfm_listeners: 3000, tags: [{ name: "night", source: "lastfm" }] }, "night city lights drive " + filler(100));
  const b = song({ title: "B", id: "b", lastfm_listeners: 900000, album_type: "album", release_year: 2008 }, "love baby " + filler(200));
  const r1 = scoreRound(a, b, night, config, { year: YEAR });
  assert.deepEqual(scoreRound(a, b, night, config, { year: YEAR }), r1);
  const mirrored = byKey(scoreRound(b, a, night, config, { year: YEAR }));
  for (const c of r1) {
    const m = mirrored[c.key];
    assert.equal(m.score_a, c.score_b, c.key);
    assert.equal(m.score_b, c.score_a, c.key);
  }
});

test("Alle Scorecards haben gültige Punkte und Begründungen ohne leere Platzhalter", () => {
  const t = theme("herzschmerz");
  const cases = [
    [song({ title: "X" }, "heart broken tears " + filler(50)), song({ title: "Y" }, "money rich " + filler(50))],
    [song({ title: "X", tags: [] }), song({ title: "Y", tags: [] })],
    [song({ title: "X", lastfm_listeners: null }), song({ title: "Y", lastfm_listeners: null, release_year: null })],
  ];
  for (const [a, b] of cases) {
    const cards = scoreRound(a, b, t, config, { year: YEAR });
    assert.equal(cards.length, 5);
    for (const c of cards) {
      assert.ok(validScore(c), `${c.key}: ${c.score_a}–${c.score_b}`);
      assert.ok(c.reason.length > 10 && !/\{|undefined|null|NaN/.test(c.reason), `${c.key}: ${c.reason}`);
    }
  }
});

test("Merkmale: Energie aus Tags und Ära-Toleranz", () => {
  const t = theme("90er-party");
  const f = computeFeatures(song({ release_year: 2000, tags: [{ name: "party", source: "lastfm" }, { name: "dance", source: "lastfm" }] }), t, config, YEAR).features;
  assert.equal(f.era_match, 0.4, "ein Jahr daneben = 0.4");
  assert.equal(f.energy_match, 1, "Party-Tags passen zu hoher Energie");
  assert.equal(formatNumber(1234567), "1’234’567");
});

test("Gleichstand-Begründung vergleicht beide Werte neutral", () => {
  const night = theme("nachtfahrt-grossstadt");
  const a = song({ title: "A", id: "ta", lastfm_listeners: 10000 }, "night city " + filler(80));
  const b = song({ title: "B", id: "tb", lastfm_listeners: 10500 }, "night city " + filler(82));
  const c = byKey(scoreRound(a, b, night, config, { year: YEAR })).lyrics;
  assert.equal(c.verdict, "tie");
  assert.match(c.reason, /2 zu 2 passende Motive im Text/);
  assert.ok(!/nur|keine/.test(c.reason), "keine wertenden Wörter bei Gleichstand");
});
