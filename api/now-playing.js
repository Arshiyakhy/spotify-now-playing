// Spotify now playing card for my GitHub profile.
// Vercel runs this on every request to /api/now-playing and sends back an SVG.

// ---------- Spotify ----------
// Talks to Spotify: swaps the refresh token for an access token,
// then asks what's playing (or what played last).

const TOKEN_URL = "https://accounts.spotify.com/api/token";
const NOW_PLAYING_URL = "https://api.spotify.com/v1/me/player/currently-playing";
const RECENT_URL = "https://api.spotify.com/v1/me/player/recently-played?limit=1";

async function getAccessToken() {
  const { SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET, SPOTIFY_REFRESH_TOKEN } = process.env;
  const basic = Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString("base64");

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: SPOTIFY_REFRESH_TOKEN,
    }),
  });

  if (!res.ok) throw new Error(`Token request failed: ${res.status}`);
  const data = await res.json();
  return data.access_token;
}

function pickTrack(track) {
  const images = track.album?.images ?? [];
  // Spotify sorts images largest first; ~300px is plenty for the card
  const image = images.find((i) => i.width && i.width <= 320) ?? images[0];
  return {
    title: track.name,
    artist: track.artists.map((a) => a.name).join(", "),
    albumImageUrl: image?.url ?? null,
    durationMs: track.duration_ms,
  };
}

async function getTrack() {
  const token = await getAccessToken();
  const headers = { Authorization: `Bearer ${token}` };

  // 1. Is something playing right now?
  const now = await fetch(NOW_PLAYING_URL, { headers });
  if (now.status === 200) {
    const data = await now.json();
    if (data.item && data.item.type === "track") {
      return {
        ...pickTrack(data.item),
        isPlaying: data.is_playing,
        progressMs: data.progress_ms,
      };
    }
  }

  // 2. Nothing playing (204) or a podcast: fall back to the last played song
  const recent = await fetch(RECENT_URL, { headers });
  if (!recent.ok) throw new Error(`Recently played failed: ${recent.status}`);
  const data = await recent.json();
  const item = data.items?.[0]?.track;
  if (!item) return null;
  return { ...pickTrack(item), isPlaying: false, progressMs: null };
}

// GitHub can't load outside images inside an SVG, so the cover
// has to be baked into the SVG as base64 text.
async function toDataUri(url) {
  if (!url) return null;
  const res = await fetch(url);
  if (!res.ok) return null;
  const type = res.headers.get("content-type") ?? "image/jpeg";
  const buf = Buffer.from(await res.arrayBuffer());
  return `data:${type};base64,${buf.toString("base64")}`;
}


// ---------- Card ----------
// Draws the card as an SVG string.

const W = 480;
const H = 144;
const GREEN = "#1ed760";

function esc(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function cut(s, max) {
  return s.length > max ? s.slice(0, max - 1).trimEnd() + "…" : s;
}

function time(ms) {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = String(total % 60).padStart(2, "0");
  return `${m}:${s}`;
}

function equalizer(x, y, playing) {
  const patterns = [
    [6, 14, 4, 11, 8, 6],
    [12, 5, 14, 7, 10, 12],
    [4, 11, 9, 14, 5, 4],
    [14, 7, 10, 4, 9, 14],
  ];
  return patterns
    .map((p, i) => {
      const bx = x + i * 6;
      if (!playing) {
        return `<rect x="${bx}" y="${y - 3}" width="4" height="3" rx="1" fill="#9aa0a6"/>`;
      }
      const heights = p.join(";");
      const ys = p.map((h) => y - h).join(";");
      return `<rect x="${bx}" y="${y - p[0]}" width="4" height="${p[0]}" rx="1" fill="${GREEN}">
        <animate attributeName="height" values="${heights}" dur="1.1s" repeatCount="indefinite"/>
        <animate attributeName="y" values="${ys}" dur="1.1s" repeatCount="indefinite"/>
      </rect>`;
    })
    .join("");
}

function renderCard(track, cover) {
  const font = `font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif"`;

  if (!track) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
      <rect width="${W}" height="${H}" rx="14" fill="#161b22"/>
      <text x="${W / 2}" y="${H / 2 + 5}" ${font} font-size="15" fill="#9aa0a6" text-anchor="middle">Not playing anything right now</text>
    </svg>`;
  }

  const playing = track.isPlaying;
  const ax = 22, ay = 22, A = 100;
  const tx = 142;
  const barW = W - tx - 24;

  const background = cover
    ? `<image href="${cover}" x="-40" y="-60" width="${W + 80}" height="${W + 80}" preserveAspectRatio="xMidYMid slice" filter="url(#blur)"/>`
    : `<rect width="${W}" height="${H}" fill="#23272e"/>`;

  const art = cover
    ? `<image href="${cover}" x="${ax}" y="${ay}" width="${A}" height="${A}" preserveAspectRatio="xMidYMid slice" clip-path="url(#art)"/>`
    : `<rect x="${ax}" y="${ay}" width="${A}" height="${A}" rx="8" fill="#30363d"/>`;

  const showProgress = playing && track.progressMs != null && track.durationMs;
  let progress = "";
  if (showProgress) {
    // The card keeps "playing" after it loads: the bar grows and the clock
    // ticks every second until the song ends, like Discord's status.
    const startSec = Math.floor(track.progressMs / 1000);
    const endSec = Math.floor(track.durationMs / 1000);
    const remaining = Math.max(0, Math.min(endSec - startSec, 900));
    const w0 = Math.round(barW * Math.min(1, track.progressMs / track.durationMs));

    const ticks = [];
    for (let i = 0; i <= remaining; i++) {
      const visible = i === 0 && remaining === 0
        ? ""
        : i === 0
        ? `<set attributeName="opacity" to="0" begin="1s" fill="freeze"/>`
        : `<set attributeName="opacity" to="0.75" begin="${i}s"/><set attributeName="opacity" to="0" begin="${i + 1}s"/>`;
      const last = i === remaining && i > 0
        ? `<set attributeName="opacity" to="0.75" begin="${i}s" fill="freeze"/>`
        : visible;
      ticks.push(`<text x="${tx}" y="126" ${font} font-size="11" fill="#ffffff" opacity="${i === 0 ? 0.75 : 0}">${time((startSec + i) * 1000)}${last}</text>`);
    }

    progress = `<rect x="${tx}" y="106" width="${barW}" height="4" rx="2" fill="#ffffff" opacity="0.25"/>
       <rect x="${tx}" y="106" width="${w0}" height="4" rx="2" fill="#ffffff">
         <animate attributeName="width" from="${w0}" to="${barW}" dur="${Math.max(remaining, 1)}s" fill="freeze"/>
       </rect>
       ${ticks.join("")}
       <text x="${tx + barW}" y="126" ${font} font-size="11" fill="#ffffff" opacity="0.75" text-anchor="end">${time(track.durationMs)}</text>`;
  }

  const label = playing ? "NOW PLAYING" : "LAST PLAYED";
  const labelColor = playing ? GREEN : "#d0d4d9";

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <clipPath id="card"><rect width="${W}" height="${H}" rx="14"/></clipPath>
    <clipPath id="art"><rect x="${ax}" y="${ay}" width="${A}" height="${A}" rx="8"/></clipPath>
    <filter id="blur" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="22"/></filter>
  </defs>
  <g clip-path="url(#card)">
    ${background}
    <rect width="${W}" height="${H}" fill="#000000" opacity="0.45"/>
    ${art}
    <rect x="${ax}" y="${ay}" width="${A}" height="${A}" rx="8" fill="none" stroke="#ffffff" stroke-opacity="0.15"/>
    ${equalizer(tx, 44, playing)}
    <text x="${tx + 32}" y="43" ${font} font-size="11" font-weight="600" letter-spacing="1.5" fill="${labelColor}">${label}</text>
    <text x="${tx}" y="${showProgress ? 72 : 80}" ${font} font-size="20" font-weight="600" fill="#ffffff">${esc(cut(track.title, 26))}</text>
    <text x="${tx}" y="${showProgress ? 93 : 102}" ${font} font-size="14" fill="#ffffff" opacity="0.8">${esc(cut(track.artist, 36))}</text>
    ${progress}
  </g>
</svg>`;
}


// ---------- Handler ----------
// Vercel runs this file whenever someone hits /api/now-playing.
// It returns an SVG image, so a README can show it with <img>.


module.exports = async (req, res) => {
  let svg;
  try {
    const track = await getTrack();
    const cover = track ? await toDataUri(track.albumImageUrl) : null;
    svg = renderCard(track, cover);
  } catch (err) {
    console.error(err);
    // Still send a valid image so the README never shows a broken icon
    svg = renderCard(null, null);
  }

  res.setHeader("Content-Type", "image/svg+xml");
  // Ask GitHub's image proxy not to hold on to an old song for long
  res.setHeader("Cache-Control", "no-cache, max-age=0, s-maxage=30");
  res.status(200).send(svg);
};
