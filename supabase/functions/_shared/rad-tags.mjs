// rad-tags.mjs – reine Funktionen für die Tags des Albumrads (Roadmap W.6), genutzt von der Edge Function mb-rad.
// Ohne Netzwerk und ohne Datenbank; mit `node --test` geprüft (tests/rad-tags.test.mjs).

export const MAX_AUTO = 8;        // so viele Last.fm-Tags pro Album
export const MIN_ALBUM_TAGS = 3;  // darunter wird mit Tags des Künstlers aufgefüllt
export const MAX_OWN = 30;        // so viele eigene Tags pro Album
export const MAX_TAG_LEN = 30;

// Tag vergleichbar machen: klein, ohne doppelte Leerzeichen, einheitliche Schreibweisen
export function cleanTag(name) {
  let t = String(name ?? "").normalize("NFKC").toLowerCase().replace(/[\u0000-\u001f<>]/g, " ").replace(/\s+/g, " ").trim();
  t = t.replace(/^hip ?hop$/, "hip-hop").replace(/^r ?(&|and|n|'n') ?b$/, "r&b").replace(/^deutsch ?rap$/, "deutschrap");
  if (!t || t.length > MAX_TAG_LEN) return "";
  return t;
}

// Last.fm-Tags, die nichts über die Musik sagen (Sammeln, Bewerten, Besitz)
const JUNK = new Set(["seen live", "favorites", "favourites", "favorite", "favourite", "favorite albums", "favourite albums", "albums i own", "my albums", "owned", "own", "vinyl", "cd", "spotify", "awesome", "love", "loved", "best", "good", "great", "cool", "amazing", "masterpiece", "check out", "to listen", "buy", "wishlist", "aoty", "album", "albums", "all", "music", "favs", "fav", "classic albums", "want", "listened", "heard", "5 stars", "4 stars", "10 of 10 stars", "beautiful", "perfect", "overrated", "underrated", "shit", "fucking awesome"]);

function isJunk(tag, ctx) {
  if (JUNK.has(tag)) return true;
  if (/^\d{4}$/.test(tag)) return true;                      // Jahreszahl
  if (/^(my|i|albums?) /.test(tag)) return true;             // „my top albums“, „i own this“
  if (/(^|\s)(albums?|records?) (of|from) /.test(tag)) return true; // „albums of 2016“
  if (/\b(19|20)\d{2}\b/.test(tag) && /\b(best|top|albums?|favou?rites?)\b/.test(tag)) return true;
  const same = (x) => !!x && cleanTag(x) === tag;
  return same(ctx?.artist) || same(ctx?.album);
}

// Aus der Last.fm-Antwort (Liste {name, count}) die brauchbaren Tags wählen: häufigste zuerst, ohne Müll und Doppelte
export function pickTags(raw, ctx = {}, { max = MAX_AUTO, minCount = 5 } = {}) {
  const seen = new Set(), out = [];
  const list = (Array.isArray(raw) ? raw : raw ? [raw] : []).map((x) => ({ name: cleanTag(x?.name), count: Number(x?.count) || 0 }))
    .filter((x) => x.name && x.count >= minCount && !isJunk(x.name, ctx)).sort((a, b) => b.count - a.count);
  for (const x of list) {
    if (seen.has(x.name)) continue;
    seen.add(x.name); out.push(x);
    if (out.length >= max) break;
  }
  return out;
}

// Album-Tags zuerst; sind es zu wenige, mit Tags des Künstlers auffüllen (höchstens 6 insgesamt)
export function chooseAuto(albumRaw, artistRaw, ctx = {}) {
  const album = pickTags(albumRaw, ctx);
  if (album.length >= MIN_ALBUM_TAGS) return { tags: album, source: "album" };
  const have = new Set(album.map((t) => t.name));
  const fill = pickTags(artistRaw, ctx).filter((t) => !have.has(t.name)).slice(0, Math.max(0, 6 - album.length));
  const tags = [...album, ...fill];
  return { tags, source: !tags.length ? "none" : !album.length ? "artist" : fill.length ? "album+artist" : "album" };
}

// Albumname für die Suche bei Last.fm: ohne Zusätze wie „(Deluxe Edition)“ oder „- Remastered 2011“
export function lookupAlbumName(name) {
  const extra = "deluxe|edition|remaster(ed)?|expanded|bonus|anniversary|version|reissue|special|complete|extended";
  let t = String(name ?? "");
  t = t.replace(new RegExp(`\\s*[\\(\\[][^\\)\\]]*\\b(${extra})\\b[^\\)\\]]*[\\)\\]]`, "gi"), "");
  t = t.replace(new RegExp(`\\s+[-–—]\\s+[^-–—]*\\b(${extra})\\b.*$`, "i"), "");
  return t.replace(/\s+/g, " ").trim() || String(name ?? "").trim();
}

// Liefert Last.fm denselben Künstler wie gefragt? (Autokorrektur kann danebenliegen)
export function sameName(a, b) {
  const n = (x) => String(x ?? "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "");
  const x = n(a), y = n(b);
  return !!x && !!y && (x === y || x.includes(y) || y.includes(x));
}

// Eigene Änderung an einem Album: Tag ein- oder ausschalten.
// Ein automatischer Tag wird ausgeblendet statt gelöscht (hidden), ein eigener kommt in added bzw. wieder heraus.
// Liefert {added, hidden} neu oder {error}.
export function applyTagChange(row, input, on) {
  const tag = cleanTag(input);
  if (!tag) return { error: "tag invalid" };
  const auto = new Set((row?.auto ?? []).map((t) => t?.name));
  let added = [...(row?.added ?? [])], hidden = [...(row?.hidden ?? [])];
  if (on) {
    hidden = hidden.filter((t) => t !== tag);
    if (!auto.has(tag) && !added.includes(tag)) {
      if (added.length >= MAX_OWN) return { error: "too many tags" };
      added.push(tag);
    }
  } else {
    added = added.filter((t) => t !== tag);
    if (auto.has(tag) && !hidden.includes(tag)) hidden.push(tag);
  }
  return { added, hidden };
}

// Was das Rad anzeigt: automatische Tags ohne die ausgeblendeten, dann die eigenen
export function tagView(row) {
  const hidden = new Set(row?.hidden ?? []), auto = (row?.auto ?? []).map((t) => t?.name).filter(Boolean);
  const tags = [...auto.filter((t) => !hidden.has(t)).map((name) => ({ name, own: false })), ...(row?.added ?? []).filter((t) => !auto.includes(t)).map((name) => ({ name, own: true }))];
  return { album_id: row?.album_id, tags, hidden: auto.filter((t) => hidden.has(t)), fetched: !!row?.fetched_at };
}
