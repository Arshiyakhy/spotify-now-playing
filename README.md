# Spotify now playing card

Shows the song I'm listening to on my GitHub profile, with the album cover blurred in the background.

## How it works

```
someone opens my GitHub profile
  → GitHub loads <img src="https://<my-app>.vercel.app/api/now-playing">
  → Vercel runs api/now-playing.js
      1. trades my refresh token for a short-lived access token   (lib/spotify.js)
      2. asks Spotify what's playing; if nothing, gets my last played song
      3. downloads the album cover and turns it into base64 text
      4. draws the SVG card with the cover inside it              (lib/card.js)
  → GitHub shows the SVG as an image
```

Why base64: GitHub serves README images through its own proxy and blocks SVGs from loading outside images. So the cover has to live inside the SVG itself.

## Setup

### 1. Make a Spotify app
1. Go to https://developer.spotify.com/dashboard and click **Create app**.
2. Any name and description. For **Redirect URI** put exactly `http://127.0.0.1:8888/callback`.
3. Tick **Web API**, save.
4. Open the app's **Settings** and copy the **Client ID** and **Client secret**.

### 2. Get your refresh token (one time, on your laptop)
In PowerShell, from this folder:

```powershell
$env:SPOTIFY_CLIENT_ID="your client id"
$env:SPOTIFY_CLIENT_SECRET="your client secret"
npm run token
```

Open http://127.0.0.1:8888, log in, click agree. The terminal prints `SPOTIFY_REFRESH_TOKEN=...`. Copy it.

### 3. Deploy to Vercel
1. Push this folder to a new GitHub repo (for example `spotify-now-playing`).
2. On https://vercel.com click **Add New → Project**, import the repo, and before deploying open **Environment Variables** and add:
   - `SPOTIFY_CLIENT_ID`
   - `SPOTIFY_CLIENT_SECRET`
   - `SPOTIFY_REFRESH_TOKEN`
3. Deploy. Open `https://<your-app>.vercel.app/api/now-playing` and you should see the card.

### 4. Add it to the profile README

```html
<p align="center">
  <img src="https://<your-app>.vercel.app/api/now-playing" width="480" alt="Spotify now playing" />
</p>
```

## Notes
- Never commit the secrets. They only live in Vercel's environment variables.
- GitHub's image proxy caches for a little while, so the card can lag a few minutes behind the real song.
- If Spotify errors out, the function still returns a "Not playing" card so the README never shows a broken image.
