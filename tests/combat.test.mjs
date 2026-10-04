import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";

const source = readFileSync(new URL("../game.js", import.meta.url), "utf8");

function game() {
  const elements = new Map();
  const drawing = [];
  const captures = new Set();
  const timers = new Map();
  let nextTimer = 0;
  const context = new Proxy({}, {
    get(target, key) {
      if (key in target) return target[key];
      return (...args) => { drawing.push({ method: key, args }); return { addColorStop() {} }; };
    }
  });
  const element = (selector) => {
    if (!elements.has(selector)) {
      const classes = new Set(selector.endsWith("Modal") ? ["is-hidden"] : []);
      const listeners = new Map();
      const node = {
        style: {}, dataset: {}, textContent: "", inert: false, width: 960, height: 540,
        rect: { left: 20, top: 30, width: 960, height: 540 },
        classList: {
          add: (name) => classes.add(name), remove: (name) => classes.delete(name),
          contains: (name) => classes.has(name),
          toggle: (name, active) => active ? classes.add(name) : classes.delete(name)
        },
        getContext: () => context, getBoundingClientRect() { return this.rect; },
        querySelector: (child) => element(`${selector} ${child}`), querySelectorAll: () => [],
        addEventListener: (event, handler) => {
          if (!listeners.has(event)) listeners.set(event, []);
          listeners.get(event).push(handler);
        },
        dispatch(event, data = {}) {
          listeners.get(event)?.forEach((handler) => handler({ target: node, preventDefault() {}, ...data }));
        },
        hasPointerCapture: (id) => captures.has(id),
        setPointerCapture: (id) => captures.add(id), releasePointerCapture: (id) => captures.delete(id),
        setAttribute() {}, focus() {}
      };
      elements.set(selector, node);
    }
    return elements.get(selector);
  };
  const sandbox = {
    document: {
      querySelector: element,
      querySelectorAll: (selector) => selector === ".spell-slot" ? [0, 1, 2].map((id) => element(`slot${id}`)) : [],
      body: element("body"), addEventListener() {}
    },
    window: element("window"), matchMedia: () => ({ matches: false }),
    performance: { now: () => 0 }, localStorage: { getItem: () => null, setItem() {} },
    setTimeout: (callback, delay) => { const id = ++nextTimer; timers.set(id, { callback, delay }); return id; },
    clearTimeout: (id) => timers.delete(id), requestAnimationFrame() {},
    HTMLButtonElement: class {}, HTMLInputElement: class {}, HTMLSelectElement: class {}
  };
  // Instrument only the test copy of this closure; production has no exposed state.
  const instrumented = source.replace("  initialize();", `bindEvents(); globalThis.game = {
    state, input, world, get player() { return player; }, requestAttack, castSpell,
    startCharge, releaseCharge, cancelCharge, clearInput, updatePlayer, updateProjectiles,
    updateHazards, createEnemy, createBoss, generateFloor, requestDash, openPause, resumeGame,
    drawPlayer, drawCrosshair, render, resizeCanvas, aimVector, aimTarget, slashHitsEnemy,
    detonateNova, BOSS_CATALOG, chooseEnemyType, sprites, SPRITE_FILES, opaqueBounds,
    drawObstacles, drawStairs, drawEnemy, drawProjectiles, stairBounds, stairClearance,
    collidesWithObstacle, circleIntersectsRect, findClearPoint, applyBuff, expireChamberBuff,
    showBuffChoices, BUFF_CATALOG, damagePlayer, descendFloor, scaleWorld, updateEnemies,
    updateBoss, beginEnemyAttack, resolveEnemyAttack, updateEnemyCharge, updatePickups,
    killEnemy, drawHazards, spawnProjectile
  };`);
  vm.runInNewContext(instrumented, sandbox);
  const api = sandbox.game;
  api.state.scene = "playing";
  api.state.screenShake = false;
  api.player.x = 480;
  api.player.y = 270;
  api.canvas = element("#gameCanvas");
  api.mobileAttack = element("#mobileAttack");
  api.window = sandbox.window;
  api.drawing = drawing;
  api.context = context;
  api.element = element;
  api.finishDescent = () => {
    const [id, timer] = [...timers].find(([, item]) => item.delay === 1750);
    timers.delete(id);
    timer.callback();
  };
  api.chooseBuff = (id) => {
    api.state.scene = "buff";
    api.state.buffChoices = [id];
    api.applyBuff(id);
  };
  api.aim = (x, y) => Object.assign(api.input, { mouseX: x, mouseY: y, hasMouseAim: true, pointerInside: true });
  api.pointer = (event, x = 680, y = 270, button = 0, id = 7) => api.canvas.dispatch(event, {
    pointerType: "mouse", pointerId: id, button, clientX: x + 20, clientY: y + 30
  });
  return api;
}

function close(actual, expected) { assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`); }

test("slashes hit and render toward cursor in all eight directions, independent of facing", () => {
  for (let direction = 0; direction < 8; direction++) {
    const api = game();
    const angle = direction * Math.PI / 4;
    api.player.lookDirection = -1;
    api.player.facingX = 0;
    api.player.facingY = -1;
    api.aim(480 + Math.cos(angle) * 200, 270 + Math.sin(angle) * 200);
    const ahead = api.createEnemy("skeleton", 480 + Math.cos(angle) * 50, 270 + Math.sin(angle) * 50, 0);
    const behind = api.createEnemy("skeleton", 480 - Math.cos(angle) * 50, 270 - Math.sin(angle) * 50, 0);
    api.world.enemies = [ahead, behind];
    api.requestAttack();
    assert.equal(ahead.hp, ahead.maxHp - 24);
    assert.equal(behind.hp, behind.maxHp);
    close(Math.cos(api.player.slash.angle), Math.cos(angle));
    close(Math.sin(api.player.slash.angle), Math.sin(angle));
    // Movement and subsequent aim must not alter the damage that already happened.
    api.input.keys.add("KeyA");
    api.updatePlayer(1 / 60);
    api.aim(480 - Math.cos(angle) * 200, 270 - Math.sin(angle) * 200);
    api.drawPlayer(0);
    close(api.drawing.find((call) => call.method === "rotate").args[0], api.player.slash.angle);
    const origin = api.drawing.find((call) => call.method === "translate").args;
    assert.deepEqual(origin, [480, 270]);
    const boundary = api.drawing.find((call) => call.method === "arc").args;
    assert.deepEqual(boundary, [0, 0, 52.5, -api.player.slash.halfAngle, api.player.slash.halfAngle]);
  }
});

test("the curved footprint accounts for enemy size at reach and angular edges", () => {
  const api = game();
  api.aim(680, 270);
  api.requestAttack();
  const slash = api.player.slash;
  assert.equal(api.slashHitsEnemy(slash, { x: 537.5, y: 270, radius: 5 }), true);
  assert.equal(api.slashHitsEnemy(slash, { x: 538.5, y: 270, radius: 5 }), false);
  assert.equal(api.slashHitsEnemy(slash, { x: 430, y: 270, radius: 10 }), false);
  const angle = slash.halfAngle + 0.04;
  assert.equal(api.slashHitsEnemy(slash, { x: 480 + Math.cos(angle) * 50, y: 270 + Math.sin(angle) * 50, radius: 3 }), true);
  assert.equal(api.slashHitsEnemy(slash, { x: 480 + Math.cos(angle) * 50, y: 270 + Math.sin(angle) * 50, radius: 1 }), false);
});

test("Long Blade increases damage reach and visual reach together", () => {
  const api = game();
  api.state.buffs.long_blade = 1;
  api.aim(680, 270);
  const enemy = api.createEnemy("skeleton", 590, 270, 0);
  api.world.enemies = [enemy];
  api.requestAttack();
  assert.equal(enemy.hp, enemy.maxHp - 24);
  assert.equal(api.player.slash.reach, 105);
  api.drawPlayer(0);
  assert.equal(api.drawing.find((call) => call.method === "arc").args[2], 105);
});

test("screen shake and CSS canvas scaling preserve cursor aim", () => {
  const api = game();
  api.canvas.rect = { left: 20, top: 30, width: 480, height: 270 };
  api.state.shakeX = 10;
  api.state.shakeY = -6;
  api.pointer("pointerdown", 340, 132);
  close(api.input.mouseX, 680);
  close(api.input.mouseY, 264);
  close(api.aimVector().x, 1);
  close(api.aimVector().y, 0);
  api.pointer("pointerup", 340, 132);
  close(api.player.slash.angle, 0);
});

test("quick left-click slashes once on release; holding does not fire automatically", () => {
  const api = game();
  api.pointer("pointerdown");
  assert.equal(api.player.attackAnim, 0);
  api.updatePlayer(0.1);
  api.pointer("pointerup");
  assert.ok(api.player.attackAnim > 0);
  assert.equal(api.world.projectiles.length, 0);
  const slash = api.player.slash;
  api.pointer("pointerup");
  assert.equal(api.player.slash, slash);
  api.updatePlayer(0.5);
  api.pointer("pointerdown");
  api.updatePlayer(2);
  assert.equal(api.world.projectiles.length, 0);
  assert.equal(api.player.chargeTime, 0.9);
});

test("partial/full charged shots scale damage and aim at the release position", () => {
  const damage = [];
  for (const duration of [0.3, 1.2]) {
    const api = game();
    api.pointer("pointerdown");
    api.updatePlayer(duration);
    api.pointer("pointerup", 480, 470);
    assert.equal(api.world.projectiles.length, 1);
    const shot = api.world.projectiles[0];
    assert.equal(shot.type, "charged");
    close(shot.vx, 0);
    assert.ok(shot.vy > 0);
    assert.equal(api.player.attackAnim, 0);
    assert.equal(api.player.chargeTime, 0);
    assert.equal(api.input.attackPointer, null);
    damage.push(shot.damage);
  }
  assert.ok(damage[0] < damage[1]);
  assert.equal(damage[1], 48);
});

test("the crosshair narrows and displays READY only at full charge", () => {
  const api = game();
  api.pointer("pointerdown");
  api.drawCrosshair();
  const initialRadius = api.drawing.find((call) => call.method === "arc").args[2];
  api.drawing.length = 0;
  api.updatePlayer(0.5);
  api.drawCrosshair();
  assert.ok(api.drawing.find((call) => call.method === "arc").args[2] < initialRadius);
  assert.equal(api.drawing.some((call) => call.method === "fillText" && call.args[0] === "READY"), false);
  api.drawing.length = 0;
  api.updatePlayer(0.5);
  api.drawCrosshair();
  assert.ok(api.drawing.some((call) => call.method === "fillText" && call.args[0] === "READY"));
  assert.equal(api.context.shadowColor, "#ffc966");
  api.pointer("pointerup");
  api.drawing.length = 0;
  api.drawCrosshair();
  assert.equal(api.drawing.some((call) => call.method === "fillText"), false);
});

test("guard, pause, blur, pointer cancellation, and leaving the arena cancel charge", () => {
  for (const cancel of [
    (api) => api.window.dispatch("keydown", { code: "KeyE" }),
    (api) => api.openPause(),
    (api) => api.window.dispatch("blur"),
    (api) => api.canvas.dispatch("pointercancel", { pointerId: 7 }),
    (api) => api.canvas.dispatch("lostpointercapture", { pointerId: 7 }),
    (api) => api.pointer("pointerup", 1100, 270),
    (api) => api.generateFloor(1)
  ]) {
    const api = game();
    api.pointer("pointerdown");
    api.updatePlayer(1);
    cancel(api);
    api.pointer("pointerup");
    assert.equal(api.input.attackPointer, null);
    assert.equal(api.player.chargeTime, 0);
    assert.equal(api.world.projectiles.length, 0);
    assert.equal(api.player.attackAnim, 0);
  }
});

test("E guards immediately against attacks; right-click casts instead of guarding", () => {
  const api = game();
  api.window.dispatch("keydown", { code: "KeyE" });
  api.pointer("pointerdown");
  assert.equal(api.input.attackPointer, null);
  api.pointer("pointerdown", 680, 270, 2);
  assert.equal(api.world.projectiles.length, 0);
  api.updatePlayer(1 / 60);
  assert.equal(api.player.blocking, true);
  api.window.dispatch("keyup", { code: "KeyE" });
  api.updatePlayer(1 / 60);
  api.pointer("pointerdown", 680, 270, 2);
  assert.equal(api.player.blocking, false);
  assert.equal(api.world.projectiles.length, 1);
  assert.equal(api.world.projectiles[0].type, "ember");
  api.pointer("pointerup", 680, 270, 2);
  assert.equal(api.player.attackAnim, 0);
});

test("Space and mobile strike still slash; mobile aim follows movement", () => {
  const api = game();
  api.aim(680, 270);
  api.window.dispatch("keydown", { code: "Space", repeat: false });
  assert.ok(api.player.attackAnim > 0);
  close(api.player.slash.angle, 0);
  api.updatePlayer(0.5);
  api.state.controlMode = "mobile";
  api.player.facingX = 0;
  api.player.facingY = -1;
  api.canvas.dispatch("pointerdown", { pointerType: "touch", button: 0, pointerId: 1 });
  assert.equal(api.input.attackPointer, null);
  // Invoke the same bound control as a touchscreen, independent of stale mouse aim.
  api.mobileAttack.dispatch("pointerdown");
  close(api.player.slash.angle, -Math.PI / 2);
  api.drawCrosshair();
  assert.equal(api.drawing.length, 0);
});

test("Ember, Frost, and Nova travel toward the cursor for any movement-facing", () => {
  for (let spell = 0; spell < 3; spell++) {
    for (let direction = 0; direction < 8; direction++) {
      const api = game();
      const angle = direction * Math.PI / 4;
      api.player.facingX = -Math.cos(angle);
      api.player.facingY = -Math.sin(angle);
      api.aim(480 + Math.cos(angle) * 200, 270 + Math.sin(angle) * 200);
      api.castSpell(spell);
      const shot = api.world.projectiles[0];
      assert.ok(shot?.friendly);
      close(Math.atan2(shot.vy, shot.vx), Math.atan2(Math.sin(angle), Math.cos(angle)));
    }
  }
});

test("Nova bursts at the cursor, keeps its range buff, and detonates once", () => {
  const api = game();
  api.state.buffs.nova_range = 1;
  api.aim(700, 270);
  const nearby = api.createEnemy("sentinel", 700, 370, 0);
  const atPlayer = api.createEnemy("sentinel", 480, 320, 0);
  api.world.enemies = [nearby, atPlayer];
  api.castSpell(2);
  const shot = api.world.projectiles[0];
  assert.equal(shot.blastRadius, 140);
  assert.equal(nearby.hp, nearby.maxHp);
  for (let frame = 0; frame < 60 && !shot.detonated; frame++) api.updateProjectiles(1 / 60);
  close(shot.x, 700);
  close(shot.y, 270);
  assert.equal(nearby.hp, nearby.maxHp - 38);
  assert.equal(atPlayer.hp, atPlayer.maxHp);
  assert.equal(api.world.hazards[0].type, "nova");
  api.detonateNova(shot);
  assert.equal(nearby.hp, nearby.maxHp - 38);
  api.updateHazards(1 / 60);
  assert.equal(api.player.hp, 100);
});

test("Nova detonates on walls and charged projectiles stop at walls", () => {
  for (const type of ["nova", "charged"]) {
    const api = game();
    api.aim(700, 270);
    api.world.obstacles = [{ x: 600, y: 230, w: 30, h: 80 }];
    if (type === "nova") api.castSpell(2);
    else { api.pointer("pointerdown"); api.updatePlayer(1); api.pointer("pointerup", 700, 270); }
    const shot = api.world.projectiles[0];
    for (let frame = 0; frame < 60 && shot.life > 0; frame++) api.updateProjectiles(1 / 60);
    assert.equal(shot.life, 0);
    assert.ok(shot.x < 630);
    assert.equal(Boolean(shot.detonated), type === "nova");
  }
});

test("charged projectile damage respects physical buffs and hits only its path", () => {
  const api = game();
  api.state.buffs.physical = 1;
  const ahead = api.createEnemy("sentinel", 650, 270, 0);
  const away = api.createEnemy("sentinel", 650, 350, 0);
  api.world.enemies = [ahead, away];
  api.pointer("pointerdown");
  api.updatePlayer(1);
  api.pointer("pointerup");
  assert.equal(api.world.projectiles[0].damage, 72);
  for (let frame = 0; frame < 30; frame++) api.updateProjectiles(1 / 60);
  assert.equal(ahead.hp, ahead.maxHp - 72);
  assert.equal(away.hp, away.maxHp);
});

test("updated enemy and boss pools remain intact", () => {
  const api = game();
  for (const type of ["slime", "skeleton", "wisp", "spitter", "charger", "cultist", "sentinel"]) assert.ok(api.createEnemy(type, 100, 100, 5).hp > 0);
  assert.deepEqual(Array.from(api.BOSS_CATALOG, (boss) => boss.id), ["bone", "cinder", "hollow", "veil", "plague", "storm"]);
  api.createBoss();
  assert.equal(api.world.boss.name, "THE MOSS GUARDIAN");
});

test("Long Blade doubles charged shot visuals and collision size without changing damage", () => {
  for (const duration of [0.3, 1]) {
    const radii = [];
    for (const buff of [false, true]) {
      const api = game();
      if (buff) api.chooseBuff("long_blade");
      const graze = api.createEnemy("sentinel", 650, 304, 0);
      api.world.enemies = [graze];
      api.pointer("pointerdown");
      api.updatePlayer(duration);
      api.pointer("pointerup");
      const shot = api.world.projectiles[0];
      radii.push(shot.radius);
      api.drawProjectiles();
      assert.equal(api.drawing.filter((call) => call.method === "fillRect")[1].args[2], shot.radius * 2);
      assert.equal(shot.damage, duration === 1 ? 48 : 27);
      for (let frame = 0; frame < 30; frame++) api.updateProjectiles(1 / 60);
      assert.equal(graze.hp < graze.maxHp, buff && duration === 1);
    }
    close(radii[1], radii[0] * 2);
  }
});

test("each blessing expires on descent before normal floor progression", () => {
  for (const buff of game().BUFF_CATALOG) {
    const api = game();
    api.state.floor = 1;
    api.player.hp = 60;
    api.chooseBuff(buff.id);
    assert.equal(api.state.buffs[buff.id], 1);
    api.world.floorCleared = true;
    api.descendFloor();
    assert.equal(Object.keys(api.state.buffs).length, 0);
    assert.equal(api.player.maxHp, 100);
    assert.equal(api.player.hp, 60);
    assert.ok(api.element("#chamberBuffCard").classList.contains("is-hidden"));
    api.finishDescent();
    assert.equal(api.state.floor, 2);
    assert.equal(api.player.maxHp, 103);
    assert.equal(api.player.hp, 80);
    assert.equal(api.state.scene, "buff");
    assert.equal(api.state.buffChoices.length, 3);
    assert.equal(new Set(api.state.buffChoices).size, 3);
  }
});

test("temporary health absorbs damage first and does not remove spent health twice", () => {
  const api = game();
  api.player.hp = 60;
  api.chooseBuff("max50");
  assert.equal(api.player.maxHp, 150);
  assert.equal(api.player.hp, 110);
  api.damagePlayer(30, null, true);
  assert.equal(api.player.chamberHealth, 20);
  assert.equal(api.player.hp, 80);
  api.expireChamberBuff();
  assert.equal(api.player.hp, 60);
  assert.equal(api.player.maxHp, 100);
  api.player.invulnerable = 0;
  api.chooseBuff("health20");
  api.damagePlayer(30, null, true);
  assert.equal(api.player.chamberHealth, 0);
  assert.equal(api.player.hp, 50);
  api.generateFloor(2);
  assert.equal(api.player.hp, 50);
  assert.equal(api.player.chamberMaxHp, 0);
});

test("buff selection permits exactly one offered blessing per chamber", () => {
  const api = game();
  api.showBuffChoices();
  const first = api.state.buffChoices[0];
  const unoffered = api.BUFF_CATALOG.find((buff) => !api.state.buffChoices.includes(buff.id)).id;
  api.applyBuff(unoffered);
  assert.equal(Object.keys(api.state.buffs).length, 0);
  assert.equal(api.state.scene, "buff");
  api.applyBuff(first);
  const hp = api.player.hp, maxHp = api.player.maxHp;
  api.applyBuff(first);
  api.applyBuff("max50");
  assert.deepEqual(Object.keys(api.state.buffs), [first]);
  assert.equal(api.player.hp, hp);
  assert.equal(api.player.maxHp, maxHp);
});

test("every player, enemy, boss, obstacle and background sprite exists", () => {
  const api = game();
  for (const [id, sprite] of Object.entries(api.sprites)) {
    const path = new URL(`../${sprite.file}`, import.meta.url);
    assert.ok(existsSync(path), `${id} missing: ${sprite.file}`);
    const png = readFileSync(path);
    assert.equal(png.subarray(1, 4).toString(), "PNG");
    assert.ok(png.readUInt32BE(16) > 0 && png.readUInt32BE(20) > 0);
  }
  assert.ok(existsSync(new URL("../sprites/og.png", import.meta.url)));
});

test("transparent sprite padding is excluded from the draw and collision footprint", () => {
  const api = game();
  const pixels = new Uint8ClampedArray(6 * 8 * 4);
  for (let y = 2; y <= 6; y++) for (let x = 1; x <= 4; x++) pixels[(y * 6 + x) * 4 + 3] = 255;
  pixels[3] = 12; // Low-alpha fringe should not become a large invisible obstacle.
  const bounds = api.opaqueBounds(pixels, 6, 8);
  assert.deepEqual({ ...bounds }, { x: 1, y: 2, w: 4, h: 5 });
  assert.throws(() => api.opaqueBounds(new Uint8ClampedArray(4), 1, 1), /Empty sprite/);
});

test("wall render rectangles match collision bounds in either orientation", () => {
  const api = game();
  api.sprites.wall.image = {};
  api.sprites.wall.source = { x: 184, y: 60, w: 519, h: 1653 };
  for (const [w, h] of [[32, 32 * 1653 / 519], [32 * 1653 / 519, 32]]) {
    const wall = { x: 200, y: 140, w, h };
    api.world.obstacles = [wall];
    api.drawing.length = 0;
    api.drawObstacles();
    assert.deepEqual(api.drawing.find((call) => call.method === "translate").args, [wall.x + w / 2, wall.y + h / 2]);
    const image = api.drawing.find((call) => call.method === "drawImage").args;
    assert.deepEqual(image.slice(1, 5), [184, 60, 519, 1653]);
    close(image[7] * image[8], w * h);
    assert.equal(api.collidesWithObstacle(wall.x - 14, wall.y + h / 2, 13), false);
    assert.equal(api.collidesWithObstacle(wall.x - 12.9, wall.y + h / 2, 13), true);
  }
  api.generateFloor(6);
  for (const wall of api.world.obstacles) close(Math.max(wall.w, wall.h) / Math.min(wall.w, wall.h), 1653 / 519);
  for (const actor of [api.player, ...api.world.enemies]) assert.equal(api.collidesWithObstacle(actor.x, actor.y, actor.radius), false);
});

test("stairs use the visible open steps for descent, including after resize", () => {
  for (const unit of [0.7, 1, 1.65]) {
    const api = game();
    api.state.unit = unit;
    api.world.stairs = { x: 480, y: 270 };
    api.world.floorCleared = true;
    api.sprites.stairs.image = {};
    api.sprites.stairs.source = { x: 375, y: 356, w: 519, h: 521 };
    const bounds = api.stairBounds();
    api.drawStairs(0);
    assert.deepEqual(api.drawing.find((call) => call.method === "drawImage").args.slice(5), [bounds.x, bounds.y, bounds.w, bounds.h]);
    api.player.x = bounds.x - api.player.radius * unit - 1;
    api.player.y = 270;
    api.updatePlayer(0);
    assert.equal(api.state.scene, "playing");
    api.scaleWorld(0.9, 1.1, 1);
    api.player.x = api.world.stairs.x;
    api.player.y = api.world.stairs.y;
    api.updatePlayer(0);
    assert.equal(api.state.scene, "transition");
  }
});

test("new wall proportions keep enemies, bosses and stairs reachable across random layouts", () => {
  for (const [width, height, unit] of [[960, 540, 1], [390, 844, 0.7]]) {
    const api = game();
    api.world.width = width;
    api.world.height = height;
    api.state.unit = unit;
    for (const seed of [1, 57, 812, 9341]) for (const floor of [0, 1, 2, 3, 5, 10]) {
      api.state.runSeed = seed;
      api.state.floor = floor;
      api.generateFloor(floor);
      api.createBoss();
      const stairs = api.findClearPoint(width / 2, height * 0.14, api.stairClearance());
      const radius = api.player.radius * unit;
      const margin = 20 * unit + radius;
      const step = 6 * unit;
      const columns = Math.floor((width - margin * 2) / step) + 1;
      const rows = Math.floor((height - margin * 2) / step) + 1;
      const cells = new Uint8Array(columns * rows);
      for (let row = 0; row < rows; row++) for (let col = 0; col < columns; col++) {
        if (api.collidesWithObstacle(margin + col * step, margin + row * step, radius)) cells[row * columns + col] = 1;
      }
      const startCol = Math.round((api.player.x - margin) / step);
      const startRow = Math.round((api.player.y - margin) / step);
      const queue = [startRow * columns + startCol];
      assert.equal(cells[queue[0]], 0);
      cells[queue[0]] = 2;
      for (let next = 0; next < queue.length; next++) {
        const index = queue[next], col = index % columns, row = Math.floor(index / columns);
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const x = col + dx, y = row + dy, neighbor = y * columns + x;
          if (x < 0 || x >= columns || y < 0 || y >= rows || cells[neighbor] !== 0) continue;
          cells[neighbor] = 2;
          queue.push(neighbor);
        }
      }
      for (const target of [...api.world.enemies, api.world.boss, stairs]) {
        const col = Math.round((target.x - margin) / step), row = Math.round((target.y - margin) / step);
        assert.equal(cells[row * columns + col], 2, `Blocked ${target.type || "stairs"} on ${width}x${height}, seed ${seed}, floor ${floor}`);
      }
    }
  }
});

test("number keys equip spells without spending mana or firing, then right-click casts", () => {
  const api = game();
  for (const code of ["Digit2", "Digit3", "Digit1", "Numpad3", "Numpad2", "Numpad1"]) {
    const index = Number(code.slice(-1)) - 1;
    api.window.dispatch("keydown", { code, repeat: false });
    assert.equal(api.state.selectedSpell, index);
    assert.equal(api.element(`slot${index}`).classList.contains("selected"), true);
    assert.equal(api.player.mana, 100);
    assert.deepEqual(Array.from(api.player.spellCooldowns), [0, 0, 0]);
    assert.equal(api.world.projectiles.length, 0);
  }
  api.element("slot2").dispatch("click");
  assert.equal(api.state.selectedSpell, 2);
  assert.equal(api.world.projectiles.length, 0);
  api.pointer("pointerdown", 700, 270, 2);
  assert.equal(api.world.projectiles[0].type, "nova");
  assert.equal(api.player.mana, 65);
});

test("mobile spell slots retain tap-to-cast", () => {
  const api = game();
  api.state.controlMode = "mobile";
  api.element("slot1").dispatch("click");
  assert.equal(api.state.selectedSpell, 1);
  assert.equal(api.world.projectiles[0].type, "frost");
});

test("every boss begins a recurring charge or homing attack against a distant player", () => {
  for (let profile = -1; profile < 6; profile++) {
    const api = game();
    api.state.floor = profile === -1 ? 0 : 5;
    api.world.rng = () => (profile + 0.5) / 6;
    api.createBoss();
    const boss = api.world.boss;
    boss.x = 200; boss.y = 270;
    api.player.x = 630; api.player.y = 270;
    boss.pursuitCooldown = 0;
    boss.specialCooldown = 100;
    api.updateEnemies(1 / 60);
    assert.ok(["charge", "homing"].includes(boss.attackKind));
    assert.equal(boss.attackKind, boss.pursuitKind);
    assert.ok(boss.telegraph > 0 && boss.pursuitCooldown > 0);
    api.updateEnemies(boss.telegraph + 0.001);
    assert.equal(boss.x, 200); // Resolving a windup must not teleport a charge.
    if (boss.pursuitKind === "charge") assert.ok(boss.charge);
    else assert.equal(api.world.projectiles[0].type, "homing");
    for (let frame = 0; frame < 180 && api.player.hp === 100; frame++) {
      api.updateEnemies(1 / 60);
      api.updateProjectiles(1 / 60);
    }
    assert.ok(api.player.hp < 100, `${boss.variant} must threaten a stationary ranged player`);
  }
});

test("charges advance over multiple frames with trails and swept player contact", () => {
  for (const unit of [0.7, 1, 1.65]) {
    const api = game();
    api.state.unit = unit;
    api.player.x = 420; api.player.y = 270;
    const charger = api.createEnemy("charger", 200, 270, 0);
    api.world.enemies = [charger];
    api.beginEnemyAttack(charger, "charge", 0.1);
    api.updateEnemies(0.11);
    assert.equal(charger.x, 200);
    assert.equal(api.player.hp, 100);
    api.updateEnemies(1 / 60);
    close(charger.x, 200 + 760 * unit / 60);
    assert.ok(charger.chargeTrail.length > 0);
    api.drawEnemy(charger, 0);
    assert.ok(api.drawing.some((call) => call.method === "lineTo"));
    for (let frame = 0; frame < 60 && charger.charge; frame++) {
      api.player.invulnerable = 0; // A single charge should still damage only once.
      api.updateEnemies(1 / 60);
    }
    assert.equal(charger.charge, null);
    assert.equal(api.player.hp, 100 - charger.damage);
    close(charger.x, 200 + 300 * unit);
  }
});

test("fast charges stop at walls and cannot damage through them", () => {
  const api = game();
  api.player.x = 440; api.player.y = 270;
  const charger = api.createEnemy("charger", 200, 270, 0);
  api.world.enemies = [charger];
  api.world.obstacles = [{ x: 350, y: 200, w: 32, h: 140 }];
  api.beginEnemyAttack(charger, "charge", 0.1);
  api.updateEnemies(0.11);
  api.updateEnemyCharge(charger, 0.5);
  assert.equal(charger.charge, null);
  assert.ok(charger.x + charger.radius <= 350);
  assert.equal(api.player.hp, 100);
  assert.equal(api.collidesWithObstacle(charger.x, charger.y, charger.radius), false);
});

test("freeze, stun and death interrupt an active charge", () => {
  for (const interrupt of [
    (enemy) => { enemy.frozen = 3; },
    (enemy) => { enemy.stunned = 1; },
    (enemy, api) => api.killEnemy(enemy)
  ]) {
    const api = game();
    const charger = api.createEnemy("charger", 200, 270, 0);
    api.world.enemies = [charger];
    api.beginEnemyAttack(charger, "charge", 0.1);
    api.updateEnemies(0.11);
    interrupt(charger, api);
    api.updateEnemies(1 / 60);
    assert.equal(charger.charge, null);
    assert.equal(charger.x, 200);
  }
});

test("homing shots steer toward a moving player with a bounded turn rate", () => {
  const api = game();
  api.spawnProjectile(200, 270, 1, 0, { friendly: false, damage: 30, speed: 245, radius: 9, color: "#e4714d", life: 4, type: "homing", turnRate: 2.4, homingTime: 3 });
  const shot = api.world.projectiles[0];
  api.player.x = 450; api.player.y = 470;
  api.updateProjectiles(0.05);
  close(Math.atan2(shot.vy, shot.vx), 2.4 * 0.05);
  close(Math.hypot(shot.vx, shot.vy), 245);
  api.player.y = 70;
  api.updateProjectiles(0.05);
  assert.ok(Math.atan2(shot.vy, shot.vx) < 0.12);
  api.world.obstacles = [{ x: shot.x + 4, y: shot.y - 40, w: 32, h: 80 }];
  api.updateProjectiles(0.05);
  assert.equal(shot.life, 0);
});

test("Nova boundary, wave and sparks all use its actual damage radius with Expanding Star", () => {
  for (const expanded of [false, true]) {
    const api = game();
    if (expanded) api.chooseBuff("nova_range");
    const radius = expanded ? 140 : 112;
    const edge = api.createEnemy("sentinel", 700 + radius + 18 - 0.1, 270, 0);
    const outside = api.createEnemy("sentinel", 700 + radius + 18 + 0.1, 270, 0);
    api.world.enemies = [edge, outside];
    const nova = { x: 700, y: 270, blastRadius: radius, damage: 38, color: "#be84f0", life: 1 };
    api.detonateNova(nova);
    assert.equal(edge.hp, edge.maxHp - 38);
    assert.equal(outside.hp, outside.maxHp);
    const sparks = api.world.particles.filter((particle) => particle.color === nova.color);
    assert.equal(sparks.length, 32);
    for (const spark of sparks) close(Math.hypot(spark.x - 700, spark.y - 270), radius);
    api.drawHazards(0);
    assert.equal(api.drawing.find((call) => call.method === "arc").args[2], radius);
    api.drawing.length = 0;
    api.updateHazards(0.09);
    api.drawHazards(90);
    const arcs = api.drawing.filter((call) => call.method === "arc");
    close(arcs[0].args[2], radius);
    close(arcs[1].args[2], radius * 0.5);
    assert.equal(edge.hp, edge.maxHp - 38); // The visual does not deal damage repeatedly.
  }
});

test("enemy populations and damage increase while health drops heal less", () => {
  const api = game();
  for (const [floor, count] of [[0, 5], [1, 7], [5, 11], [20, 20]]) {
    api.state.floor = floor;
    api.generateFloor(floor);
    assert.equal(api.world.enemies.length, count);
  }
  const previousDamage = { slime: 11, skeleton: 15, wisp: 13, spitter: 9, charger: 20, cultist: 17, sentinel: 21 };
  for (const [type, damage] of Object.entries(previousDamage)) assert.ok(api.createEnemy(type, 100, 100, 0).damage > damage);
  api.state.floor = 0;
  api.createBoss();
  assert.equal(api.world.boss.maxHp, 300);
  api.state.floor = 1;
  api.createBoss();
  assert.equal(api.world.boss.maxHp, 512);
  api.player.hp = 40;
  api.world.pickups = [{ x: api.player.x, y: api.player.y, type: "health", life: 12, phase: 0 }];
  api.updatePickups(1 / 60);
  assert.equal(api.player.hp, 50);
  api.world.rng = () => 0.2; // Previously this would drop loot, now it does not.
  api.world.pickups = [];
  api.killEnemy(api.createEnemy("slime", 100, 100, 0));
  assert.equal(api.world.pickups.length, 0);
});

test("Freezing Cold keeps its frost bonus, and chamber names are removed", () => {
  const api = game();
  assert.equal(api.BUFF_CATALOG.find((buff) => buff.id === "frost_range").name, "Freezing Cold");
  assert.equal(source.includes("FLOOR_NAMES"), false);
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  assert.equal(/areaLabel|transitionName|VIOLET CRYPT|ECHOING DEEP|SUNLIT VERGE/.test(html), false);
});
