# Kitty Habitat

Connect your wallet and your CryptoKitties move into a retro low-poly 3D scene
(home, office, garden, beach). They walk around, sit, nap, get the zoomies and meow.

**Live:** https://metaver5o.github.io/kitties-habitat/

Each cat is generated from its own on-chain traits: body type (tail and fluff),
eye shape, mouth, pattern, and the primary / secondary / tertiary / eye color genes.
Fancy cats, which have no traits, get a palette sampled from their artwork.

## Run locally

Static files with no build step. Browser wallets don't inject into `file://`, so serve it over HTTP:

```sh
docker compose up -d --build   # http://localhost:8090
# or
python3 -m http.server 8090
```

## Layout

| Path | What |
|---|---|
| `src/cat.js` | Builds a kitty from its traits, plus the walk/sit/sleep/meow behavior |
| `src/scenes.js` | The scenes and their obstacles |
| `src/colors.js` | CryptoKitties color genes → hex |
| `src/api.js` | Fetches the wallet's kitties from the public CryptoKitties API |
| `src/audio.js` | Plays the meow recordings |
| `sounds/` | Real cat meows, public domain / CC0 ([credits](sounds/CREDITS.md)) |

## Legal

The code is MIT licensed. CryptoKitties, the CryptoKitties name, logo and artwork are
property of Dapper Labs, Inc. This is an unofficial fan project, not affiliated with or
endorsed by Dapper Labs. No CryptoKitties artwork is stored in this repository. The 3D cats
are original low-poly models driven by trait data, and the roster thumbnails load
from the CryptoKitties image CDN.
