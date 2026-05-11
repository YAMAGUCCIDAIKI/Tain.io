// 細胞の移動、壁判定、衝突解決、捕食更新を扱います。
      function cellSpeed(cell) {
        return clamp(1440 / Math.pow(cell.radius, 0.46), 116, 436) * CELL_MOVE_SPEED_SCALE;
      }

      function turnCellFacing(cell, targetDir, dt) {
        if (cell.instantFacing) {
          cell.faceX = targetDir.x;
          cell.faceY = targetDir.y;
          return;
        }
        const current = normalized(
          Number.isFinite(cell.faceX) ? cell.faceX : 1,
          Number.isFinite(cell.faceY) ? cell.faceY : 0,
          1,
          0
        );
        const turnRate = cell.splitBoostAge > 0 ? 1.1 : 7.2;
        const turn = 1 - Math.exp(-dt * turnRate);
        const next = normalized(
          current.x + (targetDir.x - current.x) * turn,
          current.y + (targetDir.y - current.y) * turn,
          targetDir.x,
          targetDir.y
        );
        cell.faceX = next.x;
        cell.faceY = next.y;
      }

      function splitMotionSubsteps(dt) {
        let maxSpeed = 0;
        for (const actor of state.actors) {
          for (const cell of actor.cells) {
            if (cell.dead) continue;
            const speed = Math.hypot(cell.vx + cell.boostX, cell.vy + cell.boostY);
            if (speed > maxSpeed) maxSpeed = speed;
          }
        }
        return clamp(Math.ceil(maxSpeed * dt / 12), 1, 28);
      }

      function beginCellSweeps() {
        for (const actor of state.actors) {
          for (const cell of actor.cells) {
            if (cell.dead) continue;
            const boostSpeed = Math.hypot(cell.boostX, cell.boostY);
            cell.sweepActive = cell.launchVelocityAge > 0 || cell.splitBoostAge > 0 || cell.fragmentAge > 0 || boostSpeed > 30;
            cell.sweepFromX = cell.x;
            cell.sweepFromY = cell.y;
            cell.sweepToX = cell.x;
            cell.sweepToY = cell.y;
            cell.sweepPoints = cell.sweepActive ? [{ x: cell.x, y: cell.y }] : null;
          }
        }
      }

      function appendCellSweepPoint(cell) {
        if (!cell.sweepActive || !cell.sweepPoints) return;
        const last = cell.sweepPoints[cell.sweepPoints.length - 1];
        if (distSq(last.x, last.y, cell.x, cell.y) > 0.25) {
          cell.sweepPoints.push({ x: cell.x, y: cell.y });
        }
        cell.sweepToX = cell.x;
        cell.sweepToY = cell.y;
      }

      function finishCellSweeps() {
        for (const actor of state.actors) {
          for (const cell of actor.cells) {
            if (cell.dead) continue;
            appendCellSweepPoint(cell);
          }
        }
      }

      function queryAlongCellPath(grid, cell, range, out) {
        if (!hasSweepPath(cell)) return grid.query(cell.x, cell.y, range, out);
        let left = cell.x;
        let right = cell.x;
        let top = cell.y;
        let bottom = cell.y;
        for (const point of cell.sweepPoints) {
          left = Math.min(left, point.x);
          right = Math.max(right, point.x);
          top = Math.min(top, point.y);
          bottom = Math.max(bottom, point.y);
        }
        return grid.queryRect(left - range, top - range, right + range, bottom + range, out);
      }

      function updateCellMotion(dt) {
        beginCellSweeps();
        const steps = splitMotionSubsteps(dt);
        const stepDt = dt / steps;
        for (let step = 0; step < steps; step += 1) {
          moveCellsStep(stepDt);
          if (steps > 1) {
            resolveOwnCells();
            finishCellSweeps();
          }
        }
        finishCellSweeps();
      }

      function moveCellsStep(dt) {
        for (const actor of state.actors) {
          for (const cell of actor.cells) {
            if (cell.splitHoldAge > 0) {
              cell.splitHoldAge = Math.max(0, cell.splitHoldAge - dt);
              cell.vx *= Math.exp(-dt * 16);
              cell.vy *= Math.exp(-dt * 16);
              if (cell.splitHoldAge <= 0) {
                cell.boostX += cell.pendingBoostX || 0;
                cell.boostY += cell.pendingBoostY || 0;
                cell.pendingBoostX = 0;
                cell.pendingBoostY = 0;
              } else {
                if (cell.birthAge < cell.birthDuration) {
                  cell.birthAge = Math.min(cell.birthDuration, cell.birthAge + dt);
                }
                appendCellSweepPoint(cell);
                continue;
              }
            }
            if (receivesPlayerInput(actor)) {
              cell.targetX = actor.input.targetX;
              cell.targetY = actor.input.targetY;
            }

            const instantControl = receivesPlayerInput(actor) && cell.splitBoostAge <= 0 && cell.launchVelocityAge <= 0;
            const dx = cell.targetX - cell.x;
            const dy = cell.targetY - cell.y;
            const n = normalized(dx, dy, 0, 0);
            const speed = cellSpeed(cell);
            const throttle = clamp(n.length / Math.max(35, cell.radius * 1.8), 0, 1);
            cell.instantFacing = instantControl;
            if (n.length > 0.001) turnCellFacing(cell, n, dt);
            cell.instantFacing = false;
            const desiredX = n.x * speed * throttle;
            const desiredY = n.y * speed * throttle;
            if (cell.launchVelocityAge > 0 || cell.splitBoostAge > 0) {
              const steerRate = cell.launchVelocityAge > 0 ? 2.2 : 2.6;
              const steer = 1 - Math.exp(-dt * steerRate);
              cell.vx += (desiredX - cell.vx) * steer * 0.18;
              cell.vy += (desiredY - cell.vy) * steer * 0.18;
              const velocityDragRate = cell.launchVelocityAge > 0
                ? Math.max(0.12, Math.log(Math.max(1.05, Math.hypot(cell.vx, cell.vy)) / Math.max(1, speed)) / Math.max(0.1, cell.launchVelocityAge))
                : 1.5;
              const velocityDrag = Math.exp(-dt * velocityDragRate);
              cell.vx *= velocityDrag;
              cell.vy *= velocityDrag;
            } else {
              const responseRate = instantControl ? 15 : 10;
              const response = 1 - Math.exp(-dt * responseRate);
              cell.vx += (desiredX - cell.vx) * response;
              cell.vy += (desiredY - cell.vy) * response;
            }
            const boostSpeed = Math.hypot(cell.boostX, cell.boostY);
            const hasSplitMomentum = cell.splitBoostAge > 0 || boostSpeed > 30;
            const maxBoost = cell.fragmentAge > 0
              ? 1120
              : (hasSplitMomentum ? SPLIT_MAX_BOOST * splitSpeedScale() : 720);
            const maxVelocity = cell.launchVelocityAge > 0
              ? Math.max(speed * 1.35, SPLIT_MAX_BOOST * splitSpeedScale())
              : speed * 1.35;
            capVelocity(cell, maxVelocity);
            capBoost(cell, maxBoost);
            cell.x += (cell.vx + cell.boostX) * dt;
            cell.y += (cell.vy + cell.boostY) * dt;

            const decayRate = cell.fragmentAge > 0
              ? 2.6
              : (hasSplitMomentum ? SPLIT_BOOST_DECAY / Math.max(0.1, state.settings.splitDecayTime) : 3.7);
            const decay = Math.exp(-dt * decayRate);
            cell.boostX *= decay;
            cell.boostY *= decay;
            if (Math.abs(cell.boostX) < 0.02) cell.boostX = 0;
            if (Math.abs(cell.boostY) < 0.02) cell.boostY = 0;
            capBoost(cell, maxBoost);

            if (cell.birthAge < cell.birthDuration) {
              cell.birthAge = Math.min(cell.birthDuration, cell.birthAge + dt);
            }
            if (cell.fragmentAge > 0) cell.fragmentAge = Math.max(0, cell.fragmentAge - dt);
            if (cell.launchVelocityAge > 0) cell.launchVelocityAge = Math.max(0, cell.launchVelocityAge - dt);
            if (cell.splitBoostAge > 0) cell.splitBoostAge = Math.max(0, cell.splitBoostAge - dt);
            if (cell.virusCooldown > 0) cell.virusCooldown = Math.max(0, cell.virusCooldown - dt);
            if (cell.mergeVirusWindow > 0) cell.mergeVirusWindow = Math.max(0, cell.mergeVirusWindow - dt);
            cell.cooldown = mergeTimeLeft(cell);
            let cappedThisFrame = false;
            if (cell.mass > MAX_CELL_MASS) {
              const preservedMergeTotal = cell.mergeVirusWindow > 0
                ? Math.max(cell.mergeBurstTotal || 0, cell.mass)
                : cell.mass;
              if (cell.capFramesLeft <= 0) cell.capFramesLeft = MASS_CAP_SETTLE_FRAMES;
              const frameStep = Math.min(cell.capFramesLeft, dt * 60);
              const reduceRatio = frameStep / Math.max(1, cell.capFramesLeft);
              cell.mass -= (cell.mass - MAX_CELL_MASS) * reduceRatio;
              cell.capFramesLeft -= frameStep;
              if (cell.capFramesLeft <= 0.001 || cell.mass <= MAX_CELL_MASS + 0.001) {
                cell.mass = MAX_CELL_MASS;
                cell.capFramesLeft = 0;
              }
              cell.mergeOverflowMass = Math.max(0, preservedMergeTotal - MAX_CELL_MASS);
              cell.mergeBurstPieces = 1;
              cell.mergeBurstTotal = preservedMergeTotal;
              refreshCell(cell);
              cappedThisFrame = true;
            } else {
              cell.capFramesLeft = 0;
              if (cell.mergeVirusWindow > 0 && (cell.mergeBurstTotal || 0) > MAX_CELL_MASS) {
                cell.mergeOverflowMass = Math.max(0, cell.mergeBurstTotal - MAX_CELL_MASS);
                cell.mergeBurstPieces = 1;
              } else {
                cell.mergeOverflowMass = 0;
                cell.mergeBurstPieces = 1;
                cell.mergeBurstTotal = cell.mass;
              }
            }
            if (cell.mass > 100 && !cappedThisFrame) {
              cell.mass = Math.max(MIN_CELL_MASS, cell.mass - cell.mass * MASS_DECAY_PER_SECOND * dt);
              refreshCell(cell);
            }

            const wallInset = wallInsetForCell(cell);
            if (cell.x < wallInset) {
              cell.x = wallInset;
              cell.boostX = Math.max(0, cell.boostX);
              cell.vx = Math.max(0, cell.vx);
            } else if (cell.x > WORLD_SIZE - wallInset) {
              cell.x = WORLD_SIZE - wallInset;
              cell.boostX = Math.min(0, cell.boostX);
              cell.vx = Math.min(0, cell.vx);
            }

            if (cell.y < wallInset) {
              cell.y = wallInset;
              cell.boostY = Math.max(0, cell.boostY);
              cell.vy = Math.max(0, cell.vy);
            } else if (cell.y > WORLD_SIZE - wallInset) {
              cell.y = WORLD_SIZE - wallInset;
              cell.boostY = Math.min(0, cell.boostY);
              cell.vy = Math.min(0, cell.vy);
            }

            appendCellSweepPoint(cell);
          }
        }
      }

      function tryMerge(actor, a, b) {
        if (!canCellMerge(a) || !canCellMerge(b)) return false;
        if (mergePairCooling(actor, a, b)) return false;

        const aMergeMass = mergeAccountingMass(a);
        const bMergeMass = mergeAccountingMass(b);
        let big = aMergeMass >= bMergeMass ? a : b;
        let small = big === a ? b : a;
        const bigMergeMass = big === a ? aMergeMass : bMergeMass;
        const smallMergeMass = small === a ? aMergeMass : bMergeMass;
        const dominantId = mergeDominantId(a, b, aMergeMass, bMergeMass);
        const centerDistance = Math.hypot(a.x - b.x, a.y - b.y);
        if (mergePairCooling(actor, a, b)) return false;
        if (centerDistance >= a.radius + b.radius) {
          if (a.mergePartnerId === b.id || b.mergePartnerId === a.id) clearMergeAttempt(actor, a, b);
          return false;
        }

        if (hasMergeCancellation(actor, a, b, dominantId)) {
          resetCancelledMergeAttempt(actor, a, b, centerDistance);
          return false;
        }
        recordMergeAttempt(actor, a, b, dominantId || big.id);

        if (!hasHalfAreaOverlap(a, b, centerDistance)) return false;

        const total = bigMergeMass + smallMergeMass;
        const inv = 1 / total;
        big.x = (big.x * bigMergeMass + small.x * smallMergeMass) * inv;
        big.y = (big.y * bigMergeMass + small.y * smallMergeMass) * inv;
        big.vx = (big.vx * bigMergeMass + small.vx * smallMergeMass) * inv;
        big.vy = (big.vy * bigMergeMass + small.vy * smallMergeMass) * inv;
        big.boostX = (big.boostX * bigMergeMass + small.boostX * smallMergeMass) * inv;
        big.boostY = (big.boostY * bigMergeMass + small.boostY * smallMergeMass) * inv;
        big.mass = total > MAX_CELL_MASS
          ? Math.min(total, MAX_CELL_MASS * MERGE_CAP_OVERSIZE_RATIO)
          : total;
        big.virusCooldown = 0;
        big.mergeOverflowMass = Math.max(0, total - MAX_CELL_MASS);
        big.mergeBurstPieces = 1;
        big.mergeBurstTotal = total;
        big.mergeVirusWindow = total > MAX_CELL_MASS ? 4.0 : 0.28;
        if (big.mass > MAX_CELL_MASS) big.capFramesLeft = MASS_CAP_SETTLE_FRAMES;
        refreshCell(big);
        capVelocity(big, cellSpeed(big) * 1.25);
        capBoost(big, 120);
        clearMergeAttempt(actor, big, small);
        small.dead = true;
        return true;
      }

      function separateOwnCells(actor) {
        const iterations = 6;
        for (let pass = 0; pass < iterations; pass += 1) {
          for (let i = 0; i < actor.cells.length; i += 1) {
            const a = actor.cells[i];
            if (a.dead) continue;
            for (let j = i + 1; j < actor.cells.length; j += 1) {
              const b = actor.cells[j];
              if (b.dead) continue;
              const pairCooling = mergePairCooling(actor, a, b);
              const canMergePair = canCellMerge(a) && canCellMerge(b);

              const dx = b.x - a.x;
              const dy = b.y - a.y;
              const d = Math.hypot(dx, dy);
              const touch = a.radius + b.radius;
              if (d >= touch) {
                if (a.mergePartnerId === b.id || b.mergePartnerId === a.id) clearMergeAttempt(actor, a, b);
                continue;
              }
              if (!pairCooling && observeMergeCandidate(actor, a, b, d, canMergePair)) continue;
              if (canMergePair && !pairCooling) continue;
              if (!pairCooling && (a.separationGraceUntil > state.now || b.separationGraceUntil > state.now)) continue;

              const fallbackAngle = ((a.id * 12.9898 + b.id * 78.233 + pass * 37.719) % TAU);
              const nx = d < 0.001 ? Math.cos(fallbackAngle) : dx / d;
              const ny = d < 0.001 ? Math.sin(fallbackAngle) : dy / d;
              const overlap = touch - d + 0.75;
              const total = a.mass + b.mass;
              const aShare = b.mass / total;
              const bShare = a.mass / total;
              const aMoveX = a.vx + a.boostX;
              const aMoveY = a.vy + a.boostY;
              const bMoveX = b.vx + b.boostX;
              const bMoveY = b.vy + b.boostY;
              const aMoveSpeed = Math.hypot(aMoveX, aMoveY);
              const bMoveSpeed = Math.hypot(bMoveX, bMoveY);
              const sameSplitDirection = a.splitBoostAge > 0 && b.splitBoostAge > 0 &&
                aMoveSpeed > 1 && bMoveSpeed > 1 &&
                (aMoveX * bMoveX + aMoveY * bMoveY) / (aMoveSpeed * bMoveSpeed) > 0.88;
              let separateX = nx;
              let separateY = ny;
              if (sameSplitDirection) {
                const axis = normalized(aMoveX + bMoveX, aMoveY + bMoveY, aMoveX, aMoveY);
                const sign = (nx * axis.x + ny * axis.y) < 0 ? -1 : 1;
                separateX = axis.x * sign;
                separateY = axis.y * sign;
              }
              a.x -= separateX * overlap * aShare;
              a.y -= separateY * overlap * aShare;
              b.x += separateX * overlap * bShare;
              b.y += separateY * overlap * bShare;

              const relativeClosing = (bMoveX - aMoveX) * nx + (bMoveY - aMoveY) * ny;
              if (relativeClosing < 0 && !sameSplitDirection) {
                const correction = -relativeClosing * (a.splitBoostAge > 0 || b.splitBoostAge > 0 ? 0.62 : 0.28);
                a.boostX -= nx * correction * aShare;
                a.boostY -= ny * correction * aShare;
                b.boostX += nx * correction * bShare;
                b.boostY += ny * correction * bShare;
              }

              clampCellToWorld(a);
              clampCellToWorld(b);

            }
          }
        }
      }

      function limitOwnCellSpread(actor) {
        if (actor.cells.length < 2) return;
        const center = actorCenter(actor);
        const maxDistance = clamp(
          220 + Math.sqrt(center.mass) * 5 + actor.cells.length * 22,
          340,
          MAX_CELL_SPREAD
        );

        for (const cell of actor.cells) {
          if (cell.dead) continue;
          const dx = cell.x - center.x;
          const dy = cell.y - center.y;
          const d = Math.hypot(dx, dy);
          const splitAllowance = cell.splitBoostAge > 0
            ? SPLIT_SPREAD_ALLOWANCE * Math.min(1, cell.splitBoostAge / SPLIT_BOOST_DURATION)
            : 0;
          const allowed = maxDistance + cell.radius * 0.35 + splitAllowance;
          if (d <= allowed || d < 0.001) continue;

          const nx = dx / d;
          const ny = dy / d;
          const overshoot = d - allowed;
          const pull = Math.min(overshoot, 28 + overshoot * 0.26);
          cell.x -= nx * pull;
          cell.y -= ny * pull;

          const outwardBoost = cell.boostX * nx + cell.boostY * ny;
          if (outwardBoost > 0) {
            cell.boostX -= nx * outwardBoost * 0.55;
            cell.boostY -= ny * outwardBoost * 0.55;
          }

          const hardLimit = allowed * 1.16;
          if (d > hardLimit) {
            cell.x = center.x + nx * hardLimit;
            cell.y = center.y + ny * hardLimit;
          }

          clampCellToWorld(cell);
        }
      }

      function resolveOwnCells() {
        for (const actor of state.actors) {
          if (actor.lastMergeFrame !== state.frameIndex) {
            mergeLoop:
            for (let i = 0; i < actor.cells.length; i += 1) {
              for (let j = i + 1; j < actor.cells.length; j += 1) {
                if (tryMerge(actor, actor.cells[i], actor.cells[j])) {
                  actor.cells = actor.cells.filter((cell) => !cell.dead);
                  actor.lastMergeFrame = state.frameIndex;
                  break mergeLoop;
                }
              }
            }
          }
          separateOwnCells(actor);
          separateOwnCells(actor);
        }
      }

      function updateLooseMass(dt) {
        for (const feed of state.feeds) {
          feed.age += dt;
          feed.x += feed.vx * dt;
          feed.y += feed.vy * dt;
          const decay = Math.exp(-dt * 2.65);
          feed.vx *= decay;
          feed.vy *= decay;
          if (feed.x < feed.radius || feed.x > WORLD_SIZE - feed.radius) {
            feed.x = clamp(feed.x, feed.radius, WORLD_SIZE - feed.radius);
            feed.vx *= -0.22;
          }
          if (feed.y < feed.radius || feed.y > WORLD_SIZE - feed.radius) {
            feed.y = clamp(feed.y, feed.radius, WORLD_SIZE - feed.radius);
            feed.vy *= -0.22;
          }
        }

        for (const virus of state.viruses) {
          virus.x += virus.vx * dt;
          virus.y += virus.vy * dt;
          const decay = Math.exp(-dt * 1.25);
          virus.vx *= decay;
          virus.vy *= decay;
          if (virus.x < virus.radius || virus.x > WORLD_SIZE - virus.radius) {
            virus.x = clamp(virus.x, virus.radius, WORLD_SIZE - virus.radius);
            virus.vx *= -0.28;
          }
          if (virus.y < virus.radius || virus.y > WORLD_SIZE - virus.radius) {
            virus.y = clamp(virus.y, virus.radius, WORLD_SIZE - virus.radius);
            virus.vy *= -0.28;
          }
        }
      }

      function handleFoodEating() {
        const cells = allCells(scratch).sort((a, b) => b.radius - a.radius);
        const nearby = [];
        for (const cell of cells) {
          queryAlongCellPath(foodGrid, cell, cell.radius + 36, nearby);
          for (const food of nearby) {
            if (food.dead) continue;
            if (canConsumeSwept(cell, food)) {
              food.dead = true;
              addConsumedMass(cell, food.mass);
            }
          }
        }
      }

      function handleFeedVirusCollisions() {
        const nearby = [];
        for (const feed of state.feeds) {
          if (feed.dead) continue;
          virusGrid.query(feed.x, feed.y, 90, nearby);
          for (const virus of nearby) {
            if (virus.dead) continue;
            const hit = virus.radius + feed.radius * 0.4;
            if (distSq(feed.x, feed.y, virus.x, virus.y) > hit * hit) continue;

            feed.dead = true;
            // 粒を吸った棘は質量と見た目の半径を同時に更新する。
            virus.mass += feed.mass;
            virus.radius = radiusFromMass(virus.mass);
            virus.feedCount += 1;
            const n = normalized(feed.vx, feed.vy, feed.x - virus.x, feed.y - virus.y);
            if (virus.feedCount >= VIRUS_FEED_LIMIT) {
              virus.feedCount = 0;
              const spawnX = clamp(virus.x + n.x * (virus.radius * 2.1), virus.radius, WORLD_SIZE - virus.radius);
              const spawnY = clamp(virus.y + n.y * (virus.radius * 2.1), virus.radius, WORLD_SIZE - virus.radius);
              const newVirus = createVirus(spawnX, spawnY, false);
              newVirus.vx = n.x * 540;
              newVirus.vy = n.y * 540;
              state.viruses.push(newVirus);
              virus.mass = VIRUS_MASS;
              virus.radius = radiusFromMass(virus.mass);
            }
            break;
          }
        }
      }

      function handleFeedEating() {
        const cells = allCells(scratch).sort((a, b) => b.radius - a.radius);
        const nearby = [];
        for (const cell of cells) {
          queryAlongCellPath(feedGrid, cell, cell.radius + 60, nearby);
          for (const feed of nearby) {
            if (feed.dead) continue;
            if (feed.ownerId === cell.ownerId && feed.age < 0.75) continue;
            if (canConsumeFeed(cell, feed)) {
              feed.dead = true;
              addConsumedMass(cell, feed.mass);
            }
          }
        }
      }

      function handleVirusCellCollisions() {
        const cells = allCells(scratch)
          .sort((a, b) => virusCollisionPriority(b) - virusCollisionPriority(a));
        const nearby = [];
        for (const cell of cells) {
          if (cell.dead) continue;
          queryAlongCellPath(virusGrid, cell, mergeVirusHitRadius(cell) + 360, nearby);
          for (const virus of nearby) {
            if (virus.dead) continue;
            const liveCells = liveCellCount(cell.actor);
            const eatsVirus = canConsumeVirus(cell, virus);

            if (liveCells >= MAX_CELLS) {
              if (eatsVirus) {
                virus.dead = true;
                addConsumedMass(cell, virus.mass);
                break;
              }
              continue;
            }

            if (cell.virusCooldown > 0) continue;
            if (mergeVirusHitMass(cell) < VIRUS_EXPLODE_MASS) continue;
            if (canBurstVirus(cell, virus)) {
              explodeCellOnVirus(cell.actor, cell, virus);
              virus.dead = true;
              break;
            }
          }
        }
      }

      function handleCellEating() {
        const cells = allCells(scratch).sort((a, b) => b.radius - a.radius);
        for (const eater of cells) {
          if (eater.dead) continue;
          const nearbyCells = cellGrid.query(eater.x, eater.y, eater.radius + 650, cellQueryScratch);
          for (const victim of nearbyCells) {
            if (!canBeCellVictimFor(eater, victim) || victim.ownerId === eater.ownerId || victim === eater) continue;
            if (!canConsume(eater, victim)) continue;
            markCellConsumed(eater, victim);
          }
        }
        handleSweptCellEating(cells);
      }

      function handleSweptCellEating(cells) {
        const sweptCells = cells.filter((cell) => !cell.dead && hasSweepPath(cell));
        if (!sweptCells.length) return;

        for (const eater of cells) {
          if (eater.dead) continue;
          for (const victim of sweptCells) {
            if (!canBeCellVictimFor(eater, victim) || victim.ownerId === eater.ownerId || victim === eater) continue;
            if (!canConsumeSwept(eater, victim)) continue;
            markCellConsumed(eater, victim);
          }
        }

        for (const eater of sweptCells) {
          if (eater.dead) continue;
          for (const victim of cells) {
            if (!canBeCellVictimFor(eater, victim) || victim.ownerId === eater.ownerId || victim === eater) continue;
            if (!canConsumeSwept(eater, victim)) continue;
            markCellConsumed(eater, victim);
          }
        }
      }

      function cleanupAndRespawn() {
        if (state.net.role === "host" && state.net.connected) {
          for (const actor of state.actors) {
            for (const cell of actor.cells) {
              if (canFinalizeDeadCell(cell) && cell.id != null) state.net.removedCellKeys.add(`${actor.id}:${cell.id}`);
            }
          }
        }
        for (const actor of state.actors) {
          actor.cells = actor.cells.filter((cell) => (!cell.dead || !canFinalizeDeadCell(cell)) && cell.mass >= MIN_CELL_MASS);
        }

        const guest = actorById("guest");
        const guestClone = remoteCloneActor("guest");
        if (guest || guestClone) {
          const guestActors = [guest, guestClone].filter(Boolean);
          const liveGuestActors = guestActors.filter((actor) => liveCellCount(actor) > 0);
          if (!liveGuestActors.length && guest) {
            for (let i = state.actors.length - 1; i >= 0; i -= 1) {
              if (state.actors[i].id === localCloneId("guest")) state.actors.splice(i, 1);
            }
            guest.localClone = false;
            clearActorControlInput(guest);
          }
        }

        const localActors = localHumanActors();
        if (localActors.length) {
          const liveLocalActors = localActors.filter((actor) => liveCellCount(actor) > 0);
          if (!liveLocalActors.length) {
            const main = primaryLocalActor() || actorById(state.localActorId) || localActors[0];
            const mainFamily = actorFamilyId(main?.id || state.localActorId);
            for (let i = state.actors.length - 1; i >= 0; i -= 1) {
              if (state.actors[i].localClone && actorFamilyId(state.actors[i].id) === mainFamily) state.actors.splice(i, 1);
            }
            if (main) {
              main.localClone = false;
              setActiveLocalActor(main);
            }
            state.waitingForPlay = true;
            if (!state.spectating) setMenuOpen(true);
          } else {
            const activeActor = actorById(state.input.activeActorId);
            if (!state.player || state.player.control !== "local" || liveCellCount(state.player) <= 0 || !activeActor || liveCellCount(activeActor) <= 0) {
              switchActiveLocalActorIfDead();
            }
          }
        }

        for (const actor of state.actors) {
          if (actor.control === "local" && actor.isHuman) continue;
          if (actor.id === "guest" || actor.id === localCloneId("guest")) continue;
          if (actor.cells.length === 0) {
            if (actor.isHuman) {
              continue;
            } else {
              if (actor.respawnAt <= 0) {
                actor.respawnAt = state.now + 0.5;
              } else if (state.now >= actor.respawnAt) {
                spawnActor(actor, botSpawnMass());
              }
            }
          }
        }

        const foodsBeforeCleanup = state.foods.length;
        if (state.net.role === "host" && state.net.connected) {
          for (const feed of state.feeds) {
            if (feed.dead && feed.id != null) state.net.removedFeedIds.add(feed.id);
          }
          for (const virus of state.viruses) {
            if (virus.dead && virus.id != null) state.net.removedVirusIds.add(virus.id);
          }
        }
        state.foods = state.foods.filter((food) => !food.dead);
        state.feeds = state.feeds.filter((feed) => !feed.dead);
        const foodTarget = state.settings.foodTarget;
        const virusTarget = state.settings.virusTarget;
        if (state.foods.length !== foodsBeforeCleanup) state.foodGridDirty = true;
        if (state.foods.length > foodTarget) {
          state.foods.length = foodTarget;
          state.foodGridDirty = true;
        }
        trimNaturalViruses(virusTarget);
        let liveVirusTotal = liveVirusCount();
        const maxQueuedViruses = Math.max(0, virusTarget - liveVirusTotal);
        if (state.virusRespawnQueue.length > maxQueuedViruses) {
          state.virusRespawnQueue.length = maxQueuedViruses;
        }

        const nextVirusRespawnQueue = [];
        let spawnedViruses = 0;
        for (const spawnAt of state.virusRespawnQueue) {
          if (
            spawnAt <= state.now &&
            liveVirusTotal < virusTarget &&
            spawnedViruses < MAX_VIRUS_SPAWNS_PER_FRAME
          ) {
            state.viruses.push(spawnVirusSafely());
            liveVirusTotal += 1;
            spawnedViruses += 1;
          } else {
            nextVirusRespawnQueue.push(spawnAt);
          }
        }
        state.virusRespawnQueue = nextVirusRespawnQueue;

        const foodSpawnBudget = Math.min(MAX_FOOD_SPAWNS_PER_FRAME, foodTarget - state.foods.length);
        for (let i = 0; i < foodSpawnBudget; i += 1) addFood();
        while (liveVirusTotal + state.virusRespawnQueue.length < virusTarget) {
          state.virusRespawnQueue.push(state.now + VIRUS_RESPAWN_DELAY);
        }
        ensureBotPopulation();
      }

      function updateCamera(dt) {
        const center = state.spectating
          ? spectatorCenter()
          : sharedLocalViewCenter(state.net.role === "client");
        const total = Math.max(1, center.mass);
        const cellCount = state.spectating ? 1 : Math.max(1, center.cellCount || state.player?.cells.length || 1);
        let targetZoom = mobileTargetZoom(total, cellCount);
        if (!state.spectating && center.spread > 0) {
          const fitZoom = Math.min(
            (state.width * 0.44) / center.spread,
            (state.height * 0.44) / center.spread
          );
          targetZoom = Math.min(targetZoom, clamp(fitZoom, 0.08, 1.28));
        }
        const follow = 1 - Math.exp(-dt * 5.3);
        state.camera.x += (center.x - state.camera.x) * follow;
        state.camera.y += (center.y - state.camera.y) * follow;
        state.camera.zoom += (targetZoom - state.camera.zoom) * (1 - Math.exp(-dt * 3.8));
      }

      function spectatorCenter() {
        if (state.spectatorMode === "cursor") {
          const dx = state.input.mouseX - state.width * 0.5;
          const dy = state.input.mouseY - state.height * 0.5;
          const distance = Math.hypot(dx, dy);
          if (distance > 8) {
            const speed = clamp(distance / Math.max(1, Math.min(state.width, state.height) * 0.5), 0, 1) * 520;
            return {
              x: clamp(state.camera.x + (dx / distance) * speed, 0, WORLD_SIZE),
              y: clamp(state.camera.y + (dy / distance) * speed, 0, WORLD_SIZE),
              mass: 1
            };
          }
          return { x: state.camera.x, y: state.camera.y, mass: 1 };
        }
        let best = null;
        let bestMass = -1;
        for (const actor of state.actors) {
          const center = actorCenter(actor, state.net.role === "client");
          if (center.mass > bestMass) {
            bestMass = center.mass;
            best = center;
          }
        }
        return best || { x: WORLD_SIZE * 0.5, y: WORLD_SIZE * 0.5, mass: 1 };
      }

      function mobileTargetZoom(total, cellCount) {
        const baseZoom = clamp(
          Math.min(state.width, state.height) / (820 + Math.sqrt(total) * 23 + cellCount * 48),
          0.16,
          1.05
        );
        return clamp(baseZoom / state.viewScale, 0.08, 1.28);
      }

      function updateHud(dt) {
        state.hudTimer -= dt;
        if (state.hudTimer > 0) return;
        state.hudTimer = 0.12;

        const playerMass = totalMass(state.player);
        massEl.textContent = state.spectating ? "観戦" : String(Math.round(playerMass));
        cellsEl.textContent = state.spectating ? "-" : `${state.player.cells.length}/${MAX_CELLS}`;
        fpsEl.textContent = String(Math.round(state.fps));
        versionEl.textContent = APP_VERSION;

        const ranked = state.actors
          .map((actor) => ({ actor, mass: totalMass(actor) }))
          .sort((a, b) => b.mass - a.mass)
          .slice(0, 10);
        const nutrientRow = `<div class="rank"><span>Σ</span><span>全体養分</span><b>${Math.round(totalServerNutrients())}</b></div>`;
        scoreboardEl.innerHTML = nutrientRow + ranked
          .map((entry, index) => {
            const cls = isLocalActor(entry.actor) ? "rank you" : "rank";
            return `<div class="${cls}"><span>${index + 1}</span><span>${escapeHtml(displayActorName(entry.actor))}</span><b>${Math.round(entry.mass)}</b></div>`;
          })
          .join("");

        flashEl.classList.remove("show");
      }

      function processPlayerControls(now) {
        for (const actor of state.actors) {
          if (!isPlayerControlled(actor)) continue;
          if (state.spectating && actor.control === "local") continue;
          if (actor.input.ejectQueued) {
            // Wキーの単押しでも、現在生きている全細胞から同時に粒を出す。
            if (ejectMass(actor, now, true) || now - actor.lastEject >= ejectInterval(actor)) {
              actor.input.ejectQueued = false;
            }
          } else if (actorAutoEjectHeld(actor)) {
            ejectMass(actor, now, true);
          }
          if (actor.input.splitQueued) {
            if (!actor.input.splitLockActive) {
              const aim = actorAimDirection(actor);
              actor.input.splitLockX = aim.x;
              actor.input.splitLockY = aim.y;
              actor.input.splitLockActive = true;
              actor.nextQueuedSplitAt = Math.min(actor.nextQueuedSplitAt, now);
            }

            let remaining = Math.max(1, actor.input.splitCount || 1);
            let didAnySplit = false;
            const splitIntervalSeconds = Math.max(0, (Number(state.settings.splitInputSpeed) || 0) / 1000);
            let splitBudget = splitIntervalSeconds <= 0
              ? MAX_QUEUED_SPLITS_PER_FRAME
              : (now + 0.0001 >= actor.nextQueuedSplitAt ? 1 : 0);
            while (remaining > 0 && splitBudget > 0 && liveCellCount(actor) < MAX_CELLS) {
              if (!splitActor(actor, actor.input.splitLockX, actor.input.splitLockY, now, 0, actor.input.targetX, actor.input.targetY)) {
                remaining = 0;
              } else {
                didAnySplit = true;
                remaining -= 1;
                splitBudget -= 1;
                if (splitIntervalSeconds > 0) actor.nextQueuedSplitAt = now + splitIntervalSeconds;
              }
            }

            actor.input.splitCount = Math.max(0, remaining);
            if (actor.input.splitCount <= 0 || (!didAnySplit && liveCellCount(actor) >= MAX_CELLS)) {
              actor.input.splitQueued = false;
              actor.input.splitCount = 0;
              actor.input.splitLockActive = false;
            }
          }
        }
        processBotManualControls(now);
      }

      function processBotManualControls(now) {
        const controllableBotMode = state.settings.botMode === "chase" || state.settings.botMode === "cursor";
        if (!controllableBotMode) {
          state.input.botSplitQueued = false;
          state.input.botEjectQueued = false;
          return;
        }

        if (state.input.botSplitQueued) {
          for (const bot of state.actors) {
            if (bot.isHuman) continue;
            const center = actorCenter(bot);
            const target = state.settings.botMode === "cursor"
              ? { x: state.input.mouseWorldX, y: state.input.mouseWorldY }
              : nearestHumanCell(center, bot.id);
            const aim = target
              ? normalized(target.x - center.x, target.y - center.y, bot.input.lastAimX, bot.input.lastAimY)
              : actorAimDirection(bot);
            splitActor(bot, aim.x, aim.y, now, 0, target?.x ?? bot.input.targetX, target?.y ?? bot.input.targetY);
          }
          state.input.botSplitQueued = false;
        }

        if (state.input.botEjectQueued || state.input.keys.has(state.keyBindings.botEject)) {
          for (const bot of state.actors) {
            if (bot.isHuman) continue;
            ejectMass(bot, now, true);
          }
          state.input.botEjectQueued = false;
        }
      }

      function update(dt, now, realNow = now) {
        state.now = now;
        state.realNow = realNow;
        updateMouseWorld();
        updateLocalActorInput();

        if (state.net.role === "client") {
          processClientNetworkUpdates();
          updateClientRenderState(dt);
          if (state.net.connected) sendLocalInput(state.realNow);
          updateCamera(dt);
          updateHud(dt);
          return;
        }

        processPlayerControls(now);

        rebuildSpatialHashes();
        for (const actor of state.actors) {
          if (!actor.isHuman) updateBotAI(actor, dt, now);
        }

        updateCellMotion(dt);
        resolveOwnCells();
        finishCellSweeps();
        updateLooseMass(dt);
        rebuildSpatialHashes();
        handleFeedVirusCollisions();
        handleFoodEating();
        handleFeedEating();
        handleVirusCellCollisions();
        handleCellEating();
        cleanupAndRespawn();
        updateCellRenderRadii(dt);
        updateCamera(dt);
        updateHud(dt);
        sendAuthoritativeSnapshot(state.realNow);
      }
