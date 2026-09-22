/* Original cuboid wildlife and deterministic wandering for Wildlands. */
(function (root) {
  'use strict';
  const V = root.Voxel = root.Voxel || {};
  const TAU = Math.PI * 2;
  const FACES = [
    { n: [1, 0, 0], v: [[1,0,0],[1,1,0],[1,1,1],[1,0,1]] },
    { n: [-1, 0, 0], v: [[0,0,1],[0,1,1],[0,1,0],[0,0,0]] },
    { n: [0, 1, 0], v: [[0,1,1],[1,1,1],[1,1,0],[0,1,0]] },
    { n: [0, -1, 0], v: [[0,0,0],[1,0,0],[1,0,1],[0,0,1]] },
    { n: [0, 0, 1], v: [[1,0,1],[1,1,1],[0,1,1],[0,0,1]] },
    { n: [0, 0, -1], v: [[0,0,0],[0,1,0],[1,1,0],[1,0,0]] }
  ];
  const ORDER = [0, 1, 2, 0, 2, 3];
  const UV = [[0,1],[0,0],[1,0],[1,1]];
  const TILE = { wool: 15, face: 5, hoof: 22, pink: 21, eye: 22, white: 15 };
  const wrapped = angle => Math.atan2(Math.sin(angle), Math.cos(angle));

  class Fauna {
    constructor(world) {
      this.animals = [];
      this.revision = 0;
      this._geometry = new Float32Array(0);
      this._changed = true;
      this._accumulated = 0;
      this.setWorld(world);
    }

    setWorld(world) {
      this.world = world;
      this.animals.length = 0;
      let seed = 174571;
      for (const char of String(world.seed)) seed = Math.imul(seed ^ char.charCodeAt(0), 16777619);
      this._randomState = seed >>> 0;
      this._nextId = 1;
      this._clock = 0;
      this._accumulated = 0;
      this._lastPosition = [0.5, 34, 14.5];
      this._respawns = [];
      const places = [[-8,3],[-11,0],[-6,-2],[-13,5],[-17,0],[-15,-6],[9,3],[12,0],[15,5],[8,-3]];
      for (let i = 0; i < places.length; ++i) {
        const [x, z] = places[i];
        const point = this._findGround(x, z, 12);
        if (point) this._add(i < 6 ? 'sheep' : 'pig', point);
      }
      this._changed = true;
      this.revision++;
      return this;
    }

    _random() {
      this._randomState = (Math.imul(this._randomState, 1664525) + 1013904223) >>> 0;
      return this._randomState / 4294967296;
    }

    _ground(x, z, grassOnly = false) {
      const w = this.world, B = V.B, ix = Math.floor(x), iz = Math.floor(z);
      // Reject riverbeds before asking for block data, which can generate a chunk.
      const terrain = w.heightAt(ix, iz);
      if (terrain < V.WATER_LEVEL + 1 || terrain >= V.HEIGHT - 4) return null;
      const y = w.surfaceAt(ix, iz);
      if (y < V.WATER_LEVEL + 1 || y >= V.HEIGHT - 4) return null;
      const ground = w.get(ix, y, iz);
      if (ground === B.WATER || ground === B.LEAVES || ground === B.LOG || !V.BLOCKS[ground]?.solid) return null;
      if (grassOnly && ground !== B.GRASS) return null;
      for (let dy = 1; dy <= 2; ++dy) {
        const block = w.get(ix, y + dy, iz);
        if (block === B.WATER || V.BLOCKS[block]?.solid) return null;
      }
      return y + 1;
    }

    _findGround(x, z, radius) {
      for (let i = 0; i < 28; ++i) {
        const angle = i * 2.399963, r = i === 0 ? 0 : Math.sqrt(i / 27) * radius;
        const px = x + Math.cos(angle) * r, pz = z + Math.sin(angle) * r;
        const y = this._ground(px, pz, true);
        if (y === null) continue;
        const edges = [[0.5,0],[-0.5,0],[0,0.5],[0,-0.5]].map(([dx,dz]) => this._ground(px + dx, pz + dz));
        if (edges.some(edge => edge === null || Math.abs(edge - y) > 1)) continue;
        return { x: px, y, z: pz };
      }
      return null;
    }

    _add(species, point) {
      const yaw = this._random() * TAU;
      this.animals.push({ id: this._nextId++, species, ...point, yaw,
        phase: this._random() * TAU, moving: this._random() > 0.4,
        _targetYaw: yaw, _timer: 1 + this._random() * 4,
        _pace: (species === 'pig' ? 0.43 : 0.34) + this._random() * 0.18,
        _homeX: point.x, _homeZ: point.z, _bob: 0 });
      this._changed = true;
    }

    update(dt, position, time) {
      if (!Number.isFinite(dt) || dt <= 0) return;
      dt = Math.min(dt, 0.15);
      this._clock += dt;
      if (position && position.length >= 3 && position.every(Number.isFinite)) this._lastPosition = position.slice();
      const eye = this._lastPosition;
      this._accumulated += dt;
      if (this._accumulated < 1 / 30) return;
      dt = this._accumulated;
      this._accumulated = 0;
      // Time can come from the render clock; simulation age remains monotonic for respawns.
      const animationTime = Number.isFinite(time) ? time : this._clock;
      for (const animal of this.animals) {
        const distance = Math.hypot(animal.x - eye[0], animal.z - eye[2]);
        if (distance > 80) {
          // Keep wildlife local as the explorer moves through the infinite landscape.
          const angle = this._random() * TAU, radius = 45 + this._random() * 25;
          const point = this._findGround(eye[0] + Math.cos(angle) * radius, eye[2] + Math.sin(angle) * radius, 10);
          if (point) {
            Object.assign(animal, point);
            animal._homeX = point.x; animal._homeZ = point.z;
            this._changed = true;
          }
          continue;
        }
        animal._timer -= dt;
        if (animal._timer <= 0) {
          animal.moving = this._random() > 0.35;
          animal._timer = animal.moving ? 2 + this._random() * 5 : 1.5 + this._random() * 4;
          if (Math.hypot(animal.x - animal._homeX, animal.z - animal._homeZ) > 12) {
            animal._targetYaw = Math.atan2(animal._homeX - animal.x, -(animal._homeZ - animal.z));
          } else animal._targetYaw = animal.yaw + (this._random() - 0.5) * 2.8;
        }
        const oldYaw = animal.yaw;
        animal.yaw += wrapped(animal._targetYaw - animal.yaw) * Math.min(1, dt * 2);
        if (Math.abs(animal.yaw - oldYaw) > 0.00001) this._changed = true;
        if (animal.moving) {
          const dx = Math.sin(animal.yaw), dz = -Math.cos(animal.yaw);
          const nx = animal.x + dx * animal._pace * dt, nz = animal.z + dz * animal._pace * dt;
          const ground = this._ground(nx + dx * 0.48, nz + dz * 0.48);
          if (ground !== null && Math.abs(ground - animal.y) <= 1.05) {
            const feet = this._ground(nx, nz);
            if (feet !== null && Math.abs(feet - animal.y) <= 1.05) {
              animal.x = nx; animal.z = nz;
              animal.y += (feet - animal.y) * Math.min(1, dt * 12);
              animal.phase += dt * animal._pace * 9;
              animal._bob = Math.abs(Math.sin(animal.phase * 2)) * 0.018;
              this._changed = true;
            }
          } else {
            animal._targetYaw += Math.PI * (0.55 + this._random() * 0.6);
            animal._timer = 1.2;
          }
        } else {
          const bob = Math.sin(animationTime * 1.7 + animal.id) * 0.006;
          if (Math.abs(animal._bob - bob) > 0.001) { animal._bob = bob; this._changed = true; }
          animal.phase *= Math.max(0, 1 - dt * 4);
        }
      }
      for (let i = this._respawns.length - 1; i >= 0; --i) {
        const pending = this._respawns[i];
        if (this._clock < pending.at) continue;
        const angle = this._random() * TAU, radius = 32 + this._random() * 20;
        const point = this._findGround(eye[0] + Math.cos(angle) * radius, eye[2] + Math.sin(angle) * radius, 14);
        if (point) { this._add(pending.species, point); this._respawns.splice(i, 1); }
        else pending.at = this._clock + 10;
      }
    }

    geometry() {
      if (!this._changed) return this._geometry;
      const output = [];
      for (const animal of this.animals) this._model(output, animal);
      this._geometry = new Float32Array(output);
      this._changed = false;
      this.revision++;
      return this._geometry;
    }

    _model(output, animal) {
      const cy = Math.cos(animal.yaw), sy = Math.sin(animal.yaw), bob = animal._bob;
      const box = (center, size, tile, angle = 0, pivot = null, shade = 1) => {
        const cr = Math.cos(angle), sr = Math.sin(angle);
        for (const face of FACES) {
          const fn = face.n;
          const ry = fn[1] * cr - fn[2] * sr, rz = fn[1] * sr + fn[2] * cr;
          const normal = [fn[0] * cy - rz * sy, ry, fn[0] * sy + rz * cy];
          for (const i of ORDER) {
            const v = face.v[i];
            let x = center[0] + (v[0] - 0.5) * size[0];
            let y = center[1] + (v[1] - 0.5) * size[1];
            let z = center[2] + (v[2] - 0.5) * size[2];
            if (pivot) {
              const py = y - pivot[1], pz = z - pivot[2];
              y = pivot[1] + py * cr - pz * sr;
              z = pivot[2] + py * sr + pz * cr;
            }
            const wx = x * cy - z * sy + animal.x, wz = x * sy + z * cy + animal.z;
            const uv = UV[i], u = ((tile % 8) * 16 + 0.04 + uv[0] * 15.92) / 128;
            const vv = (Math.floor(tile / 8) * 16 + 0.04 + uv[1] * 15.92) / 64;
            output.push(wx, y + animal.y, wz, normal[0], normal[1], normal[2], u, vv, shade, 3);
          }
        }
      };
      const sheep = animal.species === 'sheep', bodyTile = sheep ? TILE.wool : TILE.pink;
      const bodyY = sheep ? 0.77 : 0.61;
      box([0, bodyY + bob, 0], sheep ? [0.77,0.71,1.22] : [0.76,0.61,1.13], bodyTile);
      const legHeight = sheep ? 0.44 : 0.33, legWidth = sheep ? 0.15 : 0.18;
      for (let i = 0; i < 4; ++i) {
        const x = i % 2 ? 0.25 : -0.25, z = i < 2 ? -0.4 : 0.4;
        const swing = animal.moving ? Math.sin(animal.phase + (i === 0 || i === 3 ? 0 : Math.PI)) * 0.30 : 0;
        const pivot = [x, legHeight + bob, z];
        box([x, legHeight / 2 + bob, z], [legWidth,legHeight,legWidth], sheep ? TILE.face : bodyTile, swing, pivot, 0.9);
        box([x, 0.055 + bob, z], [legWidth + 0.005,0.1,legWidth + 0.005], TILE.hoof, swing, pivot, 0.95);
      }
      if (sheep) {
        box([0,0.98 + bob,-0.70], [0.44,0.47,0.46], TILE.wool);
        box([0,0.88 + bob,-0.945], [0.34,0.29,0.045], TILE.face);
        for (const sign of [-1,1]) {
          box([sign * 0.255,1.045 + bob,-0.7], [0.14,0.10,0.20], TILE.face);
          box([sign * 0.112,1.005 + bob,-0.952], [0.105,0.105,0.028], TILE.white);
          box([sign * 0.10,0.999 + bob,-0.97], [0.052,0.063,0.012], TILE.eye);
        }
        box([0,0.78 + bob,0.675], [0.18,0.22,0.20], TILE.wool);
      } else {
        box([0,0.73 + bob,-0.70], [0.49,0.47,0.47], TILE.pink);
        box([0,0.655 + bob,-0.985], [0.32,0.18,0.12], TILE.pink, 0, null, 0.88);
        for (const sign of [-1,1]) {
          box([sign * 0.158,1.015 + bob,-0.68], [0.15,0.18,0.085], TILE.pink);
          box([sign * 0.146,0.80 + bob,-0.941], [0.098,0.11,0.022], TILE.white);
          box([sign * 0.134,0.792 + bob,-0.957], [0.047,0.064,0.013], TILE.eye);
          box([sign * 0.085,0.662 + bob,-1.05], [0.046,0.048,0.012], TILE.eye);
        }
        box([0,0.68 + bob,0.635], [0.10,0.10,0.22], TILE.pink);
        box([0.065,0.73 + bob,0.745], [0.16,0.10,0.09], TILE.pink);
      }
    }

    hit(origin, direction, maxDistance = 5) {
      if (!origin || !direction || origin.length !== 3 || direction.length !== 3 ||
          !origin.every(Number.isFinite) || !direction.every(Number.isFinite) ||
          !Number.isFinite(maxDistance)) return null;
      const length = Math.hypot(...direction);
      if (!length || !Number.isFinite(length) || maxDistance < 0) return null;
      const dir = direction.map(v => v / length);
      let closest = null, best = maxDistance;
      for (const animal of this.animals) {
        const c = Math.cos(animal.yaw), s = Math.sin(animal.yaw);
        const dx = origin[0] - animal.x, dz = origin[2] - animal.z;
        const o = [dx * c + dz * s, origin[1] - animal.y, -dx * s + dz * c];
        const d = [dir[0] * c + dir[2] * s, dir[1], -dir[0] * s + dir[2] * c];
        const min = [-0.43,0,-1.06], max = [0.43,animal.species === 'sheep' ? 1.24 : 1.13,0.83];
        let near = 0, far = best, missed = false;
        for (let axis = 0; axis < 3; ++axis) {
          if (Math.abs(d[axis]) < 1e-9) { if (o[axis] < min[axis] || o[axis] > max[axis]) { missed = true; break; } }
          else {
            const a = (min[axis] - o[axis]) / d[axis], b = (max[axis] - o[axis]) / d[axis];
            near = Math.max(near, Math.min(a,b)); far = Math.min(far, Math.max(a,b));
            if (near > far) { missed = true; break; }
          }
        }
        if (!missed && near <= best) { best = near; closest = { id: animal.id, species: animal.species, distance: near, animal }; }
      }
      return closest;
    }

    remove(id) {
      const i = this.animals.findIndex(animal => animal.id === id);
      if (i < 0) return false;
      const [animal] = this.animals.splice(i, 1);
      this._respawns.push({ species: animal.species, at: this._clock + 90 + this._random() * 45 });
      this._changed = true;
      return true;
    }
  }

  V.Fauna = Fauna;
})(typeof window !== 'undefined' ? window : globalThis);
