import * as THREE from 'three';
import { rng, mat, vcMat, painted, put, B } from './util.js';
import { colorFor } from './colors.js';

// --- trait tables -----------------------------------------------------------

const FLUFFY = new Set(['cymric', 'laperm', 'ragamuffin', 'himalayan', 'persian', 'selkirk', 'birman',
  'norwegianforest', 'mainecoon', 'chantilly', 'pixiebob', 'lykoi']);
const CURL_TAIL = new Set(['ragdoll', 'himalayan', 'sphynx', 'munchkin', 'chartreux', 'savannah', 'bengal']);
const BRUSH_TAIL = new Set(['cymric', 'laperm', 'ragamuffin', 'persian', 'selkirk', 'birman',
  'norwegianforest', 'mainecoon', 'pixiebob']);

const STRIPES = new Set(['luckystripe', 'tigerpunch', 'tiger', 'amur', 'razzledazzle', 'hotrod']);
const SPOTS = new Set(['spotted', 'leopard', 'jaguar', 'dalmatian', 'cheetah']);
const MASK = new Set(['spock', 'ganado']);

const EYES = {
  googly: { r: 0.125 },
  crazy: { r: 0.11, crazy: true },
  thicccbrowz: { r: 0.1, brows: true },
  simple: { r: 0.075, simple: true },
  wiley: { r: 0.095, lid: true },
  slyboots: { r: 0.095, lid: true },
  sleepy: { r: 0.095, lid: true },
  raisedbrow: { r: 0.1, brows: true },
};

const WHITE = new THREE.Color('#ffffff');
const DARK = '#2b2c36';
const PINK = '#f29cb1';
// CryptoKitties cooldown_index 0..13 -> how the cat is drawn and moves.
// Fast cats get full resolution + smooth geometry; slow ones get chunky pixels,
// glitches, slower walking and stop-motion animation.
const COOLDOWNS = ['Fast', 'Swift', 'Swift', 'Snappy', 'Snappy', 'Brisk', 'Brisk',
  'Plodding', 'Plodding', 'Slow', 'Slow', 'Sluggish', 'Sluggish', 'Catatonic'];
const PIXELS = [1, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 8];

export function cooldownProfile(index) {
  const i = Math.max(0, Math.min(13, index | 0));
  const slow = i / 13;
  return {
    index: i,
    name: COOLDOWNS[i],
    px: PIXELS[i], // also the render layer the cat lives on
    glitch: i < 7 ? 0 : (i - 6) / 7,
    tempo: 1 - slow * 0.6, // walking speed multiplier
    stepDt: i < 3 ? 0 : 1 / (30 - (i - 3) * 2.4), // stop-motion: 30 fps down to ~6 fps
    detail: i < 3 ? 2 : 1, // icosphere subdivisions for body and head
  };
}

const SAYINGS = ['Miau!', 'Miaau~', 'Mrrp?', 'Meow!', 'Nyaa~', 'Mew!', 'Mrrrow', 'Miau miau'];
const BATS = ['Mrrp!', '*bat*', 'Nya!', '*pounce*'];

function patternKind(name) {
  if (!name || name === 'totesbasic') return 'none';
  if (STRIPES.has(name)) return 'stripes';
  if (SPOTS.has(name)) return 'spots';
  if (MASK.has(name)) return 'mask';
  return 'patches';
}

// Returns (dir, part) -> color, where dir is a unit vector on the part's surface.
function makePattern(kind, P, S, R) {
  const centers = Array.from({ length: kind === 'spots' ? 12 : 4 }, () =>
    new THREE.Vector3(R() * 2 - 1, R() * 1.6 - 0.4, R() * 2 - 1).normalize());
  const off = R() * 6;
  const thr = kind === 'spots' ? 0.93 : 0.72;
  return (d, part) => {
    switch (kind) {
      case 'stripes':
        if (part === 'body') return Math.sin(d.z * 11 + off) > 0.25 && d.y > -0.35 ? S : P;
        return (d.y > 0.3 && Math.sin(d.x * 18) > 0.1) || (Math.abs(d.x) > 0.75 && Math.sin(d.y * 14) > 0.3) ? S : P;
      case 'mask':
        if (part === 'head') return d.y > 0.0 && Math.abs(d.x) > 0.2 && d.z > 0 ? S : P;
        return d.y > 0.75 ? S : P;
      case 'patches':
      case 'spots':
        for (const c of centers) if (d.dot(c) > thr) return S;
        return P;
      default:
        return P;
    }
  };
}

// --- model ------------------------------------------------------------------

function buildLeg(parent, x, y, z, P) {
  const pivot = new THREE.Group();
  pivot.position.set(x, y, z);
  put(pivot, new THREE.CylinderGeometry(0.075, 0.06, 0.3, 5), P, 0, -0.15, 0);
  const paw = put(pivot, new THREE.IcosahedronGeometry(0.075, 0), P.clone().lerp(WHITE, 0.25), 0, -0.31, 0.03);
  paw.scale.set(1.15, 0.6, 1.35);
  parent.add(pivot);
  return pivot;
}

function buildModel(t, R, detail) {
  const P = colorFor(t.colorprimary, 'primary');
  const S = colorFor(t.colorsecondary, 'secondary');
  const T = colorFor(t.colortertiary, 'tertiary');
  const E = colorFor(t.coloreyes, 'eyes');
  const kind = patternKind(t.pattern);
  const pattern = makePattern(kind, P, S, R);
  const fluffy = FLUFFY.has(t.body);
  const skin = vcMat();

  const root = new THREE.Group();
  const base = new THREE.Group();
  root.add(base);
  // Torso pivots on the rear hips so sitting is a single rotation.
  const torso = new THREE.Group();
  torso.position.set(0, 0.34, -0.25);
  base.add(torso);

  // body: belly/chest in tertiary, pattern on the rest
  const bs = new THREE.Vector3(0.85, 0.8, 1.2);
  const bodyGeo = painted(new THREE.IcosahedronGeometry(0.4, detail).scale(bs.x, bs.y, bs.z), (m) => {
    const d = m.clone().divide(bs).normalize();
    if ((d.z > 0.45 && d.y < 0.55 && Math.abs(d.x) < 0.55) || d.y < -0.6) return T;
    return pattern(d, 'body');
  });
  const body = new THREE.Mesh(bodyGeo, skin);
  body.position.set(0, 0.18, 0.25);
  torso.add(body);

  // head
  const head = new THREE.Group();
  head.position.set(0, 0.58, 0.67);
  torso.add(head);
  const hs = new THREE.Vector3(1.12, 0.92, 0.95);
  head.add(new THREE.Mesh(
    painted(new THREE.IcosahedronGeometry(0.36, detail).scale(hs.x, hs.y, hs.z), (m) => pattern(m.clone().divide(hs).normalize(), 'head')),
    skin));
  put(head, new THREE.IcosahedronGeometry(0.12, 1).scale(1.5, 0.85, 0.8), P.clone().lerp(WHITE, 0.35), 0, -0.12, 0.27);

  for (const s of [-1, 1]) {
    const ear = put(head, new THREE.ConeGeometry(0.13, 0.3, 4), P, 0.2 * s, 0.33, -0.03);
    ear.rotation.set(0, Math.PI / 4, -0.35 * s);
    const inner = put(head, new THREE.ConeGeometry(0.07, 0.18, 4), PINK, 0.19 * s, 0.31, 0.03);
    inner.rotation.set(0, Math.PI / 4, -0.35 * s);
  }

  // head-top spikes like the CK art; fluffy breeds get cheek tufts too
  for (const [x, h, rz] of [[-0.07, 0.14, 0.3], [0, 0.18, 0], [0.07, 0.13, -0.3]]) {
    const tuft = put(head, new THREE.ConeGeometry(0.05, h, 4), P, x, 0.32 + h / 2 - 0.04, 0.02);
    tuft.rotation.z = rz;
  }
  for (const s of [-1, 1]) {
    for (const [y, len] of fluffy ? [[-0.02, 0.24], [-0.14, 0.2], [0.08, 0.16]] : [[-0.06, 0.15]]) {
      const tuft = put(head, new THREE.ConeGeometry(0.06, len, 4), P, s * (0.38 + len / 3), y, 0.02);
      tuft.rotation.z = -s * (Math.PI / 2 + 0.25);
    }
  }
  if (fluffy) {
    const chest = put(torso, new THREE.ConeGeometry(0.12, 0.25, 4), T, 0, 0.12, 0.68);
    chest.rotation.x = Math.PI - 0.5;
  }

  // eyes
  const ec = EYES[t.eyes] || { r: 0.1 };
  const eyes = [];
  for (const s of [-1, 1]) {
    const r = ec.r;
    const eg = new THREE.Group();
    eg.position.set(0.15 * s, 0.04, 0.29);
    eg.rotation.y = 0.25 * s;
    head.add(eg);
    if (!ec.simple) put(eg, new THREE.SphereGeometry(r, 8, 6), '#ffffff').scale.z = 0.55;
    const iris = new THREE.Group();
    put(iris, new THREE.SphereGeometry(r * (ec.simple ? 1 : 0.62), 8, 6), ec.simple ? DARK : E, 0, 0, r * 0.35).scale.z = 0.5;
    put(iris, new THREE.SphereGeometry(r * 0.3, 6, 4), '#1d1d26', 0, 0, r * 0.58).scale.z = 0.5;
    put(iris, new THREE.SphereGeometry(r * 0.13, 4, 3), '#ffffff', r * 0.2, r * 0.22, r * 0.75);
    if (ec.crazy) iris.position.set(s < 0 ? -r * 0.22 : r * 0.15, s < 0 ? r * 0.22 : -r * 0.15, 0);
    eg.add(iris);
    if (ec.brows) put(eg, B(r * 2.3, 0.035, 0.04), DARK, 0, r * 1.3, r * 0.3).rotation.z = 0.28 * s;
    if (ec.lid) {
      const lid = put(eg, new THREE.SphereGeometry(r * 1.06, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), P);
      lid.scale.z = 0.62;
      lid.rotation.x = 0.35;
    }
    eyes.push(eg);
  }

  // nose, mouth, whiskers
  put(head, new THREE.ConeGeometry(0.035, 0.05, 3), PINK, 0, -0.06, 0.37).rotation.x = Math.PI;
  const mouth = new THREE.Group();
  mouth.position.set(0, -0.15, 0.355);
  head.add(mouth);
  const hole = put(mouth, new THREE.SphereGeometry(0.05, 6, 4), '#5a1f2a', 0, -0.02, 0);
  hole.scale.set(1.2, 0.05, 0.5);
  if (t.mouth === 'soserious') {
    put(mouth, B(0.08, 0.014, 0.02), DARK);
  } else {
    for (const s of [-1, 1]) put(mouth, B(0.06, 0.014, 0.02), DARK, 0.026 * s, 0, 0).rotation.z = 0.45 * s;
  }
  if (t.mouth === 'tongue') put(mouth, B(0.05, 0.07, 0.02), '#f06d8f', 0.01, -0.045, 0.005);
  if (t.mouth === 'gerbil') for (const s of [-1, 1]) put(mouth, B(0.028, 0.05, 0.02), '#ffffff', 0.016 * s, -0.03, 0.006);
  for (const s of [-1, 1]) {
    for (const [dy, rz] of [[0, -0.08], [0.04, 0.12]]) {
      const w = put(head, B(0.3, 0.008, 0.008), '#5c5c66', s * 0.24, -0.1 + dy, 0.27);
      w.rotation.set(0, -s * 0.3, s * rz);
    }
  }

  // legs: FL, FR on torso (front hip), RL, RR on base (rear hip)
  const legs = [
    buildLeg(torso, -0.17, 0, 0.5, P), buildLeg(torso, 0.17, 0, 0.5, P),
    buildLeg(base, -0.17, 0.34, -0.25, P), buildLeg(base, 0.17, 0.34, -0.25, P),
  ];

  // tail: chain of segments, each nested in the previous
  const style = CURL_TAIL.has(t.body) ? 'curl' : BRUSH_TAIL.has(t.body) ? 'brush' : 'plain';
  const tail = new THREE.Group();
  tail.position.set(0, 0.3, -0.2);
  tail.rotation.x = 0.7;
  torso.add(tail);
  const n = style === 'curl' ? 10 : 8;
  const L = style === 'curl' ? 0.1 : 0.12;
  const segs = [];
  let parent = tail;
  for (let i = 0; i < n; i++) {
    const k = i / (n - 1);
    const seg = new THREE.Group();
    seg.position.z = i ? -L : 0;
    seg.userData.baseX = style === 'curl' ? (i > 2 ? 0.62 : 0.1) : style === 'brush' ? 0.14 : 0.16;
    const r = style === 'brush' ? 0.05 + 0.1 * Math.sin(Math.min(1, k * 1.15) * Math.PI * 0.6)
      : style === 'curl' ? 0.05 : 0.058 - 0.018 * k;
    let col = P;
    if (kind === 'stripes' && i % 2) col = S;
    else if (kind === 'patches' && (R() < 0.3 || i >= n - 2)) col = S;
    else if (kind === 'mask' && i >= n - 2) col = S;
    put(seg, new THREE.IcosahedronGeometry(r, style === 'brush' ? 1 : 0).scale(1, 1, style === 'brush' ? 1.25 : 1.6), col, 0, 0, -L / 2);
    parent.add(seg);
    segs.push(seg);
    parent = seg;
  }

  // DuCat & friends: little wings
  const wings = [];
  if (t.wings) {
    for (const s of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(0.3 * s, 0.32, 0.25);
      const w = put(pivot, new THREE.ConeGeometry(0.16, 0.5, 3), t.wings, 0, 0.25, 0);
      w.scale.z = 0.35;
      torso.add(pivot);
      wings.push(pivot);
    }
  }

  // blob shadow (cheap, very N64)
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.5, 8).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.22, depthWrite: false }));
  shadow.position.y = 0.012;
  shadow.scale.z = 1.5;
  root.add(shadow);

  return { root, base, torso, head, eyes, hole, legs, tail, segs, wings, shadow };
}

// --- behavior ---------------------------------------------------------------

const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// Floor spot just outside a perch's furniture, on the side nearest `from`.
function edgeSpot(perch, from, world) {
  const o = perch.ob, m = 0.6;
  const x = clamp(from.x, perch.x0, perch.x1), z = clamp(from.z, perch.z0, perch.z1);
  const spots = [{ x: o.x0 - m, z }, { x: o.x1 + m, z }, { x, z: o.z0 - m }, { x, z: o.z1 + m }]
    .filter((p) => world.isFree(p.x, p.z));
  spots.sort((a, b) => Math.hypot(a.x - from.x, a.z - from.z) - Math.hypot(b.x - from.x, b.z - from.z));
  return spots[0];
}

export class Kitty {
  constructor(data) {
    this.data = data;
    const R = rng(data.id * 2654435761);
    this.cd = cooldownProfile(data.cooldown);
    Object.assign(this, buildModel(data.traits, R, this.cd.detail));
    this.root.traverse((o) => o.layers.set(this.cd.px));
    this.acc = 0;
    this.root.traverse((o) => (o.userData.kitty = this));
    // each kitty has its own handful of recordings and a slight pitch offset
    const first = Math.floor(R() * 12);
    this.voice = { clips: [first, first + 1 + Math.floor(R() * 5), first + 6 + Math.floor(R() * 5)], rate: 0.92 + R() * 0.2 };
    this.state = 'idle';
    this.timer = 0.5 + Math.random() * 2;
    this.pose = { sit: 0, sleep: 0, walk: 0 };
    this.speed = 0.7;
    this.phase = 0;
    this.yaw = Math.random() * Math.PI * 2;
    this.t = Math.random() * 10;
    this.meowT = 0;
    this.meowDur = 1;
    this.nextMeow = 2 + Math.random() * 10;
    this.blinkT = 2 + Math.random() * 3;
    this.hop = 0;
    this.headYaw = 0;
    this.headYawT = 0;
    this.bubble = null;
    this.perch = null; // the furniture top we're on, if any
    this.y = 0;
    this.jump = null;
    this.toy = null; // the ball we're chasing
    this.batCool = 0;
    this.swipe = 0;
    this.petting = false;
    this.petAmt = 0;
  }

  place(world) {
    const p = world.randomSpot();
    this.root.position.set(p.x, 0, p.z);
    this.perch = this.jump = this.target = null;
    this.y = 0;
    this.state = 'idle';
    this.timer = Math.random() * 2;
  }

  say(text, dur = 1.8) {
    this.bubble = { text, until: this.t + dur };
  }

  bubbleText() {
    if (this.petting) return 'Prrr ♥';
    if (this.bubble && this.t < this.bubble.until) return this.bubble.text;
    if (this.pose.sleep > 0.7) return ['z', 'zZ', 'zZz'][Math.floor(this.t * 1.5) % 3];
    return null;
  }

  meow(world) {
    // mouth stays open for as long as the recording plays
    this.meowDur = this.meowT = world.playMeow(this) || 0.9;
    this.say(pick(SAYINGS), Math.max(1.8, this.meowDur + 0.6));
  }

  // held click: sit still and purr; perched cats stay put
  pet(on) {
    this.petting = on;
    if (!on) return this.say('♥', 1.5);
    if (this.perch) this.perchPose = 'sit';
    else if (!this.jump) this.state = 'sit';
    this.timer = Math.max(this.timer, 4);
  }

  chase(toy, world) {
    if (this.perch || this.jump) return;
    this.enter('chase', world);
    this.toy = toy;
  }

  poke(world) {
    if (this.state === 'jump') return;
    if (this.perch) {
      if (this.perchPose === 'sleep') {
        this.perchPose = 'sit';
        this.say('Mrrr...?');
      } else this.meow(world);
      return;
    }
    if (this.state === 'sleep') {
      this.enter('sit', world);
      this.say('Mrrr...?');
    } else {
      this.meow(world);
      this.enter('hop', world);
    }
  }

  enter(state, world) {
    this.state = state;
    switch (state) {
      case 'walk':
      case 'zoomies': {
        this.speed = (state === 'zoomies' ? 2.3 : 0.6 + Math.random() * 0.3) * this.cd.tempo;
        this.target = world.randomSpot();
        const p = this.root.position;
        this.timer = state === 'zoomies' ? 4 + Math.random() * 3
          : Math.hypot(this.target.x - p.x, this.target.z - p.z) / this.speed * 1.8 + 2;
        break;
      }
      case 'sit': this.timer = 4 + Math.random() * 8; break;
      case 'sleep': this.timer = 10 + Math.random() * 15; break;
      case 'hop': this.timer = 1.2 + Math.random(); break;
      case 'chase':
        this.toy = pick(world.env.toys);
        this.speed = 1.6 * this.cd.tempo;
        this.timer = 6 + Math.random() * 6;
        break;
      case 'perched':
        this.perchPose = Math.random() < 0.4 * (2 - world.daylight) ? 'sleep' : 'sit';
        this.timer = this.perchPose === 'sleep' ? 12 + Math.random() * 15 : 5 + Math.random() * 10;
        break;
      default: this.timer = 1.5 + Math.random() * 3;
    }
  }

  // Walk to the edge of a free perch; update() jumps once we get there.
  goPerch(world) {
    const free = (world.env.perches || []).filter((p) => world.kitties.filter((k) => k.perch === p || k.goal === p).length < p.cap);
    if (!free.length) return false;
    const perch = pick(free);
    const at = edgeSpot(perch, this.root.position, world);
    if (!at) return false;
    this.enter('walk', world);
    this.target = at;
    this.goal = perch;
    const p = this.root.position;
    this.timer = Math.hypot(at.x - p.x, at.z - p.z) / this.speed * 2 + 3;
    return true;
  }

  startJump(to, toY, perch) {
    const p = this.root.position;
    this.jump = { x0: p.x, z0: p.z, y0: this.y, x1: to.x, z1: to.z, y1: toY, k: 0, perch };
    this.yaw = Math.atan2(to.x - p.x, to.z - p.z);
    this.perch = null;
    this.state = 'jump';
    this.timer = Infinity;
  }

  nextState(world) {
    const r = Math.random();
    if (this.state === 'perched') {
      const down = edgeSpot(this.perch, this.root.position, world) || world.randomSpot();
      return this.startJump(down, 0, null);
    }
    if (r < 0.15 && this.goPerch(world)) return;
    if (world.env.toys?.length && Math.random() < 0.12) return this.enter('chase', world);
    if (this.state === 'sleep') return this.enter(r < 0.6 ? 'sit' : 'idle', world);
    if (Math.random() < 0.4 * (1 - world.daylight)) return this.enter('sleep', world); // night: more naps
    if (r < 0.42) return this.enter('walk', world);
    if (r < 0.62) return this.enter('sit', world);
    if (r < 0.75) return this.enter('idle', world);
    if (r < 0.85) return this.enter('sleep', world);
    if (r < 0.93) return this.enter('hop', world);
    return this.enter('zoomies', world);
  }

  steer(dt, world) {
    const p = this.root.position;
    const dx = this.target.x - p.x, dz = this.target.z - p.z;
    if (Math.hypot(dx, dz) < 0.25) {
      if (this.state === 'zoomies') this.target = world.randomSpot();
      else if (this.state !== 'chase') this.timer = 0;
      return;
    }
    const diff = wrap(Math.atan2(dx, dz) - this.yaw);
    const turn = (this.state === 'zoomies' ? 7 : 4) * dt;
    this.yaw += Math.max(-turn, Math.min(turn, diff));
    const v = this.speed * this.pose.walk * (Math.abs(diff) > 1.2 ? 0.3 : 1);
    p.x += Math.sin(this.yaw) * v * dt;
    p.z += Math.cos(this.yaw) * v * dt;
  }

  update(dt, world) {
    // slow cats only advance in coarse steps, which reads as choppy motion
    this.acc += dt;
    if (this.acc < this.cd.stepDt) return;
    dt = this.acc;
    this.acc = 0;
    this.t += dt;
    this.timer -= dt;
    if (this.timer <= 0) {
      this.goal = null;
      this.nextState(world);
    }

    if (this.petting) this.timer = Math.max(this.timer, 2);
    this.batCool -= dt;
    this.swipe = Math.max(0, this.swipe - dt * 4);
    if (this.state === 'chase') this.chaseToy(world);
    const want = { sit: 0, sleep: 0, walk: 0 };
    if (this.state === 'walk' || this.state === 'zoomies' || this.state === 'chase') {
      want.walk = 1;
      this.steer(dt, world);
      // reached the furniture: jump up
      const p = this.root.position;
      if (this.goal && Math.hypot(this.target.x - p.x, this.target.z - p.z) < 0.3) {
        const g = this.goal;
        this.goal = null;
        this.startJump({ x: clamp(p.x, g.x0, g.x1), z: clamp(p.z, g.z0, g.z1) }, g.y, g);
      }
    } else if (this.state === 'sit') want.sit = 1;
    else if (this.state === 'sleep') want.sleep = 1;
    else if (this.state === 'perched') want[this.perchPose] = 1;
    else if (this.state === 'jump') this.flyJump(dt, world);

    this.hop = this.state === 'hop' ? Math.abs(Math.sin(this.t * 7)) * 0.3 : Math.max(0, this.hop - dt * 2);
    const k = 1 - Math.exp(-dt * 5);
    for (const key in want) this.pose[key] += (want[key] - this.pose[key]) * k;

    if (this.state !== 'sleep' && !(this.state === 'perched' && this.perchPose === 'sleep')) {
      this.nextMeow -= dt;
      if (this.nextMeow <= 0) {
        this.nextMeow = 6 + Math.random() * 16;
        if (world.requestMeow()) this.meow(world);
      }
      if (Math.random() < dt * 0.3) this.headYawT = (Math.random() - 0.5) * 1.6;
    } else this.headYawT = 0;
    this.meowT = Math.max(0, this.meowT - dt);
    this.blinkT -= dt;
    if (this.blinkT < -0.12) this.blinkT = 2 + Math.random() * 4;

    this.animate(dt);
  }

  // run at the ball and bat it when close enough
  chaseToy(world) {
    const b = this.toy.mesh.position, p = this.root.position;
    this.target = { x: b.x, z: b.z };
    const dx = b.x - p.x, dz = b.z - p.z, d = Math.hypot(dx, dz);
    if (d > 0.55 + this.toy.r || this.batCool > 0) return;
    const f = 2 + Math.random() * 2.5, side = (Math.random() - 0.5) * 2;
    world.kick(this.toy, (dx / d) * f + (-dz / d) * side, (dz / d) * f + (dx / d) * side);
    this.batCool = 0.7;
    this.swipe = 1;
    if (Math.random() < 0.35) this.say(pick(BATS), 1);
  }

  // parabolic arc from j.(x0,y0,z0) to j.(x1,y1,z1), crouch before and after
  flyJump(dt, world) {
    const j = this.jump;
    j.k = Math.min(1, j.k + dt / 0.6);
    const k = j.k, p = this.root.position;
    p.x = j.x0 + (j.x1 - j.x0) * k;
    p.z = j.z0 + (j.z1 - j.z0) * k;
    this.y = j.y0 + (j.y1 - j.y0) * k + Math.sin(Math.PI * k) * (0.35 + Math.max(0, j.y1 - j.y0) * 0.6);
    if (k < 1) return;
    this.jump = null;
    this.y = j.y1;
    this.perch = j.perch;
    this.enter(this.perch ? 'perched' : 'idle', world);
  }

  animate(dt) {
    const { sit, sleep, walk } = this.pose;
    this.root.rotation.y = this.yaw;
    this.root.position.y = this.y;
    // stretch out mid-air
    const air = this.jump ? Math.sin(Math.PI * this.jump.k) : 0;
    this.phase += dt * this.speed * 9 * walk;
    const sw = Math.sin(this.phase) * 0.6 * walk;

    const lower = 0.1 * sit + 0.2 * sleep;
    this.base.position.y = -lower + Math.abs(Math.sin(this.phase)) * 0.035 * walk + this.hop;
    const pitch = -0.5 * sit;
    this.torso.rotation.x = pitch;

    // Front legs stay vertical and stretch to reach the floor while sitting.
    const rise = 0.5 * Math.sin(-pitch);
    const reach = (0.34 - lower + rise) / 0.34;
    for (const [i, leg] of this.legs.entries()) {
      const front = i < 2;
      const swing = (i === 0 || i === 3 ? 1 : -1) * sw;
      leg.rotation.x = (front ? swing - pitch - 1.4 * sleep : swing - 1.25 * sit - 1.4 * sleep) + (front ? -0.9 : 0.9) * air
        - (i === 1 ? 1.3 * Math.sin(Math.PI * this.swipe) : 0);
      leg.scale.y = front ? Math.max(0.6, reach * (1 - sleep) + sleep) : 1;
    }

    const meowAmt = this.meowT > 0 ? Math.sin(Math.PI * (1 - this.meowT / this.meowDur)) : 0;
    this.headYaw += (this.headYawT - this.headYaw) * (1 - Math.exp(-dt * 3));
    this.petAmt += ((this.petting ? 1 : 0) - this.petAmt) * (1 - Math.exp(-dt * 6));
    const pet = this.petAmt;
    this.head.rotation.set(-0.35 * meowAmt + 0.35 * sleep + Math.sin(this.phase * 2) * 0.03 * walk - 0.3 * pet,
      this.headYaw * (1 - pet), 0.25 * pet * Math.sin(this.t * 1.6));
    this.head.position.y = 0.58 - 0.15 * sleep;
    this.hole.scale.y = 0.05 + meowAmt;

    const eyeY = this.blinkT < 0 ? 0.1 : 1;
    for (const e of this.eyes) e.scale.y = (eyeY * (1 - sleep) + 0.08 * sleep) * (1 - 0.8 * pet);

    const amp = (0.12 + 0.18 * walk) * (1 - 0.8 * sleep);
    this.tail.rotation.x = 0.7 - 0.5 * sleep + 0.3 * sit;
    for (const [i, seg] of this.segs.entries()) {
      seg.rotation.y = Math.sin(this.t * (2 + walk * 3) + i * 0.7) * amp;
      seg.rotation.x = seg.userData.baseX + 0.05 * Math.sin(this.t * 1.3 + i);
    }

    const flap = this.hop > 0 || meowAmt > 0 ? 0.6 : 0.08;
    for (const [i, w] of this.wings.entries()) {
      const s = i ? 1 : -1;
      w.rotation.z = -s * (1.0 + Math.sin(this.t * 18) * flap);
    }
  }
}
