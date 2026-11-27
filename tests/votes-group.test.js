// Prüft die Gruppen-Wertung (M.5): wer abstimmt, wofür, Punkte, Zwischenstand. Ausführen: node --test
const test = require("node:test");
const assert = require("node:assert/strict");
const { groupEligibleVoters, groupChoices, groupRoundPoints, groupStandings } = require("../js/votes.js");

const KEYS = ["theme", "vibe", "lyrics", "surprise", "connoisseur"];
const ballot = (id, role, choices) => KEYS.map((category, i) => ({ voter_member_id: id, voter_role: role, category, choice: choices[i] }));
const player = (id, corner) => ({ id, role: "player", player_slot: corner, corner });

test("ab 3 Ecken nicht für die eigene, bei 2 Ecken frei, Juroren frei", () => {
  assert.deepEqual(groupChoices([1, 2, 3, 4], player("p2", 2)), [1, 3, 4]);
  assert.deepEqual(groupChoices([1, 2], player("p1", 1)), [1, 2]);
  assert.deepEqual(groupChoices([1, 2, 3], { id: "j", role: "juror" }), [1, 2, 3]);
});

test("Entscheidung: Punktgleiche stimmen nicht, solange es andere gibt", () => {
  const members = [player("a", 1), player("b", 2), player("c", 3), player("d", 4)];
  assert.deepEqual(groupEligibleVoters(members, [1, 2], 6).map(m => m.id), ["c", "d"]);
  assert.deepEqual(groupEligibleVoters(members, [1, 2, 3, 4], 6).map(m => m.id), ["a", "b", "c", "d"]);
  assert.deepEqual(groupEligibleVoters(members, [1, 2, 3, 4], 2).map(m => m.id), ["a", "b", "c", "d"]);
  const withJuror = [...members, { id: "j", role: "juror" }];
  assert.deepEqual(groupEligibleVoters(withJuror, [1, 2], 6).map(m => m.id), ["j"]);
});

test("Teams: alle Mitglieder einer Ecke zählen als deren Ecke", () => {
  const members = [{ id: "a", role: "player", player_slot: 1, corner: 1 }, { id: "b", role: "player", player_slot: 2, corner: 1 }, { id: "c", role: "player", player_slot: 3, corner: 2 }, { id: "d", role: "player", player_slot: 4, corner: 3 }];
  assert.deepEqual(groupEligibleVoters(members, [1, 3], 6).map(m => m.id), ["c"]);
});

test("Punkte = Stimmen je Ecke, nur gezählte Rolle, Gleichstand → kein Sieger", () => {
  const votes = [...ballot("a", "player", [2, 2, 3, 2, 3]), ...ballot("b", "player", [1, 3, 3, 1, 1]), ...ballot("c", "player", [2, 1, 2, 2, 1]), ...ballot("j", "juror", [3, 3, 3, 3, 3])];
  const r = groupRoundPoints(votes, [1, 2, 3]);
  assert.deepEqual(r.points, { 1: 5, 2: 6, 3: 4 });
  assert.equal(r.winner, 2);
  const j = groupRoundPoints(votes, [1, 2, 3], { hasJurors: true });
  assert.deepEqual(j.points, { 1: 0, 2: 0, 3: 5 });
  const tie = groupRoundPoints([...ballot("a", "player", [2, 2, 2, 3, 3]), ...ballot("b", "player", [3, 3, 3, 2, 2])], [1, 2, 3]);
  assert.deepEqual(tie.top, [2, 3]);
  assert.equal(tie.winner, null);
});

test("Zwischenstand: letzte Runde doppelt, Live-Runde dazu, geteilte Plätze", () => {
  const rounds = [
    { round_number: 1, status: "complete", points: { 1: 5, 2: 3, 3: 2 } },
    { round_number: 2, status: "complete", points: { 1: 0, 2: 4, 3: 6 } },
    { round_number: 3, status: "battle", points: null },
  ];
  assert.deepEqual(groupStandings(rounds, 3, 3).map(t => [t.corner, t.total, t.rank]), [[3, 8, 1], [2, 7, 2], [1, 5, 3]]);
  const live = { round_number: 3, points: { 1: 2, 2: 1, 3: 0 } };
  assert.deepEqual(groupStandings(rounds, 3, 3, live).map(t => [t.corner, t.total, t.rank]), [[1, 9, 1], [2, 9, 1], [3, 8, 3]]);
  // Runde 6 (Entscheidung) zählt nicht ins Total
  assert.equal(groupStandings([...rounds, { round_number: 6, status: "complete", points: { 1: 9 } }], 3, 3)[0].total, 8);
});

test("Gruppen-Fragen in allen Kategorien, Schweizer Schreibweise", () => {
  const { VOTE_CATEGORIES } = require("../js/votes.js");
  for (const c of VOTE_CATEGORIES) assert.ok(c.groupQuestion.endsWith("?") && !c.groupQuestion.includes("ß"), c.key);
});

test("Endstand: Sieger der Entscheidung auf Platz 1, andere Gleiche Platz 2", () => {
  const { groupFinalStandings } = require("../js/votes.js");
  const rounds = [
    { round_number: 1, status: "complete", points: { 1: 2, 2: 1, 3: 0 } },
    { round_number: 2, status: "complete", points: { 1: 0, 2: 1, 3: 0 } },
    { round_number: 3, status: "complete", points: { 1: 1, 2: 1, 3: 2 } }, // letzte Runde ×2 → 4/4/4
  ];
  assert.deepEqual(groupFinalStandings(rounds, 3, 3).map(t => [t.corner, t.total, t.rank]), [[1, 4, 1], [2, 4, 1], [3, 4, 1]]);
  const decided = [...rounds, { round_number: 6, status: "complete", winner_slot: 2, points: { 1: 1, 2: 3, 3: 0 } }];
  assert.deepEqual(groupFinalStandings(decided, 3, 3).map(t => [t.corner, t.total, t.rank, Boolean(t.decided)]), [[2, 4, 1, true], [1, 4, 2, false], [3, 4, 2, false]]);
});

test("Endstand: ohne Entscheidung zählt nur das Total, Runde 6 nicht mit", () => {
  const { groupFinalStandings } = require("../js/votes.js");
  const rounds = [
    { round_number: 1, status: "complete", points: { 1: 3, 2: 0, 3: 1, 4: 0 } },
    { round_number: 2, status: "complete", points: { 1: 0, 2: 2, 3: 2, 4: 0 } }, // ×2 → 3/4/5/0
  ];
  assert.deepEqual(groupFinalStandings(rounds, 4, 2).map(t => [t.corner, t.total, t.rank]), [[3, 5, 1], [2, 4, 2], [1, 3, 3], [4, 0, 4]]);
  // Sieger der Entscheidung, der nicht vorne lag (Datenfehler): Tabelle bleibt unverändert
  const odd = [...rounds, { round_number: 6, status: "complete", winner_slot: 4 }];
  assert.equal(groupFinalStandings(odd, 4, 2)[0].corner, 3);
});
