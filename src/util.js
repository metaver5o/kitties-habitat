import * as THREE from 'three';

// mulberry32: small deterministic PRNG so a kitty always looks the same.
export function rng(seed) {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const matCache = new Map();

// Flat-shaded material, cached per color: the low-poly look comes from this.
export function mat(color) {
  const c = color instanceof THREE.Color ? color : new THREE.Color(color);
  const key = c.getHexString();
  if (!matCache.has(key)) {
    matCache.set(key, new THREE.MeshPhongMaterial({ color: c, flatShading: true, shininess: 6 }));
  }
  return matCache.get(key);
}

export const vcMat = (extra = {}) =>
  new THREE.MeshPhongMaterial({ vertexColors: true, flatShading: true, shininess: 6, ...extra });

// Color each triangle by fn(centroid) -> THREE.Color. Gives crisp per-face
// patterns (stripes, patches, planks) without textures.
export function painted(geo, fn) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const pos = g.attributes.position;
  const cols = new Float32Array(pos.count * 3);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), m = new THREE.Vector3();
  for (let i = 0; i < pos.count; i += 3) {
    a.fromBufferAttribute(pos, i);
    b.fromBufferAttribute(pos, i + 1);
    c.fromBufferAttribute(pos, i + 2);
    m.copy(a).add(b).add(c).divideScalar(3);
    const col = fn(m);
    for (let k = 0; k < 3; k++) {
      cols[(i + k) * 3] = col.r;
      cols[(i + k) * 3 + 1] = col.g;
      cols[(i + k) * 3 + 2] = col.b;
    }
  }
  g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  g.computeVertexNormals();
  return g;
}

export function put(parent, geo, material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, material?.isMaterial ? material : mat(material));
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}

export const B = (w, h, d) => new THREE.BoxGeometry(w, h, d);
