const test=require("node:test");
const assert=require("node:assert/strict");
const {looksLikeChapterTitle,isChapterHeavy,chapterArtistIds,genreGroup,effectiveDraftWeight,GENRE_FACTOR}=require("../js/artist-filter.js");

test("Kapitel-Titel werden erkannt",()=>{
  for(const t of ["Kapitel 3","Kapitel 12.4 - Der Plan","Harry Potter – Chapter 12","Chapter 1","Teil 4 - Die Flucht","Folge 7","1. Kapitel","03 Kapitel","Part 2: Das Ende","Track 23","Capítulo 5","Der Insasse (Kapitel 41)"])
    assert.equal(looksLikeChapterTitle(t),true,t);
});

test("normale Songtitel sind keine Kapitel",()=>{
  for(const t of ["Chapter One","Teil von mir","Folgen","Part of Me","Kapitelfehler","Sicko Mode","Tracksuit","Party 2000",""])
    assert.equal(looksLikeChapterTitle(t),false,t);
});

test("Autor erst ab genug Kapiteln",()=>{
  assert.equal(isChapterHeavy(1,1),false);   // einzelner „Part 2“-Song
  assert.equal(isChapterHeavy(2,4),true);
  assert.equal(isChapterHeavy(2,5),false);
  assert.equal(isChapterHeavy(3,10),true);
  assert.equal(isChapterHeavy(0,10),false);
});

test("Kapitel-Künstler aus Songs bestimmen",()=>{
  const tr=(name,id)=>({name,artists:[{id}]});
  const ids=chapterArtistIds([
    tr("Kapitel 1","autor"),tr("Kapitel 2","autor"),tr("Kapitel 3","autor"),
    tr("Part 2","rapper"),tr("Sicko Mode","rapper"),tr("Goosebumps","rapper"),
    tr("Teil 1","mix"),tr("Song","mix"),tr("Teil 2","mix"),tr("Lied","mix"),
    {name:"Kapitel 9",artists:[]},null
  ]);
  assert.deepEqual([...ids].sort(),["autor","mix"]);
});

test("Genre-Gruppen",()=>{
  assert.equal(genreGroup(["german hip hop"]),"hiphop");
  assert.equal(genreGroup(["pop rap","pop"]),"hiphop");
  assert.equal(genreGroup(["trap latino"]),"hiphop");
  assert.equal(genreGroup(["deutschrap"]),"hiphop");
  assert.equal(genreGroup(["r&b","pop"]),"near");
  assert.equal(genreGroup(["dance pop","pop"]),"other");
  assert.equal(genreGroup([]),"unknown");
  assert.equal(genreGroup(undefined),"unknown");
});

test("Hip-Hop wird bevorzugt, Pop bleibt möglich",()=>{
  const rap=effectiveDraftWeight({draftWeight:40,genres:["hip hop"]});
  const pop=effectiveDraftWeight({draftWeight:40,genres:["dance pop"]});
  const unknown=effectiveDraftWeight({draftWeight:40,genres:[]});
  assert.equal(rap,40);
  assert.ok(pop>0&&pop<rap/5,"Pop deutlich seltener, aber nicht 0");
  assert.ok(unknown>pop&&unknown<rap);
  assert.equal(effectiveDraftWeight({}),10*GENRE_FACTOR.unknown,"fehlendes Gewicht = 10");
  // Pool der Freundin: 30 Pop + 10 Rap mit gleichem Grundgewicht → Rap kommt in den meisten Zügen
  const share=(10*rap)/(10*rap+30*pop);
  assert.ok(share>0.7,`Rap-Anteil ${share}`);
});
