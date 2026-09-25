# Mallet Sight Reader

Offline-capable sight-reading trainer for keyboard percussion (2 / 3 / 4 mallets). Install it from the browser like an app.

## Deploy on Netlify via GitHub

1. Create a GitHub repo and upload **this whole folder** (keep `index.html` at the repo root).
2. In [Netlify](https://app.netlify.com): **Add new site → Import an existing project → GitHub**.
3. Pick the repo. Leave build command empty. Publish directory: `.`
4. Deploy. You get a URL like `https://something.netlify.app`.

Every push to `main` redeploys automatically.

Or drag this folder onto [Netlify Drop](https://app.netlify.com/drop) for a one-off publish.

## Install on a tablet / phone

1. Open the Netlify URL in Safari (iPad) or Chrome (Android).
2. **iPad / iPhone:** Share → **Add to Home Screen**.
3. **Android Chrome:** menu → **Install app** / **Add to Home screen**.
4. Open the icon. It runs full screen and works offline after the first visit.

HTTPS is required for install. Netlify provides that.

## Local use

```bash
python3 -m http.server 8080
```

Open `http://localhost:8080`. Service worker and install work on localhost too.

## Samples

Playback uses Fluid R3 GM mallet samples (MIT). See `samples/CREDITS.txt`.
