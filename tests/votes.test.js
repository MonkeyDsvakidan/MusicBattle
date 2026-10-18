// Prüft die Auswertung der Kategorie-Abstimmung (Roadmap 6.3.2). Ausführen im Repo-Root: node --test
const test = require("node:test");
const assert = require("node:assert/strict");
const { VOTE_CATEGORIES, categoryResult, voteProgress, eligibleVoters } = require("../js/votes.js");

const KEYS = ["theme", "vibe", "lyrics", "surprise", "connoisseur"];
// Stimmen eines Mitglieds: choices in der Reihenfolge von KEYS
const ballot = (memberId, role, choices) => KEYS.map((category, i) => ({ voter_member_id: memberId, voter_role: role, category, choice: choices[i] }));

test("fünf Kategorien mit deutschen Namen und Fragen", () => {
  assert.deepEqual(VOTE_CATEGORIES.map(c => c.key), KEYS);
  for (const c of VOTE_CATEGORIES) {
    assert.ok(c.label && c.question.endsWith("?"), c.key);
    assert.ok(!c.question.includes("ß"), "Schweizer Schreibweise ohne ß");
  }
});

test("Spieler einig: Mehrheit je Kategorie, Rundensieger nach Kategorien", () => {
  const votes = [...ballot("p1", "player", [1, 1, 2, 1, 2]), ...ballot("p2", "player", [1, 1, 2, 1, 2])];
  const r = categoryResult(votes, { hasJurors: false });
  assert.deepEqual(r.categories.map(c => c.winner), [1, 1, 2, 1, 2]);
  assert.deepEqual(r.won, { a: 3, b: 2 });
  assert.equal(r.winner, 1);
  assert.equal(r.voters, 2);
});

test("jeder für den eigenen Song: alle Kategorien offen → Gleichstand, Host entscheidet", () => {
  const votes = [...ballot("p1", "player", [1, 1, 1, 1, 1]), ...ballot("p2", "player", [2, 2, 2, 2, 2])];
  const r = categoryResult(votes, { hasJurors: false });
  assert.ok(r.categories.every(c => c.winner === null && c.a === 1 && c.b === 1));
  assert.deepEqual(r.won, { a: 0, b: 0 });
  assert.equal(r.winner, null);
});

test("offene Kategorien zählen für keinen: 1 zu 2 bei zwei offenen → B gewinnt", () => {
  const votes = [...ballot("p1", "player", [1, 1, 2, 1, 2]), ...ballot("p2", "player", [1, 2, 2, 2, 2])];
  const r = categoryResult(votes, { hasJurors: false });
  assert.deepEqual(r.categories.map(c => c.winner), [1, null, 2, null, 2]);
  assert.deepEqual(r.won, { a: 1, b: 2 });
  assert.equal(r.winner, 2);
});

test("offene Kategorien zählen für keinen: 1 zu 1 → Gleichstand", () => {
  const votes = [...ballot("p1", "player", [1, 1, 2, 1, 2]), ...ballot("p2", "player", [1, 2, 2, 2, 1])];
  const r = categoryResult(votes, { hasJurors: false });
  assert.deepEqual(r.categories.map(c => c.winner), [1, null, 2, null, null]);
  assert.deepEqual(r.won, { a: 1, b: 1 });
  assert.equal(r.winner, null);
});

test("mit Juroren zählen nur Juroren-Stimmen", () => {
  const votes = [
    ...ballot("p1", "player", [1, 1, 1, 1, 1]),
    ...ballot("p2", "player", [1, 1, 1, 1, 1]),
    ...ballot("j1", "juror", [2, 2, 1, 2, 2]),
    ...ballot("j2", "juror", [2, 1, 1, 2, 1]),
    ...ballot("j3", "juror", [1, 2, 2, 2, 1]),
  ];
  const r = categoryResult(votes, { hasJurors: true });
  assert.deepEqual(r.categories.map(c => [c.a, c.b]), [[1, 2], [1, 2], [2, 1], [0, 3], [2, 1]]);
  assert.deepEqual(r.won, { a: 2, b: 3 });
  assert.equal(r.winner, 2);
  assert.equal(r.voters, 3);
  // Ohne Juroren-Regel würden die Spieler zählen
  assert.equal(categoryResult(votes, { hasJurors: false }).winner, 1);
});

test("zwei Juroren uneinig in einer Kategorie → offen", () => {
  const votes = [...ballot("j1", "juror", [1, 1, 1, 2, 2]), ...ballot("j2", "juror", [2, 1, 1, 2, 2])];
  const r = categoryResult(votes, { hasJurors: true });
  assert.equal(r.categories[0].winner, null);
  assert.deepEqual(r.won, { a: 2, b: 2 });
  assert.equal(r.winner, null);
});

test("keine oder ungültige Stimmen: alles offen", () => {
  assert.equal(categoryResult([], { hasJurors: false }).winner, null);
  assert.equal(categoryResult(undefined).voters, 0);
  const bad = [{ voter_member_id: "p1", voter_role: "player", category: "theme", choice: 3 }];
  assert.equal(categoryResult(bad).categories[0].a + categoryResult(bad).categories[0].b, 0);
});

test("Fortschritt: nur vollständige Stimmzettel zählen als abgestimmt", () => {
  const members = [{ id: "p1", role: "player" }, { id: "p2", role: "player" }];
  const partial = ballot("p2", "player", [1, 1, 1, 1, 1]).slice(0, 4);
  const p = voteProgress([...ballot("p1", "player", [1, 2, 1, 2, 1]), ...partial], members);
  assert.equal(p.done, 1);
  assert.equal(p.total, 2);
  assert.equal(p.complete, false);
  assert.deepEqual(p.missing.map(m => m.id), ["p2"]);
  const all = voteProgress([...ballot("p1", "player", [1, 2, 1, 2, 1]), ...ballot("p2", "player", [1, 1, 1, 1, 1])], members);
  assert.equal(all.complete, true);
  assert.equal(voteProgress([], []).complete, false);
});

test("Berechtigte: Juroren, sonst Spieler", () => {
  const players = [{ id: "p1", role: "player" }, { id: "p2", role: "player" }];
  assert.deepEqual(eligibleVoters(players).map(m => m.id), ["p1", "p2"]);
  assert.deepEqual(eligibleVoters([...players, { id: "j1", role: "juror" }]).map(m => m.id), ["j1"]);
  assert.deepEqual(eligibleVoters([]), []);
});
