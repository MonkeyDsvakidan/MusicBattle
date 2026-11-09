/* artist-filter.js – Künstler-Pool für den Draft: Hörbuch-Autoren erkennen (Roadmap 6.4) und Hip-Hop bevorzugen (6.5, Entscheidung K).
   Reine Funktionen. Klassisches Skript (globale Namen), für node --test zusätzlich exportiert. */

// Kapitel-Titel von Hörbüchern: „Kapitel 3“, „Harry Potter – Chapter 12“, „Teil 4 - …“, „Folge 7“, „1. Kapitel“
const CHAPTER_ANYWHERE=/(^|[\s\-–—:(.,_])(kapitel|chapter|chapitre|cap[ií]tulo|capitolo|hoofdstuk)\s*\d+/i;
const CHAPTER_START=/^\s*(teil|folge|part|track|episode|abschnitt)\s*\d+(\s|$|[.:\-–—])/i;
const CHAPTER_NUMBER_FIRST=/^\s*\d+\s*[.)]?\s*(kapitel|chapter|teil|folge)\b/i;

function looksLikeChapterTitle(name){
  const t=String(name||"");
  return CHAPTER_ANYWHERE.test(t)||CHAPTER_START.test(t)||CHAPTER_NUMBER_FIRST.test(t);
}

// Hörbuch-Autor: mindestens 3 Kapitel-Titel oder mindestens 2 und die Hälfte der Songs.
// Ein einzelner Song wie „Part 2“ reicht nicht.
function isChapterHeavy(chapters,total){
  return chapters>=3||(chapters>=2&&chapters*2>=total);
}

// Songs → Spotify-IDs der Hauptkünstler, deren Songs überwiegend Kapitel sind
function chapterArtistIds(tracks){
  const stats=new Map();
  for(const t of tracks||[]){
    const id=t?.artists?.[0]?.id;if(!id)continue;
    const s=stats.get(id)||{chapters:0,total:0};
    s.total++;if(looksLikeChapterTitle(t.name))s.chapters++;
    stats.set(id,s);
  }
  return new Set([...stats].filter(([,s])=>isChapterHeavy(s.chapters,s.total)).map(([id])=>id));
}

// Genres → Faktor fürs Ziehen: Hip-Hop 1, Genre unbekannt 0.5 (Spotify liefert Genres nicht mehr bei allen),
// R&B/Soul/Afro 0.4, alles andere (z. B. Pop) 0.12 → Pop bleibt möglich, kommt aber viel seltener.
const HIPHOP_GENRE_HINTS=["hip hop","hip-hop","hiphop","rap","trap","drill","grime","boom bap","phonk","g-funk","crunk","plugg","horrorcore","jersey club","afroswing"];
const NEAR_HIPHOP_GENRE_HINTS=["r&b","rnb","soul","afrobeat","afro","dancehall","urbano","neo soul"];
const GENRE_FACTOR={hiphop:1,unknown:.5,near:.4,other:.12};

function genreGroup(genres){
  const g=(genres||[]).map(x=>String(x).toLowerCase()).filter(Boolean);
  if(!g.length)return"unknown";
  if(g.some(x=>HIPHOP_GENRE_HINTS.some(h=>x.includes(h))))return"hiphop";
  if(g.some(x=>NEAR_HIPHOP_GENRE_HINTS.some(h=>x.includes(h))))return"near";
  return"other";
}

function effectiveDraftWeight(artist){
  return Math.max(1,Number(artist?.draftWeight)||10)*GENRE_FACTOR[genreGroup(artist?.genres)];
}

if(typeof module!=="undefined")module.exports={looksLikeChapterTitle,isChapterHeavy,chapterArtistIds,genreGroup,effectiveDraftWeight,GENRE_FACTOR};
