import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";

const source = readFileSync(new URL("../game.js", import.meta.url), "utf8");

function game() {
  const elements = new Map();
  const drawing = [];
  const captures = new Set();
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
    setTimeout: () => 1, clearTimeout() {}, requestAnimationFrame() {},
    HTMLButtonElement: class {}, HTMLInputElement: class {}, HTMLSelectElement: class {}
  };
  // Instrument only the test copy of this closure; production has no exposed state.
  const instrumented = source.replace("  initialize();", `bindEvents(); globalThis.game = {
    state, input, world, get player() { return player; }, requestAttack, castSpell,
    startCharge, releaseCharge, cancelCharge, clearInput, updatePlayer, updateProjectiles,
    updateHazards, createEnemy, createBoss, generateFloor, requestDash, openPause, resumeGame,
    drawPlayer, drawCrosshair, render, resizeCanvas, aimVector, aimTarget, slashHitsEnemy,
    detonateNova, BOSS_CATALOG, chooseEnemyType
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
    assert.deepEqual(boundary, [0, 0, 70, -api.player.slash.halfAngle, api.player.slash.halfAngle]);
  }
});

test("the curved footprint accounts for enemy size at reach and angular edges", () => {
  const api = game();
  api.aim(680, 270);
  api.requestAttack();
  const slash = api.player.slash;
  assert.equal(api.slashHitsEnemy(slash, { x: 555, y: 270, radius: 5 }), true);
  assert.equal(api.slashHitsEnemy(slash, { x: 556, y: 270, radius: 5 }), false);
  assert.equal(api.slashHitsEnemy(slash, { x: 430, y: 270, radius: 10 }), false);
  const angle = slash.halfAngle + 0.04;
  assert.equal(api.slashHitsEnemy(slash, { x: 480 + Math.cos(angle) * 50, y: 270 + Math.sin(angle) * 50, radius: 3 }), true);
  assert.equal(api.slashHitsEnemy(slash, { x: 480 + Math.cos(angle) * 50, y: 270 + Math.sin(angle) * 50, radius: 1 }), false);
});

test("Long Blade increases damage reach and visual reach together", () => {
  const api = game();
  api.state.buffs.long_blade = 1;
  api.aim(680, 270);
  const enemy = api.createEnemy("skeleton", 600, 270, 0);
  api.world.enemies = [enemy];
  api.requestAttack();
  assert.equal(enemy.hp, enemy.maxHp - 24);
  assert.equal(api.player.slash.reach, 140);
  api.drawPlayer(0);
  assert.equal(api.drawing.find((call) => call.method === "arc").args[2], 140);
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
