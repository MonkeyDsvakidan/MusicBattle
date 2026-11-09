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
