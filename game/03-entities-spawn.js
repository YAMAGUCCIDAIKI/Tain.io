// 細胞、餌、棘、粒などの生成とワールド配置を扱います。
      function createCell(actor, x, y, mass) {
        const cell = {
          id: nextId(),
          actor,
          ownerId: actor.id,
          x: clamp(x, 0, WORLD_SIZE),
          y: clamp(y, 0, WORLD_SIZE),
          mass: Math.max(MIN_CELL_MASS, mass),
          radius: 1,
          renderRadius: 1,
          radiusAnimFrom: 1,
          radiusAnimTo: 1,
          radiusAnimAge: 0,
          vx: 0,
          vy: 0,
          boostX: 0,
          boostY: 0,
          faceX: 1,
          faceY: 0,
          sweepActive: false,
          sweepPoints: null,
          sweepFromX: x,
          sweepFromY: y,
          sweepToX: x,
          sweepToY: y,
          cooldown: 0,
          mergeReadyAt: 0,
          capFramesLeft: mass > MAX_CELL_MASS ? MASS_CAP_SETTLE_FRAMES : 0,
          birthAge: 1,
          birthDuration: 0,
          birthX: x,
          birthY: y,
          birthScale: 1,
          fragmentAge: 0,
          launchVelocityAge: 0,
          splitBoostAge: 0,
          splitHoldAge: 0,
          pendingBoostX: 0,
          pendingBoostY: 0,
          separationGraceUntil: 0,
          splitRecoilFrame: -1,
          splitRecoilApplied: 0,
          mergePartnerId: null,
          mergeDominantId: null,
          virusCooldown: 0,
          mergeVirusWindow: 0,
          mergeOverflowMass: Math.max(0, mass - MAX_CELL_MASS),
          mergeBurstPieces: 1,
          mergeBurstTotal: mass,
          splitPriority: 0,
          targetX: x,
          targetY: y,
          dead: false
        };
        refreshCell(cell);
        cell.renderRadius = cell.radius;
        cell.radiusAnimFrom = cell.radius;
        cell.radiusAnimTo = cell.radius;
        return cell;
      }

      function startCellBirth(cell, originX, originY, duration = 0.16, scale = 0.08) {
        cell.birthAge = 0;
        cell.birthDuration = duration;
        cell.birthX = originX;
        cell.birthY = originY;
        cell.birthScale = scale;
      }

      function capBoost(cell, maxSpeed) {
        const speed = Math.hypot(cell.boostX, cell.boostY);
        if (speed <= maxSpeed || speed < 0.001) return;
        const scale = maxSpeed / speed;
        cell.boostX *= scale;
        cell.boostY *= scale;
      }

      function wallInsetForCell(cell) {
        return Math.max(1, (cell?.radius || 1) * 0.2649320846);
      }

      function clampCellToWorld(cell, size = WORLD_SIZE) {
        const inset = wallInsetForCell(cell);
        cell.x = clamp(cell.x, inset, size - inset);
        cell.y = clamp(cell.y, inset, size - inset);
      }

      function capVelocity(cell, maxSpeed) {
        const speed = Math.hypot(cell.vx, cell.vy);
        if (speed <= maxSpeed || speed < 0.001) return;
        const scale = maxSpeed / speed;
        cell.vx *= scale;
        cell.vy *= scale;
      }

      function virusFragmentAngles(count) {
        const angles = [];
        const step = TAU / Math.max(1, count);
        const offset = rand(0, TAU);
        for (let i = 0; i < count; i += 1) {
          angles.push(offset + (i + rand(0.12, 0.88)) * step);
        }
        for (let i = angles.length - 1; i > 0; i -= 1) {
          const j = Math.floor(rand(0, i + 1));
          const tmp = angles[i];
          angles[i] = angles[j];
          angles[j] = tmp;
        }
        return angles;
      }

      function mergeBurstMasses(total, count) {
        if (count <= 1) return [total];
        const parentMass = Math.min(MAX_CELL_MASS, total);
        const overflow = Math.max(0, total - parentMass);
        const childCount = count - 1;
        if (overflow <= 0 || childCount <= 0) return [total];

        const masses = [parentMass];
        let remainingOverflow = overflow;
        for (let i = 0; i < childCount; i += 1) {
          const remainingChildren = childCount - i;
          const minAllowed = Math.max(MIN_CELL_MASS, remainingOverflow - MAX_CELL_MASS * (remainingChildren - 1));
          const maxAllowed = Math.min(MAX_CELL_MASS, remainingOverflow - MIN_CELL_MASS * (remainingChildren - 1));
          const ideal = Math.min(MAX_CELL_MASS, remainingOverflow / remainingChildren);
          const mass = i === childCount - 1
            ? remainingOverflow
            : clamp(
                ideal * rand(0.9, 1.1),
                minAllowed,
                maxAllowed
              );
          masses.push(mass);
          remainingOverflow -= mass;
        }
        return masses;
      }

      function virusBurstPieceCount(total, slots, liveCells) {
        if (slots <= 1) return 1;
        if (liveCells === MAX_CELLS - 1) return 2;
        let best = 2;
        for (let candidate = 2; candidate <= slots; candidate += 1) {
          const masses = virusBurstMasses(total, candidate, false);
          if (masses.every((mass) => mass + 0.001 >= MIN_CELL_MASS)) best = candidate;
          else break;
        }
        return best;
      }

      function virusBurstMasses(total, count, forceHalf = false) {
        if (count <= 1) return [total];
        if (forceHalf) return [total * 0.5, total * 0.5];

        const masses = [total * 0.4];
        let splitSide = total * 0.6;
        while (masses.length < count - 1) {
          const remainingSlots = count - masses.length;
          if (splitSide * 0.5 < MIN_SPLIT_SOURCE_MASS) {
            const tailMass = splitSide / remainingSlots;
            while (masses.length < count) masses.push(tailMass);
            return masses;
          }
          splitSide *= 0.5;
          masses.push(splitSide);
        }
        masses.push(splitSide);
        return masses;
      }

      function totalMass(actor) {
        let total = 0;
        for (const cell of actor.cells) total += cell.mass;
        return total;
      }

      function totalServerNutrients() {
        let total = 0;
        for (const actor of state.actors) total += totalMass(actor);
        return total;
      }

      function actorCenter(actor, useRender = false) {
        let mass = 0;
        let x = 0;
        let y = 0;
        for (const cell of actor.cells) {
          const cellX = useRender && Number.isFinite(cell.renderX) ? cell.renderX : cell.x;
          const cellY = useRender && Number.isFinite(cell.renderY) ? cell.renderY : cell.y;
          mass += cell.mass;
          x += cellX * cell.mass;
          y += cellY * cell.mass;
        }
        if (mass <= 0) return { x: WORLD_SIZE * 0.5, y: WORLD_SIZE * 0.5, mass: 0 };
        return { x: x / mass, y: y / mass, mass };
      }

      function sharedLocalViewCenter(useRender = false) {
        const actors = liveLocalHumanActors();
        if (!actors.length) {
          return { x: WORLD_SIZE * 0.5, y: WORLD_SIZE * 0.5, mass: 0, cellCount: 0, spread: 0 };
        }
        if (actors.length === 1) {
          const center = actorCenter(actors[0], useRender);
          center.cellCount = liveCellCount(actors[0]);
          center.spread = 0;
          return center;
        }

        const samples = [];
        let mass = 0;
        let x = 0;
        let y = 0;
        for (const actor of actors) {
          for (const cell of actor.cells) {
            if (cell.dead) continue;
            const cellX = useRender && Number.isFinite(cell.renderX) ? cell.renderX : cell.x;
            const cellY = useRender && Number.isFinite(cell.renderY) ? cell.renderY : cell.y;
            samples.push({ x: cellX, y: cellY, radius: cell.radius });
            mass += cell.mass;
            x += cellX * cell.mass;
            y += cellY * cell.mass;
          }
        }
        if (mass <= 0) {
          return { x: WORLD_SIZE * 0.5, y: WORLD_SIZE * 0.5, mass: 0, cellCount: 0, spread: 0 };
        }
        const centerX = x / mass;
        const centerY = y / mass;
        let spread = 0;
        for (const sample of samples) {
          spread = Math.max(spread, Math.hypot(sample.x - centerX, sample.y - centerY) + sample.radius);
        }
        return { x: centerX, y: centerY, mass, cellCount: samples.length, spread };
      }

      function allCells(out = []) {
        out.length = 0;
        for (const actor of state.actors) {
          for (const cell of actor.cells) {
            if (!cell.dead) out.push(cell);
          }
        }
        return out;
      }

      function liveCellCount(actor) {
        let count = 0;
        for (const cell of actor.cells) {
          if (!cell.dead) count += 1;
        }
        return count;
      }

      function refreshNextSplitPriority(actor) {
        let maxPriority = 0;
        for (const cell of actor.cells) {
          if (Number.isFinite(cell.splitPriority)) maxPriority = Math.max(maxPriority, cell.splitPriority);
        }
        actor.nextSplitPriority = Math.max(actor.nextSplitPriority || 1, maxPriority + 1);
      }

      function assignSplitPriority(actor, cell) {
        if (Number.isFinite(cell.splitPriority) && cell.splitPriority > 0) return cell.splitPriority;
        refreshNextSplitPriority(actor);
        cell.splitPriority = actor.nextSplitPriority;
        actor.nextSplitPriority += 1;
        return cell.splitPriority;
      }

      function mergeAccountingMass(cell) {
        return cell.mass;
      }

      function mergeVirusHitRadius(cell) {
        return radiusFromMass(mergeVirusHitMass(cell));
      }

      function mergeVirusHitMass(cell) {
        const burstMass = cell.mergeVirusWindow > 0 ? Math.max(cell.mergeBurstTotal || 0, cell.mass) : cell.mass;
        return clamp(burstMass, cell.mass, MAX_MERGE_VIRUS_HIT_MASS);
      }

      function hasHalfVirusOverlap(cell, virus, hitRadius) {
        const halfVirusArea = Math.PI * virus.radius * virus.radius * 0.5;
        const centerDistance = Math.sqrt(distSq(cell.x, cell.y, virus.x, virus.y));
        if (circleOverlapArea(hitRadius, virus.radius, centerDistance) >= halfVirusArea) return true;
        if (!hasSweepPath(cell)) return false;
        const sweptDistance = Math.sqrt(sweptPointDistSq(cell, virus.x, virus.y));
        return circleOverlapArea(hitRadius, virus.radius, sweptDistance) >= halfVirusArea;
      }

      function canConsumeVirus(cell, virus) {
        const hitMass = mergeVirusHitMass(cell);
        if (!consumeThresholdWithMass(cell, virus, hitMass)) return false;
        return hasHalfVirusOverlap(cell, virus, radiusFromMass(hitMass));
      }

      function canBurstVirus(cell, virus) {
        return hasHalfVirusOverlap(cell, virus, mergeVirusHitRadius(cell));
      }

      function virusCollisionPriority(cell) {
        if (cell.mass > MAX_CELL_MASS) {
          return 100000000 + cell.mass;
        }
        if (cell.mergeVirusWindow > 0) {
          return 50000000 + cell.mass;
        }
        if (cell.fragmentAge > 0) {
          return cell.mass - 1000000;
        }
        return cell.mass;
      }

      function randomPosition(padding = 80) {
        return {
          x: rand(padding, WORLD_SIZE - padding),
          y: rand(padding, WORLD_SIZE - padding)
        };
      }

      function spawnClearanceScore(x, y, radius, options = {}) {
        let score = Math.min(
          x - radius,
          y - radius,
          WORLD_SIZE - radius - x,
          WORLD_SIZE - radius - y
        );

        if (options.avoidX != null && options.avoidY != null) {
          score = Math.min(score, Math.sqrt(distSq(x, y, options.avoidX, options.avoidY)) - (options.avoidRadius || 0));
        }

        const cellPadding = options.cellPadding || 0;
        for (const actor of state.actors) {
          for (const cell of actor.cells) {
            if (cell.dead) continue;
            score = Math.min(score, Math.sqrt(distSq(x, y, cell.x, cell.y)) - radius - cell.radius - cellPadding);
          }
        }

        if (options.avoidViruses) {
          const virusPadding = options.virusPadding || 0;
          for (const virus of state.viruses) {
            if (virus.dead) continue;
            score = Math.min(score, Math.sqrt(distSq(x, y, virus.x, virus.y)) - radius - virus.radius - virusPadding);
          }
        }

        if (options.avoidFoods) {
          const foodPadding = options.foodPadding || 0;
          for (const food of state.foods) {
            if (food.dead) continue;
            score = Math.min(score, Math.sqrt(distSq(x, y, food.x, food.y)) - radius - food.radius - foodPadding);
          }
        }

        return score;
      }

      function findOpenSpawnPosition(radius, padding = 80, attempts = 24, options = {}) {
        let best = randomPosition(padding);
        let bestScore = -Infinity;
        for (let attempt = 0; attempt < attempts; attempt += 1) {
          const pos = randomPosition(padding);
          const score = spawnClearanceScore(pos.x, pos.y, radius, options);
          if (score > bestScore) {
            best = pos;
            bestScore = score;
          }
        }
        return best;
      }

      function spawnActor(actor, mass = 70, preferredX = null, preferredY = null) {
        const pos = preferredX == null ? findSpawnPosition(mass) : { x: preferredX, y: preferredY };
        actor.color = randomActorColor(actor.color);
        actor.cells.length = 0;
        actor.respawns += 1;
        actor.respawnAt = 0;
        actor.nextSplitPriority = 1;
        actor.lastSplit = -100;
        actor.lastSplitFrame = -1;
        actor.lastEject = -100;
        actor.input.splitQueued = false;
        actor.input.splitCount = 0;
        actor.input.splitLockActive = false;
        const cell = createCell(actor, pos.x, pos.y, mass);
        cell.splitPriority = actor.nextSplitPriority;
        actor.nextSplitPriority += 1;
        actor.cells.push(cell);
        actor.input.targetX = pos.x;
        actor.input.targetY = pos.y;
      }

      function findSpawnPosition(mass) {
        const radius = radiusFromMass(mass);
        return findOpenSpawnPosition(radius, 320, 90, {
          avoidViruses: true,
          virusPadding: 130,
          cellPadding: 180
        });
      }

      function createFood() {
        const mass = 1;
        const radius = radiusFromMass(mass);
        const crowded = state.foods.length > FOOD_AVOID_LIMIT;
        const pos = crowded
          ? findOpenSpawnPosition(radius, 20, 4, {
              avoidViruses: true,
              virusPadding: 18,
              cellPadding: 50
            })
          : findOpenSpawnPosition(radius, 20, 10, {
              avoidViruses: true,
              avoidFoods: true,
              virusPadding: 24,
              foodPadding: 4,
              cellPadding: 60
            });
        return {
          id: nextId(),
          type: "food",
          x: pos.x,
          y: pos.y,
          mass,
          radius,
          color: foodPalette[Math.floor(Math.random() * foodPalette.length)],
          dead: false
        };
      }

      function addFood() {
        const food = createFood();
        state.foods.push(food);
        if (!state.foodGridDirty) foodGrid.insert(food);
        return food;
      }

      function createVirus(x = null, y = null, natural = true) {
        const radius = radiusFromMass(VIRUS_MASS);
        const pos = x == null
          ? findOpenSpawnPosition(radius, 180, 16, {
              avoidViruses: true,
              virusPadding: 28,
              cellPadding: 120
            })
          : { x, y };
        return {
          id: nextId(),
          type: "virus",
          x: clamp(pos.x, 60, WORLD_SIZE - 60),
          y: clamp(pos.y, 60, WORLD_SIZE - 60),
          mass: VIRUS_MASS,
          radius,
          vx: 0,
          vy: 0,
          feedCount: 0,
          natural,
          dead: false
        };
      }

      function spawnVirusSafely(avoidX = null, avoidY = null) {
        const radius = radiusFromMass(VIRUS_MASS);
        const pos = findOpenSpawnPosition(radius, 180, 18, {
          avoidViruses: true,
          avoidX,
          avoidY,
          avoidRadius: avoidX == null ? 0 : 560,
          virusPadding: 32,
          cellPadding: 130
        });
        return createVirus(pos.x, pos.y);
      }

      function isNaturalVirus(virus) {
        return virus.natural !== false;
      }

      function liveVirusCount() {
        let count = 0;
        for (const virus of state.viruses) {
          if (!virus.dead) count += 1;
        }
        return count;
      }

      function trimNaturalViruses(limit) {
        let totalCount = liveVirusCount();
        let changed = false;
        state.viruses = state.viruses.filter((virus) => {
          if (virus.dead) {
            changed = true;
            return false;
          }
          if (!isNaturalVirus(virus)) return true;
          if (totalCount <= limit) return true;
          changed = true;
          totalCount -= 1;
          return false;
        });
        return changed;
      }

      function createFeed(x, y, dirX, dirY, color, ownerId, speed = DEFAULT_EJECT_SPEED, mass = DEFAULT_EJECT_MASS) {
        const feedMass = Math.max(5, Number(mass) || DEFAULT_EJECT_MASS);
        const feed = {
          id: nextId(),
          type: "feed",
          x: clamp(x, 0, WORLD_SIZE),
          y: clamp(y, 0, WORLD_SIZE),
          mass: feedMass,
          radius: radiusFromMass(feedMass),
          vx: dirX * speed,
          vy: dirY * speed,
          age: 0,
          color,
          ownerId,
          dead: false
        };
        state.feeds.push(feed);
        return feed;
      }

      function rebuildFoodGridOnly() {
        foodGrid.clear();
        for (const food of state.foods) if (!food.dead) foodGrid.insert(food);
        state.foodGridDirty = false;
      }

      function rebuildSpatialHashes() {
        feedGrid.clear();
        virusGrid.clear();
        cellGrid.clear();
        if (state.foodGridDirty) {
          rebuildFoodGridOnly();
        }
        for (const feed of state.feeds) if (!feed.dead) feedGrid.insert(feed);
        for (const virus of state.viruses) if (!virus.dead) virusGrid.insert(virus);
        for (const actor of state.actors) {
          for (const cell of actor.cells) {
            if (!cell.dead) cellGrid.insert(cell);
          }
        }
      }

      function screenToWorld(x, y) {
        return {
          x: state.camera.x + (x - state.width * 0.5) / state.camera.zoom,
          y: state.camera.y + (y - state.height * 0.5) / state.camera.zoom
        };
      }

      function updateMouseWorld() {
        const world = screenToWorld(state.input.mouseX, state.input.mouseY);
        state.input.mouseWorldX = clamp(world.x, 0, WORLD_SIZE);
        state.input.mouseWorldY = clamp(world.y, 0, WORLD_SIZE);
      }

      function syncPointerTarget() {
        updateMouseWorld();
        const actor = state.player && receivesPlayerInput(state.player) ? state.player : actorById(state.input.activeActorId);
        if (!actor || !receivesPlayerInput(actor)) return;
        actor.input.targetX = state.input.mouseWorldX;
        actor.input.targetY = state.input.mouseWorldY;
        state.net.lastInputSend = -100;
      }

      function actorAimDirection(actor) {
        const center = actorCenter(actor);
        const n = normalized(
          actor.input.targetX - center.x,
          actor.input.targetY - center.y,
          actor.input.lastAimX,
          actor.input.lastAimY
        );
        if (n.length > 0.001) {
          actor.input.lastAimX = n.x;
          actor.input.lastAimY = n.y;
        }
        return n;
      }

      function splitImpulse(radius) {
        return clamp(285 + radius * 0.28, 300, 500) * splitSpeedScale() * SPLIT_LAUNCH_SPEED_SCALE;
      }

      function splitSpeedScale() {
        return Math.max(0.05, state.settings.splitSpeed / 100);
      }

      function launchVelocityDuration() {
        return Math.max(0.1, state.settings.splitDecayTime);
      }

      function minSplitBoost() {
        return 0;
      }

      function gameSpeedScale() {
        return Math.max(0.05, state.settings.gameSpeed);
      }

      function splitRecoilDistance(radius) {
        const recoil = state.settings.splitRecoil;
        if (recoil <= 0) return 0;
        const requested = Math.max(0, radius * (recoil / 100));
        return Math.min(requested, 4 + radius * 0.01);
      }

      function applySplitRecoil(cell, dirX, dirY, distance) {
        if (distance <= 0) return;
        if (cell.splitRecoilFrame !== state.frameIndex) {
          cell.splitRecoilFrame = state.frameIndex;
          cell.splitRecoilApplied = 0;
        }
        const remaining = Math.max(0, distance - cell.splitRecoilApplied);
        if (remaining <= 0) return;
        cell.x -= dirX * remaining;
        cell.y -= dirY * remaining;
        clampCellToWorld(cell);
        cell.splitRecoilApplied += remaining;
      }

      function ejectInterval() {
        return 1 / Math.max(1, state.settings.ejectRate);
      }
