(() => {
  "use strict";

  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const lerp = (from, to, amount) => from + (to - from) * amount;
  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

  const canvas = $("#gameCanvas");
  const ctx = canvas.getContext("2d", { alpha: false });
  ctx.imageSmoothingEnabled = false;

  const ui = {
    menu: $("#menuScreen"), game: $("#gameScreen"), play: $("#playButton"),
    settings: $("#settingsModal"), settingsButton: $("#settingsButton"), settingsDone: $("#settingsDone"),
    pauseSettings: $("#pauseSettingsButton"), pause: $("#pauseModal"), pauseButton: $("#pauseButton"),
    resume: $("#resumeButton"), quit: $("#quitButton"), tutorial: $("#tutorialModal"),
    tutorialTitle: $("#tutorialTitle"), tutorialDescription: $("#tutorialDescription"),
    tutorialVisual: $("#tutorialVisual"), tutorialStepLabel: $("#tutorialStepLabel"),
    tutorialDots: $("#tutorialDots"), tutorialBack: $("#tutorialBack"), tutorialNext: $("#tutorialNext"),
    replayTutorial: $("#replayTutorial"), gameOver: $("#gameOverModal"), reachedFloor: $("#reachedFloor"),
    killStat: $("#killStat"), timeStat: $("#timeStat"), retry: $("#retryButton"), menuButton: $("#menuButton"),
    healthFill: $("#healthFill"), healthText: $("#healthText"), manaFill: $("#manaFill"), manaText: $("#manaText"),
    enemyCount: $("#enemyCount"), areaLabel: $("#areaLabel"), floorLabel: $("#floorLabel"),
    objectiveText: $("#objectiveText"), bossHud: $("#bossHud"), bossName: $("#bossName"), bossFill: $("#bossFill"),
    toast: $("#toast"), mobileControls: $("#mobileControls"), joystickZone: $("#joystickZone"),
    joystickKnob: $("#joystickKnob"), mobileAttack: $("#mobileAttack"), mobileBlock: $("#mobileBlock"),
    mobileSpell: $("#mobileSpell"), controlsGrid: $("#controlsGrid"), controlsSubtitle: $("#controlsSubtitle"),
    shakeToggle: $("#shakeToggle"), floorTransition: $("#floorTransition"),
    transitionFloor: $("#transitionFloor"), transitionName: $("#transitionName")
  };

  const SPELLS = [
    { id: "ember", name: "Ember", cost: 12, cooldown: 0.55, color: "#f1743e" },
    { id: "frost", name: "Frost", cost: 22, cooldown: 1.7, color: "#66cce4" },
    { id: "nova", name: "Nova", cost: 35, cooldown: 4.5, color: "#be84f0" }
  ];
  const FLOOR_NAMES = ["THE HOLLOW HALLS", "THE SUNKEN VAULT", "THE CINDER CELLS", "THE VIOLET CRYPT", "THE IRON CHAPEL", "THE ECHOING DEEP"];
  const BOSS_NAMES = ["THE BONE WARDEN", "THE CINDER EYE", "THE HOLLOW KNIGHT", "THE VEIL KEEPER"];

  const tutorials = {
    desktop: [
      { title: "Move freely", description: "Use WASD or the arrow keys to explore the tiled arena. Move in any direction and keep your distance.", visual: '<div class="tutorial-keys"><span>W</span><span>A</span><span>S</span><span>D</span></div>' },
      { title: "Strike & guard", description: "Press Space to swing. Hold Shift to guard; a perfectly timed block stops all damage and stuns the attacker.", visual: '<div class="tutorial-icon">⚔ <span style="color:#9fa9b6">◇</span></div>' },
      { title: "Wield magic", description: "Press 1, 2, or 3 to equip and cast Ember, Frost, or Nova. Spells use mana, which restores on its own.", visual: '<div class="tutorial-icon"><span style="color:#f1743e">●</span> <span style="color:#66cce4">✦</span> <span style="color:#be84f0">✺</span></div>' },
      { title: "Defeat. Descend.", description: "Clear the floor to summon its guardian. Defeat the boss, then step onto the glowing stairs. The dungeon never ends.", visual: '<div class="tutorial-icon">☠ ↓</div>' }
    ],
    mobile: [
      { title: "Move freely", description: "Drag the joystick with your left thumb. Move in any direction and keep your distance from enemies.", visual: '<div class="tutorial-icon">◎</div>' },
      { title: "Strike & guard", description: "Tap Strike to swing. Hold Guard to block; a perfectly timed block stops all damage and stuns the attacker.", visual: '<div class="tutorial-icon">⚔ <span style="color:#9fa9b6">◇</span></div>' },
      { title: "Wield magic", description: "Tap a spell slot to equip and cast it, or use the large Spell button to cast your selected magic again.", visual: '<div class="tutorial-icon"><span style="color:#f1743e">●</span> <span style="color:#66cce4">✦</span> <span style="color:#be84f0">✺</span></div>' },
      { title: "Defeat. Descend.", description: "Clear the floor to summon its guardian. Defeat the boss, then step onto the glowing stairs. The dungeon never ends.", visual: '<div class="tutorial-icon">☠ ↓</div>' }
    ]
  };

  const detectedControlMode = matchMedia("(pointer: coarse)").matches ? "mobile" : "desktop";
  const storedControlMode = loadPreference("controlMode", detectedControlMode);
  const storedScreenShake = loadPreference("screenShake", true);

  const state = {
    scene: "menu", floor: 0, kills: 0, runStartedAt: 0, tutorialStep: 0, settingsOrigin: "menu",
    controlMode: tutorials[storedControlMode] ? storedControlMode : detectedControlMode,
    screenShake: typeof storedScreenShake === "boolean" ? storedScreenShake : true, selectedSpell: 0, lastTime: performance.now(),
    accumulator: 0, unit: 1, shakeAmount: 0, toastTimer: 0, transitionTimer: 0
  };

  const input = { keys: new Set(), joystickX: 0, joystickY: 0, joystickPointer: null, mobileBlocking: false, mouseBlocking: false };
  const world = {
    width: 960, height: 540, theme: "grass", name: "THE SUNLIT VERGE", obstacles: [], torches: [], enemies: [],
    projectiles: [], particles: [], floaters: [], pickups: [], boss: null, bossSpawned: false,
    floorCleared: false, stairs: null, elapsed: 0, rng: Math.random, objective: ""
  };
  let player = createPlayer();

  function loadPreference(key, fallback) {
    try {
      const value = localStorage.getItem(`last-descent:${key}`);
      return value === null ? fallback : JSON.parse(value);
    } catch { return fallback; }
  }

  function savePreference(key, value) {
    try { localStorage.setItem(`last-descent:${key}`, JSON.stringify(value)); } catch { /* Optional. */ }
  }

  function createPlayer() {
    return {
      x: 480, y: 420, radius: 13, speed: 180, hp: 100, maxHp: 100, mana: 100, maxMana: 100,
      stamina: 100, maxStamina: 100, facingX: 0, facingY: -1, attackCooldown: 0, attackAnim: 0,
      spellCooldowns: [0, 0, 0], invulnerable: 0, hurtFlash: 0, blocking: false, wasBlocking: false,
      blockStartedAt: 0, guardBroken: 0, walkCycle: 0, power: 1
    };
  }

  function mulberry32(seed) {
    let value = seed >>> 0;
    return () => {
      value += 0x6d2b79f5;
      let result = value;
      result = Math.imul(result ^ (result >>> 15), result | 1);
      result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
      return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
    };
  }

  function buildMenuParticles() {
    const host = $("#menuParticles");
    for (let index = 0; index < 24; index += 1) {
      const particle = document.createElement("i");
      particle.className = "menu-particle";
      particle.style.left = `${15 + Math.random() * 70}%`;
      particle.style.bottom = `${Math.random() * 18}%`;
      particle.style.setProperty("--duration", `${4 + Math.random() * 5}s`);
      particle.style.setProperty("--delay", `${-Math.random() * 8}s`);
      particle.style.setProperty("--drift", `${-28 + Math.random() * 56}px`);
      host.appendChild(particle);
    }
  }

  function resizeCanvas() {
    const rect = canvas.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return;
    const nextWidth = Math.max(320, Math.round(rect.width));
    const nextHeight = Math.max(320, Math.round(rect.height));
    const oldWidth = world.width;
    const oldHeight = world.height;
    const oldUnit = state.unit;
    if (canvas.width === nextWidth && canvas.height === nextHeight) return;
    canvas.width = nextWidth;
    canvas.height = nextHeight;
    ctx.imageSmoothingEnabled = false;
    world.width = nextWidth;
    world.height = nextHeight;
    state.unit = clamp(Math.min(nextWidth / 960, nextHeight / 540), 0.7, 1.65);
    if (state.scene !== "menu" && oldWidth && oldHeight) scaleWorld(nextWidth / oldWidth, nextHeight / oldHeight, state.unit / oldUnit);
  }

  function scaleWorld(scaleX, scaleY, sizeScale) {
    const points = [player, world.boss, world.stairs, ...world.enemies, ...world.projectiles, ...world.particles, ...world.floaters, ...world.pickups, ...world.torches].filter(Boolean);
    points.forEach((item) => { item.x *= scaleX; item.y *= scaleY; });
    world.obstacles.forEach((obstacle) => { obstacle.x *= scaleX; obstacle.y *= scaleY; obstacle.w *= scaleX; obstacle.h *= scaleY; });
    [...world.enemies, ...(world.boss ? [world.boss] : [])].forEach((enemy) => {
      enemy.radius *= sizeScale;
      enemy.speed *= sizeScale;
      enemy.range *= sizeScale;
      enemy.knockX *= scaleX;
      enemy.knockY *= scaleY;
    });
    world.projectiles.forEach((projectile) => {
      projectile.radius *= sizeScale;
      projectile.vx *= scaleX;
      projectile.vy *= scaleY;
    });
    world.particles.forEach((particle) => {
      particle.size *= sizeScale;
      particle.vx *= scaleX;
      particle.vy *= scaleY;
    });
    const actors = [player, ...world.enemies, ...(world.boss ? [world.boss] : [])];
    actors.forEach((actor) => {
      const radius = actor === player ? player.radius * state.unit : actor.radius;
      if (collidesWithObstacle(actor.x, actor.y, radius)) Object.assign(actor, findClearPoint(actor.x, actor.y, radius));
    });
  }

  const floorName = (floor) => floor === 0 ? "THE SUNLIT VERGE" : FLOOR_NAMES[(floor - 1) % FLOOR_NAMES.length];
  const bossName = (floor) => floor === 0 ? "THE MOSS GUARDIAN" : BOSS_NAMES[(floor - 1) % BOSS_NAMES.length];

  function generateFloor(floor) {
    const difficulty = floor;
    world.rng = mulberry32(0x9e3779b9 ^ (floor * 2654435761));
    world.theme = floor === 0 ? "grass" : floor % 4 === 0 ? "crypt" : floor % 3 === 0 ? "ember" : "stone";
    world.name = floorName(floor);
    Object.assign(world, { obstacles: [], torches: [], enemies: [], projectiles: [], particles: [], floaters: [], pickups: [], boss: null, bossSpawned: false, floorCleared: false, stairs: null, elapsed: 0, objective: "" });
    ui.bossHud.classList.add("is-hidden");
    Object.assign(player, { x: world.width * 0.5, y: world.height * 0.79, facingX: 0, facingY: -1, attackCooldown: 0, attackAnim: 0, spellCooldowns: [0, 0, 0], invulnerable: 0.7, blocking: false, wasBlocking: false, guardBroken: 0, stamina: player.maxStamina });
    createObstacles(floor);
    createTorches(floor);
    const count = floor === 0 ? 3 : Math.min(10, 3 + Math.ceil(difficulty * 0.58));
    for (let index = 0; index < count; index += 1) {
      const type = floor === 0 ? "slime" : chooseEnemyType(index, floor);
      const position = findSpawnPosition(index);
      world.enemies.push(createEnemy(type, position.x, position.y, difficulty));
    }
    updateFloorLabels();
    updateObjective();
    updateHud();
  }

  function createObstacles(floor) {
    const unit = state.unit;
    if (floor === 0) {
      const margin = 26 * unit;
      [[margin, world.height * 0.22, 52, 72, "tree"], [world.width - margin - 50 * unit, world.height * 0.29, 50, 70, "tree"], [world.width * 0.18, world.height * 0.66, 42, 30, "rock"], [world.width * 0.76, world.height * 0.66, 46, 32, "rock"], [world.width * 0.08, world.height * 0.48, 34, 28, "rock"], [world.width * 0.87, world.height * 0.5, 35, 28, "rock"]]
        .forEach(([x, y, w, h, kind]) => world.obstacles.push({ x, y, w: w * unit, h: h * unit, kind }));
      return;
    }
    const obstacleCount = Math.min(8, 3 + (floor % 6));
    const tile = 32 * unit;
    let attempts = 0;
    while (world.obstacles.length < obstacleCount && attempts < 80) {
      attempts += 1;
      const horizontal = world.rng() > 0.55;
      const w = (horizontal ? (2 + Math.floor(world.rng() * 2)) : 1) * tile;
      const h = (horizontal ? 1 : (2 + Math.floor(world.rng() * 2))) * tile;
      const x = Math.round(lerp(world.width * 0.12, world.width * 0.88 - w, world.rng()) / tile) * tile;
      const y = Math.round(lerp(world.height * 0.2, world.height * 0.68 - h, world.rng()) / tile) * tile;
      const candidate = { x, y, w, h, kind: horizontal ? "wall" : "pillar" };
      const reserved = [
        { x: world.width * 0.5, y: world.height * 0.79, radius: 100 * unit },
        { x: world.width * 0.5, y: world.height * 0.2, radius: 112 * unit },
        { x: world.width * 0.5, y: world.height * 0.49, radius: 82 * unit }
      ];
      if (reserved.some((zone) => circleIntersectsRect(zone.x, zone.y, zone.radius, candidate))) continue;
      if (world.obstacles.some((obstacle) => rectanglesOverlap(candidate, obstacle, 22 * unit))) continue;
      world.obstacles.push(candidate);
    }
  }

  function rectanglesOverlap(a, b, padding = 0) {
    return a.x - padding < b.x + b.w && a.x + a.w + padding > b.x && a.y - padding < b.y + b.h && a.y + a.h + padding > b.y;
  }

  function circleIntersectsRect(x, y, radius, rect) {
    const nearestX = clamp(x, rect.x, rect.x + rect.w);
    const nearestY = clamp(y, rect.y, rect.y + rect.h);
    return (x - nearestX) ** 2 + (y - nearestY) ** 2 < radius ** 2;
  }

  function createTorches(floor) {
    if (floor === 0) return;
    const count = clamp(3 + (floor % 3), 3, 5);
    for (let index = 0; index < count; index += 1) {
      world.torches.push({ x: lerp(world.width * 0.1, world.width * 0.9, index / (count - 1)), y: index % 2 ? world.height * 0.16 : world.height * 0.72, phase: world.rng() * Math.PI * 2, size: 1 + world.rng() * 0.25 });
    }
  }

  function chooseEnemyType(index, floor) {
    const roll = (index * 0.37 + world.rng() + floor * 0.11) % 1;
    if (floor >= 2 && roll > 0.72) return "wisp";
    if (floor >= 1 && roll > 0.36) return "skeleton";
    return "slime";
  }

  function findSpawnPosition(index) {
    const unit = state.unit;
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const angle = (index / Math.max(1, world.enemies.length + 3)) * Math.PI * 2 + world.rng() * 1.8;
      const radius = Math.min(world.width, world.height) * (0.23 + world.rng() * 0.25);
      const candidate = { x: clamp(world.width / 2 + Math.cos(angle) * radius, 45 * unit, world.width - 45 * unit), y: clamp(world.height * 0.43 + Math.sin(angle) * radius, 70 * unit, world.height * 0.66) };
      if (distance(candidate, player) < 145 * unit || world.enemies.some((enemy) => distance(candidate, enemy) < 55 * unit) || collidesWithObstacle(candidate.x, candidate.y, 18 * unit)) continue;
      return candidate;
    }
    return findClearPoint(world.width * (0.2 + (index % 4) * 0.2), world.height * 0.3, 18 * unit, true);
  }

  function findClearPoint(preferredX, preferredY, radius, avoidActors = false) {
    const margin = 22 * state.unit + radius;
    const isClear = (x, y) => {
      if (x < margin || x > world.width - margin || y < margin || y > world.height - margin) return false;
      if (collidesWithObstacle(x, y, radius)) return false;
      if (avoidActors && distance({ x, y }, player) < 120 * state.unit) return false;
      if (avoidActors && world.enemies.some((enemy) => !enemy.dead && Math.hypot(x - enemy.x, y - enemy.y) < radius + enemy.radius + 20 * state.unit)) return false;
      return true;
    };
    const startX = clamp(preferredX, margin, world.width - margin);
    const startY = clamp(preferredY, margin, world.height - margin);
    if (isClear(startX, startY)) return { x: startX, y: startY };
    const step = Math.max(20, 28 * state.unit);
    for (let ring = 1; ring <= 18; ring += 1) {
      const points = Math.max(8, ring * 8);
      for (let index = 0; index < points; index += 1) {
        const angle = (Math.PI * 2 * index) / points;
        const x = clamp(startX + Math.cos(angle) * step * ring, margin, world.width - margin);
        const y = clamp(startY + Math.sin(angle) * step * ring, margin, world.height - margin);
        if (isClear(x, y)) return { x, y };
      }
    }
    for (let y = margin; y <= world.height - margin; y += step) {
      for (let x = margin; x <= world.width - margin; x += step) if (isClear(x, y)) return { x, y };
    }
    return { x: world.width / 2, y: world.height / 2 };
  }

  function createEnemy(type, x, y, floor) {
    const unit = state.unit;
    const hpScale = 1 + floor * 0.14;
    const stats = {
      slime: { hp: 42, speed: 52, radius: 16, damage: 11, range: 30, cooldown: 1.35 },
      skeleton: { hp: 58, speed: 66, radius: 14, damage: 15, range: 35, cooldown: 1.15 },
      wisp: { hp: 38, speed: 48, radius: 12, damage: 13, range: 220, cooldown: 1.75 }
    }[type];
    return {
      type, x, y, radius: stats.radius * unit, hp: Math.round(stats.hp * hpScale), maxHp: Math.round(stats.hp * hpScale),
      speed: stats.speed * unit * (1 + Math.min(floor, 50) * 0.006), damage: Math.round(stats.damage * (1 + floor * 0.035)),
      range: stats.range * unit, baseCooldown: stats.cooldown, attackCooldown: 0.35 + world.rng() * 0.7,
      telegraph: 0, telegraphMax: 0, attackKind: "", attackAngle: 0, flash: 0, slow: 0, stunned: 0,
      dead: false, deathTimer: 0, hurtVisible: 0, walk: world.rng() * 10, knockX: 0, knockY: 0, isBoss: false
    };
  }

  function createBoss() {
    const floor = state.floor;
    const unit = state.unit;
    const maxHp = Math.round((floor === 0 ? 185 : 230) * (1 + floor * 0.19));
    const spawn = findClearPoint(world.width * 0.5, Math.max(95 * unit, world.height * 0.2), (floor === 0 ? 30 : 32) * unit);
    const boss = {
      type: "boss", name: bossName(floor), x: spawn.x, y: spawn.y,
      radius: (floor === 0 ? 30 : 32) * unit, hp: maxHp, maxHp,
      speed: (floor === 0 ? 38 : 47) * unit * (1 + Math.min(floor, 40) * 0.005),
      damage: Math.round((floor === 0 ? 16 : 20) * (1 + floor * 0.03)), range: 75 * unit,
      baseCooldown: 1.7, attackCooldown: 1.2, specialCooldown: 3.8, telegraph: 0, telegraphMax: 0,
      attackKind: "", attackAngle: 0, flash: 0, slow: 0, stunned: 0, dead: false, deathTimer: 0,
      hurtVisible: 0, walk: 0, knockX: 0, knockY: 0, isBoss: true,
      variant: floor === 0 ? "moss" : ["bone", "cinder", "hollow", "veil"][(floor - 1) % 4]
    };
    world.boss = boss;
    world.bossSpawned = true;
    ui.bossName.textContent = boss.name;
    ui.bossHud.classList.remove("is-hidden");
    showToast(`${boss.name} AWAKENS`);
    burst(boss.x, boss.y, boss.variant === "moss" ? "#8fb85f" : "#d25757", 28, 150 * unit);
    state.shakeAmount = state.screenShake ? 12 * unit : 0;
    updateObjective();
  }

  function updateFloorLabels() {
    ui.areaLabel.textContent = world.name;
    ui.floorLabel.textContent = state.floor === 0 ? "TUTORIAL" : `FLOOR ${state.floor}`;
  }

  function updateObjective() {
    const alive = world.enemies.filter((enemy) => !enemy.dead).length;
    const next = world.floorCleared ? "Enter the glowing stairs" : world.boss && !world.boss.dead ? "Defeat the floor guardian" : alive > 0 ? `Clear the floor · ${alive} remaining` : "Something stirs...";
    if (next !== world.objective) { world.objective = next; ui.objectiveText.textContent = next; }
  }

  function startGame() {
    hideAllModals();
    ui.bossHud.classList.add("is-hidden");
    ui.menu.classList.add("is-hidden");
    ui.game.classList.remove("is-hidden");
    state.scene = "tutorial";
    state.floor = 0;
    state.kills = 0;
    state.selectedSpell = 0;
    state.runStartedAt = performance.now();
    player = createPlayer();
    resizeCanvas();
    generateFloor(0);
    applyControlMode();
    showTutorial(0);
  }

  function returnToMenu() {
    clearInput();
    hideAllModals();
    state.scene = "menu";
    ui.game.classList.add("is-hidden");
    ui.menu.classList.remove("is-hidden");
    ui.mobileControls.classList.add("is-hidden");
    ui.bossHud.classList.add("is-hidden");
  }

  function hideAllModals() {
    [ui.settings, ui.pause, ui.tutorial, ui.gameOver, ui.floorTransition].forEach((element) => element.classList.add("is-hidden"));
    syncModalInert();
  }

  function showTutorial(step = 0) {
    clearInput();
    state.tutorialStep = clamp(step, 0, tutorials[state.controlMode].length - 1);
    state.scene = "tutorial";
    ui.pause.classList.add("is-hidden");
    ui.settings.classList.add("is-hidden");
    ui.tutorial.classList.remove("is-hidden");
    renderTutorial();
    requestAnimationFrame(() => ui.tutorialNext.focus());
  }

  function renderTutorial() {
    const pages = tutorials[state.controlMode];
    const page = pages[state.tutorialStep];
    ui.tutorialTitle.textContent = page.title;
    ui.tutorialDescription.textContent = page.description;
    ui.tutorialVisual.innerHTML = page.visual;
    ui.tutorialStepLabel.textContent = `${state.tutorialStep + 1} / ${pages.length}`;
    ui.tutorialDots.innerHTML = pages.map((_, index) => `<span class="${index === state.tutorialStep ? "active" : ""}"></span>`).join("");
    ui.tutorialBack.disabled = state.tutorialStep === 0;
    ui.tutorialBack.style.opacity = state.tutorialStep === 0 ? ".35" : "1";
    ui.tutorialNext.textContent = state.tutorialStep === pages.length - 1 ? "Enter field" : "Next";
  }

  function finishTutorial() {
    ui.tutorial.classList.add("is-hidden");
    syncModalInert();
    state.scene = "playing";
    clearInput();
    showToast(state.floor === 0 ? "CLEAR THE FIELD" : `FLOOR ${state.floor}`);
  }

  function openSettings(origin = "menu") {
    clearInput();
    state.settingsOrigin = origin;
    ui.pause.classList.add("is-hidden");
    ui.settings.classList.remove("is-hidden");
    renderControlsReference();
    requestAnimationFrame(() => $(".control-option.active").focus());
  }

  function closeSettings() {
    ui.settings.classList.add("is-hidden");
    syncModalInert();
    if (state.settingsOrigin === "pause") {
      ui.pause.classList.remove("is-hidden");
      state.scene = "paused";
      ui.resume.focus();
    } else {
      state.scene = state.settingsOrigin === "menu" ? "menu" : "playing";
      if (state.scene === "menu") ui.settingsButton.focus();
    }
  }

  function openPause() {
    if (state.scene !== "playing") return;
    clearInput();
    state.scene = "paused";
    ui.pause.classList.remove("is-hidden");
    requestAnimationFrame(() => ui.resume.focus());
  }

  function resumeGame() {
    ui.pause.classList.add("is-hidden");
    syncModalInert();
    state.scene = "playing";
    clearInput();
  }

  function gameOver() {
    if (state.scene === "gameover") return;
    clearInput();
    state.scene = "gameover";
    const seconds = Math.max(0, Math.floor((performance.now() - state.runStartedAt) / 1000));
    ui.reachedFloor.textContent = state.floor === 0 ? "the training field" : `Floor ${state.floor}`;
    ui.killStat.textContent = String(state.kills);
    ui.timeStat.textContent = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
    ui.gameOver.classList.remove("is-hidden");
    requestAnimationFrame(() => ui.retry.focus());
  }

  function setControlMode(mode) {
    if (!tutorials[mode]) return;
    state.controlMode = mode;
    savePreference("controlMode", mode);
    clearInput();
    applyControlMode();
    renderControlsReference();
    if (!ui.tutorial.classList.contains("is-hidden")) renderTutorial();
  }

  function applyControlMode() {
    document.body.classList.toggle("mobile-mode", state.controlMode === "mobile");
    $$(".control-option").forEach((button) => {
      const active = button.dataset.mode === state.controlMode;
      button.classList.toggle("active", active);
      button.setAttribute("aria-checked", String(active));
    });
    ui.mobileControls.classList.toggle("is-hidden", state.controlMode !== "mobile" || ui.game.classList.contains("is-hidden"));
  }

  function renderControlsReference() {
    const desktop = [["Move", "WASD / Arrows"], ["Strike", "Space / Click"], ["Guard", "Shift / Right click"], ["Cast spells", "1 / 2 / 3"], ["Pause", "Escape"]];
    const mobile = [["Move", "Joystick"], ["Strike", "Strike button"], ["Guard", "Hold Guard"], ["Choose spell", "Spell slots"], ["Cast again", "Spell button"]];
    const controls = state.controlMode === "desktop" ? desktop : mobile;
    ui.controlsSubtitle.textContent = state.controlMode === "desktop" ? "Keyboard & mouse" : "Touch controls";
    ui.controlsGrid.innerHTML = controls.map(([action, control]) => `<div class="control-item"><span>${action}</span><b>${control}</b></div>`).join("");
  }

  function clearInput() {
    input.keys.clear();
    Object.assign(input, { joystickX: 0, joystickY: 0, joystickPointer: null, mobileBlocking: false, mouseBlocking: false });
    player.blocking = false;
    ui.joystickKnob.style.transform = "translate(-50%, -50%)";
    $$(".touch-button").forEach((button) => button.classList.remove("is-pressed"));
  }

  function moveVector() {
    let x = input.joystickX;
    let y = input.joystickY;
    if (input.keys.has("KeyA") || input.keys.has("ArrowLeft")) x -= 1;
    if (input.keys.has("KeyD") || input.keys.has("ArrowRight")) x += 1;
    if (input.keys.has("KeyW") || input.keys.has("ArrowUp")) y -= 1;
    if (input.keys.has("KeyS") || input.keys.has("ArrowDown")) y += 1;
    const length = Math.hypot(x, y);
    return length > 1 ? { x: x / length, y: y / length } : { x, y };
  }

  function update(dt) {
    if (state.scene !== "playing") return;
    world.elapsed += dt;
    updatePlayer(dt);
    updateEnemies(dt);
    updateProjectiles(dt);
    updatePickups(dt);
    updateEffects(dt);
    if (!world.bossSpawned && world.enemies.every((enemy) => enemy.dead)) createBoss();
    world.enemies = world.enemies.filter((enemy) => !enemy.dead || enemy.deathTimer > 0);
    world.projectiles = world.projectiles.filter((projectile) => projectile.life > 0);
    world.particles = world.particles.filter((particle) => particle.life > 0);
    world.floaters = world.floaters.filter((floater) => floater.life > 0);
    world.pickups = world.pickups.filter((pickup) => pickup.life > 0);
    updateObjective();
    updateHud();
    state.shakeAmount = Math.max(0, state.shakeAmount - 34 * state.unit * dt);
  }

  function updatePlayer(dt) {
    player.attackCooldown = Math.max(0, player.attackCooldown - dt);
    player.attackAnim = Math.max(0, player.attackAnim - dt);
    player.invulnerable = Math.max(0, player.invulnerable - dt);
    player.hurtFlash = Math.max(0, player.hurtFlash - dt);
    player.guardBroken = Math.max(0, player.guardBroken - dt);
    player.mana = Math.min(player.maxMana, player.mana + 11 * dt);
    player.spellCooldowns = player.spellCooldowns.map((cooldown) => Math.max(0, cooldown - dt));
    const wantsBlock = (input.keys.has("ShiftLeft") || input.keys.has("ShiftRight") || input.mobileBlocking || input.mouseBlocking) && player.guardBroken <= 0;
    player.blocking = wantsBlock && player.stamina > 0;
    if (player.blocking && !player.wasBlocking) player.blockStartedAt = performance.now();
    if (player.blocking) {
      player.stamina = Math.max(0, player.stamina - 28 * dt);
      if (player.stamina <= 0) {
        player.blocking = false;
        player.guardBroken = 1.25;
        showFloater(player.x, player.y - 28 * state.unit, "GUARD BROKEN", "#e36b6b");
      }
    } else player.stamina = Math.min(player.maxStamina, player.stamina + 24 * dt);
    player.wasBlocking = player.blocking;
    const movement = moveVector();
    if (movement.x || movement.y) {
      player.facingX = movement.x;
      player.facingY = movement.y;
      const speed = player.speed * state.unit * (player.blocking ? 0.5 : 1);
      moveEntity(player, movement.x * speed * dt, movement.y * speed * dt, player.radius * state.unit);
      player.walkCycle += dt * 11;
    }
    if (world.stairs && distance(player, world.stairs) < 30 * state.unit) descendFloor();
  }

  function updateEnemies(dt) {
    [...world.enemies, ...(world.boss ? [world.boss] : [])].forEach((enemy) => {
      enemy.flash = Math.max(0, enemy.flash - dt);
      enemy.slow = Math.max(0, enemy.slow - dt);
      enemy.stunned = Math.max(0, enemy.stunned - dt);
      enemy.hurtVisible = Math.max(0, enemy.hurtVisible - dt);
      enemy.attackCooldown = Math.max(0, enemy.attackCooldown - dt);
      if (enemy.specialCooldown !== undefined) enemy.specialCooldown = Math.max(0, enemy.specialCooldown - dt);
      if (enemy.dead) { enemy.deathTimer -= dt; return; }
      if (enemy.knockX || enemy.knockY) {
        moveEntity(enemy, enemy.knockX * dt, enemy.knockY * dt, enemy.radius);
        enemy.knockX *= Math.pow(0.015, dt);
        enemy.knockY *= Math.pow(0.015, dt);
        if (Math.hypot(enemy.knockX, enemy.knockY) < 2) enemy.knockX = enemy.knockY = 0;
      }
      if (enemy.stunned > 0) return;
      if (enemy.telegraph > 0) {
        enemy.telegraph -= dt;
        if (enemy.telegraph <= 0) resolveEnemyAttack(enemy);
        return;
      }
      const dx = player.x - enemy.x;
      const dy = player.y - enemy.y;
      const dist = Math.max(0.001, Math.hypot(dx, dy));
      const nx = dx / dist;
      const ny = dy / dist;
      enemy.attackAngle = Math.atan2(dy, dx);
      const slowFactor = enemy.slow > 0 ? 0.48 : 1;
      if (enemy.isBoss) updateBoss(enemy, dt, dist, nx, ny, slowFactor);
      else if (enemy.type === "wisp") {
        if (dist < 120 * state.unit) moveEntity(enemy, -nx * enemy.speed * dt * slowFactor, -ny * enemy.speed * dt * slowFactor, enemy.radius);
        else if (dist > 210 * state.unit) moveEntity(enemy, nx * enemy.speed * dt * slowFactor, ny * enemy.speed * dt * slowFactor, enemy.radius);
        if (enemy.attackCooldown <= 0 && dist < 270 * state.unit) beginEnemyAttack(enemy, "shot", 0.62);
      } else {
        if (dist > enemy.range) { moveEntity(enemy, nx * enemy.speed * dt * slowFactor, ny * enemy.speed * dt * slowFactor, enemy.radius); enemy.walk += dt * 8; }
        else if (enemy.attackCooldown <= 0) beginEnemyAttack(enemy, "melee", enemy.type === "slime" ? 0.48 : 0.38);
      }
    });
  }

  function updateBoss(boss, dt, dist, nx, ny, slowFactor) {
    if (boss.specialCooldown <= 0) {
      beginEnemyAttack(boss, "burst", 0.92);
      boss.specialCooldown = Math.max(2.7, 5.2 - Math.min(state.floor, 25) * 0.05);
    } else if (dist > boss.range) {
      moveEntity(boss, nx * boss.speed * dt * slowFactor, ny * boss.speed * dt * slowFactor, boss.radius);
      boss.walk += dt * 5;
    } else if (boss.attackCooldown <= 0) beginEnemyAttack(boss, "slam", 0.66);
  }

  function beginEnemyAttack(enemy, kind, duration) {
    enemy.attackKind = kind;
    enemy.telegraph = duration;
    enemy.telegraphMax = duration;
    enemy.attackAngle = Math.atan2(player.y - enemy.y, player.x - enemy.x);
  }

  function resolveEnemyAttack(enemy) {
    enemy.attackCooldown = enemy.baseCooldown * (0.9 + world.rng() * 0.28);
    const unit = state.unit;
    if (enemy.attackKind === "shot") {
      spawnProjectile(enemy.x, enemy.y, Math.cos(enemy.attackAngle), Math.sin(enemy.attackAngle), { friendly: false, damage: enemy.damage, speed: 190 * unit, radius: 6 * unit, color: "#79d6e5", life: 3.1, type: "enemy" });
      burst(enemy.x, enemy.y, "#79d6e5", 6, 50 * unit);
      return;
    }
    if (enemy.attackKind === "burst") {
      const count = enemy.isBoss ? 10 : 7;
      for (let index = 0; index < count; index += 1) {
        const angle = (Math.PI * 2 * index) / count + world.elapsed * 0.35;
        spawnProjectile(enemy.x, enemy.y, Math.cos(angle), Math.sin(angle), { friendly: false, damage: Math.round(enemy.damage * 0.72), speed: 155 * unit, radius: 7 * unit, color: enemy.variant === "moss" ? "#a5c96c" : "#d76161", life: 3.6, type: "enemy" });
      }
      state.shakeAmount = state.screenShake ? 7 * unit : 0;
      burst(enemy.x, enemy.y, enemy.variant === "moss" ? "#a5c96c" : "#d76161", 15, 105 * unit);
      return;
    }
    const range = enemy.attackKind === "slam" ? enemy.range + 25 * unit : enemy.range + 14 * unit;
    if (distance(enemy, player) <= range + player.radius * unit) damagePlayer(enemy.damage, enemy);
    state.shakeAmount = state.screenShake ? (enemy.isBoss ? 10 : 4) * unit : 0;
    burst(enemy.x + Math.cos(enemy.attackAngle) * enemy.radius, enemy.y + Math.sin(enemy.attackAngle) * enemy.radius, "#d76b62", enemy.isBoss ? 13 : 6, 85 * unit);
  }

  function updateProjectiles(dt) {
    world.projectiles.forEach((projectile) => {
      if (projectile.life <= 0) return;
      projectile.life -= dt;
      projectile.x += projectile.vx * dt;
      projectile.y += projectile.vy * dt;
      projectile.pulse += dt * 8;
      if (projectile.x < -30 || projectile.x > world.width + 30 || projectile.y < -30 || projectile.y > world.height + 30 || collidesWithObstacle(projectile.x, projectile.y, projectile.radius)) {
        projectile.life = 0;
        burst(projectile.x, projectile.y, projectile.color, 4, 40 * state.unit);
        return;
      }
      if (projectile.friendly) {
        for (const enemy of [...world.enemies, ...(world.boss && !world.boss.dead ? [world.boss] : [])]) {
          if (enemy.dead || projectile.hit.has(enemy)) continue;
          if (distance(projectile, enemy) <= projectile.radius + enemy.radius) {
            projectile.hit.add(enemy);
            damageEnemy(enemy, projectile.damage, projectile.vx, projectile.vy, projectile.type);
            if (projectile.type === "frost") enemy.slow = Math.max(enemy.slow, 2.3);
            projectile.pierce -= 1;
            if (projectile.pierce < 0) { projectile.life = 0; burst(projectile.x, projectile.y, projectile.color, 8, 70 * state.unit); break; }
          }
        }
      } else if (distance(projectile, player) <= projectile.radius + player.radius * state.unit) {
        projectile.life = 0;
        damagePlayer(projectile.damage, projectile);
        burst(projectile.x, projectile.y, projectile.color, 7, 70 * state.unit);
      }
    });
  }

  function updatePickups(dt) {
    world.pickups.forEach((pickup) => {
      pickup.life -= dt;
      pickup.phase += dt * 4;
      if (distance(player, pickup) < 25 * state.unit) {
        if (pickup.type === "health") { player.hp = Math.min(player.maxHp, player.hp + 18); showFloater(pickup.x, pickup.y - 12, "+18 HP", "#79c979"); }
        else { player.mana = Math.min(player.maxMana, player.mana + 27); showFloater(pickup.x, pickup.y - 12, "+27 MANA", "#67c8e3"); }
        pickup.life = 0;
        burst(pickup.x, pickup.y, pickup.type === "health" ? "#79c979" : "#67c8e3", 8, 65 * state.unit);
      }
    });
  }

  function updateEffects(dt) {
    world.particles.forEach((particle) => { particle.life -= dt; particle.x += particle.vx * dt; particle.y += particle.vy * dt; particle.vx *= Math.pow(0.06, dt); particle.vy *= Math.pow(0.06, dt); });
    world.floaters.forEach((floater) => { floater.life -= dt; floater.y -= 25 * state.unit * dt; });
  }

  function moveEntity(entity, dx, dy, radius) {
    const margin = 20 * state.unit;
    const nextX = clamp(entity.x + dx, margin + radius, world.width - margin - radius);
    if (!collidesWithObstacle(nextX, entity.y, radius)) entity.x = nextX;
    const nextY = clamp(entity.y + dy, margin + radius, world.height - margin - radius);
    if (!collidesWithObstacle(entity.x, nextY, radius)) entity.y = nextY;
  }

  function collidesWithObstacle(x, y, radius) {
    return world.obstacles.some((rect) => circleIntersectsRect(x, y, radius, rect));
  }

  function requestAttack() {
    if (state.scene !== "playing" || player.attackCooldown > 0 || player.blocking) return;
    player.attackCooldown = 0.34;
    player.attackAnim = 0.2;
    const unit = state.unit;
    [...world.enemies, ...(world.boss && !world.boss.dead ? [world.boss] : [])].forEach((enemy) => {
      if (enemy.dead) return;
      const dx = enemy.x - player.x;
      const dy = enemy.y - player.y;
      const dist = Math.hypot(dx, dy);
      const facingDot = dist ? (dx / dist) * player.facingX + (dy / dist) * player.facingY : 1;
      if (dist <= 58 * unit + enemy.radius && facingDot > -0.08) damageEnemy(enemy, Math.round(24 * player.power), player.facingX * 155 * unit, player.facingY * 155 * unit, "melee");
    });
    burst(player.x + player.facingX * 32 * unit, player.y + player.facingY * 32 * unit, "#f2dca4", 4, 62 * unit);
  }

  function castSpell(index = state.selectedSpell) {
    if (state.scene !== "playing" || player.blocking) return;
    const spell = SPELLS[index];
    state.selectedSpell = index;
    updateSpellSelection();
    if (player.spellCooldowns[index] > 0) { showToast(`${spell.name.toUpperCase()} IS RECHARGING`); return; }
    if (player.mana < spell.cost) { showToast("NOT ENOUGH MANA"); return; }
    player.mana -= spell.cost;
    player.spellCooldowns[index] = spell.cooldown;
    const unit = state.unit;
    if (spell.id === "ember") {
      spawnProjectile(player.x + player.facingX * 18 * unit, player.y + player.facingY * 18 * unit, player.facingX, player.facingY, { friendly: true, damage: Math.round(34 * player.power), speed: 345 * unit, radius: 7 * unit, color: spell.color, life: 2.2, type: "ember", pierce: 0 });
      burst(player.x, player.y, spell.color, 8, 75 * unit);
    } else if (spell.id === "frost") {
      spawnProjectile(player.x + player.facingX * 18 * unit, player.y + player.facingY * 18 * unit, player.facingX, player.facingY, { friendly: true, damage: Math.round(23 * player.power), speed: 275 * unit, radius: 10 * unit, color: spell.color, life: 2.7, type: "frost", pierce: 2 });
      burst(player.x, player.y, spell.color, 10, 70 * unit);
    } else {
      const range = 112 * unit;
      [...world.enemies, ...(world.boss && !world.boss.dead ? [world.boss] : [])].forEach((enemy) => {
        if (!enemy.dead && distance(player, enemy) <= range + enemy.radius) {
          const dx = enemy.x - player.x;
          const dy = enemy.y - player.y;
          const length = Math.max(1, Math.hypot(dx, dy));
          damageEnemy(enemy, Math.round(38 * player.power), (dx / length) * 210 * unit, (dy / length) * 210 * unit, "nova");
        }
      });
      for (let particle = 0; particle < 28; particle += 1) {
        const angle = (Math.PI * 2 * particle) / 28;
        addParticle(player.x + Math.cos(angle) * 20 * unit, player.y + Math.sin(angle) * 20 * unit, Math.cos(angle) * 190 * unit, Math.sin(angle) * 190 * unit, spell.color, 0.55, 4 * unit);
      }
      state.shakeAmount = state.screenShake ? 7 * unit : 0;
    }
    updateHud();
  }

  function spawnProjectile(x, y, dx, dy, options) {
    const length = Math.max(0.001, Math.hypot(dx, dy));
    world.projectiles.push({ x, y, vx: (dx / length) * options.speed, vy: (dy / length) * options.speed, friendly: options.friendly, damage: options.damage, radius: options.radius, color: options.color, life: options.life, type: options.type, pierce: options.pierce ?? 0, hit: new Set(), pulse: 0 });
  }

  function damageEnemy(enemy, amount, forceX = 0, forceY = 0, source = "melee") {
    if (enemy.dead) return;
    enemy.hp = Math.max(0, enemy.hp - amount);
    enemy.flash = 0.12;
    enemy.hurtVisible = 1.4;
    const knockScale = enemy.isBoss ? 0.22 : 1;
    enemy.knockX += forceX * knockScale;
    enemy.knockY += forceY * knockScale;
    showFloater(enemy.x, enemy.y - enemy.radius, String(amount), source === "frost" ? "#9ce8f4" : source === "nova" ? "#d7a3ff" : "#ffe2a0");
    burst(enemy.x, enemy.y, enemy.isBoss ? "#cf5363" : "#d8c8a3", enemy.isBoss ? 9 : 5, 68 * state.unit);
    state.shakeAmount = state.screenShake ? (enemy.isBoss ? 4 : 2) * state.unit : 0;
    if (enemy.hp <= 0) killEnemy(enemy);
  }

  function killEnemy(enemy) {
    if (enemy.dead) return;
    enemy.dead = true;
    enemy.deathTimer = enemy.isBoss ? 0.9 : 0.32;
    state.kills += 1;
    burst(enemy.x, enemy.y, enemy.isBoss ? "#e15f71" : "#b8a88a", enemy.isBoss ? 36 : 14, (enemy.isBoss ? 190 : 105) * state.unit);
    if (enemy.isBoss) {
      world.projectiles = world.projectiles.filter((projectile) => projectile.friendly);
      world.floorCleared = true;
      const stairPosition = findClearPoint(world.width * 0.5, Math.max(68 * state.unit, world.height * 0.14), 30 * state.unit);
      world.stairs = { x: stairPosition.x, y: stairPosition.y, phase: 0 };
      ui.bossHud.classList.add("is-hidden");
      player.hp = Math.min(player.maxHp, player.hp + 28);
      player.mana = player.maxMana;
      state.shakeAmount = state.screenShake ? 15 * state.unit : 0;
      showToast("GUARDIAN DEFEATED · FIND THE STAIRS");
      updateObjective();
    } else if (world.rng() < 0.24) world.pickups.push({ x: enemy.x, y: enemy.y, type: world.rng() < 0.48 ? "health" : "mana", life: 12, phase: 0 });
  }

  function damagePlayer(amount, attacker) {
    if (state.scene !== "playing" || player.invulnerable > 0) return;
    let finalDamage = amount;
    if (player.blocking) {
      const perfect = performance.now() - player.blockStartedAt < 260;
      if (perfect) {
        finalDamage = 0;
        player.stamina = Math.min(player.maxStamina, player.stamina + 18);
        showFloater(player.x, player.y - 31 * state.unit, "PERFECT", "#ffe2a0");
        if (attacker && attacker.stunned !== undefined) attacker.stunned = 0.9;
        burst(player.x, player.y, "#ffe2a0", 12, 95 * state.unit);
      } else {
        finalDamage = Math.max(1, Math.round(amount * 0.24));
        player.stamina = Math.max(0, player.stamina - 15);
        showFloater(player.x, player.y - 30 * state.unit, "BLOCK", "#b9c9d8");
      }
    }
    if (finalDamage > 0) {
      player.hp = Math.max(0, player.hp - finalDamage);
      player.hurtFlash = 0.18;
      showFloater(player.x, player.y - 31 * state.unit, `-${finalDamage}`, "#ff7777");
      state.shakeAmount = state.screenShake ? 9 * state.unit : 0;
    }
    player.invulnerable = finalDamage > 0 ? 0.55 : 0.22;
    updateHud();
    if (player.hp <= 0) gameOver();
  }

  function descendFloor() {
    if (state.scene !== "playing" || !world.floorCleared) return;
    clearInput();
    state.scene = "transition";
    const nextFloor = state.floor + 1;
    ui.transitionFloor.textContent = `FLOOR ${nextFloor}`;
    ui.transitionName.textContent = floorName(nextFloor);
    ui.floorTransition.classList.remove("is-hidden");
    clearTimeout(state.transitionTimer);
    state.transitionTimer = setTimeout(() => {
      state.floor = Number.isSafeInteger(nextFloor) ? nextFloor : state.floor;
      player.maxHp = Math.min(220, player.maxHp + 3);
      player.hp = Math.min(player.maxHp, player.hp + 34);
      player.maxMana = Math.min(140, player.maxMana + 1);
      player.mana = player.maxMana;
      player.power = 1 + state.floor * 0.045;
      generateFloor(state.floor);
      ui.floorTransition.classList.add("is-hidden");
      state.scene = "playing";
      showToast(`FLOOR ${state.floor} · ${world.name}`);
    }, 1750);
  }

  function addParticle(x, y, vx, vy, color, life, size) { world.particles.push({ x, y, vx, vy, color, life, maxLife: life, size }); }
  function burst(x, y, color, count, speed) {
    for (let index = 0; index < count; index += 1) {
      const angle = Math.random() * Math.PI * 2;
      const force = speed * (0.25 + Math.random() * 0.75);
      addParticle(x, y, Math.cos(angle) * force, Math.sin(angle) * force, color, 0.3 + Math.random() * 0.45, (2 + Math.random() * 3) * state.unit);
    }
  }
  function showFloater(x, y, text, color) { world.floaters.push({ x, y, text, color, life: 0.85, maxLife: 0.85 }); }
  function showToast(message) {
    clearTimeout(state.toastTimer);
    ui.toast.textContent = message;
    ui.toast.classList.remove("is-hidden");
    state.toastTimer = setTimeout(() => ui.toast.classList.add("is-hidden"), 1450);
  }

  function updateHud() {
    ui.healthFill.style.width = `${clamp((player.hp / player.maxHp) * 100, 0, 100)}%`;
    ui.healthText.textContent = `${Math.ceil(player.hp)} / ${player.maxHp}`;
    ui.manaFill.style.width = `${clamp((player.mana / player.maxMana) * 100, 0, 100)}%`;
    ui.manaText.textContent = `${Math.floor(player.mana)} / ${player.maxMana}`;
    ui.enemyCount.textContent = String(world.enemies.filter((enemy) => !enemy.dead).length + (world.boss && !world.boss.dead ? 1 : 0));
    if (world.boss && !world.boss.dead) ui.bossFill.style.width = `${clamp((world.boss.hp / world.boss.maxHp) * 100, 0, 100)}%`;
    $$(".spell-slot").forEach((slot, index) => {
      const ratio = clamp(player.spellCooldowns[index] / SPELLS[index].cooldown, 0, 1);
      slot.querySelector(".cooldown-mask").style.top = `${(1 - ratio) * 100}%`;
      slot.classList.toggle("selected", index === state.selectedSpell);
    });
  }

  function updateSpellSelection() {
    $$(".spell-slot").forEach((slot, index) => slot.classList.toggle("selected", index === state.selectedSpell));
    const spell = SPELLS[state.selectedSpell];
    ui.mobileSpell.querySelector("span").textContent = spell.id === "ember" ? "●" : spell.id === "frost" ? "✦" : "✺";
    ui.mobileSpell.style.color = spell.color;
  }

  function render(time) {
    if (ui.game.classList.contains("is-hidden")) return;
    const shake = state.screenShake ? state.shakeAmount : 0;
    ctx.save();
    ctx.translate(Math.round((Math.random() - 0.5) * shake), Math.round((Math.random() - 0.5) * shake));
    drawBackground(time);
    drawStairs(time);
    drawObstacles();
    drawPickups();
    [...world.enemies, ...(world.boss ? [world.boss] : []), player].sort((a, b) => a.y - b.y).forEach((actor) => actor === player ? drawPlayer(time) : drawEnemy(actor, time));
    drawProjectiles();
    drawParticles();
    drawFloaters();
    drawLighting(time);
    ctx.restore();
  }

  function drawBackground(time) {
    const { width: w, height: h } = world;
    const unit = state.unit;
    const tile = Math.max(18, Math.round(32 * unit));
    const palettes = { grass: ["#2c4829", "#294225", "#35532e"], stone: ["#222832", "#252c36", "#1e242d"], ember: ["#292426", "#30272a", "#231f23"], crypt: ["#262534", "#2b293b", "#211f2d"] };
    const palette = palettes[world.theme];
    ctx.fillStyle = palette[0];
    ctx.fillRect(-20, -20, w + 40, h + 40);
    for (let y = 0, row = 0; y < h; y += tile, row += 1) {
      for (let x = 0, column = 0; x < w; x += tile, column += 1) {
        const value = (column * 17 + row * 31 + state.floor * 13) % 11;
        ctx.fillStyle = value < 5 ? palette[0] : value < 9 ? palette[1] : palette[2];
        ctx.fillRect(x, y, tile - 1, tile - 1);
        if (world.theme === "grass" && value === 1) {
          ctx.fillStyle = row % 3 ? "#6f9550" : "#d0b65b";
          ctx.fillRect(x + tile * 0.27, y + tile * 0.58, Math.max(2, 2 * unit), Math.max(2, 7 * unit));
          ctx.fillRect(x + tile * 0.18, y + tile * 0.7, Math.max(3, 6 * unit), Math.max(2, 2 * unit));
        } else if (world.theme !== "grass" && value === 2) {
          ctx.strokeStyle = world.theme === "ember" ? "#4a3030" : "#353d49";
          ctx.lineWidth = Math.max(1, unit);
          ctx.beginPath(); ctx.moveTo(x + tile * 0.22, y + tile * 0.2); ctx.lineTo(x + tile * 0.55, y + tile * 0.42); ctx.lineTo(x + tile * 0.39, y + tile * 0.69); ctx.stroke();
        }
      }
    }
    if (world.theme === "grass") {
      const pathWidth = 102 * unit;
      ctx.fillStyle = "#8d805e";
      ctx.fillRect(w / 2 - pathWidth / 2, 0, pathWidth, h);
      ctx.fillStyle = "#aa9a6e";
      for (let y = -20; y < h; y += 42 * unit) {
        const offset = Math.sin(y * 0.08) * 12 * unit;
        ctx.fillRect(w / 2 - 34 * unit + offset, y, 31 * unit, 8 * unit);
        ctx.fillRect(w / 2 + 8 * unit - offset, y + 17 * unit, 25 * unit, 8 * unit);
      }
    }
    const border = Math.max(12, 20 * unit);
    ctx.fillStyle = world.theme === "grass" ? "#182d1c" : "#11151b";
    ctx.fillRect(0, 0, w, border); ctx.fillRect(0, h - border, w, border); ctx.fillRect(0, 0, border, h); ctx.fillRect(w - border, 0, border, h);
    ctx.fillStyle = world.theme === "grass" ? "#3e5d35" : "#343c47";
    ctx.fillRect(0, border, w, Math.max(2, 3 * unit)); ctx.fillRect(0, h - border - 3 * unit, w, Math.max(2, 3 * unit));
    world.torches.forEach((torch) => drawTorch(torch, time));
  }

  function drawTorch(torch, time) {
    const unit = state.unit;
    const flicker = Math.sin(time * 0.012 + torch.phase) * 2 * unit;
    const glow = ctx.createRadialGradient(torch.x, torch.y, 2, torch.x, torch.y, 70 * unit * torch.size);
    glow.addColorStop(0, "rgba(246,168,75,.22)"); glow.addColorStop(1, "rgba(246,168,75,0)");
    ctx.fillStyle = glow; ctx.fillRect(torch.x - 80 * unit, torch.y - 80 * unit, 160 * unit, 160 * unit);
    ctx.fillStyle = "#5b4533"; ctx.fillRect(torch.x - 3 * unit, torch.y, 6 * unit, 18 * unit);
    ctx.fillStyle = "#f6bf62"; ctx.fillRect(torch.x - 4 * unit, torch.y - 10 * unit + flicker, 8 * unit, 11 * unit);
    ctx.fillStyle = "#fff0a4"; ctx.fillRect(torch.x - 2 * unit, torch.y - 7 * unit + flicker, 4 * unit, 6 * unit);
  }

  function drawObstacles() {
    const unit = state.unit;
    world.obstacles.forEach((obstacle) => {
      if (obstacle.kind === "tree") {
        ctx.fillStyle = "rgba(0,0,0,.25)"; ctx.fillRect(obstacle.x - 5 * unit, obstacle.y + obstacle.h - 6 * unit, obstacle.w + 12 * unit, 13 * unit);
        ctx.fillStyle = "#554331"; ctx.fillRect(obstacle.x + obstacle.w * 0.39, obstacle.y + obstacle.h * 0.53, obstacle.w * 0.23, obstacle.h * 0.47);
        ctx.fillStyle = "#1b3422"; ctx.fillRect(obstacle.x, obstacle.y + obstacle.h * 0.18, obstacle.w, obstacle.h * 0.55);
        ctx.fillStyle = "#355a32"; ctx.fillRect(obstacle.x + 5 * unit, obstacle.y, obstacle.w - 10 * unit, obstacle.h * 0.52);
      } else if (obstacle.kind === "rock") {
        ctx.fillStyle = "rgba(0,0,0,.28)"; ctx.fillRect(obstacle.x - 4 * unit, obstacle.y + obstacle.h - 3 * unit, obstacle.w + 9 * unit, 8 * unit);
        ctx.fillStyle = "#62665c"; ctx.fillRect(obstacle.x, obstacle.y + 7 * unit, obstacle.w, obstacle.h - 7 * unit);
        ctx.fillStyle = "#85877a"; ctx.fillRect(obstacle.x + 6 * unit, obstacle.y, obstacle.w * 0.58, 10 * unit);
      } else {
        ctx.fillStyle = "rgba(0,0,0,.34)"; ctx.fillRect(obstacle.x + 6 * unit, obstacle.y + 8 * unit, obstacle.w, obstacle.h);
        ctx.fillStyle = obstacle.kind === "pillar" ? "#343b47" : "#303742"; ctx.fillRect(obstacle.x, obstacle.y, obstacle.w, obstacle.h);
        ctx.fillStyle = "#4a5260"; ctx.fillRect(obstacle.x, obstacle.y, obstacle.w, Math.max(4, 7 * unit));
        ctx.fillStyle = "#1b2028"; ctx.fillRect(obstacle.x + obstacle.w - 6 * unit, obstacle.y + 7 * unit, 6 * unit, obstacle.h - 7 * unit);
        if (obstacle.kind === "pillar") { ctx.fillStyle = "#59616d"; ctx.fillRect(obstacle.x - 4 * unit, obstacle.y, obstacle.w + 8 * unit, 8 * unit); ctx.fillRect(obstacle.x - 5 * unit, obstacle.y + obstacle.h - 8 * unit, obstacle.w + 10 * unit, 8 * unit); }
      }
    });
  }

  function drawStairs(time) {
    if (!world.stairs) return;
    const unit = state.unit;
    const { x, y } = world.stairs;
    const pulse = 0.72 + Math.sin(time * 0.006) * 0.18;
    const glow = ctx.createRadialGradient(x, y, 4, x, y, 64 * unit);
    glow.addColorStop(0, `rgba(243,196,103,${0.3 * pulse})`); glow.addColorStop(1, "rgba(243,196,103,0)");
    ctx.fillStyle = glow; ctx.fillRect(x - 70 * unit, y - 55 * unit, 140 * unit, 110 * unit);
    ctx.fillStyle = "#171a20"; ctx.fillRect(x - 29 * unit, y - 18 * unit, 58 * unit, 38 * unit);
    for (let index = 0; index < 4; index += 1) { ctx.fillStyle = index % 2 ? "#6e6046" : "#8e7953"; ctx.fillRect(x - (26 - index * 5) * unit, y - (13 - index * 8) * unit, (52 - index * 10) * unit, 7 * unit); }
    ctx.fillStyle = "#f4ca71"; ctx.font = `bold ${Math.max(10, 12 * unit)}px monospace`; ctx.textAlign = "center"; ctx.fillText("DESCEND", x, y + 39 * unit);
  }

  function drawPlayer(time) {
    const unit = state.unit;
    const moving = Math.abs(moveVector().x) + Math.abs(moveVector().y) > 0;
    const bob = moving ? Math.sin(player.walkCycle) * 2 * unit : Math.sin(time * 0.003) * 0.7 * unit;
    const angle = Math.atan2(player.facingY, player.facingX);
    ctx.save(); ctx.translate(Math.round(player.x), Math.round(player.y + bob));
    ctx.globalAlpha = player.invulnerable > 0 && Math.floor(player.invulnerable * 18) % 2 ? 0.45 : 1;
    ctx.fillStyle = "rgba(0,0,0,.32)"; ctx.fillRect(-16 * unit, 15 * unit, 32 * unit, 8 * unit);
    ctx.rotate(angle + Math.PI / 2);
    if (player.blocking) { ctx.strokeStyle = performance.now() - player.blockStartedAt < 260 ? "#ffe2a0" : "#aebdca"; ctx.lineWidth = 4 * unit; ctx.beginPath(); ctx.arc(0, -8 * unit, 25 * unit, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke(); }
    if (player.attackAnim > 0) { const progress = 1 - player.attackAnim / 0.2; ctx.strokeStyle = "#ffe1a0"; ctx.lineWidth = 5 * unit; ctx.beginPath(); ctx.arc(0, 0, 42 * unit, Math.PI * (1.05 + progress * 0.65), Math.PI * (1.35 + progress * 0.85)); ctx.stroke(); }
    ctx.fillStyle = player.hurtFlash > 0 ? "#fff4df" : "#2e3847"; ctx.fillRect(-11 * unit, -8 * unit, 22 * unit, 28 * unit);
    ctx.fillStyle = "#bd4a48"; ctx.fillRect(-14 * unit, -11 * unit, 6 * unit, 28 * unit);
    ctx.fillStyle = "#e0d1b4"; ctx.fillRect(-8 * unit, -23 * unit, 16 * unit, 15 * unit);
    ctx.fillStyle = "#4b372d"; ctx.fillRect(-9 * unit, -25 * unit, 18 * unit, 6 * unit);
    ctx.fillStyle = "#181d26"; ctx.fillRect(-7 * unit, 18 * unit, 6 * unit, 8 * unit); ctx.fillRect(3 * unit, 18 * unit, 6 * unit, 8 * unit);
    ctx.fillStyle = "#e5b85c"; ctx.fillRect(10 * unit, -1 * unit, 18 * unit, 4 * unit); ctx.fillRect(25 * unit, -4 * unit, 4 * unit, 10 * unit);
    ctx.restore();
    if (player.blocking || player.stamina < player.maxStamina - 1) drawMiniBar(player.x, player.y + 31 * unit, 40 * unit, player.stamina / player.maxStamina, player.guardBroken > 0 ? "#b34848" : "#d2bd78");
  }

  function drawEnemy(enemy, time) {
    if (enemy.dead && enemy.deathTimer <= 0) return;
    const unit = state.unit;
    const deathScale = enemy.dead ? clamp(enemy.deathTimer / (enemy.isBoss ? 0.9 : 0.32), 0, 1) : 1;
    ctx.save(); ctx.translate(Math.round(enemy.x), Math.round(enemy.y + Math.sin(time * 0.004 + enemy.walk) * 2 * unit)); ctx.scale(deathScale, deathScale); ctx.globalAlpha = enemy.dead ? deathScale : 1;
    if (enemy.telegraph > 0) { const progress = 1 - enemy.telegraph / enemy.telegraphMax; ctx.strokeStyle = `rgba(242,83,78,${0.3 + progress * 0.7})`; ctx.lineWidth = (2 + progress * 3) * unit; ctx.beginPath(); ctx.arc(0, 0, (enemy.attackKind === "burst" ? 58 * unit : enemy.range || 40 * unit) * (1 - progress * 0.18), 0, Math.PI * 2); ctx.stroke(); }
    ctx.fillStyle = "rgba(0,0,0,.3)"; ctx.fillRect(-enemy.radius, enemy.radius * 0.68, enemy.radius * 2, 8 * unit);
    if (enemy.isBoss) drawBossSprite(enemy); else if (enemy.type === "slime") drawSlime(enemy); else if (enemy.type === "skeleton") drawSkeleton(enemy); else drawWisp(enemy, time);
    ctx.restore();
    if (!enemy.isBoss && enemy.hurtVisible > 0 && !enemy.dead) drawMiniBar(enemy.x, enemy.y - enemy.radius - 14 * unit, 34 * unit, enemy.hp / enemy.maxHp, "#d85a5d");
  }

  function drawSlime(enemy) {
    const unit = state.unit;
    ctx.fillStyle = enemy.flash > 0 ? "#f6f2df" : world.theme === "grass" ? "#7aa658" : "#748e62"; ctx.fillRect(-15 * unit, -8 * unit, 30 * unit, 22 * unit); ctx.fillRect(-11 * unit, -15 * unit, 22 * unit, 9 * unit);
    ctx.fillStyle = "#26312a"; ctx.fillRect(-8 * unit, -5 * unit, 4 * unit, 5 * unit); ctx.fillRect(5 * unit, -5 * unit, 4 * unit, 5 * unit);
    ctx.fillStyle = "#9ec879"; ctx.fillRect(-9 * unit, -11 * unit, 8 * unit, 3 * unit);
  }

  function drawSkeleton(enemy) {
    const unit = state.unit;
    ctx.fillStyle = enemy.flash > 0 ? "#ffffff" : "#d5c9ad"; ctx.fillRect(-10 * unit, -21 * unit, 20 * unit, 18 * unit); ctx.fillRect(-7 * unit, -3 * unit, 14 * unit, 18 * unit); ctx.fillRect(-12 * unit, 13 * unit, 8 * unit, 8 * unit); ctx.fillRect(4 * unit, 13 * unit, 8 * unit, 8 * unit);
    ctx.fillStyle = "#25252a"; ctx.fillRect(-6 * unit, -15 * unit, 4 * unit, 5 * unit); ctx.fillRect(3 * unit, -15 * unit, 4 * unit, 5 * unit);
    ctx.fillStyle = "#7f4050"; ctx.fillRect(-8 * unit, 2 * unit, 16 * unit, 4 * unit);
  }

  function drawWisp(enemy, time) {
    const unit = state.unit;
    const pulse = 1 + Math.sin(time * 0.008 + enemy.walk) * 0.12;
    ctx.scale(pulse, pulse); ctx.fillStyle = enemy.flash > 0 ? "#ffffff" : "rgba(102,204,228,.2)"; ctx.fillRect(-18 * unit, -18 * unit, 36 * unit, 36 * unit);
    ctx.fillStyle = enemy.flash > 0 ? "#ffffff" : "#67cde3"; ctx.beginPath(); ctx.moveTo(0, -18 * unit); ctx.lineTo(13 * unit, 0); ctx.lineTo(0, 18 * unit); ctx.lineTo(-13 * unit, 0); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#e9fbff"; ctx.fillRect(-3 * unit, -5 * unit, 6 * unit, 10 * unit);
  }

  function drawBossSprite(enemy) {
    const unit = state.unit;
    const colors = { moss: ["#597b45", "#9db969", "#342f29"], bone: ["#c7b99c", "#e1d6bb", "#49384a"], cinder: ["#773f3b", "#df714c", "#2e292c"], hollow: ["#485368", "#8797ad", "#232936"], veil: ["#674d78", "#ad79bf", "#282433"] }[enemy.variant];
    ctx.fillStyle = enemy.flash > 0 ? "#ffffff" : colors[0]; ctx.fillRect(-25 * unit, -18 * unit, 50 * unit, 47 * unit); ctx.fillRect(-18 * unit, -36 * unit, 36 * unit, 21 * unit);
    ctx.fillStyle = enemy.flash > 0 ? "#ffffff" : colors[1]; ctx.fillRect(-21 * unit, -31 * unit, 42 * unit, 7 * unit); ctx.fillRect(-30 * unit, -9 * unit, 9 * unit, 27 * unit); ctx.fillRect(21 * unit, -9 * unit, 9 * unit, 27 * unit);
    ctx.fillStyle = colors[2]; ctx.fillRect(-11 * unit, -19 * unit, 7 * unit, 6 * unit); ctx.fillRect(5 * unit, -19 * unit, 7 * unit, 6 * unit);
    ctx.fillStyle = "#f06b5f"; ctx.fillRect(-8 * unit, -18 * unit, 3 * unit, 3 * unit); ctx.fillRect(7 * unit, -18 * unit, 3 * unit, 3 * unit);
  }

  function drawMiniBar(x, y, width, ratio, color) {
    const unit = state.unit;
    const height = Math.max(4, 5 * unit);
    ctx.fillStyle = "#090b0f"; ctx.fillRect(x - width / 2 - 2 * unit, y - 2 * unit, width + 4 * unit, height + 4 * unit);
    ctx.fillStyle = color; ctx.fillRect(x - width / 2, y, width * clamp(ratio, 0, 1), height);
  }

  function drawProjectiles() {
    world.projectiles.forEach((projectile) => {
      if (projectile.life <= 0) return;
      const pulse = 1 + Math.sin(projectile.pulse) * 0.16;
      ctx.fillStyle = `${projectile.color}33`; ctx.fillRect(projectile.x - projectile.radius * 2, projectile.y - projectile.radius * 2, projectile.radius * 4, projectile.radius * 4);
      ctx.fillStyle = projectile.color; ctx.fillRect(projectile.x - projectile.radius * pulse, projectile.y - projectile.radius * pulse, projectile.radius * 2 * pulse, projectile.radius * 2 * pulse);
      ctx.fillStyle = "rgba(255,255,255,.72)"; ctx.fillRect(projectile.x - projectile.radius * 0.35, projectile.y - projectile.radius * 0.35, projectile.radius * 0.7, projectile.radius * 0.7);
    });
  }

  function drawPickups() {
    world.pickups.forEach((pickup) => {
      const unit = state.unit;
      const y = pickup.y + Math.sin(pickup.phase) * 4 * unit;
      const color = pickup.type === "health" ? "#72c871" : "#63c4df";
      ctx.fillStyle = `${color}33`; ctx.fillRect(pickup.x - 13 * unit, y - 13 * unit, 26 * unit, 26 * unit);
      ctx.fillStyle = color; ctx.fillRect(pickup.x - 7 * unit, y - 7 * unit, 14 * unit, 14 * unit);
      ctx.fillStyle = "#f4f0dd";
      if (pickup.type === "health") { ctx.fillRect(pickup.x - 2 * unit, y - 5 * unit, 4 * unit, 10 * unit); ctx.fillRect(pickup.x - 5 * unit, y - 2 * unit, 10 * unit, 4 * unit); }
      else ctx.fillRect(pickup.x - 2 * unit, y - 4 * unit, 4 * unit, 8 * unit);
    });
  }

  function drawParticles() {
    world.particles.forEach((particle) => { ctx.globalAlpha = clamp(particle.life / particle.maxLife, 0, 1); ctx.fillStyle = particle.color; ctx.fillRect(particle.x - particle.size / 2, particle.y - particle.size / 2, particle.size, particle.size); });
    ctx.globalAlpha = 1;
  }

  function drawFloaters() {
    ctx.textAlign = "center";
    ctx.font = `bold ${Math.max(9, 11 * state.unit)}px monospace`;
    world.floaters.forEach((floater) => { ctx.globalAlpha = clamp(floater.life / floater.maxLife, 0, 1); ctx.fillStyle = "rgba(0,0,0,.7)"; ctx.fillText(floater.text, floater.x + 1, floater.y + 2); ctx.fillStyle = floater.color; ctx.fillText(floater.text, floater.x, floater.y); });
    ctx.globalAlpha = 1;
  }

  function drawLighting(time) {
    const { width: w, height: h } = world;
    if (world.theme !== "grass") {
      const radius = Math.max(w, h) * 0.52;
      const light = ctx.createRadialGradient(player.x, player.y, 40 * state.unit, player.x, player.y, radius);
      light.addColorStop(0, "rgba(5,7,11,0)"); light.addColorStop(0.45, "rgba(5,7,11,.05)"); light.addColorStop(1, world.theme === "ember" ? "rgba(20,5,7,.52)" : "rgba(3,5,10,.58)");
      ctx.fillStyle = light; ctx.fillRect(0, 0, w, h);
    } else {
      const sun = ctx.createRadialGradient(w * 0.5, h * 0.38, 5, w * 0.5, h * 0.38, Math.min(w, h) * 0.55);
      sun.addColorStop(0, `rgba(255,232,166,${0.055 + Math.sin(time * 0.001) * 0.008})`); sun.addColorStop(1, "rgba(15,28,15,.23)");
      ctx.fillStyle = sun; ctx.fillRect(0, 0, w, h);
    }
    const vignette = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.2, w / 2, h / 2, Math.max(w, h) * 0.7);
    vignette.addColorStop(0, "rgba(0,0,0,0)"); vignette.addColorStop(1, "rgba(0,0,0,.36)"); ctx.fillStyle = vignette; ctx.fillRect(0, 0, w, h);
  }

  function gameLoop(time) {
    const frameTime = Math.min((time - state.lastTime) / 1000, 0.08);
    state.lastTime = time;
    state.accumulator += frameTime;
    const fixedStep = 1 / 60;
    let steps = 0;
    while (state.accumulator >= fixedStep && steps < 5) { update(fixedStep); state.accumulator -= fixedStep; steps += 1; }
    if (steps === 5) state.accumulator = 0;
    render(time);
    requestAnimationFrame(gameLoop);
  }

  function pointerPosition(event) {
    const rect = canvas.getBoundingClientRect();
    return { x: ((event.clientX - rect.left) / rect.width) * canvas.width, y: ((event.clientY - rect.top) / rect.height) * canvas.height };
  }

  function updateFacingFromPointer(event) {
    const pointer = pointerPosition(event);
    const dx = pointer.x - player.x;
    const dy = pointer.y - player.y;
    const length = Math.hypot(dx, dy);
    if (length > 4) { player.facingX = dx / length; player.facingY = dy / length; }
  }

  function updateJoystick(event) {
    const rect = ui.joystickZone.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    let dx = event.clientX - centerX;
    let dy = event.clientY - centerY;
    const max = rect.width * 0.32;
    const length = Math.hypot(dx, dy);
    if (length > max) { dx = (dx / length) * max; dy = (dy / length) * max; }
    input.joystickX = dx / max;
    input.joystickY = dy / max;
    ui.joystickKnob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
  }

  function activeModal() {
    return [ui.gameOver, ui.settings, ui.tutorial, ui.pause].find((modal) => !modal.classList.contains("is-hidden"));
  }

  function trapModalFocus(event) {
    const modal = activeModal();
    if (!modal || event.code !== "Tab") return false;
    const focusable = [...modal.querySelectorAll("button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex='-1'])")]
      .filter((element) => !element.classList.contains("is-hidden"));
    if (!focusable.length) return false;
    const current = focusable.indexOf(document.activeElement);
    const next = event.shiftKey ? (current <= 0 ? focusable.length - 1 : current - 1) : (current < 0 || current === focusable.length - 1 ? 0 : current + 1);
    event.preventDefault();
    focusable[next].focus();
    return true;
  }

  function syncModalInert() {
    const modalOpen = Boolean(activeModal());
    ui.menu.inert = modalOpen;
    ui.game.inert = modalOpen;
  }

  function bindEvents() {
    ui.play.addEventListener("click", startGame);
    ui.settingsButton.addEventListener("click", () => openSettings("menu"));
    ui.settingsDone.addEventListener("click", closeSettings);
    $("[data-close='settings']").addEventListener("click", closeSettings);
    ui.pauseSettings.addEventListener("click", () => openSettings("pause"));
    ui.pauseButton.addEventListener("click", openPause);
    ui.resume.addEventListener("click", resumeGame);
    ui.quit.addEventListener("click", returnToMenu);
    ui.retry.addEventListener("click", startGame);
    ui.menuButton.addEventListener("click", returnToMenu);
    ui.tutorialNext.addEventListener("click", () => { const last = tutorials[state.controlMode].length - 1; if (state.tutorialStep >= last) finishTutorial(); else { state.tutorialStep += 1; renderTutorial(); } });
    ui.tutorialBack.addEventListener("click", () => { if (state.tutorialStep > 0) { state.tutorialStep -= 1; renderTutorial(); } });
    $("[data-close='tutorial']").addEventListener("click", finishTutorial);
    ui.replayTutorial.addEventListener("click", () => { const origin = state.settingsOrigin; ui.settings.classList.add("is-hidden"); if (origin === "menu") startGame(); else showTutorial(0); });
    $$(".control-option").forEach((button) => button.addEventListener("click", () => setControlMode(button.dataset.mode)));
    ui.shakeToggle.addEventListener("click", () => { state.screenShake = !state.screenShake; savePreference("screenShake", state.screenShake); ui.shakeToggle.classList.toggle("active", state.screenShake); ui.shakeToggle.setAttribute("aria-checked", String(state.screenShake)); });
    $$(".spell-slot").forEach((slot, index) => slot.addEventListener("click", () => { state.selectedSpell = index; updateSpellSelection(); castSpell(index); }));

    window.addEventListener("keydown", (event) => {
      if (trapModalFocus(event)) return;
      if (state.scene === "playing" && !activeModal() && event.code === "Space") {
        event.preventDefault();
        if (!event.repeat) requestAttack();
        return;
      }
      const interactiveTarget = event.target instanceof HTMLButtonElement || event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement;
      if (interactiveTarget && (event.code === "Enter" || event.code === "Space")) return;
      if (event.repeat && state.scene !== "playing") return;
      if (state.scene === "playing" && ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(event.code)) event.preventDefault();
      if (state.scene === "menu" && event.code === "Enter" && ui.settings.classList.contains("is-hidden")) { event.preventDefault(); startGame(); return; }
      if (!ui.tutorial.classList.contains("is-hidden")) { if (event.code === "ArrowRight" || event.code === "Enter") { event.preventDefault(); ui.tutorialNext.click(); } if (event.code === "ArrowLeft") { event.preventDefault(); ui.tutorialBack.click(); } if (event.code === "Escape") finishTutorial(); return; }
      if (!ui.settings.classList.contains("is-hidden")) { if (event.code === "Escape") closeSettings(); return; }
      if (state.scene === "gameover") { if (event.code === "Enter") startGame(); return; }
      if (event.code === "Escape") { if (state.scene === "playing") openPause(); else if (state.scene === "paused") resumeGame(); return; }
      if (state.scene !== "playing") return;
      input.keys.add(event.code);
      if (event.repeat) return;
      if (["Digit1", "Digit2", "Digit3", "Numpad1", "Numpad2", "Numpad3"].includes(event.code)) { const index = Number(event.code.slice(-1)) - 1; state.selectedSpell = index; castSpell(index); }
    });
    window.addEventListener("keyup", (event) => input.keys.delete(event.code));
    window.addEventListener("blur", clearInput);
    document.addEventListener("visibilitychange", () => { if (document.hidden) { clearInput(); if (state.scene === "playing") openPause(); } });
    window.addEventListener("resize", resizeCanvas);

    canvas.addEventListener("pointermove", (event) => { if (event.pointerType === "mouse" && state.scene === "playing") updateFacingFromPointer(event); });
    canvas.addEventListener("pointerdown", (event) => { if (event.pointerType !== "mouse" || state.scene !== "playing") return; updateFacingFromPointer(event); if (event.button === 0) requestAttack(); if (event.button === 2) input.mouseBlocking = true; });
    canvas.addEventListener("pointerup", (event) => { if (event.button === 2) input.mouseBlocking = false; });
    canvas.addEventListener("contextmenu", (event) => event.preventDefault());
    window.addEventListener("pointerup", (event) => { if (event.button === 2) input.mouseBlocking = false; });
    window.addEventListener("pointercancel", () => { input.mouseBlocking = false; });

    ui.joystickZone.addEventListener("pointerdown", (event) => { if (state.scene !== "playing" || input.joystickPointer !== null) return; input.joystickPointer = event.pointerId; ui.joystickZone.setPointerCapture(event.pointerId); updateJoystick(event); });
    ui.joystickZone.addEventListener("pointermove", (event) => { if (event.pointerId === input.joystickPointer) updateJoystick(event); });
    const releaseJoystick = (event) => { if (event.pointerId !== input.joystickPointer) return; input.joystickPointer = null; input.joystickX = 0; input.joystickY = 0; ui.joystickKnob.style.transform = "translate(-50%, -50%)"; };
    ui.joystickZone.addEventListener("pointerup", releaseJoystick); ui.joystickZone.addEventListener("pointercancel", releaseJoystick);

    ui.mobileAttack.addEventListener("pointerdown", (event) => { event.preventDefault(); ui.mobileAttack.classList.add("is-pressed"); requestAttack(); });
    const releaseAttack = () => ui.mobileAttack.classList.remove("is-pressed");
    ui.mobileAttack.addEventListener("pointerup", releaseAttack); ui.mobileAttack.addEventListener("pointercancel", releaseAttack);
    ui.mobileBlock.addEventListener("pointerdown", (event) => { if (state.scene !== "playing") return; event.preventDefault(); ui.mobileBlock.setPointerCapture(event.pointerId); input.mobileBlocking = true; ui.mobileBlock.classList.add("is-pressed"); });
    const releaseBlock = () => { input.mobileBlocking = false; ui.mobileBlock.classList.remove("is-pressed"); };
    ui.mobileBlock.addEventListener("pointerup", releaseBlock); ui.mobileBlock.addEventListener("pointercancel", releaseBlock);
    ui.mobileSpell.addEventListener("pointerdown", (event) => { event.preventDefault(); ui.mobileSpell.classList.add("is-pressed"); castSpell(state.selectedSpell); });
    const releaseSpell = () => ui.mobileSpell.classList.remove("is-pressed");
    ui.mobileSpell.addEventListener("pointerup", releaseSpell); ui.mobileSpell.addEventListener("pointercancel", releaseSpell);
  }

  function initialize() {
    buildMenuParticles();
    bindEvents();
    applyControlMode();
    renderControlsReference();
    ui.shakeToggle.classList.toggle("active", state.screenShake);
    ui.shakeToggle.setAttribute("aria-checked", String(state.screenShake));
    updateSpellSelection();
    const modalObserver = new MutationObserver(syncModalInert);
    [ui.gameOver, ui.settings, ui.tutorial, ui.pause].forEach((modal) => modalObserver.observe(modal, { attributes: true, attributeFilter: ["class"] }));
    syncModalInert();
    state.lastTime = performance.now();
    requestAnimationFrame(gameLoop);
  }

  initialize();
})();
