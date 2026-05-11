// 分裂、粒吐き、棘爆発、botの行動判断を扱います。
      function splitCell(actor, source, dirX, dirY, targetX = null, targetY = null, applyRecoil = true) {
        if (liveCellCount(actor) >= MAX_CELLS) return null;
        if (source.dead || source.mass < MIN_SPLIT_SOURCE_MASS) return null;
        assignSplitPriority(actor, source);

        if (targetX != null && targetY != null) {
          const aim = normalized(targetX - source.x, targetY - source.y, dirX, dirY);
          dirX = aim.x;
          dirY = aim.y;
        }

        const childMass = source.mass * 0.5;
        const remaining = source.mass - childMass;
        if (childMass < MIN_CELL_MASS || remaining < MIN_CELL_MASS) return null;

        source.mass = remaining;
        refreshCell(source);
        setMergeCooldown(source);

        const childRadius = radiusFromMass(childMass);
        const originX = source.x;
        const originY = source.y;
        const spawnOffset = (source.radius + childRadius) * SPLIT_SPAWN_OFFSET_RATIO;
        const spawnX = originX + dirX * spawnOffset;
        const spawnY = originY + dirY * spawnOffset;
        const child = createCell(actor, spawnX, spawnY, childMass);
        clampCellToWorld(child);
        child.vx = source.vx;
        child.vy = source.vy;
        source.faceX = dirX;
        source.faceY = dirY;
        child.faceX = dirX;
        child.faceY = dirY;
        const impulse = splitImpulse(child.radius);
        child.vx += dirX * impulse;
        child.vy += dirY * impulse;
        child.launchVelocityAge = launchVelocityDuration();
        child.pendingBoostX = 0;
        child.pendingBoostY = 0;
        child.splitHoldAge = 0;
        child.boostX = 0;
        child.boostY = 0;
        child.splitBoostAge = 0;
        child.splitPriority = actor.nextSplitPriority;
        actor.nextSplitPriority += 1;
        source.separationGraceUntil = state.now + 0.14;
        child.separationGraceUntil = state.now + 0.14;
        source.vx *= 0.24;
        source.vy *= 0.24;
        source.boostX *= 0.02;
        source.boostY *= 0.02;
        if (applyRecoil) applySplitRecoil(source, dirX, dirY, splitRecoilDistance(child.radius));
        if (targetX != null && targetY != null) {
          source.targetX = targetX;
          source.targetY = targetY;
          child.targetX = targetX;
          child.targetY = targetY;
        }
        setMergeCooldown(child);
        startCellBirth(child, originX, originY, 0.16, 0.35);
        actor.cells.push(child);
        return child;
      }

      function splitActor(actor, dirX, dirY, now, interval, targetX = null, targetY = null) {
        if (liveCellCount(actor) >= MAX_CELLS) return false;
        for (const cell of actor.cells) {
          if (!cell.dead) assignSplitPriority(actor, cell);
        }

        // Split order is stable by birth number; each source still aims along its own cursor line.
        const candidates = actor.cells
          .slice()
          .sort((a, b) => {
            const priorityDiff = (a.splitPriority || 0) - (b.splitPriority || 0);
            if (priorityDiff !== 0) return priorityDiff;
            return a.id - b.id;
        });
        let didSplit = false;
        let recoilUsed = false;
        const canUseRecoil = now - actor.lastSplitRecoilAt >= SPLIT_RECOIL_COOLDOWN;
        for (const cell of candidates) {
          if (liveCellCount(actor) >= MAX_CELLS) break;
          const shouldRecoil = canUseRecoil && !recoilUsed;
          const child = splitCell(actor, cell, dirX, dirY, targetX, targetY, shouldRecoil);
          if (child) {
            didSplit = true;
            if (shouldRecoil) {
              recoilUsed = true;
              actor.lastSplitRecoilAt = now;
            }
          }
        }
        if (didSplit) {
          actor.lastSplit = now;
          actor.lastSplitFrame = state.frameIndex;
          sendSplitRenderEvent(actor);
        }
        return didSplit;
      }

      function sendSplitRenderEvent(actor) {
        if (state.net.role !== "host" || !state.net.connected || !actor.isHuman) return;
        netSend({
          t: "splitEvent",
          actor: serializeActor(actor)
        });
      }

      function ejectMass(actor, now, allCells = false) {
        if (now - actor.lastEject < ejectInterval()) return false;
        const ejectMass = state.settings.ejectMass;
        const ejectCost = ejectMass + 1;
        const eligible = actor.cells.filter((candidate) => !candidate.dead && candidate.mass >= MIN_EJECT_SOURCE_MASS);
        if (!eligible.length) return false;
        if (allCells) {
          let emitted = false;
          for (const cell of eligible) {
            if (emitFeedFromCell(actor, cell, ejectMass, ejectCost)) emitted = true;
          }
          if (emitted) actor.lastEject = now;
          return emitted;
        }

        actor.nextEjectIndex %= Math.max(1, actor.cells.length);
        let cell = null;
        for (let offset = 0; offset < actor.cells.length; offset += 1) {
          const candidate = actor.cells[(actor.nextEjectIndex + offset) % actor.cells.length];
          if (!candidate.dead && candidate.mass >= MIN_EJECT_SOURCE_MASS) {
            cell = candidate;
            actor.nextEjectIndex = (actor.cells.indexOf(candidate) + 1) % actor.cells.length;
            break;
          }
        }
        if (!cell) cell = eligible[0];
        if (!cell) return false;

        const emitted = emitFeedFromCell(actor, cell, ejectMass, ejectCost);
        if (emitted) actor.lastEject = now;
        return emitted;
      }

      function emitFeedFromCell(actor, cell, ejectMass, ejectCost) {
        const targetX = isPlayerControlled(actor) ? actor.input.targetX : cell.targetX;
        const targetY = isPlayerControlled(actor) ? actor.input.targetY : cell.targetY;
        const n = normalized(targetX - cell.x, targetY - cell.y, actor.input.lastAimX, actor.input.lastAimY);
        if (n.length > 0.001) {
          actor.input.lastAimX = n.x;
          actor.input.lastAimY = n.y;
        }
        cell.mass = Math.max(MIN_CELL_MASS, cell.mass - ejectCost);
        refreshCell(cell);
        const startX = cell.x + n.x * (cell.radius + 18);
        const startY = cell.y + n.y * (cell.radius + 18);
        const feedSpeed = actor.isHuman ? state.settings.ejectSpeed : state.settings.botEjectSpeed;
        const feed = createFeed(startX, startY, n.x, n.y, actor.color, actor.id, feedSpeed, ejectMass);
        feed.vx += cell.vx * 0.25 + cell.boostX * 0.08;
        feed.vy += cell.vy * 0.25 + cell.boostY * 0.08;
        return true;
      }

      function scatterMass(cell, ratio, preferredX = 0, preferredY = 0) {
        const removable = Math.max(0, cell.mass - MIN_SPLIT_SOURCE_MASS);
        const loss = Math.min(removable, cell.mass * ratio);
        const count = Math.min(14, Math.floor(loss / DEFAULT_EJECT_MASS));
        if (count <= 0) return;

        const base = normalized(preferredX, preferredY, 1, 0);
        let removed = 0;
        for (let i = 0; i < count; i += 1) {
          const angle = Math.atan2(base.y, base.x) + rand(-1.35, 1.35) + i * 0.21;
          const dirX = Math.cos(angle);
          const dirY = Math.sin(angle);
          const feed = createFeed(
            cell.x + dirX * (cell.radius + 10),
            cell.y + dirY * (cell.radius + 10),
            dirX,
            dirY,
            cell.actor.color,
            cell.ownerId,
            rand(520, 820)
          );
          feed.age = 0.18;
          removed += DEFAULT_EJECT_MASS;
        }
        cell.mass = Math.max(MIN_CELL_MASS, cell.mass - removed);
        refreshCell(cell);
      }

      function runEjectBotMode(bot, now) {
        const liveCells = bot.cells.filter((cell) => !cell.dead);
        const canEject = liveCells.some((cell) => cell.mass >= MIN_EJECT_SOURCE_MASS);
        if (!canEject) {
          spawnActor(bot, botSpawnMass());
          return true;
        }

        const center = actorCenter(bot);
        const baseAngle = (bot.respawns * 0.61 + state.frameIndex * 0.17) % TAU;
        for (let i = 0; i < liveCells.length; i += 1) {
          const cell = liveCells[i];
          const angle = baseAngle + i * TAU / Math.max(1, liveCells.length);
          cell.targetX = clamp(center.x + Math.cos(angle) * 520, 80, WORLD_SIZE - 80);
          cell.targetY = clamp(center.y + Math.sin(angle) * 520, 80, WORLD_SIZE - 80);
        }
        ejectMass(bot, now, true);
        return true;
      }

      function explodeCellOnVirus(actor, cell, virus) {
        const liveCells = liveCellCount(actor);
        if (liveCells >= MAX_CELLS) {
          return;
        }

        const originalMass = mergeVirusHitMass(cell);
        const total = originalMass + virus.mass;
        const slots = MAX_CELLS - liveCells + 1;
        const originX = cell.x;
        const originY = cell.y;
        const originalRadius = radiusFromMass(originalMass);
        const chainBurst = cell.fragmentAge > 0 || actor.cells.some((candidate) => candidate !== cell && !candidate.dead && candidate.fragmentAge > 0);

        const forceHalf = liveCells === MAX_CELLS - 1;
        const pieces = virusBurstPieceCount(total, slots, liveCells);
        if (pieces <= 1) {
          scatterMass(cell, 0.22, cell.x - virus.x, cell.y - virus.y);
          return;
        }

        const pieceMasses = virusBurstMasses(total, pieces, forceHalf);
        cell.mass = pieceMasses[0];
        refreshCell(cell);
        setMergeCooldown(cell);
        cell.vx *= 0.16;
        cell.vy *= 0.16;
        cell.boostX *= 0.08;
        cell.boostY *= 0.08;
        cell.virusCooldown = 0.42;
        capBoost(cell, 75);
        startCellBirth(cell, originX, originY, 0.2, 0.35);

        const baseAngle = Math.atan2(cell.y - virus.y, cell.x - virus.x);
        const firstDirX = Math.cos(baseAngle);
        const firstDirY = Math.sin(baseAngle);
        cell.faceX = firstDirX;
        cell.faceY = firstDirY;
        const firstBurst = rand(120, 180) * clamp(Math.sqrt(72 / Math.max(20, cell.mass)), 0.35, 0.65) * VIRUS_BURST_SPEED_SCALE;
        cell.vx += firstDirX * firstBurst;
        cell.vy += firstDirY * firstBurst;
        cell.launchVelocityAge = launchVelocityDuration();
        cell.pendingBoostX = 0;
        cell.pendingBoostY = 0;
        cell.splitHoldAge = 0;
        cell.splitBoostAge = 0;
        for (let i = 1; i < pieces; i += 1) {
          const spreadIndex = i - 1;
          const chainOffset = (i - 1) * 0.18 + rand(-0.08, 0.08);
          const angle = chainBurst
            ? baseAngle + Math.PI * 0.92 + chainOffset
            : baseAngle + (TAU * spreadIndex / Math.max(1, pieces - 1)) + rand(-0.16, 0.16);
          const dirX = Math.cos(angle);
          const dirY = Math.sin(angle);
          const childMass = pieceMasses[i];
          const childRadius = radiusFromMass(childMass);
          const ringFactor = chainBurst ? 0.58 + i * 0.13 : (i === 1 ? 0.42 : rand(0.58, 0.82));
          const spawnDistance = Math.min(
            originalRadius + childRadius * 0.45,
            Math.max(childRadius + 3, originalRadius * ringFactor + childRadius * 0.18)
          );
          const child = createCell(actor, originX + dirX * spawnDistance, originY + dirY * spawnDistance, childMass);
          clampCellToWorld(child);
          child.vx = cell.vx * 0.04;
          child.vy = cell.vy * 0.04;
          child.faceX = dirX;
          child.faceY = dirY;
          const massDrag = clamp(Math.sqrt(72 / Math.max(20, child.mass)), 0.45, 0.92);
          const burst = (chainBurst ? rand(210, 320) : (i === 1 ? rand(230, 330) : rand(260, 390))) * massDrag * VIRUS_BURST_SPEED_SCALE;
          child.vx += dirX * burst;
          child.vy += dirY * burst;
          child.launchVelocityAge = launchVelocityDuration();
          child.pendingBoostX = 0;
          child.pendingBoostY = 0;
          child.splitHoldAge = 0;
          child.boostX = 0;
          child.boostY = 0;
          child.splitBoostAge = 0;
          child.fragmentAge = VIRUS_FRAGMENT_LIFE;
          child.virusCooldown = 0.42;
          setMergeCooldown(child);
          startCellBirth(child, originX, originY, 0.2, 0.18);
          actor.cells.push(child);
        }
        return;
      }

      function updateBotAI(bot, dt, now) {
        bot.aiTimer -= dt;
        if (bot.aiTimer > 0) return;
        bot.aiTimer = rand(0.16, 0.32);

        if (state.settings.botMode === "eject" && runEjectBotMode(bot, now)) return;

        const center = actorCenter(bot);
        if (distSq(center.x, center.y, bot.wanderX, bot.wanderY) < 160 * 160 || Math.random() < 0.03) {
          bot.wanderX = rand(260, WORLD_SIZE - 260);
          bot.wanderY = rand(260, WORLD_SIZE - 260);
        }

        for (const cell of bot.cells) {
          if (state.settings.botMode === "cursor") {
            cell.targetX = state.input.mouseWorldX;
            cell.targetY = state.input.mouseWorldY;
            continue;
          }

          if (state.settings.botMode === "chase") {
            const target = nearestHumanCell(cell, bot.id);
            if (target) {
              cell.targetX = target.x;
              cell.targetY = target.y;
            } else {
              cell.targetX = bot.wanderX;
              cell.targetY = bot.wanderY;
            }
            continue;
          }

          if (state.settings.botMode === "virus") {
            const virus = nearestBreakableVirus(cell);
            if (virus) {
              cell.targetX = virus.x;
              cell.targetY = virus.y;
              continue;
            }
          }

          let bestPrey = null;
          let bestPreyScore = 0;
          let avoidCellX = 0;
          let avoidCellY = 0;
          let avoidCellPower = 0;

          const nearbyCells = cellGrid.query(cell.x, cell.y, BOT_AI_SCAN_RANGE, aiCellsScratch);
          for (const other of nearbyCells) {
            if (other.ownerId === bot.id || other.dead) continue;
            const dx = other.x - cell.x;
            const dy = other.y - cell.y;
            const d2 = dx * dx + dy * dy;
            const dist = Math.sqrt(d2) || 1;

            if (state.settings.botMode !== "virus" && other.mass > cell.mass * 1.03 && dist < 1180) {
              const danger = Math.max(0, 1 - dist / 1180) * clamp(other.mass / Math.max(1, cell.mass), 1, 5);
              avoidCellX -= dx / dist * danger;
              avoidCellY -= dy / dist * danger;
              avoidCellPower += danger;
            }

            if (other.radius >= cell.radius * CONSUME_RADIUS_RATIO && dist < 980) {
              continue;
            }

            if (cell.radius >= other.radius * CONSUME_RADIUS_RATIO && dist < 1050) {
              const score = other.mass / Math.max(120, dist);
              if (score > bestPreyScore) {
                bestPreyScore = score;
                bestPrey = other;
              }
            }
          }

          const nearbyViruses = virusGrid.query(cell.x, cell.y, 620, aiEntityScratch);
          let avoidVirusX = 0;
          let avoidVirusY = 0;
          let avoidVirusPower = 0;
          for (const virus of nearbyViruses) {
            if (cell.mass < VIRUS_EXPLODE_MASS) continue;
            const dx = virus.x - cell.x;
            const dy = virus.y - cell.y;
            const d2 = dx * dx + dy * dy;
            if (d2 > 620 * 620) continue;
            const d = Math.sqrt(d2) || 1;
            const danger = Math.max(0, 1 - d / 620);
            avoidVirusX -= dx / d * danger;
            avoidVirusY -= dy / d * danger;
            avoidVirusPower += danger;
          }

          if (avoidVirusPower > 0.18) {
            const n = normalized(avoidVirusX, avoidVirusY, bot.wanderX - cell.x, bot.wanderY - cell.y);
            cell.targetX = clamp(cell.x + n.x * 780, 120, WORLD_SIZE - 120);
            cell.targetY = clamp(cell.y + n.y * 780, 120, WORLD_SIZE - 120);
            continue;
          }

          if (avoidCellPower > 0.22) {
            const n = normalized(avoidCellX, avoidCellY, bot.wanderX - cell.x, bot.wanderY - cell.y);
            cell.targetX = clamp(cell.x + n.x * 980, 120, WORLD_SIZE - 120);
            cell.targetY = clamp(cell.y + n.y * 980, 120, WORLD_SIZE - 120);
            continue;
          }

          if (bestPrey) {
            cell.targetX = bestPrey.x;
            cell.targetY = bestPrey.y;
            const d = Math.hypot(bestPrey.x - cell.x, bestPrey.y - cell.y);
            continue;
          }

          const nearestHuman = nearestHumanCell(cell, bot.id);

          if (nearestHuman) {
            const orbit = nearestHuman.radius * 0.42 + 46;
            const angle = (cell.id * 2.399 + bot.respawns * 0.73) % TAU;
            cell.targetX = clamp(nearestHuman.x + Math.cos(angle) * orbit, 80, WORLD_SIZE - 80);
            cell.targetY = clamp(nearestHuman.y + Math.sin(angle) * orbit, 80, WORLD_SIZE - 80);
            continue;
          }

          let bestFood = null;
          let bestFoodD2 = Infinity;
          const nearbyFood = foodGrid.query(cell.x, cell.y, 620, aiEntityScratch);
          for (const food of nearbyFood) {
            if (food.dead) continue;
            const d2 = distSq(cell.x, cell.y, food.x, food.y);
            if (d2 < bestFoodD2) {
              bestFoodD2 = d2;
              bestFood = food;
            }
          }

          const nearbyFeeds = feedGrid.query(cell.x, cell.y, 760, aiEntityScratch);
          for (const feed of nearbyFeeds) {
            if (feed.dead) continue;
            if (feed.ownerId === cell.ownerId && feed.age < 0.75) continue;
            const d2 = distSq(cell.x, cell.y, feed.x, feed.y) * 0.45;
            if (d2 < bestFoodD2 && (feed.ownerId !== cell.ownerId || cell.radius >= feed.radius * CONSUME_RADIUS_RATIO)) {
              bestFoodD2 = d2;
              bestFood = feed;
            }
          }

          if (bestFood) {
            cell.targetX = bestFood.x;
            cell.targetY = bestFood.y;
          } else {
            cell.targetX = bot.wanderX;
            cell.targetY = bot.wanderY;
          }
        }

        const liveCells = bot.cells.filter((cell) => !cell.dead);
        if (liveCells.length > 1) {
          const lead = liveCells
            .slice()
            .sort((a, b) => {
              const massDiff = b.mass - a.mass;
              if (Math.abs(massDiff) > 0.001) return massDiff;
              return (a.id || 0) - (b.id || 0);
            })[0];
          const targetX = lead.targetX;
          const targetY = lead.targetY;
          for (const cell of liveCells) {
            cell.targetX = targetX;
            cell.targetY = targetY;
          }
        }
      }

      function nearestHumanCell(cell, excludeActorId = "") {
        let nearest = null;
        let nearestD2 = Infinity;
        for (const actor of state.actors) {
          if (!actor.isHuman || actor.id === excludeActorId) continue;
          for (const humanCell of actor.cells) {
            if (humanCell.dead) continue;
            const d2 = distSq(cell.x, cell.y, humanCell.x, humanCell.y);
            if (d2 < nearestD2) {
              nearestD2 = d2;
              nearest = humanCell;
            }
          }
        }
        return nearest;
      }

      function nearestEdibleVirus(cell) {
        let nearest = null;
        let nearestD2 = Infinity;
        const nearby = virusGrid.query(cell.x, cell.y, 1600, aiEntityScratch);
        for (const virus of nearby) {
          if (virus.dead) continue;
          if (cell.mass + 0.001 < virus.mass * CONSUME_MASS_RATIO) continue;
          if (cell.radius + 0.001 < virus.radius * CONSUME_RADIUS_RATIO) continue;
          const d2 = distSq(cell.x, cell.y, virus.x, virus.y);
          if (d2 < nearestD2) {
            nearestD2 = d2;
            nearest = virus;
          }
        }
        return nearest;
      }

      function nearestBreakableVirus(cell) {
        if (cell.mass + 0.001 < VIRUS_EXPLODE_MASS) return null;
        let nearest = null;
        let nearestD2 = Infinity;
        const nearby = virusGrid.query(cell.x, cell.y, 1800, aiEntityScratch);
        for (const virus of nearby) {
          if (virus.dead) continue;
          const d2 = distSq(cell.x, cell.y, virus.x, virus.y);
          if (d2 < nearestD2) {
            nearestD2 = d2;
            nearest = virus;
          }
        }
        return nearest;
      }
