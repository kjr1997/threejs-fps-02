// Yard 7: an original dusk-lit foundry yard. Ember spawn is south, Sable spawn is north,
// Site A (the furnace hall) is west, Site B (the container yard) is east, and three lanes
// join them: A-long, mid through the double doors, and B-long. Every box is a collider
// for movement and a surface a bullet stops on. The nav graph is the bots' road map.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

const NODES = {
  emberSpawn: [0, 15],
  emberYard: [-6, 11],
  emberYardE: [6, 11],
  aLong1: [-17, 9],
  aLong2: [-18, 0],
  aCorner: [-18, -7],
  aSite: [-14, -11],
  aHall: [-8, -9],
  midSouth: [0, 7],
  midDoors: [0, -1],
  midNorth: [0, -8],
  bLong1: [17, 9],
  bLong2: [18, 0],
  bCorner: [18, -7],
  bSite: [14, -11],
  bHall: [8, -9],
  sableSpawn: [0, -15],
  sableYard: [-6, -13],
  sableYardE: [6, -13],
};

const EDGES = [
  ['emberSpawn', 'emberYard'], ['emberSpawn', 'emberYardE'], ['emberSpawn', 'midSouth'],
  ['emberYard', 'aLong1'], ['emberYardE', 'bLong1'],
  ['aLong1', 'aLong2'], ['aLong2', 'aCorner'], ['aCorner', 'aSite'], ['aCorner', 'aHall'],
  ['aSite', 'aHall'], ['aHall', 'midNorth'], ['aHall', 'sableYard'],
  ['bLong1', 'bLong2'], ['bLong2', 'bCorner'], ['bCorner', 'bSite'], ['bCorner', 'bHall'],
  ['bSite', 'bHall'], ['bHall', 'midNorth'], ['bHall', 'sableYardE'],
  ['midSouth', 'midDoors'], ['midDoors', 'midNorth'], ['midNorth', 'sableSpawn'],
  ['midSouth', 'emberYard'], ['midSouth', 'emberYardE'],
  ['midNorth', 'sableYard'], ['midNorth', 'sableYardE'],
  ['sableYard', 'sableSpawn'], ['sableYardE', 'sableSpawn'],
  ['aLong2', 'midDoors'], ['bLong2', 'midDoors'],
];

export function createWorld(scene) {
  const group = new THREE.Group();
  scene.add(group);
  const materials = {};
  for (const name of Object.keys(PALETTE)) {
    materials[name] = new THREE.MeshStandardMaterial({
      color: new THREE.Color(PALETTE[name]),
      roughness: name === 'ember' || name === 'accent' ? 0.5 : 0.92,
      metalness: name === 'rust' || name === 'containerA' || name === 'containerB' ? 0.35 : 0.04,
    });
  }
  const colliders = [];
  const shootables = [];

  function box(w, h, d, x, y, z, material, collide = true) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), materials[material]);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    if (collide) {
      colliders.push(new THREE.Box3().setFromObject(mesh));
      shootables.push(mesh);
    }
    return mesh;
  }

  // Deterministic per-crate variation from its coordinates, so the map is identical
  // on every load (screenshots and replays agree).
  function crate(x, z, size = 1.2, h = 1.1) {
    const seed = Math.abs(Math.sin(x * 12.9898 + z * 78.233) * 43758.5453) % 1;
    const m = box(size, h, size, x, h / 2, z, seed < 0.5 ? 'crate' : 'crateDark');
    m.rotation.y = (seed - 0.5) * 0.2;
    return m;
  }

  // Ground and perimeter: 44 x 36 m, 4.6 m walls, open sky.
  box(44.4, 0.4, 36.4, 0, -0.2, 0, 'ground');
  box(0.4, 4.6, 36.4, -22.2, 2.3, 0, 'concrete');
  box(0.4, 4.6, 36.4, 22.2, 2.3, 0, 'concrete');
  box(44.4, 4.6, 0.4, 0, 2.3, -18.2, 'concrete');
  box(44.4, 4.6, 0.4, 0, 2.3, 18.2, 'concrete');

  // Site A, the furnace hall (west): furnace block, catwalk pillars, low cover.
  box(6, 3.4, 1.2, -18.6, 1.7, -11, 'rust');
  box(4.4, 1.1, 3.2, -15, 0.55, -13.5, 'concreteDark');
  box(1.4, 2.6, 1.4, -11, 1.3, -14.5, 'rust');
  box(1.4, 2.6, 1.4, -11, 1.3, -7.5, 'rust');
  crate(-16.5, -8.2);
  crate(-12.5, -13.8, 1.1, 1.0);
  box(3.2, 0.5, 1.6, -14, 0.25, -6.2, 'concreteDark');

  // Site B, the container yard (east): stacked containers, barrels, a platform.
  box(6.2, 2.6, 2.6, 18.6, 1.3, -12.5, 'containerA');
  box(6.2, 2.6, 2.6, 18.6, 3.9, -12.5, 'containerB');
  box(4.4, 2.6, 2.6, 12.5, 1.3, -15.5, 'containerB');
  box(1.1, 1.1, 1.1, 11.5, 0.55, -8.2, 'barrel');
  box(1.1, 1.1, 1.1, 12.8, 0.55, -8.0, 'barrel');
  crate(15.5, -7.6);
  box(3.4, 0.5, 2.0, 15, 0.25, -14.8, 'concreteDark');

  // Mid: the double-door gap with a broken wall and crates on both sides.
  box(2.2, 4.6, 0.6, -2.4, 2.3, -1, 'concrete');
  box(2.2, 4.6, 0.6, 2.4, 2.3, -1, 'concrete');
  box(1.0, 2.2, 0.6, 0, 1.1, -1, 'rust');
  crate(-4.2, 2.6);
  crate(4.4, 3.0, 1.2, 0.9);
  crate(-3.6, -4.6, 1.1, 1.0);
  crate(3.8, -4.8);

  // Lane cover: A-long crates, B-long crates, spawn cover.
  crate(-17.5, 5.5);
  crate(-16.2, -3.2, 1.2, 0.9);
  crate(17.5, 5.5);
  crate(16.2, -3.2, 1.2, 0.9);
  box(2.6, 1.0, 1.2, -8, 0.5, 8, 'concreteDark');
  box(2.6, 1.0, 1.2, 8, 0.5, 8, 'concreteDark');
  box(1.2, 2.2, 1.2, -10.5, 1.1, 14.5, 'rust');
  box(1.2, 2.2, 1.2, 10.5, 1.1, 14.5, 'rust');
  box(1.2, 2.2, 1.2, -10.5, 1.1, -15.5, 'rust');
  box(1.2, 2.2, 1.2, 10.5, 1.1, -15.5, 'rust');
  crate(-4, -12.5, 1.1, 1.0);
  crate(4, -12.5, 1.1, 1.0);

  // The furnace mouth: an emissive slit that glows orange on the block's south face.
  const mouth = new THREE.Mesh(
    new THREE.BoxGeometry(3.4, 1.5, 0.2),
    new THREE.MeshBasicMaterial({ color: 0xff8a2a }),
  );
  mouth.position.set(-18.6, 1.1, -10.3);
  group.add(mouth);

  // A low sun disc on the north-west horizon, above the wall.
  const sun = new THREE.Mesh(
    new THREE.CircleGeometry(3.2, 32),
    new THREE.MeshBasicMaterial({ color: 0xffb35c, fog: false }),
  );
  sun.position.set(-26, 7.5, -34);
  sun.lookAt(0, 4, 0);
  scene.add(sun);

  // Light: warm dusk key from the west, cool fill from the east, furnace point light.
  scene.add(new THREE.HemisphereLight(new THREE.Color(0x9a8a76), new THREE.Color(PALETTE.ground), 1.35));
  const key = new THREE.DirectionalLight(0xffc08a, 2.6);
  key.position.set(-14, 18, 8);
  key.target.position.set(4, 0, -6);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -26;
  key.shadow.camera.right = 26;
  key.shadow.camera.top = 26;
  key.shadow.camera.bottom = -26;
  key.shadow.camera.far = 60;
  key.shadow.bias = -0.0006;
  scene.add(key, key.target);
  const fill = new THREE.DirectionalLight(0x6a86b8, 0.7);
  fill.position.set(12, 10, 12);
  scene.add(fill);
  const furnaceLight = new THREE.PointLight(0xff7a1a, 26, 18, 1.6);
  furnaceLight.position.set(-16.5, 2.2, -11);
  scene.add(furnaceLight);
  const siteBLight = new THREE.PointLight(0x9fc4e8, 8, 14, 1.8);
  siteBLight.position.set(14, 3.4, -11);
  scene.add(siteBLight);

  // Nav graph: node name -> {x, z, links[]}.
  const nav = {};
  for (const [name, [x, z]] of Object.entries(NODES)) nav[name] = { x, z, links: [] };
  for (const [a, b] of EDGES) {
    nav[a].links.push(b);
    nav[b].links.push(a);
  }

  return {
    colliders,
    shootables,
    group,
    nav,
    furnaceLight,
    sites: {
      A: { x: -14.5, z: -11, r: 4.6, node: 'aSite' },
      B: { x: 14.5, z: -11, r: 4.6, node: 'bSite' },
    },
    spawns: {
      ember: [{ x: -3, z: 15.5 }, { x: 0, z: 16.5 }, { x: 3, z: 15.5 }, { x: -6, z: 14 }],
      sable: [{ x: -3, z: -15.5 }, { x: 0, z: -16.5 }, { x: 3, z: -15.5 }, { x: 6, z: -14 }],
    },
  };
}

// Breadth-first shortest path over the nav graph. Returns node names from start to goal.
export function findPath(nav, start, goal) {
  if (start === goal) return [start];
  const prev = { [start]: null };
  const queue = [start];
  while (queue.length) {
    const cur = queue.shift();
    for (const next of nav[cur].links) {
      if (!(next in prev)) {
        prev[next] = cur;
        if (next === goal) {
          const path = [goal];
          let n = goal;
          while (prev[n] !== null) {
            n = prev[n];
            path.unshift(n);
          }
          return path;
        }
        queue.push(next);
      }
    }
  }
  return [start];
}

export function nearestNode(nav, x, z) {
  let best = null;
  let bestD = Infinity;
  for (const [name, node] of Object.entries(nav)) {
    const d = (node.x - x) ** 2 + (node.z - z) ** 2;
    if (d < bestD) {
      bestD = d;
      best = name;
    }
  }
  return best;
}
