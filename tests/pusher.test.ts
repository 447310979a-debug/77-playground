import test from 'node:test';
import assert from 'node:assert/strict';
import { createPusherScene, dropPusherCoin, isPusherSettled, pusherPosition, stepPusher } from '../src/pusher.ts';

function run(scene: ReturnType<typeof createPusherScene>, seconds: number): void {
  for (let frame = 0; frame < seconds * 30; frame++) stepPusher(scene, 1 / 30);
}

test('seeded pile is dense, stable without drops, and its pusher moves continuously', () => {
  const scene = createPusherScene(7);
  assert.deepEqual(scene, createPusherScene(7));
  assert.notDeepEqual(scene, createPusherScene(8));
  assert.ok(scene.coins.length >= 95 && scene.coins.length <= 110);
  assert.equal(pusherPosition(0), 7);
  assert.equal(pusherPosition(1.6), 20);
  run(scene, 20);
  assert.equal(scene.fallen, 0);
  assert.equal(scene.drops, 0);
});

test('aim and pusher timing affect the pile instead of selecting a canned outcome', () => {
  const left = createPusherScene(), right = createPusherScene(), delayed = createPusherScene();
  dropPusherCoin(left, 20);
  dropPusherCoin(right, 80);
  run(delayed, 1.6);
  dropPusherCoin(delayed, 20);
  run(left, 4); run(right, 4); run(delayed, 2.4);
  const originalCoins = (scene: typeof left) => scene.coins.filter(coin => coin.id < 70);
  assert.notDeepEqual(originalCoins(left), originalCoins(right));
  assert.notDeepEqual(originalCoins(left), originalCoins(delayed));
  assert.equal(left.drops, 1);
});

test('a physical contact transfers momentum to the coin at the front edge', () => {
  const scene = createPusherScene();
  scene.coins = [
    { id: 1, x: 50, y: 86.4, vx: 0, vy: 20, level: 0, fall: 0 },
    { id: 2, x: 50, y: 95.8, vx: 0, vy: 0, level: 0, fall: 0 },
  ];
  run(scene, 0.2);
  assert.equal(scene.fallen, 0, 'crossing the lip starts an animation, not a score');
  assert.ok(scene.coins.some(coin => coin.chute));
  run(scene, 1);
  assert.equal(scene.fallen, 1);
  assert.equal(scene.coins[0].id, 1);
  assert.equal(scene.drops, 0);
});

test('drops transfer pressure across both shelves, conserve coins, and can spill over the front', () => {
  const scene = createPusherScene(17);
  const initial = scene.coins.length;
  for (let drop = 0; drop < 35; drop++) {
    dropPusherCoin(scene, 15 + (drop * 17) % 70);
    run(scene, 1.6);
    assert.equal(scene.coins.length + scene.fallen, initial + scene.drops);
    assert.equal(new Set(scene.coins.map(coin => coin.id)).size, scene.coins.length);
    for (const coin of scene.coins) {
      assert.ok([coin.x, coin.y, coin.vx, coin.vy, coin.fall, coin.z, coin.vz, coin.tilt, coin.spin, coin.chute].every(Number.isFinite));
      assert.ok(coin.x >= 7 && coin.x <= 93);
      assert.ok(coin.y >= 7 && coin.y <= 111);
    }
  }
  assert.ok(scene.fallen > 0, 'player drops must be able to push a real coin over the front');
});

test('unsafe time and input cannot launch coins through walls or overflow the active pile', () => {
  const scene = createPusherScene();
  const before = structuredClone(scene);
  for (const dt of [NaN, Infinity, -1, 0]) stepPusher(scene, dt);
  assert.deepEqual(scene, before);
  stepPusher(scene, 10000);
  assert.ok(scene.tick <= 0.10001);
  assert.throws(() => dropPusherCoin(scene, NaN));
  for (let n = 0; n < 200; n++) dropPusherCoin(scene, n % 2 ? -100 : 200);
  assert.equal(scene.coins.length, 120);
  assert.equal(scene.drops, 120 - before.coins.length);
  run(scene, 8);
  assert.equal(scene.coins.length + scene.fallen, 120);
  assert.ok(scene.coins.every(coin => coin.x >= 7 && coin.x <= 93 && Number.isFinite(coin.y)));
});


test('seeded heights are real linked supports, and an arriving coin lands on top', () => {
  const scene = createPusherScene(7);
  assert.ok(scene.coins.filter(coin => coin.support != null).length >= 30);
  assert.ok(Math.max(...scene.coins.map(coin => coin.z ?? 0)) >= 10);
  for (const coin of scene.coins) {
    if (coin.support == null) continue;
    const below = scene.coins.find(other => other.id === coin.support)!;
    assert.ok(Math.abs(coin.z! - below.z! - 1.8) < .00001);
  }
  scene.tick = 1.6;
  scene.coins = Array.from({ length: 5 }, (_, index) => ({
    id: index + 1, x: 50, y: 32, z: index * 1.8,
    vx: 0, vy: 0, vz: 0, fall: 0, level: 1 as const, support: index ? index : null,
  }));
  scene.nextId = 6;
  dropPusherCoin(scene, 50);
  let landedOnStack = false;
  for (let frame = 0; frame < 60; frame++) {
    stepPusher(scene, 1 / 60);
    const arriving = scene.coins.find(coin => coin.id === 6);
    if (arriving?.support && arriving.z! >= 8.9) landedOnStack = true;
  }
  assert.ok(landedOnStack, 'the new coin must contact the actual top of the existing tower');
});

test('a pushed tower tumbles as many individual chute coins before score and settlement', () => {
  const scene = createPusherScene();
  scene.coins = Array.from({ length: 9 }, (_, index) => ({
    id: index + 1, x: 50, y: 95.8, z: index * 1.8,
    vx: 0, vy: index ? 0 : 20, vz: 0, fall: 0, level: 0 as const, support: index ? index : null,
  }));
  scene.nextId = 10;
  run(scene, .1);
  assert.ok(scene.coins.filter(coin => coin.chute).length >= 6);
  assert.equal(scene.fallen, 0);
  assert.equal(isPusherSettled(scene), false);
  run(scene, 2);
  assert.equal(scene.fallen, 9);
  assert.equal(scene.coins.length, 0);
  assert.equal(isPusherSettled(scene), true);
});

test('normal mixed aiming produces a multi-coin cascade before the active pile can fill', () => {
  for (const seed of [1, 7, 17, 77]) {
    const scene = createPusherScene(seed);
    let peakFlight = 0;
    for (let drop = 0; drop < 12 && scene.fallen < 8; drop++) {
      dropPusherCoin(scene, 15 + drop * 17 % 70);
      for (let frame = 0; frame < 96; frame++) {
        stepPusher(scene, 1 / 30);
        peakFlight = Math.max(peakFlight, scene.coins.filter(coin => coin.chute).length);
      }
    }
    assert.ok(scene.fallen >= 8, `seed ${seed} must remain playable`);
    assert.ok(peakFlight >= 5, `seed ${seed} must cascade several physical coins together`);
  }
});

test('legacy flat coins gain height defaults without resetting paid progress or existing coins', () => {
  const scene = createPusherScene();
  scene.coins = [{ id: 1, x: 50, y: 75, vx: 0, vy: 0, level: 0, fall: 0 }];
  scene.nextId = 2; scene.fallen = 3; scene.drops = 4; scene.tick = 2;
  stepPusher(scene, 1 / 30);
  assert.equal(scene.fallen, 3);
  assert.equal(scene.drops, 4);
  assert.equal(scene.nextId, 2);
  assert.equal(scene.coins[0].z, 0);
  assert.equal(scene.coins[0].support, null);
  assert.ok(scene.tick > 2);
});


test('aiming at the randomized upper towers still lands a new coin on their tops', () => {
  const initial = createPusherScene(77);
  run(initial, 1.6);
  const towers = initial.coins.filter(coin => coin.level === 1 && (coin.z ?? 0) >= 7.2 && !initial.coins.some(other => other.support === coin.id));
  assert.equal(towers.length, 2);
  for (const tower of towers) {
    const scene = structuredClone(initial);
    const nextId = scene.nextId;
    dropPusherCoin(scene, tower.x);
    let landed = false;
    for (let frame = 0; frame < 90; frame++) {
      stepPusher(scene, 1 / 60);
      const arriving = scene.coins.find(coin => coin.id === nextId);
      if (arriving?.support && arriving.z! >= tower.z! + 1.7) landed = true;
    }
    assert.ok(landed, 'the new coin must land on a real randomized tower');
  }
});

test('tower positions and heights vary with seed while an untouched board stays stable', () => {
  const shapes = new Set<string>();
  for (const seed of [1, 2, 3, 7, 17, 42, 77, 101]) {
    const scene = createPusherScene(seed);
    shapes.add(JSON.stringify(scene.coins.filter(c => c.support != null).map(c => [Math.round(c.x), c.z])));
    run(scene, 10);
    assert.equal(scene.fallen, 0, `untouched board ${seed} must not award coins`);
  }
  assert.equal(shapes.size, 8);
});
