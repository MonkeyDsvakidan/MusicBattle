const test=require("node:test");
const assert=require("node:assert/strict");
const {radMod,radAlbum,radPickCover,radAlbums,radRing,radLayout,radFocusIndex,radBackoffSeconds,RAD_MAX_SCALE,RAD_MIN_SCALE,radWeight,radSuggest,radSpin,radCountsMap,RAD_OFTEN,radOftenRejected,radCount,radCountText,radProtocol,radWhen,RAD_GROUPS,radColorGroup,radWheels,radNextWheel,RAD_SORTS,RAD_LETTERS,radSortName,radLetter,radSort,radLetterIndex}=require("../tools/rad-logic.js");

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
  const m=radCountsMap([{album_id:"a",listens:"3",rejects:1,rejects_since:"1",last_listen:"2026-11-14T10:00:00Z",last_reject:null}]);
  assert.deepEqual(m.a,{listens:3,rejects:1,since:1,lastListen:"2026-11-14T10:00:00Z",lastReject:""});
  const m2=radCount(m,"a","listen");
  assert.equal(m2.a.listens,4);
  assert.equal(m.a.listens,3,"Original bleibt");
  assert.equal(radCount(m2,"b","reject").b.rejects,1);
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

// ---------- Farb-Räder (W.7) ----------
const fill=(...colors)=>colors.flatMap(([r,g,b,count])=>Array.from({length:count},()=>[r,g,b,255])).flat();

test("Farbgruppe: klare Farben",()=>{
  assert.equal(radColorGroup(fill([220,30,30,16])),"warm","Rot");
  assert.equal(radColorGroup(fill([240,150,20,16])),"warm","Orange");
  assert.equal(radColorGroup(fill([240,220,40,16])),"warm","Gelb");
  assert.equal(radColorGroup(fill([120,70,30,16])),"warm","Braun");
  assert.equal(radColorGroup(fill([40,160,70,16])),"cold","Grün");
  assert.equal(radColorGroup(fill([30,90,220,16])),"cold","Blau");
  assert.equal(radColorGroup(fill([30,200,200,16])),"cold","Türkis");
  assert.equal(radColorGroup(fill([150,50,220,16])),"cold","Violett");
  assert.equal(radColorGroup(fill([240,60,160,16])),"cold","Pink");
});

test("Farbgruppe: ohne Farbe entscheidet die Helligkeit",()=>{
  assert.equal(radColorGroup(fill([10,10,10,16])),"dark");
  assert.equal(radColorGroup(fill([250,250,250,16])),"light");
  assert.equal(radColorGroup(fill([90,90,90,16])),"dark","dunkles Grau");
  assert.equal(radColorGroup(fill([190,190,190,16])),"light","helles Grau");
});

test("Farbgruppe: wenig Farbe auf Schwarz bleibt dunkel, viel Farbe gewinnt",()=>{
  assert.equal(radColorGroup(fill([10,10,10,14],[220,30,30,2])),"dark","ein Achtel rot");
  assert.equal(radColorGroup(fill([10,10,10,10],[220,30,30,6])),"warm","über ein Viertel rot");
  assert.equal(radColorGroup(fill([30,90,220,9],[220,30,30,7])),"cold","mehr Blau als Rot");
});

test("Farbgruppe: durchsichtige Punkte zählen nicht, leeres Bild hat keine Gruppe",()=>{
  assert.equal(radColorGroup([220,30,30,0,10,10,10,255]),"dark");
  assert.equal(radColorGroup([]),"");
  assert.equal(radColorGroup([220,30,30,0]),"");
});

test("Räder: Alle zuerst, leere Gruppen fehlen, Verschiebung geht vor, auto nimmt die berechnete Farbe",()=>{
  const w=radWheels(five,{a:"warm",b:"warm",c:"cold",d:"dark"},{b:"light",c:"auto",d:"pink"});
  assert.deepEqual(w.map(x=>x.key),["all","warm","cold","dark","light"]);
  assert.deepEqual(w[0].albums.map(a=>a.id),["a","b","c","d","e"]);
  assert.deepEqual(w.find(x=>x.key==="warm").albums.map(a=>a.id),["a"]);
  assert.deepEqual(w.find(x=>x.key==="light").albums.map(a=>a.id),["b"]);
  assert.deepEqual(w.find(x=>x.key==="dark").albums.map(a=>a.id),["d"],"alte Verschiebung „pink“ gilt als automatisch");
  assert.deepEqual(w.find(x=>x.key==="cold").albums.map(a=>a.id),["c"]);
  assert.equal(w.find(x=>x.key==="light").name,"Hell");
  assert.deepEqual(radWheels(five).map(x=>x.key),["all"],"ohne Farben nur Alle");
  assert.equal(RAD_GROUPS.length,4);
});

test("Nachbar-Rad: vor und zurück, am Ende von vorne",()=>{
  const w=radWheels(five,{a:"warm",c:"cold"});
  assert.equal(radNextWheel(w,"all",1),"warm");
  assert.equal(radNextWheel(w,"cold",1),"all");
  assert.equal(radNextWheel(w,"all",-1),"cold");
  assert.equal(radNextWheel(w,"gibt-es-nicht",1),"warm");
});

// ---------- Sortieren und Buchstaben (W.10) ----------
const al=(id,artist,year)=>({id,name:`Album ${id}`,artists:artist?[artist]:[],year});
const mixed=[al("1","The Roots","1999"),al("2","Élodie","2010"),al("3","2Pac","1996"),al("4","Nas","1994"),al("5","nas","2001"),al("6","Beyoncé",""),al("7","","2005")];

test("Sortiername und Buchstabe: The, Akzente, Ziffern, kein Künstler",()=>{
  assert.equal(radSortName(mixed[0]),"roots");
  assert.equal(radLetter(mixed[0]),"R");
  assert.equal(radLetter(mixed[1]),"E");
  assert.equal(radLetter(mixed[2]),"#");
  assert.equal(radLetter(mixed[6]),"#");
  assert.equal(radLetter(al("x","Ärzte","")),"A");
  assert.equal(radLetter(al("x","Theodor","")),"T","nur „The “ mit Leerzeichen fällt weg");
});

test("Sortieren nach Künstler: # zuerst, dann A–Z, gleicher Künstler nach Jahr",()=>{
  const ids=radSort(mixed,"artist").map(a=>a.id);
  assert.deepEqual(ids.slice(0,2).sort(),["3","7"],"Ziffern und ohne Künstler vorne");
  assert.deepEqual(ids.slice(2),["6","2","4","5","1"]);
  assert.deepEqual(mixed.map(a=>a.id),["1","2","3","4","5","6","7"],"Original bleibt");
});

test("Sortieren nach Jahr: alt → neu und neu → alt, ohne Jahr am Schluss",()=>{
  assert.deepEqual(radSort(mixed,"old").map(a=>a.id),["4","3","1","5","7","2","6"]);
  assert.deepEqual(radSort(mixed,"new").map(a=>a.id),["2","7","5","1","3","4","6"]);
});

test("Sortieren: gespeichert und Unbekanntes lassen die Reihenfolge",()=>{
  assert.deepEqual(radSort(mixed,"added").map(a=>a.id),["1","2","3","4","5","6","7"]);
  assert.deepEqual(radSort(mixed,"quatsch").map(a=>a.id),["1","2","3","4","5","6","7"]);
  assert.deepEqual(radSort(undefined,"artist"),[]);
});

test("Buchstabenreihe: erster Platz je Buchstabe",()=>{
  const idx=radLetterIndex(radSort(mixed,"artist"));
  assert.deepEqual(idx,{"#":0,B:2,E:3,N:4,R:6});
  assert.equal(RAD_LETTERS.length,27);
  assert.equal(RAD_SORTS.length,4);
});

// ---------- Vorschlag gewichtet und „Oft abgelehnt“ (W.8) ----------
test("Zähler: Ablehnungen seit dem letzten Hören – reject zählt, listen und keep setzen zurück",()=>{
  let m=radCount({},"a","reject");m=radCount(m,"a","reject");
  assert.deepEqual([m.a.rejects,m.a.since],[2,2]);
  m=radCount(m,"a","listen");
  assert.deepEqual([m.a.listens,m.a.rejects,m.a.since],[1,2,0]);
  m=radCount(radCount(m,"a","reject"),"a","keep");
  assert.deepEqual([m.a.listens,m.a.rejects,m.a.since],[1,3,0],"keep zählt nicht als gehört");
});

test("Gewicht: nie gehört 1, gehört und oft abgelehnt seltener",()=>{
  assert.equal(radWeight(undefined),1);
  assert.equal(radWeight({listens:1,since:0}),0.5);
  assert.equal(radWeight({listens:0,since:3}),0.25);
  assert.equal(radWeight({listens:3,since:1}),1/8);
});

test("Vorschlag gewichtet: selten Gehörtes kommt öfter",()=>{
  const counts={a:{listens:9,since:0},b:{listens:0,since:0}};
  const two=five.slice(0,2);
  let a=0,b=0;
  for(let k=0;k<100;k++){radSuggest(two,{counts,rnd:()=>(k+0.5)/100})===0?a++:b++}
  assert.ok(b>=85&&a>=5,`a=${a} b=${b}`);
  assert.equal(radSuggest(two,{counts,rnd:()=>0.999}),1);
  assert.equal(radSuggest(two,{counts,rnd:()=>0}),0);
});

test("Oft abgelehnt: ab 3 seit dem letzten Hören, die meisten zuerst",()=>{
  const counts={a:{since:3},b:{since:5},c:{since:2},d:{since:0}};
  assert.deepEqual(radOftenRejected(five,counts).map(x=>x.id),["b","a"]);
  assert.deepEqual(radOftenRejected(five,null),[]);
  assert.equal(RAD_OFTEN,3);
});

test("Protokoll zeigt auch Behalten",()=>{
  assert.equal(radProtocol([{id:3,album_id:"a",kind:"keep",created_at:"z"}],five)[0].kind,"keep");
});
