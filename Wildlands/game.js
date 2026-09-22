(function () {
  'use strict';

  const V = window.Voxel = window.Voxel || {};
  const SAVE_KEY = 'wildlands.save.v1';
  const SETTINGS_KEY = 'wildlands.settings.v1';
  const DEFAULT_SEED = 'wildlands';
  const HOTBAR = [1, 2, 3, 5, 7, 8, 9, 10, 17];
  const HEIGHT = 1.8, RADIUS = 0.3, EYE = 1.62, EPS = 0.00001;
  const NON_SOLID = new Set([0, 11, 15, 17]);
  const NAMES = { 1: 'Grass', 2: 'Dirt', 3: 'Stone', 4: 'Sand', 5: 'Oak log', 6: 'Leaves', 7: 'Oak planks', 8: 'Cobblestone', 9: 'Glass', 10: 'Bricks', 11: 'Water', 12: 'Coal ore', 13: 'Iron ore', 14: 'Snow', 15: 'Wildflowers', 16: 'Bedrock', 17: 'Torch' };
  const RECIPES = [
    { id: 'planks', name: 'Oak planks', output: 7, count: 4, ingredients: { 5: 1 } },
    { id: 'torches', name: 'Torches', output: 17, count: 4, ingredients: { 7: 1, 12: 1 } },
    { id: 'glass', name: 'Glass', output: 9, count: 4, ingredients: { 4: 4, 12: 1 } },
    { id: 'bricks', name: 'Bricks', output: 10, count: 4, ingredients: { 8: 4, 12: 1 } },
    { id: 'stone', name: 'Smooth stone', output: 3, count: 4, ingredients: { 8: 4, 12: 1 } },
    { id: 'soil', name: 'Grass block', output: 1, count: 4, ingredients: { 2: 4, 15: 1 } }
  ];
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const finite = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;
  const solid = id => Number.isFinite(id) && !NON_SOLID.has(id);
  const ui = () => window.UI || V.UI || {};
  function callUI(method, ...args) { const fn = ui()[method]; if (typeof fn === 'function') fn.apply(ui(), args); }
  function readStorage(key) { try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch (_) { return null; } }
  function writeStorage(key, data) { localStorage.setItem(key, JSON.stringify(data)); }

  class Sounds {
    constructor() { this.context = null; this.volume = 0.3; }
    unlock() {
      try {
        const Audio = window.AudioContext || window.webkitAudioContext;
        if (!Audio) return;
        this.context = this.context || new Audio();
        if (this.context.state === 'suspended') this.context.resume().catch(() => {});
      } catch (_) { /* Sound is optional. */ }
    }
    play(type) {
      const ctx = this.context;
      if (!ctx || ctx.state !== 'running' || this.volume <= 0) return;
      try {
        const gain = ctx.createGain();
        const filter = ctx.createBiquadFilter();
        const isStep = type === 'step';
        const duration = isStep ? 0.055 : type === 'break' ? 0.13 : 0.085;
        const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * duration), ctx.sampleRate);
        const channel = buffer.getChannelData(0);
        for (let i = 0; i < channel.length; i++) channel[i] = (Math.random() * 2 - 1) * (1 - i / channel.length);
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        filter.type = 'lowpass';
        filter.frequency.value = isStep ? 600 : type === 'break' ? 1800 : 950;
        gain.gain.setValueAtTime(this.volume * (isStep ? 0.13 : 0.25), ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
        source.connect(filter); filter.connect(gain); gain.connect(ctx.destination);
        source.start(); source.stop(ctx.currentTime + duration);
        source.onended = () => { source.disconnect(); filter.disconnect(); gain.disconnect(); };
      } catch (_) { /* Unsupported audio never interrupts a game. */ }
    }
  }

  class Game {
    constructor(canvas) {
      this.canvas = canvas;
      this.settings = Object.assign({ quality: 'high', renderDistance: 8, sensitivity: 1, volume: 0.3 }, this.validSettings(readStorage(SETTINGS_KEY)));
      this.seed = DEFAULT_SEED;
      this.mode = 'creative';
      this.world = new V.World(this.seed);
      this.renderer = new V.Renderer(canvas, this.world);
      this.fauna = this.renderer.fauna || null;
      this.renderer.setSettings(this.settings);
      this.player = this.makePlayer(this.world.getSpawn());
      this.hotbar = HOTBAR.slice();
      this.selected = 0;
      this.inventory = this.emptyInventory();
      this.health = 20;
      this.hunger = 20;
      this.food = 3;
      this.playing = false;
      this.paused = true;
      this.inventoryOpen = false;
      this.photo = false;
      this.flying = false;
      this.time = 540;
      this.dayLength = 1200;
      this.target = null;
      this.mineProgress = 0;
      this.miningKey = '';
      this.keys = new Set();
      this.mouseDown = false;
      this.dragging = false;
      this.lastPointer = null;
      this.pointerLocked = false;
      this.pointerLockSupported = typeof canvas.requestPointerLock === 'function';
      this.ignoreUnlock = false;
      this.lastMine = 0;
      this.lastPlace = 0;
      this.lastUI = 0;
      this.lastSave = performance.now();
      this.saveStatus = readStorage(SAVE_KEY) ? 'Saved world available' : 'Ready to explore';
      this.hasSave = !!this.readSaved();
      this.movedDistance = 0;
      this.stepDistance = 0;
      this.regenerationTime = 0;
      this.sounds = new Sounds();
      this.sounds.volume = this.settings.volume;
      this.renderFailed = false;
      this.bindEvents();
      this.resize();
      this.lastFrame = performance.now();
      this.frame = this.frame.bind(this);
      requestAnimationFrame(this.frame);
    }

    makePlayer(spawn) {
      return { x: finite(spawn.x, 0.5), y: finite(spawn.y, 35), z: finite(spawn.z, 18.5), yaw: finite(spawn.yaw, 0), pitch: finite(spawn.pitch, -0.08), vx: 0, vy: 0, vz: 0, grounded: false, swimming: false, bob: 0 };
    }
    emptyInventory() { const result = {}; for (let i = 1; i <= 17; i++) result[i] = 0; return result; }
    validSettings(data) {
      if (!data || typeof data !== 'object') return {};
      const result = {};
      if (['low', 'medium', 'high'].includes(data.quality)) result.quality = data.quality;
      else if (data.quality === 'ultra') result.quality = 'high';
      if (Number.isFinite(Number(data.renderDistance))) result.renderDistance = clamp(Math.round(Number(data.renderDistance)), 3, 10);
      if (Number.isFinite(Number(data.sensitivity))) result.sensitivity = clamp(Number(data.sensitivity), 0.1, 3);
      if (Number.isFinite(Number(data.volume))) result.volume = clamp(Number(data.volume), 0, 1);
      return result;
    }
    readSaved(seed) {
      const raw = seed === undefined ? readStorage(SAVE_KEY) : readStorage(SAVE_KEY + '.' + String(seed));
      if (!raw) return null;
      try { return this.validateSave(raw); } catch (_) { return null; }
    }

    start(options = {}, restoredSave = null) {
      let data = restoredSave ? this.validateSave(restoredSave) : null;
      if (this.playing) this.save(true);
      const requestedSeed = typeof options.seed === 'string' || typeof options.seed === 'number' ? String(options.seed).trim().slice(0, 96) : '';
      if (!data && !options.newWorld) data = this.readSaved(requestedSeed || undefined);
      this.seed = data ? data.seed : requestedSeed || DEFAULT_SEED;
      this.mode = data ? data.mode : options.mode === 'survival' ? 'survival' : 'creative';
      this.world = new V.World(this.seed);
      if (data) this.world.loadEdits(data.edits);
      this.renderer.setWorld(this.world);
      this.fauna = this.renderer.fauna || null;
      this.renderer.setSettings(this.settings);
      this.player = this.makePlayer(data ? data.player : this.world.getSpawn());
      this.hotbar = data ? data.hotbar.slice() : HOTBAR.slice();
      this.selected = data ? data.selected : 0;
      this.inventory = data ? Object.assign(this.emptyInventory(), data.inventory) : this.emptyInventory();
      this.health = data ? data.health : 20;
      this.hunger = data ? data.hunger : 20;
      this.food = data ? data.food : 3;
      this.time = data ? data.time : 540;
      this.flying = data ? data.flying && this.mode === 'creative' : false;
      this.inventoryOpen = false;
      this.photo = false;
      this.playing = true;
      this.paused = false;
      this.keys.clear();
      this.mouseDown = false;
      this.dragging = false;
      this.lastPointer = null;
      this.renderFailed = false;
      this.target = null;
      this.mineProgress = 0;
      this.miningKey = '';
      this.movedDistance = 0;
      this.stepDistance = 0;
      this.regenerationTime = 0;
      this.renderer.photo = false;
      this.lastSave = performance.now();
      this.lastFrame = performance.now();
      this.renderer.heldBlock = this.hotbar[this.selected];
      this.ensurePlayerArea();
      // A save can be inside a block after an interrupted edit; lift to safety.
      if (this.collides(this.player.x, this.player.y, this.player.z)) this.rescuePlayer();
      this.sounds.unlock();
      callUI('hideOverlays');
      callUI('setLoading', 1, 'Ready');
      this.requestPointer();
      this.pushUI();
      callUI('toast', data ? 'Welcome back. Your world is just as you left it.' : this.mode === 'creative' ? 'Your world is yours. Press E to choose blocks.' : 'Gather wood to begin. Press E to craft.');
      this.save(true);
      return this.state();
    }

    resume() {
      if (!this.playing) return this.start();
      this.inventoryOpen = false;
      this.paused = false;
      this.keys.clear();
      this.mouseDown = false;
      this.lastFrame = performance.now();
      callUI('showInventory', false);
      callUI('hideOverlays');
      this.sounds.unlock();
      this.requestPointer();
      this.pushUI();
    }
    pause() {
      if (!this.playing) return;
      this.paused = true;
      this.inventoryOpen = false;
      this.keys.clear();
      this.mouseDown = false;
      this.dragging = false;
      this.mineProgress = 0;
      this.releasePointer();
      this.save(true);
      callUI('showInventory', false);
      callUI('showPause');
      this.pushUI();
    }
    menu() {
      this.pause();
      this.playing = false;
      this.photo = false;
      callUI('showMenu');
      this.pushUI();
    }
    toggleInventory() {
      if (!this.playing) return;
      if (this.inventoryOpen) { this.resume(); return; }
      this.inventoryOpen = true;
      this.paused = true;
      this.mouseDown = false;
      this.mineProgress = 0;
      this.keys.clear();
      this.releasePointer();
      callUI('showInventory', true);
      this.pushUI();
    }
    setBlock(id) {
      id = Number(id);
      if (!Number.isInteger(id) || id < 1 || id > 17 || id === 16) return false;
      this.hotbar[this.selected] = id;
      this.renderer.heldBlock = id;
      this.mineProgress = 0;
      this.pushUI();
      return true;
    }
    selectSlot(index) {
      this.selected = ((Math.floor(finite(index, 0)) % 9) + 9) % 9;
      this.renderer.heldBlock = this.hotbar[this.selected];
      this.mineProgress = 0;
      this.miningKey = '';
      this.pushUI();
    }
    setSetting(name, value) {
      const valid = this.validSettings({ [name]: value });
      if (!(name in valid)) return;
      Object.assign(this.settings, valid);
      this.renderer.setSettings(this.settings);
      this.sounds.volume = this.settings.volume;
      try { writeStorage(SETTINGS_KEY, this.settings); } catch (_) { /* Session settings still work. */ }
      this.pushUI();
    }
    craft(recipeId) {
      const recipe = RECIPES.find(item => item.id === recipeId);
      if (!recipe) return false;
      if (this.mode !== 'creative' && !this.canCraft(recipe)) { callUI('toast', 'Gather the ingredients first.'); return false; }
      if (this.mode !== 'creative') for (const [id, amount] of Object.entries(recipe.ingredients)) this.inventory[id] -= amount;
      this.inventory[recipe.output] = Math.min(99999, this.inventory[recipe.output] + recipe.count);
      this.setBlock(recipe.output);
      this.sounds.play('place');
      callUI('toast', 'Crafted ' + recipe.count + ' ' + recipe.name.toLowerCase() + '.');
      this.pushUI();
      return true;
    }
    canCraft(recipe) { return Object.entries(recipe.ingredients).every(([id, amount]) => (this.inventory[id] || 0) >= amount); }
    eat() {
      if (this.mode !== 'survival') return;
      if (this.food <= 0) { callUI('toast', 'Break leaves to forage for berries.'); return; }
      if (this.hunger >= 20) { callUI('toast', 'You are already full.'); return; }
      this.food--;
      this.hunger = Math.min(20, this.hunger + 6);
      this.health = Math.min(20, this.health + 1);
      this.sounds.play('place');
      callUI('toast', 'A handful of berries. +6 hunger');
      this.pushUI();
    }

    bindEvents() {
      window.addEventListener('resize', () => this.resize());
      document.addEventListener('keydown', event => {
        if (event.defaultPrevented) return;
        const tag = event.target && event.target.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
        if (!this.playing) return;
        if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(event.code)) event.preventDefault();
        if (event.code === 'Escape') {
          if (this.inventoryOpen) this.resume();
          else if (!this.paused) this.pause();
          else if (!document.pointerLockElement) this.resume();
          return;
        }
        if (!event.repeat && event.code === 'KeyE') { this.toggleInventory(); return; }
        if (this.paused) return;
        this.keys.add(event.code);
        if (event.repeat) return;
        if (/^Digit[1-9]$/.test(event.code)) this.selectSlot(Number(event.code.slice(5)) - 1);
        if (event.code === 'KeyF' && this.mode === 'creative') {
          this.flying = !this.flying;
          this.player.vy = 0;
          callUI('toast', this.flying ? 'Flight on · Space to rise · Ctrl to descend' : 'Flight off');
          this.pushUI();
        }
        if (event.code === 'KeyR') this.eat();
        if (event.code === 'KeyV') this.place();
        if (event.code === 'KeyX') this.mouseDown = true;
        if (event.code === 'KeyM' || event.code === 'F1') {
          event.preventDefault();
          this.photo = !this.photo;
          this.renderer.photo = this.photo;
          callUI('toast', this.photo ? 'Photo mode · M to show the interface' : 'Interface restored');
          this.pushUI();
        }
      });
      document.addEventListener('keyup', event => {
        this.keys.delete(event.code);
        if (event.code === 'KeyX') { this.mouseDown = false; this.mineProgress = 0; this.miningKey = ''; }
      });
      window.addEventListener('blur', () => { if (this.playing && !this.paused) this.pause(); });
      document.addEventListener('visibilitychange', () => { if (document.hidden && this.playing && !this.paused) this.pause(); });
      document.addEventListener('pointerlockchange', () => {
        const wasLocked = this.pointerLocked;
        this.pointerLocked = document.pointerLockElement === this.canvas;
        if (this.pointerLocked) { this.ignoreUnlock = false; this.dragging = false; }
        else if (wasLocked && !this.ignoreUnlock && this.playing && !this.paused) this.pause();
        else this.ignoreUnlock = false;
      });
      document.addEventListener('pointerlockerror', () => this.pointerFallback());
      document.addEventListener('mousemove', event => {
        if (!this.playing || this.paused) return;
        if (this.pointerLocked) this.look(event.movementX || 0, event.movementY || 0);
        else if (this.dragging && this.lastPointer) {
          this.look(event.clientX - this.lastPointer.x, event.clientY - this.lastPointer.y);
          this.lastPointer = { x: event.clientX, y: event.clientY };
        }
      });
      this.canvas.addEventListener('mousedown', event => {
        if (!this.playing || this.paused) return;
        event.preventDefault();
        this.sounds.unlock();
        if (!this.pointerLocked) {
          this.dragging = true;
          this.lastPointer = { x: event.clientX, y: event.clientY };
          if (this.pointerLockSupported) this.requestPointer();
        }
        if (event.button === 0) { this.mouseDown = true; this.mineProgress = 0; }
        if (event.button === 2) this.place();
        if (event.button === 1 && this.target) this.pickBlock(this.target.id);
      });
      document.addEventListener('mouseup', event => {
        if (event.button === 0) { this.mouseDown = false; this.mineProgress = 0; this.miningKey = ''; }
        this.dragging = false;
        this.lastPointer = null;
      });
      this.canvas.addEventListener('contextmenu', event => event.preventDefault());
      this.canvas.addEventListener('wheel', event => {
        if (!this.playing || this.paused) return;
        event.preventDefault();
        this.selectSlot(this.selected + Math.sign(event.deltaY));
      }, { passive: false });
      window.addEventListener('beforeunload', () => { if (this.playing) this.save(true); });
    }
    look(dx, dy) {
      const sensitivity = 0.0022 * this.settings.sensitivity;
      this.player.yaw = (this.player.yaw + dx * sensitivity) % (Math.PI * 2);
      this.player.pitch = clamp(this.player.pitch - dy * sensitivity, -Math.PI / 2 + 0.015, Math.PI / 2 - 0.015);
    }
    requestPointer() {
      if (!this.pointerLockSupported) { this.pointerFallback(); return; }
      if (document.pointerLockElement === this.canvas) return;
      try {
        const result = this.canvas.requestPointerLock();
        if (result && typeof result.catch === 'function') result.catch(() => this.pointerFallback());
      } catch (_) { this.pointerFallback(); }
    }
    pointerFallback() {
      this.pointerLockSupported = false;
      if (!this.fallbackShown) { this.fallbackShown = true; callUI('toast', 'Look with arrow keys or drag. WASD moves · X mines · V places.'); }
    }
    releasePointer() {
      if (document.pointerLockElement === this.canvas && document.exitPointerLock) {
        this.ignoreUnlock = true;
        document.exitPointerLock();
      }
    }
    resize() { if (this.renderer) this.renderer.resize(); }

    ensurePlayerArea() {
      const cx = Math.floor(this.player.x / 16), cz = Math.floor(this.player.z / 16);
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) this.world.ensureChunk(cx + dx, cz + dz);
    }
    collides(x, y, z) {
      const minX = Math.floor(x - RADIUS + EPS), maxX = Math.floor(x + RADIUS - EPS);
      const minY = Math.floor(y + EPS), maxY = Math.floor(y + HEIGHT - EPS);
      const minZ = Math.floor(z - RADIUS + EPS), maxZ = Math.floor(z + RADIUS - EPS);
      for (let by = minY; by <= maxY; by++) for (let bz = minZ; bz <= maxZ; bz++) for (let bx = minX; bx <= maxX; bx++) {
        if (solid(this.world.get(bx, by, bz))) return true;
      }
      return false;
    }
    moveAxis(axis, amount) {
      if (Math.abs(amount) < 1e-9) return false;
      const p = this.player;
      p[axis] += amount;
      const minX = Math.floor(p.x - RADIUS + EPS), maxX = Math.floor(p.x + RADIUS - EPS);
      const minY = Math.floor(p.y + EPS), maxY = Math.floor(p.y + HEIGHT - EPS);
      const minZ = Math.floor(p.z - RADIUS + EPS), maxZ = Math.floor(p.z + RADIUS - EPS);
      let hit = false;
      let boundary = p[axis];
      for (let by = minY; by <= maxY; by++) for (let bz = minZ; bz <= maxZ; bz++) for (let bx = minX; bx <= maxX; bx++) {
        if (!solid(this.world.get(bx, by, bz))) continue;
        const blockPosition = axis === 'x' ? bx : axis === 'z' ? bz : by;
        const before = amount > 0 ? blockPosition - (axis === 'y' ? HEIGHT : RADIUS) - EPS : blockPosition + 1 + (axis === 'y' ? 0 : RADIUS) + EPS;
        boundary = hit ? amount > 0 ? Math.min(boundary, before) : Math.max(boundary, before) : before;
        hit = true;
      }
      if (hit) p[axis] = boundary;
      return hit;
    }
    rescuePlayer() {
      const p = this.player;
      for (let y = Math.max(1, Math.floor(p.y)); y < 98; y++) {
        if (!this.collides(p.x, y, p.z)) { p.y = y + EPS; p.vy = 0; return; }
      }
      Object.assign(p, this.makePlayer(this.world.getSpawn()));
    }
    direction() {
      const p = this.player, cosine = Math.cos(p.pitch);
      return [Math.sin(p.yaw) * cosine, Math.sin(p.pitch), -Math.cos(p.yaw) * cosine];
    }
    eyePosition() {
      const p = this.player;
      return [p.x, p.y + EYE + (p.grounded && !this.flying ? Math.sin(p.bob) * 0.022 : 0), p.z];
    }
    updatePlayer(delta) {
      const p = this.player;
      const turn = Number(this.keys.has('ArrowRight')) - Number(this.keys.has('ArrowLeft'));
      const tilt = Number(this.keys.has('ArrowDown')) - Number(this.keys.has('ArrowUp'));
      if (turn || tilt) this.look(turn * delta * 700, tilt * delta * 700);
      const forward = Number(this.keys.has('KeyW')) - Number(this.keys.has('KeyS'));
      const strafe = Number(this.keys.has('KeyD')) - Number(this.keys.has('KeyA'));
      const moving = forward !== 0 || strafe !== 0;
      const sprint = (this.keys.has('ShiftLeft') || this.keys.has('ShiftRight')) && (this.mode === 'creative' || this.hunger > 5);
      const normal = Math.hypot(forward, strafe) || 1;
      let speed = this.flying ? sprint ? 13 : 8 : sprint ? 6.4 : 4.3;
      p.swimming = this.world.get(Math.floor(p.x), Math.floor(p.y + 0.65), Math.floor(p.z)) === 11;
      if (p.swimming && !this.flying) speed *= 0.55;
      const desiredX = (Math.sin(p.yaw) * forward + Math.cos(p.yaw) * strafe) / normal * speed;
      const desiredZ = (-Math.cos(p.yaw) * forward + Math.sin(p.yaw) * strafe) / normal * speed;
      const acceleration = this.flying ? 9 : p.grounded || p.swimming ? 16 : 4;
      const blend = 1 - Math.exp(-acceleration * delta);
      p.vx += (desiredX - p.vx) * blend;
      p.vz += (desiredZ - p.vz) * blend;
      if (this.flying) {
        const up = Number(this.keys.has('Space')) - Number(this.keys.has('ControlLeft') || this.keys.has('ControlRight') || this.keys.has('KeyC'));
        p.vy += (up * speed - p.vy) * blend;
      } else {
        if (this.keys.has('Space') && p.grounded) { p.vy = 7.9; p.grounded = false; }
        if (p.swimming) {
          p.vy *= Math.exp(-3 * delta);
          p.vy -= 3.5 * delta;
          if (this.keys.has('Space')) p.vy = 3.2;
          if (this.keys.has('ControlLeft')) p.vy = -3;
        } else p.vy = Math.max(-36, p.vy - 23 * delta);
      }
      const oldX = p.x, oldZ = p.z;
      if (this.moveAxis('x', p.vx * delta)) p.vx = 0;
      if (this.moveAxis('z', p.vz * delta)) p.vz = 0;
      const fallVelocity = p.vy;
      p.grounded = false;
      if (this.moveAxis('y', p.vy * delta)) {
        if (p.vy < 0) {
          p.grounded = true;
          if (!this.flying && !p.swimming && this.mode === 'survival' && fallVelocity < -12) this.damage(Math.floor((-fallVelocity - 10) * 0.65));
        }
        p.vy = 0;
      }
      const travelled = Math.hypot(p.x - oldX, p.z - oldZ);
      p.bob += travelled * 9;
      this.movedDistance += travelled * (sprint ? 1.7 : 1);
      if (p.grounded && moving) {
        this.stepDistance += travelled;
        if (this.stepDistance > (sprint ? 2.3 : 1.8)) { this.stepDistance = 0; this.sounds.play('step'); }
      }
      if (p.y < -20 || !Number.isFinite(p.y)) this.respawn();
      if (this.mode === 'survival') {
        if (this.movedDistance > 110) { this.movedDistance = 0; this.hunger = Math.max(0, this.hunger - 1); }
        this.regenerationTime += delta;
        if (this.regenerationTime > 8) {
          this.regenerationTime = 0;
          if (this.hunger >= 16 && this.health < 20) this.health = Math.min(20, this.health + 1);
          if (this.hunger === 0 && this.health > 2) this.health--;
        }
      }
      this.renderer.walking = moving && p.grounded;
      this.renderer.bob = p.bob;
      this.renderer.swimming = p.swimming;
    }
    damage(amount) {
      if (amount <= 0) return;
      this.health -= amount;
      this.sounds.play('break');
      if (this.health <= 0) this.respawn();
      else callUI('toast', 'Watch your step. −' + amount + ' health');
      this.pushUI();
    }
    respawn() {
      this.player = this.makePlayer(this.world.getSpawn());
      this.health = 20;
      this.hunger = 20;
      this.flying = false;
      this.ensurePlayerArea();
      this.rescuePlayer();
      callUI('toast', 'Back at camp. Your gathered blocks are safe.');
    }
    updateTarget() {
      this.target = this.world.raycast(this.eyePosition(), this.direction(), this.mode === 'creative' ? 7 : 5);
      if (this.target && (!this.target.id || this.target.id === 11)) this.target = null;
    }
    mine(delta) {
      const t = this.target;
      if (!this.mouseDown || !t || t.id === 16) { this.mineProgress = 0; this.miningKey = ''; return; }
      const key = t.x + ',' + t.y + ',' + t.z;
      if (key !== this.miningKey) { this.miningKey = key; this.mineProgress = 0; }
      const duration = this.mode === 'creative' ? 0.15 : [3, 8, 10, 12, 13].includes(t.id) ? 1.2 : t.id === 5 ? 0.85 : [6, 15, 17].includes(t.id) ? 0.22 : 0.45;
      this.mineProgress += delta / duration;
      if (this.mineProgress < 1) return;
      if (!this.world.set(t.x, t.y, t.z, 0)) { this.mineProgress = 0; this.miningKey = ''; this.target = null; return; }
      if (this.mode === 'survival') {
        const drop = t.id === 1 ? 2 : t.id === 3 ? 8 : t.id;
        this.inventory[drop] = Math.min(99999, (this.inventory[drop] || 0) + 1);
        if (t.id === 6 && Math.random() < 0.4) { this.food = Math.min(99999, this.food + 1); callUI('toast', 'Found berries in the leaves. R to eat.'); }
        if (!this.hotbar.includes(drop)) {
          const emptySlot = this.hotbar.findIndex(id => !this.inventory[id]);
          if (emptySlot >= 0) this.hotbar[emptySlot] = drop;
        }
      }
      this.sounds.play('break');
      this.mineProgress = 0;
      this.miningKey = '';
      this.target = null;
      this.pushUI();
    }
    place() {
      const now = performance.now();
      if (now - this.lastPlace < 140) return false;
      this.lastPlace = now;
      this.updateTarget();
      const t = this.target, id = this.hotbar[this.selected];
      if (!t || !Number.isInteger(id) || id < 1 || id > 17 || id === 16) return false;
      if (this.mode === 'survival' && !this.inventory[id]) { callUI('toast', 'Gather or craft this block first.'); return false; }
      const normal = t.normal || [0, 1, 0];
      const position = t.previous || [t.x + (normal[0] || normal.x || 0), t.y + (normal[1] || normal.y || 0), t.z + (normal[2] || normal.z || 0)];
      const x = Math.floor(Array.isArray(position) ? position[0] : position.x);
      const y = Math.floor(Array.isArray(position) ? position[1] : position.y);
      const z = Math.floor(Array.isArray(position) ? position[2] : position.z);
      if (!Number.isFinite(x + y + z) || y <= 0 || y >= 96) return false;
      const existing = this.world.get(x, y, z);
      if (![0, 11, 15, 17].includes(existing)) return false;
      const p = this.player;
      if (solid(id) && x < p.x + RADIUS && x + 1 > p.x - RADIUS && y < p.y + HEIGHT && y + 1 > p.y && z < p.z + RADIUS && z + 1 > p.z - RADIUS) return false;
      if (!this.world.set(x, y, z, id)) return false;
      if (this.mode === 'survival') this.inventory[id]--;
      this.sounds.play('place');
      this.pushUI();
      return true;
    }
    pickBlock(id) {
      if (id === 16 || id === 0 || id === 11) return;
      const slot = this.hotbar.indexOf(id);
      if (slot >= 0) this.selectSlot(slot);
      else if (this.mode === 'creative' || this.inventory[id] > 0) this.setBlock(id);
    }

    state() {
      const p = this.player;
      let biome = this.world.biomeAt(p.x, p.z);
      if (biome && typeof biome === 'object') biome = biome.name || biome.id || 'Meadow';
      const clockMinutes = Math.floor(((this.time / this.dayLength) % 1) * 1440);
      const clock = String(Math.floor(clockMinutes / 60)).padStart(2, '0') + ':' + String(clockMinutes % 60).padStart(2, '0');
      return {
        playing: this.playing, paused: this.paused, mode: this.mode, health: this.health, hunger: this.hunger, food: this.food,
        selected: this.selected, selectedBlock: this.hotbar[this.selected], selectedName: NAMES[this.hotbar[this.selected]],
        hotbar: this.hotbar.slice(), inventory: Object.assign({}, this.inventory), position: [p.x, p.y, p.z],
        biome: biome || 'Meadow', fps: this.renderer.stats ? this.renderer.stats.fps || 0 : 0, stats: this.renderer.stats || {},
        flying: this.flying, swimming: p.swimming, day: Math.floor(this.time / this.dayLength) + 1, clock,
        time: this.time, seed: this.seed, saveStatus: this.saveStatus, hasSave: this.hasSave,
        target: this.target ? Object.assign({ name: NAMES[this.target.id] || 'Block' }, this.target) : null,
        mineProgress: this.mineProgress, photo: this.photo, inventoryOpen: this.inventoryOpen,
        recipes: RECIPES.map(recipe => Object.assign({}, recipe, { available: this.mode === 'creative' || this.canCraft(recipe) })),
        settings: Object.assign({}, this.settings), pointerLocked: this.pointerLocked
      };
    }
    pushUI() { callUI('update', this.state()); }
    frame(now) {
      requestAnimationFrame(this.frame);
      const delta = Math.min(0.05, Math.max(0, (now - this.lastFrame) / 1000));
      this.lastFrame = now;
      if (this.playing && !this.paused) {
        this.time += delta;
        const steps = Math.max(1, Math.ceil(delta / 0.012));
        for (let i = 0; i < steps; i++) this.updatePlayer(delta / steps);
        this.updateTarget();
        this.mine(delta);
        if (now - this.lastSave > 30000) this.save(true);
      }
      const fraction = (this.time % this.dayLength) / this.dayLength;
      const daylight = clamp(0.16 + Math.max(0, Math.sin(fraction * Math.PI * 2 - Math.PI / 2)) * 0.84, 0.16, 1);
      const p = this.player;
      const position = this.playing ? this.eyePosition() : [p.x+12, p.y + 16, p.z + 3];
      const yaw = this.playing ? p.yaw : p.yaw + Math.sin(now * 0.000035) * 0.055;
      if (!this.renderFailed) {
        try {
          this.renderer.render({ position, yaw, pitch: this.playing ? p.pitch : -0.23, time: this.time,
            daylight, target: this.playing && !this.paused ? this.target : null, mineProgress: this.mineProgress,
            fov: this.keys.has('ShiftLeft') && !this.paused ? 78 : 72,
            photo: this.photo || !this.playing, delta, flying: this.flying, heldBlock: this.hotbar[this.selected] });
        } catch (error) {
          this.renderFailed = true;
          this.paused = true;
          this.releasePointer();
          console.error('Wildlands renderer:', error);
          callUI('toast', 'The graphics renderer stopped. Reload to restore your last saved world.');
          callUI('showPause');
        }
      }
      if (now - this.lastUI > 100) { this.lastUI = now; this.pushUI(); }
    }

    snapshot() {
      const p = this.player;
      return {
        format: 'wildlands', version: 1, savedAt: new Date().toISOString(), seed: this.seed, mode: this.mode,
        player: { x: p.x, y: p.y, z: p.z, yaw: p.yaw, pitch: p.pitch }, inventory: Object.assign({}, this.inventory),
        hotbar: this.hotbar.slice(), selected: this.selected, health: this.health, hunger: this.hunger, food: this.food,
        flying: this.flying, time: this.time, edits: this.world.serializeEdits()
      };
    }
    save(silent = false) {
      if (!this.playing) return false;
      try {
        const data = this.snapshot();
        writeStorage(SAVE_KEY + '.' + this.seed, data);
        writeStorage(SAVE_KEY, data);
        this.lastSave = performance.now();
        this.saveStatus = 'All changes saved';
        this.hasSave = true;
        if (!silent) callUI('toast', 'World saved on this device.');
        this.pushUI();
        return true;
      } catch (error) {
        this.lastSave = performance.now();
        this.saveStatus = 'Storage full · export to save';
        if (!silent) callUI('toast', 'Device storage is unavailable. Export your world to keep it.');
        return false;
      }
    }
    exportSave() {
      try {
        const data = this.snapshot();
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = 'wildlands-' + this.seed.replace(/[^a-z0-9_-]+/gi, '-').slice(0, 48) + '.json';
        document.body.appendChild(anchor);
        anchor.click(); anchor.remove();
        setTimeout(() => URL.revokeObjectURL(url), 10000);
        callUI('toast', 'World exported. Keep this file to carry your world with you.');
        return data;
      } catch (_) { callUI('toast', 'Could not export the world. Try saving on this device.'); return null; }
    }
    validateSave(raw) {
      if (!raw || typeof raw !== 'object' || raw.format !== 'wildlands' || raw.version !== 1) throw new Error('This is not a supported Wildlands world file.');
      if (typeof raw.seed !== 'string' || !raw.seed.length || raw.seed.length > 96) throw new Error('The world seed is invalid.');
      if (!['creative', 'survival'].includes(raw.mode)) throw new Error('The game mode is invalid.');
      if (!raw.player || !['x', 'y', 'z', 'yaw', 'pitch'].every(key => Number.isFinite(raw.player[key]))) throw new Error('The saved player position is invalid.');
      if (Math.abs(raw.player.x) > 1000000 || Math.abs(raw.player.z) > 1000000 || raw.player.y < -100 || raw.player.y > 10000) throw new Error('The saved position is outside the world.');
      if (!Array.isArray(raw.hotbar) || raw.hotbar.length !== 9 || raw.hotbar.some(id => !Number.isInteger(id) || id < 1 || id > 17 || id === 16)) throw new Error('The saved block palette is invalid.');
      if (!raw.inventory || typeof raw.inventory !== 'object' || Array.isArray(raw.inventory)) throw new Error('The saved inventory is invalid.');
      const inventory = this.emptyInventory();
      for (const [id, count] of Object.entries(raw.inventory)) {
        if (!/^(?:[1-9]|1[0-7])$/.test(id) || !Number.isInteger(count) || count < 0 || count > 99999) throw new Error('The saved inventory contains invalid items.');
        inventory[id] = count;
      }
      if (!Array.isArray(raw.edits) || raw.edits.length > 250000) throw new Error('The saved blocks are missing or too large.');
      for (const edit of raw.edits) {
        if (!Array.isArray(edit) || edit.length !== 4 || !edit.every(Number.isInteger)
            || Math.abs(edit[0]) > 1000000 || edit[1] < 1 || edit[1] >= 96 || Math.abs(edit[2]) > 1000000
            || edit[3] < 0 || edit[3] > 17 || edit[3] === 16) throw new Error('The world file contains invalid block data.');
      }
      if (JSON.stringify(raw.edits).length > 16000000) throw new Error('This world file is too large to import.');
      const clean = Object.assign({}, raw, { inventory,
        selected: clamp(Math.floor(finite(raw.selected, 0)), 0, 8), health: clamp(finite(raw.health, 20), 1, 20),
        hunger: clamp(finite(raw.hunger, 20), 0, 20), food: clamp(Math.floor(finite(raw.food, 3)), 0, 99999),
        time: clamp(finite(raw.time, 420), 0, 120000000), flying: !!raw.flying,
        player: Object.assign({}, raw.player, { pitch: clamp(raw.player.pitch, -Math.PI / 2 + 0.015, Math.PI / 2 - 0.015) })
      });
      return clean;
    }
    async importSave(file) {
      try {
        if (!file || typeof file.text !== 'function') throw new Error('Choose a Wildlands JSON world file.');
        if (file.size > 20000000) throw new Error('Choose a world file smaller than 20 MB.');
        const data = this.validateSave(JSON.parse(await file.text()));
        // Restore directly: an exported world remains playable when browser storage is full.
        this.start({}, data);
        callUI('toast', this.saveStatus === 'All changes saved' ? 'World imported. Welcome home.' : 'World imported for this session. Export again to keep new changes.');
        return true;
      } catch (error) {
        callUI('toast', error instanceof SyntaxError ? 'That file is not valid JSON. Choose an exported Wildlands world.' : error.message || 'Could not import this world.');
        return false;
      }
    }
  }

  V.Game = Game;
  V.GameConstants = { HEIGHT, RADIUS, EYE, NON_SOLID, RECIPES, HOTBAR, SAVE_KEY };
  function initialize() {
    const canvas = document.getElementById('world') || document.querySelector('canvas');
    if (!canvas || !V.World || !V.Renderer) { console.error('Wildlands needs its world, renderer, and canvas to start.'); return; }
    try {
      const game = window.game = new Game(canvas);
      callUI('init', game);
      callUI('setLoading', 1, 'Your world awaits');
      callUI('showMenu');
      game.pushUI();
    } catch (error) {
      console.error('Wildlands startup:', error);
      const errorBox = document.getElementById('loading') || document.createElement('div');
      errorBox.textContent = 'Wildlands could not start: ' + error.message + '. A browser with WebGL2 is required.';
      errorBox.style.cssText = 'position:fixed;inset:0;display:grid;place-items:center;background:#17251f;color:#fff;padding:40px;font:18px sans-serif;z-index:1000';
      if (!errorBox.parentNode) document.body.appendChild(errorBox);
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize, { once: true });
  else setTimeout(initialize, 0);
})();
