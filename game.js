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
    menu: $("#menuScreen"), game: $("#gameScreen"), play: $("#playButton"), assetStatus: $("#assetStatus"),
    settings: $("#settingsModal"), settingsButton: $("#settingsButton"), settingsDone: $("#settingsDone"),
    pauseSettings: $("#pauseSettingsButton"), pause: $("#pauseModal"), pauseButton: $("#pauseButton"),
    resume: $("#resumeButton"), quit: $("#quitButton"), tutorial: $("#tutorialModal"),
    tutorialTitle: $("#tutorialTitle"), tutorialDescription: $("#tutorialDescription"),
    tutorialVisual: $("#tutorialVisual"), tutorialStepLabel: $("#tutorialStepLabel"),
    tutorialDots: $("#tutorialDots"), tutorialBack: $("#tutorialBack"), tutorialNext: $("#tutorialNext"),
    replayTutorial: $("#replayTutorial"), gameOver: $("#gameOverModal"), reachedFloor: $("#reachedFloor"),
    killStat: $("#killStat"), timeStat: $("#timeStat"), retry: $("#retryButton"), menuButton: $("#menuButton"),
    healthFill: $("#healthFill"), healthText: $("#healthText"), manaFill: $("#manaFill"), manaText: $("#manaText"),
    enemyCount: $("#enemyCount"), floorLabel: $("#floorLabel"),
    objectiveText: $("#objectiveText"), bossHud: $("#bossHud"), bossName: $("#bossName"), bossFill: $("#bossFill"),
    toast: $("#toast"), mobileControls: $("#mobileControls"), joystickZone: $("#joystickZone"),
    joystickKnob: $("#joystickKnob"), mobileAttack: $("#mobileAttack"), mobileBlock: $("#mobileBlock"),
    mobileSpell: $("#mobileSpell"), mobileDash: $("#mobileDash"), controlsGrid: $("#controlsGrid"), controlsSubtitle: $("#controlsSubtitle"),
    shakeToggle: $("#shakeToggle"), floorTransition: $("#floorTransition"),
    transitionFloor: $("#transitionFloor"),
    bestFloorMenu: $("#bestFloorMenu"), bestFloorGameOver: $("#bestFloorGameOver"),
    chamberBuffCard: $("#chamberBuffCard"), chamberBuffText: $("#chamberBuffText"),
    buffModal: $("#buffModal"), buffChoices: $("#buffChoices")
  };

  const SPELLS = [
    { id: "ember", name: "Ember", cost: 12, cooldown: 5, color: "#f1743e" },
    { id: "frost", name: "Frost", cost: 22, cooldown: 7, color: "#66cce4" },
    { id: "nova", name: "Nova", cost: 35, cooldown: 9, color: "#be84f0" }
  ];
  const SLASH_DURATION = 0.2;
  const SLASH_REACH = 70 * 0.75;
  const SLASH_HALF_ANGLE = Math.acos(0.28);
  const CHARGE_DURATION = 0.9;
  const CHARGE_THRESHOLD = 0.18;
  const SPRITE_FILES = {
    player: "player", slime: "slime", skeleton: "skeleton", wisp: "wisp", spitter: "spitter",
    charger: "charger", cultist: "cultist", sentinel: "sentinel", moss: "mossguardian",
    bone: "bonewarden", cinder: "cindereye", hollow: "hollowknight", veil: "veilkeeper",
    plague: "plaguematron", storm: "stormidol", wall: "wall", stairs: "stairs",
    tutorial: "tutorialbg", dungeon: "dungeonbg"
  };
  const sprites = Object.fromEntries(Object.entries(SPRITE_FILES).map(([id, file]) => [id, { file: `sprites/${file}.png`, image: null, source: null }]));
  const assets = { ready: false };
  const BOSS_CATALOG = [
    { id: "bone", name: "THE BONE WARDEN", special: "beam", pursuit: "homing", color: "#e2d1aa" },
    { id: "cinder", name: "THE CINDER EYE", special: "aoe", pursuit: "homing", color: "#e4714d" },
    { id: "hollow", name: "THE HOLLOW KNIGHT", special: "charge", pursuit: "charge", color: "#8ba0ba" },
    { id: "veil", name: "THE VEIL KEEPER", special: "volley", pursuit: "homing", color: "#bd80d0" },
    { id: "plague", name: "THE PLAGUE MATRON", special: "poison", pursuit: "homing", color: "#9fca5b" },
    { id: "storm", name: "THE STORM IDOL", special: "storm", pursuit: "charge", color: "#68c9ed" }
  ];
  const BUFF_CATALOG = [
    { id: "nova_range", icon: "✺", name: "Expanding Star", description: "Nova radius grows by 25%." },
    { id: "burn_double", icon: "●", name: "Hungry Flame", description: "Ember burn damage is doubled." },
    { id: "frost_range", icon: "✦", name: "Freezing Cold", description: "Frost impact radius grows by 30%." },
    { id: "physical", icon: "⚔", name: "Heavy Edge", description: "Slash and charged shot damage increases by 50%." },
    { id: "perfect_wave", icon: "◇", name: "Answering Guard", description: "Perfect blocks blast nearby foes for 50% of current health." },
    { id: "health20", icon: "+", name: "Second Wind", description: "Gain 20 temporary health for this chamber." },
    { id: "max50", icon: "♥", name: "Giant's Heart", description: "Gain 50 max health and 50 temporary health for this chamber." },
    { id: "quickcast", icon: "↻", name: "Quickened Runes", description: "Spell cooldowns recover 20% faster." },
    { id: "long_blade", icon: "↔", name: "Long Blade", description: "Slash reach and charged shot size are doubled." },
    { id: "dash", icon: "»", name: "Windstep", description: "Dash recharges 25% faster." }
  ];

  const tutorials = {
    desktop: [
      { title: "Move freely", description: "Use WASD or the arrow keys to explore the tiled arena. Move in any direction and keep your distance.", visual: '<div class="tutorial-keys"><span>W</span><span>A</span><span>S</span><span>D</span></div>' },
      { title: "Strike, guard & dash", description: "Aim with the crosshair. Tap left-click or Space to slash; hold left-click, then release to fire a charged shot. The crosshair glows when ready. Hold E to guard and tap Left Shift to dash.", visual: '<div class="tutorial-icon">⚔ <span style="color:#9fa9b6">◇</span> »</div>' },
      { title: "Wield magic", description: "Keys 1, 2, and 3 equip Ember, Frost, or Nova without casting. Aim with the crosshair, then right-click to cast your selected spell.", visual: '<div class="tutorial-icon"><span style="color:#f1743e">●</span> <span style="color:#66cce4">✦</span> <span style="color:#be84f0">✺</span></div>' },
      { title: "Defeat. Descend.", description: "Clear the floor to summon its guardian. Defeat the boss, then step onto the glowing stairs. The dungeon never ends.", visual: '<div class="tutorial-icon">☠ ↓</div>' }
    ],
    mobile: [
      { title: "Move freely", description: "Drag the joystick with your left thumb. Move in any direction and keep your distance from enemies.", visual: '<div class="tutorial-icon">◎</div>' },
      { title: "Strike, guard & dash", description: "Tap Strike to swing, hold Guard to block, and tap Dash to evade. A perfectly timed block stops all damage.", visual: '<div class="tutorial-icon">⚔ <span style="color:#9fa9b6">◇</span> »</div>' },
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
    accumulator: 0, unit: 1, shakeAmount: 0, shakeX: 0, shakeY: 0, toastTimer: 0, transitionTimer: 0,
    bestFloor: Math.max(0, Number(loadPreference("bestFloor", 0)) || 0), runSeed: 0, buffs: {}, latestBuff: "", buffFloor: null, buffChoices: []
  };

  const input = { keys: new Set(), joystickX: 0, joystickY: 0, joystickPointer: null, mobileBlocking: false, mouseX: 0, mouseY: 0, mouseClientX: null, mouseClientY: null, hasMouseAim: false, pointerInside: false, attackPointer: null };
  const world = {
    width: 960, height: 540, theme: "grass", obstacles: [], torches: [], enemies: [],
    projectiles: [], particles: [], floaters: [], pickups: [], hazards: [], boss: null, bossSpawned: false,
    floorCleared: false, stairs: null, elapsed: 0, rng: Math.random, objective: "", layout: "field"
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
      blockStartedAt: 0, guardBroken: 0, walkCycle: 0, power: 1, lookDirection: 1,
      dashCooldown: 0, dashTimer: 0, poisonTimer: 0, poisonTick: 0, slash: null, chargeTime: 0,
      chamberHealth: 0, chamberMaxHp: 0
    };
  }

  function opaqueBounds(data, width, height) {
    let left = width, top = height, right = -1, bottom = -1;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        if (data[(y * width + x) * 4 + 3] <= 24) continue;
        left = Math.min(left, x); top = Math.min(top, y);
        right = Math.max(right, x); bottom = Math.max(bottom, y);
      }
    }
    if (right < left) throw new Error("Empty sprite");
    return { x: left, y: top, w: right - left + 1, h: bottom - top + 1 };
  }

  function loadSprites() {
    return Promise.all(Object.values(sprites).map((sprite) => new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => {
        try {
          const buffer = document.createElement("canvas");
          buffer.width = image.naturalWidth; buffer.height = image.naturalHeight;
          const context = buffer.getContext("2d", { willReadFrequently: true });
          context.drawImage(image, 0, 0);
          sprite.source = opaqueBounds(context.getImageData(0, 0, buffer.width, buffer.height).data, buffer.width, buffer.height);
          sprite.image = image;
          resolve();
        } catch (error) { reject(error); }
      };
      image.onerror = () => reject(new Error(`Could not load ${sprite.file}`));
      image.src = sprite.file;
    }))).then(() => { assets.ready = true; });
  }

  function spriteAspect(id) {
    const source = sprites[id].source;
    if (source) return source.w / source.h;
    // Geometry is also available before loading, for layout and collision checks.
    return id === "wall" ? 519 / 1653 : id === "stairs" ? 519 / 521 : 1;
  }

  function drawSprite(id, x, y, width, height) {
    const { image, source } = sprites[id];
    if (!image || !source) return;
    ctx.drawImage(image, source.x, source.y, source.w, source.h, x, y, width, height);
  }

  function stairBounds(stairs = world.stairs, entrance = false) {
    const w = 64 * state.unit;
    const h = w / spriteAspect("stairs");
    const bounds = { x: stairs.x - w / 2, y: stairs.y - h / 2, w, h };
    // Only the open steps trigger descent; the surrounding masonry is decorative.
    return entrance ? { x: bounds.x + w * 0.2, y: bounds.y + h * 0.24, w: w * 0.6, h: h * 0.62 } : bounds;
  }

  const stairClearance = () => Math.hypot(64, 64 / spriteAspect("stairs")) * state.unit / 2;

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
    if (input.mouseClientX !== null) updateFacingFromPointer({ clientX: input.mouseClientX, clientY: input.mouseClientY });
  }

  function scaleWorld(scaleX, scaleY, sizeScale) {
    const points = [player, world.boss, world.stairs, ...world.enemies, ...world.projectiles, ...world.particles, ...world.floaters, ...world.pickups, ...world.torches, ...world.hazards].filter(Boolean);
    points.forEach((item) => { item.x *= scaleX; item.y *= scaleY; });
    world.obstacles.forEach((obstacle) => { obstacle.x *= scaleX; obstacle.y *= scaleY; obstacle.w *= scaleX; obstacle.h *= scaleY; });
    if (input.hasMouseAim) { input.mouseX *= scaleX; input.mouseY *= scaleY; }
    state.shakeX *= scaleX;
    state.shakeY *= scaleY;
    if (player.slash) {
      player.slash.x *= scaleX;
      player.slash.y *= scaleY;
      player.slash.reach *= sizeScale;
      player.slash.angle = Math.atan2(Math.sin(player.slash.angle) * scaleY, Math.cos(player.slash.angle) * scaleX);
    }
    [...world.enemies, ...(world.boss ? [world.boss] : [])].forEach((enemy) => {
      enemy.radius *= sizeScale;
      enemy.speed *= sizeScale;
      enemy.range *= sizeScale;
      enemy.knockX *= scaleX;
      enemy.knockY *= scaleY;
      (enemy.chargeTrail || []).forEach((point) => { point.x *= scaleX; point.y *= scaleY; });
      if (enemy.charge) {
        enemy.charge.remaining *= sizeScale;
        enemy.charge.speed *= sizeScale;
        enemy.attackAngle = Math.atan2(enemy.charge.dy * scaleY, enemy.charge.dx * scaleX);
        enemy.charge.dx = Math.cos(enemy.attackAngle);
        enemy.charge.dy = Math.sin(enemy.attackAngle);
      }
    });
    world.projectiles.forEach((projectile) => {
      projectile.radius *= sizeScale;
      projectile.vx *= scaleX;
      projectile.vy *= scaleY;
      if (projectile.targetX !== undefined) { projectile.targetX *= scaleX; projectile.targetY *= scaleY; }
      if (projectile.blastRadius) projectile.blastRadius *= sizeScale;
    });
    world.hazards.forEach((hazard) => { hazard.radius *= sizeScale; });
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
    if (world.stairs && collidesWithObstacle(world.stairs.x, world.stairs.y, stairClearance())) {
      Object.assign(world.stairs, findClearPoint(world.stairs.x, world.stairs.y, stairClearance()));
    }
  }

  const buffStacks = (id) => state.buffs[id] || 0;
  const spellCooldown = (index) => SPELLS[index].cooldown * Math.pow(0.8, buffStacks("quickcast"));
  const seedForFloor = (floor) => (state.runSeed ^ Math.imul(floor + 1, 2654435761)) >>> 0;

  function updateBestRun() {
    if (state.floor > state.bestFloor) {
      state.bestFloor = state.floor;
      savePreference("bestFloor", state.bestFloor);
    }
    const label = state.bestFloor > 0 ? `FLOOR ${state.bestFloor}` : "TUTORIAL";
    ui.bestFloorMenu.textContent = label;
    ui.bestFloorGameOver.textContent = label;
  }

  function generateFloor(floor) {
    cancelCharge();
    expireChamberBuff();
    const difficulty = floor;
    world.rng = mulberry32(seedForFloor(floor));
    world.theme = floor === 0 ? "grass" : floor % 4 === 0 ? "crypt" : floor % 3 === 0 ? "ember" : "stone";
    Object.assign(world, { obstacles: [], torches: [], enemies: [], projectiles: [], particles: [], floaters: [], pickups: [], hazards: [], boss: null, bossSpawned: false, floorCleared: false, stairs: null, elapsed: 0, objective: "", layout: floor === 0 ? "field" : ["scattered", "cross", "ring", "lanes", "sanctum"][Math.floor(world.rng() * 5)] });
    ui.bossHud.classList.add("is-hidden");
    Object.assign(player, { x: world.width * 0.5, y: world.height * 0.79, facingX: 0, facingY: -1, attackCooldown: 0, attackAnim: 0, slash: null, spellCooldowns: [0, 0, 0], invulnerable: 0.7, blocking: false, wasBlocking: false, guardBroken: 0, stamina: player.maxStamina, dashCooldown: 0, poisonTimer: 0, poisonTick: 0 });
    createObstacles(floor);
    createTorches(floor);
    const count = floor === 0 ? 5 : Math.min(20, 6 + Math.ceil(difficulty * 0.9));
    for (let index = 0; index < count; index += 1) {
      const type = floor === 0 ? "slime" : chooseEnemyType(index, floor);
      const position = findSpawnPosition(index);
      world.enemies.push(createEnemy(type, position.x, position.y, difficulty));
    }
    updateFloorLabels();
    updateBestRun();
    updateObjective();
    updateHud();
  }

  function createObstacles(floor) {
    const unit = state.unit;
    const thickness = 32 * unit;
    const length = thickness / spriteAspect("wall");
    const wallSize = (vertical) => ({ w: vertical ? thickness : length, h: vertical ? length : thickness });
    if (floor === 0) {
      const margin = 26 * unit;
      [[margin, world.height * 0.22, true], [world.width - margin - thickness, world.height * 0.29, true], [world.width * 0.18, world.height * 0.66, false], [world.width * 0.76, world.height * 0.66, false], [world.width * 0.08, world.height * 0.48, false], [world.width * 0.87, world.height * 0.5, false]]
        .forEach(([x, y, vertical]) => {
          const size = wallSize(vertical);
          world.obstacles.push({ x: clamp(x, margin, world.width - margin - size.w), y: clamp(y, margin, world.height - margin - size.h), ...size, kind: "wall" });
        });
      return;
    }
    const obstacleCount = Math.min(10, 5 + (floor % 5));
    const tile = 32 * unit;
    const reserved = [
      { x: world.width * 0.5, y: world.height * 0.79, radius: 105 * unit },
      { x: world.width * 0.5, y: world.height * 0.2, radius: 118 * unit },
      { x: world.width * 0.5, y: world.height * 0.49, radius: 72 * unit }
    ];
    const add = (x, y, w, h, kind = "wall") => {
      ({ w, h } = wallSize(h > w));
      const candidate = { x: Math.round(x / tile) * tile, y: Math.round(y / tile) * tile, w, h, kind };
      if (candidate.x < 30 * unit || candidate.y < 48 * unit || candidate.x + w > world.width - 30 * unit || candidate.y + h > world.height - 40 * unit) return false;
      if (reserved.some((zone) => circleIntersectsRect(zone.x, zone.y, zone.radius, candidate))) return false;
      if (world.obstacles.some((obstacle) => rectanglesOverlap(candidate, obstacle, 18 * unit))) return false;
      world.obstacles.push(candidate);
      return true;
    };
    if (world.layout === "cross") {
      add(world.width * 0.29, world.height * 0.37, tile * 2, tile, "wall");
      add(world.width * 0.65, world.height * 0.37, tile * 2, tile, "wall");
      add(world.width * 0.44, world.height * 0.23, tile, tile * 2, "pillar");
      add(world.width * 0.55, world.height * 0.53, tile, tile * 2, "pillar");
    } else if (world.layout === "ring") {
      for (let index = 0; index < 8; index += 1) {
        const angle = (Math.PI * 2 * index) / 8;
        add(world.width * 0.5 + Math.cos(angle) * world.width * 0.24, world.height * 0.46 + Math.sin(angle) * world.height * 0.22, tile, tile, "pillar");
      }
    } else if (world.layout === "lanes") {
      for (const lane of [0.28, 0.68]) {
        add(world.width * lane, world.height * 0.22, tile, tile * 2, "pillar");
        add(world.width * lane, world.height * 0.54, tile, tile * 2, "pillar");
      }
    } else if (world.layout === "sanctum") {
      add(world.width * 0.23, world.height * 0.3, tile * 2, tile, "wall");
      add(world.width * 0.67, world.height * 0.3, tile * 2, tile, "wall");
      add(world.width * 0.22, world.height * 0.58, tile * 2, tile, "wall");
      add(world.width * 0.68, world.height * 0.58, tile * 2, tile, "wall");
    }
    let attempts = 0;
    while (world.obstacles.length < obstacleCount && attempts < 80) {
      attempts += 1;
      const horizontal = world.rng() > 0.55;
      const w = (horizontal ? (2 + Math.floor(world.rng() * 2)) : 1) * tile;
      const h = (horizontal ? 1 : (2 + Math.floor(world.rng() * 2))) * tile;
      const x = Math.round(lerp(world.width * 0.12, world.width * 0.88 - w, world.rng()) / tile) * tile;
      const y = Math.round(lerp(world.height * 0.2, world.height * 0.68 - h, world.rng()) / tile) * tile;
      add(x, y, w, h, horizontal ? "wall" : "pillar");
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

  function pointToSegmentDistance(px, py, ax, ay, bx, by) {
    const abX = bx - ax;
    const abY = by - ay;
    const lengthSquared = abX * abX + abY * abY;
    const amount = lengthSquared ? clamp(((px - ax) * abX + (py - ay) * abY) / lengthSquared, 0, 1) : 0;
    return Math.hypot(px - (ax + abX * amount), py - (ay + abY * amount));
  }

  function createTorches(floor) {
    if (floor === 0) return;
    const count = clamp(3 + (floor % 3), 3, 5);
    for (let index = 0; index < count; index += 1) {
      world.torches.push({ x: lerp(world.width * 0.1, world.width * 0.9, index / (count - 1)), y: index % 2 ? world.height * 0.16 : world.height * 0.72, phase: world.rng() * Math.PI * 2, size: 1 + world.rng() * 0.25 });
    }
  }

  function chooseEnemyType(index, floor) {
    const available = ["slime", "skeleton"];
    if (floor >= 2) available.push("wisp", "spitter");
    if (floor >= 3) available.push("charger");
    if (floor >= 4) available.push("cultist");
    if (floor >= 5) available.push("sentinel");
    return available[Math.floor(((world.rng() + index * 0.173) % 1) * available.length)];
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
    const hpScale = 1 + floor * 0.16;
    const stats = {
      slime: { hp: 50, speed: 58, radius: 16, damage: 16, range: 30, cooldown: 1.2 },
      skeleton: { hp: 68, speed: 74, radius: 14, damage: 22, range: 35, cooldown: 1.05 },
      wisp: { hp: 46, speed: 54, radius: 12, damage: 19, range: 220, cooldown: 1.6 },
      spitter: { hp: 58, speed: 50, radius: 15, damage: 15, range: 245, cooldown: 2 },
      charger: { hp: 92, speed: 64, radius: 17, damage: 29, range: 250, cooldown: 2.3 },
      cultist: { hp: 74, speed: 48, radius: 15, damage: 25, range: 145, cooldown: 2.2 },
      sentinel: { hp: 105, speed: 40, radius: 18, damage: 30, range: 330, cooldown: 2.8 }
    }[type];
    return {
      type, x, y, radius: stats.radius * unit, hp: Math.round(stats.hp * hpScale), maxHp: Math.round(stats.hp * hpScale),
      speed: stats.speed * unit * (1 + Math.min(floor, 50) * 0.006), damage: Math.round(stats.damage * (1 + floor * 0.045)),
      range: stats.range * unit, baseCooldown: stats.cooldown, attackCooldown: 0.35 + world.rng() * 0.7,
      telegraph: 0, telegraphMax: 0, telegraphRadius: 0, telegraphWidth: 0, telegraphLength: 0,
      attackKind: "", attackAngle: 0, flash: 0, frozen: 0, stunned: 0, burnTimer: 0, burnTick: 0, burnDamage: 0,
      dead: false, deathTimer: 0, hurtVisible: 0, walk: world.rng() * 10, knockX: 0, knockY: 0, isBoss: false,
      charge: null, chargeTrail: []
    };
  }

  function createBoss() {
    const floor = state.floor;
    const unit = state.unit;
    const maxHp = Math.round((floor === 0 ? 300 : 420) * (1 + floor * 0.22));
    const spawn = findClearPoint(world.width * 0.5, Math.max(95 * unit, world.height * 0.2), (floor === 0 ? 30 : 32) * unit);
    const profile = floor === 0 ? { id: "moss", name: "THE MOSS GUARDIAN", special: "poison", pursuit: "charge", color: "#9db969" } : BOSS_CATALOG[Math.floor(world.rng() * BOSS_CATALOG.length)];
    const boss = {
      type: "boss", name: profile.name, x: spawn.x, y: spawn.y,
      radius: (floor === 0 ? 30 : 32) * unit, hp: maxHp, maxHp,
      speed: (floor === 0 ? 46 : 58) * unit * (1 + Math.min(floor, 40) * 0.005),
      damage: Math.round((floor === 0 ? 24 : 30) * (1 + floor * 0.04)), range: 75 * unit,
      baseCooldown: 1.5, attackCooldown: 1.2, specialCooldown: 3.8, pursuitCooldown: floor === 0 ? 2.2 : 1.8,
      pursuitKind: profile.pursuit, charge: null, chargeTrail: [], telegraph: 0, telegraphMax: 0,
      telegraphRadius: 0, telegraphWidth: 0, telegraphLength: 0, attackKind: "", attackAngle: 0,
      flash: 0, frozen: 0, stunned: 0, burnTimer: 0, burnTick: 0, burnDamage: 0, dead: false, deathTimer: 0,
      hurtVisible: 0, walk: 0, knockX: 0, knockY: 0, isBoss: true,
      variant: profile.id, special: profile.special, specialColor: profile.color
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
    ui.floorLabel.textContent = state.floor === 0 ? "TUTORIAL" : `FLOOR ${state.floor}`;
  }

  function updateObjective() {
    const alive = world.enemies.filter((enemy) => !enemy.dead).length;
    const next = world.floorCleared ? "Enter the glowing stairs" : world.boss && !world.boss.dead ? "Defeat the floor guardian" : alive > 0 ? `Clear the floor · ${alive} remaining` : "Something stirs...";
    if (next !== world.objective) { world.objective = next; ui.objectiveText.textContent = next; }
  }

  function startGame() {
    if (!assets.ready) return;
    hideAllModals();
    ui.bossHud.classList.add("is-hidden");
    ui.menu.classList.add("is-hidden");
    ui.game.classList.remove("is-hidden");
    state.scene = "tutorial";
    state.floor = 0;
    state.kills = 0;
    state.selectedSpell = 0;
    state.runSeed = typeof crypto !== "undefined" && crypto.getRandomValues ? crypto.getRandomValues(new Uint32Array(1))[0] : (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;
    state.buffs = {};
    state.latestBuff = "";
    state.buffFloor = null;
    state.buffChoices = [];
    state.runStartedAt = performance.now();
    player = createPlayer();
    ui.chamberBuffCard.classList.add("is-hidden");
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
    updateBestRun();
  }

  function hideAllModals() {
    [ui.settings, ui.pause, ui.tutorial, ui.gameOver, ui.buffModal, ui.floorTransition].forEach((element) => element.classList.add("is-hidden"));
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
    updateBestRun();
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
    const desktop = [["Move", "WASD / Arrows"], ["Aim", "Crosshair"], ["Slash", "Space / Tap left click"], ["Charged shot", "Hold left click, release"], ["Guard", "Hold E"], ["Cast selected spell", "Right click"], ["Select spell", "1 / 2 / 3"], ["Dash", "Left Shift"], ["Pause", "Escape"]];
    const mobile = [["Move", "Joystick"], ["Strike", "Strike button"], ["Guard", "Hold Guard"], ["Dash", "Dash button"], ["Choose spell", "Spell slots"], ["Cast again", "Spell button"]];
    const controls = state.controlMode === "desktop" ? desktop : mobile;
    ui.controlsSubtitle.textContent = state.controlMode === "desktop" ? "Keyboard & mouse" : "Touch controls";
    ui.controlsGrid.innerHTML = controls.map(([action, control]) => `<div class="control-item"><span>${action}</span><b>${control}</b></div>`).join("");
  }

  function showBuffChoices() {
    clearInput();
    state.scene = "buff";
    const pool = [...BUFF_CATALOG];
    const choices = [];
    while (choices.length < 3 && pool.length) choices.push(pool.splice(Math.floor(world.rng() * pool.length), 1)[0]);
    state.buffChoices = choices.map((buff) => buff.id);
    ui.buffChoices.innerHTML = choices.map((buff) => `<button class="buff-choice" type="button" data-buff="${buff.id}"><span class="buff-choice-icon">${buff.icon}</span><span><strong>${buff.name}</strong><small>${buff.description}</small></span></button>`).join("");
    ui.buffModal.classList.remove("is-hidden");
    ui.buffChoices.querySelectorAll(".buff-choice").forEach((button) => button.addEventListener("click", () => applyBuff(button.dataset.buff)));
    syncModalInert();
    requestAnimationFrame(() => ui.buffChoices.querySelector("button")?.focus());
  }

  function applyBuff(id) {
    const buff = BUFF_CATALOG.find((item) => item.id === id);
    if (!buff || state.scene !== "buff" || state.buffFloor === state.floor || !state.buffChoices.includes(id)) return;
    state.buffs = { [id]: 1 };
    state.buffFloor = state.floor;
    state.buffChoices = [];
    if (id === "max50") { player.chamberMaxHp = 50; player.maxHp += player.chamberMaxHp; }
    if (id === "health20" || id === "max50") {
      player.chamberHealth = Math.min(player.maxHp - player.hp, id === "health20" ? 20 : 50);
      player.hp += player.chamberHealth;
    }
    state.latestBuff = buff.name;
    ui.chamberBuffText.textContent = buff.name;
    ui.chamberBuffCard.classList.remove("is-hidden");
    ui.buffModal.classList.add("is-hidden");
    syncModalInert();
    state.scene = "playing";
    showToast(`${buff.name.toUpperCase()} · THIS CHAMBER ONLY`);
    updateHud();
  }

  function expireChamberBuff() {
    player.maxHp -= player.chamberMaxHp;
    player.hp = Math.min(player.maxHp, Math.max(0, player.hp - player.chamberHealth));
    player.chamberHealth = 0;
    player.chamberMaxHp = 0;
    state.buffs = {};
    state.latestBuff = "";
    state.buffFloor = null;
    state.buffChoices = [];
    ui.chamberBuffText.textContent = "None";
    ui.chamberBuffCard.classList.add("is-hidden");
  }

  function clearInput() {
    cancelCharge();
    input.keys.clear();
    Object.assign(input, { joystickX: 0, joystickY: 0, joystickPointer: null, mobileBlocking: false });
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

  function aimTarget() {
    if (state.controlMode === "desktop" && input.hasMouseAim) {
      // Pointer coordinates are on screen; attacks live in the unshaken world.
      return { x: input.mouseX - state.shakeX, y: input.mouseY - state.shakeY };
    }
    return { x: player.x + player.facingX * 180 * state.unit, y: player.y + player.facingY * 180 * state.unit };
  }

  function aimVector() {
    const target = aimTarget();
    const dx = target.x - player.x;
    const dy = target.y - player.y;
    const length = Math.hypot(dx, dy);
    if (length > 0.001) return { x: dx / length, y: dy / length };
    return { x: player.facingX, y: player.facingY };
  }

  function guardRequested() {
    return (input.keys.has("KeyE") || input.mobileBlocking) && player.guardBroken <= 0 && player.stamina > 0;
  }

  function update(dt) {
    if (state.scene !== "playing") return;
    world.elapsed += dt;
    updatePlayer(dt);
    updateEnemies(dt);
    updateProjectiles(dt);
    updateHazards(dt);
    updatePickups(dt);
    updateEffects(dt);
    if (!world.bossSpawned && world.enemies.every((enemy) => enemy.dead)) createBoss();
    world.enemies = world.enemies.filter((enemy) => !enemy.dead || enemy.deathTimer > 0);
    world.projectiles = world.projectiles.filter((projectile) => projectile.life > 0);
    world.particles = world.particles.filter((particle) => particle.life > 0);
    world.floaters = world.floaters.filter((floater) => floater.life > 0);
    world.pickups = world.pickups.filter((pickup) => pickup.life > 0);
    world.hazards = world.hazards.filter((hazard) => hazard.life > 0);
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
    player.dashCooldown = Math.max(0, player.dashCooldown - dt);
    player.dashTimer = Math.max(0, player.dashTimer - dt);
    player.mana = Math.min(player.maxMana, player.mana + 11 * dt);
    player.spellCooldowns = player.spellCooldowns.map((cooldown) => Math.max(0, cooldown - dt));
    if (player.poisonTimer > 0) {
      player.poisonTimer -= dt;
      player.poisonTick -= dt;
      if (player.poisonTick <= 0) { player.poisonTick = 0.72; damagePlayer(4 + Math.floor(state.floor * 0.2), null, true); }
    }
    player.blocking = guardRequested();
    if (player.blocking) cancelCharge();
    else if (input.attackPointer !== null) player.chargeTime = Math.min(CHARGE_DURATION, player.chargeTime + dt);
    if (player.blocking && !player.wasBlocking) player.blockStartedAt = performance.now();
    if (player.blocking) {
      player.stamina = Math.max(0, player.stamina - 55 * dt);
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
      if (Math.abs(movement.x) > 0.12) player.lookDirection = Math.sign(movement.x);
      const speed = player.speed * state.unit * (player.blocking ? 0.5 : 1);
      moveEntity(player, movement.x * speed * dt, movement.y * speed * dt, player.radius * state.unit);
      player.walkCycle += dt * 11;
    }
    if (state.controlMode === "desktop" && input.hasMouseAim) {
      const aim = aimVector();
      if (Math.abs(aim.x) > 0.12) player.lookDirection = Math.sign(aim.x);
    }
    if (world.stairs && circleIntersectsRect(player.x, player.y, player.radius * state.unit, stairBounds(world.stairs, true))) descendFloor();
  }

  function updateEnemies(dt) {
    [...world.enemies, ...(world.boss ? [world.boss] : [])].forEach((enemy) => {
      enemy.flash = Math.max(0, enemy.flash - dt);
      enemy.frozen = Math.max(0, enemy.frozen - dt);
      enemy.stunned = Math.max(0, enemy.stunned - dt);
      enemy.hurtVisible = Math.max(0, enemy.hurtVisible - dt);
      enemy.attackCooldown = Math.max(0, enemy.attackCooldown - dt);
      if (enemy.specialCooldown !== undefined) enemy.specialCooldown = Math.max(0, enemy.specialCooldown - dt);
      if (enemy.pursuitCooldown !== undefined) enemy.pursuitCooldown = Math.max(0, enemy.pursuitCooldown - dt);
      enemy.chargeTrail.forEach((point) => { point.life -= dt; });
      enemy.chargeTrail = enemy.chargeTrail.filter((point) => point.life > 0);
      if (enemy.dead) { enemy.deathTimer -= dt; return; }
      if (enemy.burnTimer > 0) {
        enemy.burnTimer -= dt;
        enemy.burnTick -= dt;
        if (enemy.burnTick <= 0) { enemy.burnTick = 0.65; damageEnemy(enemy, enemy.burnDamage, 0, 0, "burn"); }
        if (enemy.dead) return;
      }
      if (enemy.knockX || enemy.knockY) {
        moveEntity(enemy, enemy.knockX * dt, enemy.knockY * dt, enemy.radius);
        enemy.knockX *= Math.pow(0.015, dt);
        enemy.knockY *= Math.pow(0.015, dt);
        if (Math.hypot(enemy.knockX, enemy.knockY) < 2) enemy.knockX = enemy.knockY = 0;
      }
      if (enemy.stunned > 0 || enemy.frozen > 0) { enemy.charge = null; return; }
      if (enemy.charge) { updateEnemyCharge(enemy, dt); return; }
      if (enemy.telegraph > 0) {
        if (enemy.attackKind === "homing") enemy.attackAngle = Math.atan2(player.y - enemy.y, player.x - enemy.x);
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
      const slowFactor = 1;
      if (enemy.isBoss) updateBoss(enemy, dt, dist, nx, ny, 1);
      else if (enemy.type === "wisp" || enemy.type === "spitter" || enemy.type === "sentinel") {
        if (dist < 120 * state.unit) moveEntity(enemy, -nx * enemy.speed * dt * slowFactor, -ny * enemy.speed * dt * slowFactor, enemy.radius);
        else if (dist > 210 * state.unit) moveEntity(enemy, nx * enemy.speed * dt * slowFactor, ny * enemy.speed * dt * slowFactor, enemy.radius);
        if (enemy.attackCooldown <= 0 && dist < 380 * state.unit) beginEnemyAttack(enemy, enemy.type === "spitter" ? "poisonShot" : enemy.type === "sentinel" ? "beam" : "shot", enemy.type === "sentinel" ? 1.08 : 0.7);
      } else if (enemy.type === "charger") {
        if (dist > 105 * state.unit) moveEntity(enemy, nx * enemy.speed * dt, ny * enemy.speed * dt, enemy.radius);
        if (enemy.attackCooldown <= 0 && dist < 300 * state.unit) beginEnemyAttack(enemy, "charge", 0.84);
      } else if (enemy.type === "cultist") {
        if (dist > 135 * state.unit) moveEntity(enemy, nx * enemy.speed * dt, ny * enemy.speed * dt, enemy.radius);
        if (enemy.attackCooldown <= 0 && dist < 180 * state.unit) beginEnemyAttack(enemy, "aoe", 0.92);
      } else {
        if (dist > enemy.range) { moveEntity(enemy, nx * enemy.speed * dt, ny * enemy.speed * dt, enemy.radius); enemy.walk += dt * 8; }
        else if (enemy.attackCooldown <= 0) beginEnemyAttack(enemy, "melee", enemy.type === "slime" ? 0.48 : 0.38);
      }
    });
  }

  function updateBoss(boss, dt, dist, nx, ny, slowFactor) {
    if (boss.pursuitCooldown <= 0) {
      beginEnemyAttack(boss, boss.pursuitKind, boss.pursuitKind === "charge" ? 0.72 : 0.65);
      boss.pursuitCooldown = Math.max(2.8, 4.6 - Math.min(state.floor, 36) * 0.05);
    } else if (boss.specialCooldown <= 0) {
      const specialKind = { beam: "beam", aoe: "aoe", poison: "poisonBurst", charge: "charge", volley: "burst", storm: world.rng() < 0.5 ? "storm" : "beam" }[boss.special] || "burst";
      beginEnemyAttack(boss, specialKind, specialKind === "beam" ? 1.25 : specialKind === "charge" ? 0.95 : 1.05);
      boss.specialCooldown = Math.max(3.2, 5.7 - Math.min(state.floor, 25) * 0.05);
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
    enemy.telegraphRadius = kind === "aoe" || kind === "storm" ? (enemy.isBoss ? 132 : 92) * state.unit : kind === "poisonBurst" ? 118 * state.unit : kind === "slam" ? enemy.range + 25 * state.unit : enemy.range + 14 * state.unit;
    enemy.telegraphWidth = (kind === "beam" ? (enemy.isBoss ? 68 : 42) : kind === "charge" ? enemy.radius * 1.8 / state.unit : 24) * state.unit;
    enemy.telegraphLength = (kind === "beam" ? (enemy.isBoss ? 520 : 390) : kind === "charge" ? (enemy.isBoss ? 460 : 300) : kind === "shot" || kind === "poisonShot" ? 360 : 0) * state.unit;
  }

  function updateEnemyCharge(enemy, dt) {
    if (dt <= 0) return;
    const charge = enemy.charge;
    const travel = Math.min(charge.remaining, charge.speed * dt);
    // Small swept steps keep a fast charge from skipping walls or the player's body.
    const steps = Math.max(1, Math.ceil(travel / (4 * state.unit)));
    let blocked = false;
    for (let step = 0; step < steps; step += 1) {
      const x = enemy.x, y = enemy.y;
      const dx = charge.dx * travel / steps, dy = charge.dy * travel / steps;
      moveEntity(enemy, dx, dy, enemy.radius);
      const moved = Math.hypot(enemy.x - x, enemy.y - y);
      charge.remaining = Math.max(0, charge.remaining - moved);
      if (!charge.hitPlayer && pointToSegmentDistance(player.x, player.y, x, y, enemy.x, enemy.y) <= enemy.radius + player.radius * state.unit) {
        charge.hitPlayer = true;
        damagePlayer(enemy.damage, enemy);
      }
      if (moved < Math.hypot(dx, dy) - 0.01 || enemy.stunned > 0 || enemy.frozen > 0) { blocked = true; break; }
    }
    enemy.walk += dt * 30;
    charge.trailTimer -= dt;
    if (charge.trailTimer <= 0) {
      charge.trailTimer = 0.025;
      enemy.chargeTrail.push({ x: enemy.x, y: enemy.y, life: 0.18 });
      addParticle(enemy.x - charge.dx * enemy.radius, enemy.y - charge.dy * enemy.radius, -charge.dx * 55 * state.unit, -charge.dy * 55 * state.unit, "#c7a27e", 0.25, 3 * state.unit);
    }
    if (blocked || charge.remaining <= 0.01) {
      enemy.charge = null;
      burst(enemy.x, enemy.y, "#c7a27e", 8, 70 * state.unit);
    }
  }

  function resolveEnemyAttack(enemy) {
    enemy.attackCooldown = enemy.baseCooldown * (0.9 + world.rng() * 0.28);
    const unit = state.unit;
    if (enemy.attackKind === "homing") {
      const speed = 245 * unit;
      spawnProjectile(enemy.x, enemy.y, Math.cos(enemy.attackAngle), Math.sin(enemy.attackAngle), {
        friendly: false, damage: enemy.damage, speed, radius: 9 * unit,
        color: enemy.specialColor, life: Math.hypot(world.width, world.height) / speed + 0.5,
        type: "homing", turnRate: 2.4, homingTime: 3
      });
      burst(enemy.x, enemy.y, enemy.specialColor, 10, 75 * unit);
      return;
    }
    if (enemy.attackKind === "shot" || enemy.attackKind === "poisonShot") {
      const poison = enemy.attackKind === "poisonShot";
      spawnProjectile(enemy.x, enemy.y, Math.cos(enemy.attackAngle), Math.sin(enemy.attackAngle), { friendly: false, damage: enemy.damage, speed: (poison ? 165 : 190) * unit, radius: (poison ? 8 : 6) * unit, color: poison ? "#9bc657" : "#79d6e5", life: 3.1, type: poison ? "poison" : "enemy" });
      burst(enemy.x, enemy.y, poison ? "#9bc657" : "#79d6e5", 6, 50 * unit);
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
    if (enemy.attackKind === "beam") {
      const endX = enemy.x + Math.cos(enemy.attackAngle) * enemy.telegraphLength;
      const endY = enemy.y + Math.sin(enemy.attackAngle) * enemy.telegraphLength;
      if (pointToSegmentDistance(player.x, player.y, enemy.x, enemy.y, endX, endY) <= enemy.telegraphWidth * 0.5 + player.radius * unit) damagePlayer(enemy.damage, enemy);
      burst(endX, endY, enemy.specialColor || "#ef6666", 14, 120 * unit);
      state.shakeAmount = state.screenShake ? 10 * unit : 0;
      return;
    }
    if (enemy.attackKind === "charge") {
      enemy.knockX = enemy.knockY = 0;
      enemy.charge = {
        dx: Math.cos(enemy.attackAngle), dy: Math.sin(enemy.attackAngle), remaining: enemy.telegraphLength,
        speed: (enemy.isBoss ? 920 : 760) * unit, hitPlayer: false, trailTimer: 0
      };
      return;
    }
    if (["aoe", "poisonBurst", "storm"].includes(enemy.attackKind)) {
      if (distance(enemy, player) <= enemy.telegraphRadius + player.radius * unit) damagePlayer(enemy.damage, enemy);
      if (enemy.attackKind === "poisonBurst") {
        for (let index = 0; index < 4; index += 1) {
          const angle = enemy.attackAngle + index * Math.PI * 0.5;
          createHazard(enemy.x + Math.cos(angle) * enemy.telegraphRadius * 0.52, enemy.y + Math.sin(angle) * enemy.telegraphRadius * 0.52, 45 * unit, "poison", 5.5);
        }
      }
      if (enemy.attackKind === "storm") {
        for (let index = 0; index < 8; index += 1) {
          const angle = (Math.PI * 2 * index) / 8;
          spawnProjectile(enemy.x, enemy.y, Math.cos(angle), Math.sin(angle), { friendly: false, damage: Math.round(enemy.damage * 0.6), speed: 190 * unit, radius: 6 * unit, color: "#68c9ed", life: 3, type: "enemy" });
        }
      }
      burst(enemy.x, enemy.y, enemy.attackKind === "poisonBurst" ? "#9bc657" : enemy.specialColor || "#ef6666", 24, 155 * unit);
      state.shakeAmount = state.screenShake ? 11 * unit : 0;
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
      if (projectile.homingTime > 0) {
        const heading = Math.atan2(projectile.vy, projectile.vx);
        const desired = Math.atan2(player.y - projectile.y, player.x - projectile.x);
        const difference = Math.atan2(Math.sin(desired - heading), Math.cos(desired - heading));
        const angle = heading + clamp(difference, -projectile.turnRate * dt, projectile.turnRate * dt);
        const speed = Math.hypot(projectile.vx, projectile.vy);
        projectile.vx = Math.cos(angle) * speed;
        projectile.vy = Math.sin(angle) * speed;
        projectile.homingTime = Math.max(0, projectile.homingTime - dt);
      }
      const travel = projectile.type === "nova"
        ? Math.min(1, Math.hypot(projectile.targetX - projectile.x, projectile.targetY - projectile.y) / Math.max(0.001, Math.hypot(projectile.vx, projectile.vy) * dt)) : 1;
      projectile.x += projectile.vx * dt * travel;
      projectile.y += projectile.vy * dt * travel;
      projectile.pulse += dt * 8;
      if (projectile.x < -30 || projectile.x > world.width + 30 || projectile.y < -30 || projectile.y > world.height + 30 || collidesWithObstacle(projectile.x, projectile.y, projectile.radius)) {
        if (projectile.type === "frost") detonateFrost(projectile);
        if (projectile.type === "nova") detonateNova(projectile);
        if (projectile.type === "poison") createHazard(projectile.x, projectile.y, 38 * state.unit, "poison", 4.5);
        projectile.life = 0;
        burst(projectile.x, projectile.y, projectile.color, 4, 40 * state.unit);
        return;
      }
      if (projectile.type === "nova" && (travel < 1 || distance(projectile, { x: projectile.targetX, y: projectile.targetY }) < 0.1 || projectile.life <= 0)) {
        detonateNova(projectile);
        return;
      }
      if (projectile.friendly) {
        for (const enemy of [...world.enemies, ...(world.boss && !world.boss.dead ? [world.boss] : [])]) {
          if (enemy.dead || projectile.hit.has(enemy)) continue;
          if (distance(projectile, enemy) <= projectile.radius + enemy.radius) {
            projectile.hit.add(enemy);
            if (projectile.type === "frost") { detonateFrost(projectile); break; }
            if (projectile.type === "nova") { detonateNova(projectile); break; }
            damageEnemy(enemy, projectile.damage, projectile.vx, projectile.vy, projectile.type);
            if (projectile.type === "ember") {
              enemy.burnTimer = Math.max(enemy.burnTimer, 4.1);
              enemy.burnTick = Math.min(enemy.burnTick || 0.2, 0.2);
              enemy.burnDamage = Math.round(6 * player.power * Math.pow(2, buffStacks("burn_double")));
            }
            projectile.pierce -= 1;
            if (projectile.pierce < 0) { projectile.life = 0; burst(projectile.x, projectile.y, projectile.color, 8, 70 * state.unit); break; }
          }
        }
      } else if (distance(projectile, player) <= projectile.radius + player.radius * state.unit) {
        projectile.life = 0;
        damagePlayer(projectile.damage, projectile);
        if (projectile.type === "poison") {
          player.poisonTimer = Math.max(player.poisonTimer, 4.2);
          player.poisonTick = 0.5;
          createHazard(projectile.x, projectile.y, 38 * state.unit, "poison", 4.5);
        }
        burst(projectile.x, projectile.y, projectile.color, 7, 70 * state.unit);
      }
    });
  }

  function detonateFrost(projectile) {
    if (projectile.detonated) return;
    projectile.detonated = true;
    projectile.life = 0;
    const radius = 66 * state.unit * Math.pow(1.3, buffStacks("frost_range"));
    const freezeDuration = 3;
    [...world.enemies, ...(world.boss && !world.boss.dead ? [world.boss] : [])].forEach((enemy) => {
      if (!enemy.dead && distance(projectile, enemy) <= radius + enemy.radius) {
        damageEnemy(enemy, projectile.damage, projectile.vx * 0.2, projectile.vy * 0.2, "frost");
        enemy.frozen = Math.max(enemy.frozen, freezeDuration);
      }
    });
    burst(projectile.x, projectile.y, "#66cce4", 22, 120 * state.unit);
  }

  function createHazard(x, y, radius, type, life) {
    world.hazards.push({ x, y, radius, type, life, maxLife: life, tick: 0, phase: world.rng() * Math.PI * 2 });
  }

  function updateHazards(dt) {
    world.hazards.forEach((hazard) => {
      hazard.life -= dt;
      hazard.tick -= dt;
      hazard.phase += dt * 5;
      if (hazard.type === "poison" && hazard.tick <= 0 && distance(hazard, player) <= hazard.radius + player.radius * state.unit) {
        hazard.tick = 0.72;
        player.poisonTimer = Math.max(player.poisonTimer, 2.2);
        player.poisonTick = Math.min(player.poisonTick || 0.25, 0.25);
        damagePlayer(4 + Math.floor(state.floor * 0.2), null, true);
      }
    });
  }

  function updatePickups(dt) {
    world.pickups.forEach((pickup) => {
      pickup.life -= dt;
      pickup.phase += dt * 4;
      if (distance(player, pickup) < 25 * state.unit) {
        if (pickup.type === "health") { player.hp = Math.min(player.maxHp, player.hp + 10); showFloater(pickup.x, pickup.y - 12, "+10 HP", "#79c979"); }
        else { player.mana = Math.min(player.maxMana, player.mana + 22); showFloater(pickup.x, pickup.y - 12, "+22 MANA", "#67c8e3"); }
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

  function slashHitsEnemy(slash, enemy) {
    const dx = enemy.x - slash.x;
    const dy = enemy.y - slash.y;
    const dist = Math.hypot(dx, dy);
    if (dist > slash.reach + enemy.radius) return false;
    const offset = Math.atan2(dy, dx) - slash.angle;
    const difference = Math.abs(Math.atan2(Math.sin(offset), Math.cos(offset)));
    if (difference <= slash.halfAngle) return true;
    // Include an enemy only when its body overlaps a boundary of the visible sector.
    const edge = slash.angle + Math.sign(Math.sin(offset)) * slash.halfAngle;
    const along = clamp(dx * Math.cos(edge) + dy * Math.sin(edge), 0, slash.reach);
    return Math.hypot(dx - Math.cos(edge) * along, dy - Math.sin(edge) * along) <= enemy.radius;
  }

  function requestAttack() {
    if (state.scene !== "playing" || player.attackCooldown > 0 || player.blocking || guardRequested()) return;
    cancelCharge();
    player.attackCooldown = 0.38;
    player.attackAnim = SLASH_DURATION;
    const unit = state.unit;
    const aim = aimVector();
    player.facingX = aim.x;
    player.facingY = aim.y;
    if (Math.abs(aim.x) > 0.12) player.lookDirection = Math.sign(aim.x);
    const size = Math.pow(2, buffStacks("long_blade"));
    const reach = SLASH_REACH * unit * size;
    // Damage and animation share this snapshot, even if movement, dash, or aim changes.
    const slash = { x: player.x, y: player.y, angle: Math.atan2(aim.y, aim.x), reach, halfAngle: SLASH_HALF_ANGLE };
    player.slash = slash;
    [...world.enemies, ...(world.boss && !world.boss.dead ? [world.boss] : [])].forEach((enemy) => {
      if (enemy.dead) return;
      if (slashHitsEnemy(slash, enemy)) damageEnemy(enemy, Math.round(24 * player.power * Math.pow(1.5, buffStacks("physical"))), aim.x * 155 * unit, aim.y * 155 * unit, "melee");
    });
    burst(player.x + aim.x * 36 * unit, player.y + aim.y * 36 * unit, "#f2dca4", 4, 62 * unit);
  }

  function cancelCharge() {
    const pointer = input.attackPointer;
    input.attackPointer = null;
    player.chargeTime = 0;
    if (pointer !== null && canvas.hasPointerCapture(pointer)) canvas.releasePointerCapture(pointer);
  }

  function startCharge(pointer) {
    if (state.scene !== "playing" || state.controlMode !== "desktop" || input.attackPointer !== null || player.attackCooldown > 0 || player.blocking || guardRequested()) return;
    input.attackPointer = pointer;
    player.chargeTime = 0;
    canvas.setPointerCapture(pointer);
  }

  function releaseCharge() {
    const held = player.chargeTime;
    cancelCharge();
    if (state.scene !== "playing" || !input.pointerInside || player.attackCooldown > 0 || player.blocking || guardRequested()) return;
    if (held < CHARGE_THRESHOLD) { requestAttack(); return; }
    const strength = clamp(held / CHARGE_DURATION, 0, 1);
    const aim = aimVector();
    const unit = state.unit;
    const speed = lerp(420, 620, strength) * unit;
    player.attackCooldown = 0.5;
    spawnProjectile(player.x + aim.x * 18 * unit, player.y + aim.y * 18 * unit, aim.x, aim.y, {
      friendly: true, damage: Math.round(lerp(16, 48, strength) * player.power * Math.pow(1.5, buffStacks("physical"))),
      speed, radius: lerp(5, 9, strength) * unit * Math.pow(2, buffStacks("long_blade")), color: strength === 1 ? "#ffe2a0" : "#d4def1",
      life: Math.hypot(world.width, world.height) / speed + 0.2, type: "charged", pierce: strength === 1 ? 1 : 0
    });
    burst(player.x + aim.x * 18 * unit, player.y + aim.y * 18 * unit, "#ffe2a0", 8, 90 * unit);
  }

  function castSpell(index = state.selectedSpell) {
    if (state.scene !== "playing" || player.blocking || guardRequested()) return;
    const spell = SPELLS[index];
    state.selectedSpell = index;
    updateSpellSelection();
    if (player.spellCooldowns[index] > 0) { showToast(`${spell.name.toUpperCase()} IS RECHARGING`); return; }
    if (player.mana < spell.cost) { showToast("NOT ENOUGH MANA"); return; }
    cancelCharge();
    player.mana -= spell.cost;
    player.spellCooldowns[index] = spellCooldown(index);
    const unit = state.unit;
    const aim = aimVector();
    player.facingX = aim.x;
    player.facingY = aim.y;
    if (Math.abs(aim.x) > 0.12) player.lookDirection = Math.sign(aim.x);
    if (spell.id === "ember") {
      spawnProjectile(player.x + aim.x * 18 * unit, player.y + aim.y * 18 * unit, aim.x, aim.y, { friendly: true, damage: Math.round(34 * player.power), speed: 345 * unit, radius: 7 * unit, color: spell.color, life: 2.2, type: "ember", pierce: 0 });
      burst(player.x, player.y, spell.color, 8, 75 * unit);
    } else if (spell.id === "frost") {
      spawnProjectile(player.x + aim.x * 18 * unit, player.y + aim.y * 18 * unit, aim.x, aim.y, { friendly: true, damage: Math.round(23 * player.power), speed: 275 * unit, radius: 10 * unit, color: spell.color, life: 2.7, type: "frost", pierce: 0 });
      burst(player.x, player.y, spell.color, 10, 70 * unit);
    } else {
      const target = aimTarget();
      spawnProjectile(player.x, player.y, aim.x, aim.y, {
        friendly: true, damage: Math.round(38 * player.power), speed: 320 * unit,
        radius: 10 * unit, color: spell.color, life: distance(player, target) / (320 * unit) + 0.2,
        type: "nova", targetX: target.x, targetY: target.y, blastRadius: 112 * unit * Math.pow(1.25, buffStacks("nova_range"))
      });
      burst(player.x, player.y, spell.color, 10, 70 * unit);
    }
    updateHud();
  }

  function detonateNova(projectile) {
    if (projectile.detonated) return;
    projectile.detonated = true;
    projectile.life = 0;
    [...world.enemies, ...(world.boss && !world.boss.dead ? [world.boss] : [])].forEach((enemy) => {
      if (!enemy.dead && distance(projectile, enemy) <= projectile.blastRadius + enemy.radius) {
        const dx = enemy.x - projectile.x;
        const dy = enemy.y - projectile.y;
        const length = Math.max(1, Math.hypot(dx, dy));
        damageEnemy(enemy, projectile.damage, (dx / length) * 430 * state.unit, (dy / length) * 430 * state.unit, "nova");
      }
    });
    const radius = projectile.blastRadius;
    createHazard(projectile.x, projectile.y, radius, "nova", 0.6);
    for (let index = 0; index < 32; index += 1) {
      const angle = Math.PI * 2 * index / 32;
      const nx = Math.cos(angle), ny = Math.sin(angle);
      // Edge sparks and the inner wave scale from the same radius used for damage.
      addParticle(projectile.x + nx * radius, projectile.y + ny * radius, -nx * radius * 0.18, -ny * radius * 0.18, projectile.color, 0.6, 4 * state.unit);
      addParticle(projectile.x + nx * radius * 0.2, projectile.y + ny * radius * 0.2, nx * radius * 2.4, ny * radius * 2.4, "#e5c2ff", 0.6, 3 * state.unit);
    }
    state.shakeAmount = state.screenShake ? 7 * state.unit : 0;
  }

  function spawnProjectile(x, y, dx, dy, options) {
    const length = Math.max(0.001, Math.hypot(dx, dy));
    world.projectiles.push({ x, y, vx: (dx / length) * options.speed, vy: (dy / length) * options.speed, friendly: options.friendly, damage: options.damage, radius: options.radius, color: options.color, life: options.life, type: options.type, pierce: options.pierce ?? 0, hit: new Set(), pulse: 0, detonated: false, targetX: options.targetX, targetY: options.targetY, blastRadius: options.blastRadius, turnRate: options.turnRate || 0, homingTime: options.homingTime || 0 });
  }

  function requestDash() {
    if (state.scene !== "playing" || player.dashCooldown > 0 || player.blocking || guardRequested()) return;
    cancelCharge();
    const movement = moveVector();
    const length = Math.hypot(movement.x, movement.y);
    const dx = length > 0.1 ? movement.x / length : player.facingX;
    const dy = length > 0.1 ? movement.y / length : player.facingY;
    const distanceToTravel = 112 * state.unit;
    for (let step = 0; step < 8; step += 1) {
      addParticle(player.x, player.y, -dx * 25 * state.unit, -dy * 25 * state.unit, "#d9b8ff", 0.3, 6 * state.unit);
      moveEntity(player, dx * distanceToTravel / 8, dy * distanceToTravel / 8, player.radius * state.unit);
    }
    player.facingX = dx;
    player.facingY = dy;
    if (Math.abs(dx) > 0.12) player.lookDirection = Math.sign(dx);
    player.invulnerable = Math.max(player.invulnerable, 0.24);
    player.dashTimer = 0.2;
    player.dashCooldown = 1.15 * Math.pow(0.75, buffStacks("dash"));
  }

  function damageEnemy(enemy, amount, forceX = 0, forceY = 0, source = "melee") {
    if (enemy.dead) return;
    enemy.hp = Math.max(0, enemy.hp - amount);
    enemy.flash = 0.12;
    enemy.hurtVisible = 1.4;
    const knockScale = enemy.isBoss ? 0.22 : 1;
    enemy.knockX += forceX * knockScale;
    enemy.knockY += forceY * knockScale;
    showFloater(enemy.x, enemy.y - enemy.radius, String(amount), source === "frost" ? "#9ce8f4" : source === "nova" ? "#d7a3ff" : source === "burn" ? "#ff8b4c" : source === "shockwave" ? "#fff1b1" : "#ffe2a0");
    burst(enemy.x, enemy.y, enemy.isBoss ? "#cf5363" : "#d8c8a3", enemy.isBoss ? 9 : 5, 68 * state.unit);
    state.shakeAmount = state.screenShake ? (enemy.isBoss ? 4 : 2) * state.unit : 0;
    if (enemy.hp <= 0) killEnemy(enemy);
  }

  function killEnemy(enemy) {
    if (enemy.dead) return;
    enemy.dead = true;
    enemy.telegraph = 0;
    enemy.charge = null;
    enemy.chargeTrail = [];
    enemy.deathTimer = enemy.isBoss ? 0.9 : 0.32;
    state.kills += 1;
    burst(enemy.x, enemy.y, enemy.isBoss ? "#e15f71" : "#b8a88a", enemy.isBoss ? 36 : 14, (enemy.isBoss ? 190 : 105) * state.unit);
    if (enemy.isBoss) {
      world.projectiles = world.projectiles.filter((projectile) => projectile.friendly);
      world.floorCleared = true;
      const stairPosition = findClearPoint(world.width * 0.5, Math.max(68 * state.unit, world.height * 0.14), stairClearance());
      world.stairs = { x: stairPosition.x, y: stairPosition.y, phase: 0 };
      ui.bossHud.classList.add("is-hidden");
      player.hp = Math.min(player.maxHp, player.hp + 14);
      player.mana = player.maxMana;
      state.shakeAmount = state.screenShake ? 15 * state.unit : 0;
      showToast("GUARDIAN DEFEATED · FIND THE STAIRS");
      updateObjective();
    } else if (world.rng() < 0.18) world.pickups.push({ x: enemy.x, y: enemy.y, type: world.rng() < 0.48 ? "health" : "mana", life: 12, phase: 0 });
  }

  function damagePlayer(amount, attacker, bypassBlock = false) {
    if (state.scene !== "playing" || player.invulnerable > 0) return;
    let finalDamage = amount;
    if (player.blocking && !bypassBlock) {
      const perfect = performance.now() - player.blockStartedAt < 260;
      if (perfect) {
        finalDamage = 0;
        player.stamina = Math.min(player.maxStamina, player.stamina + 18);
        showFloater(player.x, player.y - 31 * state.unit, "PERFECT", "#ffe2a0");
        if (attacker && attacker.stunned !== undefined) attacker.stunned = 0.9;
        burst(player.x, player.y, "#ffe2a0", 12, 95 * state.unit);
        if (buffStacks("perfect_wave") > 0) {
          const radius = 150 * state.unit;
          [...world.enemies, ...(world.boss && !world.boss.dead ? [world.boss] : [])].forEach((enemy) => {
            if (!enemy.dead && distance(player, enemy) <= radius + enemy.radius) {
              const dx = enemy.x - player.x;
              const dy = enemy.y - player.y;
              const length = Math.max(1, Math.hypot(dx, dy));
              damageEnemy(enemy, Math.max(1, Math.ceil(enemy.hp * 0.5)), (dx / length) * 280 * state.unit, (dy / length) * 280 * state.unit, "shockwave");
            }
          });
          burst(player.x, player.y, "#fff1b1", 28, 190 * state.unit);
        }
      } else {
        finalDamage = Math.max(1, Math.round(amount * 0.24));
        player.stamina = Math.max(0, player.stamina - 15);
        showFloater(player.x, player.y - 30 * state.unit, "BLOCK", "#b9c9d8");
      }
    }
    if (finalDamage > 0) {
      player.chamberHealth = Math.max(0, player.chamberHealth - finalDamage);
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
    expireChamberBuff();
    state.scene = "transition";
    const nextFloor = state.floor + 1;
    ui.transitionFloor.textContent = `FLOOR ${nextFloor}`;
    ui.floorTransition.classList.remove("is-hidden");
    clearTimeout(state.transitionTimer);
    state.transitionTimer = setTimeout(() => {
      state.floor = Number.isSafeInteger(nextFloor) ? nextFloor : state.floor;
      player.maxHp = Math.min(220, player.maxHp + 3);
      player.hp = Math.min(player.maxHp, player.hp + 20);
      player.maxMana = Math.min(140, player.maxMana + 1);
      player.mana = player.maxMana;
      player.power = 1 + state.floor * 0.045;
      generateFloor(state.floor);
      ui.floorTransition.classList.add("is-hidden");
      showBuffChoices();
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
      const ratio = clamp(player.spellCooldowns[index] / spellCooldown(index), 0, 1);
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
    if (input.mouseClientX !== null) updateFacingFromPointer({ clientX: input.mouseClientX, clientY: input.mouseClientY });
    const mouseControl = state.scene === "playing" && state.controlMode === "desktop";
    canvas.classList.toggle("is-playing", mouseControl);
    canvas.classList.toggle("is-aiming", mouseControl && input.hasMouseAim && input.pointerInside);
    if (ui.game.classList.contains("is-hidden")) return;
    const shake = state.screenShake ? state.shakeAmount : 0;
    state.shakeX = Math.round((Math.random() - 0.5) * shake);
    state.shakeY = Math.round((Math.random() - 0.5) * shake);
    ctx.save();
    ctx.translate(state.shakeX, state.shakeY);
    drawBackground(time);
    drawStairs(time);
    drawObstacles();
    drawHazards(time);
    drawPickups();
    [...world.enemies, ...(world.boss ? [world.boss] : []), player].sort((a, b) => a.y - b.y).forEach((actor) => actor === player ? drawPlayer(time) : drawEnemy(actor, time));
    drawProjectiles();
    drawParticles();
    drawFloaters();
    drawLighting(time);
    ctx.restore();
    drawCrosshair();
  }

  function drawCrosshair() {
    if (state.scene !== "playing" || state.controlMode !== "desktop" || !input.hasMouseAim || !input.pointerInside) return;
    const charging = input.attackPointer !== null;
    const progress = charging ? clamp(player.chargeTime / CHARGE_DURATION, 0, 1) : 0;
    const ready = charging && progress === 1;
    const scale = clamp(state.unit, 0.85, 1.3);
    const radius = (charging ? lerp(22, 7, progress) : 11) * scale;
    ctx.save();
    // Draw after the camera transform so this cursor stays exactly under the mouse.
    ctx.translate(input.mouseX, input.mouseY);
    ctx.strokeStyle = ready ? "#ffe2a0" : charging ? "#e8ca87" : "#edf1f7";
    ctx.fillStyle = ctx.strokeStyle;
    ctx.lineWidth = 1.5 * scale;
    ctx.shadowColor = ready ? "#ffc966" : "#080a0f";
    ctx.shadowBlur = ready ? 15 * scale : 3;
    ctx.beginPath();
    for (let index = 0; index < 4; index += 1) {
      const angle = index * Math.PI / 2;
      ctx.moveTo(Math.cos(angle) * (radius + 3 * scale), Math.sin(angle) * (radius + 3 * scale));
      ctx.lineTo(Math.cos(angle) * (radius + 9 * scale), Math.sin(angle) * (radius + 9 * scale));
    }
    ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0, radius, 0, Math.PI * 2); ctx.stroke();
    ctx.fillRect(-scale, -scale, 2 * scale, 2 * scale);
    if (charging) {
      ctx.lineWidth = 3 * scale;
      ctx.beginPath(); ctx.arc(0, 0, radius, -Math.PI / 2, -Math.PI / 2 + progress * Math.PI * 2); ctx.stroke();
    }
    if (ready) {
      ctx.font = `bold ${10 * scale}px monospace`;
      ctx.textAlign = "center";
      ctx.fillText("READY", 0, 30 * scale);
    }
    ctx.restore();
  }

  function drawBackground(time) {
    const { width: w, height: h } = world;
    const unit = state.unit;
    const sprite = sprites[world.theme === "grass" ? "tutorial" : "dungeon"];
    ctx.fillStyle = world.theme === "grass" ? "#2c4829" : "#222832";
    ctx.fillRect(-20, -20, w + 40, h + 40);
    if (sprite.image) {
      const image = sprite.image;
      const scale = Math.max(w / image.naturalWidth, h / image.naturalHeight);
      const sourceW = w / scale, sourceH = h / scale;
      ctx.drawImage(image, (image.naturalWidth - sourceW) / 2, (image.naturalHeight - sourceH) / 2, sourceW, sourceH, 0, 0, w, h);
    }
    const border = Math.max(12, 20 * unit);
    ctx.fillStyle = "rgba(8,12,16,.58)";
    ctx.fillRect(0, 0, w, border); ctx.fillRect(0, h - border, w, border); ctx.fillRect(0, 0, border, h); ctx.fillRect(w - border, 0, border, h);
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
    world.obstacles.forEach((obstacle) => {
      ctx.save();
      ctx.translate(obstacle.x + obstacle.w / 2, obstacle.y + obstacle.h / 2);
      const horizontal = obstacle.w > obstacle.h;
      if (horizontal) ctx.rotate(Math.PI / 2);
      // The cropped stone fills exactly the same rectangle used by collisions.
      const w = horizontal ? obstacle.h : obstacle.w;
      const h = horizontal ? obstacle.w : obstacle.h;
      drawSprite("wall", -w / 2, -h / 2, w, h);
      ctx.restore();
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
    const bounds = stairBounds();
    drawSprite("stairs", bounds.x, bounds.y, bounds.w, bounds.h);
    ctx.fillStyle = "#f4ca71"; ctx.font = `bold ${Math.max(10, 12 * unit)}px monospace`; ctx.textAlign = "center"; ctx.fillText("DESCEND", x, bounds.y + bounds.h + 17 * unit);
  }

  function drawPlayer(time) {
    const unit = state.unit;
    const moving = Math.abs(moveVector().x) + Math.abs(moveVector().y) > 0;
    const bob = moving ? Math.sin(player.walkCycle) * 2 * unit : Math.sin(time * 0.003) * 0.7 * unit;
    if (player.attackAnim > 0 && player.slash) {
      const { x, y, angle, reach, halfAngle } = player.slash;
      const progress = 1 - player.attackAnim / SLASH_DURATION;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(angle);
      // The faint sector is the exact damage footprint. Its curved edge and the
      // sweeping crescent share the attack's saved angle and reach, never movement-facing.
      ctx.fillStyle = "#ffe1a0";
      ctx.globalAlpha = (1 - progress) * 0.13;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, reach, -halfAngle, halfAngle); ctx.closePath(); ctx.fill();
      ctx.globalAlpha = 0.65 * (1 - progress * 0.6);
      ctx.beginPath();
      ctx.arc(0, 0, reach, -halfAngle, halfAngle);
      ctx.arc(0, 0, reach * 0.78, halfAngle, -halfAngle, true);
      ctx.closePath(); ctx.fill();
      ctx.globalAlpha = 0.95 * (1 - progress * 0.65);
      ctx.strokeStyle = "#ffe1a0";
      ctx.lineWidth = 3 * unit * 0.75;
      ctx.lineCap = "round";
      ctx.beginPath();
      const start = -halfAngle + progress * (halfAngle * 2 - 1.3);
      ctx.arc(0, 0, reach * 0.94, start, start + 1.3);
      ctx.stroke();
      ctx.restore();
    }
    ctx.save(); ctx.translate(Math.round(player.x), Math.round(player.y + bob));
    ctx.globalAlpha = player.invulnerable > 0 && Math.floor(player.invulnerable * 18) % 2 ? 0.45 : 1;
    if (player.dashTimer > 0) { ctx.fillStyle = "rgba(205,165,255,.24)"; ctx.fillRect(-25 * unit, -30 * unit, 50 * unit, 58 * unit); }
    ctx.fillStyle = "rgba(0,0,0,.32)"; ctx.fillRect(-16 * unit, 15 * unit, 32 * unit, 8 * unit);
    if (player.blocking) {
      const aim = aimVector();
      ctx.save(); ctx.rotate(Math.atan2(aim.y, aim.x));
      ctx.strokeStyle = performance.now() - player.blockStartedAt < 260 ? "#ffe2a0" : "#aebdca";
      ctx.lineWidth = 4 * unit; ctx.beginPath(); ctx.arc(0, 0, 23 * unit, -1.1, 1.1); ctx.stroke(); ctx.restore();
    }
    drawActorSprite("player", 52 * unit, player.lookDirection > 0, player.hurtFlash > 0, 0.58);
    ctx.restore();
    if (player.blocking || player.stamina < player.maxStamina - 1) drawMiniBar(player.x, player.y + 31 * unit, 40 * unit, player.stamina / player.maxStamina, player.guardBroken > 0 ? "#b34848" : "#d2bd78");
  }

  function drawEnemy(enemy, time) {
    if (enemy.dead && enemy.deathTimer <= 0) return;
    const unit = state.unit;
    const spriteId = enemy.isBoss ? enemy.variant : enemy.type;
    const height = (enemy.isBoss ? 86 : { slime: 30, skeleton: 48, wisp: 46, spitter: 38, charger: 42, cultist: 50, sentinel: 54 }[enemy.type]) * unit;
    const nativeRight = enemy.type === "charger" || enemy.type === "spitter";
    const lookingRight = enemy.charge ? enemy.charge.dx >= 0 : player.x > enemy.x;
    const flipped = enemy.isBoss && !enemy.charge ? false : lookingRight !== nativeRight;
    const deathScale = enemy.dead ? clamp(enemy.deathTimer / (enemy.isBoss ? 0.9 : 0.32), 0, 1) : 1;
    if (enemy.telegraph > 0) drawAttackTelegraph(enemy, time);
    enemy.chargeTrail.forEach((point) => {
      ctx.save(); ctx.translate(point.x, point.y);
      ctx.globalAlpha = point.life / 0.18 * 0.3;
      drawActorSprite(spriteId, height, flipped);
      ctx.restore();
    });
    ctx.save(); ctx.translate(Math.round(enemy.x), Math.round(enemy.y + Math.sin(time * 0.004 + enemy.walk) * 2 * unit)); ctx.scale(deathScale, deathScale); ctx.globalAlpha = enemy.dead ? deathScale : 1;
    ctx.fillStyle = "rgba(0,0,0,.3)"; ctx.fillRect(-enemy.radius, enemy.radius * 0.68, enemy.radius * 2, 8 * unit);
    if (enemy.charge) {
      ctx.save(); ctx.rotate(enemy.attackAngle);
      ctx.strokeStyle = enemy.specialColor || "#e4b38b"; ctx.lineWidth = 2 * unit;
      for (const offset of [-10, 0, 10]) {
        ctx.beginPath(); ctx.moveTo(-enemy.radius - 5 * unit, offset * unit);
        ctx.lineTo(-enemy.radius - 32 * unit, offset * unit); ctx.stroke();
      }
      ctx.restore();
    }
    drawActorSprite(spriteId, height, flipped, enemy.flash > 0);
    if (enemy.frozen > 0) { ctx.strokeStyle = "#9ce8f4"; ctx.lineWidth = 3 * unit; ctx.strokeRect(-enemy.radius - 4 * unit, -enemy.radius - 9 * unit, enemy.radius * 2 + 8 * unit, enemy.radius * 2 + 13 * unit); }
    if (enemy.burnTimer > 0) { ctx.fillStyle = Math.floor(time / 80) % 2 ? "#ffb34e" : "#f0623e"; ctx.fillRect(-6 * unit, -enemy.radius - 13 * unit, 6 * unit, 10 * unit); ctx.fillRect(3 * unit, -enemy.radius - 8 * unit, 5 * unit, 7 * unit); }
    ctx.restore();
    if (!enemy.isBoss && enemy.hurtVisible > 0 && !enemy.dead) drawMiniBar(enemy.x, enemy.y - enemy.radius - 14 * unit, 34 * unit, enemy.hp / enemy.maxHp, "#d85a5d");
  }

  function drawAttackTelegraph(enemy, time) {
    const progress = 1 - enemy.telegraph / enemy.telegraphMax;
    const urgent = enemy.telegraph < 0.34;
    const flash = urgent ? (Math.floor(time / 55) % 2 ? 0.78 : 0.2) : 0.18 + progress * 0.24;
    const directional = ["shot", "poisonShot", "beam", "charge"].includes(enemy.attackKind);
    ctx.save();
    ctx.fillStyle = `rgba(244,65,65,${flash * 0.55})`;
    ctx.strokeStyle = `rgba(255,122,105,${Math.min(1, flash + 0.25)})`;
    ctx.lineWidth = Math.max(2, (2 + progress * 2) * state.unit);
    if (enemy.attackKind === "homing") {
      ctx.beginPath(); ctx.arc(enemy.x, enemy.y, enemy.radius + 8 * state.unit, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(player.x, player.y, (player.radius + 12) * state.unit, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([5 * state.unit, 5 * state.unit]);
      ctx.beginPath(); ctx.moveTo(enemy.x, enemy.y); ctx.lineTo(player.x, player.y); ctx.stroke();
      ctx.restore();
      return;
    }
    if (directional) {
      ctx.translate(enemy.x, enemy.y);
      ctx.rotate(enemy.attackAngle);
      const width = Math.max(14 * state.unit, enemy.telegraphWidth || 20 * state.unit);
      const length = enemy.telegraphLength || 360 * state.unit;
      ctx.fillRect(0, -width / 2, length, width);
      ctx.strokeRect(0, -width / 2, length, width);
      ctx.globalAlpha = 0.45;
      for (let x = (time * 0.18) % (32 * state.unit); x < length; x += 32 * state.unit) ctx.fillRect(x, -width / 2, 8 * state.unit, width);
    } else {
      const radius = enemy.attackKind === "burst" ? 72 * state.unit : enemy.telegraphRadius || enemy.range || 45 * state.unit;
      ctx.beginPath(); ctx.arc(enemy.x, enemy.y, radius, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.arc(enemy.x, enemy.y, radius * progress, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.restore();
  }

  function drawActorSprite(id, height, flipped = false, flash = false, anchorX = 0.5) {
    const width = height * spriteAspect(id);
    ctx.save();
    if (flipped) ctx.scale(-1, 1);
    if (flash) ctx.filter = "brightness(2)";
    drawSprite(id, -width * anchorX, -height * 0.65, width, height);
    ctx.restore();
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
      if (projectile.type === "homing") {
        ctx.save(); ctx.translate(projectile.x, projectile.y); ctx.rotate(Math.atan2(projectile.vy, projectile.vx));
        ctx.strokeStyle = `${projectile.color}88`; ctx.lineWidth = projectile.radius;
        ctx.beginPath(); ctx.moveTo(-projectile.radius * 4, 0); ctx.lineTo(0, 0); ctx.stroke();
        ctx.shadowColor = projectile.color; ctx.shadowBlur = 14 * state.unit;
        ctx.fillStyle = projectile.color; ctx.beginPath(); ctx.arc(0, 0, projectile.radius, 0, Math.PI * 2); ctx.fill();
        ctx.shadowBlur = 0; ctx.fillStyle = "#fff1e6";
        ctx.beginPath(); ctx.arc(0, 0, projectile.radius * 0.42, 0, Math.PI * 2); ctx.fill(); ctx.restore();
        return;
      }
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

  function drawHazards(time) {
    world.hazards.forEach((hazard) => {
      if (hazard.type === "nova") {
        ctx.save();
        ctx.globalAlpha = clamp(hazard.life / hazard.maxLife, 0, 1);
        ctx.fillStyle = "rgba(190,132,240,.18)";
        ctx.strokeStyle = "#d7a3ff";
        ctx.lineWidth = 4 * state.unit;
        ctx.shadowColor = "#be84f0"; ctx.shadowBlur = 12 * state.unit;
        ctx.beginPath(); ctx.arc(hazard.x, hazard.y, hazard.radius, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.shadowBlur = 0;
        const progress = clamp((hazard.maxLife - hazard.life) / 0.18, 0, 1);
        ctx.strokeStyle = "#f2dbff";
        ctx.beginPath(); ctx.arc(hazard.x, hazard.y, hazard.radius * progress, 0, Math.PI * 2); ctx.stroke();
        ctx.restore();
        return;
      }
      const pulse = 0.68 + Math.sin(time * 0.008 + hazard.phase) * 0.13;
      const alpha = clamp(hazard.life / Math.min(1, hazard.maxLife), 0, 1);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = hazard.type === "poison" ? `rgba(130,178,69,${0.24 + pulse * 0.12})` : "rgba(220,90,55,.3)";
      ctx.strokeStyle = hazard.type === "poison" ? "#9bc657" : "#e36b4e";
      ctx.lineWidth = 2 * state.unit;
      ctx.beginPath(); ctx.arc(hazard.x, hazard.y, hazard.radius, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = "rgba(222,244,151,.35)";
      for (let index = 0; index < 5; index += 1) {
        const angle = hazard.phase + index * 1.31;
        const radius = hazard.radius * (0.2 + index * 0.12);
        ctx.fillRect(hazard.x + Math.cos(angle) * radius - 3 * state.unit, hazard.y + Math.sin(angle) * radius - 3 * state.unit, 6 * state.unit, 6 * state.unit);
      }
      ctx.restore();
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
    if (!rect.width || !rect.height) return null;
    return { x: ((event.clientX - rect.left) / rect.width) * canvas.width, y: ((event.clientY - rect.top) / rect.height) * canvas.height };
  }

  function updateFacingFromPointer(event) {
    input.mouseClientX = event.clientX;
    input.mouseClientY = event.clientY;
    const pointer = pointerPosition(event);
    if (!pointer) { input.pointerInside = false; return; }
    input.mouseX = pointer.x;
    input.mouseY = pointer.y;
    input.hasMouseAim = true;
    input.pointerInside = pointer.x >= 0 && pointer.x <= canvas.width && pointer.y >= 0 && pointer.y <= canvas.height;
    const aim = aimVector();
    if (Math.abs(aim.x) > 0.12) player.lookDirection = Math.sign(aim.x);
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
    return [ui.gameOver, ui.settings, ui.tutorial, ui.pause, ui.buffModal].find((modal) => !modal.classList.contains("is-hidden"));
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
    $$(".spell-slot").forEach((slot, index) => slot.addEventListener("click", () => { state.selectedSpell = index; updateSpellSelection(); if (state.controlMode === "mobile") castSpell(index); }));

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
      if (event.code === "KeyE") cancelCharge();
      if (event.repeat) return;
      if (event.code === "ShiftLeft") { event.preventDefault(); requestDash(); return; }
      if (["Digit1", "Digit2", "Digit3", "Numpad1", "Numpad2", "Numpad3"].includes(event.code)) { event.preventDefault(); state.selectedSpell = Number(event.code.slice(-1)) - 1; updateSpellSelection(); }
    });
    window.addEventListener("keyup", (event) => input.keys.delete(event.code));
    window.addEventListener("blur", clearInput);
    document.addEventListener("visibilitychange", () => { if (document.hidden) { clearInput(); if (state.scene === "playing") openPause(); } });
    window.addEventListener("resize", resizeCanvas);

    canvas.addEventListener("pointerenter", (event) => { if (event.pointerType === "mouse" && state.scene === "playing") updateFacingFromPointer(event); });
    canvas.addEventListener("pointerleave", () => { input.pointerInside = false; });
    window.addEventListener("pointermove", (event) => { if (event.pointerType === "mouse") updateFacingFromPointer(event); });
    canvas.addEventListener("pointerdown", (event) => {
      if (event.pointerType !== "mouse" || state.scene !== "playing" || state.controlMode !== "desktop") return;
      event.preventDefault();
      updateFacingFromPointer(event);
      if (event.button === 0) startCharge(event.pointerId);
      if (event.button === 2) castSpell(state.selectedSpell);
    });
    canvas.addEventListener("pointerup", (event) => {
      if (event.pointerType !== "mouse" || event.button !== 0 || event.pointerId !== input.attackPointer) return;
      updateFacingFromPointer(event);
      releaseCharge();
    });
    const cancelPointerCharge = (event) => { if (event.pointerId === input.attackPointer) cancelCharge(); };
    canvas.addEventListener("pointercancel", cancelPointerCharge);
    canvas.addEventListener("lostpointercapture", cancelPointerCharge);
    canvas.addEventListener("contextmenu", (event) => event.preventDefault());

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
    ui.mobileDash.addEventListener("pointerdown", (event) => { event.preventDefault(); ui.mobileDash.classList.add("is-pressed"); requestDash(); });
    const releaseDash = () => ui.mobileDash.classList.remove("is-pressed");
    ui.mobileDash.addEventListener("pointerup", releaseDash); ui.mobileDash.addEventListener("pointercancel", releaseDash);
  }

  function initialize() {
    ui.play.disabled = true;
    loadSprites().then(() => {
      ui.play.disabled = false;
      ui.assetStatus.classList.add("is-hidden");
    }).catch((error) => {
      ui.assetStatus.textContent = "Sprites could not load. Refresh to try again.";
      console.error(error);
    });
    buildMenuParticles();
    bindEvents();
    applyControlMode();
    renderControlsReference();
    ui.shakeToggle.classList.toggle("active", state.screenShake);
    ui.shakeToggle.setAttribute("aria-checked", String(state.screenShake));
    updateSpellSelection();
    const modalObserver = new MutationObserver(syncModalInert);
    [ui.gameOver, ui.settings, ui.tutorial, ui.pause, ui.buffModal].forEach((modal) => modalObserver.observe(modal, { attributes: true, attributeFilter: ["class"] }));
    updateBestRun();
    syncModalInert();
    state.lastTime = performance.now();
    requestAnimationFrame(gameLoop);
  }

  initialize();
})();
