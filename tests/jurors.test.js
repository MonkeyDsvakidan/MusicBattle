// Prüft die Juror-Profile (Roadmap 3.5). Ausführen im Repo-Root: node --test
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const shared = path.join(__dirname, "../supabase/functions/_shared");
const data = JSON.parse(fs.readFileSync(path.join(shared, "jurors.json"), "utf8"));
const themes = JSON.parse(fs.readFileSync(path.join(shared, "themes.json"), "utf8"));
const features = Object.keys(data.features);
const requiresVocab = Object.keys(data.requires_vocabulary);
const PLACEHOLDERS = ["winner", "loser", "theme", "facts", "winner_value", "loser_value"];

test("Fünf Juroren mit den bestehenden Schlüsseln (kompatibel zu mb_jury_scores.juror_key)", () => {
  assert.deepEqual(data.jurors.map(j => j.key), ["theme", "vibe", "lyrics", "underdog", "connoisseur"]);
  for (const j of data.jurors) {
    assert.ok(j.name && j.role && j.persona, `${j.key}: Name/Rolle/Persona fehlen`);
  }
});

test("Gewichte nutzen nur bekannte Merkmale und haben mindestens ein positives", () => {
  for (const j of data.jurors) {
    const entries = Object.entries(j.weights);
    assert.ok(entries.some(([, w]) => w > 0), `${j.key}: kein positives Gewicht`);
    for (const [f, w] of entries) {
      assert.ok(features.includes(f), `${j.key}: unbekanntes Merkmal ${f}`);
      assert.equal(typeof w, "number", `${j.key}.${f}`);
    }
  }
});

test("Mindestdaten und Abstände sind gültig", () => {
  for (const j of data.jurors) {
    assert.ok(j.requires.length > 0, `${j.key}: requires leer`);
    for (const r of j.requires) assert.ok(requiresVocab.includes(r), `${j.key}: unbekannte Anforderung ${r}`);
    assert.ok(["any", "all"].includes(j.requires_mode), `${j.key}: requires_mode`);
    assert.ok(j.margins.clear > 0, `${j.key}: margins.clear`);
    if ("theme_gate" in j) assert.ok(j.theme_gate > 0 && j.theme_gate < 1, `${j.key}: theme_gate`);
  }
});

test("Text-Bausteine: vorhanden, nur bekannte Platzhalter, Schweizer Schreibweise", () => {
  for (const j of data.jurors) {
    assert.ok(j.texts.win?.length > 0, `${j.key}: keine win-Texte`);
    assert.ok(j.texts.weak?.length > 0, `${j.key}: keine weak-Texte`);
    for (const [kind, list] of Object.entries(j.texts)) {
      for (const t of list) {
        for (const m of t.matchAll(/\{(\w+)\}/g)) assert.ok(PLACEHOLDERS.includes(m[1]), `${j.key}.${kind}: unbekannter Platzhalter {${m[1]}}`);
        assert.ok(!t.includes("ß"), `${j.key}.${kind}: „ß“ statt „ss“`);
        assert.ok(t.includes("{winner}"), `${j.key}.${kind}: Text nennt den Gewinner nicht`);
      }
    }
  }
});

test("Schwache Gewichte für allgemeine Wörter betreffen echte Schlüsselwörter", () => {
  const all = new Set(themes.categories.flatMap(c => c.themes.flatMap(t => [...t.keywords.de, ...t.keywords.en])));
  for (const [kw, w] of Object.entries(data.keyword_weights)) {
    if (kw === "about") continue;
    assert.ok(all.has(kw), `„${kw}“ ist kein Schlüsselwort in themes.json`);
    assert.ok(w > 0 && w < 1, `„${kw}“: Gewicht muss zwischen 0 und 1 liegen`);
  }
});

test("Energie-Tags: klein, ohne Überschneidung", () => {
  const { high, low } = data.energy_tags;
  for (const t of [...high, ...low]) assert.equal(t, t.toLowerCase(), t);
  assert.equal(high.filter(t => low.includes(t)).length, 0, "Tag gleichzeitig high und low");
});
