import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { SCENES } from './scenes.js';
import { Kitty } from './cat.js';
import { fetchKitties, sampleColors } from './api.js';
import { audio } from './audio.js';

const $ = (s) => document.querySelector(s);
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
};

// --- renderer: drawn at 1/pixel resolution and upscaled for the retro look --

const canvas = $('#view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
renderer.setPixelRatio(1);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 200);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.maxPolarAngle = Math.PI * 0.47;
controls.minDistance = 3;
controls.maxDistance = 30;

let pixel = Number(store.get('pixel')) || 3;
function resize() {
  renderer.setSize(Math.max(1, Math.floor(innerWidth / pixel)), Math.max(1, Math.floor(innerHeight / pixel)), false);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

// --- world -----------------------------------------------------------------

const world = {
  env: null,
  kitties: [],
  meowCooldown: 0,

  randomSpot() {
    const { bounds: b, obstacles } = this.env;
    for (let i = 0; i < 40; i++) {
      const x = b.x0 + Math.random() * (b.x1 - b.x0);
      const z = b.z0 + Math.random() * (b.z1 - b.z0);
      if (!obstacles.some((o) => x > o.x0 - 0.6 && x < o.x1 + 0.6 && z > o.z0 - 0.6 && z < o.z1 + 0.6)) return { x, z };
    }
    return { x: 0, z: 0 };
  },

  requestMeow() {
    if (this.meowCooldown > 0) return false;
    this.meowCooldown = 0.9;
    return true;
  },

  playMeow(k) {
    const b = this.env.bounds;
    return audio.meow(k.voice, ((k.root.position.x - b.x0) / (b.x1 - b.x0)) * 1.6 - 0.8);
  },

  // keep cats out of furniture, inside the room, and off each other
  resolve() {
    const b = this.env.bounds;
    const pad = 0.35;
    for (const k of this.kitties) {
      const p = k.root.position;
      for (const o of this.env.obstacles) {
        if (p.x > o.x0 - pad && p.x < o.x1 + pad && p.z > o.z0 - pad && p.z < o.z1 + pad) {
          const l = p.x - (o.x0 - pad), r = o.x1 + pad - p.x, f = p.z - (o.z0 - pad), bk = o.z1 + pad - p.z;
          const m = Math.min(l, r, f, bk);
          if (m === l) p.x -= l; else if (m === r) p.x += r; else if (m === f) p.z -= f; else p.z += bk;
        }
      }
      p.x = Math.max(b.x0, Math.min(b.x1, p.x));
      p.z = Math.max(b.z0, Math.min(b.z1, p.z));
    }
    for (let i = 0; i < this.kitties.length; i++) {
      for (let j = i + 1; j < this.kitties.length; j++) {
        const a = this.kitties[i].root.position, c = this.kitties[j].root.position;
        const dx = c.x - a.x, dz = c.z - a.z, d = Math.hypot(dx, dz);
        if (d > 0 && d < 0.8) {
          const push = (0.8 - d) / 2;
          a.x -= (dx / d) * push; a.z -= (dz / d) * push;
          c.x += (dx / d) * push; c.z += (dz / d) * push;
        }
      }
    }
  },
};

function setScene(key) {
  if (world.env) {
    scene.remove(world.env.group);
    world.env.group.traverse((o) => o.geometry?.dispose());
  }
  const env = SCENES[key].build();
  world.env = env;
  scene.add(env.group);
  scene.background = new THREE.Color(env.bg);
  scene.fog = env.fog ? new THREE.Fog(...env.fog) : null;
  camera.position.set(...env.cam.pos);
  controls.target.set(...env.cam.target);
  for (const k of world.kitties) k.place(world);
  for (const b of document.querySelectorAll('#scenes button')) b.classList.toggle('on', b.dataset.key === key);
  store.set('scene', key);
}

// --- UI --------------------------------------------------------------------

const labels = $('#labels');
const roster = $('#roster');
const status = (msg, err = false) => {
  $('#status').textContent = msg;
  $('#status').classList.toggle('err', err);
};

for (const [key, s] of Object.entries(SCENES)) {
  const b = document.createElement('button');
  b.textContent = s.label;
  b.dataset.key = key;
  b.onclick = () => setScene(key);
  $('#scenes').append(b);
}

function syncToggles() {
  $('#sound').textContent = audio.enabled ? 'Sound: on' : 'Sound: off';
  $('#pixel').textContent = `Pixels: ${pixel}x`;
  $('#names').textContent = labels.classList.contains('hide-names') ? 'Names: off' : 'Names: on';
}
$('#sound').onclick = () => { audio.enabled = !audio.enabled; store.set('sound', audio.enabled ? '1' : '0'); syncToggles(); };
$('#pixel').onclick = () => { pixel = (pixel % 4) + 1; store.set('pixel', pixel); resize(); syncToggles(); };
$('#names').onclick = () => { labels.classList.toggle('hide-names'); syncToggles(); };
audio.enabled = store.get('sound') !== '0';
syncToggles();

addEventListener('pointerdown', () => audio.unlock(), { capture: true });
addEventListener('keydown', () => audio.unlock(), { capture: true });

function clearKitties() {
  for (const k of world.kitties) {
    scene.remove(k.root);
    k.root.traverse((o) => o.geometry?.dispose());
    k.label.remove();
  }
  world.kitties = [];
  roster.innerHTML = '';
}

function addKitty(data) {
  const k = new Kitty(data);
  k.place(world);
  scene.add(k.root);
  k.label = document.createElement('div');
  k.label.className = 'tag';
  k.label.innerHTML = '<div class="bubble"></div><div class="name"></div>';
  k.label.querySelector('.name').textContent = data.name;
  labels.append(k.label);
  world.kitties.push(k);

  const li = document.createElement('li');
  const img = document.createElement('img');
  img.src = data.image;
  img.alt = '';
  const info = document.createElement('div');
  const t = data.traits;
  info.innerHTML = '<b></b><small></small>';
  info.querySelector('b').textContent = data.name;
  info.querySelector('small').textContent = data.fancy
    ? `#${data.id} · fancy · gen ${data.generation}`
    : `#${data.id} · ${t.body || '?'} · ${t.pattern || '?'} · ${t.eyes || '?'}`;
  li.append(img, info);
  li.onclick = () => {
    controls.target.set(k.root.position.x, 0.6, k.root.position.z);
    k.poke(world);
  };
  roster.append(li);
}

// --- wallet: kitties are only shown for the connected account -------------

let account = null;
let loadSeq = 0;

const short = (a) => `${a.slice(0, 6)}…${a.slice(-4)}`;

function setAccount(acct) {
  account = acct ? acct.toLowerCase() : null;
  $('#connect').textContent = account ? 'Disconnect' : 'Connect wallet';
  $('#connect').classList.toggle('primary', !account);
  $('#account').textContent = account ? `Connected: ${short(account)}` : '';
  clearKitties();
  if (account) load(account);
  else status('Connect your wallet to bring your kitties home.');
}

async function load(addr) {
  const seq = ++loadSeq;
  status('Fetching your kitties…');
  try {
    const list = await fetchKitties(addr);
    if (seq !== loadSeq) return; // account changed meanwhile
    if (!list.length) return status('No CryptoKitties in this wallet yet.', true);
    for (const d of list) {
      if (d.fancy || !d.traits.colorprimary) {
        // Fancy cats: borrow a palette from their artwork.
        const [p, s, t] = await sampleColors(d.image);
        Object.assign(d.traits, {
          body: 'cymric', eyes: 'googly', mouth: 'happygokitty', pattern: 'calicool',
          colorprimary: p, colorsecondary: s, colortertiary: t || p, coloreyes: d.color,
          wings: /ducat/i.test(d.fancy || '') ? s || '#a8d8f0' : undefined,
        });
      }
      if (seq !== loadSeq) return;
      addKitty(d);
    }
    status(`${list.length} kitt${list.length === 1 ? 'y' : 'ies'} moved in. Click one!`);
  } catch (e) {
    if (seq === loadSeq) status(e.message, true);
  }
}

$('#connect').onclick = async () => {
  if (account) {
    // Wallets can't be force-disconnected; revoke where supported, then forget locally.
    await window.ethereum?.request({ method: 'wallet_revokePermissions', params: [{ eth_accounts: {} }] }).catch(() => {});
    return setAccount(null);
  }
  if (!window.ethereum) return status('No browser wallet found. Install MetaMask (or similar) and reload.', true);
  try {
    const [acct] = await window.ethereum.request({ method: 'eth_requestAccounts' });
    setAccount(acct);
  } catch (e) {
    status(e.code === 4001 ? 'Connection request rejected.' : e.message, true);
  }
};

window.ethereum?.on?.('accountsChanged', (accts) => setAccount(accts[0]));

// click a kitty to make it meow (ignore drags)
const ray = new THREE.Raycaster();
let down = null;
canvas.addEventListener('pointerdown', (e) => (down = [e.clientX, e.clientY]));
canvas.addEventListener('pointerup', (e) => {
  if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 6) return;
  ray.setFromCamera(new THREE.Vector2((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1), camera);
  const hit = ray.intersectObjects(world.kitties.map((k) => k.root), true)[0];
  hit?.object.userData.kitty?.poke(world);
});

// --- loop ------------------------------------------------------------------

const clock = new THREE.Clock();
const v = new THREE.Vector3();
function frame() {
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;
  world.meowCooldown -= dt;
  world.env.update?.(t, dt);
  for (const k of world.kitties) k.update(dt, world);
  world.resolve();
  controls.update();
  renderer.render(scene, camera);

  for (const k of world.kitties) {
    k.head.getWorldPosition(v);
    v.y += 0.6;
    v.project(camera);
    const vis = v.z < 1;
    k.label.style.display = vis ? '' : 'none';
    if (!vis) continue;
    k.label.style.transform = `translate(${((v.x + 1) / 2) * innerWidth}px, ${((1 - v.y) / 2) * innerHeight}px) translate(-50%, -100%)`;
    const text = k.bubbleText();
    const bubble = k.label.firstChild;
    bubble.style.display = text ? '' : 'none';
    if (text && bubble.textContent !== text) bubble.textContent = text;
  }
  requestAnimationFrame(frame);
}

setScene(SCENES[store.get('scene')] ? store.get('scene') : 'home');
status('Connect your wallet to bring your kitties home.');
// Reconnect silently if this site was already authorized in the wallet.
window.ethereum?.request({ method: 'eth_accounts' }).then(([acct]) => acct && setAccount(acct)).catch(() => {});
frame();

window.kh = { world, camera, controls }; // console debugging
