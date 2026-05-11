// 距離計算、重なり面積、合体、捕食判定などの基礎ロジックを定義します。
      function nextId() {
        const id = state.nextId;
        state.nextId += 1;
        return id;
      }

      function rand(min, max) {
        return min + Math.random() * (max - min);
      }

      function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
      }

      function distSq(ax, ay, bx, by) {
        const dx = ax - bx;
        const dy = ay - by;
        return dx * dx + dy * dy;
      }

      function segmentPointDistSq(ax, ay, bx, by, px, py) {
        const dx = bx - ax;
        const dy = by - ay;
        const lengthSq = dx * dx + dy * dy;
        if (lengthSq < 0.0001) return distSq(ax, ay, px, py);
        const t = clamp(((px - ax) * dx + (py - ay) * dy) / lengthSq, 0, 1);
        const closestX = ax + dx * t;
        const closestY = ay + dy * t;
        return distSq(closestX, closestY, px, py);
      }

      function cross(ax, ay, bx, by) {
        return ax * by - ay * bx;
      }

      function segmentsIntersect(ax, ay, bx, by, cx, cy, dx, dy) {
        const rx = bx - ax;
        const ry = by - ay;
        const sx = dx - cx;
        const sy = dy - cy;
        const denominator = cross(rx, ry, sx, sy);
        const qpx = cx - ax;
        const qpy = cy - ay;

        if (Math.abs(denominator) < 0.000001) {
          if (Math.abs(cross(qpx, qpy, rx, ry)) > 0.000001) return false;
          const rr = rx * rx + ry * ry;
          if (rr < 0.000001) return segmentPointDistSq(cx, cy, dx, dy, ax, ay) < 0.000001;
          const t0 = ((cx - ax) * rx + (cy - ay) * ry) / rr;
          const t1 = ((dx - ax) * rx + (dy - ay) * ry) / rr;
          return Math.max(Math.min(t0, t1), 0) <= Math.min(Math.max(t0, t1), 1);
        }

        const t = cross(qpx, qpy, sx, sy) / denominator;
        const u = cross(qpx, qpy, rx, ry) / denominator;
        return t >= 0 && t <= 1 && u >= 0 && u <= 1;
      }

      function segmentSegmentDistSq(ax, ay, bx, by, cx, cy, dx, dy) {
        if (segmentsIntersect(ax, ay, bx, by, cx, cy, dx, dy)) return 0;
        return Math.min(
          segmentPointDistSq(ax, ay, bx, by, cx, cy),
          segmentPointDistSq(ax, ay, bx, by, dx, dy),
          segmentPointDistSq(cx, cy, dx, dy, ax, ay),
          segmentPointDistSq(cx, cy, dx, dy, bx, by)
        );
      }

      function circleOverlapArea(radiusA, radiusB, distance) {
        if (distance >= radiusA + radiusB) return 0;
        const smallerRadius = Math.min(radiusA, radiusB);
        if (distance <= Math.abs(radiusA - radiusB)) return Math.PI * smallerRadius * smallerRadius;
        const angleA = 2 * Math.acos(clamp(
          (distance * distance + radiusA * radiusA - radiusB * radiusB) / (2 * distance * radiusA),
          -1,
          1
        ));
        const angleB = 2 * Math.acos(clamp(
          (distance * distance + radiusB * radiusB - radiusA * radiusA) / (2 * distance * radiusB),
          -1,
          1
        ));
        return 0.5 * radiusA * radiusA * (angleA - Math.sin(angleA)) +
          0.5 * radiusB * radiusB * (angleB - Math.sin(angleB));
      }

      function hasHalfAreaOverlap(a, b, distance) {
        const overlapArea = circleOverlapArea(a.radius, b.radius, distance);
        const halfAreaA = Math.PI * a.radius * a.radius * 0.5;
        const halfAreaB = Math.PI * b.radius * b.radius * 0.5;
        return overlapArea >= halfAreaA || overlapArea >= halfAreaB;
      }

      function radiusFromMass(mass) {
        return Math.sqrt(Math.max(1, mass)) * 4;
      }

      function refreshCell(cell) {
        if (cell.mass < MIN_CELL_MASS) cell.mass = MIN_CELL_MASS;
        const nextRadius = radiusFromMass(cell.mass);
        if (!Number.isFinite(cell.renderRadius)) {
          cell.renderRadius = nextRadius;
          cell.radiusAnimFrom = nextRadius;
          cell.radiusAnimTo = nextRadius;
          cell.radiusAnimAge = 0;
        } else if (Math.abs((cell.radiusAnimTo || cell.radius || nextRadius) - nextRadius) > 0.01) {
          cell.radiusAnimFrom = cell.renderRadius;
          cell.radiusAnimTo = nextRadius;
          cell.radiusAnimAge = 0;
        }
        cell.radius = nextRadius;
      }

      function updateRenderRadius(cell, dt) {
        if (!Number.isFinite(cell.renderRadius)) cell.renderRadius = cell.radius;
        const target = cell.radiusAnimTo || cell.radius;
        if (Math.abs(cell.renderRadius - target) <= 0.05) {
          cell.renderRadius = target;
          cell.radiusAnimFrom = target;
          cell.radiusAnimTo = target;
          cell.radiusAnimAge = 0;
          return;
        }
        const duration = 0.1;
        cell.radiusAnimAge = Math.min(duration, (cell.radiusAnimAge || 0) + dt);
        const t = clamp(cell.radiusAnimAge / duration, 0, 1);
        const eased = 1 - Math.pow(1 - t, 3);
        cell.renderRadius = (cell.radiusAnimFrom || cell.renderRadius) + (target - (cell.radiusAnimFrom || cell.renderRadius)) * eased;
      }

      function mergeCooldown(mass) {
        return Math.max(0, state.settings.mergeCooldown);
      }

      function mergeTimeLeft(cell) {
        return Math.max(0, (cell.mergeReadyAt || 0) - state.now);
      }

      function canCellMerge(cell) {
        return mergeTimeLeft(cell) <= 0;
      }

      function setMergeCooldown(cell, seconds = mergeCooldown(cell.mass)) {
        cell.mergeReadyAt = state.now + seconds;
        cell.cooldown = seconds;
        cell.mergePartnerId = null;
        cell.mergeDominantId = null;
      }

      function mergeDominantId(a, b, aMass = mergeAccountingMass(a), bMass = mergeAccountingMass(b)) {
        if (aMass === bMass) return null;
        return aMass > bMass ? a.id : b.id;
      }

      function hasMergeCancellation(actor, a, b, dominantId) {
        if (dominantId == null) return false;
        if (!actor.mergeDominantByPair) return false;
        const previousDominantId = actor.mergeDominantByPair.get(mergePairKey(a, b));
        return previousDominantId != null && previousDominantId !== dominantId;
      }

      function recordMergeAttempt(actor, a, b, dominantId) {
        if (dominantId == null) return;
        if (!actor.mergeDominantByPair) actor.mergeDominantByPair = new Map();
        actor.mergeDominantByPair.set(mergePairKey(a, b), dominantId);
        a.mergePartnerId = b.id;
        b.mergePartnerId = a.id;
        a.mergeDominantId = dominantId;
        b.mergeDominantId = dominantId;
      }

      function recordMergeObservation(actor, a, b, dominantId) {
        if (dominantId == null) return;
        if (!actor.mergeDominantByPair) actor.mergeDominantByPair = new Map();
        const key = mergePairKey(a, b);
        if (!actor.mergeDominantByPair.has(key)) {
          actor.mergeDominantByPair.set(key, dominantId);
        }
        const storedDominantId = actor.mergeDominantByPair.get(key);
        a.mergePartnerId = b.id;
        b.mergePartnerId = a.id;
        a.mergeDominantId = storedDominantId;
        b.mergeDominantId = storedDominantId;
      }

      function observeMergeCandidate(actor, a, b, distance, allowCancellation = false) {
        const dominantId = mergeDominantId(a, b);
        if (allowCancellation && hasMergeCancellation(actor, a, b, dominantId)) {
          resetCancelledMergeAttempt(actor, a, b, distance);
          return true;
        }
        recordMergeObservation(actor, a, b, dominantId);
        return false;
      }

      function clearMergeAttempt(actor, a, b) {
        if (!b) {
          a.mergePartnerId = null;
          a.mergeDominantId = null;
          return;
        }
        if (actor?.mergeDominantByPair) actor.mergeDominantByPair.delete(mergePairKey(a, b));
        if (a.mergePartnerId === b.id) {
          a.mergePartnerId = null;
          a.mergeDominantId = null;
        }
        if (b.mergePartnerId === a.id) {
          b.mergePartnerId = null;
          b.mergeDominantId = null;
        }
      }

      function mergePairKey(a, b) {
        return a.id < b.id ? `${a.id}:${b.id}` : `${b.id}:${a.id}`;
      }

      function mergePairCooling(actor, a, b) {
        if (!actor.mergeCancelUntil) return false;
        const until = actor.mergeCancelUntil.get(mergePairKey(a, b)) || 0;
        if (until > state.now) return true;
        if (until > 0) actor.mergeCancelUntil.delete(mergePairKey(a, b));
        return false;
      }

      function resetCancelledMergeAttempt(actor, a, b, distance) {
        const fallbackAngle = ((a.id * 12.9898 + b.id * 78.233) % TAU);
        const nx = distance < 0.001 ? Math.cos(fallbackAngle) : (b.x - a.x) / distance;
        const ny = distance < 0.001 ? Math.sin(fallbackAngle) : (b.y - a.y) / distance;
        const targetDistance = a.radius + b.radius + clamp((a.radius + b.radius) * 0.05, 12, 48);
        const overlap = Math.max(0, targetDistance - distance);
        const total = a.mass + b.mass;
        const aShare = b.mass / total;
        const bShare = a.mass / total;

        a.x -= nx * overlap * aShare;
        a.y -= ny * overlap * aShare;
        b.x += nx * overlap * bShare;
        b.y += ny * overlap * bShare;
        clampCellToWorld(a);
        clampCellToWorld(b);

        if (!actor.mergeCancelUntil) actor.mergeCancelUntil = new Map();
        actor.mergeCancelUntil.set(mergePairKey(a, b), state.now + state.settings.mergeCancelCooldown);
        clearMergeAttempt(actor, a, b);
      }

      function addMass(cell, amount) {
        cell.mass += amount;
        if (cell.mass > MAX_CELL_MASS) cell.capFramesLeft = MASS_CAP_SETTLE_FRAMES;
        refreshCell(cell);
      }

      function addConsumedMass(cell, amount) {
        const previousMass = cell.mass;
        addMass(cell, amount);
        const boostSpeed = Math.hypot(cell.boostX, cell.boostY);
        if (amount < MIN_CELL_MASS || (cell.splitBoostAge <= 0 && boostSpeed < 90)) return;

        if (cell.splitBoostAge > 0 || cell.splitHoldAge > 0 || boostSpeed > 160) {
          cell.splitBoostAge = Math.max(cell.splitBoostAge || 0, SPLIT_BOOST_DURATION * 0.45);
          return;
        }

        const massDamping = Math.sqrt(Math.max(MIN_CELL_MASS, previousMass) / Math.max(previousMass, cell.mass));
        const boostDamping = clamp(massDamping * SPLIT_CATCH_MOMENTUM_SCALE, 0.42, 0.92);
        cell.boostX *= boostDamping;
        cell.boostY *= boostDamping;
        const velocityDamping = clamp(boostDamping + 0.1, 0.58, 0.96);
        cell.vx *= velocityDamping;
        cell.vy *= velocityDamping;
      }

      function normalized(dx, dy, fallbackX = 1, fallbackY = 0) {
        const length = Math.hypot(dx, dy);
        if (length < 0.001) return { x: fallbackX, y: fallbackY, length: 0 };
        return { x: dx / length, y: dy / length, length };
      }

      function darkenHex(hex, amount = 0.18) {
        const key = `${hex}:${amount}`;
        if (darkenCache.has(key)) return darkenCache.get(key);
        const clean = hex.replace("#", "");
        const n = parseInt(clean.length === 3 ? clean.replace(/(.)/g, "$1$1") : clean, 16);
        const r = Math.max(0, Math.round(((n >> 16) & 255) * (1 - amount)));
        const g = Math.max(0, Math.round(((n >> 8) & 255) * (1 - amount)));
        const b = Math.max(0, Math.round((n & 255) * (1 - amount)));
        const color = `rgb(${r}, ${g}, ${b})`;
        darkenCache.set(key, color);
        return color;
      }

      function consumeThreshold(eater, victim) {
        if (victim.ownerId && victim.mass >= UNCONSUMABLE_CELL_MASS) return false;
        if (eater.mass + 0.001 < victim.mass * CONSUME_MASS_RATIO) return false;
        if (eater.radius + 0.001 < victim.radius * CONSUME_RADIUS_RATIO) return false;
        const threshold = eater.radius - victim.radius * 0.22;
        return threshold > 0 ? threshold : 0;
      }

      function consumeThresholdWithMass(eater, victim, eaterMass) {
        const eaterRadius = radiusFromMass(eaterMass);
        if (victim.ownerId && victim.mass >= UNCONSUMABLE_CELL_MASS) return false;
        if (eaterMass + 0.001 < victim.mass * CONSUME_MASS_RATIO) return false;
        if (eaterRadius + 0.001 < victim.radius * CONSUME_RADIUS_RATIO) return false;
        const threshold = eaterRadius - victim.radius * 0.22;
        return threshold > 0 ? threshold : 0;
      }

      function canConsume(eater, victim) {
        const threshold = consumeThreshold(eater, victim);
        if (!threshold) return false;
        const d2 = distSq(eater.x, eater.y, victim.x, victim.y);
        if (d2 <= threshold * threshold) return true;
        const overlapArea = circleOverlapArea(eater.radius, victim.radius, Math.sqrt(d2));
        return overlapArea >= Math.PI * victim.radius * victim.radius * 0.5;
      }

      function hasSweepPath(cell) {
        return Boolean(cell.sweepActive && cell.sweepPoints && cell.sweepPoints.length > 1);
      }

      function sweptPointDistSq(cell, x, y) {
        const points = cell.sweepPoints;
        if (!points || points.length < 2) return distSq(cell.x, cell.y, x, y);
        let best = Infinity;
        for (let i = 1; i < points.length; i += 1) {
          const a = points[i - 1];
          const b = points[i];
          best = Math.min(best, segmentPointDistSq(a.x, a.y, b.x, b.y, x, y));
        }
        return best;
      }

      function sweptSegmentDistSq(aCell, bCell) {
        const aPoints = aCell.sweepPoints;
        const bPoints = bCell.sweepPoints;
        if (!aPoints || !bPoints || aPoints.length < 2 || bPoints.length < 2) {
          return distSq(aCell.x, aCell.y, bCell.x, bCell.y);
        }
        let best = Infinity;
        for (let ai = 1; ai < aPoints.length; ai += 1) {
          const a0 = aPoints[ai - 1];
          const a1 = aPoints[ai];
          for (let bi = 1; bi < bPoints.length; bi += 1) {
            const b0 = bPoints[bi - 1];
            const b1 = bPoints[bi];
            best = Math.min(best, segmentSegmentDistSq(a0.x, a0.y, a1.x, a1.y, b0.x, b0.y, b1.x, b1.y));
          }
        }
        return best;
      }

      function canConsumeSwept(eater, victim) {
        const threshold = consumeThreshold(eater, victim);
        if (!threshold) return false;
        const thresholdSq = threshold * threshold;
        const d2 = distSq(eater.x, eater.y, victim.x, victim.y);
        if (d2 <= thresholdSq) return true;
        if (circleOverlapArea(eater.radius, victim.radius, Math.sqrt(d2)) >= Math.PI * victim.radius * victim.radius * 0.5) return true;

        const eaterSweeps = hasSweepPath(eater);
        const victimSweeps = hasSweepPath(victim);
        if (eaterSweeps && victimSweeps && sweptSegmentDistSq(eater, victim) <= thresholdSq) return true;
        if (eaterSweeps && sweptPointDistSq(eater, victim.x, victim.y) <= thresholdSq) return true;
        if (victimSweeps && sweptPointDistSq(victim, eater.x, eater.y) <= thresholdSq) return true;
        return false;
      }

      function canConsumeFeed(cell, feed) {
        if (feed.ownerId === cell.ownerId) return canConsumeSwept(cell, feed);
        const threshold = Math.max(0, cell.radius + feed.radius * 0.45);
        if (distSq(cell.x, cell.y, feed.x, feed.y) <= threshold * threshold) return true;
        if (hasSweepPath(cell) && sweptPointDistSq(cell, feed.x, feed.y) <= threshold * threshold) return true;
        return false;
      }

      function actorFamilyId(id) {
        const text = String(id || "");
        if (text === "local-clone-1") return state.localActorId || "player";
        return text.endsWith("-clone-1") ? text.slice(0, -8) : text;
      }

      function markCellConsumed(eater, victim) {
        victim.dead = true;
        victim.eatenFrame = state.frameIndex;
        victim.eatenAt = state.now;
        victim.eatenByOwnerId = eater.ownerId;
        victim.eatenByCellId = eater.id;
        addConsumedMass(eater, victim.mass);
      }

      function canBeCellVictimFor(eater, victim) {
        return Boolean(victim && !victim.dead);
      }

      function canFinalizeDeadCell(cell) {
        if (!cell.dead) return false;
        if (cell.eatenAt != null && state.now - cell.eatenAt <= EATEN_CELL_RESTORE_WINDOW) return false;
        return true;
      }
