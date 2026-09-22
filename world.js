/* Wildlands — original deterministic voxel terrain. No external dependencies. */
(function (root) {
  'use strict';
  const V = root.Voxel = root.Voxel || {};
  const CHUNK = 16, HEIGHT = 96, WATER_LEVEL = 24;
  const B = Object.freeze({ AIR: 0, GRASS: 1, DIRT: 2, STONE: 3, SAND: 4,
    LOG: 5, LEAVES: 6, PLANKS: 7, COBBLE: 8, GLASS: 9, BRICK: 10,
    WATER: 11, COAL: 12, IRON: 13, SNOW: 14, FLOWER: 15, BEDROCK: 16, TORCH: 17 });
  const BLOCKS = [
    [0, 'Air', false, true, '#ffffff'], [1, 'Grass', true, false, '#72a844'],
    [2, 'Dirt', true, false, '#8d6644'], [3, 'Stone', true, false, '#88908f'],
    [4, 'Sand', true, false, '#e1d09a'], [5, 'Oak Log', true, false, '#795634'],
    [6, 'Leaves', true, true, '#4f8c40'], [7, 'Oak Planks', true, false, '#bf9154'],
    [8, 'Cobblestone', true, false, '#798181'], [9, 'Glass', true, true, '#b9e1e7'],
    [10, 'Brick', true, false, '#b8654a'], [11, 'Water', false, true, '#469aac'],
    [12, 'Coal Ore', true, false, '#626b6a'], [13, 'Iron Ore', true, false, '#a99583'],
    [14, 'Snow', true, false, '#e5f0eb'], [15, 'Wildflower', false, true, '#e9c750'],
    [16, 'Bedrock', true, false, '#42494b'], [17, 'Lantern', false, true, '#ffc86a']
  ].map(a => Object.freeze({ id: a[0], name: a[1], solid: a[2], transparent: a[3], color: a[4] }));
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = t => t * t * (3 - 2 * t);
  const ramp = (a, b, x) => smooth(clamp((x - a) / (b - a), 0, 1));
  const keyOf = (cx, cz) => cx + ',' + cz;
  const indexOf = (x, y, z) => x + 16 * (z + 16 * y);

  function seedNumber(seed) {
    const s = String(seed);
    let h = 2166136261;
    for (let i = 0; i < s.length; ++i) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
    return h >>> 0;
  }

  class World {
    constructor(seed = 'wildlands') {
      this.seed = seed;
      this._seed = seedNumber(seed);
      this.chunks = new Map();
      this.edits = new Map();
      this._chunkEdits = new Map();
      this.dirty = new Set();
      this._phase = (this._seed % 1000) / 1000;
    }

    _hash(x, y, z, salt = 0) {
      let h = this._seed ^ Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263)
        ^ Math.imul(z | 0, 1442695041) ^ Math.imul(salt | 0, 1274126177);
      h = Math.imul(h ^ (h >>> 13), 1274126177);
      return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
    }

    _noise(x, z, salt = 0) {
      const ix = Math.floor(x), iz = Math.floor(z);
      const tx = smooth(x - ix), tz = smooth(z - iz);
      return lerp(lerp(this._hash(ix, 0, iz, salt), this._hash(ix + 1, 0, iz, salt), tx),
        lerp(this._hash(ix, 0, iz + 1, salt), this._hash(ix + 1, 0, iz + 1, salt), tx), tz);
    }

    _noise3(x, y, z, salt = 0) {
      const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
      const tx = smooth(x - ix), ty = smooth(y - iy), tz = smooth(z - iz);
      const a = lerp(lerp(this._hash(ix, iy, iz, salt), this._hash(ix + 1, iy, iz, salt), tx),
        lerp(this._hash(ix, iy, iz + 1, salt), this._hash(ix + 1, iy, iz + 1, salt), tx), tz);
      const b = lerp(lerp(this._hash(ix, iy + 1, iz, salt), this._hash(ix + 1, iy + 1, iz, salt), tx),
        lerp(this._hash(ix, iy + 1, iz + 1, salt), this._hash(ix + 1, iy + 1, iz + 1, salt), tx), tz);
      return lerp(a, b, ty);
    }

    riverAt(x) {
      return -24 + Math.sin(x * 0.021) * 15 + Math.sin(x * 0.059 + this._phase * 3) * 4;
    }

    _terrain(x, z) {
      const broad = this._noise(x * 0.011, z * 0.011, 1);
      const detail = this._noise(x * 0.043, z * 0.043, 2);
      const ridge = 1 - Math.abs(this._noise(x * 0.012, z * 0.018, 5) * 2 - 1);
      const mountains = ramp(55, 135, -z) * (18 + ridge * 27);
      let h = 29 + broad * 10 + (detail - 0.5) * 5 + mountains;
      // The first clearing provides a readable horizon and a comfortable build site.
      const clearing = 1 - ramp(7, 19, Math.hypot(x, z - 14));
      h = lerp(h, 33, clearing);
      const riverDistance = Math.abs(z - this.riverAt(x));
      const width = 5 + this._noise(x * 0.023, 0, 10) * 2;
      if (riverDistance < width) {
        h = 20 + this._noise(x * 0.08, z * 0.08, 11) * 2;
      } else if (riverDistance < width + 11) {
        const t = ramp(width, width + 11, riverDistance);
        h = lerp(23, h, t);
      }
      return { height: clamp(Math.floor(h), 4, 87), riverDistance, mountains };
    }

    heightAt(x, z) { return this._terrain(Math.floor(x), Math.floor(z)).height; }

    biomeAt(x, z) {
      const t = this._terrain(x, z);
      if (t.height >= 67) return 'Snowy Peaks';
      if (t.height >= 49) return 'Highlands';
      if (t.riverDistance < 16) return 'Riverlands';
      return this._noise(x * 0.018, z * 0.018, 18) > 0.46 ? 'Oak Woodland' : 'Meadow';
    }

    getChunk(cx, cz) { return this.chunks.get(keyOf(cx, cz)) || null; }

    ensureChunk(cx, cz) {
      cx = Math.floor(cx); cz = Math.floor(cz);
      const key = keyOf(cx, cz);
      let chunk = this.chunks.get(key);
      if (chunk) return chunk;
      const data = new Uint8Array(CHUNK * CHUNK * HEIGHT);
      const baseX = cx * CHUNK, baseZ = cz * CHUNK;
      chunk = { cx, cz, data, key };
      for (let z = 0; z < CHUNK; ++z) {
        for (let x = 0; x < CHUNK; ++x) {
          const wx = baseX + x, wz = baseZ + z;
          const terrain = this._terrain(wx, wz), h = terrain.height;
          const shore = h <= WATER_LEVEL + 2 && terrain.riverDistance < 20;
          const snow = h >= 67;
          const cliff = h > 48 && (this._noise(wx * 0.08, wz * 0.08, 29) > 0.52 || h > 62);
          for (let y = 0; y <= h; ++y) {
            let block;
            if (y === 0 || (y === 1 && this._hash(wx, y, wz, 30) < 0.5)) block = B.BEDROCK;
            else if (y === h) block = shore ? B.SAND : snow ? B.SNOW : cliff ? B.STONE : B.GRASS;
            else if (y > h - 4) block = shore ? B.SAND : cliff ? B.STONE : B.DIRT;
            else {
              block = B.STONE;
              // Sparse continuous caverns stay safely below the surface and riverbed.
              if (y > 4 && y < h - 8 && y < WATER_LEVEL - 2 &&
                  this._noise3(wx * 0.068, y * 0.093, wz * 0.068, 37) > 0.73) {
                block = B.AIR;
              } else {
                const vein = this._hash(Math.floor(wx / 3), Math.floor(y / 3), Math.floor(wz / 3), 43);
                const spot = this._hash(wx, y, wz, 44);
                if (vein > 0.91 && spot > 0.35) block = B.COAL;
                else if (y < 31 && vein < 0.052 && spot > 0.44) block = B.IRON;
              }
            }
            data[indexOf(x, y, z)] = block;
          }
          for (let y = h + 1; y <= WATER_LEVEL; ++y) data[indexOf(x, y, z)] = B.WATER;
          if (!shore && !snow && !cliff && h > WATER_LEVEL + 2 &&
              Math.hypot(wx, wz - 14) > 6 && this._hash(wx, 0, wz, 60) > 0.985) {
            data[indexOf(x, h + 1, z)] = B.FLOWER;
          }
        }
      }
      this._growTrees(chunk);
      const edits = this._chunkEdits.get(key);
      if (edits) for (const [i, id] of edits) if (data[i] !== B.BEDROCK) data[i] = id;
      this.chunks.set(key, chunk);
      this.dirty.add(key);
      // Existing neighbors must expose their true border now that this chunk exists.
      for (const [dx, dz] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
        const neighbor = keyOf(cx + dx, cz + dz);
        if (this.chunks.has(neighbor)) this.dirty.add(neighbor);
      }
      return chunk;
    }

    _growTrees(chunk) {
      const bx = chunk.cx * CHUNK, bz = chunk.cz * CHUNK, data = chunk.data;
      const write = (x, y, z, id) => {
        if (x < bx || x >= bx + CHUNK || z < bz || z >= bz + CHUNK || y < 1 || y >= HEIGHT) return;
        const i = indexOf(x - bx, y, z - bz);
        if (data[i] === B.AIR || data[i] === B.FLOWER || (id === B.LOG && data[i] === B.LEAVES)) data[i] = id;
      };
      // Every chunk considers the same world-space candidates, including overhanging crowns.
      const cell = 7;
      for (let gz = Math.floor((bz - 4) / cell); gz <= Math.floor((bz + CHUNK + 3) / cell); ++gz) {
        for (let gx = Math.floor((bx - 4) / cell); gx <= Math.floor((bx + CHUNK + 3) / cell); ++gx) {
          const x = gx * cell + 1 + Math.floor(this._hash(gx, 0, gz, 71) * 5);
          const z = gz * cell + 1 + Math.floor(this._hash(gx, 0, gz, 72) * 5);
          const t = this._terrain(x, z), ground = t.height;
          if (ground <= WATER_LEVEL + 3 || ground >= 64 || t.riverDistance < 13 || Math.hypot(x, z - 14) < 12) continue;
          const forest = this._noise(x * 0.018, z * 0.018, 18);
          if (this._hash(gx, 0, gz, 73) > (forest > 0.46 ? 0.62 : 0.27)) continue;
          if (Math.abs(this.heightAt(x + 2, z) - ground) > 2 || Math.abs(this.heightAt(x, z + 2) - ground) > 2) continue;
          const trunk = 4 + Math.floor(this._hash(gx, 0, gz, 74) * 3);
          for (let dy = 1; dy <= trunk; ++dy) write(x, ground + dy, z, B.LOG);
          if (ground > 48) {
            // Taller, tapering silhouettes on the alpine slopes.
            for (let dy = 2; dy <= trunk + 2; ++dy) {
              const radius = Math.max(0, Math.floor((trunk + 3 - dy) / 2));
              for (let dz = -radius; dz <= radius; ++dz) for (let dx = -radius; dx <= radius; ++dx) {
                if (Math.abs(dx) + Math.abs(dz) <= radius + 1) write(x + dx, ground + dy, z + dz, B.LEAVES);
              }
            }
          } else {
            for (let dy = trunk - 2; dy <= trunk + 1; ++dy) {
              const radius = dy === trunk + 1 ? 1 : 2;
              for (let dz = -radius; dz <= radius; ++dz) for (let dx = -radius; dx <= radius; ++dx) {
                if (Math.abs(dx) === radius && Math.abs(dz) === radius &&
                    (dy === trunk + 1 || this._hash(x + dx, ground + dy, z + dz, 75) < 0.45)) continue;
                write(x + dx, ground + dy, z + dz, B.LEAVES);
              }
            }
          }
        }
      }
    }

    get(x, y, z) {
      x = Math.floor(x); y = Math.floor(y); z = Math.floor(z);
      if (y < 0) return B.BEDROCK;
      if (y >= HEIGHT) return B.AIR;
      const cx = Math.floor(x / CHUNK), cz = Math.floor(z / CHUNK);
      return this.ensureChunk(cx, cz).data[indexOf(x - cx * CHUNK, y, z - cz * CHUNK)];
    }

    peek(x, y, z) {
      x = Math.floor(x); y = Math.floor(y); z = Math.floor(z);
      if (y < 0) return B.BEDROCK;
      if (y >= HEIGHT) return B.AIR;
      const cx = Math.floor(x / CHUNK), cz = Math.floor(z / CHUNK), c = this.getChunk(cx, cz);
      return c ? c.data[indexOf(x - cx * CHUNK, y, z - cz * CHUNK)] : B.AIR;
    }

    set(x, y, z, id) {
      x = Math.floor(x); y = Math.floor(y); z = Math.floor(z);
      if (y < 1 || y >= HEIGHT || !Number.isInteger(id) || !BLOCKS[id]) return false;
      const cx = Math.floor(x / CHUNK), cz = Math.floor(z / CHUNK), key = keyOf(cx, cz);
      const lx = x - cx * CHUNK, lz = z - cz * CHUNK, i = indexOf(lx, y, lz);
      const chunk = this.ensureChunk(cx, cz);
      if (chunk.data[i] === B.BEDROCK || chunk.data[i] === id) return false;
      chunk.data[i] = id;
      this.edits.set(x + ',' + y + ',' + z, id);
      let edits = this._chunkEdits.get(key);
      if (!edits) { edits = new Map(); this._chunkEdits.set(key, edits); }
      edits.set(i, id);
      this.dirty.add(key);
      if (lx === 0) this.dirty.add(keyOf(cx - 1, cz));
      if (lx === 15) this.dirty.add(keyOf(cx + 1, cz));
      if (lz === 0) this.dirty.add(keyOf(cx, cz - 1));
      if (lz === 15) this.dirty.add(keyOf(cx, cz + 1));
      return true;
    }

    surfaceAt(x, z) {
      x = Math.floor(x); z = Math.floor(z);
      const chunk = this.ensureChunk(Math.floor(x / CHUNK), Math.floor(z / CHUNK));
      const lx = ((x % CHUNK) + CHUNK) % CHUNK, lz = ((z % CHUNK) + CHUNK) % CHUNK;
      for (let y = HEIGHT - 1; y >= 0; --y) {
        const id = chunk.data[indexOf(lx, y, lz)];
        if (BLOCKS[id].solid && id !== B.LEAVES && id !== B.LOG) return y;
      }
      return 0;
    }

    getSpawn() {
      return { x: 0.5, y: this.surfaceAt(0, 14) + 1.01, z: 14.5, yaw: 0, pitch: -0.1 };
    }

    raycast(origin, direction, max = 7) {
      const length = Math.hypot(direction[0], direction[1], direction[2]);
      if (!length || max < 0) return null;
      const d = direction.map(v => v / length), p = origin.map(Math.floor);
      const step = d.map(v => v > 0 ? 1 : v < 0 ? -1 : 0);
      const delta = d.map(v => v === 0 ? Infinity : Math.abs(1 / v));
      const next = d.map((v, i) => v === 0 ? Infinity :
        ((step[i] > 0 ? p[i] + 1 : p[i]) - origin[i]) / v);
      let distance = 0, normal = [0, 0, 0], previous = p.slice();
      // A bounded DDA visits every crossed voxel, including negative world coordinates.
      while (distance <= max) {
        const id = this.get(p[0], p[1], p[2]);
        if (id !== B.AIR && id !== B.WATER) {
          return { x: p[0], y: p[1], z: p[2], id, normal, previous, distance };
        }
        let axis = next[0] <= next[1] && next[0] <= next[2] ? 0 : next[1] <= next[2] ? 1 : 2;
        previous = p.slice();
        p[axis] += step[axis];
        distance = next[axis];
        next[axis] += delta[axis];
        normal = [0, 0, 0]; normal[axis] = -step[axis];
      }
      return null;
    }

    serializeEdits() {
      return Array.from(this.edits, ([key, id]) => [...key.split(',').map(Number), id]);
    }

    loadEdits(records) {
      const oldKeys = Array.from(this.chunks.keys());
      this.chunks.clear(); this.edits.clear(); this._chunkEdits.clear();
      this.dirty.clear();
      for (const key of oldKeys) this.dirty.add(key);
      if (!Array.isArray(records)) return;
      for (const record of records) {
        if (!Array.isArray(record) || record.length !== 4 || !record.every(Number.isFinite)) continue;
        const [x, y, z, id] = record;
        if (![x, y, z, id].every(Number.isInteger) || y < 1 || y >= HEIGHT || !BLOCKS[id] || id === B.BEDROCK) continue;
        if (y === 1 && this._hash(x, y, z, 30) < 0.5) continue;
        const cx = Math.floor(x / CHUNK), cz = Math.floor(z / CHUNK), key = keyOf(cx, cz);
        this.edits.set(x + ',' + y + ',' + z, id);
        let edits = this._chunkEdits.get(key);
        if (!edits) { edits = new Map(); this._chunkEdits.set(key, edits); }
        edits.set(indexOf(x - cx * CHUNK, y, z - cz * CHUNK), id);
        this.dirty.add(key);
      }
    }
  }

  Object.assign(V, { B, BLOCKS, World, CHUNK, HEIGHT, WATER_LEVEL });
})(typeof window !== 'undefined' ? window : globalThis);
