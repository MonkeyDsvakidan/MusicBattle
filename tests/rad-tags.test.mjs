// Tests für die Tag-Funktionen des Albumrads (Roadmap W.6). Ausführen im Repo-Root: node --test
import test from "node:test";
import assert from "node:assert/strict";
import { cleanTag, pickTags, chooseAuto, lookupAlbumName, sameName, applyTagChange, tagView, MAX_OWN } from "../supabase/functions/_shared/rad-tags.mjs";

test("cleanTag: klein, einheitlich, zu lange oder leere Tags fallen weg", () => {
  assert.equal(cleanTag("  Hip   Hop "), "hip-hop");
  assert.equal(cleanTag("hiphop"), "hip-hop");
  assert.equal(cleanTag("RnB"), "r&b");
  assert.equal(cleanTag("Deutsch Rap"), "deutschrap");
  assert.equal(cleanTag("Trip-Hop"), "trip-hop");
  assert.equal(cleanTag("<b>x</b>"), "b x /b");
  assert.equal(cleanTag(""), "");
  assert.equal(cleanTag("x".repeat(31)), "");
});

test("pickTags: häufigste zuerst, ohne Müll, Jahreszahlen, Künstler- und Albumnamen", () => {
  const raw = [
    { name: "albums I own", count: 100 }, { name: "Hip-Hop", count: 90 }, { name: "2016", count: 80 }, { name: "Eno", count: 70 },
    { name: "german", count: 60 }, { name: "hip hop", count: 50 }, { name: "seen live", count: 40 }, { name: "trap", count: 4 },
    { name: "best albums of 2016", count: 30 }, { name: "D-TEC", count: 20 }, { name: "90s", count: 10 },
  ];
  assert.deepEqual(pickTags(raw, { artist: "Eno", album: "D-TEC" }).map((t) => t.name), ["hip-hop", "german", "90s"]);
});

test("pickTags: höchstens max, einzelnes Objekt statt Liste, leere Antwort", () => {
  const many = Array.from({ length: 20 }, (_, i) => ({ name: `tag ${i}`, count: 100 - i }));
  assert.equal(pickTags(many).length, 8);
  assert.deepEqual(pickTags({ name: "soul", count: 50 }), [{ name: "soul", count: 50 }]);
  assert.deepEqual(pickTags(undefined), []);
});

test("chooseAuto: genug Album-Tags → nur Album", () => {
  const r = chooseAuto([{ name: "soul", count: 100 }, { name: "funk", count: 50 }, { name: "70s", count: 20 }], [{ name: "motown", count: 100 }]);
  assert.equal(r.source, "album");
  assert.deepEqual(r.tags.map((t) => t.name), ["soul", "funk", "70s"]);
});

test("chooseAuto: zu wenige Album-Tags → mit Künstler-Tags auffüllen, ohne Doppelte", () => {
  const r = chooseAuto([{ name: "soul", count: 100 }], [{ name: "soul", count: 100 }, { name: "motown", count: 90 }, { name: "funk", count: 80 }]);
  assert.equal(r.source, "album+artist");
  assert.deepEqual(r.tags.map((t) => t.name), ["soul", "motown", "funk"]);
  assert.equal(chooseAuto([], [{ name: "rap", count: 100 }]).source, "artist");
  assert.deepEqual(chooseAuto([], []), { tags: [], source: "none" });
});

test("lookupAlbumName: Zusätze weg, normale Klammern bleiben", () => {
  assert.equal(lookupAlbumName("Illmatic (Deluxe Edition)"), "Illmatic");
  assert.equal(lookupAlbumName("Abbey Road - Remastered 2011"), "Abbey Road");
  assert.equal(lookupAlbumName("OK Computer [20th Anniversary Edition]"), "OK Computer");
  assert.equal(lookupAlbumName("Songs (About Love)"), "Songs (About Love)");
  assert.equal(lookupAlbumName("Deluxe"), "Deluxe");
  assert.equal(lookupAlbumName("(Deluxe Edition)"), "(Deluxe Edition)");
});

test("sameName: Schreibweisen des Künstlers", () => {
  assert.ok(sameName("Beyoncé", "beyonce"));
  assert.ok(sameName("The Roots", "Roots"));
  assert.ok(!sameName("Eno", "Nas"));
  assert.ok(!sameName("", "Nas"));
});

const row = { album_id: "a", auto: [{ name: "soul", count: 100 }, { name: "funk", count: 50 }], added: ["sonntag"], hidden: [], fetched_at: "2026-11-14T10:00:00Z" };

test("applyTagChange: eigenen Tag hinzufügen und entfernen", () => {
  assert.deepEqual(applyTagChange(row, " Autofahrt ", true), { added: ["sonntag", "autofahrt"], hidden: [] });
  assert.deepEqual(applyTagChange(row, "sonntag", true), { added: ["sonntag"], hidden: [] }, "kein Doppel");
  assert.deepEqual(applyTagChange(row, "Sonntag", false), { added: [], hidden: [] });
});

test("applyTagChange: automatischen Tag ausblenden und zurückholen", () => {
  const off = applyTagChange(row, "Funk", false);
  assert.deepEqual(off, { added: ["sonntag"], hidden: ["funk"] });
  assert.deepEqual(applyTagChange({ ...row, ...off }, "funk", true), { added: ["sonntag"], hidden: [] });
  assert.deepEqual(applyTagChange(row, "soul", true), { added: ["sonntag"], hidden: [] }, "automatischer Tag wird nicht zusätzlich eigener");
});

test("applyTagChange: ungültig oder zu viele", () => {
  assert.deepEqual(applyTagChange(row, "   ", true), { error: "tag invalid" });
  const full = { auto: [], added: Array.from({ length: MAX_OWN }, (_, i) => `t${i}`), hidden: [] };
  assert.deepEqual(applyTagChange(full, "neu", true), { error: "too many tags" });
  assert.deepEqual(applyTagChange(undefined, "neu", true), { added: ["neu"], hidden: [] });
});

test("tagView: sichtbare Tags, eigene markiert, ausgeblendete getrennt", () => {
  assert.deepEqual(tagView({ ...row, hidden: ["funk"] }), {
    album_id: "a", tags: [{ name: "soul", own: false }, { name: "sonntag", own: true }], hidden: ["funk"], fetched: true,
  });
  assert.deepEqual(tagView({ album_id: "b", auto: [], added: [], hidden: [], fetched_at: null }), { album_id: "b", tags: [], hidden: [], fetched: false });
});
