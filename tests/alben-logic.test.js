const test=require("node:test");
const assert=require("node:assert/strict");
const {albBaseTitle,albIsSingle,albMatchesFilter,albBuildIndex,albCandidates,albClassify,albCollectSingles,albPlan,albChunks}=require("../tools/alben-logic.js");

const eno={id:"eno",name:"Eno"},other={id:"x",name:"Jemand"};
const albumDtec={id:"a1",name:"D-TEC",album_type:"album",release_date:"2020-05-01",artists:[eno]};
const albumBest={id:"a2",name:"Best Of",album_type:"compilation",release_date:"2023-01-01",artists:[eno]};
const singleAlbum={id:"s1",name:"Ferrari",album_type:"single",release_date:"2020-03-01",artists:[eno]};
const tr=(id,name,album,extra={})=>({id,uri:`spotify:track:${id}`,type:"track",name,artists:[eno],album,duration_ms:180000,...extra});

test("Titel werden vergleichbar gemacht",()=>{
  assert.equal(albBaseTitle("Ferrari (feat. Mero) - Radio Edit"),"ferrari");
  assert.equal(albBaseTitle("Ferrari [with X]"),"ferrari");
  assert.equal(albBaseTitle("Déjà Vu"),"deja vu");
  assert.equal(albBaseTitle("Hip-Hop"),"hip hop");
  assert.equal(albBaseTitle(""),"");
});

test("nur Songs von Singles zählen als Single",()=>{
  assert.equal(albIsSingle(tr("t1","Ferrari",singleAlbum)),true);
  assert.equal(albIsSingle(tr("t2","Ferrari",albumDtec)),false);
  assert.equal(albIsSingle({...tr("t3","Ferrari",singleAlbum),is_local:true}),false);
  assert.equal(albIsSingle({...tr("t4","Folge",singleAlbum),type:"episode"}),false);
  assert.equal(albIsSingle(null),false);
});

test("Filter für ein Album prüft Album- und Künstlernamen",()=>{
  assert.equal(albMatchesFilter(albumDtec,"d-tec"),true);
  assert.equal(albMatchesFilter(albumDtec,"D TEC"),true);
  assert.equal(albMatchesFilter(albumDtec,"eno"),true);
  assert.equal(albMatchesFilter(albumDtec,"Mero"),false);
  assert.equal(albMatchesFilter(albumDtec,""),true);
});

test("Index enthält nur gespeicherte Alben (keine Singles) und respektiert den Filter",()=>{
  const saved=[{album:albumDtec,tracks:[tr("d1","Ferrari",albumDtec)]},{album:singleAlbum,tracks:[tr("s9","Ferrari",singleAlbum)]},{album:albumBest,tracks:[tr("b1","Ferrari",albumBest)]}];
  assert.deepEqual(albBuildIndex(saved).get("ferrari").map(c=>c.track.id),["d1","b1"]);
  assert.deepEqual(albBuildIndex(saved,"D-TEC").get("ferrari").map(c=>c.track.id),["d1"]);
});

test("Kandidaten brauchen gleichen Titel und gemeinsamen Künstler",()=>{
  const fremd={...tr("f1","Ferrari",albumDtec),artists:[other]};
  const index=albBuildIndex([{album:albumDtec,tracks:[tr("d1","Ferrari",albumDtec),fremd,tr("d2","Anderer Song",albumDtec)]}]);
  assert.deepEqual(albCandidates(index,tr("t1","Ferrari - Single Version",singleAlbum)).map(c=>c.track.id),["d1"]);
});

test("gleiche ISRC = sicher, Album vor Compilation; andere ISRC mit ähnlicher Länge = unsicher; sonst nichts",()=>{
  const single=tr("t1","Ferrari",singleAlbum,{external_ids:{isrc:"DE1"}});
  const cands=[{track:tr("b1","Ferrari",albumBest),album:albumBest},{track:tr("d1","Ferrari",albumDtec),album:albumDtec}];
  let r=albClassify(single,cands,()=> "DE1");
  assert.equal(r.status,"sure");assert.equal(r.target.track.id,"d1");assert.equal(r.others.length,1);
  r=albClassify(single,cands,id=>id==="b1"?"DE1":"DE2");
  assert.equal(r.status,"sure");assert.equal(r.target.track.id,"b1");
  r=albClassify(single,cands,()=> "DE9");
  assert.equal(r.status,"unsure");assert.equal(r.target.track.id,"d1");
  const long=[{track:tr("d1","Ferrari",albumDtec,{duration_ms:240000}),album:albumDtec}];
  assert.equal(albClassify(single,long,()=> "DE9").status,"none");
  assert.equal(albClassify(single,[],()=> "DE1").status,"none");
});

test("Singles werden mit allen Fundstellen gesammelt",()=>{
  const s=tr("t1","Ferrari",singleAlbum),a=tr("d1","Ferrari",albumDtec);
  const pls=[{id:"p1",name:"Rap",items:[{position:0,track:a},{position:1,track:s},{position:3,track:s}]},{id:"p2",name:"Auto",items:[{position:5,track:s},{position:6,track:null}]}];
  const out=albCollectSingles(pls,[s]);
  assert.equal(out.length,1);
  assert.equal(out[0].liked,true);
  assert.deepEqual(out[0].places.map(p=>`${p.playlistId}:${p.position}`),["p1:1","p1:3","p2:5"]);
});

test("Plan: einfügen absteigend an der Stelle der Single, Single entfernen, liken/entliken",()=>{
  const s=tr("t1","Ferrari",singleAlbum),s2=tr("t2","Lila",singleAlbum),a="spotify:track:d1",a2="spotify:track:d2",x=tr("x1","Anderes",albumDtec);
  const pls=[
    {id:"p1",name:"Rap",items:[{position:0,track:x},{position:1,track:s},{position:2,track:s2}]},
    {id:"p2",name:"Schon drin",items:[{position:0,track:{...x,uri:a}},{position:1,track:s}]},
    {id:"p3",name:"Ohne",items:[{position:0,track:x}]}
  ];
  const plan=albPlan(pls,[s,{...x,uri:a2}],new Map([[s.uri,a],[s2.uri,a2]]));
  assert.equal(plan.playlistOps.length,2);
  assert.deepEqual(plan.playlistOps[0].inserts,[{uri:a2,position:2},{uri:a,position:1}]);
  assert.deepEqual(plan.playlistOps[0].removes,[s.uri,s2.uri]);
  assert.deepEqual(plan.playlistOps[1].inserts,[]);
  assert.deepEqual(plan.playlistOps[1].removes,[s.uri]);
  assert.deepEqual(plan.likeUris,[a,a2],"immer liken (idempotent)");
  assert.deepEqual(plan.unlikeUris,[s.uri]);
});

test("Plan fügt die Albumversion pro Playlist nur einmal ein",()=>{
  const s=tr("t1","Ferrari",singleAlbum),a="spotify:track:d1";
  const plan=albPlan([{id:"p1",name:"Rap",items:[{position:0,track:s},{position:4,track:s}]}],[],new Map([[s.uri,a]]));
  assert.deepEqual(plan.playlistOps[0].inserts,[{uri:a,position:0}]);
});

test("Pakete für die Spotify-Grenzen",()=>{
  assert.deepEqual(albChunks([1,2,3,4,5],2),[[1,2],[3,4],[5]]);
  assert.deepEqual(albChunks([],40),[]);
});

test("Liste nach Künstler, dann Album, dann Position im Album sortiert",()=>{
  const {albSortRows}=require("../tools/alben-logic.js");
  const row=(artist,title,album,no)=>({track:{name:title,artists:[{name:artist}],album:{name:"Single "+title}},decision:album?{target:{album:{name:album},track:{track_number:no}}}:{target:null}});
  const rows=[row("Eno","Ferrari","D-TEC",5),row("apache 207","Roller","Platte",2),row("Eno","Lila","Sehr gut",1),row("Eno","Intro","D-TEC",1),row("Ufo361","Ohne",null),row("Eno","Ohne Album",null)];
  assert.deepEqual(albSortRows(rows).map(r=>r.track.name),["Roller","Intro","Ferrari","Lila","Ohne Album","Ohne"]);
});

// ---------- Doppelte (W.2) ----------
const L=require("../tools/alben-logic.js");
const ape={id:"ape",name:"Apache 207"};
const platte={id:"pl",name:"Platte",album_type:"album",release_date:"2019-11-01",artists:[ape]};
const deluxe={id:"dx",name:"Platte (Deluxe)",album_type:"album",release_date:"2020-03-01",artists:[ape]};
const rollerSingle={id:"rs",name:"Roller",album_type:"single",release_date:"2019-08-01",artists:[ape]};
const tk=(id,name,album,isrc)=>({id,uri:"spotify:track:"+id,type:"track",name,artists:[ape],album,duration_ms:180000,external_ids:isrc?{isrc}:{}});
const rS=tk("r1","Roller",rollerSingle,"DE1"),rA=tk("r2","Roller",platte,"DE1"),rD=tk("r3","Roller",deluxe,"DE1"),rLive=tk("r4","Roller (Live)",platte,"DE9"),z=tk("z1","Anderer",platte,"DE5"),y=tk("y1","Noch einer",platte,"DE6");

test("lockerer Titel entfernt Versionshinweise",()=>{
  assert.equal(L.albLooseTitle("Roller (Live)"),"roller");
  assert.equal(L.albLooseTitle("Roller (2011 Remaster)"),"roller");
  assert.equal(L.albLooseTitle("Roller - Radio Edit"),"roller");
  assert.equal(L.albLooseTitle("Live Forever"),"live forever");
});

test("Gruppen: gleiche Aufnahme über Playlists hinweg = sicher, andere Aufnahme = unsicher, Einzelstücke fehlen",()=>{
  const pls=[{id:"p1",name:"A",items:[{position:0,track:rS},{position:1,track:z}]},{id:"p2",name:"B",items:[{position:0,track:rA},{position:1,track:rLive}]}];
  const groups=L.albDupGroups(L.albCollectVersions(pls,[rD]),{savedAlbumIds:new Set(["pl"])});
  const sure=groups.filter(g=>g.kind==="sure"),unsure=groups.filter(g=>g.kind==="unsure");
  assert.equal(sure.length,1);
  assert.deepEqual(sure[0].versions.map(v=>v.track.id).sort(),["r1","r2","r3"]);
  assert.equal(sure[0].keep,rA.uri,"gespeichertes Album bleibt");
  assert.equal(unsure.length,1);
  assert.deepEqual(unsure[0].versions.map(v=>v.track.id).sort(),["r1","r2","r3","r4"]);
});

test("gleicher Song zweimal in einer Playlist ist ein Doppel, in zwei Playlists nicht",()=>{
  let g=L.albDupGroups(L.albCollectVersions([{id:"p1",name:"A",items:[{position:0,track:z},{position:1,track:z}]}],[]));
  assert.equal(g.length,1);assert.equal(g[0].kind,"sure");
  g=L.albDupGroups(L.albCollectVersions([{id:"p1",name:"A",items:[{position:0,track:z}]},{id:"p2",name:"B",items:[{position:0,track:z}]}],[z]));
  assert.equal(g.length,0);
});

test("ohne gespeichertes Album: Album vor Single, Filter nach Künstler/Album",()=>{
  const vm=L.albCollectVersions([{id:"p1",name:"A",items:[{position:0,track:rS},{position:1,track:rD}]}],[]);
  assert.equal(L.albDupGroups(vm)[0].keep,rD.uri);
  assert.equal(L.albDupGroups(vm,{filter:"apache"}).length,1);
  assert.equal(L.albDupGroups(vm,{filter:"Eno"}).length,0);
});

test("Plan: andere Version ersetzt, bleibende rückt an erste Stelle, Doppel weg, Likes umgestellt",()=>{
  const map=L.albDupMapping([{kind:"sure",versions:[{track:rS},{track:rA},{track:rD}],keep:rA.uri},{kind:"sure",versions:[{track:z}],keep:z.uri}]);
  const pls=[
    {id:"p1",name:"Nur Single",items:[{position:0,track:y},{position:1,track:rS},{position:2,track:z}]},
    {id:"p2",name:"Single vor Album",items:[{position:0,track:rS},{position:1,track:y},{position:2,track:rA}]},
    {id:"p3",name:"Schon gut",items:[{position:0,track:rA},{position:1,track:y}]},
    {id:"p4",name:"Album zuerst + Deluxe",items:[{position:0,track:rA},{position:1,track:null},{position:2,track:rD}]},
    {id:"p5",name:"z doppelt",items:[{position:0,track:z},{position:1,track:y},{position:2,track:z}]}
  ];
  const plan=L.albDupPlan(pls,[rS,rD,y],map);
  const op=id=>plan.playlistOps.find(o=>o.playlistId===id);
  assert.deepEqual(op("p1"),{playlistId:"p1",name:"Nur Single",removes:[rS.uri],inserts:[{uri:rA.uri,position:1}],removedCount:0});
  assert.deepEqual(op("p2").removes.sort(),[rS.uri,rA.uri].sort());
  assert.deepEqual(op("p2").inserts,[{uri:rA.uri,position:0}]);
  assert.equal(op("p2").removedCount,1);
  assert.equal(op("p3"),undefined);
  assert.deepEqual(op("p4").removes,[rD.uri]);assert.deepEqual(op("p4").inserts,[]);
  assert.deepEqual(op("p5").removes,[z.uri]);assert.deepEqual(op("p5").inserts,[{uri:z.uri,position:0}]);assert.equal(op("p5").removedCount,1);
  assert.deepEqual(plan.unlikeUris.sort(),[rS.uri,rD.uri].sort());
  assert.deepEqual(plan.likeUris,[rA.uri]);
});

test("unsichere Gruppe überstimmt die sichere darin",()=>{
  const map=L.albDupMapping([{kind:"sure",versions:[{track:rS},{track:rA}],keep:rA.uri},{kind:"unsure",versions:[{track:rS},{track:rA},{track:rLive}],keep:rLive.uri}]);
  assert.equal(map.get(rS.uri),rLive.uri);assert.equal(map.get(rA.uri),rLive.uri);assert.equal(map.get(rLive.uri),rLive.uri);
});

test("Plan nachgespielt wie Spotify: Ergebnis-Reihenfolge stimmt",()=>{
  const run=(items,op)=>{let l=items.map(it=>it.track?.uri||null);l=l.filter(u=>!op.removes.includes(u));for(const ins of op.inserts)l.splice(ins.position,0,ins.uri);return l};
  const map=L.albDupMapping([{kind:"sure",versions:[{track:rS},{track:rA},{track:rD}],keep:rA.uri},{kind:"sure",versions:[{track:z}],keep:z.uri}]);
  const cases=[
    [[y,rS,z],[y,rA,z]],
    [[rS,y,rA],[rA,y]],
    [[rD,z,rS,y,z,rA,null],[rA,z,y,null]],
    [[z,rA,z,rA,rS],[z,rA]]
  ];
  for(const [input,expected] of cases){
    const pl={id:"p",name:"P",items:input.map((track,position)=>({position,track}))};
    const op=L.albDupPlan([pl],[],map).playlistOps[0];
    assert.deepEqual(run(pl.items,op),expected.map(t=>t?.uri||null));
  }
});

test("Wartezeit bei Spotify 429: verdoppeln, Retry-After beachten, irgendwann aufgeben",()=>{
  assert.deepEqual([0,1,2,3,4,5,6,7].map(a=>L.albBackoffSeconds(a,null)),[2,4,8,16,32,64,120,120]);
  assert.equal(L.albBackoffSeconds(0,"30"),30);
  assert.equal(L.albBackoffSeconds(5,"3"),64);
  assert.equal(L.albBackoffSeconds(8,null),null);
  assert.equal(L.albBackoffSeconds(0,"3600"),null,"Spotify verlangt über 2 Min. → aufgeben");
});

test("Sortierung beachtet CD-Nummer",()=>{
  const row=(title,disc,no)=>({track:{name:title,artists:[{name:"Eno"}],album:{name:"D-TEC"},disc_number:disc,track_number:no},decision:{target:null}});
  assert.deepEqual(L.albSortRows([row("CD2-1",2,1),row("CD1-9",1,9),row("CD1-1",1,1)]).map(r=>r.track.name),["CD1-1","CD1-9","CD2-1"]);
});

test("Filter: nur Aufnahmen, die zum Filter passen, werden als sicher vorgeschlagen",()=>{
  const live=tk("l1","Roller (Live)",{id:"lv",name:"Live in Wien",album_type:"album",artists:[ape]},"DE9");
  const pls=[{id:"p1",name:"A",items:[{position:0,track:rS},{position:1,track:rA},{position:2,track:live},{position:3,track:live}]}];
  const g=L.albDupGroups(L.albCollectVersions(pls,[]),{filter:"Platte"});
  assert.deepEqual(g.filter(x=>x.kind==="sure").map(x=>x.versions.map(v=>v.track.id).sort().join()),["r1,r2"]);
});

test("Runden: höchstens max URIs pro Entfernen, jede Gruppe ganz",()=>{
  const ts=[...Array(5)].map((_,i)=>[tk("s"+i,"Song"+i,rollerSingle,"S"+i),tk("a"+i,"Song"+i,platte,"S"+i)]);
  const pl={id:"p",name:"P",items:ts.flat().map((track,position)=>({position,track}))};
  const map=L.albDupMapping(ts.map(([sv,av])=>({kind:"sure",versions:[{track:sv},{track:av}],keep:av.uri})));
  const sub=L.albDupLimit(pl,map,4);
  const op=L.albDupPlan([pl],[],sub).playlistOps[0];
  assert.ok(op.removes.length<=4);
  assert.equal(sub.size%2,0,"Gruppen nie halb");
  assert.ok(sub.size>0);
});

test("Runden: eine einzelne Gruppe mit mehr als max URIs bleibt ganz – Entfernen wird in Blöcke geteilt",()=>{
  // 150 Versionen desselben Songs in einer Playlist, eine bleibt → 149 zu entfernende URIs in einer Gruppe
  const versions=[...Array(150)].map((_,i)=>tk("v"+i,"Song",rollerSingle,"I"+i));
  const pl={id:"p",name:"P",items:versions.map((track,position)=>({position,track}))};
  const map=L.albDupMapping([{kind:"unsure",versions:versions.map(t=>({track:t})),keep:versions[0].uri}]);
  const sub=L.albDupLimit(pl,map,100);
  const op=L.albDupPlan([pl],[],sub).playlistOps[0];
  assert.equal(sub.size,150,"Gruppe wird nicht geteilt");
  assert.ok(op.removes.length>100,"diese Runde allein hätte zu viele URIs");
  const parts=L.albChunks(op.removes,100);
  assert.deepEqual(parts.map(p=>p.length),[100,op.removes.length-100]);
  assert.deepEqual(parts.flat(),op.removes,"nichts geht verloren");
});
