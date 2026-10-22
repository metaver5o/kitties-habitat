const API = 'https://api.cryptokitties.co';

export async function fetchKitties(owner, max = 60) {
  const out = [];
  for (let offset = 0; out.length < max; offset += 50) {
    const r = await fetch(`${API}/kitties?owner_wallet_address=${owner}&limit=50&offset=${offset}`);
    if (!r.ok) throw new Error(`CryptoKitties API: HTTP ${r.status}`);
    const { kitties = [], total = 0 } = await r.json();
    out.push(...kitties.map(normalize));
    if (kitties.length < 50 || out.length >= total) break;
  }
  return out.slice(0, max);
}

function normalize(k) {
  const traits = {};
  for (const c of k.enhanced_cattributes || []) traits[c.type] = c.description;
  return {
    id: k.id,
    name: k.name || (k.is_fancy && k.fancy_type) || `Kitty #${k.id}`,
    fancy: k.is_fancy ? k.fancy_type : null,
    traits,
    image: k.image_url_png || k.image_url,
    generation: k.generation,
    cooldown: k.status?.cooldown_index ?? 0,
    color: k.color,
  };
}

// Fancy cats have no cattributes: pull a palette out of their artwork.
export function sampleColors(url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onerror = () => resolve([]);
    img.onload = () => {
      try {
        const c = document.createElement('canvas');
        c.width = c.height = 64;
        const x = c.getContext('2d');
        x.drawImage(img, 0, 0, 64, 64);
        const d = x.getImageData(0, 0, 64, 64).data;
        const hist = new Map();
        for (let i = 0; i < d.length; i += 4) {
          if (d[i + 3] < 200) continue;
          const lum = d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11;
          if (lum < 60) continue; // outlines
          const key = ((d[i] >> 4) << 8) | ((d[i + 1] >> 4) << 4) | (d[i + 2] >> 4);
          hist.set(key, (hist.get(key) || 0) + 1);
        }
        const rgb = (k) => [((k >> 8) & 15) * 17, ((k >> 4) & 15) * 17, (k & 15) * 17];
        const picked = [];
        for (const [k] of [...hist].sort((a, b) => b[1] - a[1])) {
          const c1 = rgb(k);
          if (picked.every((c2) => Math.hypot(c1[0] - c2[0], c1[1] - c2[1], c1[2] - c2[2]) > 70)) picked.push(c1);
          if (picked.length === 3) break;
        }
        resolve(picked.map((c) => '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('')));
      } catch {
        resolve([]);
      }
    };
    img.src = url;
  });
}
