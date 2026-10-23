import * as THREE from 'three';
import { rng, mat, vcMat, painted, put, B } from './util.js';

// Each scene returns { group, bounds, obstacles, bg, fog, cam, sky, update? }.
// Obstacles are floor AABBs {x0, x1, z0, z1} the cats walk around.
// perches are tops cats can jump onto: {x0, x1, z0, z1, y, cap, ob}, where ob
// is the obstacle underneath and cap how many cats fit.
// sky holds what the day/night cycle drives: lights and their daytime
// intensities, window glass, lamps, the sun/moon disc and stars.

const C = (hex) => new THREE.Color(hex);
const glow = (hex) => new THREE.MeshBasicMaterial({ color: hex });

function lights(g, sky, ground, hemi, sun, sunPos) {
  const h = new THREE.HemisphereLight(sky, ground, hemi);
  const d = new THREE.DirectionalLight(0xffffff, sun);
  d.position.set(...sunPos);
  g.add(h, d);
  return { hemi: h, sun: d, hemiBase: hemi, sunBase: sun, windows: [], lamps: [] };
}

// window glass that goes dark at night (MeshBasic, so lighting can't do it)
function glass(day) {
  const m = glow(day);
  m.userData.day = C(day);
  return m;
}

function stars(g, R) {
  const pts = [];
  for (let i = 0; i < 400; i++) {
    const a = R() * Math.PI * 2, up = 0.08 + R() * 0.9;
    pts.push(Math.cos(a) * Math.cos(up) * 90, Math.sin(up) * 90, Math.sin(a) * Math.cos(up) * 90);
  }
  const geo = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  const p = new THREE.Points(geo, new THREE.PointsMaterial({ color: '#ffffff', size: 2, sizeAttenuation: false, transparent: true, fog: false }));
  g.add(p);
  return p;
}

// one disc that is the sun by day and the moon by night
const orb = (g, r) => put(g, new THREE.SphereGeometry(r, 8, 6), new THREE.MeshBasicMaterial({ color: '#fff3b0', fog: false }));

function plant(g, x, z, pot = '#d9774a') {
  put(g, new THREE.CylinderGeometry(0.35, 0.27, 0.6, 6), pot, x, 0.3, z);
  put(g, new THREE.IcosahedronGeometry(0.55, 0), '#3f8f4a', x, 1.05, z);
  put(g, new THREE.IcosahedronGeometry(0.4, 0), '#4ea85a', x - 0.2, 1.45, z + 0.1);
  return { x0: x - 0.4, x1: x + 0.4, z0: z - 0.4, z1: z + 0.4 };
}

function home() {
  const g = new THREE.Group();
  const R = rng(7);
  const W = 12, D = 9;
  const woods = ['#b07a4a', '#a46f40', '#bb8453', '#9c6a3f'].map(C);
  // floor runs past the open sides so the camera never sees the void
  g.add(new THREE.Mesh(painted(new THREE.PlaneGeometry(W + 16, D + 10, 14, 38).rotateX(-Math.PI / 2).translate(8, 0, 5), (m) => {
    const row = Math.floor((m.z + D / 2) / (D / 18));
    const col = Math.floor((m.x + W / 2 + (row % 2)) / 2);
    return woods[(row * 7 + col * 3) % 4];
  }), vcMat()));

  put(g, B(W + 16, 5, 0.2), '#efe2c8', 8, 2.5, -D / 2 - 0.1);
  put(g, B(W + 16, 1, 0.25), '#c9b89a', 8, 0.5, -D / 2 - 0.08);
  put(g, B(0.2, 5, D), '#e8d9bb', -W / 2 - 0.1, 2.5, 0);
  put(g, B(0.25, 1, D), '#c9b89a', -W / 2 - 0.08, 0.5, 0);

  // window
  put(g, B(2.7, 2.1, 0.1), '#ffffff', 2.5, 2.9, -D / 2 + 0.02);
  const pane = glass('#bfe6ff');
  put(g, B(2.4, 1.8, 0.05), pane, 2.5, 2.9, -D / 2 + 0.06);
  put(g, B(0.08, 1.8, 0.06), '#ffffff', 2.5, 2.9, -D / 2 + 0.09);
  put(g, B(2.4, 0.08, 0.06), '#ffffff', 2.5, 2.9, -D / 2 + 0.09);
  // picture on left wall
  put(g, B(0.06, 1.1, 1.5), '#6b4a2b', -W / 2 + 0.03, 2.6, 0.5);
  put(g, B(0.06, 0.9, 1.3), '#f2a65a', -W / 2 + 0.06, 2.6, 0.5);
  put(g, new THREE.IcosahedronGeometry(0.25, 0), '#ffe28a', -W / 2 + 0.1, 2.7, 0.3).scale.x = 0.3;

  // rug
  put(g, new THREE.CylinderGeometry(2.3, 2.3, 0.03, 8), '#c0504d', 0.3, 0.015, 0.6);
  put(g, new THREE.CylinderGeometry(1.6, 1.6, 0.03, 8), '#e8b04b', 0.3, 0.025, 0.6);
  put(g, new THREE.CylinderGeometry(0.9, 0.9, 0.03, 8), '#c0504d', 0.3, 0.035, 0.6);

  const obstacles = [];
  // sofa
  const sx = -1.8, sz = -3.6, sofa = '#4f7c8a';
  put(g, B(3.8, 0.45, 1.3), sofa, sx, 0.35, sz);
  for (const i of [-1, 1]) put(g, B(1.75, 0.18, 1.0), '#5f93a3', sx + i * 0.9, 0.66, sz + 0.1);
  put(g, B(3.8, 1.0, 0.35), sofa, sx, 0.95, sz - 0.5);
  for (const i of [-1, 1]) put(g, B(0.35, 0.8, 1.3), sofa, sx + i * 1.9, 0.55, sz);
  put(g, B(0.7, 0.5, 0.25), '#f2d16b', sx - 1.1, 0.95, sz - 0.2).rotation.z = 0.2;
  const sofaOb = { x0: sx - 2.1, x1: sx + 2.1, z0: sz - 0.7, z1: sz + 0.7 };
  obstacles.push(sofaOb);

  // coffee table
  put(g, B(1.8, 0.08, 1), '#7a4b2a', 0.3, 0.48, 0.6);
  for (const [lx, lz] of [[-0.8, -0.4], [0.8, -0.4], [-0.8, 0.4], [0.8, 0.4]]) put(g, B(0.08, 0.45, 0.08), '#5e3920', 0.3 + lx, 0.225, 0.6 + lz);
  put(g, new THREE.CylinderGeometry(0.08, 0.06, 0.15, 6), '#ffffff', 0.6, 0.6, 0.5);
  const tableOb = { x0: -0.6, x1: 1.2, z0: 0.1, z1: 1.1 };
  obstacles.push(tableOb);

  obstacles.push(plant(g, 4.9, -3.7));

  // bookshelf
  put(g, B(0.6, 2.6, 2), '#8b5a33', -5.65, 1.3, -0.5);
  for (const y of [0.25, 0.85, 1.45, 2.05]) {
    let z = -1.35;
    while (z < 0.3) {
      const w = 0.08 + R() * 0.1, h = 0.32 + R() * 0.18;
      put(g, B(0.4, h, w), new THREE.Color().setHSL(R(), 0.5, 0.5), -5.4, y + h / 2, z + w / 2);
      z += w + 0.02;
    }
  }
  obstacles.push({ x0: -6, x1: -5.25, z0: -1.5, z1: 0.5 });

  // floor lamp
  put(g, new THREE.CylinderGeometry(0.25, 0.25, 0.05, 6), '#333333', -4.4, 0.025, -3.9);
  put(g, new THREE.CylinderGeometry(0.03, 0.03, 1.8, 5), '#333333', -4.4, 0.9, -3.9);
  put(g, new THREE.ConeGeometry(0.4, 0.45, 6, 1, true), glow('#ffe6a8'), -4.4, 1.9, -3.9);
  const lamp = new THREE.PointLight('#ffcf8a', 4, 7, 1);
  lamp.position.set(-4.4, 1.7, -3.7);
  g.add(lamp);
  obstacles.push({ x0: -4.7, x1: -4.1, z0: -4.2, z1: -3.6 });

  // cat stuff
  put(g, new THREE.TorusGeometry(0.45, 0.16, 5, 8).rotateX(-Math.PI / 2), '#d9a3c4', 3.6, 0.14, 2.2);
  put(g, new THREE.CylinderGeometry(0.42, 0.42, 0.06, 8), '#f3d4e6', 3.6, 0.04, 2.2);
  put(g, new THREE.IcosahedronGeometry(0.16, 1), '#e0457b', -2.2, 0.16, 2.2);
  put(g, new THREE.CylinderGeometry(0.22, 0.17, 0.12, 8), '#5b8def', 5, 0.06, 3.4);

  const sky = lights(g, '#fff4e0', '#8a6a4a', 1.4, 1.8, [3, 8, 6]);
  sky.windows.push(pane);
  sky.lamps.push({ light: lamp, day: 4, night: 14 });
  const perches = [
    { x0: sx - 1.6, x1: sx + 1.6, z0: sz - 0.25, z1: sz + 0.5, y: 0.75, cap: 3, ob: sofaOb },
    { x0: -0.35, x1: 0.95, z0: 0.35, z1: 0.85, y: 0.52, cap: 1, ob: tableOb },
  ];
  return {
    group: g, obstacles, perches, bg: '#2a2230', fog: null, sky,
    bounds: { x0: -5.6, x1: 5.6, z0: -4.2, z1: 4.2 },
    cam: { pos: [0, 6.5, 10.5], target: [0, 0.6, 0] },
  };
}

function office() {
  const g = new THREE.Group();
  const W = 14, D = 10;
  const tiles = ['#5d6b7d', '#66768a'].map(C);
  g.add(new THREE.Mesh(painted(new THREE.PlaneGeometry(W + 16, D + 10, 30, 20).rotateX(-Math.PI / 2).translate(8, 0, 5),
    (m) => tiles[(Math.floor(m.x + W / 2) + Math.floor(m.z + D / 2)) % 2]), vcMat()));
  put(g, B(W + 16, 5, 0.2), '#d9dde3', 8, 2.5, -D / 2 - 0.1);
  put(g, B(0.2, 5, D), '#cfd5dc', -W / 2 - 0.1, 2.5, 0);
  put(g, B(W + 16, 0.15, 0.25), '#8a94a3', 8, 0.075, -D / 2 - 0.05);
  const pane = glass('#a9d8ff');
  for (const x of [-3.5, 0.5, 4.5]) {
    put(g, B(2.1, 1.8, 0.1), '#3d4554', x, 2.7, -D / 2 + 0.02);
    put(g, B(1.9, 1.6, 0.05), pane, x, 2.7, -D / 2 + 0.06);
  }
  // pendant lights: barely noticeable by day, the main light at night
  const lamps = [];
  for (const x of [-3.5, 0.5, 4.5]) {
    put(g, B(0.02, 1.4, 0.02), '#333333', x, 4.3, -2.6);
    put(g, B(1.4, 0.08, 0.35), '#333333', x, 3.6, -2.6);
    put(g, B(1.3, 0.02, 0.28), glow('#f4f8ff'), x, 3.55, -2.6);
    const l = new THREE.PointLight('#e8f0ff', 1, 10, 1);
    l.position.set(x, 3.3, -2);
    g.add(l);
    lamps.push({ light: l, day: 1, night: 9 });
  }
  // whiteboard
  put(g, B(0.06, 1.3, 2.6), '#8a94a3', -W / 2 + 0.03, 2.1, 0.5);
  put(g, B(0.06, 1.15, 2.45), '#ffffff', -W / 2 + 0.06, 2.1, 0.5);
  put(g, B(0.02, 0.05, 1.2), '#e05252', -W / 2 + 0.1, 2.3, 0.3);
  put(g, B(0.02, 0.05, 0.8), '#3d7be0', -W / 2 + 0.1, 2.0, 0.6);

  const obstacles = [];
  const perches = [];
  for (const x of [-3.5, 0.5, 4.5]) {
    const z = -3;
    put(g, B(2.2, 0.08, 1.0), '#e6e1d6', x, 0.76, z);
    for (const s of [-1, 1]) put(g, B(0.06, 0.76, 0.9), '#555555', x + s * 1.05, 0.38, z);
    put(g, B(0.08, 0.25, 0.08), '#333333', x, 0.92, z - 0.25);
    put(g, B(0.9, 0.55, 0.05), '#222222', x, 1.3, z - 0.27);
    put(g, B(0.82, 0.47, 0.01), glow(x > 0 ? '#5fb3ff' : '#7cf0a0'), x, 1.3, z - 0.24);
    put(g, B(0.6, 0.03, 0.2), '#333333', x, 0.81, z + 0.1);
    put(g, new THREE.CylinderGeometry(0.05, 0.05, 0.1, 6), '#e05252', x + 0.75, 0.85, z);
    // chair
    const cz = z + 0.95;
    put(g, B(0.6, 0.08, 0.6), '#2d3a4f', x, 0.5, cz);
    put(g, B(0.6, 0.65, 0.08), '#2d3a4f', x, 0.85, cz + 0.3);
    put(g, new THREE.CylinderGeometry(0.04, 0.04, 0.45, 5), '#444444', x, 0.25, cz);
    for (const r of [0, Math.PI / 2]) put(g, B(0.65, 0.05, 0.08), '#444444', x, 0.03, cz).rotation.y = r + 0.4;
    const ob = { x0: x - 1.15, x1: x + 1.15, z0: z - 0.55, z1: cz + 0.4 };
    obstacles.push(ob);
    // on the desk, right in front of the keyboard, like real cats
    perches.push({ x0: x - 0.85, x1: x + 0.85, z0: z + 0.2, z1: z + 0.35, y: 0.8, cap: 1, ob });
    perches.push({ x0: x - 0.05, x1: x + 0.05, z0: cz - 0.1, z1: cz + 0.05, y: 0.54, cap: 1, ob });
  }
  // water cooler
  put(g, B(0.5, 1.1, 0.5), '#e8e8e8', -6.3, 0.55, -4.3);
  const bottle = new THREE.MeshPhongMaterial({ color: '#7fc4ff', transparent: true, opacity: 0.75, flatShading: true });
  put(g, new THREE.CylinderGeometry(0.2, 0.2, 0.5, 8), bottle, -6.3, 1.35, -4.3);
  obstacles.push({ x0: -6.6, x1: -6, z0: -4.6, z1: -4 });
  obstacles.push(plant(g, 6.3, -4.3, '#ffffff'));
  obstacles.push(plant(g, -6.3, 4.2, '#ffffff'));
  // beanbag + cardboard box (cats love boxes)
  put(g, new THREE.IcosahedronGeometry(0.6, 1).scale(1, 0.55, 1), '#f08a3c', 4.8, 0.32, 2.8);
  const bagOb = { x0: 4.2, x1: 5.4, z0: 2.2, z1: 3.4 };
  obstacles.push(bagOb);
  perches.push({ x0: 4.7, x1: 4.9, z0: 2.7, z1: 2.9, y: 0.6, cap: 1, ob: bagOb });
  const bx = 1.2, bz = 2.4, kraft = '#c49a63';
  put(g, B(0.9, 0.03, 0.7), kraft, bx, 0.015, bz);
  for (const s of [-1, 1]) {
    put(g, B(0.03, 0.4, 0.7), kraft, bx + s * 0.45, 0.2, bz);
    put(g, B(0.9, 0.4, 0.03), kraft, bx, 0.2, bz + s * 0.35);
  }

  const sky = lights(g, '#ffffff', '#556070', 1.3, 1.6, [-4, 9, 5]);
  sky.windows.push(pane);
  sky.lamps.push(...lamps);
  return {
    group: g, obstacles, perches, bg: '#1e2430', fog: null, sky,
    bounds: { x0: -6.4, x1: 6.4, z0: -4.6, z1: 4.6 },
    cam: { pos: [0, 7, 11.5], target: [0, 0.6, 0] },
  };
}

function tree(g, x, z) {
  put(g, new THREE.CylinderGeometry(0.18, 0.26, 1.6, 5), '#7a5432', x, 0.8, z);
  put(g, new THREE.IcosahedronGeometry(1.1, 0), '#3e8b3a', x, 2.2, z);
  put(g, new THREE.IcosahedronGeometry(0.8, 0), '#4fa045', x + 0.4, 2.9, z + 0.2);
  return { x0: x - 0.4, x1: x + 0.4, z0: z - 0.4, z1: z + 0.4 };
}

function pine(g, x, z) {
  put(g, new THREE.CylinderGeometry(0.15, 0.2, 1, 5), '#6b4a2b', x, 0.5, z);
  for (const [y, r] of [[1.4, 1], [2.1, 0.8], [2.7, 0.55]]) put(g, new THREE.ConeGeometry(r, 1.3, 6), '#2f6e3b', x, y, z);
  return { x0: x - 0.4, x1: x + 0.4, z0: z - 0.4, z1: z + 0.4 };
}

function garden() {
  const g = new THREE.Group();
  const R = rng(42);
  const ground = new THREE.PlaneGeometry(44, 44, 22, 22).rotateX(-Math.PI / 2);
  const p = ground.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const far = Math.abs(p.getX(i)) > 10 || Math.abs(p.getZ(i)) > 8;
    p.setY(i, R() * (far ? 0.5 : 0.04));
  }
  const greens = ['#5aa548', '#4f9a3f', '#66b052', '#57a044'].map(C);
  g.add(new THREE.Mesh(painted(ground, () => greens[Math.floor(R() * 4)]), vcMat()));

  const obstacles = [];
  // fence
  for (let x = -10; x <= 10; x += 1.25) put(g, B(0.12, 1, 0.12), '#f4f1ea', x, 0.5, -8);
  for (const y of [0.35, 0.75]) put(g, B(20.4, 0.08, 0.06), '#f4f1ea', 0, y, -8);
  for (const [x, z] of [[-7, -5], [6.5, -6], [-8.5, 3], [8.5, 2.5]]) obstacles.push(tree(g, x, z));
  for (const [x, z] of [[-3, -9.5], [2, -10], [10, -6], [-11, -2]]) pine(g, x, z);

  // pond
  put(g, new THREE.CylinderGeometry(1.8, 1.9, 0.04, 10), new THREE.MeshPhongMaterial({ color: '#3d8fd1', shininess: 80, flatShading: true }), 3.5, 0.03, -2);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    put(g, new THREE.DodecahedronGeometry(0.22, 0), '#9a9a9a', 3.5 + Math.cos(a) * 1.95, 0.08, -2 + Math.sin(a) * 1.95);
  }
  obstacles.push({ x0: 1.4, x1: 5.6, z0: -4.1, z1: 0.1 });
  const perches = [];
  for (const [x, z, s] of [[-4, 1.5, 0.45], [5.5, 4, 0.35]]) {
    put(g, new THREE.DodecahedronGeometry(s, 0), '#9a9a9a', x, s * 0.6, z);
    const ob = { x0: x - s, x1: x + s, z0: z - s, z1: z + s };
    obstacles.push(ob);
    perches.push({ x0: x - 0.05, x1: x + 0.05, z0: z - 0.05, z1: z + 0.05, y: s * 1.45, cap: 1, ob });
  }
  // bench
  const bx = -2.5, bz = -4.6, wood = '#a0703f';
  put(g, B(2.2, 0.08, 0.7), wood, bx, 0.5, bz);
  put(g, B(2.2, 0.5, 0.08), wood, bx, 0.85, bz - 0.33);
  for (const s of [-1, 1]) put(g, B(0.1, 0.5, 0.6), '#5a5a5a', bx + s * 0.95, 0.25, bz);
  const benchOb = { x0: bx - 1.15, x1: bx + 1.15, z0: bz - 0.4, z1: bz + 0.35 };
  obstacles.push(benchOb);
  perches.push({ x0: bx - 0.6, x1: bx + 0.6, z0: bz - 0.05, z1: bz + 0.1, y: 0.54, cap: 2, ob: benchOb });
  for (const [x, z] of [[-6, -2], [7, -1.5], [-2, -6.5], [0, 5.8]]) {
    put(g, new THREE.IcosahedronGeometry(0.55, 0).scale(1, 0.7, 1), '#3f8f3a', x, 0.35, z);
    obstacles.push({ x0: x - 0.5, x1: x + 0.5, z0: z - 0.5, z1: z + 0.5 });
  }
  for (let i = 0; i < 8; i++) put(g, new THREE.CylinderGeometry(0.35, 0.35, 0.05, 6), '#c9c2b2', -1 + Math.sin(i * 0.6) * 1.5, 0.03, 6 - i * 1.3);
  const petals = ['#ff6b8b', '#ffd23f', '#ffffff', '#b48cff', '#ff8c42'];
  for (let i = 0; i < 50; i++) {
    const x = (R() - 0.5) * 18, z = (R() - 0.5) * 14;
    if (Math.hypot(x - 3.5, z + 2) < 2.3) continue;
    put(g, new THREE.CylinderGeometry(0.015, 0.015, 0.25, 3), '#3b7d2f', x, 0.125, z);
    put(g, new THREE.IcosahedronGeometry(0.06, 0), petals[i % 5], x, 0.27, z);
  }

  // fireflies come out after dusk
  const flies = [];
  for (let i = 0; i < 18; i++) {
    const f = put(g, new THREE.IcosahedronGeometry(0.05, 0), new THREE.MeshBasicMaterial({ color: '#e6ff7a', transparent: true }),
      (R() - 0.5) * 16, 0.4 + R() * 1.2, (R() - 0.5) * 12);
    f.userData.home = f.position.clone();
    f.userData.seed = R() * 100;
    flies.push(f);
  }
  const clouds = new THREE.Group();
  for (let i = 0; i < 6; i++) {
    const c = new THREE.Group();
    for (let j = 0; j < 4; j++) put(c, new THREE.IcosahedronGeometry(1.2 + R(), 0), '#ffffff', j * 1.4, R() * 0.6, R());
    c.position.set(-30 + i * 11, 11 + R() * 4, -28 - R() * 8);
    clouds.add(c);
  }
  g.add(clouds);

  const sky = lights(g, '#cfeaff', '#4a7a35', 1.3, 2.2, [-10, 15, 8]);
  Object.assign(sky, { outdoor: true, orb: orb(g, 2.5), stars: stars(g, R), orbDist: 50 });
  return {
    group: g, obstacles, perches, bg: '#8fd0ff', fog: ['#8fd0ff', 28, 70], sky,
    bounds: { x0: -9, x1: 9, z0: -7.3, z1: 7 },
    cam: { pos: [0, 8, 15], target: [0, 0.5, 0] },
    update(t, dt, daylight) {
      for (const c of clouds.children) {
        c.position.x += dt * 0.4;
        if (c.position.x > 36) c.position.x = -36;
      }
      const dark = Math.max(0, 1 - daylight * 2.5);
      for (const f of flies) {
        const { home, seed } = f.userData;
        f.visible = dark > 0;
        f.position.set(home.x + Math.sin(t * 0.4 + seed) * 0.8, home.y + Math.sin(t * 0.9 + seed * 2) * 0.3, home.z + Math.cos(t * 0.3 + seed) * 0.8);
        f.material.opacity = dark * (0.5 + 0.5 * Math.sin(t * 3 + seed * 7));
      }
    },
  };
}

function palm(g, x, z, lean) {
  let px = x;
  for (let i = 0; i < 6; i++) {
    px += lean * i * 0.04;
    put(g, new THREE.CylinderGeometry(0.15, 0.19, 0.6, 5), i % 2 ? '#8d6a45' : '#7b5a39', px, 0.3 + i * 0.55, z).rotation.z = -lean * 0.15;
  }
  const top = new THREE.Vector3(px, 3.4, z);
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    const leaf = put(g, B(1.9, 0.04, 0.42), i % 2 ? '#3e9a46' : '#4cb354', top.x + Math.cos(a) * 0.8, top.y - 0.2, top.z + Math.sin(a) * 0.8);
    leaf.rotation.set(0, -a, -0.45);
  }
  for (let i = 0; i < 3; i++) put(g, new THREE.IcosahedronGeometry(0.13, 0), '#6b4a2b', top.x + (i - 1) * 0.18, top.y - 0.25, top.z + 0.1);
  return { x0: x - 0.4, x1: x + 0.4, z0: z - 0.4, z1: z + 0.4 };
}

function beach() {
  const g = new THREE.Group();
  const R = rng(9);
  const sands = ['#f1d9a0', '#ebd193', '#f5e0ad'].map(C);
  g.add(new THREE.Mesh(painted(new THREE.PlaneGeometry(44, 30, 22, 15).rotateX(-Math.PI / 2).translate(0, 0, 6),
    () => sands[Math.floor(R() * 3)]), vcMat()));
  put(g, B(44, 0.02, 0.7), '#ffffff', 0, 0.01, -8.8);
  const seaGeo = new THREE.PlaneGeometry(90, 40, 36, 16).rotateX(-Math.PI / 2).translate(0, -0.05, -29);
  const sea = put(g, seaGeo, new THREE.MeshPhongMaterial({ color: '#2f9fd8', shininess: 60, flatShading: true }));
  const seaBase = Float32Array.from(seaGeo.attributes.position.array);

  const obstacles = [];
  obstacles.push(palm(g, -6.5, -4.5, 1), palm(g, 7, -3, -1), palm(g, -8.5, 4, 0.6));

  // umbrella + towel
  put(g, new THREE.CylinderGeometry(0.04, 0.04, 2.2, 5), '#ffffff', 2.5, 1.1, 0.5);
  const reds = [C('#e74c3c'), C('#ffffff')];
  put(g, painted(new THREE.ConeGeometry(1.5, 0.6, 8), (m) => reds[Math.floor(((Math.atan2(m.z, m.x) + Math.PI) / (Math.PI * 2)) * 8) % 2]), vcMat(), 2.5, 2.3, 0.5);
  const blues = [C('#3d7be0'), C('#ffffff')];
  put(g, painted(B(1.1, 0.02, 2, 1, 1, 8), (m) => blues[Math.floor((m.z + 1) * 3) % 2]), vcMat(), 2.5, 0.012, 1.9);
  obstacles.push({ x0: 2.3, x1: 2.7, z0: 0.3, z1: 0.7 });

  // beach ball
  const ball = ['#e74c3c', '#ffffff', '#f1c40f', '#ffffff', '#3d7be0', '#ffffff'].map(C);
  put(g, painted(new THREE.IcosahedronGeometry(0.3, 1), (m) => ball[Math.floor(((Math.atan2(m.z, m.x) + Math.PI) / (Math.PI * 2)) * 6) % 6]), vcMat(), -1.8, 0.3, 2.8);
  obstacles.push({ x0: -2.1, x1: -1.5, z0: 2.5, z1: 3.1 });

  // sandcastle
  const cx = -4.5, cz = 0.8, sand = '#d9b874';
  put(g, B(1, 0.5, 1), sand, cx, 0.25, cz);
  put(g, B(0.5, 0.35, 0.5), sand, cx, 0.65, cz);
  for (const [dx, dz] of [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]]) {
    put(g, new THREE.CylinderGeometry(0.18, 0.2, 0.75, 6), sand, cx + dx, 0.375, cz + dz);
    put(g, new THREE.ConeGeometry(0.22, 0.3, 6), '#cfa964', cx + dx, 0.9, cz + dz);
  }
  put(g, B(0.02, 0.3, 0.2), '#e74c3c', cx + 0.5, 1.2, cz - 0.5);
  const castleOb = { x0: cx - 0.75, x1: cx + 0.75, z0: cz - 0.75, z1: cz + 0.75 };
  obstacles.push(castleOb);
  // cooler box
  const kx = 5, kz = 2.5;
  put(g, B(0.8, 0.45, 0.5), '#3d7be0', kx, 0.225, kz);
  put(g, B(0.84, 0.08, 0.54), '#ffffff', kx, 0.48, kz);
  const coolerOb = { x0: kx - 0.4, x1: kx + 0.4, z0: kz - 0.25, z1: kz + 0.25 };
  obstacles.push(coolerOb);
  const perches = [
    { x0: cx - 0.05, x1: cx + 0.05, z0: cz - 0.05, z1: cz + 0.05, y: 0.825, cap: 1, ob: castleOb },
    { x0: kx - 0.1, x1: kx + 0.1, z0: kz - 0.02, z1: kz + 0.02, y: 0.52, cap: 1, ob: coolerOb },
  ];

  for (let i = 0; i < 6; i++) {
    const s = put(g, new THREE.ConeGeometry(0.16, 0.03, 5), '#ff8a5c', (R() - 0.5) * 16, 0.02, (R() - 0.5) * 12);
    s.rotation.y = R() * 6;
  }
  const sky = lights(g, '#ffffff', '#e0c89a', 1.3, 2.4, [8, 14, 6]);
  Object.assign(sky, { outdoor: true, orb: orb(g, 3), stars: stars(g, R), orbDist: 65 });
  return {
    group: g, obstacles, perches, bg: '#9ad7f5', fog: ['#9ad7f5', 30, 85], sky,
    bounds: { x0: -9, x1: 9, z0: -7.8, z1: 6 },
    cam: { pos: [0, 7, 14], target: [0, 0.5, 0] },
    update(t) {
      const a = seaGeo.attributes.position;
      for (let i = 0; i < a.count; i++) {
        const x = seaBase[i * 3], z = seaBase[i * 3 + 2];
        a.setY(i, seaBase[i * 3 + 1] + Math.sin(x * 0.35 + t * 1.2) * 0.12 + Math.cos(z * 0.5 + t) * 0.08);
      }
      a.needsUpdate = true;
      sea.geometry.computeVertexNormals();
    },
  };
}

export const SCENES = {
  home: { label: 'Home', build: home },
  office: { label: 'Office', build: office },
  garden: { label: 'Garden', build: garden },
  beach: { label: 'Beach', build: beach },
};
