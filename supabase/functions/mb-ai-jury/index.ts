import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const jurors = [
  {key:"theme",name:"Themenschnüffler",role:"Themen-Purist"},
  {key:"vibe",name:"Vibejunkie",role:"Atmosphäre-Juror"},
  {key:"lyrics",name:"Kollegah der Lyricboss",role:"Lyrics-Juror"},
  {key:"underdog",name:"Snoop Underdogg",role:"David-vs-Goliath-Juror"},
  {key:"connoisseur",name:"Dr. Körnli",role:"Musikkenner-Juror"}
];

const cors={
  "Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods":"POST, OPTIONS"
};
function out(data:unknown,status=200){return new Response(JSON.stringify(data),{status,headers:{...cors,"Content-Type":"application/json"}})}
function norm(s:string){return String(s||"").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g," ").trim()}
function extractJson(text:string){const a=text.indexOf("{"),b=text.lastIndexOf("}");if(a<0||b<a)throw new Error("No JSON object returned");return JSON.parse(text.slice(a,b+1))}
function sleep(ms:number){return new Promise(r=>setTimeout(r,ms))}
async function timedFetch(input:string|URL|Request,init:RequestInit={},timeoutMs=4500){
  const ctrl=new AbortController();
  const timer=setTimeout(()=>ctrl.abort(),timeoutMs);
  try{
    return await fetch(input,{...init,signal:ctrl.signal});
  }finally{
    clearTimeout(timer);
  }
}

async function geniusMatch(title:string,artist:string){
  const token=Deno.env.get("GENIUS_ACCESS_TOKEN");
  if(!token)return{found:false};
  try{
    const r=await timedFetch(`https://api.genius.com/search?q=${encodeURIComponent(`${title} ${artist}`)}`,{headers:{Authorization:`Bearer ${token}`}},3500);
    if(!r.ok)return{found:false};
    const data=await r.json();
    const hit=data?.response?.hits?.[0]?.result;
    if(!hit)return{found:false};
    let detail:any=null;
    try{
      const dr=await timedFetch(`https://api.genius.com/songs/${hit.id}`,{headers:{Authorization:`Bearer ${token}`}},3500);
      if(dr.ok)detail=(await dr.json())?.response?.song||null;
    }catch{}
    const description=detail?.description?.plain?String(detail.description.plain).replace(/\s+/g," ").slice(0,900):null;
    return{
      found:true,
      genius_id:String(hit.id||""),
      matched_title:hit.title||title,
      matched_artist:hit.primary_artist?.name||artist,
      release_date:detail?.release_date_for_display||detail?.release_date||null,
      album:detail?.album?.name||null,
      featured:(detail?.featured_artists||[]).map((x:any)=>x?.name).filter(Boolean).slice(0,5),
      description
    };
  }catch{return{found:false}}
}

async function lrclibLyrics(title:string,artist:string,album:string|null,durationMs:number|null){
  try{
    const q=new URLSearchParams({track_name:title,artist_name:artist});
    if(album)q.set("album_name",album);
    if(durationMs)q.set("duration",String(Math.round(durationMs/1000)));
    let r=await timedFetch("https://lrclib.net/api/get?"+q.toString(),{headers:{"User-Agent":"MusicBattle/1.1"}},3500);
    if(r.status===404){
      const s=new URLSearchParams({track_name:title,artist_name:artist});
      r=await timedFetch("https://lrclib.net/api/search?"+s.toString(),{headers:{"User-Agent":"MusicBattle/1.1"}},3500);
      if(!r.ok)return{found:false};
      const rows=await r.json();
      const hit=(Array.isArray(rows)?rows:[]).find((x:any)=>norm(x?.trackName)===norm(title)&&norm(x?.artistName).includes(norm(artist)))||(Array.isArray(rows)?rows[0]:null);
      if(!hit)return{found:false};
      return{
        found:true,
        source:"lrclib",
        id:hit.id||null,
        instrumental:Boolean(hit.instrumental),
        plain_lyrics:String(hit.plainLyrics||"").slice(0,4500),
        has_synced:Boolean(hit.syncedLyrics),
        matched_title:hit.trackName||title,
        matched_artist:hit.artistName||artist,
        matched_album:hit.albumName||album||null,
        duration_seconds:Number(hit.duration||0)||null
      };
    }
    if(!r.ok)return{found:false};
    const hit=await r.json();
    return{
      found:true,
      source:"lrclib",
      id:hit.id||null,
      instrumental:Boolean(hit.instrumental),
      plain_lyrics:String(hit.plainLyrics||"").slice(0,4500),
      has_synced:Boolean(hit.syncedLyrics),
      matched_title:hit.trackName||title,
      matched_artist:hit.artistName||artist,
      matched_album:hit.albumName||album||null,
      duration_seconds:Number(hit.duration||0)||null
    };
  }catch{return{found:false}}
}

async function lastFmEvidence(title:string,artist:string,mbid?:string|null){
  const key=Deno.env.get("LASTFM_API_KEY");
  if(!key)return{found:false,setup_missing:true};
  const base="https://ws.audioscrobbler.com/2.0/";
  async function get(method:string,extra:Record<string,string>){
    const q=new URLSearchParams({method,api_key:key,format:"json",autocorrect:"1",...extra});
    const r=await timedFetch(base+"?"+q.toString(),{},3000);
    if(!r.ok)return null;
    const j=await r.json();
    return j?.error?null:j;
  }
  try{
    const trackArgs=mbid?{mbid}:{artist,track:title};
    const [info,tags,artistTags]=await Promise.all([
      get("track.getInfo",trackArgs),
      get("track.getTopTags",trackArgs),
      get("artist.getTopTags",{artist})
    ]);
    const t=info?.track||null;
    const topTags=(tags?.toptags?.tag||[]).slice(0,10).map((x:any)=>({name:x?.name,count:Number(x?.count||0)})).filter((x:any)=>x.name);
    const aTags=(artistTags?.toptags?.tag||[]).slice(0,8).map((x:any)=>String(x?.name||"")).filter(Boolean);
    return{
      found:Boolean(t||topTags.length||aTags.length),
      listeners:t?.listeners?Number(t.listeners):null,
      playcount:t?.playcount?Number(t.playcount):null,
      track_tags:topTags,
      artist_tags:aTags,
      wiki_summary:t?.wiki?.summary?String(t.wiki.summary).replace(/<[^>]+>/g," ").replace(/\s+/g," ").slice(0,800):null,
      matched_title:t?.name||title,
      matched_artist:t?.artist?.name||artist
    };
  }catch{return{found:false}}
}

async function listenBrainzEvidence(a:any,b:any){
  const empty={found:false,tags:[],total_listen_count:null,total_user_count:null};
  const ids=[a?.found?a.mbid:null,b?.found?b.mbid:null].filter(Boolean);
  if(!ids.length)return[empty,empty];
  try{
    const csv=ids.join(",");
    const [metaRes,popRes]=await Promise.all([
      timedFetch("https://api.listenbrainz.org/1/metadata/recording/?recording_mbids="+encodeURIComponent(csv)+"&inc=artist%20tag%20release",{headers:{"Accept":"application/json","User-Agent":"MusicBattle/1.2"}},3500),
      timedFetch("https://api.listenbrainz.org/1/popularity/recording",{
        method:"POST",
        headers:{"Content-Type":"application/json","Accept":"application/json","User-Agent":"MusicBattle/1.2"},
        body:JSON.stringify({recording_mbids:ids})
      },3500)
    ]);
    const meta=metaRes.ok?await metaRes.json():{};
    const pop=popRes.ok?await popRes.json():[];
    const one=(mb:any)=>{
      if(!mb?.found||!mb?.mbid)return empty;
      const m=meta?.[mb.mbid]||{};
      const p=(Array.isArray(pop)?pop:[]).find((x:any)=>x?.recording_mbid===mb.mbid)||{};
      const rawTags=m?.tag?.recording||m?.tag||[];
      const tags=(Array.isArray(rawTags)?rawTags:[]).map((x:any)=>({
        name:String(x?.tag||x?.name||"").trim(),
        count:Number(x?.count||0)||0
      })).filter((x:any)=>x.name).sort((x:any,y:any)=>y.count-x.count).slice(0,12);
      return{
        found:Boolean(tags.length||p?.total_listen_count!=null||p?.total_user_count!=null),
        tags,
        total_listen_count:p?.total_listen_count==null?null:Number(p.total_listen_count),
        total_user_count:p?.total_user_count==null?null:Number(p.total_user_count)
      };
    };
    return[one(a),one(b)];
  }catch{return[empty,empty]}
}

async function musicBrainzMatch(title:string,artist:string,isrc?:string|null){
  try{
    const query=isrc
      ? `isrc:${String(isrc).replace(/[^A-Za-z0-9]/g,"")}`
      : `recording:"${title.replace(/"/g,"")}" AND artist:"${artist.replace(/"/g,"")}"`;
    const r=await timedFetch(`https://musicbrainz.org/ws/2/recording/?query=${encodeURIComponent(query)}&fmt=json&limit=3`,{
      headers:{
        "User-Agent":"MusicBattle/1.1 (https://monkeydsvakidan.github.io/MusicBattle/)",
        "Accept":"application/json"
      }
    },4000);
    if(!r.ok)return{found:false};
    const data=await r.json();
    const rows=Array.isArray(data?.recordings)?data.recordings:[];
    const wantArtist=norm(artist),wantTitle=norm(title);
    const ranked=rows.map((x:any)=>{
      const credited=(x?.["artist-credit"]||[]).map((c:any)=>c?.artist?.name||c?.name||"").join(" ");
      const base=Number(x?.score||0);
      const titleOk=norm(x?.title).includes(wantTitle)||wantTitle.includes(norm(x?.title));
      const artistOk=norm(credited).includes(wantArtist)||wantArtist.includes(norm(credited));
      return{x,rank:base+(titleOk?20:0)+(artistOk?20:0)};
    }).sort((a:any,b:any)=>b.rank-a.rank);
    const hit=ranked[0]?.x;
    if(!hit)return{found:false};
    return{
      found:true,
      mbid:hit.id||null,
      match_score:Number(hit.score||0),
      title:hit.title||title,
      artist:(hit["artist-credit"]||[]).map((c:any)=>c?.artist?.name||c?.name||"").filter(Boolean).join(", ")||artist,
      first_release_date:hit["first-release-date"]||null,
      length_ms:Number(hit.length||0)||null,
      releases:(hit.releases||[]).slice(0,5).map((r:any)=>({
        title:r?.title||null,date:r?.date||null,country:r?.country||null,status:r?.status||null,
        primary_type:r?.["release-group"]?.["primary-type"]||null
      }))
    };
  }catch{return{found:false}}
}

function validateResult(value:any){
  if(!Array.isArray(value?.jurors)||value.jurors.length!==5)return{ok:false,reason:"exactly five jurors required"};
  const expected=new Set(jurors.map(j=>j.key));
  for(const r of value.jurors){
    const key=String(r?.key||"");
    if(!expected.has(key))return{ok:false,reason:`unexpected or duplicate juror ${key}`};
    expected.delete(key);
    let a=Number(r?.score_a),b=Number(r?.score_b);
    const confidence=["high","medium","low"].includes(String(r?.confidence))?String(r.confidence):"medium";
    if(!((a===10&&(b===8||b===9))||(b===10&&(a===8||a===9))))return{ok:false,reason:`invalid score ${key}`};
    if(confidence==="low"&&Math.abs(a-b)!==1){if(a>b)b=9;else a=9}
    r.score_a=a;r.score_b=b;r.confidence=confidence;
    if(String(r?.reason||"").trim().length<12)return{ok:false,reason:`reason missing ${key}`};
    if(!Array.isArray(r?.evidence_used))r.evidence_used=[];
  }
  return{ok:true};
}

Deno.serve(async(req)=>{
  try{
    if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
    if(req.method!=="POST")return out({error:"POST required"},405);

    const url=Deno.env.get("SUPABASE_URL")!,anon=Deno.env.get("SUPABASE_ANON_KEY")!,service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const auth=req.headers.get("Authorization")||"";
    const userClient=createClient(url,anon,{global:{headers:{Authorization:auth}}}),admin=createClient(url,service);
    const {data:userData,error:userError}=await userClient.auth.getUser();
    if(userError||!userData?.user)return out({error:"unauthorized",detail:userError?.message||null},401);

    const body=await req.json(),roomId=String(body.room_id||""),roundId=String(body.round_id||"");
    if(!roomId||!roundId)return out({error:"room_id and round_id required"},400);

    const {data:membership}=await admin.from("mb_members").select("id").eq("room_id",roomId).eq("user_id",userData.user.id).limit(1);
    if(!membership?.length)return out({error:"not a room member"},403);

    const [{data:round,error:roundError},{data:subs,error:subsError}]=await Promise.all([
      admin.from("mb_rounds").select("theme,category,round_number").eq("id",roundId).eq("room_id",roomId).single(),
      admin.from("mb_submissions").select("player_slot,song_name,artist_name,album_name,spotify_track_id,spotify_release_date,spotify_duration_ms,spotify_album_type,spotify_isrc,spotify_explicit").eq("round_id",roundId).order("player_slot")
    ]);
    if(roundError)return out({error:"round lookup failed",detail:roundError.message},500);
    if(subsError)return out({error:"submission lookup failed",detail:subsError.message},500);
    if(!round||!subs||subs.length!==2)return out({error:"round requires two submissions"},409);

    const {data:picks,error:picksError}=await admin.from("mb_draft_picks")
      .select("player_slot,artist_name,artist_draft_weight,artist_sources")
      .eq("room_id",roomId).eq("round_number",round.round_number).order("player_slot");
    if(picksError)return out({error:"draft evidence lookup failed",detail:picksError.message},500);

    const juryStarted=Date.now();
    console.log("jury:start",roomId,roundId);
    const metaStarted=Date.now();
    const [geniusA,geniusB,lyricsA,lyricsB]=await Promise.all([
      geniusMatch(subs[0].song_name,subs[0].artist_name),
      geniusMatch(subs[1].song_name,subs[1].artist_name),
      lrclibLyrics(subs[0].song_name,subs[0].artist_name,subs[0].album_name,subs[0].spotify_duration_ms),
      lrclibLyrics(subs[1].song_name,subs[1].artist_name,subs[1].album_name,subs[1].spotify_duration_ms)
    ]);
    const musicBrainzA=await musicBrainzMatch(subs[0].song_name,subs[0].artist_name,subs[0].spotify_isrc);
    await sleep(1050);
    const musicBrainzB=await musicBrainzMatch(subs[1].song_name,subs[1].artist_name,subs[1].spotify_isrc);
    const [listenBrainzA,listenBrainzB]=await listenBrainzEvidence(musicBrainzA,musicBrainzB);
    console.log("jury:metadata_ms",Date.now()-metaStarted);
    const [lastFmA,lastFmB]=await Promise.all([
      lastFmEvidence(subs[0].song_name,subs[0].artist_name,musicBrainzA?.mbid||null),
      lastFmEvidence(subs[1].song_name,subs[1].artist_name,musicBrainzB?.mbid||null)
    ]);

    const pickA=(picks||[]).find((p:any)=>Number(p.player_slot)===1)||null;
    const pickB=(picks||[]).find((p:any)=>Number(p.player_slot)===2)||null;

    function evidence(sub:any,genius:any,mb:any,pick:any){
      return{
        identity:{artist:sub.artist_name,song:sub.song_name,album:sub.album_name||null,spotify_track_id:sub.spotify_track_id||null,isrc:sub.spotify_isrc||null},
        spotify:{release_date:sub.spotify_release_date||null,duration_ms:sub.spotify_duration_ms||null,album_type:sub.spotify_album_type||null,explicit:sub.spotify_explicit??null},
        genius:genius?.found?genius:null,
        musicbrainz:mb?.found?mb:null,
        personal_listening:pick?{draft_weight:pick.artist_draft_weight??null,sources:Array.isArray(pick.artist_sources)?pick.artist_sources:[]}:null
      };
    }
    const evidenceA={...evidence(subs[0],geniusA,musicBrainzA,pickA),listenbrainz:listenBrainzA?.found?listenBrainzA:null,lastfm:lastFmA?.found?lastFmA:null,lyrics:lyricsA?.found?{source:"lrclib",instrumental:lyricsA.instrumental,matched_title:lyricsA.matched_title,matched_artist:lyricsA.matched_artist,has_synced:lyricsA.has_synced,plain_lyrics:lyricsA.plain_lyrics}:null};
    const evidenceB={...evidence(subs[1],geniusB,musicBrainzB,pickB),listenbrainz:listenBrainzB?.found?listenBrainzB:null,lastfm:lastFmB?.found?lastFmB:null,lyrics:lyricsB?.found?{source:"lrclib",instrumental:lyricsB.instrumental,matched_title:lyricsB.matched_title,matched_artist:lyricsB.matched_artist,has_synced:lyricsB.has_synced,plain_lyrics:lyricsB.plain_lyrics}:null};

    // Deterministic evidence engine: data decides; AI may only rewrite the wording.
    const STOP=new Set(["der","die","das","den","dem","des","ein","eine","einer","einem","einen","und","oder","mit","für","fur","auf","im","in","am","an","zu","von","vor","nach","durch","the","a","an","and","or","for","of","to","in","on","at","with","your","you","song","track","banger"]);
    const motifRules=[
      {test:["nacht","night","2 uhr","3 uhr","late"],terms:["nacht","night","midnight","late","dark","dunkel","moon","mond"]},
      {test:["stadt","city","grossstadt","uber"],terms:["stadt","city","street","strasse","road","block","downtown","lights","lichter","traffic"]},
      {test:["sommer","summer","strand","beach","cabrio","sunny","sonnen"],terms:["summer","sommer","sun","sonne","beach","strand","heat","heiss","warm","ocean","meer"]},
      {test:["roadtrip","fahrt","auto","car"],terms:["drive","driving","ride","road","car","auto","highway","fahrt","cruise"]},
      {test:["regen","rain"],terms:["rain","regen","storm","sturm","wet","nass","cloud","wolke"]},
      {test:["schnee","snow"],terms:["snow","schnee","cold","kalt","ice","eis","winter"]},
      {test:["frühling","fruhling","spring"],terms:["spring","frühling","fruhling","warm","sun","sonne","fresh","neu"]},
      {test:["sonntag","sunday","morgen","morning"],terms:["morning","morgen","sunrise","sonnenaufgang","coffee","kaffee","wake","aufwach"]},
      {test:["montag","monday"],terms:["monday","montag","work","arbeit","tired","müde","mude","alarm"]},
      {test:["freitag","friday","samstag","saturday","party","club","oaff","festival"],terms:["party","club","dance","tanzen","night","nacht","drink","crowd","crowd","festival","stage","bühne","buhne","turn up"]},
      {test:["underground","cypher"],terms:["underground","cypher","bars","mic","microphone","rap","freestyle","crew"]},
      {test:["gym","motivation","motivations"],terms:["gym","workout","train","training","strong","stark","power","kraft","grind","hustle","push"]},
      {test:["verliebt","love"],terms:["love","liebe","heart","herz","kiss","kuss","baby","together","zusammen","romance"]},
      {test:["herzschmerz","heartbreak"],terms:["heartbreak","broken","heart","herz","pain","schmerz","cry","tränen","tranen","miss","alone","allein"]},
      {test:["alle gegen dich"],terms:["against","gegen","enemy","feind","alone","allein","fight","kampf","hate","hass"]},
      {test:["selbstvertrauen","maximum","niemand kann"],terms:["confidence","confident","boss","king","queen","best","winner","win","sieg","power","stark"]},
      {test:["luxus","luxury"],terms:["luxury","luxus","money","geld","rich","reich","diamond","diamant","car","auto","rolex","designer"]},
      {test:["diss"],terms:["diss","beef","enemy","feind","hate","hass","fake","bitch","opp","ops","clown"]},
      {test:["gangster","polizei","police","flucht"],terms:["gangster","police","polizei","run","renn","escape","flucht","crime","verbrechen","sirens","sirene","street"]},
      {test:["superheld","superhero"],terms:["hero","held","save","retten","power","kraft","fight","kampf","world","welt"]},
      {test:["bösewicht","bosewicht","villain","final boss"],terms:["villain","böse","bose","evil","dark","dunkel","boss","danger","gefahr","power"]},
      {test:["wrestling","arena","einlauf","spiel"],terms:["arena","fight","kampf","champion","winner","sieg","game","spiel","crowd","intro","entrance"]},
      {test:["nostalgie","90er","2000er"],terms:["remember","erinner","back then","damals","old","früher","fruher","memory","memories","nostalgia"]},
      {test:["welt endet","letzte song","alles oder nichts","finale","letzte chance","entscheidenden"],terms:["last","letzte","final","finale","end","ende","world","welt","goodbye","abschied","die","sterben","forever","für immer","fur immer"]}
    ];
    function textWords(s:any){return norm(String(s||"")).split(/\s+/).filter((x:string)=>x&&x.length>2&&!STOP.has(x))}
    function themeTerms(){
      const base=norm(`${round.theme||""} ${round.category||""}`);
      const set=new Set(textWords(base));
      for(const rule of motifRules)if(rule.test.some((x:string)=>base.includes(norm(x))))for(const t of rule.terms)set.add(norm(t));
      return [...set].filter(Boolean);
    }
    const terms=themeTerms();
    const targetYear=Number((String(round.theme||"")+" "+String(round.category||"")).match(/(?:19|20)\d{2}/)?.[0]||0)||null;
    function matchTerms(text:any){
      const n=norm(String(text||"")); if(!n)return[];
      return terms.filter((t:string)=>t.length>2&&(n.includes(t)||textWords(n).some((w:string)=>w===t))).slice(0,12);
    }
    function releaseYears(e:any){
      const vals=[e?.spotify?.release_date,e?.genius?.release_date,e?.musicbrainz?.first_release_date,...(e?.musicbrainz?.releases||[]).map((r:any)=>r?.date)];
      return [...new Set(vals.map((x:any)=>Number(String(x||"").match(/(?:19|20)\d{2}/)?.[0]||0)).filter(Boolean))];
    }
    function tagNames(e:any){
      return [
        ...(e?.listenbrainz?.tags||[]).map((x:any)=>x?.name),
        ...(e?.lastfm?.track_tags||[]).map((x:any)=>x?.name),
        ...(e?.lastfm?.artist_tags||[])
      ].filter(Boolean).map(String);
    }
    function scoreTheme(e:any){
      const titleHits=matchTerms(`${e?.identity?.song||""} ${e?.identity?.album||""}`);
      const lyricHits=matchTerms(e?.lyrics?.plain_lyrics||"");
      const descHits=matchTerms(`${e?.genius?.description||""} ${e?.lastfm?.wiki_summary||""}`);
      const tags=tagNames(e),tagHits=matchTerms(tags.join(" "));
      let score=titleHits.length*4+lyricHits.length*1.6+descHits.length*2.3+tagHits.length*3.2;
      const years=releaseYears(e);
      if(targetYear){
        if(years.includes(targetYear))score+=16;
        else if(years.some((y:number)=>Math.abs(y-targetYear)===1))score+=4;
        else if(years.length)score-=12;
      }
      return{score,titleHits,lyricHits,descHits,tagHits,years};
    }
    function scoreLyrics(e:any){
      const lyricHits=matchTerms(e?.lyrics?.plain_lyrics||"");
      const titleHits=matchTerms(e?.identity?.song||"");
      const descHits=matchTerms(e?.genius?.description||"");
      const available=Boolean(e?.lyrics?.plain_lyrics);
      return{score:lyricHits.length*3+titleHits.length*1.5+descHits.length,lyricHits,titleHits,descHits,available};
    }
    function scoreVibe(e:any){
      const tags=tagNames(e),tagHits=matchTerms(tags.join(" "));
      const descHits=matchTerms(`${e?.genius?.description||""} ${e?.lastfm?.wiki_summary||""}`);
      const lyricHits=matchTerms(e?.lyrics?.plain_lyrics||"");
      return{score:tagHits.length*4+descHits.length*1.5+lyricHits.length*.55,tagHits,descHits,lyricHits,tags:tags.slice(0,8)};
    }
    function popularity(e:any){
      const users=Number(e?.listenbrainz?.total_user_count||e?.lastfm?.listeners||0);
      const listens=Number(e?.listenbrainz?.total_listen_count||e?.lastfm?.playcount||0);
      const weight=Number(e?.personal_listening?.draft_weight||0);
      return{
        users,listens,weight,
        value:(users?Math.log10(users+1)*2:0)+(listens?Math.log10(listens+1):0)+(weight?Math.log10(weight+1)*.5:0)
      };
    }
    function stableSide(key:string){
      const s=`${roundId}:${key}:${subs[0].spotify_track_id||subs[0].song_name}:${subs[1].spotify_track_id||subs[1].song_name}`;
      let h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619)}
      return(h>>>0)%2===0?"a":"b";
    }
    function decide(key:string,aScore:number,bScore:number,coverage:number){
      const diff=aScore-bScore;
      const winner=Math.abs(diff)<.01?stableSide(key):(diff>0?"a":"b");
      const gap=Math.abs(diff);
      const confidence=coverage>=5&&gap>=8?"high":coverage>=3&&gap>=2.5?"medium":"low";
      const margin=confidence==="high"&&gap>=8?"clear":"close";
      return{winner,confidence,margin,gap};
    }
    function scorePair(winner:string,margin:string){return winner==="a"?{score_a:10,score_b:margin==="clear"?8:9}:{score_a:margin==="clear"?8:9,score_b:10}}
    function fmtNum(n:number|null){if(!n)return"keine Zahl";return n>=1000000?(n/1000000).toFixed(n>=10000000?0:1)+" Mio.":n>=1000?Math.round(n/1000)+"k":String(n)}
    function label(side:string){const e=side==="a"?evidenceA:evidenceB;return `"${e?.identity?.song||"Song "+side.toUpperCase()}"`}
    function termText(xs:string[]){return xs.length?xs.slice(0,4).join(", "):"wenige direkte Motivtreffer"}

    const themeA=scoreTheme(evidenceA),themeB=scoreTheme(evidenceB);
    const lyricA=scoreLyrics(evidenceA),lyricB=scoreLyrics(evidenceB);
    const vibeA=scoreVibe(evidenceA),vibeB=scoreVibe(evidenceB);
    const popA=popularity(evidenceA),popB=popularity(evidenceB);

    const themeDecision=decide("theme",themeA.score,themeB.score,
      themeA.titleHits.length+themeA.lyricHits.length+themeA.descHits.length+themeA.tagHits.length+themeB.titleHits.length+themeB.lyricHits.length+themeB.descHits.length+themeB.tagHits.length+(targetYear?2:0));
    const lyricsDecision=decide("lyrics",lyricA.score,lyricB.score,
      (lyricA.available?2:0)+(lyricB.available?2:0)+lyricA.lyricHits.length+lyricB.lyricHits.length+lyricA.descHits.length+lyricB.descHits.length);
    const vibeDecision=decide("vibe",vibeA.score,vibeB.score,
      vibeA.tagHits.length+vibeB.tagHits.length+vibeA.descHits.length+vibeB.descHits.length);

    function underdogScore(side:"a"|"b"){
      const p=side==="a"?popA:popB,other=side==="a"?popB:popA;
      const ownTheme=side==="a"?themeA.score:themeB.score,otherTheme=side==="a"?themeB.score:themeA.score;
      let rarity=(other.value-p.value)*3;
      if(!p.users&&!p.listens&&p.weight)rarity+=(other.weight-p.weight)/Math.max(10,Math.abs(other.weight)+Math.abs(p.weight))*5;
      const themePenalty=Math.max(0,otherTheme-ownTheme-6)*.45;
      return rarity-themePenalty;
    }
    const underA=underdogScore("a"),underB=underdogScore("b");
    const underDecision=decide("underdog",underA,underB,
      Number(Boolean(popA.users||popA.listens||popA.weight))+Number(Boolean(popB.users||popB.listens||popB.weight))+2);

    function connoisseurScore(e:any,t:any,p:any){
      let score=t.score*.22;
      const albumType=String(e?.spotify?.album_type||"").toLowerCase();
      if(albumType==="album")score+=2.5;
      if(e?.musicbrainz?.found)score+=1.5;
      if(p.users||p.listens)score+=Math.max(0,8-p.value)*.55;
      if(e?.lyrics?.plain_lyrics)score+=.8;
      if(tagNames(e).length)score+=.6;
      return score;
    }
    const conA=connoisseurScore(evidenceA,themeA,popA),conB=connoisseurScore(evidenceB,themeB,popB);
    const conDecision=decide("connoisseur",conA,conB,
      Number(Boolean(evidenceA?.musicbrainz))+Number(Boolean(evidenceB?.musicbrainz))+Number(Boolean(popA.users||popA.listens))+Number(Boolean(popB.users||popB.listens))+2);

    function yearReason(winner:string){
      if(!targetYear)return"";
      const w=winner==="a"?themeA:themeB,o=winner==="a"?themeB:themeA;
      const wy=w.years.length?w.years.join("/"):"ohne bestätigtes Jahr",oy=o.years.length?o.years.join("/"):"ohne bestätigtes Jahr";
      return ` Für die Jahresvorgabe ${targetYear} liegen beim Gewinner ${wy} vor; beim anderen Song ${oy}.`;
    }
    const raw:any[]=[];
    {
      const d=themeDecision,w=d.winner==="a"?themeA:themeB;
      const facts=[...w.titleHits,...w.lyricHits,...w.descHits,...w.tagHits];
      raw.push({key:"theme",...scorePair(d.winner,d.margin),confidence:d.confidence,evidence_used:["Titel","Lyrics","Genius/Tags","Release-Daten"].filter(Boolean),
        reason:`${label(d.winner)} gewinnt beim Themenfit: Die stärksten belegten Motive sind ${termText([...new Set(facts)])}.${yearReason(d.winner)}`});
    }
    {
      const d=vibeDecision,w=d.winner==="a"?vibeA:vibeB;
      const support=w.tagHits.length?`passende Tags/Moods wie ${termText(w.tagHits)}`:`Kontextmotive wie ${termText([...w.descHits,...w.lyricHits])}`;
      raw.push({key:"vibe",...scorePair(d.winner,d.margin),confidence:d.confidence,evidence_used:["ListenBrainz/Last.fm-Tags","Genius-Kontext","Lyrics-Stimmung"],
        reason:`${label(d.winner)} bekommt den Vibe-Punkt durch ${support}. Audioeigenschaften wie BPM oder Bass werden dabei nicht erfunden.`});
    }
    {
      const d=lyricsDecision,w=d.winner==="a"?lyricA:lyricB;
      const src=w.available?"LRCLIB-Text":"Titel und Genius-Kontext";
      raw.push({key:"lyrics",...scorePair(d.winner,d.margin),confidence:d.confidence,evidence_used:[src],
        reason:`${label(d.winner)} liegt textlich vorn: Aus ${src} ergeben sich stärkere Themenmotive rund um ${termText([...w.lyricHits,...w.descHits,...w.titleHits])}. Es werden keine Textzeilen erfunden oder zitiert.`});
    }
    {
      const d=underDecision,wp=d.winner==="a"?popA:popB,op=d.winner==="a"?popB:popA;
      let fact="";
      if(wp.users||op.users)fact=`ListenBrainz/Last.fm zeigt etwa ${fmtNum(wp.users)} gegenüber ${fmtNum(op.users)} erfassten Hörern/Nutzern`;
      else if(wp.listens||op.listens)fact=`die erfassten Listen liegen bei ${fmtNum(wp.listens)} gegenüber ${fmtNum(op.listens)}`;
      else fact=`das persönliche Draft-Gewicht liegt bei ${Math.round(wp.weight||0)} gegenüber ${Math.round(op.weight||0)}`;
      raw.push({key:"underdog",...scorePair(d.winner,d.margin),confidence:d.confidence,evidence_used:["ListenBrainz/Last.fm-Popularität","persönliches Draft-Signal"],
        reason:`${label(d.winner)} erhält den Underdog-Punkt: ${fact}. Der Pick bleibt zugleich thematisch konkurrenzfähig.`});
    }
    {
      const d=conDecision,we=d.winner==="a"?evidenceA:evidenceB,wp=d.winner==="a"?popA:popB;
      const albumType=we?.spotify?.album_type?String(we.spotify.album_type):"Release";
      const date=releaseYears(we)[0]||"ohne eindeutiges Jahr";
      raw.push({key:"connoisseur",...scorePair(d.winner,d.margin),confidence:d.confidence,evidence_used:["MusicBrainz-Releasekontext","Albumtyp","Track-Popularität"],
        reason:`${label(d.winner)} ist der interessantere Katalog-Pick: als ${albumType} mit Release-Kontext ${date} und ${wp.users?fmtNum(wp.users)+" erfassten Nutzern":"begrenztem Popularitätssignal"} ist die Wahl weniger offensichtlich, ohne einen angeblichen Deep Cut zu erfinden.`});
    }

    // Optional AI rewrite: wording only. Winners, scores and evidence stay deterministic.
    let usedModel="deterministic";
    const apiKey=Deno.env.get("OPENROUTER_API_KEY");
    if(apiKey){
      try{
        const rewritePrompt=`Formuliere diese fünf bereits entschiedenen Music-Battle-Jurytexte auf Deutsch lebendiger und persona-gerecht um.
WICHTIG: Gewinner, Scores und Fakten sind unveränderlich. Keine neuen Fakten, Lyrics-Zitate, Audioeigenschaften, Streams oder Katalogbehauptungen erfinden.
Gib nur JSON zurück: {"reasons":[{"key":"theme","reason":"..."},...]}

Thema: ${round.theme}
Kategorie: ${round.category||""}
Entscheidungen:
${JSON.stringify(raw.map(r=>({key:r.key,score_a:r.score_a,score_b:r.score_b,reason:r.reason})))}`;
        const rr=await timedFetch("https://openrouter.ai/api/v1/chat/completions",{
          method:"POST",
          headers:{Authorization:`Bearer ${apiKey}`,"Content-Type":"application/json","HTTP-Referer":"https://monkeydsvakidan.github.io/MusicBattle/","X-Title":"Music Battle"},
          body:JSON.stringify({
            model:"openrouter/free",
            messages:[
              {role:"system",content:"Du redigierst nur vorhandene Jurybegründungen. Du entscheidest keine Gewinner und erfindest keine Fakten."},
              {role:"user",content:rewritePrompt}
            ],
            temperature:.55,max_tokens:850
          })
        },4500);
        if(rr.ok){
          const data=await rr.json();
          const parsed=extractJson(String(data?.choices?.[0]?.message?.content||""));
          if(Array.isArray(parsed?.reasons)){
            for(const r of raw){
              const x=parsed.reasons.find((z:any)=>String(z?.key||"")===r.key);
              if(x&&String(x.reason||"").trim().length>=20)r.reason=String(x.reason).trim().slice(0,900);
            }
            usedModel="openrouter/free (wording only)";
          }
        }
      }catch(e){console.warn("jury:rewrite_skipped",e instanceof Error?e.message:String(e))}
    }

    console.log("jury:deterministic_ok","total_ms",Date.now()-juryStarted,
      JSON.stringify(raw.map(r=>({key:r.key,a:r.score_a,b:r.score_b,confidence:r.confidence}))));

    const parsed={jurors:raw};

    const rows=jurors.map(cfg=>{
      const r=parsed.jurors.find((x:any)=>x.key===cfg.key);
      return{
        round_id:roundId,room_id:roomId,source:"ai",juror_key:cfg.key,juror_name:cfg.name,
        score_a:Number(r.score_a),score_b:Number(r.score_b),reason:String(r.reason).slice(0,900),
        details:{
          role:cfg.role,confidence:r.confidence,evidence_used:r.evidence_used,
          evidence_a:{...evidenceA,lyrics:evidenceA.lyrics?{source:"lrclib",found:true,instrumental:evidenceA.lyrics.instrumental,has_synced:evidenceA.lyrics.has_synced}:null},
          evidence_b:{...evidenceB,lyrics:evidenceB.lyrics?{source:"lrclib",found:true,instrumental:evidenceB.lyrics.instrumental,has_synced:evidenceB.lyrics.has_synced}:null},
          model:usedModel,provider:"deterministic+optional-openrouter",prompt_version:20
        }
      };
    });

    await admin.from("mb_jury_scores").delete().eq("round_id",roundId).eq("source","ai");
    const {data:inserted,error}=await admin.from("mb_jury_scores").insert(rows).select();
    if(error)return out({error:"failed to save jury",detail:error.message},500);
    return out({ok:true,jurors:inserted,model:usedModel,evidence_summary:{
      a:{lyrics:Boolean(lyricsA?.found),genius:Boolean(geniusA?.found),musicbrainz:Boolean(musicBrainzA?.found),listenbrainz:Boolean(listenBrainzA?.found),lastfm:Boolean(lastFmA?.found)},
      b:{lyrics:Boolean(lyricsB?.found),genius:Boolean(geniusB?.found),musicbrainz:Boolean(musicBrainzB?.found),listenbrainz:Boolean(listenBrainzB?.found),lastfm:Boolean(lastFmB?.found)}
    }});
  }catch(e){
    return out({error:"ai jury exception",detail:e instanceof Error?e.message:String(e)},500)
  }
});