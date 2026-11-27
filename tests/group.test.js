// Lobby-Logik Gruppenmodus (M.2). Ausführen im Repo-Root: node --test
const test=require("node:test");
const assert=require("node:assert/strict");
const {groupLobbyStatus,shuffledTeams}=require("../js/group.js");

const p=(slot,name,ready=true,corner=slot)=>({id:"m"+slot,role:"player",player_slot:slot,corner,display_name:name,spotify_ready:ready});

test("ohne Teams: mindestens 3 Spieler, alle mit Spotify",()=>{
  assert.equal(groupLobbyStatus([p(1,"Ana"),p(2,"Ben")],false).missingPlayers,1);
  const s=groupLobbyStatus([p(1,"Ana"),p(2,"Ben",false),p(3,"Cem"),{role:"juror",display_name:"Jo"}],false);
  assert.equal(s.players.length,3);
  assert.deepEqual(s.waitingSpotify,["Ben"]);
  assert.equal(s.ready,false);
  assert.equal(groupLobbyStatus([p(1,"Ana"),p(2,"Ben"),p(3,"Cem")],false).ready,true);
});

test("mit Teams: mindestens 2 Teams",()=>{
  const same=groupLobbyStatus([p(1,"Ana",true,1),p(2,"Ben",true,1),p(3,"Cem",true,1)],true);
  assert.equal(same.needTeams,true);assert.equal(same.ready,false);
  const two=groupLobbyStatus([p(1,"Ana",true,1),p(2,"Ben",true,2)],true);
  assert.deepEqual(two.teams,[1,2]);assert.equal(two.ready,true);
  assert.equal(groupLobbyStatus([p(1,"Ana",true,1)],true).missingPlayers,1);
});

test("voll ab 6 Spielern",()=>{
  assert.equal(groupLobbyStatus([1,2,3,4,5,6].map(n=>p(n,"P"+n)),false).full,true);
  assert.equal(groupLobbyStatus([1,2,3,4,5].map(n=>p(n,"P"+n)),false).full,false);
});

test("Teams mischen: ausgeglichen, 2–3 Teams, alle zugeteilt",()=>{
  const players=[1,2,3,4,5].map(n=>p(n,"P"+n));
  let seed=0.37;const rand=()=>(seed=(seed*9301+0.49297)%1);
  const two=shuffledTeams(players,1,rand);
  assert.deepEqual(two.map(x=>x.id).sort(),players.map(x=>x.id).sort());
  const count=c=>two.filter(x=>x.corner===c).length;
  assert.deepEqual([count(1),count(2)].sort(),[2,3]);
  assert.deepEqual([...new Set(shuffledTeams(players,3,rand).map(x=>x.corner))].sort(),[1,2,3]);
  assert.ok(shuffledTeams(players,5,rand).every(x=>x.corner<=3));
});
