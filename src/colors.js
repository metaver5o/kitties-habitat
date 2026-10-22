import * as THREE from 'three';

// CryptoKitties color genes -> hex. Values marked * were read from the
// official SVGs; the rest are close approximations.
const COLORS = {
  // primary (fur)
  shadowgrey: '#b1b1be', // *
  cottoncandy: '#ecd1eb', // *
  mauveover: '#ded0ee', // *
  aquamarine: '#add5d2', // *
  salmon: '#f4a792',
  meowgarine: '#fcfc95',
  orangesoda: '#f7bc56',
  nachocheez: '#fcda86',
  harbourfog: '#afb5c6',
  cinderella: '#5ab0f1',
  greymatter: '#d1dadf',
  tundra: '#c8b3a8',
  brownies: '#b78662',
  dragonfruit: '#ec79f2',
  hintomint: '#d0ead2',
  bananacream: '#f8f8e9',
  cloudwhite: '#ffffff',
  oldlace: '#ffebe9',
  koala: '#85828a',
  lavender: '#bc99ff',
  redvelvet: '#f77272',
  verdigris: '#73ffc3',
  icicle: '#c5e2ff',
  onyx: '#42414c',
  hyacinth: '#a45de2',
  martian: '#a4ff6f',
  hotcocoa: '#5e4a47',
  shamrock: '#50c878',
  firstblush: '#ffd1dc',
  bubblegum: '#ef52d1',
  // secondary (pattern)
  barkbrown: '#886662', // *
  coffee: '#756650', // *
  skyblue: '#bbe4f2',
  swampgreen: '#44410f',
  lemonade: '#ffef85',
  chocolate: '#c47e33',
  royalpurple: '#cf5be8',
  egyptiankohl: '#4b4a50',
  poisonberry: '#773c5f',
  lilac: '#e5e5f9',
  apricot: '#f4a45b',
  padparadscha: '#ffd5c7',
  cyborg: '#959595',
  springcrocus: '#ab8bff',
  scarlet: '#ea5f5a',
  rosequartz: '#ffaacb',
  royalblue: '#5b6ee1',
  wolfgrey: '#737184',
  turtleback: '#387573',
  // tertiary (belly)
  granitegrey: '#b1aeb9', // *
  kittencream: '#f7ebda', // *
  sandalwood: '#b8916c', // *
  belleblue: '#afd0f7',
  peach: '#f9cfad',
  cashewmilk: '#f9efef',
  icy: '#eef8f8',
  frosting: '#fdf0f9',
  purplehaze: '#dad2e9',
  azaleablush: '#ffccd8',
  missmuffett: '#f4e0e7',
  shale: '#585666',
  // eyes
  chestnut: '#a56429', // *
  sizzurp: '#7c40ff', // *
  strawberry: '#ef4b62', // *
  mintgreen: '#43edac',
  topaz: '#0ba09c',
  gold: '#fcdf35',
  limegreen: '#aef72f',
  sapphire: '#4c7aef',
  coralsunrise: '#ff9088',
  doridnudibranch: '#fa9fff',
  olive: '#729100',
  thundergrey: '#828282',
  cyan: '#45f0f4',
  pumpkin: '#ffa039',
  dahlia: '#b8bdff',
  forgetmenot: '#4eb4f9',
  eclipse: '#484c5b',
  parakeet: '#49b749',
  babypuke: '#bcba5e',
  bridesmaid: '#ffc2df',
};

const FALLBACK = { primary: '#cdcdd6', secondary: '#7a6a62', tertiary: '#e8e0d8', eyes: '#5a8f3a' };

export function colorFor(name, slot) {
  if (!name) return new THREE.Color(FALLBACK[slot]);
  if (name.startsWith('#')) return new THREE.Color(name);
  if (COLORS[name]) return new THREE.Color(COLORS[name]);
  // Unknown gene: derive a stable pastel from the name.
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return new THREE.Color().setHSL((h % 360) / 360, 0.55, slot === 'secondary' ? 0.4 : 0.75);
}
