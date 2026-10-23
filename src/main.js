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

// --- renderer --------------------------------------------------------------
// The scene and fast kitties are drawn at full resolution. Slower kitties
// (by CryptoKitties cooldown) are drawn into low-res targets, one per pixel
// size, and composited on top with a glitch shader. Each target first gets a
// depth-only pass of the scene so furniture still hides cats behind it.

const canvas = $('#view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.autoClear = false;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 200);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.maxPolarAngle = Math.PI * 0.47;
controls.minDistance = 3;
controls.maxDistance = 30;

const tierTargets = new Map(); // pixel size -> WebGLRenderTarget
const tierSize = (px) => [Math.max(1, Math.floor(innerWidth / px)), Math.max(1, Math.floor(innerHeight / px))];
function tierTarget(px) {
  if (!tierTargets.has(px)) {
    tierTargets.set(px, new THREE.WebGLRenderTarget(...tierSize(px), {
      minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter,
    }));
  }
  return tierTargets.get(px);
}

function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  for (const [px, rt] of tierTargets) rt.setSize(...tierSize(px));
}
addEventListener('resize', resize);
resize();

const glitchMat = new THREE.ShaderMaterial({
  uniforms: { map: { value: null }, time: { value: 0 }, glitch: { value: 0 }, res: { value: new THREE.Vector2() } },
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
  fragmentShader: `
    uniform sampler2D map; uniform float time, glitch; uniform vec2 res; varying vec2 vUv;
    float h(float n) { return fract(sin(n) * 43758.5453); }
    void main() {
      vec2 uv = vUv;
      float tick = floor(time * 12.0);
      // short glitch bursts, more frequent the slower the cooldown
      float burst = step(1.0 - glitch * 0.22, h(tick * 0.71));
      float band = floor(uv.y * res.y / 3.0);
      float tear = burst * step(0.6, h(tick * 1.7 + band * 0.13));
      uv.x += (h(band + tick) - 0.5) * 0.04 * glitch * tear;
      float off = burst * glitch * (1.0 + h(tick)) / res.x;
      vec4 c = texture2D(map, uv);
      vec4 r = texture2D(map, uv + vec2(off, 0.0));
      vec4 b = texture2D(map, uv - vec2(off, 0.0));
      c.r = mix(c.r, r.r, burst); c.b = mix(c.b, b.b, burst);
      c.a = max(c.a, max(r.a, b.a) * burst);
      c.a *= 1.0 - burst * 0.4 * step(0.7, h(tick * 3.1));
      c.rgb *= 1.0 - glitch * 0.15 * mod(floor(gl_FragCoord.y / 2.0), 2.0);
      gl_FragColor = c;
      #include <colorspace_fragment>
    }`,
  transparent: true, depthTest: false, depthWrite: false,
});
const quadScene = new THREE.Scene();
quadScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), glitchMat));
const quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const depthOnly = new THREE.MeshBasicMaterial({ colorWrite: false });

function render(t) {
  // scene + fast kitties (layer 1), straight to the canvas
  renderer.setRenderTarget(null);
  renderer.clear();
  camera.layers.set(0);
  camera.layers.enable(1);
  renderer.render(scene, camera);

  const bg = scene.background;
  scene.background = null;
  const tiers = new Map();
  for (const k of world.kitties) if (k.cd.px > 1) tiers.set(k.cd.px, Math.max(tiers.get(k.cd.px) || 0, k.cd.glitch));
  for (const [px, glitch] of [...tiers].sort((a, b) => a[0] - b[0])) {
    const rt = tierTarget(px);
    renderer.setRenderTarget(rt);
    renderer.setClearColor(0x000000, 0);
    renderer.clear();
    scene.overrideMaterial = depthOnly;
    camera.layers.set(0);
    renderer.render(scene, camera);
    scene.overrideMaterial = null;
    camera.layers.set(px);
    renderer.render(scene, camera);

    renderer.setRenderTarget(null);
    glitchMat.uniforms.map.value = rt.texture;
    glitchMat.uniforms.glitch.value = glitch;
    glitchMat.uniforms.time.value = t;
    glitchMat.uniforms.res.value.set(rt.width, rt.height);
    renderer.render(quadScene, quadCam);
  }
  scene.background = bg;
  camera.layers.set(0);
}

// --- time of day -----------------------------------------------------------
// auto follows the viewer's local clock; cycle runs a whole day in 3 minutes.

const TIME_MODES = ['auto', 'day', 'night', 'cycle'];
const CYCLE_SECS = 180;
let timeMode = TIME_MODES.includes(store.get('time')) ? store.get('time') : 'auto';
let cycleStart = 0;

const smooth = (a, b, x) => {
  const k = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return k * k * (3 - 2 * k);
};
const daylightAt = (h) => smooth(5.5, 7.5, h) * (1 - smooth(18, 20, h));

function hourNow(t) {
  if (timeMode === 'day') return 13;
  if (timeMode === 'night') return 1;
  if (timeMode === 'cycle') return (7 + ((t - cycleStart) / CYCLE_SECS) * 24) % 24;
  const d = new Date();
  return d.getHours() + d.getMinutes() / 60;
}

const SKY = { night: new THREE.Color('#0b1026'), dusk: new THREE.Color('#f0905f') };
const SUN = { noon: new THREE.Color('#ffffff'), dusk: new THREE.Color('#ffb070'), moon: new THREE.Color('#8fa6ff') };
const ORB = { sun: new THREE.Color('#fff3b0'), moon: new THREE.Color('#e6ecff') };
const GLASS_NIGHT = new THREE.Color('#1a2448');
const tmp = new THREE.Color();

// 3-stop ramp: night (d=0) -> dusk (d=0.5) -> day (d=1)
const ramp = (out, night, dusk, day, d) =>
  d < 0.5 ? out.copy(night).lerp(dusk, d * 2) : out.copy(dusk).lerp(day, (d - 0.5) * 2);

function applyTime(hour) {
  const env = world.env, s = env.sky;
  const d = daylightAt(hour);
  world.daylight = d;
  const floor = s.outdoor ? 0.12 : 0.25; // moonlight vs. light leaking in from outside
  s.hemi.intensity = s.hemiBase * (floor + (1 - floor) * d);
  s.sun.intensity = s.sunBase * (floor + (1 - floor) * d);
  ramp(s.sun.color, SUN.moon, SUN.dusk, SUN.noon, d);
  for (const m of s.windows) m.color.copy(GLASS_NIGHT).lerp(m.userData.day, d);
  for (const l of s.lamps) l.light.intensity = l.night + (l.day - l.night) * d;
  if (!s.outdoor) return;

  ramp(scene.background, SKY.night, SKY.dusk, tmp.set(env.bg), d);
  scene.fog?.color.copy(scene.background);
  s.stars.material.opacity = (1 - d) ** 2;
  s.stars.visible = d < 0.95;
  // sun arcs over 6h..19h, the moon over the rest of the night
  const day = hour >= 6 && hour < 19;
  const a = day ? ((hour - 6) / 13) * Math.PI : (((hour + 5) % 24) / 11) * Math.PI;
  s.orb.position.set(-Math.cos(a) * s.orbDist, 4 + Math.sin(a) * s.orbDist * 0.45, -s.orbDist * 0.8);
  s.orb.material.color.copy(day ? ORB.sun : ORB.moon);
  s.sun.position.copy(s.orb.position).normalize().multiplyScalar(20);
}

// --- world -----------------------------------------------------------------

const axis = new THREE.Vector3();
const world = {
  env: null,
  kitties: [],
  meowCooldown: 0,
  daylight: 1,

  isFree(x, z, pad = 0.4) {
    const b = this.env.bounds;
    if (x < b.x0 || x > b.x1 || z < b.z0 || z > b.z1) return false;
    return !this.env.obstacles.some((o) => x > o.x0 - pad && x < o.x1 + pad && z > o.z0 - pad && z < o.z1 + pad);
  },

  randomSpot() {
    const b = this.env.bounds;
    for (let i = 0; i < 40; i++) {
      const x = b.x0 + Math.random() * (b.x1 - b.x0);
      const z = b.z0 + Math.random() * (b.z1 - b.z0);
      if (this.isFree(x, z, 0.6)) return { x, z };
    }
    return { x: 0, z: 0 };
  },

  requestMeow() {
    if (this.meowCooldown > 0) return false;
    this.meowCooldown = 0.9;
    return true;
  },

  pan(k) {
    const b = this.env.bounds;
    return ((k.root.position.x - b.x0) / (b.x1 - b.x0)) * 1.6 - 0.8;
  },

  playMeow(k) {
    return audio.meow(k.voice, this.pan(k));
  },

  kick(toy, vx, vz) {
    toy.vel.set(vx, 0, vz);
  },

  // balls roll, slow down, and bounce off walls and furniture
  updateToys(dt) {
    const b = this.env.bounds;
    for (const t of this.env.toys || []) {
      const p = t.mesh.position, v = t.vel;
      p.x += v.x * dt;
      p.z += v.z * dt;
      const sp = Math.hypot(v.x, v.z);
      if (sp > 0.01) t.mesh.rotateOnWorldAxis(axis.set(v.z, 0, -v.x).normalize(), (sp * dt) / t.r);
      v.multiplyScalar(Math.exp(-dt * 1.2));
      if (p.x < b.x0 || p.x > b.x1) { p.x = Math.max(b.x0, Math.min(b.x1, p.x)); v.x *= -0.7; }
      if (p.z < b.z0 || p.z > b.z1) { p.z = Math.max(b.z0, Math.min(b.z1, p.z)); v.z *= -0.7; }
      for (const o of this.env.obstacles) {
        const r = t.r;
        if (p.x > o.x0 - r && p.x < o.x1 + r && p.z > o.z0 - r && p.z < o.z1 + r) {
          const l = p.x - (o.x0 - r), rt = o.x1 + r - p.x, f = p.z - (o.z0 - r), bk = o.z1 + r - p.z;
          const m = Math.min(l, rt, f, bk);
          if (m === l || m === rt) { p.x += m === l ? -l : rt; v.x *= -0.7; } else { p.z += m === f ? -f : bk; v.z *= -0.7; }
        }
      }
    }
  },

  // keep cats out of furniture, inside the room, and off each other
  resolve() {
    const b = this.env.bounds;
    const pad = 0.35;
    for (const k of this.kitties) {
      const p = k.root.position;
      if (k.jump) continue;
      if (k.perch) {
        p.x = Math.max(k.perch.x0, Math.min(k.perch.x1, p.x));
        p.z = Math.max(k.perch.z0, Math.min(k.perch.z1, p.z));
        continue;
      }
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
        const ki = this.kitties[i], kj = this.kitties[j];
        if (ki.jump || kj.jump || ki.perch !== kj.perch) continue;
        const a = ki.root.position, c = kj.root.position;
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
  env.group.traverse((o) => o.isLight && o.layers.enableAll());
  for (const t of env.toys || []) t.vel = new THREE.Vector3();
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
  $('#names').textContent = labels.classList.contains('hide-names') ? 'Names: off' : 'Names: on';
  $('#time').textContent = `Time: ${timeMode}`;
}
$('#sound').onclick = () => { audio.enabled = !audio.enabled; store.set('sound', audio.enabled ? '1' : '0'); syncToggles(); };
$('#names').onclick = () => { labels.classList.toggle('hide-names'); syncToggles(); };
$('#time').onclick = () => {
  timeMode = TIME_MODES[(TIME_MODES.indexOf(timeMode) + 1) % TIME_MODES.length];
  cycleStart = clock.elapsedTime;
  store.set('time', timeMode);
  syncToggles();
};
audio.enabled = store.get('sound') !== '0';
syncToggles();

addEventListener('pointerdown', () => audio.unlock(), { capture: true });
addEventListener('keydown', () => audio.unlock(), { capture: true });

function clearKitties() {
  endPet();
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
    ? `#${data.id} · ${k.cd.name} · fancy · gen ${data.generation}`
    : `#${data.id} · ${k.cd.name} · ${t.body || '?'} · ${t.pattern || '?'} · ${t.eyes || '?'}${data.prestige ? ` · ${data.prestige}` : ''}`;
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

// click a kitty to make it meow, hold to pet it; click a ball to throw it
const ray = new THREE.Raycaster();
ray.layers.enableAll(); // kitties live on per-cooldown layers
let down = null;
let pet = null; // { kitty, t0, purr }

function pick(e, objects) {
  ray.setFromCamera(new THREE.Vector2((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1), camera);
  return ray.intersectObjects(objects, true)[0];
}

function endPet() {
  if (!pet) return;
  if (pet.purr) {
    pet.purr.stop();
    pet.kitty.pet(false);
  }
  pet = null;
  controls.enabled = true;
}

// capture: runs before OrbitControls so holding a kitty doesn't orbit
canvas.addEventListener('pointerdown', (e) => {
  down = [e.clientX, e.clientY];
  const kitty = pick(e, world.kitties.map((k) => k.root))?.object.userData.kitty;
  if (!kitty) return;
  pet = { kitty, t0: performance.now(), purr: null };
  controls.enabled = false;
}, { capture: true });

canvas.addEventListener('pointerup', (e) => {
  const click = down && Math.hypot(e.clientX - down[0], e.clientY - down[1]) < 6;
  down = null;
  if (pet) {
    const tap = !pet.purr;
    const k = pet.kitty;
    endPet();
    if (tap && click) k.poke(world);
    return;
  }
  if (!click) return;
  const hit = pick(e, (world.env.toys || []).map((t) => t.mesh));
  const t = hit && world.env.toys.find((t) => t.mesh === hit.object);
  if (!t) return;
  const dir = t.mesh.position.clone().sub(camera.position).setY(0).normalize().multiplyScalar(4.5);
  world.kick(t, dir.x, dir.z);
  // the nearest couple of awake kitties give chase
  const awake = world.kitties.filter((k) => k.state !== 'sleep' && !k.perch && !k.jump);
  awake.sort((a, b) => a.root.position.distanceTo(t.mesh.position) - b.root.position.distanceTo(t.mesh.position));
  for (const k of awake.slice(0, 2)) k.chase(t, world);
});
canvas.addEventListener('pointercancel', endPet);

// --- loop ------------------------------------------------------------------

const clock = new THREE.Clock();
const v = new THREE.Vector3();
function frame() {
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;
  world.meowCooldown -= dt;
  if (pet && !pet.purr && performance.now() - pet.t0 > 350) {
    pet.kitty.pet(true);
    pet.purr = audio.purr(pet.kitty.voice, world.pan(pet.kitty));
  }
  applyTime(hourNow(t));
  world.env.update?.(t, dt, world.daylight);
  for (const k of world.kitties) k.update(dt, world);
  world.updateToys(dt);
  world.resolve();
  controls.update();
  render(t);

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
