# Wildlands

An original, playable Minecraft-style voxel sandbox. The game, renderer, terrain, textures, wildlife, sound effects, and interface were written from scratch using native browser APIs. There are no third-party game libraries, asset packs, downloads, accounts, or runtime dependencies.

## Play

Double-click **Wildlands.html** in the delivery folder. Alternatively, open **index.html** in this source folder. Use a current desktop Chrome or Edge browser with WebGL 2 and hardware acceleration enabled. Internet access is not needed. Choose a world seed and Creative or Survival, then **Enter world**.

The first few seconds generate the landscape. Graphics settings let you reduce quality and view distance on slower computers. The game is designed for a keyboard and mouse.

## Controls

| Action | Control |
|---|---|
| Walk | W, A, S, D |
| Look | Mouse; arrow keys also work |
| Jump / swim upward | Space |
| Sprint | Shift |
| Mine | Hold left mouse button, or hold X |
| Place a block | Right mouse button, or V |
| Select hotbar slot | 1–9 or mouse wheel |
| Pick the block under the crosshair | Middle mouse button |
| Inventory and crafting | E |
| Creative flight | F; Space up, Ctrl down |
| Eat berries in Survival | R |
| Hide the HUD for a picture | M |
| Pause / release mouse | Escape |

Click the world to capture the mouse. If mouse capture is unavailable, use the arrow keys to look and X/V to mine and build. The pause menu includes all controls.

## What is playable

- Seeded terrain that generates as you explore: meadows, oak woods, rivers, sand banks, highlands, snowy peaks, underground caves, coal and iron.
- Eighteen block types including air and bedrock; sixteen usable blocks in Creative, including wood, stone, glass, bricks, water, flowers, and torches.
- First-person movement, collision, jumping, sprinting, swimming, Creative flight, precise block selection, mining and construction.
- Creative with unlimited blocks, and a simple Survival loop with gathering, recipes, finite inventory, hunger, berries, regeneration, fall damage and respawning.
- Wandering sheep and pigs, procedural pixel textures, directional shadows, corner shading, reflective animated water, clouds, day/night lighting, and synthesized interaction sounds.
- Local autosaves, per-seed saves, and portable JSON save export/import.

Start Survival by gathering logs and crafting planks. Leaves sometimes drop berries. Mining stone yields cobblestone. Coal is used with planks for torches, or with sand/cobblestone for building materials. Recipes list their exact ingredients in the inventory.

## Keep your world

The game saves automatically every 30 seconds and when paused. **Escape → Export save** creates a portable JSON backup. Use **Import save** to load it again.

Browser saves belong to the browser and location where you opened the game; changing browsers, moving the HTML file, clearing browser data, or using a private window may make those saves unavailable. Export a copy before moving the game. If local storage is unavailable, the session is still playable and export remains available.

Starting a new world at an existing seed replaces that seed's saved world. The interface asks before doing so.

## Scope

This is a substantial single-player prototype, not full Minecraft feature parity. It does not include multiplayer, hostile enemies, redstone, villages, dimensions, equipment progression, a furnace simulation, spreading fluid physics, or Minecraft's complete item and crafting catalogue. Wildlife is ambient. Torches appear bright but do not emit dynamic local light. The terrain height is 96 blocks, with horizontal generation as you explore. Its code and artwork are original.

## Source

- `world.js` — deterministic terrain, chunks, trees, edits and raycasting.
- `renderer.js` — original WebGL 2 shaders, texture atlas, geometry, shadows, sky, water and held blocks.
- `fauna.js` — animated cuboid sheep and pigs, movement and geometry.
- `game.js` — physics, input, gameplay, recipes, sounds and save handling.
- `ui.js`, `style.css`, `index.html` — interface and original block icons.

No build step is required for the source version: open `index.html`.

## Verification

Verified in a Chromium browser: world rendering without WebGL errors; start and inventory controls; block selection; gathering a log, crafting planks, placing one, saving and restoring that change; all three quality settings; malformed-save rejection; and ten animated animals.

Additional native JavaScript tests cover deterministic terrain, chunk borders, negative coordinates, edit persistence, bedrock protection, raycasting, collision, flight, survival resources, import failure handling, wildlife geometry and cliff/water avoidance.
