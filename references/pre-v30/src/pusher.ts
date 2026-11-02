export interface PusherCoin {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  level: 0 | 1;
  fall: number;
  z?: number;
  vz?: number;
  support?: number | null;
  tilt?: number;
  spin?: number;
  chute?: number;
}

export interface PusherScene {
  coins: PusherCoin[];
  nextId: number;
  tick: number;
  drops: number;
  fallen: number;
}

const RADIUS = 4.7;
const DIAMETER = RADIUS * 2;
const THICKNESS = 1.8;
const LOWER_BACK = 49.2;
const FRONT = 96;
const GRAVITY = 125;

// shortcut: supported disks model height and toppling; use rigid bodies if free 3D rotation becomes gameplay.
export function pusherPosition(tick: number): number {
  return 13.5 - 6.5 * Math.cos(tick * Math.PI * 2 / 3.2);
}

export function createPusherScene(seed = 1): PusherScene {
  let randomState = seed >>> 0;
  const random = () => {
    randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0;
    return randomState / 4294967296;
  };
  const scene: PusherScene = { coins: [], nextId: 1, tick: 0, drops: 0, fallen: 0 };
  const upperTowers = [1 + Math.floor(random() * 2), 5 + Math.floor(random() * 2)];
  const frontTowers = [Math.floor(random() * 3), 3 + Math.floor(random() * 3), 6 + Math.floor(random() * 3)];
  for (const level of [1, 0] as const) {
    for (let row = 0; row < (level ? 3 : 5); row++) {
      const count = row % 2 ? 8 : 9;
      for (let column = 0; column < count; column++) {
        const tower = level ? (row === 1 && upperTowers.includes(column) ? 5 + Math.floor(random() * 3) : 1)
          : row === 4 && frontTowers.includes(column) ? 6 + Math.floor(random() * 3) : 1;
        let support: number | null = null;
        const x = (row % 2 ? 14.1 : 9) + column * 10.25 + (random() - .5) * 2.2;
        const y = (level ? 29.8 : 62.4) + row * 8.2 + (random() - .5) * .7;
        for (let height = 0; height < tower; height++) {
          const coin: PusherCoin = {
            id: scene.nextId++, x: x + (random() - .5) * .65, y: y + (random() - .5) * .65,
            vx: 0, vy: 0, level, fall: 0, z: height * THICKNESS, vz: 0,
            support, tilt: (random() - .5) * 24, spin: 0, chute: 0,
          };
          scene.coins.push(coin);
          support = coin.id;
        }
      }
    }
  }
  // Spread four upper coins into loose overlapping pairs without leaving holes in the pushing bed.
  for (let i = 0; i < 4; i++) {
    const looseBases = scene.coins.filter(coin => !coin.z && coin.y < 88 && !scene.coins.some(other => (other.z ?? 0) >= THICKNESS && Math.hypot(other.x - coin.x, other.y - coin.y) < 14));
    const base = looseBases[Math.floor(random() * looseBases.length)];
    if (!base) break;
    scene.coins.push({ id: scene.nextId++, x: base.x + (random() - .5) * 4.5, y: base.y + (random() - .5) * 2.5,
      vx: 0, vy: 0, level: base.level, fall: 0, z: THICKNESS, vz: 0, support: base.id,
      tilt: (random() - .5) * 28, spin: 0, chute: 0 });
  }
  return scene;
}

/** Mutates the scene. Optional height fields keep previously paid games readable. */
export function dropPusherCoin(scene: PusherScene, x: number): PusherScene {
  if (!Number.isFinite(x)) throw new Error('请选择有效的投币位置。');
  if (scene.coins.length >= 120) return scene;
  scene.coins.push({
    id: scene.nextId++, x: Math.max(7, Math.min(93, x)),
    y: pusherPosition(scene.tick) + RADIUS + 4.5,
    vx: 0, vy: 14, level: 1, fall: 0, z: Math.max(27, ...scene.coins.filter(coin => coin.level === 1 && coin.support != null).map(coin => (coin.z ?? 0) + 16)), vz: -3,
    support: null, tilt: -15, spin: 45, chute: 0,
  });
  scene.drops++;
  return scene;
}

export function isPusherSettled(scene: PusherScene): boolean {
  return scene.coins.every(coin => !coin.chute && !coin.fall && (!(coin.z ?? 0) || coin.support != null)
    && Math.abs(coin.vx) + Math.abs(coin.vy) < 1.2);
}

function constrain(coin: PusherCoin, wall: number, wallSpeed: number): void {
  if (coin.x < 7) { coin.x = 7; coin.vx = Math.max(0, coin.vx); }
  if (coin.x > 93) { coin.x = 93; coin.vx = Math.min(0, coin.vx); }
  const back = coin.level ? wall + RADIUS : LOWER_BACK;
  if (coin.y < back) {
    coin.y = back;
    coin.vy = Math.max(coin.vy, coin.level ? Math.max(0, wallSpeed) : 0);
  }
}

/** Bounded substeps transfer plate pressure, support friction and landing momentum. */
export function stepPusher(scene: PusherScene, dt: number): PusherScene {
  if (!Number.isFinite(dt) || dt <= 0) return scene;
  const elapsed = Math.min(dt, 0.1);
  const steps = Math.ceil(elapsed * 120);
  const h = elapsed / steps;
  for (const coin of scene.coins) {
    coin.z ??= 0; coin.vz ??= 0; coin.support ??= null;
    coin.tilt ??= 0; coin.spin ??= 0; coin.chute ??= 0;
  }
  for (let step = 0; step < steps; step++) {
    const previousWall = pusherPosition(scene.tick);
    scene.tick += h;
    const wall = pusherPosition(scene.tick);
    const wallSpeed = (wall - previousWall) / h;
    const positions = new Map(scene.coins.map(coin => [coin.id, { x: coin.x, y: coin.y, z: coin.z! }]));
    const byId = new Map(scene.coins.map(coin => [coin.id, coin]));
    for (const coin of scene.coins) {
      if (coin.chute) {
        coin.chute += h;
        coin.vz! -= GRAVITY * h;
        coin.z! += coin.vz! * h;
        coin.y = Math.min(111, coin.y + Math.max(8, coin.vy) * h);
        coin.x = Math.max(7, Math.min(93, coin.x + coin.vx * h));
        coin.tilt! += coin.spin! * h;
        continue;
      }
      if (coin.fall > 0) { coin.fall = Math.max(0, coin.fall - h); continue; }
      const support = coin.support == null ? undefined : byId.get(coin.support);
      if (support && !support.chute && support.level === coin.level && Math.hypot(coin.x - support.x, coin.y - support.y) < RADIUS * .8) {
        const previous = positions.get(support.id)!;
        const follow = .88 - Math.min(.2, coin.z! * .012);
        coin.x += (support.x - previous.x) * follow;
        coin.y += (support.y - previous.y) * follow;
        coin.z = support.z! + THICKNESS;
        coin.vx += (support.vx - coin.vx) * 7 * h;
        coin.vy += (support.vy - coin.vy) * 7 * h;
        coin.vz = 0;
        coin.tilt = Math.max(-35, Math.min(35, (coin.x - support.x) * 8 + (support.y - coin.y) * 5));
      } else {
        if (coin.support != null) {
          coin.vx += (coin.x - (support?.x ?? coin.x)) * 3;
          coin.vy += Math.max(3, (support?.vy ?? 0) * .6);
          coin.spin = ((coin.id % 2) * 2 - 1) * (75 + coin.z! * 4);
        }
        coin.support = null;
        coin.vz! -= GRAVITY * h;
        const oldZ = coin.z!;
        coin.z! += coin.vz! * h;
        let landing: PusherCoin | undefined;
        let landingZ = 0;
        for (const candidate of scene.coins) {
          if (candidate === coin || candidate.chute || candidate.fall > 0 || candidate.level !== coin.level) continue;
          const top = candidate.z! + THICKNESS;
          if (top > landingZ && oldZ >= top - .05 && coin.z! <= top && Math.hypot(coin.x - candidate.x, coin.y - candidate.y) < RADIUS * .8) {
            landing = candidate; landingZ = top;
          }
        }
        if (coin.z! <= landingZ) {
          coin.z = landingZ; coin.vz = 0; coin.spin = 0;
          coin.support = landing?.id ?? null;
          if (landing) {
            // The arriving coin shares its forward momentum down the connected stack.
            const impact = Math.max(0, coin.vy) * .85;
            let below: PusherCoin | undefined = landing;
            const visited = new Set<number>();
            while (below && !visited.has(below.id)) {
              visited.add(below.id); below.vy += impact;
              below = below.support == null ? undefined : byId.get(below.support);
            }
            coin.vy *= .3;
          }
          coin.tilt! *= .7;
        } else coin.tilt! += coin.spin! * h;
      }
      const airborne = coin.z! > 0 && coin.support == null;
      const friction = Math.exp(-(airborne ? .5 : 5) * h);
      coin.vx = Math.max(-45, Math.min(45, coin.vx)) * friction;
      coin.vy = Math.max(-45, Math.min(45, coin.vy)) * friction;
      coin.x += coin.vx * h;
      coin.y += coin.vy * h;
      constrain(coin, wall, wallSpeed);
    }
    for (let pass = 0; pass < 3; pass++) {
      for (let a = 0; a < scene.coins.length; a++) {
        const first = scene.coins[a];
        if (first.fall > 0 || first.chute) continue;
        for (let b = a + 1; b < scene.coins.length; b++) {
          const second = scene.coins[b];
          if (second.level !== first.level || second.fall > 0 || second.chute || Math.abs(first.z! - second.z!) >= THICKNESS * .8) continue;
          let dx = second.x - first.x, dy = second.y - first.y;
          const squared = dx * dx + dy * dy;
          if (squared >= DIAMETER * DIAMETER) continue;
          const distance = Math.sqrt(squared);
          if (distance < .00001) { dx = 0; dy = 1; }
          else { dx /= distance; dy /= distance; }
          const overlap = (DIAMETER - distance) * .5;
          first.x -= dx * overlap; first.y -= dy * overlap;
          second.x += dx * overlap; second.y += dy * overlap;
          const approach = (second.vx - first.vx) * dx + (second.vy - first.vy) * dy;
          if (approach < 0) {
            const impulse = -approach * .5;
            first.vx -= dx * impulse; first.vy -= dy * impulse;
            second.vx += dx * impulse; second.vy += dy * impulse;
          }
        }
      }
      for (const coin of scene.coins) if (!coin.fall && !coin.chute) constrain(coin, wall, wallSpeed);
    }
    // A moving base carries its tower until the overhang loses support, then the coins tumble separately.
    for (const coin of scene.coins) {
      if (coin.chute || coin.fall) continue;
      if (coin.level === 1 && coin.y > 47) {
        coin.level = 0; coin.y = LOWER_BACK; coin.z! += 10;
        coin.vy = Math.max(24, coin.vy); coin.support = null;
        coin.spin = (coin.id % 2 ? 1 : -1) * 90;
      } else if (coin.level === 0 && coin.y > FRONT) {
        coin.chute = .0001; coin.support = null;
        coin.vy = Math.max(11, coin.vy); coin.vz = Math.min(-8, coin.vz!);
        coin.spin = (coin.id % 2 ? 1 : -1) * 240;
      }
      const support = coin.support == null ? undefined : byId.get(coin.support);
      if (support?.chute) {
        coin.chute = .0001; coin.support = null; coin.y = Math.max(FRONT + .1, coin.y);
        coin.vy = Math.max(9, support.vy); coin.vz = -3;
        coin.spin = (coin.id % 2 ? 1 : -1) * 210;
      }
    }
    for (let index = scene.coins.length - 1; index >= 0; index--) {
      const coin = scene.coins[index];
      if (coin.chute && coin.z! < -17) {
        scene.coins.splice(index, 1);
        scene.fallen++;
      }
    }
  }
  return scene;
}
