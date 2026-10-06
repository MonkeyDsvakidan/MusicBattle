// Prüft die Themen-Profile (Roadmap 3.1). Ausführen im Repo-Root: node --test
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const data = JSON.parse(fs.readFileSync(path.join(__dirname, "../supabase/functions/_shared/themes.json"), "utf8"));
const all = data.categories.flatMap(c => c.themes.map(t => ({ ...t, category: c.name, sudden: Boolean(c.sudden) })));

// Wörter, die auf Deutsch und Englisch Verschiedenes bedeuten – als Schlüsselwort ungeeignet
const AMBIGUOUS = ["die", "war", "will", "kind", "gift", "hell", "rot", "also", "see", "man", "bad", "fast", "arm", "mist", "bald", "rat", "art", "fern", "hut", "brand", "handy"];

test("Grundstruktur: 10 normale Kategorien + Sudden Death", () => {
  assert.equal(data.categories.filter(c => !c.sudden).length, 10);
  assert.equal(data.categories.filter(c => c.sudden).length, 1);
  assert.equal(all.filter(t => !t.sudden).length, 55);
  assert.equal(all.filter(t => t.sudden).length, 5);
});

test("IDs und Themen sind eindeutig", () => {
  assert.equal(new Set(all.map(t => t.id)).size, all.length);
  assert.equal(new Set(all.map(t => t.theme)).size, all.length);
  for (const t of all) assert.match(t.id, /^[a-z0-9]+(-[a-z0-9]+)*$/, t.id);
});

test("Energie und Ära sind gültig", () => {
  for (const t of all) {
    assert.ok(["high", "medium", "low"].includes(t.energy), `${t.id}: energy`);
    if (t.era !== null) {
      assert.ok(Number.isInteger(t.era.from) && Number.isInteger(t.era.to) && t.era.from <= t.era.to, `${t.id}: era`);
      assert.ok(t.era.from >= 1950 && t.era.to <= 2030, `${t.id}: era-Bereich`);
    }
  }
  for (const t of all.filter(t => t.category === "Zeitmaschine")) {
    const year = Number(t.theme.match(/\d{4}/)[0]);
    assert.deepEqual(t.era, { from: year, to: year }, t.id);
  }
});

test("Tags: mindestens 3, klein, ohne Duplikate", () => {
  for (const t of all) {
    assert.ok(t.tags.length >= 3, `${t.id}: zu wenige Tags`);
    assert.equal(new Set(t.tags).size, t.tags.length, `${t.id}: doppelte Tags`);
    for (const tag of t.tags) assert.equal(tag, tag.toLowerCase(), `${t.id}: ${tag}`);
  }
});

test("Schlüsselwörter: je Sprache mindestens 4 (ausser reine Jahres-Themen), klein, eindeutig, nicht zweideutig", () => {
  for (const t of all) {
    for (const lang of ["de", "en"]) {
      const kws = t.keywords[lang];
      assert.ok(Array.isArray(kws), `${t.id}.${lang}`);
      if (t.category !== "Zeitmaschine") assert.ok(kws.length >= 4, `${t.id}.${lang}: zu wenige Schlüsselwörter`);
      assert.equal(new Set(kws).size, kws.length, `${t.id}.${lang}: doppelt`);
      for (const k of kws) {
        assert.equal(k, k.toLowerCase(), `${t.id}.${lang}: ${k}`);
        assert.ok(k.length >= 3, `${t.id}.${lang}: ${k} zu kurz`);
        assert.ok(!AMBIGUOUS.includes(k), `${t.id}.${lang}: „${k}“ ist zweideutig (DE/EN)`);
      }
    }
  }
});

test("Jahres-Themen ohne Schlüsselwörter haben eine Ära", () => {
  for (const t of all) {
    if (!t.keywords.de.length && !t.keywords.en.length) assert.ok(t.era, `${t.id}: weder Schlüsselwörter noch Ära`);
  }
});
