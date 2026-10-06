// Tests für die reinen Song-Profil-Funktionen (Roadmap 3.3). Ausführen im Repo-Root: node --test
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { normalizeText, detectLanguage, keywordIndex, countKeywordHits, lyricsFeatures, releaseYear, earliestYear, mergeTags, cleanTitle, primaryArtist, sameArtist } from "../supabase/functions/_shared/track-features.mjs";

const themes = JSON.parse(fs.readFileSync(new URL("../supabase/functions/_shared/themes.json", import.meta.url), "utf8"));
const index = keywordIndex(themes);

test("normalizeText: klein, Satzzeichen weg, Umlaute bleiben", () => {
  assert.equal(normalizeText("Nachts, in der STADT!  Lichter…"), "nachts in der stadt lichter");
  assert.equal(normalizeText("Müde – über Grüße"), "müde über grüße");
  assert.equal(normalizeText("Can’t tell me"), "can't tell me");
  assert.equal(normalizeText(null), "");
});

test("detectLanguage erkennt Deutsch, Englisch, gemischt und zu wenig Text", () => {
  const de = "Ich fahre durch die Stadt und du bist nicht hier, ich weiss nicht was ich mit mir machen soll, wir sind immer noch auf der Strasse und alles ist jetzt anders";
  const en = "I drive through the city and you are not here, I don't know what to do with my life, we are on the road and it is just like that, all the lights";
  assert.equal(detectLanguage(de), "de");
  assert.equal(detectLanguage(en), "en");
  assert.equal(detectLanguage("kurz"), null);
  const mixed = de + " " + en;
  assert.equal(detectLanguage(mixed), "mixed");
});

test("keywordIndex: eindeutig über beide Sprachen, enthält Phrasen", () => {
  const keys = index.map(k => k.key);
  assert.equal(new Set(keys).size, keys.length);
  assert.ok(keys.includes("nacht"));
  assert.ok(keys.includes("night"));
  assert.ok(keys.includes("nummer eins"));
  assert.equal(keys.filter(k => k === "baby").length, 1, "„baby“ steht in DE und EN, zählt aber nur einmal");
  assert.ok(!keys.includes("die"), "zweideutiges „die“ darf kein Schlüsselwort sein");
});

test("countKeywordHits zählt ganze Wörter und Phrasen, keine Teilwörter", () => {
  const hits = countKeywordHits("Nacht, Nacht, Nachtschicht. Ich bin die Nummer eins in der Stadt", index);
  assert.equal(hits["nacht"], 2, "„Nachtschicht“ darf nicht als „nacht“ zählen");
  assert.equal(hits["nummer eins"], 1);
  assert.equal(hits["stadt"], 1);
  assert.equal(hits["die"], undefined);
  assert.equal(countKeywordHits("baby baby", index)["baby"], 2, "kein Doppelzählen über Sprachen");
  assert.deepEqual(countKeywordHits("", index), {});
});

test("lyricsFeatures liefert nur abgeleitete Werte, keinen Text", () => {
  const text = "Midnight city lights, we drive all night, the night is young and you are mine, I don't know what to say but we ride, ride, ride";
  const f = lyricsFeatures({ plainLyrics: text, instrumental: false }, themes);
  assert.equal(f.has_lyrics, true);
  assert.equal(f.language, "en");
  assert.equal(f.word_count, 26);
  assert.equal(f.keyword_hits["night"], 2);
  assert.equal(f.keyword_hits["midnight"], 1);
  assert.equal(f.keyword_hits["ride"], 3);
  assert.ok(!JSON.stringify(f).includes("young"), "kein Liedtext im Ergebnis");
  const none = lyricsFeatures({ plainLyrics: "", instrumental: true }, themes);
  assert.deepEqual({ ...none, keywords_version: undefined }, { has_lyrics: false, instrumental: true, language: null, word_count: 0, keyword_hits: {}, keywords_version: undefined });
});

test("releaseYear und earliestYear", () => {
  assert.equal(releaseYear("2012-05-01"), 2012);
  assert.equal(releaseYear("05/1998"), 1998);
  assert.equal(releaseYear(""), null);
  assert.equal(earliestYear("2019-01-01", "2012", null), 2012);
  assert.equal(earliestYear(null, undefined), null);
});

test("mergeTags: normalisiert, ohne Duplikate je Quelle, Quelle Pflicht", () => {
  const tags = mergeTags(
    [{ name: "Hip-Hop", count: 10, source: "lastfm" }, { name: "hip hop", count: 3, source: "lastfm" }, { name: "Night", count: "5", source: "lastfm" }],
    [{ name: "hip hop", count: 2, source: "listenbrainz" }, { name: "ohne quelle", count: 1 }]
  );
  assert.deepEqual(tags, [
    { name: "hip hop", count: 10, source: "lastfm" },
    { name: "night", count: 5, source: "lastfm" },
    { name: "hip hop", count: 2, source: "listenbrainz" },
  ]);
});

test("cleanTitle entfernt Feature-Zusätze", () => {
  assert.equal(cleanTitle("Cold Shoulder (feat. Don Toliver & Yebba)"), "Cold Shoulder");
  assert.equal(cleanTitle("KAT [with La Rvfleuze]"), "KAT");
  assert.equal(cleanTitle("Song - feat. X"), "Song");
  assert.equal(cleanTitle("Mood Swings"), "Mood Swings");
  assert.equal(cleanTitle("Ft. Lauderdale (Live)"), "Ft. Lauderdale (Live)", "nur echte Feature-Klammern entfernen");
});

test("primaryArtist und sameArtist", () => {
  assert.equal(primaryArtist("Drake, Don Toliver, Yebba"), "Drake");
  assert.equal(primaryArtist("Eno & KARDO"), "Eno");
  assert.equal(primaryArtist("Gazo feat. Tiakola"), "Gazo");
  assert.equal(primaryArtist("LUCKI"), "LUCKI");
  assert.ok(sameArtist("Lucki", "LUCKI"));
  assert.ok(sameArtist("Pop Smoke", "Pop Smoke, Lil Tjay"));
  assert.ok(!sameArtist("Lucky Dube", "LUCKI"));
  assert.ok(!sameArtist("", "X"));
});
