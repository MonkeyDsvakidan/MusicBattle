// Tests für «Unter Freunden» (Roadmap 7.10) in der Quiz-Engine. Ausführen im Repo-Root: node --test
import test from "node:test";
import assert from "node:assert/strict";
import { generateQuiz, artistsByMember, fansAccuracy, scoreAnswer, FRIEND_KINDS, FRIENDS, QUIZ_KINDS } from "../supabase/functions/_shared/quiz-engine.mjs";

let n = 0;
function song(member, o = {}) {
  n++;
  return {
    spotify_track_id: o.id || `Track${String(n).padStart(10, "0")}`, title: o.title || `Song ${n}`, artist: o.artist || `Artist ${n % 23}`,
    album: `Album ${n}`, spotify_album_id: `Album${String(n).padStart(10, "0")}`, album_type: "album",
    release_year: 1980 + (n * 7) % 45, cover_url: `https://i.scdn.co/image/c${n}`, duration_ms: 200000, member_id: member,
  };
}
// Top-50-Künstler einer Person: ids = Liste von Künstler-Kürzeln in Rang-Reihenfolge
const tops = (member, ids) => ids.map((id, i) => ({ member_id: member, spotify_artist_id: `Art${id.padStart(6, "0")}xyz`, name: `Name ${id}`, rank: i + 1, image_url: null }));
const range = (from, to) => Array.from({ length: to - from + 1 }, (_, i) => String(from + i));

const players = ["m1", "m2", "m3"];
const pool = players.flatMap((m) => Array.from({ length: 40 }, () => song(m)));
// m1 und m2 teilen die Künstler 1–10 (gleiche Reihenfolge), m3 teilt 5–14 mit m1 auf anderen Plätzen
const artists = [
  ...tops("m1", [...range(1, 10), ...range(100, 139)]),
  ...tops("m2", [...range(1, 10), ...range(200, 239)]),
  ...tops("m3", [...range(11, 14), ...range(5, 10), ...range(300, 339)]),
];
const kinds = [...QUIZ_KINDS, ...FRIEND_KINDS];
const quiz = (o = {}) => generateQuiz(o.pool ?? pool, { count: 20, seed: o.seed ?? "f:1", kinds, players: o.players ?? players, artists: o.artists ?? artists });

test("7.10: gemischt – Personen-Fragen und Musikwissen-Fragen im selben Quiz", () => {
  const qs = quiz();
  assert.equal(qs.length, 20);
  const k = new Set(qs.map((q) => q.kind));
  for (const f of FRIEND_KINDS) assert.ok(k.has(f), `${f} fehlt`);
  assert.ok(qs.some((q) => QUIZ_KINDS.includes(q.kind)), "keine Musikwissen-Frage");
  assert.ok(qs.filter((q) => FRIEND_KINDS.includes(q.kind)).length >= qs.length * 0.4, "zu wenige Personen-Fragen");
  assert.deepEqual(quiz(), qs, "deterministisch");
});

test("7.10: Wessen Song? – nur Songs, die genau eine Person hat; Besitzer ist ausgesetzt", () => {
  const shared = song("m1", { title: "Gemeinsam", artist: "Duo" });
  const sharedOther = { ...song("m2", { title: "gemeinsam", artist: "Duo" }) };   // gleicher Song, andere Fassung/ID
  const sameId = { ...shared, member_id: "m3" };
  for (let s = 0; s < 15; s++) {
    const qs = quiz({ pool: [shared, sharedOther, sameId, ...pool], seed: `w${s}` }).filter((q) => q.kind === "whose");
    for (const q of qs) {
      assert.notEqual(q.prompt.title, "Gemeinsam");
      assert.notEqual(q.prompt.title.toLowerCase(), "gemeinsam");
      assert.equal(q.solution.member_ids.length, 1);
      assert.deepEqual(q.sitting_out, q.solution.member_ids);
      const owner = pool.find((t) => t.spotify_track_id === q.prompt.track_id).member_id;
      assert.deepEqual(q.solution.member_ids, [owner]);
      assert.deepEqual(q.prompt.options.map((o) => o.member_id).sort(), [...players].sort());
      assert.ok(q.prompt.play?.track_id, "Song läuft beim Host");
      assert.equal(JSON.stringify(q.prompt).includes(owner), true, "Optionen enthalten alle Personen");
    }
  }
});

test("7.10: Wer hat X auf Platz N? – Platz 1–20, eindeutig, Person ist ausgesetzt", () => {
  const byMember = artistsByMember(artists, players);
  let seen = 0;
  for (let s = 0; s < 15; s++) for (const q of quiz({ seed: `r${s}` }).filter((x) => x.kind === "rank")) {
    seen++;
    const [m] = q.solution.member_ids;
    assert.ok(q.prompt.rank >= 1 && q.prompt.rank <= FRIENDS.rankMax);
    assert.deepEqual(q.sitting_out, [m]);
    const holders = [...byMember].filter(([, l]) => [...l.values()].some((a) => a.name === q.prompt.artist.name && a.rank === q.prompt.rank)).map(([id]) => id);
    assert.deepEqual(holders, [m], "nur eine Person hat X auf diesem Platz");
    assert.ok(!JSON.stringify(q.prompt).includes("member_ids"), "Lösung nicht im öffentlichen Teil");
  }
  assert.ok(seen > 0);
  // m1 und m2 haben 1–10 auf denselben Plätzen → nie gefragt
  for (let s = 0; s < 15; s++) for (const q of quiz({ seed: `r${s}` }).filter((x) => x.kind === "rank")) assert.ok(!["1", "2", "3", "4"].some((i) => q.prompt.artist.name === `Name ${i}`));
});

test("7.10: Wer hört alles X? – richtige Personen = alle mit X in den Top 50, nie alle, niemand ausgesetzt", () => {
  const byMember = artistsByMember(artists, players);
  let seen = 0;
  for (let s = 0; s < 15; s++) for (const q of quiz({ seed: `h${s}` }).filter((x) => x.kind === "fans")) {
    seen++;
    const fans = [...byMember].filter(([, l]) => [...l.values()].some((a) => a.name === q.prompt.artist.name)).map(([id]) => id);
    assert.deepEqual([...q.solution.member_ids].sort(), fans.sort());
    assert.ok(fans.length >= 1 && fans.length < players.length, "nie alle");
    assert.deepEqual(q.sitting_out, []);
  }
  assert.ok(seen > 0);
});

test("7.10: Gemeinsamkeit – Lösung bei beiden in den Top 20, Ablenker nicht bei beiden, A und B ausgesetzt", () => {
  const byMember = artistsByMember(artists, players);
  let seen = 0;
  for (let s = 0; s < 15; s++) for (const q of quiz({ seed: `c${s}` }).filter((x) => x.kind === "common")) {
    seen++;
    const [a, b] = q.prompt.members;
    assert.deepEqual(q.sitting_out, [a, b]);
    assert.equal(q.prompt.options.length, 4);
    const rankOf = (m, name) => [...byMember.get(m).values()].find((x) => x.name === name)?.rank ?? Infinity;
    q.prompt.options.forEach((o, i) => {
      const both = rankOf(a, o.name) <= 20 && rankOf(b, o.name) <= 20;
      assert.equal(both, i + 1 === q.solution.choice, `${o.name}`);
      if (i + 1 !== q.solution.choice) assert.ok(rankOf(a, o.name) === Infinity || rankOf(b, o.name) === Infinity, "Ablenker beim anderen gar nicht in den Top-Künstlern");
    });
  }
  assert.ok(seen > 0);
});

test("7.10: kein Künstler zweimal im selben Quiz", () => {
  for (let s = 0; s < 10; s++) {
    const names = quiz({ seed: `u${s}` }).filter((q) => ["rank", "fans"].includes(q.kind)).map((q) => q.prompt.artist.name);
    assert.equal(new Set(names).size, names.length);
  }
});

test("7.10: allein oder zu zweit nur Musikwissen; zu zweit mit Mitrater auch Gemeinsamkeit", () => {
  const solo = generateQuiz(pool.filter((t) => t.member_id === "m1"), { count: 10, seed: "s", kinds, players: ["m1"], artists: tops("m1", range(1, 50)) });
  assert.equal(solo.length, 10);
  assert.ok(solo.every((q) => QUIZ_KINDS.includes(q.kind)));
  const two = ["m1", "m2"], twoPool = pool.filter((t) => two.includes(t.member_id)), twoArtists = artists.filter((a) => two.includes(a.member_id));
  const duo = generateQuiz(twoPool, { count: 15, seed: "d", kinds, players: two, artists: twoArtists });
  assert.ok(duo.every((q) => QUIZ_KINDS.includes(q.kind)), "zu zweit keine Personen-Fragen");
  // dritte Person ohne Spotify (rät nur mit) → Gemeinsamkeit möglich, Wessen Song/Platz/Wer hört nicht
  const withGuest = generateQuiz(twoPool, { count: 15, seed: "g", kinds, players: [...two, "gast"], artists: twoArtists });
  assert.ok(withGuest.some((q) => q.kind === "common"));
  assert.ok(withGuest.every((q) => !["whose", "rank", "fans"].includes(q.kind)));
});

test("7.10: Musikwissen-Quiz (ohne Personen-Typen) bleibt unverändert", () => {
  const a = generateQuiz(pool, { count: 15, seed: "m", players }), b = generateQuiz(pool, { count: 15, seed: "m", players, artists });
  assert.deepEqual(a, b);
  assert.ok(a.every((q) => QUIZ_KINDS.includes(q.kind)));
});

test("7.10: Teilpunkte bei «Wer hört alles X?»", () => {
  assert.equal(fansAccuracy(["a", "b"], ["a", "b"], "me"), 1);
  assert.equal(fansAccuracy(["a"], ["a", "b"], "me"), 0.5);
  assert.equal(fansAccuracy(["a", "b", "c"], ["a", "b"], "me"), 0.5);   // eine falsche zieht einen Anteil ab
  assert.equal(fansAccuracy(["c"], ["a", "b"], "me"), 0);
  assert.equal(fansAccuracy(["c", "d", "a"], ["a"], "me"), 0);           // nie unter 0
  assert.equal(fansAccuracy([], ["me"], "me"), 1);                        // nur man selbst hört X → «niemand» richtig
  assert.equal(fansAccuracy(["a"], ["me"], "me"), 0);
  assert.equal(fansAccuracy(["a"], ["a", "me"], "me"), 1);                // die eigene Person zählt nicht
  assert.equal(scoreAnswer("fans", { member_ids: ["a"] }, { member_ids: ["a", "b"] }, 0, 20000, "me"), 500);
  assert.equal(scoreAnswer("fans", { member_ids: ["a", "b"] }, { member_ids: ["a", "b"] }, 10000, 20000, "me"), 750);
  assert.equal(scoreAnswer("rank", { member_id: "a" }, { member_ids: ["a"] }, 0), 1000);
  assert.equal(scoreAnswer("rank", { member_id: "b" }, { member_ids: ["a"] }, 0), 0);
  assert.equal(scoreAnswer("common", { choice: 2 }, { choice: 2 }, 0), 1000);
  assert.equal(scoreAnswer("fans", { choice: 1 }, { member_ids: ["a"] }, 0), 0);
});

test("7.10: Künstler-Liste – nur Mitspielende, doppelte Künstler einmal, ungültige Zeilen weg", () => {
  const by = artistsByMember([
    ...tops("m1", ["1", "2"]), { member_id: "m1", spotify_artist_id: "Art000001xyz", name: "Doppelt", rank: 7 },
    ...tops("weg", ["1"]), { member_id: "m2", spotify_artist_id: "", name: "x", rank: 1 }, { member_id: "m2", spotify_artist_id: "ArtX", name: "x", rank: 0 },
  ], ["m1", "m2"]);
  assert.deepEqual([...by.keys()], ["m1"]);
  assert.equal(by.get("m1").size, 2);
  assert.equal(by.get("m1").get("Art000001xyz").rank, 1);
});
