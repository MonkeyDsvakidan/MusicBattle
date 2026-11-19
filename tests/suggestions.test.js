// Prüft die Song-Vorschläge im Battle (Roadmap 6.8). Ausführen im Repo-Root: node --test
const test = require("node:test");
const assert = require("node:assert/strict");
const { rankSuggestions } = require("../js/battle.js");

const t = (id, name, artistId = "reezy") => ({ id, uri: `spotify:track:${id}`, name, artists: [{ id: artistId, name: artistId }], album: { name: "Album", images: [] } });

test("eigene Top-Songs nach Rang über alle Zeiträume, fremde Künstler raus", () => {
  const short = [t("x", "Fremd", "other"), t("a", "A"), t("b", "B")];
  const long = [t("b", "B"), t("c", "C")];
  const out = rankSuggestions([short, [], long], [], "reezy");
  assert.deepEqual(out.map(s => s.id), ["b", "a", "c"]);
  assert.ok(out.every(s => s.source === "top"));
});

test("mit Spotify-Suche auf 5 auffüllen, gleicher Titel nur einmal", () => {
  const out = rankSuggestions([[t("a", "A")]], [t("a2", "a "), t("s1", "S1"), t("f", "F", "other"), t("s2", "S2"), t("s3", "S3"), t("s4", "S4"), t("s5", "S5")], "reezy");
  assert.deepEqual(out.map(s => s.id), ["a", "s1", "s2", "s3", "s4"]);
  assert.deepEqual(out.map(s => s.source), ["top", "search", "search", "search", "search"]);
});

test("ohne Top-Songs (Pass & Play, Spieler 2) nur Suche; leer bleibt leer", () => {
  assert.deepEqual(rankSuggestions([], [t("s1", "S1")], "reezy").map(s => s.source), ["search"]);
  assert.deepEqual(rankSuggestions([], [], "reezy"), []);
});
