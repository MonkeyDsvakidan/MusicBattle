const test=require("node:test");
const assert=require("node:assert/strict");
// quiz.js nutzt im Browser die globalen Funktionen aus artist-filter.js
Object.assign(global,require("../js/artist-filter.js"));
const {QUIZ_POOL_MIN,quizSongKey,quizCoverUrl,quizReleaseYear,buildQuizPool,quizPoolSummary}=require("../js/quiz.js");

let n=0;
const id=()=>`TrackId${String(++n).padStart(12,"0")}`;
const img=w=>({url:`https://i.scdn.co/image/ab67616d0000${w}abc`,width:w,height:w});
function track(name,artist="Rapper",o={}){
  return {id:o.id||id(),name,type:"track",is_local:false,duration_ms:200000,artists:[{id:o.artistId||`Art${artist.replace(/\W/g,"")}000000`,name:artist},...(o.feat?[{id:"Feat0000000000",name:o.feat}]:[])],
    album:{id:"AlbumId0000000001",name:o.album||"Album",album_type:o.albumType||"album",release_date:o.date||"2016-05-06",images:[img(640),img(300),img(64)]}};
}

test("Zeile hat genau die Felder von mb_quiz_set_pool",()=>{
  const [row]=buildQuizPool([{source:"top_short",tracks:[track("Sicko Mode","Travis Scott",{feat:"Drake",date:"2018-08-03"})]}]);
  assert.deepEqual(Object.keys(row).sort(),["album","album_type","artist","cover_url","duration_ms","release_date","release_year","source","spotify_album_id","spotify_track_id","title","rank"].sort());
  assert.equal(row.artist,"Travis Scott, Drake");
  assert.equal(row.release_year,2018);
  assert.equal(row.cover_url,"https://i.scdn.co/image/ab67616d0000300abc");
  assert.equal(row.source,"top_short");
  assert.equal(row.rank,1);
});

test("Doppelte: gleiche ID und gleicher Song in anderer Fassung, Vorrang nach Quelle",()=>{
  const a=track("Lose Yourself","Eminem",{id:"SameId00000000001"});
  const pool=buildQuizPool([
    {source:"saved",tracks:[a,track("Lose Yourself - Remastered 2022","Eminem")]},
    {source:"top_long",tracks:[a]},
    {source:"top_short",tracks:[track("Lose Yourself (feat. Someone)","Eminem"),track("Stan","Eminem")]}
  ]);
  assert.deepEqual(pool.map(r=>`${r.source}:${r.title}`),["top_short:Lose Yourself (feat. Someone)","top_short:Stan"]);
});

test("Podcasts, lokale Dateien, ungültige IDs, Kapitel und Hörbuch-Autoren fliegen raus",()=>{
  const autor=["Kapitel 1","Kapitel 2","Kapitel 3"].map(t=>track(t,"Autor",{artistId:"Autor000000000001"}));
  const pool=buildQuizPool([{source:"top_medium",tracks:[
    {...track("Folge 12 – Podcast"),type:"episode"},
    {...track("Mein Demo"),is_local:true},
    {...track("Kaputt"),id:"x y"},
    track("Chapter 4","Erzähler"),
    ...autor,
    track("Vorwort","Autor",{artistId:"Autor000000000001"}),   // kein Kapitel-Titel, aber Autor
    track("Hörbuch Hamburg Intro","Verlag"),
    track("Goosebumps","Travis Scott"),
    null
  ]}],{isSpoken:t=>/hörbuch/i.test(t.name)});
  assert.deepEqual(pool.map(r=>r.title),["Goosebumps"]);
});

test("Obergrenze und unbekannte Quellen",()=>{
  const many=Array.from({length:40},(_,i)=>track(`Song ${i}`,`Artist ${i}`));
  assert.equal(buildQuizPool([{source:"saved",tracks:many}],{max:25}).length,25);
  assert.equal(buildQuizPool([{source:"podcast",tracks:many}]).length,0);
  assert.equal(buildQuizPool(undefined).length,0);
});

test("Datum, Jahr und Cover",()=>{
  assert.equal(quizReleaseYear("1987"),1987);
  assert.equal(quizReleaseYear("0000"),null);
  assert.equal(quizReleaseYear(""),null);
  const [row]=buildQuizPool([{source:"saved",tracks:[{...track("Alt"),album:{name:"X",release_date:"1999-07",images:[{url:"https://evil.example/x.jpg",width:300}]}}]}]);
  assert.equal(row.release_date,"1999-07");
  assert.equal(row.release_year,1999);
  assert.equal(row.cover_url,null,"fremde Bild-URLs werden nicht übernommen");
  assert.equal(row.spotify_album_id,null);
  assert.equal(quizCoverUrl([img(64)]),"https://i.scdn.co/image/ab67616d000064abc","nur kleines Bild → dieses");
  assert.equal(quizCoverUrl([]),null);
});

test("Song-Schlüssel ignoriert Fassung und Gross-/Kleinschreibung",()=>{
  const k=t=>quizSongKey({name:t,artists:[{name:"Kendrick Lamar"}]});
  assert.equal(k("HUMBLE."),k("Humble"));
  assert.equal(k("Money Trees - Live"),k("Money Trees"));
  assert.notEqual(k("Alright"),k("Money Trees"));
});

test("Zusammenfassung für die Lobby",()=>{
  const s=quizPoolSummary([
    {role:"quizzer",quiz_track_count:20},{role:"quizzer",quiz_track_count:0},{role:"quizzer",quiz_track_count:15},{role:"player",quiz_track_count:99}
  ]);
  assert.deepEqual(s,{tracks:35,people:2,players:3,enough:35>=QUIZ_POOL_MIN});
  assert.equal(quizPoolSummary([]).enough,false);
});

const {quizStandings}=require("../js/quiz.js");
test("Rangliste: Punkte summiert, gleiche Punkte = gleicher Platz",()=>{
  const members=[{id:"a",role:"quizzer",display_name:"Mia"},{id:"b",role:"quizzer",display_name:"Lukas"},{id:"c",role:"quizzer",display_name:"Sara"},{id:"d",role:"quizzer",display_name:"Ben"},{id:"j",role:"juror",display_name:"X"}];
  const answers=[{member_id:"a",points:1000},{member_id:"a",points:0},{member_id:"b",points:600},{member_id:"b",points:400},{member_id:"c",points:500},{member_id:"x",points:900},{member_id:"d",points:null}];
  const r=quizStandings(members,answers);
  assert.deepEqual(r.map(x=>`${x.place}.${x.name}:${x.points}/${x.scored}/${x.answered}`),["1.Lukas:1000/2/2","1.Mia:1000/1/2","3.Sara:500/1/1","4.Ben:0/0/1"]);
  assert.deepEqual(quizStandings([],[]),[]);
});

const {quizRemainingMs,coverPixelSize,quizAnswerText,quizSolutionText,quizRevealPlay}=require("../js/quiz.js");
test("Restzeit: Serverzeit, eigene Uhr falsch → ab dem ersten Sehen",()=>{
  const start=Date.parse("2026-11-10T12:00:00Z"),q={started_at:new Date(start).toISOString(),deadline_at:new Date(start+20000).toISOString()};
  assert.equal(quizRemainingMs(q,start+5000,start+5000),15000);
  assert.equal(quizRemainingMs(q,start+25000,start),0);
  assert.equal(quizRemainingMs(q,start-500,start-500),20000,"kleine Abweichung: noch volle Zeit");
  assert.equal(quizRemainingMs(q,start+3600000+2000,start+3600000),18000,"Uhr eine Stunde vor: ab Sehen");
  assert.equal(quizRemainingMs(q,start-90000+1000,start-90000),19000,"Uhr 90 s nach: ab Sehen");
  assert.equal(quizRemainingMs({},start),0);
});
test("Cover wird über die Zeit schärfer",()=>{
  assert.equal(coverPixelSize(20000),6);
  assert.equal(coverPixelSize(0),64);
  const sizes=[20000,15000,10000,5000,1000].map(r=>coverPixelSize(r));
  assert.deepEqual([...sizes].sort((a,b)=>a-b),sizes,"wächst monoton");
});
test("Antwort- und Lösungstexte",()=>{
  const older={kind:"older",prompt:{options:[{title:"Alt",track_id:"t1"},{title:"Neu",track_id:"t2"}]}};
  const cover={kind:"cover",prompt:{options:[{album:"A"},{album:"B"},{album:"C"},{album:"D"}]}};
  assert.equal(quizAnswerText({kind:"year"},{year:1999}),"1999");
  assert.equal(quizAnswerText(older,{choice:2}),"Neu");
  assert.equal(quizAnswerText(cover,{choice:3}),"C");
  assert.equal(quizAnswerText(cover,null),"keine Antwort");
  assert.equal(quizSolutionText(older,{choice:1,years:[1994,2010]}),"Alt (1994) ist älter als Neu (2010)");
  assert.equal(quizSolutionText({kind:"cover"},{album:"DAMN.",artist:"Kendrick Lamar"}),"DAMN. – Kendrick Lamar");
  assert.equal(quizSolutionText({kind:"year"},{year:2004}),"2004");
  assert.deepEqual(quizRevealPlay(older,{choice:1}),{track_id:"t1",start_ms:30000});
  assert.deepEqual(quizRevealPlay({kind:"cover"},{play:{track_id:"x",start_ms:0}}),{track_id:"x",start_ms:0});
  assert.equal(quizRevealPlay({kind:"year"},{year:1}),null);
});
