const test=require("node:test");
const assert=require("node:assert/strict");
const {radMod,radAlbum,radPickCover,radAlbums,radRing,radLayout,radFocusIndex,radBackoffSeconds,RAD_MAX_SCALE,RAD_MIN_SCALE,radSuggest,radSpin,radCountsMap,radCount,radCountText,radProtocol,radWhen}=require("../tools/rad-logic.js");

const imgs=[{url:"big",width:640},{url:"mid",width:300},{url:"small",width:64}];
const item=(id,extra={})=>({added_at:"2026-11-01T10:00:00Z",album:{id,name:`Album ${id}`,album_type:"album",total_tracks:12,release_date:"2020-05-01",artists:[{name:"Eno"}],images:imgs,uri:`spotify:album:${id}`,external_urls:{spotify:`https://open.spotify.com/album/${id}`},...extra}});

test("radMod bleibt auch bei negativen Zahlen im Bereich",()=>{
  assert.equal(radMod(-1,5),4);
  assert.equal(radMod(7,5),2);
});

test("Cover: kleinstes Bild, das gross genug ist, sonst das grösste",()=>{
  assert.equal(radPickCover(imgs,300),"mid");
  assert.equal(radPickCover(imgs,64),"small");
  assert.equal(radPickCover(imgs,301),"big");
  assert.equal(radPickCover([{url:"a",width:64},{url:"b",width:160}],300),"b");
  assert.equal(radPickCover([],300),"");
});

test("Album wird auf das Nötige gekürzt",()=>{
  const a=radAlbum(item("x1"));
  assert.deepEqual(a,{id:"x1",name:"Album x1",artists:["Eno"],year:"2020",type:"album",tracks:12,added:"2026-11-01T10:00:00Z",uri:"spotify:album:x1",url:"https://open.spotify.com/album/x1",cover:"mid",coverSmall:"small"});
});

test("Alben ohne Cover und Doppelte fallen weg, Reihenfolge bleibt",()=>{
  const list=radAlbums([item("a"),item("b",{images:[]}),item("a"),{album:null},item("c")]);
  assert.deepEqual(list.map(a=>a.id),["a","c"]);
});

test("Rad passt in die Fläche: Handy 375 × 667",()=>{
  const r=radRing(375,667,200);
  assert.equal(r.slots,14);
  assert.ok(r.rx+r.size*RAD_MAX_SCALE/2<=375/2,"vorderstes Cover ragt nicht über den Rand");
  assert.ok(r.ry+r.size*RAD_MAX_SCALE/2<=667/2);
  assert.ok(r.size>=44,`Cover gross genug zum Tippen (${r.size})`);
  assert.ok(r.ry<=r.rx*1.3+1e-9,"nicht zu stark gestreckt");
});

test("Rad passt in die Fläche: Desktop 1280 × 720",()=>{
  const r=radRing(1280,720,200);
  assert.equal(r.slots,18);
  assert.ok(r.ry+r.size*RAD_MAX_SCALE/2<=720/2);
  assert.ok(r.rx<=r.ry*1.3+1e-9);
});

test("Wenige Alben: so viele Plätze wie Alben",()=>{
  assert.equal(radRing(1280,720,5).slots,5);
  assert.equal(radRing(1280,720,0).slots,1);
});

test("Geschlossenes Rad: jedes Album genau einmal, vorne am grössten",()=>{
  const L=radLayout({pos:2,count:6,slots:14,rx:100,ry:100,focusDeg:0});
  assert.equal(L.length,6);
  assert.deepEqual(L.map(p=>p.index).sort(),[0,1,2,3,4,5]);
  const front=L.find(p=>p.index===2);
  assert.ok(Math.abs(front.x-100)<1e-9&&Math.abs(front.y)<1e-9);
  assert.ok(Math.abs(front.scale-RAD_MAX_SCALE)<1e-9);
  assert.ok(L.every(p=>p.opacity===1));
  assert.ok(L.every(p=>p.scale<=front.scale+1e-9&&p.scale>=RAD_MIN_SCALE-1e-9));
});

test("Offenes Rad: Ausschnitt um das vordere Album, hinten ausgeblendet, läuft endlos um",()=>{
  const L=radLayout({pos:0,count:100,slots:14,rx:100,ry:130});
  assert.ok(L.length<=15&&L.length>=13);
  assert.equal(new Set(L.map(p=>p.key)).size,L.length,"Schlüssel eindeutig");
  assert.equal(new Set(L.map(p=>p.index)).size,L.length,"kein Album doppelt");
  assert.ok(L.some(p=>p.index===99),"vor dem ersten Album kommt das letzte");
  assert.equal(L.find(p=>p.d===0).index,0);
  const back=L.filter(p=>Math.abs(p.d)>6);
  assert.ok(back.every(p=>p.opacity<1));
  assert.ok(L.filter(p=>Math.abs(p.d)<=5).every(p=>p.opacity===1));
});

test("Offenes Rad beim Drehen: zwischen zwei Alben verschiebt sich alles stetig",()=>{
  const a=radLayout({pos:10,count:100,slots:14,rx:100,ry:100}).find(p=>p.key===11);
  const b=radLayout({pos:10.5,count:100,slots:14,rx:100,ry:100}).find(p=>p.key===11);
  const c=radLayout({pos:11,count:100,slots:14,rx:100,ry:100}).find(p=>p.key===11);
  assert.ok(a.scale<b.scale&&b.scale<c.scale);
  assert.equal(c.d,0);
});

test("Vorderes Album",()=>{
  assert.equal(radFocusIndex(-1,10),9);
  assert.equal(radFocusIndex(10.4,10),0);
  assert.equal(radFocusIndex(3,0),-1);
});

test("Wartezeit bei zu vielen Anfragen",()=>{
  assert.equal(radBackoffSeconds(0,null),2);
  assert.equal(radBackoffSeconds(2,null),8);
  assert.equal(radBackoffSeconds(0,"5"),5);
  assert.equal(radBackoffSeconds(0,"600"),null);
  assert.equal(radBackoffSeconds(4,null),null);
});

// ---------- Vorschlag und Protokoll (W.5) ----------
const five=["a","b","c","d","e"].map(id=>({id,name:`Album ${id}`,artists:["Eno"],coverSmall:`c-${id}`}));

test("Vorschlag: nie das aktuelle, nie ein in dieser Sitzung abgelehntes",()=>{
  for(let k=0;k<50;k++){
    const i=radSuggest(five,{exclude:new Set(["b","c"]),currentId:"a",rnd:()=>k/50});
    assert.ok(["d","e"].includes(five[i].id));
  }
});

test("Vorschlag: alles abgelehnt → wieder aus allen ausser dem aktuellen; ein Album → dieses; keine → -1",()=>{
  const i=radSuggest(five,{exclude:new Set(["a","b","c","d","e"]),currentId:"a",rnd:()=>0});
  assert.equal(five[i].id,"b");
  assert.equal(radSuggest([five[0]],{currentId:"a"}),0);
  assert.equal(radSuggest([]),-1);
  assert.equal(radSuggest(five,{rnd:()=>0.9999}),4);
});

test("Dreh zum Vorschlag: immer vorwärts, weite Wege werden abgekürzt",()=>{
  assert.deepEqual(radSpin(3,6,100),{from:3,to:6});
  assert.deepEqual(radSpin(3,60,100),{from:50,to:60});
  assert.deepEqual(radSpin(98,2,100),{from:98,to:102});
  assert.deepEqual(radSpin(-1,0,100),{from:-1,to:0});
  assert.deepEqual(radSpin(4,4,100),{from:94,to:104});
});

test("Zähler: aus der Datenbank, dazuzählen und zurücknehmen",()=>{
  const m=radCountsMap([{album_id:"a",listens:"3",rejects:1,last_listen:"2026-11-14T10:00:00Z",last_reject:null}]);
  assert.deepEqual(m.a,{listens:3,rejects:1,lastListen:"2026-11-14T10:00:00Z",lastReject:""});
  const m2=radCount(m,"a","listen");
  assert.equal(m2.a.listens,4);
  assert.equal(m.a.listens,3,"Original bleibt");
  assert.equal(radCount(m2,"b","reject").b.rejects,1);
  assert.equal(radCount({},"b","reject",-1).b.rejects,0);
});

test("Zählertext",()=>{
  assert.equal(radCountText(undefined),"Noch nie gehört");
  assert.equal(radCountText({listens:3,rejects:1}),"3× gehört · 1× abgelehnt");
  assert.equal(radCountText({listens:0,rejects:2}),"Noch nie gehört · 2× abgelehnt");
  assert.equal(radCountText({listens:1,rejects:0}),"1× gehört");
});

test("Protokoll: Albumdaten dazu, unbekannte Alben bleiben sichtbar, kaputte Einträge fallen weg",()=>{
  const rows=radProtocol([{id:2,album_id:"b",kind:"reject",created_at:"x"},{id:1,album_id:"zz",kind:"listen",created_at:"y"},{id:0,album_id:"a",kind:"anderes"},null],five);
  assert.equal(rows.length,2);
  assert.deepEqual(rows[0],{id:2,kind:"reject",at:"x",name:"Album b",artists:"Eno",cover:"c-b"});
  assert.equal(rows[1].name,"Nicht mehr gespeichertes Album");
});

test("Datum im Protokoll",()=>{
  const now=new Date(2026,10,14,18,0);
  assert.equal(radWhen(new Date(2026,10,14,9,5).toISOString(),now),"heute 09:05");
  assert.equal(radWhen(new Date(2026,10,13,23,59).toISOString(),now),"gestern 23:59");
  assert.equal(radWhen(new Date(2026,10,2,12,0).toISOString(),now),"02.11.2026");
  assert.equal(radWhen("",now),"");
});
