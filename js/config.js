/* config.js – Konfiguration: Supabase, Spotify, Juroren, Themen
   Konsolidiert aus app-1 … app-6d (Roadmap 2.2). Klassisches Skript, globale Namen. */

const SUPABASE_URL="https://swgraidbdxpjqnvxacpq.supabase.co";

const SUPABASE_KEY="sb_publishable_FsDT7WlBD5LJs2PPgkW0ww_BotUc0eX";

const sb=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY);

const SPOTIFY_CLIENT_ID="173f861652ae4b668769c76f0adab3a1";

const SPOTIFY={auth:"https://accounts.spotify.com/authorize",token:"https://accounts.spotify.com/api/token",api:"https://api.spotify.com/v1",scopes:"user-library-read user-top-read user-read-private user-read-email streaming user-read-playback-state user-modify-playback-state"};

const JUDGES={theme:{name:"Themenschnüffler",role:"Themen-Purist",image:"./assets/jury/themenschnueffler.webp"},vibe:{name:"Vibejunkie",role:"Atmosphäre-Juror",image:"./assets/jury/vibejunkie.webp"},lyrics:{name:"Kollegah der Lyricboss",role:"Lyrics-Juror",image:"./assets/jury/lyricboss.webp"},underdog:{name:"Snoop Underdogg",role:"David-vs-Goliath-Juror",image:"./assets/jury/snoop-underdogg.webp"},connoisseur:{name:"Dr. Körnli",role:"Musikkenner-Juror",image:"./assets/jury/dr-koernli.webp"}};

// Themen und Themen-Profile kommen aus supabase/functions/_shared/themes.json (Roadmap 3.1),
// der gemeinsamen Quelle für Frontend und Jury. app.js lädt die Datei vor allen Skripten.
const THEMES=Object.fromEntries(MB_THEME_DATA.categories.filter(c=>!c.sudden).map(c=>[c.name,c.themes.map(t=>t.theme)]));

const SUDDEN_THEMES=MB_THEME_DATA.categories.filter(c=>c.sudden).flatMap(c=>c.themes.map(t=>t.theme));
const THEME_PROFILES=new Map(MB_THEME_DATA.categories.flatMap(c=>c.themes.map(t=>[t.theme,{...t,category:c.name}])));
function themeProfile(theme){return THEME_PROFILES.get(theme)||null}

// Juror-Bilder gibt es noch nicht (assets/jury fehlt) – bis Roadmap 4.5 ohne Bild (vorher im Loader app.js)
Object.values(JUDGES).forEach(j=>j.image="");
