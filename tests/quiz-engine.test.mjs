// Tests für die Quiz-Engine (Roadmap 7.3). Ausführen im Repo-Root: node --test
import test from "node:test";
import assert from "node:assert/strict";
import { generateQuiz, preparePool, createRng, startMs, QUIZ_KINDS } from "../supabase/functions/_shared/quiz-engine.mjs";

let n = 0;
function song(o = {}) {
  n++;
  return {
    spotify_track_id: o.id || `Track${String(n).padStart(10, "0")}`,
    title: o.title || `Song ${n}`, artist: o.artist || `Artist ${n % 17}`,
    album: o.album ?? `Album ${n}`, spotify_album_id: o.albumId || `Album${String(n).padStart(10, "0")}`,
    album_type: o.type || "album", release_year: o.year === undefined ? 1980 + (n * 7) % 45 : o.year,
    cover_url: o.cover === undefined ? `https://i.scdn.co/image/c${n}` : o.cover, duration_ms: o.dur ?? 200000,
    member_id: o.member || "m1",
  };
}
const bigPool = (k = 120, member = "m1") => Array.from({ length: k }, () => song({ member }));

test("deterministisch: gleicher Pool + Startwert = gleiches Quiz, anderer Startwert = anderes",() => {
  const pool = bigPool();
  const a = generateQuiz(pool, { count: 15, seed: "raum:1" }), b = generateQuiz(pool, { count: 15, seed: "raum:1" });
  assert.deepEqual(a, b);
  assert.notDeepEqual(a.map((q) => q.track_ids), generateQuiz(pool, { count: 15, seed: "raum:2" }).map((q) => q.track_ids));
  assert.equal(createRng("x")(), createRng("x")());
});

test("gewünschte Anzahl, nummeriert, alle Typen gemischt, kein Song doppelt als Lösung", () => {
  for (const count of [10, 15, 20]) {
    const qs = generateQuiz(bigPool(), { count, seed: `s${count}` });
    assert.equal(qs.length, count);
    assert.deepEqual(qs.map((q) => q.question_no), Array.from({ length: count }, (_, i) => i + 1));
    for (const k of QUIZ_KINDS) assert.ok(qs.some((q) => q.kind === k), `${k} fehlt bei ${count}`);
    const ids = qs.flatMap((q) => q.track_ids);
    assert.equal(new Set(ids).size, ids.length);
  }
});

test("Lösung steht nicht im öffentlichen Teil", () => {
  for (const q of generateQuiz(bigPool(), { count: 20, seed: "geheim" })) {
    const p = JSON.stringify(q.prompt);
    if (q.kind === "year") { assert.ok(!/"year"/.test(p)); assert.equal(typeof q.solution.year, "number"); }
    if (q.kind === "older") { assert.ok(!/year/.test(p)); assert.ok([1, 2].includes(q.solution.choice)); }
    if (q.kind === "cover") {
      assert.ok(!p.includes(q.track_ids[0]), "Song-ID der Cover-Frage verrät die Lösung");
      assert.ok(!/"title"/.test(p));
      assert.equal(q.prompt.play, null, "Musik erst nach dem Aufdecken");
      assert.equal(q.solution.play.track_id, q.track_ids[0]);
    }
  }
});

test("älter: richtige Wahl, mindestens 2 Jahre Abstand, verschiedene Künstler", () => {
  const qs = generateQuiz(bigPool(), { count: 20, seed: "alt", kinds: ["older"] });
  assert.equal(qs.length, 20);
  for (const q of qs) {
    const [y1, y2] = q.solution.years;
    assert.ok(Math.abs(y1 - y2) >= 2);
    assert.equal(q.solution.choice, y1 < y2 ? 1 : 2);
    assert.notEqual(q.prompt.options[0].artist, q.prompt.options[1].artist);
  }
});

test("Cover: vier verschiedene Alben, Lösung dabei, Ablenker bevorzugt vom selben Künstler", () => {
  const pool = [
    song({ artist: "Kendrick Lamar", album: "DAMN.", year: 2017 }), song({ artist: "Kendrick Lamar", album: "good kid, m.A.A.d city", year: 2012 }),
    song({ artist: "Kendrick Lamar", album: "To Pimp a Butterfly", year: 2015 }), song({ artist: "Kendrick Lamar", album: "GNX", year: 2024 }),
    ...bigPool(30),
  ];
  const qs = generateQuiz(pool, { count: 20, seed: "cover", kinds: ["cover"] });
  for (const q of qs) {
    const labels = q.prompt.options.map((o) => `${o.album}|${o.artist}`);
    assert.equal(new Set(labels).size, 4);
    assert.equal(q.prompt.options[q.solution.choice - 1].album, q.solution.album);
  }
  const k = qs.find((q) => q.solution.artist === "Kendrick Lamar");
  assert.ok(k, "Kendrick-Cover kommt vor");
  assert.equal(k.prompt.options.filter((o) => o.artist === "Kendrick Lamar").length, 4);
});

test("unsichere Jahre: Compilations und Remaster nur mit Jahr aus dem Song-Profil", () => {
  const comp = song({ id: "CompTrack00001", type: "compilation", year: 2005 });
  const rem = song({ id: "RemTrack000001", album: "Thriller (Remastered)", year: 2008 });
  const prof = song({ id: "ProfTrack00001", album: "Hits Deluxe Edition", year: 2015 });
  const [c, r, p] = preparePool([comp, rem, prof], { ProfTrack00001: 1994 });
  assert.equal(c.yearReliable, false);
  assert.equal(r.yearReliable, false);
  assert.equal(p.yearReliable, true);
  assert.equal(p.year, 1994, "früheres Jahr aus dem Profil gewinnt");
  const qs = generateQuiz([comp, rem, ...bigPool(40)], { count: 20, seed: "jahr", kinds: ["year", "older"] });
  assert.ok(!qs.some((q) => q.track_ids.includes("CompTrack00001") || q.track_ids.includes("RemTrack000001")));
});

test("Personen mit vielen Songs dominieren nicht", () => {
  const pool = [...bigPool(200, "viel"), ...bigPool(15, "wenig")];
  const qs = generateQuiz(pool, { count: 20, seed: "fair", kinds: ["year"] });
  const fromFew = qs.filter((q) => pool.find((t) => t.spotify_track_id === q.track_ids[0]).member_id === "wenig").length;
  assert.ok(fromFew >= 8, `nur ${fromFew} von 20 aus dem kleinen Pool`);
});

test("gleicher Song von zwei Personen zählt einmal", () => {
  const a = song({ id: "SameSong000001", member: "m1" }), b = { ...a, member_id: "m2" };
  const [one] = preparePool([a, b]);
  assert.deepEqual(one.suppliers, ["m1", "m2"]);
});

test("kleiner Pool: weniger Fragen statt Endlosschleife; fehlende Cover → andere Typen", () => {
  assert.ok(generateQuiz(bigPool(5), { count: 20, seed: "klein" }).length < 20);
  assert.deepEqual(generateQuiz([], { count: 10, seed: "leer" }), []);
  const noCovers = Array.from({ length: 60 }, () => song({ cover: null }));
  const qs = generateQuiz(noCovers, { count: 10, seed: "nocover" });
  assert.equal(qs.length, 10);
  assert.ok(!qs.some((q) => q.kind === "cover"));
});

test("Startpunkt", () => {
  assert.equal(startMs({ duration_ms: 200000 }), 30000);
  assert.equal(startMs({ duration_ms: 80000 }), 24000);
  assert.equal(startMs({ duration_ms: 45000 }), 0);
  assert.equal(startMs({}), 0);
});

import { scoreAnswer, answerAccuracy, QUIZ_SCORING } from "../supabase/functions/_shared/quiz-engine.mjs";

test("Punkte: richtig + Tempo-Bonus", () => {
  assert.equal(scoreAnswer("older", { choice: 2 }, { choice: 2 }, 0), 1000);
  assert.equal(scoreAnswer("older", { choice: 2 }, { choice: 2 }, 10000), 750);
  assert.equal(scoreAnswer("cover", { choice: 3 }, { choice: 3 }, 20000), 500);
  assert.equal(scoreAnswer("cover", { choice: 3 }, { choice: 3 }, 20900), 500, "Toleranz nach Ablauf: nur Grundpunkte");
  assert.equal(scoreAnswer("cover", { choice: 1 }, { choice: 3 }, 0), 0);
  assert.equal(scoreAnswer("older", null, { choice: 1 }, 0), 0);
});

test("Punkte: Jahr je näher, desto mehr", () => {
  const s = (y, ms = 0) => scoreAnswer("year", { year: y }, { year: 2004 }, ms);
  assert.equal(s(2004), 1000);
  assert.equal(s(2001), 700);
  assert.equal(s(2007, 10000), 530);
  assert.equal(s(1994), 0, "10 Jahre daneben");
  assert.equal(s(2030), 0);
  assert.ok(s(2005) > s(2006) && s(2006) > s(2010));
  assert.equal(answerAccuracy("year", { year: "x" }, { year: 2004 }), 0);
});

test("Punkte: wessen Song (Quiz-Art A) und eigenes Zeitlimit", () => {
  assert.equal(scoreAnswer("whose", { member_id: "m2" }, { member_ids: ["m1", "m2"] }, 0), 1000);
  assert.equal(scoreAnswer("whose", { member_id: "m3" }, { member_ids: ["m1"] }, 0), 0);
  assert.equal(scoreAnswer("older", { choice: 1 }, { choice: 1 }, 15000, 30000), 750);
  assert.equal(QUIZ_SCORING.limitMs, 20000);
});
