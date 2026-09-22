/* Wildlands interface. Original artwork and code, using browser APIs only. */
(function () {
  'use strict';
  const V = window.Voxel = window.Voxel || {};
  const $ = id => document.getElementById(id);
  const hide = (element, hidden = true) => element && element.classList.toggle('hidden', hidden);
  const text = (id, value) => { const node = $(id); if (node && node.textContent !== String(value)) node.textContent = value; };
  const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const blocks = V.BLOCKS || [];
  const byId = id => blocks[id] || { id, name: 'Block', color: '#8b9c77' };
  const name = id => id === 17 ? 'Torch' : byId(id).name;
  let game, state, mode = 'creative', modal = null, returnTo = 'menu', confirmAction, lastFocus;
  let inventoryTab = 'blocks', initialized = false, ready = false;
  let hotbarSignature = '', inventorySignature = '';
  const iconCache = new Map();

  function shade(hex, factor) {
    const channels = hex.replace('#', '').match(/.{2}/g).map(value => Math.min(255, Math.round(parseInt(value, 16) * factor)));
    return '#' + channels.map(value => value.toString(16).padStart(2, '0')).join('');
  }

  // Isometric miniature blocks, drawn in-house rather than loaded from an asset pack.
  function icon(id) {
    if (iconCache.has(id)) return iconCache.get(id);
    let drawing;
    if (id === 15) {
      drawing = '<path d="M23 39V20M23 31l-8-7m8 3 8-7" fill="none" stroke="#648746" stroke-width="3"/><path d="m23 9 5 5 6 1-3 6-6 1-4 5-4-5-6-2 3-5 4-1z" fill="#ebc962"/><rect x="20" y="16" width="6" height="6" fill="#b87d34"/>';
    } else if (id === 17) {
      drawing = '<path d="M20 20h7v21h-7z" fill="#946039"/><path d="M24 21h3v20h-3z" fill="#68462c"/><path d="m17 22 1-10 5-7 3 6 4 5-2 8z" fill="#f4b757"/><path d="m21 21 2-9 4 8-2 4z" fill="#ffe6a2"/>';
    } else {
      const color = byId(id).color, top = id === 1 ? '#81b455' : shade(color, 1.16);
      const side = id === 1 ? '#947052' : color;
      drawing = '<path d="M23 3 43 14 23 26 3 14Z" fill="' + top + '"/><path d="M3 14 23 26 23 47 3 35Z" fill="' + side + '"/><path d="M23 26 43 14 43 35 23 47Z" fill="' + shade(side, .75) + '"/>';
      if (id === 1) drawing += '<path d="M3 14 23 26v6l-5-3v-3l-5-3v3L3 20Z" fill="#639044"/><path d="m23 26 20-12v5L23 32Z" fill="#507a36"/>';
      if (id === 9 || id === 11) drawing += '<path d="M5 16 21 27v16L5 34ZM25 27l16-10v16L25 43Z" fill="' + (id === 11 ? '#86c7ce' : '#e1f2e9') + '" opacity=".48"/><path d="m6 12 14-7 14 8-14 8ZM10 23l7 4m13 2 7-4" stroke="#effff8" stroke-width="1" fill="none" opacity=".8"/>';
      if (id === 5) drawing += '<path d="m9 13 14-7 13 7-13 8Zm5 0 9-4 8 4-8 5ZM8 20v15m6-11v12m16-11v15m7-20v14" fill="none" stroke="#4b3526" stroke-width="1.6" opacity=".65"/>';
      if (id === 7 || id === 10 || id === 8) drawing += '<path d="m3 22 20 12 20-12M3 29l20 12 20-12m-30-1v7m20-7v7m-10-7v7M13 9l20 11M23 3l20 11" fill="none" stroke="' + shade(color, .60) + '" stroke-width="1.2" opacity=".75"/>';
      if (![5, 9, 10, 11].includes(id)) {
        for (let i = 0; i < 8; i++) {
          const x = 5 + (i * 7 + id * 3) % 13, y = 20 + (i * 5 + id) % 12 + (x - 5) * .57;
          drawing += '<path d="m' + x + ' ' + y.toFixed(1) + ' 3 1.7v2l-3-1.7Z" fill="' + shade(side, i % 2 ? 1.15 : .80) + '"/>';
        }
      }
      if (id === 12 || id === 13) drawing += '<path d="m8 23 5 3v4l-5-3Zm8 13 4 2v4l-4-2Zm13-6 5-3v4l-5 3Zm7-8 4-2v4l-4 2Z" fill="' + (id === 12 ? '#364140' : '#d3b394') + '"/>';
    }
    const svg = '<svg class="block-icon" viewBox="0 0 46 50" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">' + drawing + '</svg>';
    iconCache.set(id, svg);
    return svg;
  }

  function hidePanels() {
    document.querySelectorAll('.overlay').forEach(element => hide(element));
    modal = null;
  }

  function focusPanel(id) {
    requestAnimationFrame(() => {
      if (modal !== id) return;
      const panel = $(id + '-overlay');
      const focusable = panel.querySelector('button:not(:disabled), input, select, [tabindex="0"]');
      if (focusable) focusable.focus({ preventScroll: true });
    });
  }

  function openPanel(id) {
    lastFocus = document.activeElement;
    hidePanels();
    hide($(id + '-overlay'), false);
    modal = id;
    focusPanel(id);
  }

  function showSecondary(id) {
    returnTo = game.playing ? 'pause' : 'menu';
    if (game.playing && !game.paused) game.pause();
    openPanel(id);
  }

  function closeSecondary() {
    const restore = lastFocus;
    if (returnTo === 'pause' && game.playing) UI.showPause();
    else { hidePanels(); hide($('menu'), false); }
    if (restore && restore.isConnected && !restore.closest('.hidden')) restore.focus({ preventScroll: true });
  }

  function selectMode(next) {
    mode = next === 'survival' ? 'survival' : 'creative';
    document.querySelectorAll('[data-mode]').forEach(button => {
      const active = button.dataset.mode === mode;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });
    text('mode-description', mode === 'creative' ? 'Endless blocks. No limits. Just your imagination.' : 'Gather, craft, and find your place in the wild.');
    updateEnterLabel();
  }

  function updateEnterLabel() {
    if (!game) return;
    const saved = game.readSaved($('seed').value.trim() || 'wildlands');
    $('enter-world').firstElementChild.textContent = saved && saved.mode === mode ? 'Continue world' : 'Enter world';
  }

  function start(newWorld) {
    if (!ready) return;
    const seed = $('seed').value.trim() || 'wildlands';
    $('seed').value = seed;
    const saved = game.readSaved(seed);
    if (!newWorld && saved && saved.mode !== mode) {
      confirmNew('This seed already has a ' + saved.mode + ' world. Starting in ' + mode + ' replaces that saved world. You can return to it by selecting ' + saved.mode + '.', () => game.start({ seed, mode, newWorld: true }));
      return;
    }
    game.start({ seed, mode, newWorld: !!newWorld });
  }

  function confirmNew(description, action) {
    returnTo = game.playing ? 'pause' : 'menu';
    confirmAction = action;
    text('confirm-description', description);
    openPanel('confirm');
    $('confirm-cancel').focus();
  }

  function setInventoryTab(tab) {
    inventoryTab = tab;
    hide($('block-grid'), tab !== 'blocks');
    hide($('recipe-grid'), tab !== 'crafting');
    ['blocks', 'crafting'].forEach(item => {
      $(item + '-tab').classList.toggle('active', item === tab);
      $(item + '-tab').setAttribute('aria-selected', String(item === tab));
    });
  }

  function buildInventory() {
    $('block-grid').innerHTML = blocks.filter(block => block.id > 0 && block.id !== 16).map(block =>
      '<button class="block-card" data-block="' + block.id + '" title="' + escape(name(block.id)) + '">' + icon(block.id) + '<span>' + escape(name(block.id)) + '</span><small class="block-count"></small></button>'
    ).join('');
    $('recipe-grid').innerHTML = V.GameConstants.RECIPES.map(recipe =>
      '<div class="recipe-card" data-recipe="' + recipe.id + '">' + icon(recipe.output) + '<div><strong>' + recipe.count + ' × ' + escape(recipe.name) + '</strong><p>' + Object.entries(recipe.ingredients).map(([id, count]) => count + ' ' + escape(name(Number(id)))).join(' + ') + '</p></div><button data-craft="' + recipe.id + '">Craft <span>↗</span></button></div>'
    ).join('');
    $('block-grid').addEventListener('click', event => {
      const card = event.target.closest('[data-block]');
      if (card) { game.setBlock(Number(card.dataset.block)); UI.toast(name(Number(card.dataset.block)) + ' selected for slot ' + (game.selected + 1) + '.'); }
    });
    $('recipe-grid').addEventListener('click', event => {
      const button = event.target.closest('[data-craft]');
      if (button) game.craft(button.dataset.craft);
    });
  }

  function renderHotbar(current) {
    const signature = JSON.stringify([current.hotbar, current.selected, current.mode, current.inventory]);
    if (signature === hotbarSignature) return;
    hotbarSignature = signature;
    $('hotbar').innerHTML = current.hotbar.map((id, i) => '<button class="hotbar-slot' + (i === current.selected ? ' selected' : '') + '" data-slot="' + i + '" aria-label="Slot ' + (i + 1) + ': ' + escape(name(id)) + '" aria-pressed="' + (i === current.selected) + '"><span class="slot-number">' + (i + 1) + '</span>' + icon(id) + '<span class="slot-count">' + (current.mode === 'creative' ? '' : current.inventory[id] || 0) + '</span></button>').join('');
  }

  function renderInventory(current) {
    const signature = JSON.stringify([current.inventory, current.mode, current.selected, current.selectedBlock, current.food, current.hunger]);
    if (signature === inventorySignature) return;
    inventorySignature = signature;
    document.querySelectorAll('[data-block]').forEach(button => {
      const id = Number(button.dataset.block), count = current.inventory[id] || 0;
      button.querySelector('.block-count').textContent = current.mode === 'creative' ? '∞' : count;
      button.classList.toggle('selected', id === current.selectedBlock);
      button.disabled = current.mode === 'survival' && !count;
      button.setAttribute('aria-pressed', String(id === current.selectedBlock));
    });
    current.recipes.forEach(recipe => {
      const button = document.querySelector('[data-craft="' + recipe.id + '"]');
      if (button) { button.disabled = !recipe.available; button.title = recipe.available ? 'Craft ' + recipe.name : 'Gather the listed ingredients'; }
    });
    text('inventory-hint', 'Choose a block for slot ' + (current.selected + 1));
    text('inventory-mode', current.mode.toUpperCase() + ' · SLOT ' + (current.selected + 1));
    hide($('inventory-food'), current.mode !== 'survival');
    text('berry-count', 'Foraged berries · ' + current.food);
    $('eat-berries').disabled = current.food <= 0 || current.hunger >= 20;
  }

  function updateSettings(settings) {
    for (const key of ['renderDistance', 'quality', 'sensitivity', 'volume']) {
      const value = settings[key], input = $(key);
      if (document.activeElement !== input) input.value = value;
      text(key + '-value', key === 'renderDistance' ? value + ' chunks' : key === 'quality' ? String(value).charAt(0).toUpperCase() + String(value).slice(1) : Math.round(value * 100) + '%');
    }
  }

  const UI = window.UI = V.UI = {
    init(instance) {
      if (initialized) return;
      initialized = true;
      game = instance;
      buildInventory();
      document.querySelectorAll('[data-mode]').forEach(button => button.addEventListener('click', () => selectMode(button.dataset.mode)));
      $('seed').addEventListener('input', updateEnterLabel);
      $('seed').addEventListener('keydown', event => { if (event.key === 'Enter') start(false); });
      $('random-seed').addEventListener('click', () => {
        const words = ['meadow', 'cedar', 'wildflower', 'river', 'fern', 'solstice', 'highlands', 'evergreen'];
        $('seed').value = words[Math.floor(Math.random() * words.length)] + '-' + Math.floor(Math.random() * 9000 + 1000);
        updateEnterLabel();
      });
      $('enter-world').addEventListener('click', () => start(false));
      $('menu-new').addEventListener('click', () => {
        const seed = $('seed').value.trim() || 'wildlands';
        if (game.readSaved(seed)) confirmNew('Starting fresh at “' + seed + '” replaces this seed’s saved world. Continue your current world and export it first if you would like to keep a copy.', () => start(true));
        else start(true);
      });
      $('resume-world').addEventListener('click', () => game.resume());
      $('hud-pause').addEventListener('click', () => game.pause());
      $('pause-inventory').addEventListener('click', () => game.toggleInventory());
      $('save-world').addEventListener('click', () => game.save());
      $('back-menu').addEventListener('click', () => game.menu());
      $('export-world').addEventListener('click', () => game.exportSave());
      $('import-world').addEventListener('click', () => $('import-file').click());
      $('import-file').addEventListener('change', async event => {
        const file = event.target.files[0];
        if (file) await game.importSave(file);
        event.target.value = '';
      });
      $('eat-berries').addEventListener('click', () => game.eat());
      for (const source of ['menu', 'pause']) for (const panel of ['controls', 'settings']) $(source + '-' + panel).addEventListener('click', () => showSecondary(panel));
      document.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', () => button.dataset.close === 'inventory' ? game.resume() : closeSecondary()));
      document.querySelectorAll('[data-setting]').forEach(input => input.addEventListener('input', () => game.setSetting(input.dataset.setting, input.dataset.setting === 'quality' ? input.value : Number(input.value))));
      $('confirm-cancel').addEventListener('click', () => { confirmAction = null; closeSecondary(); });
      $('confirm-yes').addEventListener('click', () => { const action = confirmAction; confirmAction = null; if (action) action(); });
      $('blocks-tab').addEventListener('click', () => setInventoryTab('blocks'));
      $('crafting-tab').addEventListener('click', () => setInventoryTab('crafting'));
      $('hotbar').addEventListener('click', event => { const slot = event.target.closest('[data-slot]'); if (slot) game.selectSlot(Number(slot.dataset.slot)); });
      document.querySelector('.wordmark').addEventListener('click', event => { event.preventDefault(); $('enter-world').focus(); });
      document.addEventListener('keydown', event => {
        if (!modal) return;
        if (event.key === 'Tab') {
          const focusable = Array.from($(modal + '-overlay').querySelectorAll('button:not(:disabled), input, select, [tabindex="0"]')).filter(element => element.getClientRects().length);
          if (!focusable.length) return;
          event.preventDefault();
          const index = focusable.indexOf(document.activeElement), step = event.shiftKey ? -1 : 1;
          focusable[index < 0 ? (event.shiftKey ? focusable.length - 1 : 0) : (index + step + focusable.length) % focusable.length].focus();
          return;
        }
        const editing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName);
        if (event.code === 'Escape') {
          event.preventDefault();
          if (modal === 'pause' || modal === 'inventory') game.resume();
          else { confirmAction = null; closeSecondary(); }
        } else if (modal === 'inventory' && !editing && /^Digit[1-9]$/.test(event.code)) {
          event.preventDefault(); game.selectSlot(Number(event.code.slice(5)) - 1);
        } else if (modal === 'inventory' && !editing && event.code === 'KeyR') {
          event.preventDefault(); game.eat();
        } else if (['settings', 'controls', 'confirm'].includes(modal) && !editing && ['KeyE', 'KeyM', 'F1'].includes(event.code)) {
          event.preventDefault();
        }
      }, true);
      const progress = document.createElement('span');
      progress.id = 'mining-progress';
      progress.className = 'mining-progress hidden';
      $('crosshair').appendChild(progress);
      document.querySelector('.inventory-tabs').setAttribute('role', 'tablist');
      for (const id of ['blocks-tab', 'crafting-tab']) $(id).setAttribute('role', 'tab');
      setInventoryTab('blocks');
      updateSettings(game.settings);
    },

    update(current) {
      state = current;
      hide($('hud'), !current.playing);
      $('hud').classList.toggle('photo-mode', current.photo && !current.paused);
      hide($('photo-label'), !current.photo);
      text('hud-biome', String(current.biome).toUpperCase());
      text('hud-coordinates', current.position.map(value => Math.floor(value)).join(' / '));
      text('hud-time', 'DAY ' + current.day + ' · ' + current.clock);
      hide($('hud-flying'), !current.flying);
      text('hud-mode', current.mode.toUpperCase());
      const hints = document.querySelector('.play-hints');
      if (hints.dataset.mode !== current.mode) {
        hints.dataset.mode = current.mode;
        hints.lastElementChild.innerHTML = (current.mode === 'creative' ? '<kbd>F</kbd> Fly' : '<kbd>R</kbd> Eat berries') + ' <span>·</span> <kbd>M</kbd> Photo mode';
      }
      text('selected-name', name(current.selectedBlock));
      text('target-label', current.target && !current.paused ? name(current.target.id) : '');
      hide($('crosshair'), current.paused);
      hide($('vitals'), current.mode !== 'survival');
      const progress = $('mining-progress');
      hide(progress, !current.mineProgress);
      if (progress) progress.style.setProperty('--mine', Math.round(current.mineProgress * 100) + '%');
      $('save-status').lastElementChild.textContent = current.saveStatus;
      const health = Math.ceil(current.health / 2), hunger = Math.ceil(current.hunger / 2);
      if ($('health').dataset.value !== String(health)) {
        $('health').dataset.value = health;
        $('health').innerHTML = Array.from({ length: 10 }, (_, i) => '<span class="heart' + (i < health ? '' : ' empty') + '" aria-hidden="true">♥</span>').join('');
      }
      if ($('hunger').dataset.value !== String(hunger)) {
        $('hunger').dataset.value = hunger;
        $('hunger').innerHTML = Array.from({ length: 10 }, (_, i) => '<span class="food-pip' + (i < hunger ? '' : ' empty') + '" aria-hidden="true">◆</span>').join('');
      }
      $('health').setAttribute('aria-label', 'Health: ' + current.health + ' of 20');
      $('hunger').setAttribute('aria-label', 'Hunger: ' + current.hunger + ' of 20');
      renderHotbar(current);
      if (modal === 'inventory') renderInventory(current);
      updateSettings(current.settings);
    },

    hideOverlays() { hidePanels(); hide($('menu')); hide($('hud'), !game || !game.playing); },
    showMenu() {
      hidePanels(); hide($('menu'), false); hide($('hud'));
      if (!game) return;
      const saved = game.readSaved();
      $('seed').value = saved ? saved.seed : game.seed;
      selectMode(saved ? saved.mode : game.mode);
    },
    showPause() { hide($('menu')); openPanel('pause'); },
    showInventory(open = true) {
      if (!open) { if (modal === 'inventory') { hide($('inventory-overlay')); modal = null; } return; }
      hide($('menu')); openPanel('inventory');
      inventorySignature = '';
      if (state) renderInventory(game.state());
      setInventoryTab(inventoryTab);
    },
    setLoading(progress, label) {
      ready = progress >= 1;
      $('loading-status').classList.toggle('ready', ready);
      $('loading-bar').style.width = Math.round(Math.max(0, Math.min(1, progress)) * 100) + '%';
      text('loading-label', label || (ready ? 'Your world awaits' : 'Preparing your little wilderness…'));
      $('enter-world').disabled = !ready;
      $('menu-new').disabled = !ready;
    },
    toast(message) {
      const element = document.createElement('div');
      element.className = 'toast';
      element.textContent = message;
      $('toasts').appendChild(element);
      while ($('toasts').children.length > 3) $('toasts').firstElementChild.remove();
      setTimeout(() => { element.classList.add('exiting'); setTimeout(() => element.remove(), 320); }, 4300);
    }
  };
})();
