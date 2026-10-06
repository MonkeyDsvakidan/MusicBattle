/* config.js – Konfiguration: Supabase, Spotify, Juroren, Themen
   Konsolidiert aus app-1 … app-6d (Roadmap 2.2). Klassisches Skript, globale Namen. */

const SUPABASE_URL="https://swgraidbdxpjqnvxacpq.supabase.co";

const SUPABASE_KEY="sb_publishable_FsDT7WlBD5LJs2PPgkW0ww_BotUc0eX";

const sb=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY);

const SPOTIFY_CLIENT_ID="173f861652ae4b668769c76f0adab3a1";

const SPOTIFY={auth:"https://accounts.spotify.com/authorize",token:"https://accounts.spotify.com/api/token",api:"https://api.spotify.com/v1",scopes:"user-library-read user-top-read user-read-private user-read-email streaming user-read-playback-state user-modify-playback-state"};

const JUDGES={theme:{name:"Themenschnüffler",role:"Themen-Purist",image:"./assets/jury/themenschnueffler.webp"},vibe:{name:"Vibejunkie",role:"Atmosphäre-Juror",image:"./assets/jury/vibejunkie.webp"},lyrics:{name:"Kollegah der Lyricboss",role:"Lyrics-Juror",image:"./assets/jury/lyricboss.webp"},underdog:{name:"Snoop Underdogg",role:"David-vs-Goliath-Juror",image:"./assets/jury/snoop-underdogg.webp"},connoisseur:{name:"Dr. Körnli",role:"Musikkenner-Juror",image:"./assets/jury/dr-koernli.webp"}};

const THEMES={"Arena & Action":["Wrestling-Intro","Sunny Basketball Day","Einlauf vor dem wichtigsten Spiel","Siegesfeier nach dem Finale"],"Kino & Charakter":["Superheld betritt die Szene","Bösewicht betritt die Szene","Filmtrailer für einen Gangsterfilm","Flucht vor der Polizei","Der letzte Song, bevor die Welt endet"],"Stadt & Nacht":["Nachtfahrt durch eine Grossstadt","Freitagabend","Samstag um 2 Uhr nachts","Du betrittst einen Raum und alle schauen","3 Uhr nachts im Uber nach Hause"],"Sommer & Unterwegs":["Roadtrip mit Freunden","Cabrio im Sommer","Am Strand","Sonnenuntergang auf einem Dach","Erste Fahrt im neuen Auto"],"Wetter & Tageszeit":["Regentag in der Stadt","Erster warmer Tag im Frühling","Schneefall mitten in der Nacht","Sonntagmorgen","Montagmorgen"],"Party & Kultur":["OAFF Abriss","Kleine Underground-Party","2000er-Party","90er-Party","Letzter Song vor Clubschluss"],"Emotion & Erinnerung":["Verliebt sein","Herzschmerz","Alle gegen dich","Motivationssong für schlechte Zeiten","Nostalgie"],"Attitude & Status":["Luxusleben","Selbstvertrauen auf Maximum","Diss-Track-Energie","Victory Lap","Niemand kann dir heute etwas sagen"],"Zeitmaschine":["2010 Banger","2012 Banger","2014 Banger","2016 Banger","2018 Banger","2020 Banger","2022 Banger","2024 Banger"],"Hip-Hop Momente":["Street-Anthem","Cypher-Energie","Gym-Track","Late-Night-Rap","Sommer-Rap-Hit","Club-Banger","Kopfhörer-Track für den Heimweg","Track für die erste Reihe am Festival"]};

const SUDDEN_THEMES=[
  "Alles oder nichts – der finale Song",
  "Final Boss betritt die Arena",
  "Letzte Chance auf den Sieg",
  "Der Song für den entscheidenden Moment",
  "Noch ein Song, dann ist Schluss"
];

// Juror-Bilder gibt es noch nicht (assets/jury fehlt) – bis Roadmap 4.5 ohne Bild (vorher im Loader app.js)
Object.values(JUDGES).forEach(j=>j.image="");
