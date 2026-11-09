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
  assert.deepEqual(plan.likeUris,[a]);
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
