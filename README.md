<div align="center">

# 🐾 Kitty Habitat

**Your CryptoKitties, alive in retro low-poly 3D.**

Connect your wallet and every kitty you own moves into a little world of its own:
it walks around, sits, naps, gets the zoomies and meows with real cat voices.

[![Live demo](https://img.shields.io/badge/play-live%20demo-ff7aa8?style=for-the-badge)](https://metaver5o.github.io/kitties-habitat/)
[![License: MIT](https://img.shields.io/badge/license-MIT-1d1b26?style=for-the-badge)](LICENSE)
[![Three.js](https://img.shields.io/badge/three.js-r160-1d1b26?style=for-the-badge&logo=threedotjs)](https://threejs.org/)
[![No build step](https://img.shields.io/badge/build-none-1d1b26?style=for-the-badge)](#run-it-locally)

![Kitties roaming the garden scene](docs/demo.gif)

**▶ https://metaver5o.github.io/kitties-habitat/**

</div>

---

## What it does

- **Wallet-gated.** Nothing shows until you connect a browser wallet (MetaMask or similar). Then that account's kitties load into the scene. Switch accounts and the cats switch too. Disconnect and they leave.
- **Every cat is unique.** No sprites or stock models. Each kitty is built in 3D from its own traits, so two wallets never look the same.
- **They behave like cats.** They wander, avoid furniture and each other, sit, curl up to sleep (`zZz`), hop, and get the occasional zoomies.
- **Real meows.** Each kitty has its own set of real cat recordings and its own pitch. Click a kitty, or its card in the roster, to make it meow, or to wake it up.
- **Four scenes.** Home, office, garden and beach, each with props the cats walk around (sofa, desks, a pond they won't step into, sandcastles).
- **Retro by design.** Flat-shaded low-poly, rendered at low resolution and upscaled pixel-perfect. Choose 1×–4× pixel size.

## Your traits, in 3D

Each cattribute maps to something on the model:

![Nine kitties built from their own traits](docs/lineup.jpg)

<sub>Left to right: Fuku Bluntnano (cymric · calicool · crazy eyes · tongue), #377769 (ragdoll · curly tail), #372075 (cymric · googly), #369860 (laperm · luckystripe · thicccbrowz), #353297 (ragamuffin · gerbil teeth), DuCat (fancy, with wings), #326465, #169128 (himalayan · curly tail), #45657 (simple eyes).</sub>

| Trait | What it changes |
|---|---|
| `colorprimary` | Fur |
| `colorsecondary` | Pattern color (stripes, patches, spots, tail rings) |
| `colortertiary` | Belly and chest |
| `coloreyes` | Iris |
| `body` | Tail and fluff: **ragdoll / himalayan** get a curly tail; **cymric / laperm / ragamuffin / persian…** get a big brushy tail plus cheek and chest tufts |
| `pattern` | **luckystripe / tigerpunch…** → stripes · **calicool…** → patches · **spotted / leopard…** → spots · **spock** → face mask · **totesbasic** → plain |
| `eyes` | **googly** big eyes · **crazy** pupils looking different ways · **thicccbrowz** heavy brows · **simple** small dots · **wiley / sleepy** half-closed lids |
| `mouth` | **tongue** sticks out · **gerbil** buck teeth · **soserious** flat line · default `w` smile |

**Fancy cats** (DuCat, etc.) have no cattributes, so their palette is sampled from their official artwork. DuCats also get little wings.

## Scenes

| Home | Office |
|---|---|
| ![Home scene](docs/scene-home.jpg) | ![Office scene](docs/scene-office.jpg) |
| **Garden** | **Beach** |
| ![Garden scene](docs/scene-garden.jpg) | ![Beach scene](docs/scene-beach.jpg) |

## How it works

```
wallet (eth_requestAccounts)
   │  address only, no signatures, no transactions
   ▼
api.cryptokitties.co/kitties?owner_wallet_address=…
   │  id, name, cattributes, generation, artwork URL
   ▼
cat.js  traits ─► low-poly model (body, head, ears, eyes, mouth, legs, tail chain)
        └─ per-face vertex colors paint the pattern; no textures
   ▼
scene.js  floor bounds + furniture boxes ─► walking, collision, state machine
   ▼
three.js at 1/N resolution ─► CSS `image-rendering: pixelated`
```

- **Why the API and not the contract?** `KittyCore.tokensOfOwner()` loops over all ~2M kitties and runs out of gas on public RPCs, and CryptoKitties' `Transfer` event has no indexed fields to filter on. The public CryptoKitties API answers in one request and needs no key.
- **Privacy.** The app only reads your address. It never asks you to sign anything or send a transaction. There's no backend: everything runs in your browser.

## Run it locally

Static files, no build step, no `npm install`. Browser wallets don't inject into `file://` pages, so serve it over HTTP:

```sh
git clone https://github.com/metaver5o/kitties-habitat.git
cd kitties-habitat

docker compose up -d --build      # → http://localhost:8090
# or
python3 -m http.server 8090       # → http://localhost:8090
```

Production is GitHub Pages serving the `main` branch over HTTPS, with no CI build.

## Project layout

| Path | What |
|---|---|
| `index.html` | Page, HUD, styles, import map (three.js from jsDelivr) |
| `src/main.js` | Renderer, wallet connection, world loop, collisions, labels |
| `src/cat.js` | Trait → 3D model, and the walk / sit / sleep / hop / zoomies / meow behavior |
| `src/scenes.js` | Home, office, garden and beach, plus their obstacles |
| `src/colors.js` | CryptoKitties color gene → hex |
| `src/api.js` | CryptoKitties API client, palette sampling for fancy cats |
| `src/audio.js` | Meow playback (WebAudio, per-cat clips, pitch and stereo pan) |
| `sounds/` | 12 real meows, public domain / CC0 ([credits](sounds/CREDITS.md)) |

## Ideas and contributions

PRs welcome. Some things that would be fun:

- Jumping onto furniture (sofa, desks, sandcastle)
- Chasing the yarn ball and beach ball, and petting to purr
- Day / night cycle
- More fancy-cat accessories and more accurate color genes (the table in `src/colors.js` is partly approximate)

## Credits and legal

- Code © 2026 Marco Matos, [MIT](LICENSE).
- **CryptoKitties, the CryptoKitties name, logo and artwork are property of Dapper Labs, Inc.** This is an unofficial fan project, not affiliated with or endorsed by Dapper Labs. No CryptoKitties artwork is stored in this repo. The 3D cats are original models driven by trait data, and the roster thumbnails load from the CryptoKitties image CDN.
- Meow recordings: real cats, public domain / CC0, from Wikimedia Commons. See [sounds/CREDITS.md](sounds/CREDITS.md).
- Built with [three.js](https://threejs.org/).
