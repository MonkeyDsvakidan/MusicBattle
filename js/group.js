/* group.js – Mehrspieler (M.2): reine Lobby-Logik für Gruppenräume (3–6 Personen, optional Teams).
   Klassisches Skript, globale Namen; auch für node --test exportiert. Server prüft dasselbe in mb_start_draft. */

const GROUP_MIN_PLAYERS=3,GROUP_MAX_PLAYERS=6,GROUP_MAX_TEAMS=3;

// Stand der Lobby: wer spielt, welche Teams, was fehlt noch bis «Draft starten»
function groupLobbyStatus(members,teamMode){
  const players=(members||[]).filter(m=>m.role==="player").sort((a,b)=>a.player_slot-b.player_slot);
  const teams=[...new Set(players.map(p=>p.corner))].filter(Boolean).sort((a,b)=>a-b);
  const waitingSpotify=players.filter(p=>!p.spotify_ready).map(p=>p.display_name);
  const missingPlayers=teamMode?Math.max(0,2-players.length):Math.max(0,GROUP_MIN_PLAYERS-players.length);
  const needTeams=Boolean(teamMode)&&players.length>=2&&teams.length<2;
  return{players,teams,waitingSpotify,missingPlayers,needTeams,full:players.length>=GROUP_MAX_PLAYERS,
    ready:!missingPlayers&&!needTeams&&!waitingSpotify.length};
}

// «Teams mischen»: zufällig und ausgeglichen auf 2–3 Teams (so viele wie gerade benutzt, mindestens 2)
function shuffledTeams(players,teamsInUse,rand=Math.random){
  const k=Math.max(2,Math.min(GROUP_MAX_TEAMS,teamsInUse||2));
  const list=[...(players||[])];
  for(let i=list.length-1;i>0;i--){const j=Math.floor(rand()*(i+1));[list[i],list[j]]=[list[j],list[i]]}
  return list.map((p,i)=>({id:p.id,corner:i%k+1}));
}

// ---------- Draft (M.3) ----------
// Wer ist dran: reihum Ecke 1, 2, 3 … (wie mb_draft_turn_slot); nur Picks der normalen Runden zählen
function draftTurnCorner(picks,cornerCount){
  const n=(picks||[]).filter(p=>p.round_number<=5).length;
  return n%Math.max(2,cornerCount||2)+1;
}
// Spieler einer Ecke, nach Platz sortiert (ohne Teams genau eine Person)
function cornerMembers(members,corner){
  return (members||[]).filter(m=>m.role==="player"&&(m.corner??m.player_slot)===corner).sort((a,b)=>a.player_slot-b.player_slot);
}
// Team: wer zieht beim nächsten Zug der Ecke? Reihum nach Platz – 1. Zug die erste Person, 2. Zug die zweite …
function draftCaptain(members,picks,corner){
  const team=cornerMembers(members,corner);if(!team.length)return null;
  const done=(picks||[]).filter(p=>p.player_slot===corner&&p.round_number<=5).length;
  return team[done%team.length];
}
// Name einer Ecke: mit Teams «Team n», sonst der Name der Person
function cornerLabel(members,corner,teamMode){
  if(teamMode)return`Team ${corner}`;
  return cornerMembers(members,corner)[0]?.display_name||`Spieler ${corner}`;
}

// ---------- Battle (M.4) ----------
// Ecken, die in einer Runde spielen (wie mb_corners_in_play): Entscheidung (Runde 6) nur die Punktgleichen
function cornersInPlay(room,roundNumber){
  if(Number(roundNumber)===6)return (room?.sudden_corners?.length?room.sudden_corners:[1,2]).map(Number);
  return Array.from({length:Math.max(2,Number(room?.corner_count)||2)},(_,i)=>i+1);
}
// Wer wählt den Song einer Ecke: wer den Künstler dieser Runde gezogen hat (im Team die Person, aus deren
// Spotify er stammt); ist sie nicht mehr im Raum, die erste Person der Ecke
function songChooser(members,pick,corner){
  const team=cornerMembers(members,corner);
  return team.find(m=>pick&&m.user_id===pick.player_user_id)||team[0]||null;
}

if(typeof module!=="undefined")module.exports={GROUP_MIN_PLAYERS,GROUP_MAX_PLAYERS,GROUP_MAX_TEAMS,groupLobbyStatus,shuffledTeams,draftTurnCorner,cornerMembers,draftCaptain,cornerLabel,cornersInPlay,songChooser};
