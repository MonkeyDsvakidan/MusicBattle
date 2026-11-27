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

if(typeof module!=="undefined")module.exports={GROUP_MIN_PLAYERS,GROUP_MAX_PLAYERS,GROUP_MAX_TEAMS,groupLobbyStatus,shuffledTeams};
