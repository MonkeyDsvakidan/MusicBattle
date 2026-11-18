/* rad-logic.js – reine Funktionen für das Albumrad (Roadmap W.4), ohne DOM und ohne Netzwerk.
   Im Browser als globale Funktionen, für `node --test` unten exportiert. */

function radMod(n,m){return ((n%m)+m)%m}

// Gespeichertes Album von Spotify (Eintrag aus /me/albums) auf das Nötige kürzen – so landet es auch im Zwischenspeicher
function radAlbum(item){
  const a=item?.album;
  if(!a||!a.id)return null;
  const images=(a.images||[]).filter(i=>i&&i.url);
  if(!images.length)return null;
  return {
    id:a.id,
    name:a.name||"",
    artists:(a.artists||[]).map(x=>x?.name).filter(Boolean),
    year:String(a.release_date||"").slice(0,4),
    type:a.album_type||"",
    tracks:Number(a.total_tracks)||0,
    added:item.added_at||"",
    uri:a.uri||`spotify:album:${a.id}`,
    url:a.external_urls?.spotify||`https://open.spotify.com/album/${a.id}`,
    cover:radPickCover(images,300),
    coverSmall:radPickCover(images,64)
  };
}

// Kleinstes Bild, das mindestens px breit ist; sonst das grösste. Bilder ohne Breitenangabe gelten als gross.
function radPickCover(images,px){
  const list=(images||[]).filter(i=>i&&i.url).map(i=>({url:i.url,w:Number(i.width)||9999}));
  if(!list.length)return "";
  const enough=list.filter(i=>i.w>=px).sort((x,y)=>x.w-y.w);
  return (enough[0]||list.sort((x,y)=>y.w-x.w)[0]).url;
}

// Liste aus Spotify-Einträgen: ohne Doppelte, ohne Alben ohne Cover; Reihenfolge wie von Spotify (neueste zuerst)
function radAlbums(items){
  const seen=new Set(),out=[];
  for(const it of items||[]){
    const a=radAlbum(it);
    if(!a||seen.has(a.id))continue;
    seen.add(a.id);out.push(a);
  }
  return out;
}

// Umfang einer Ellipse (Näherung von Ramanujan)
function radCircumference(rx,ry){
  const h=((rx-ry)**2)/((rx+ry)**2||1);
  return Math.PI*(rx+ry)*(1+3*h/(10+Math.sqrt(4-3*h)));
}

const RAD_MAX_SCALE=1.3,RAD_MIN_SCALE=0.8,RAD_MAX_COVER=190,RAD_MAX_STRETCH=1.3;

// Masse des Rads für eine Fläche w × h: Halbachsen, Cover-Grösse und Anzahl Plätze.
// Das grösste Cover (vorne, RAD_MAX_SCALE) bleibt mit Rand innerhalb der Fläche.
function radRing(w,h,count,{margin=12}={}){
  const slots=Math.max(1,Math.min(count||0,w<700?14:18));
  let size=80,rx=0,ry=0;
  for(let i=0;i<6;i++){
    const half=size*RAD_MAX_SCALE/2+margin;
    rx=Math.max(40,w/2-half);ry=Math.max(40,h/2-half);
    if(ry>rx*RAD_MAX_STRETCH)ry=rx*RAD_MAX_STRETCH;
    if(rx>ry*RAD_MAX_STRETCH)rx=ry*RAD_MAX_STRETCH;
    size=Math.min(RAD_MAX_COVER,radCircumference(rx,ry)/Math.max(slots,6)*0.92);
  }
  return {rx,ry,size,slots,stepPx:radCircumference(rx,ry)/Math.max(slots,6)};
}

// Welche Alben stehen wo? pos = Album vorne (Kommazahl während des Drehens), count = Anzahl Alben.
// Passen alle Alben aufs Rad, ist es geschlossen. Sonst zeigt es einen Ausschnitt: hinten (gegenüber von vorne)
// blenden Alben ein und aus. Liefert je Platz: key (eindeutig), index (Album), d (Abstand zu vorne),
// x/y (ab Mitte), scale, opacity, tilt (Grad), z.
function radLayout({pos,count,slots,rx,ry,focusDeg=20}){
  if(!count||!slots)return [];
  const n=Math.min(count,slots),closed=count<=slots,step=360/n,out=[];
  const place=(key,index,d,opacity)=>{
    const ang=(focusDeg+d*step)*Math.PI/180,near=(Math.cos(d*step*Math.PI/180)+1)/2;
    out.push({key,index,d,x:rx*Math.cos(ang),y:ry*Math.sin(ang),scale:RAD_MIN_SCALE+(RAD_MAX_SCALE-RAD_MIN_SCALE)*near*near,opacity,tilt:Math.sin(ang)*5,z:Math.round(near*100)});
  };
  if(closed){
    for(let k=0;k<count;k++)place(k,k,radMod(k-pos+count/2,count)-count/2,1);
    return out;
  }
  const center=Math.round(pos),half=Math.ceil(n/2);
  for(let i=center-half;i<=center+half;i++){
    const d=i-pos,edge=n/2-Math.abs(d);
    if(edge<=0)continue;
    place(i,radMod(i,count),d,Math.min(1,edge));
  }
  return out;
}

// Album, das vorne steht
function radFocusIndex(pos,count){return count?radMod(Math.round(pos),count):-1}

// Wartezeit bei „zu viele Anfragen“: Retry-After, sonst 2, 4, 8 s; nach 4 Versuchen oder bei mehr als 60 s aufgeben (null)
function radBackoffSeconds(attempt,retryAfter){
  if(attempt>=4)return null;
  const ra=Number(retryAfter);
  if(Number.isFinite(ra)&&ra>0)return ra>60?null:Math.ceil(ra);
  return 2**(attempt+1);
}

// ---------- Vorschlag und Protokoll (W.5) ----------

// Gewicht eines Albums für den Vorschlag (W.8): selten Gehörtes kommt öfter, seit dem letzten Hören oft
// Abgelehntes seltener. Nie gehört, nie abgelehnt = 1; 1× gehört = ½; 3× abgelehnt seit dem letzten Hören = ¼.
function radWeight(c){return 1/((1+(c?.listens||0))*(1+(c?.since||0)))}

// Album vorschlagen: nicht das aktuelle und keines aus exclude (in dieser Sitzung abgelehnt), zufällig nach radWeight.
// Sind alle ausgeschlossen, zählt nur noch „nicht das aktuelle“. Ohne counts sind alle gleich wahrscheinlich.
// Liefert den Index oder -1.
function radSuggest(albums,{exclude=new Set(),currentId="",counts=null,rnd=Math.random}={}){
  const all=(albums||[]).map((a,i)=>({id:a.id,i,w:counts?radWeight(counts[a.id]):1}));
  if(!all.length)return -1;
  let pool=all.filter(x=>x.id!==currentId&&!exclude.has(x.id));
  if(!pool.length)pool=all.filter(x=>x.id!==currentId);
  if(!pool.length)pool=all;
  const total=pool.reduce((t,x)=>t+x.w,0);
  let r=rnd()*total;
  for(const x of pool){if(r<x.w)return x.i;r-=x.w}
  return pool[pool.length-1].i;
}

// Weg des Rads zum vorgeschlagenen Album: immer vorwärts; ist es weit weg, springt das Rad kurz davor
// (lead Alben) und dreht nur das letzte Stück sichtbar – sonst müssten hunderte Cover geladen werden.
function radSpin(pos,index,count,lead=10){
  const base=Math.round(pos);
  let forward=radMod(index-base,count);
  if(forward===0)forward=count;
  const to=base+forward;
  return {from:forward>lead?to-lead:pos,to};
}

// Zähler aus der Datenbank (Zeilen von mb_rad_counts) als Nachschlagetabelle je Album
function radCountsMap(rows){
  const out={};
  for(const r of rows||[])if(r&&r.album_id)out[r.album_id]={listens:Number(r.listens)||0,rejects:Number(r.rejects)||0,since:Number(r.rejects_since)||0,lastListen:r.last_listen||"",lastReject:r.last_reject||""};
  return out;
}

// Einen Eintrag dazuzählen; verändert counts nicht. since = Ablehnungen seit dem letzten Hören oder Behalten:
// reject zählt hoch, listen und keep setzen auf 0. (Zurücknehmen nach einem Fehler: alten Stand wiederherstellen.)
function radCount(counts,albumId,kind){
  const c={listens:0,rejects:0,since:0,lastListen:"",lastReject:"",...(counts||{})[albumId]};
  if(kind==="listen"){c.listens++;c.since=0}
  else if(kind==="reject"){c.rejects++;c.since++}
  else if(kind==="keep")c.since=0;
  return {...counts,[albumId]:c};
}

// Oft abgelehnt (W.8): Alben mit mindestens min Ablehnungen seit dem letzten Hören oder Behalten, die meisten zuerst
const RAD_OFTEN=3;
function radOftenRejected(albums,counts,min=RAD_OFTEN){
  return (albums||[]).filter(a=>(counts?.[a.id]?.since||0)>=min).sort((x,y)=>counts[y.id].since-counts[x.id].since);
}

// Zeile unter dem Titel: „3× gehört · 1× abgelehnt“
function radCountText(c){
  const l=c?.listens||0,r=c?.rejects||0;
  if(!l&&!r)return "Noch nie gehört";
  return [l?`${l}× gehört`:"Noch nie gehört",r?`${r}× abgelehnt`:""].filter(Boolean).join(" · ");
}

// Protokoll-Zeilen: Einträge (neueste zuerst) mit Albumdaten; nicht mehr gespeicherte Alben bleiben als solche sichtbar
function radProtocol(events,albums){
  const byId=new Map((albums||[]).map(a=>[a.id,a]));
  return (events||[]).filter(e=>e&&e.album_id&&["listen","reject","keep"].includes(e.kind)).map(e=>{
    const a=byId.get(e.album_id);
    return {id:e.id,kind:e.kind,at:e.created_at||"",name:a?a.name:"Nicht mehr gespeichertes Album",artists:a?a.artists.join(", "):"",cover:a?a.coverSmall:""};
  });
}

// Datum fürs Protokoll: „heute 14:05“, „gestern 09:30“, sonst „12.11.2026“
function radWhen(iso,now=new Date()){
  const d=new Date(iso);
  if(!iso||Number.isNaN(d.getTime()))return "";
  const p=n=>String(n).padStart(2,"0"),day=x=>new Date(x.getFullYear(),x.getMonth(),x.getDate()).getTime();
  const diff=Math.round((day(now)-day(d))/86400000),time=`${p(d.getHours())}:${p(d.getMinutes())}`;
  if(diff===0)return `heute ${time}`;
  if(diff===1)return `gestern ${time}`;
  return `${p(d.getDate())}.${p(d.getMonth()+1)}.${d.getFullYear()}`;
}

// ---------- Farb-Räder (W.7) ----------

// Die fünf Farbgruppen (Entscheid des Nutzers 16.11.2026); „all“ ist kein Eintrag hier, sondern das Rad mit allen Alben
const RAD_GROUPS=[{key:"warm",name:"Warm"},{key:"cold",name:"Kalt"},{key:"pink",name:"Violett/Pink"},{key:"dark",name:"Dunkel"},{key:"light",name:"Hell"}];
function radIsGroup(key){return RAD_GROUPS.some(g=>g.key===key)}

// Farbgruppe eines Covers aus seinen Bildpunkten (RGBA-Werte hintereinander, wie von canvas.getImageData).
// Bunte Punkte stimmen nach Farbton ab (gewichtet mit der Sättigung): Rot/Orange/Gelb = warm, Grün/Blau = kalt,
// Violett/Pink = pink. Ist weniger als ein Viertel des Covers bunt, entscheidet die Helligkeit: dunkel oder hell.
function radColorGroup(px){
  const votes={warm:0,cold:0,pink:0};
  let n=0,colorful=0,lightSum=0;
  for(let i=0;i+3<px.length;i+=4){
    if(px[i+3]<128)continue;
    const r=px[i]/255,g=px[i+1]/255,b=px[i+2]/255,max=Math.max(r,g,b),min=Math.min(r,g,b),l=(max+min)/2,d=max-min;
    n++;lightSum+=l;
    const sat=d===0?0:d/(1-Math.abs(2*l-1));
    if(sat<0.25||l<0.12||l>0.92)continue; // grau, fast schwarz oder fast weiss: zählt nicht als bunt
    let h=max===r?((g-b)/d)%6:max===g?(b-r)/d+2:(r-g)/d+4;
    h=(h*60+360)%360;
    votes[h<70||h>=345?"warm":h<260?"cold":"pink"]+=sat;
    colorful++;
  }
  if(!n)return "";
  if(colorful/n>=0.25)return Object.keys(votes).reduce((best,k)=>votes[k]>votes[best]?k:best,"warm");
  return lightSum/n<0.5?"dark":"light";
}

// Räder bilden: zuerst „Alle“, dann jede Farbgruppe, die Alben hat. Eine Verschiebung von Hand (moves) geht der
// berechneten Farbe (colors) vor; „auto“ oder Unbekanntes heisst: berechnete Farbe. Alben ohne Farbe stehen nur in „Alle“.
function radWheels(albums,colors={},moves={}){
  const of=a=>radIsGroup(moves[a.id])?moves[a.id]:radIsGroup(colors[a.id])?colors[a.id]:"";
  const list=albums||[];
  return [{key:"all",name:"Alle",albums:list},...RAD_GROUPS.map(g=>({...g,albums:list.filter(a=>of(a)===g.key)})).filter(w=>w.albums.length)];
}

// Nachbar-Rad beim Wischen (dir +1/-1), am Ende geht es von vorne weiter
function radNextWheel(wheels,key,dir){
  const i=Math.max(0,wheels.findIndex(w=>w.key===key));
  return wheels.length?wheels[radMod(i+dir,wheels.length)].key:"all";
}

// ---------- Sortieren und Buchstaben (W.10) ----------

const RAD_SORTS=[{key:"added",name:"Neu gespeichert"},{key:"artist",name:"Künstler A–Z"},{key:"old",name:"Jahr alt → neu"},{key:"new",name:"Jahr neu → alt"}];
const RAD_LETTERS=["#",..."ABCDEFGHIJKLMNOPQRSTUVWXYZ"];

// Künstlername zum Sortieren: klein, ohne Akzente/Umlaut-Punkte, ohne „The “ am Anfang
function radSortName(a){
  return String(a?.artists?.[0]||"").normalize("NFKD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/^the\s+/,"").trim();
}
// Buchstabe für die Buchstabenreihe: A–Z, alles andere (Ziffern, Zeichen, kein Künstler) unter „#“
function radLetter(a){const c=radSortName(a).charAt(0).toUpperCase();return c>="A"&&c<="Z"?c:"#"}

// Alben eines Rads ordnen; verändert die Liste nicht. „added“ = Reihenfolge von Spotify (zuletzt gespeichert zuerst).
// Künstler: „#“ zuerst, dann A–Z, innerhalb eines Künstlers nach Jahr. Jahr: Alben ohne Jahr stehen am Schluss.
function radSort(albums,key){
  const list=[...(albums||[])];
  const byArtist=(x,y)=>(radLetter(x)==="#")-(radLetter(y)==="#")?(radLetter(x)==="#"?-1:1):radSortName(x).localeCompare(radSortName(y))||String(x.year).localeCompare(String(y.year))||String(x.name).localeCompare(String(y.name));
  if(key==="artist")return list.sort(byArtist);
  if(key==="old"||key==="new"){
    const dir=key==="old"?1:-1;
    return list.sort((x,y)=>(!x.year)-(!y.year)||dir*(Number(x.year)-Number(y.year))||byArtist(x,y));
  }
  return list;
}

// Für eine nach Künstler sortierte Liste: Buchstabe → Platz des ersten Albums mit diesem Buchstaben
function radLetterIndex(albums){
  const out={};
  (albums||[]).forEach((a,i)=>{const l=radLetter(a);if(!(l in out))out[l]=i});
  return out;
}

if(typeof module!=="undefined")module.exports={radMod,radAlbum,radPickCover,radAlbums,radCircumference,radRing,radLayout,radFocusIndex,radBackoffSeconds,RAD_MAX_SCALE,RAD_MIN_SCALE,radWeight,radSuggest,radSpin,radCountsMap,RAD_OFTEN,radOftenRejected,radCount,radCountText,radProtocol,radWhen,RAD_GROUPS,radIsGroup,radColorGroup,radWheels,radNextWheel,RAD_SORTS,RAD_LETTERS,radSortName,radLetter,radSort,radLetterIndex};
