// 描画、設定スライダー、入力イベント、メインループを扱います。
      function visibleWorldBounds(pad = 120) {
        const halfW = state.width * 0.5 / state.camera.zoom;
        const halfH = state.height * 0.5 / state.camera.zoom;
        return {
          left: state.camera.x - halfW - pad,
          right: state.camera.x + halfW + pad,
          top: state.camera.y - halfH - pad,
          bottom: state.camera.y + halfH + pad
        };
      }

      function renderDistanceForLocalMass(center) {
        if (state.spectating) return WORLD_SIZE;
        const mass = Math.max(1, center.mass || 1);
        const spread = Math.max(0, center.spread || 0);
        const scale = clamp((Number(state.settings.renderRange) || DEFAULT_RENDER_RANGE) / 100, 0.25, 2);
        return clamp((620 + Math.sqrt(mass) * 24 + spread * 0.48) * scale, 320, 2900);
      }

      function renderWorldBounds(visibleBounds) {
        if (state.spectating) return visibleBounds;
        const center = sharedLocalViewCenter(state.net.role === "client");
        const range = renderDistanceForLocalMass(center);
        return {
          left: Math.max(visibleBounds.left, center.x - range),
          right: Math.min(visibleBounds.right, center.x + range),
          top: Math.max(visibleBounds.top, center.y - range),
          bottom: Math.min(visibleBounds.bottom, center.y + range)
        };
      }

      function entityRenderX(entity) {
        return Number.isFinite(entity.renderX) ? entity.renderX : entity.x;
      }

      function entityRenderY(entity) {
        return Number.isFinite(entity.renderY) ? entity.renderY : entity.y;
      }

      function isVisible(item, bounds, pad = 0) {
        const x = entityRenderX(item);
        const y = entityRenderY(item);
        return x + item.radius + pad >= bounds.left &&
          x - item.radius - pad <= bounds.right &&
          y + item.radius + pad >= bounds.top &&
          y - item.radius - pad <= bounds.bottom;
      }

      function drawGrid(bounds, renderMode = 0) {
        ctx.lineWidth = 1 / state.camera.zoom;
        ctx.strokeStyle = "#e6ebf2";
        if (renderMode < 2) {
          ctx.beginPath();
          const startSmallX = Math.floor(bounds.left / GRID_SMALL) * GRID_SMALL;
          const endSmallX = Math.ceil(bounds.right / GRID_SMALL) * GRID_SMALL;
          const startSmallY = Math.floor(bounds.top / GRID_SMALL) * GRID_SMALL;
          const endSmallY = Math.ceil(bounds.bottom / GRID_SMALL) * GRID_SMALL;
          for (let x = startSmallX; x <= endSmallX; x += GRID_SMALL) {
            ctx.moveTo(x, bounds.top);
            ctx.lineTo(x, bounds.bottom);
          }
          for (let y = startSmallY; y <= endSmallY; y += GRID_SMALL) {
            ctx.moveTo(bounds.left, y);
            ctx.lineTo(bounds.right, y);
          }
          ctx.stroke();
        }

        ctx.lineWidth = 1.4 / state.camera.zoom;
        ctx.strokeStyle = "#cfd8e3";
        ctx.beginPath();
        const largeStep = renderMode >= 2 ? GRID_LARGE * 2 : GRID_LARGE;
        const startLargeX = Math.floor(bounds.left / largeStep) * largeStep;
        const endLargeX = Math.ceil(bounds.right / largeStep) * largeStep;
        const startLargeY = Math.floor(bounds.top / largeStep) * largeStep;
        const endLargeY = Math.ceil(bounds.bottom / largeStep) * largeStep;
        for (let x = startLargeX; x <= endLargeX; x += largeStep) {
          ctx.moveTo(x, bounds.top);
          ctx.lineTo(x, bounds.bottom);
        }
        for (let y = startLargeY; y <= endLargeY; y += largeStep) {
          ctx.moveTo(bounds.left, y);
          ctx.lineTo(bounds.right, y);
        }
        ctx.stroke();
      }

      function drawCircleEntity(entity) {
        ctx.beginPath();
        ctx.arc(entityRenderX(entity), entityRenderY(entity), entity.radius, 0, TAU);
        ctx.fillStyle = entity.color;
        ctx.fill();
      }

      function appendPelletPath(entity) {
        const x = entityRenderX(entity);
        const y = entityRenderY(entity);
        const r = 8.5;
        const sides = 9;
        const phase = ((entity.id || 0) % sides) * TAU / sides;
        for (let i = 0; i < sides; i += 1) {
          const angle = phase + i * TAU / sides;
          const px = x + Math.cos(angle) * r;
          const py = y + Math.sin(angle) * r;
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
      }

      function drawPelletEntity(entity) {
        ctx.beginPath();
        appendPelletPath(entity);
        ctx.fillStyle = entity.color;
        ctx.fill();
      }

      function appendFeedPath(entity) {
        const x = entityRenderX(entity);
        const y = entityRenderY(entity);
        const r = Math.max(7.5, entity.radius * 0.72);
        const sides = 10;
        const phase = ((entity.id || 0) % sides) * TAU / sides;
        for (let i = 0; i < sides; i += 1) {
          const angle = phase + i * TAU / sides;
          const px = x + Math.cos(angle) * r;
          const py = y + Math.sin(angle) * r;
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
      }

      function drawFeedEntity(entity) {
        ctx.beginPath();
        appendFeedPath(entity);
        ctx.fillStyle = entity.color;
        ctx.fill();
        ctx.lineWidth = 2 / state.camera.zoom;
        ctx.strokeStyle = darkenHex(entity.color, 0.24);
        ctx.stroke();
      }

      function drawBatchedEntities(entities, appendPath, stroke = false) {
        for (const items of entityBatchByColor.values()) items.length = 0;
        for (const entity of entities) {
          let items = entityBatchByColor.get(entity.color);
          if (!items) {
            items = [];
            entityBatchByColor.set(entity.color, items);
          }
          items.push(entity);
        }
        for (const [color, items] of entityBatchByColor) {
          if (!items.length) continue;
          ctx.fillStyle = color;
          ctx.beginPath();
          for (const entity of items) {
            appendPath(entity);
          }
          ctx.fill();
          if (stroke) {
            ctx.lineWidth = 2 / state.camera.zoom;
            ctx.strokeStyle = darkenHex(color, 0.24);
            ctx.stroke();
          }
        }
      }

      function virusSpikePoints(spikes) {
        let points = virusSpikePointCache.get(spikes);
        if (points) return points;
        points = [];
        for (let i = 0; i < spikes; i += 1) {
          const angle = (i / spikes) * TAU;
          const scale = i % 2 === 0 ? 1.12 : 0.965;
          points.push({
            x: Math.cos(angle) * scale,
            y: Math.sin(angle) * scale
          });
        }
        virusSpikePointCache.set(spikes, points);
        return points;
      }

      function drawVirus(virus, renderMode = 0) {
        const spikes = 56;
        const centerX = entityRenderX(virus);
        const centerY = entityRenderY(virus);
        const points = virusSpikePoints(spikes);
        ctx.beginPath();
        for (let i = 0; i < points.length; i += 1) {
          const point = points[i];
          const x = centerX + point.x * virus.radius;
          const y = centerY + point.y * virus.radius;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.fillStyle = "#00f40b";
        ctx.fill();
        ctx.lineWidth = 2 / state.camera.zoom;
        ctx.strokeStyle = "#00c60a";
        ctx.stroke();
      }

      function drawCell(cell, renderMode = 0) {
        const actor = cell.actor;
        const localControlled = actor.control === "local";
        let progress = 1;
        if (cell.birthDuration > 0 && cell.birthAge < cell.birthDuration) {
          progress = clamp(cell.birthAge / cell.birthDuration, 0, 1);
          progress = 1 - Math.pow(1 - progress, 3);
        }
        const scale = cell.birthScale + (1 - cell.birthScale) * progress;
        const cellX = entityRenderX(cell);
        const cellY = entityRenderY(cell);
        const drawX = cell.birthX + (cellX - cell.birthX) * progress;
        const drawY = cell.birthY + (cellY - cell.birthY) * progress;
        const visualRadius = Number.isFinite(cell.renderRadius) ? cell.renderRadius : cell.radius;
        const r = Math.max(1, visualRadius * scale);
        const color = actorRenderColor(actor);
        ctx.beginPath();
        ctx.arc(drawX, drawY, r, 0, TAU);
        ctx.fillStyle = color;
        ctx.fill();
        if (renderMode < 2 || localControlled || r * state.camera.zoom > 28) {
          ctx.lineWidth = Math.max(3 / state.camera.zoom, isActiveLocalActor(actor) ? r * 0.075 : r * 0.045);
          ctx.strokeStyle = isActiveLocalActor(actor) ? ACTIVE_CONTROL_STROKE : (isLocalActor(actor) ? "#07529e" : darkenHex(color, 0.24));
          ctx.stroke();
        }

        if (scale > 0.72 && r * state.camera.zoom > 14 && (renderMode === 0 || localControlled)) {
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          const nameSize = clamp(r * 0.34, 13, 42);
          ctx.font = `700 ${nameSize}px Inter, ui-sans-serif, system-ui, sans-serif`;
          ctx.lineWidth = Math.max(2, nameSize * 0.16);
          ctx.strokeStyle = "rgba(8, 18, 32, 0.42)";
          ctx.fillStyle = "rgba(255, 255, 255, 0.96)";
          const label = displayActorName(actor);
          ctx.strokeText(label, drawX, drawY - nameSize * 0.12);
          ctx.fillText(label, drawX, drawY - nameSize * 0.12);

          const showMass = isLocalViewActor(actor) ? state.settings.showOwnMass : state.settings.showOtherMass;
          if (r * state.camera.zoom > 32 && showMass) {
            const massSize = clamp(r * 0.2, 10, 25);
            ctx.font = `700 ${massSize}px Inter, ui-sans-serif, system-ui, sans-serif`;
            ctx.lineWidth = Math.max(2, massSize * 0.14);
            ctx.strokeText(String(Math.round(cell.mass)), drawX, drawY + nameSize * 0.62);
            ctx.fillText(String(Math.round(cell.mass)), drawX, drawY + nameSize * 0.62);
          }
        }
      }

      function appendCellCirclePath(cell) {
        let progress = 1;
        if (cell.birthDuration > 0 && cell.birthAge < cell.birthDuration) {
          progress = clamp(cell.birthAge / cell.birthDuration, 0, 1);
          progress = 1 - Math.pow(1 - progress, 3);
        }
        const scale = cell.birthScale + (1 - cell.birthScale) * progress;
        const cellX = entityRenderX(cell);
        const cellY = entityRenderY(cell);
        const drawX = cell.birthX + (cellX - cell.birthX) * progress;
        const drawY = cell.birthY + (cellY - cell.birthY) * progress;
        const visualRadius = Number.isFinite(cell.renderRadius) ? cell.renderRadius : cell.radius;
        const r = Math.max(1, visualRadius * scale);
        ctx.moveTo(drawX + r, drawY);
        ctx.arc(drawX, drawY, r, 0, TAU);
      }

      function drawBatchedCells(renderMode = 1) {
        for (const cells of cellBatchByColor.values()) cells.length = 0;
        for (const cell of renderCellsScratch) {
          if (isLocalViewActor(cell.actor)) {
            detailCellsScratch.push(cell);
            continue;
          }
          let cells = cellBatchByColor.get(cell.actor.color);
          if (!cells) {
            cells = [];
            cellBatchByColor.set(cell.actor.color, cells);
          }
          cells.push(cell);
        }

        for (const [color, cells] of cellBatchByColor) {
          if (!cells.length) continue;
          ctx.beginPath();
          for (const cell of cells) appendCellCirclePath(cell);
          ctx.fillStyle = color;
          ctx.fill();
        }

        detailCellsScratch.sort((a, b) => a.radius - b.radius);
        for (const cell of detailCellsScratch) drawCell(cell, renderMode);
      }

      function drawCursorLine() {
        if (!state.settings.cursorLine || state.spectating) return;
        const sourceCells = [];
        const actor = state.player && state.player.control === "local" ? state.player : null;
        if (!actor) return;
        for (const cell of actor.cells) {
          if (!cell.dead) sourceCells.push(cell);
        }
        if (!sourceCells.length) return;
        const cursorWorld = screenToWorld(state.input.mouseX, state.input.mouseY);
        const endX = cursorWorld.x;
        const endY = cursorWorld.y;

        ctx.save();
        ctx.lineWidth = Math.max(2 / state.camera.zoom, 1.2);
        ctx.strokeStyle = "rgba(23, 125, 220, 0.36)";
        ctx.setLineDash([18 / state.camera.zoom, 12 / state.camera.zoom]);
        ctx.beginPath();
        for (const cell of sourceCells) {
          ctx.moveTo(entityRenderX(cell), entityRenderY(cell));
          ctx.lineTo(endX, endY);
        }
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = "rgba(23, 125, 220, 0.72)";
        ctx.beginPath();
        ctx.arc(endX, endY, Math.max(5 / state.camera.zoom, 3), 0, TAU);
        ctx.fill();
        ctx.restore();
      }

      function renderModeForVisibleCells(count, boostedCount = 0) {
        return 0;
      }

      function queryRenderableCells(bounds) {
        renderCellsScratch.length = 0;
        const queryPad = 220;
        const candidates = state.net.role === "client"
          ? allCells(renderCellQueryScratch)
          : cellGrid.queryRect(
            bounds.left - queryPad,
            bounds.top - queryPad,
            bounds.right + queryPad,
            bounds.bottom + queryPad,
            renderCellQueryScratch
          );
        let boostedVisibleCells = 0;
        for (const cell of candidates) {
          if (!isVisible(cell, bounds, 80)) continue;
          renderCellsScratch.push(cell);
          if (!isLocalViewActor(cell.actor) && cell.splitBoostAge > 0) boostedVisibleCells += 1;
        }
        return boostedVisibleCells;
      }

      function queryRenderableFeeds(bounds) {
        if (state.net.role === "client") return state.feeds;
        return feedGrid.queryRect(bounds.left - 20, bounds.top - 20, bounds.right + 20, bounds.bottom + 20, renderEntityQueryScratch);
      }

      function queryRenderableViruses(bounds) {
        if (state.net.role === "client") return state.viruses;
        return virusGrid.queryRect(bounds.left - 90, bounds.top - 90, bounds.right + 90, bounds.bottom + 90, renderEntityQueryScratch);
      }

      function drawSizedWorldEntities(bounds, renderMode) {
        renderSizedEntitiesScratch.length = 0;
        for (const virus of queryRenderableViruses(bounds)) {
          if (virus.dead || !isVisible(virus, bounds, 90)) continue;
          renderSizedEntitiesScratch.push({ type: "virus", radius: virus.radius, entity: virus });
        }
        for (const cell of renderCellsScratch) {
          renderSizedEntitiesScratch.push({ type: "cell", radius: cell.radius, entity: cell });
        }
        renderSizedEntitiesScratch.sort((a, b) => a.radius - b.radius);
        for (const item of renderSizedEntitiesScratch) {
          if (item.type === "virus") drawVirus(item.entity, renderMode);
          else drawCell(item.entity, renderMode);
        }
      }

      function draw() {
        ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
        ctx.fillStyle = "#f7f9fc";
        ctx.fillRect(0, 0, state.width, state.height);

        ctx.save();
        ctx.translate(state.width * 0.5, state.height * 0.5);
        ctx.scale(state.camera.zoom, state.camera.zoom);
        ctx.translate(-state.camera.x, -state.camera.y);

        const viewBounds = visibleWorldBounds();
        const bounds = renderWorldBounds(viewBounds);
        detailCellsScratch.length = 0;
        foodRenderScratch.length = 0;
        feedRenderScratch.length = 0;
        const boostedVisibleCells = queryRenderableCells(bounds);
        const renderMode = renderModeForVisibleCells(renderCellsScratch.length, boostedVisibleCells);
        state.lastRenderMode = renderMode;
        drawGrid(viewBounds, renderMode);

        if (renderMode < 2) {
          ctx.lineWidth = 3 / state.camera.zoom;
          ctx.strokeStyle = "rgba(128, 139, 154, 0.55)";
          ctx.strokeRect(0, 0, WORLD_SIZE, WORLD_SIZE);
        }

        const visibleFoods = foodGrid.queryRect(bounds.left - 20, bounds.top - 20, bounds.right + 20, bounds.bottom + 20, aiEntityScratch);
        for (const food of visibleFoods) {
          if (food.dead) continue;
          if (!isVisible(food, bounds, 20)) continue;
          if (renderMode > 0) foodRenderScratch.push(food);
          else drawPelletEntity(food);
        }
        if (foodRenderScratch.length) drawBatchedEntities(foodRenderScratch, appendPelletPath);

        for (const feed of queryRenderableFeeds(bounds)) {
          if (!isVisible(feed, bounds, 20)) continue;
          if (renderMode > 0) {
            feedRenderScratch.push(feed);
            continue;
          }
          drawFeedEntity(feed);
        }
        if (feedRenderScratch.length) drawBatchedEntities(feedRenderScratch, appendFeedPath, true);

        drawSizedWorldEntities(bounds, renderMode);
        drawCursorLine();

        ctx.restore();
      }

      function resize() {
        state.dpr = Math.min(window.devicePixelRatio || 1, 2);
        state.width = Math.max(320, window.innerWidth);
        state.height = Math.max(240, window.innerHeight);
        canvas.width = Math.floor(state.width * state.dpr);
        canvas.height = Math.floor(state.height * state.dpr);
        canvas.style.width = `${state.width}px`;
        canvas.style.height = `${state.height}px`;
        state.input.mouseX = state.width * 0.5;
        state.input.mouseY = state.height * 0.5;
      }

      function onPointerMove(event) {
        if (state.menuOpen) return;
        state.input.mouseX = event.clientX;
        state.input.mouseY = event.clientY;
        syncPointerTarget();
      }

      function onTouch(event) {
        if (state.menuOpen) return;
        if (!event.touches.length) return;
        const touch = event.touches[0];
        state.input.mouseX = touch.clientX;
        state.input.mouseY = touch.clientY;
        syncPointerTarget();
        event.preventDefault();
      }

      function setViewScalePercent(value) {
        const percent = clamp(Number(value) || 100, 55, 220);
        state.viewScale = percent / 100;
        viewValueEl.textContent = `${Math.round(percent)}%`;
        saveLocalPreferences();
      }

      function onWheel(event) {
        if (state.menuOpen) return;
        event.preventDefault();
        const direction = event.deltaY > 0 ? 1 : -1;
        setViewScalePercent(state.viewScale * 100 + direction * 6);
      }

      function formatMultiplier(value) {
        return `${Number(value).toFixed(1).replace(/\.0$/, "")}x`;
      }

      const sliderControls = {
        // 新しいスライダーを追加する時は、HTMLのinput群、state.settings、ここを同じキー名でそろえる。
        bot: { slider: botSlider, minBox: botMinBox, maxBox: botMaxBox, valueEl: botValueEl, setting: "botTarget", absoluteMin: 0 },
        botSpawnMass: { slider: botSpawnMassSlider, minBox: botSpawnMassMinBox, maxBox: botSpawnMassMaxBox, valueEl: botSpawnMassValueEl, setting: "botSpawnMass", absoluteMin: MIN_CELL_MASS },
        botEjectRate: { slider: botEjectRateSlider, minBox: botEjectRateMinBox, maxBox: botEjectRateMaxBox, valueEl: botEjectRateValueEl, setting: "botEjectRate", absoluteMin: 1 },
        virus: { slider: virusSlider, minBox: virusMinBox, maxBox: virusMaxBox, valueEl: virusValueEl, setting: "virusTarget", absoluteMin: 0 },
        food: { slider: foodSlider, minBox: foodMinBox, maxBox: foodMaxBox, valueEl: foodValueEl, setting: "foodTarget", absoluteMin: 0 },
        spawnMass: { slider: spawnMassSlider, minBox: spawnMassMinBox, maxBox: spawnMassMaxBox, valueEl: spawnMassValueEl, setting: "spawnMass", absoluteMin: 132 },
        ejectMass: { slider: ejectMassSlider, minBox: ejectMassMinBox, maxBox: ejectMassMaxBox, valueEl: ejectMassValueEl, setting: "ejectMass", absoluteMin: 5 },
        ejectSpeed: { slider: ejectSpeedSlider, minBox: ejectSpeedMinBox, maxBox: ejectSpeedMaxBox, valueEl: ejectSpeedValueEl, setting: "ejectSpeed", absoluteMin: 300 },
        ejectRate: { slider: ejectRateSlider, minBox: ejectRateMinBox, maxBox: ejectRateMaxBox, valueEl: ejectRateValueEl, setting: "ejectRate", absoluteMin: 1 },
        splitRecoil: { slider: splitRecoilSlider, minBox: splitRecoilMinBox, maxBox: splitRecoilMaxBox, valueEl: splitRecoilValueEl, setting: "splitRecoil", absoluteMin: 0 },
        splitSpeed: { slider: splitSpeedSlider, minBox: splitSpeedMinBox, maxBox: splitSpeedMaxBox, valueEl: splitSpeedValueEl, setting: "splitSpeed", absoluteMin: 10 },
        splitDecayTime: { slider: splitDecayTimeSlider, minBox: splitDecayTimeMinBox, maxBox: splitDecayTimeMaxBox, valueEl: splitDecayTimeValueEl, setting: "splitDecayTime", absoluteMin: 0.1, format: (value) => `${Number(value).toFixed(1)}秒` },
        splitInputSpeed: { slider: splitInputSpeedSlider, minBox: splitInputSpeedMinBox, maxBox: splitInputSpeedMaxBox, valueEl: splitInputSpeedValueEl, setting: "splitInputSpeed", absoluteMin: 0, format: (value) => `${Math.round(Number(value))}ms` },
        gameSpeed: { slider: gameSpeedSlider, minBox: gameSpeedMinBox, maxBox: gameSpeedMaxBox, valueEl: gameSpeedValueEl, setting: "gameSpeed", absoluteMin: 0.1, format: formatMultiplier },
        renderRange: { slider: renderRangeSlider, minBox: renderRangeMinBox, maxBox: renderRangeMaxBox, valueEl: renderRangeValueEl, setting: "renderRange", absoluteMin: 35, format: (value) => `${value}%` },
        mergeCooldown: { slider: mergeCooldownSlider, minBox: mergeCooldownMinBox, maxBox: mergeCooldownMaxBox, valueEl: mergeCooldownValueEl, setting: "mergeCooldown", absoluteMin: 0 },
        mergeCancelCooldown: { slider: mergeCancelCooldownSlider, minBox: mergeCancelCooldownMinBox, maxBox: mergeCancelCooldownMaxBox, valueEl: mergeCancelCooldownValueEl, setting: "mergeCancelCooldown", absoluteMin: 0, format: (value) => `${Number(value).toFixed(1)}秒` },
        worldSize: { slider: worldSizeSlider, minBox: worldSizeMinBox, maxBox: worldSizeMaxBox, valueEl: worldSizeValueEl, setting: "worldSize", absoluteMin: 2000 }
      };

      function roundSliderValue(kind, value) {
        const raw = Number(value);
        if (!Number.isFinite(raw)) return sliderControls[kind]?.absoluteMin ?? 0;
        if (kind === "food") return Math.round(raw / 100) * 100;
        if (kind === "ejectSpeed") return Math.round(raw / 10) * 10;
        if (kind === "splitInputSpeed") return Math.round(raw / 10) * 10;
        if (kind === "splitSpeed" || kind === "renderRange") return Math.round(raw / 5) * 5;
        if (kind === "splitDecayTime" || kind === "mergeCancelCooldown") return Math.round(raw * 10) / 10;
        if (kind === "gameSpeed") return Math.round(raw * 10) / 10;
        if (kind === "worldSize") return Math.round(raw / 100) * 100;
        return Math.round(raw);
      }

      function setSliderBound(kind, side, value, shouldSync = true) {
        const config = sliderControls[kind];
        if (!config) return;
        const absoluteMin = config.absoluteMin;
        let next = Math.max(absoluteMin, roundSliderValue(kind, value));
        if (side === "min") {
          state.settings.min[kind] = next;
          if (state.settings.max[kind] < next) state.settings.max[kind] = next;
        } else {
          state.settings.max[kind] = Math.max(state.settings.min[kind], next);
        }
        const settingKey = config.setting;
        state.settings[settingKey] = clamp(roundSliderValue(kind, state.settings[settingKey]), state.settings.min[kind], state.settings.max[kind]);
        if (kind === "worldSize") clampWorldEntities();
        if (!shouldSync) return;
        syncSettingsControls();
        trimDynamicEntities();
        saveLocalPreferences();
      }

      function syncSettingsControls() {
        cursorLineToggle.checked = state.settings.cursorLine;
        cursorLineValueEl.textContent = state.settings.cursorLine ? "表示" : "非表示";
        nRespawnToggle.checked = state.settings.nRespawnEnabled;
        nRespawnValueEl.textContent = state.settings.nRespawnEnabled ? "許可" : "禁止";
        activeColorToggle.checked = state.settings.activeColorHighlight;
        activeColorValueEl.textContent = state.settings.activeColorHighlight ? "表示" : "通常";
        otherMassToggle.checked = state.settings.showOtherMass;
        otherMassValueEl.textContent = state.settings.showOtherMass ? "表示" : "非表示";
        ownMassToggle.checked = state.settings.showOwnMass;
        ownMassValueEl.textContent = state.settings.showOwnMass ? "表示" : "非表示";
        botEnabledToggle.checked = state.settings.botEnabled;
        botEnabledValueEl.textContent = state.settings.botEnabled ? "ON" : "OFF";
        botSlider.disabled = !state.settings.botEnabled;
        botSpawnMassSlider.disabled = !state.settings.botEnabled;
        botEjectRateSlider.disabled = !state.settings.botEnabled;
        botModeSelect.disabled = !state.settings.botEnabled;
        for (const [kind, config] of Object.entries(sliderControls)) {
          const value = state.settings[config.setting];
          config.slider.min = String(state.settings.min[kind]);
          config.slider.max = String(state.settings.max[kind]);
          config.slider.value = String(value);
          config.valueEl.textContent = config.format ? config.format(value) : String(value);
          config.minBox.max = String(state.settings.max[kind]);
          config.minBox.value = String(state.settings.min[kind]);
          config.maxBox.min = String(state.settings.min[kind]);
          config.maxBox.value = String(state.settings.max[kind]);
        }
        botModeSelect.value = state.settings.botMode;
      }

      function trimDynamicEntities() {
        if (state.foods.length > state.settings.foodTarget) {
          state.foods.length = state.settings.foodTarget;
          state.foodGridDirty = true;
        }
        trimNaturalViruses(state.settings.virusTarget);
        const maxQueue = Math.max(0, state.settings.virusTarget - liveVirusCount());
        if (state.virusRespawnQueue.length > maxQueue) state.virusRespawnQueue.length = maxQueue;
        ensureBotPopulation();
      }

      function clampWorldEntities() {
        const size = state.settings.worldSize;
        WORLD_SIZE = size;
        state.camera.x = clamp(state.camera.x, 0, size);
        state.camera.y = clamp(state.camera.y, 0, size);
        state.input.mouseWorldX = clamp(state.input.mouseWorldX, 0, size);
        state.input.mouseWorldY = clamp(state.input.mouseWorldY, 0, size);
        for (const food of state.foods) {
          food.x = clamp(food.x, food.radius, size - food.radius);
          food.y = clamp(food.y, food.radius, size - food.radius);
        }
        for (const feed of state.feeds) {
          feed.x = clamp(feed.x, feed.radius, size - feed.radius);
          feed.y = clamp(feed.y, feed.radius, size - feed.radius);
        }
        for (const virus of state.viruses) {
          virus.x = clamp(virus.x, virus.radius, size - virus.radius);
          virus.y = clamp(virus.y, virus.radius, size - virus.radius);
        }
        for (const actor of state.actors) {
          for (const cell of actor.cells) {
            clampCellToWorld(cell, size);
          }
          actor.input.targetX = clamp(actor.input.targetX, 0, size);
          actor.input.targetY = clamp(actor.input.targetY, 0, size);
          actor.wanderX = clamp(actor.wanderX, 300, size - 300);
          actor.wanderY = clamp(actor.wanderY, 300, size - 300);
        }
        state.foodGridDirty = true;
      }

      function setWorldSetting(kind, value) {
        if (kind === "botMode") state.settings.botMode = ["hunt", "chase", "virus", "cursor", "eject"].includes(value) ? value : "hunt";
        if (kind === "cursorLine") state.settings.cursorLine = Boolean(value);
        if (kind === "nRespawn") state.settings.nRespawnEnabled = Boolean(value);
        if (kind === "activeColor") state.settings.activeColorHighlight = Boolean(value);
        if (kind === "showOtherMass") state.settings.showOtherMass = Boolean(value);
        if (kind === "showOwnMass") state.settings.showOwnMass = Boolean(value);
        if (kind === "botEnabled") state.settings.botEnabled = Boolean(value);
        if (sliderControls[kind]) {
          const config = sliderControls[kind];
          state.settings[config.setting] = clamp(roundSliderValue(kind, value), state.settings.min[kind], state.settings.max[kind]);
        }
        if (kind === "worldSize") {
          clampWorldEntities();
        }
        syncSettingsControls();
        trimDynamicEntities();
        saveLocalPreferences();
      }

      function setSliderMax(kind, value) {
        setSliderBound(kind, "max", value);
      }

      function setSliderMin(kind, value) {
        setSliderBound(kind, "min", value);
      }

      function resetGameToStart() {
        if (state.net.role === "offline") {
          resetFreshWorld("player", false);
          return;
        }

        if (state.net.role === "host") {
          const transport = state.net.transport;
          resetFreshWorld("host", true);
          state.net.role = "host";
          state.net.transport = transport;
          state.net.connected = Boolean(state.net.channel?.readyState === "open" || state.net.socket?.readyState === WebSocket.OPEN);
          state.net.lastSnapshotSend = -100;
          state.net.lastFeedSnapshotSend = -100;
          state.net.lastBotSnapshotSend = -100;
          state.net.lastWorldSend = -100;
          sendAuthoritativeSnapshot(state.realNow || performance.now() / 1000, true);
          return;
        }

        setStatus("HOST RESET");
      }

      function respawnLocalPlayer() {
        if (!state.player) return;
        if (!state.settings.nRespawnEnabled) return;
        if (localPlayerIsDead()) {
          state.waitingForPlay = true;
          setMenuOpen(true);
          return;
        }
        if (state.net.role === "client") {
          state.input.respawnQueued = true;
          state.input.respawnSeq += 1;
          return;
        }
        spawnActor(state.player, playerSpawnMass());
        state.flashUntil = state.now + 1.0;
        state.net.lastSnapshotSend = -100;
        rebuildSpatialHashes();
      }

      function bindInput() {
        window.addEventListener("resize", resize);
        window.addEventListener("pointermove", onPointerMove);
        window.addEventListener("touchstart", onTouch, { passive: false });
        window.addEventListener("touchmove", onTouch, { passive: false });
        window.addEventListener("wheel", onWheel, { passive: false });
        window.addEventListener("keydown", (event) => {
          if (state.keyCaptureAction) {
            event.preventDefault();
            captureKeyBinding(event.code);
            return;
          }
          if (state.menuOpen) {
            if (event.code === "Escape") {
              event.preventDefault();
              setMenuOpen(false);
            }
            return;
          }
          if (event.code === "Escape") {
            event.preventDefault();
            setMenuOpen(true);
            return;
          }
          if (state.spectating && event.code === "KeyQ") {
            event.preventDefault();
            if (!event.repeat) toggleSpectatorCameraMode();
            return;
          }
          if (isTextEditingTarget(event.target)) return;
          const action = actionForKey(event.code);
          if (!action) return;
          event.preventDefault();
          state.input.keys.add(event.code);
          if (event.repeat) return;
          if (action === "split1") queuePlayerSplits(1);
          if (action === "split2") queuePlayerSplits(2);
          if (action === "split3") queuePlayerSplits(3);
          if (action === "split4") queuePlayerSplits(4);
          if (action === "eject") {
            state.input.ejectQueued = true;
            state.input.ejectSeq += 1;
          }
          if (action === "botSplit") state.input.botSplitQueued = true;
          if (action === "botEject") state.input.botEjectQueued = true;
          if (action === "respawn") respawnLocalPlayer();
          if (action === "clone") toggleLocalCloneControl();
        });
        window.addEventListener("keyup", (event) => {
          const action = actionForKey(event.code);
          if (action || state.input.keys.has(event.code)) {
            event.preventDefault();
            state.input.keys.delete(event.code);
          }
        });
        window.addEventListener("blur", () => {
          state.input.keys.clear();
          state.input.splitQueued = false;
          state.input.splitCount = 0;
          state.input.splitBurstCount = 0;
          state.input.ejectQueued = false;
          state.input.respawnQueued = false;
          state.input.botSplitQueued = false;
          state.input.botEjectQueued = false;
        });
        menuBtn.addEventListener("click", () => setMenuOpen(true));
        playBtn.addEventListener("click", () => {
          playLocalPlayer();
        });
        for (const button of menuTabButtons) {
          button.addEventListener("click", () => setMenuPage(button.dataset.menuPage));
        }
        nameBox.addEventListener("input", applyLocalProfile);
        cloneNameBox.addEventListener("input", applyLocalProfile);
        for (const button of keyBindButtons) {
          button.addEventListener("click", () => beginKeyCapture(button.dataset.keybind));
        }
        hostBtn.addEventListener("click", joinOrHostRoom);
        if (joinBtn) joinBtn.addEventListener("click", () => {
          joinRoom();
        });
        if (applyAnswerBtn) applyAnswerBtn.addEventListener("click", () => {
          applyHostAnswer().catch(() => setStatus("ANSWER NG"));
        });
        if (relayHostBtn) relayHostBtn.addEventListener("click", () => startRelayOnline("host"));
        if (relayJoinBtn) relayJoinBtn.addEventListener("click", () => startRelayOnline("client"));
        spectateBtn.addEventListener("click", toggleSpectating);
        disconnectBtn.addEventListener("click", () => closeNetwork(false));
        gameResetBtn.addEventListener("click", resetGameToStart);
        cursorLineToggle.addEventListener("change", () => setWorldSetting("cursorLine", cursorLineToggle.checked));
        nRespawnToggle.addEventListener("change", () => setWorldSetting("nRespawn", nRespawnToggle.checked));
        activeColorToggle.addEventListener("change", () => setWorldSetting("activeColor", activeColorToggle.checked));
        otherMassToggle.addEventListener("change", () => setWorldSetting("showOtherMass", otherMassToggle.checked));
        ownMassToggle.addEventListener("change", () => setWorldSetting("showOwnMass", ownMassToggle.checked));
        botEnabledToggle.addEventListener("change", () => setWorldSetting("botEnabled", botEnabledToggle.checked));
        botSlider.addEventListener("input", () => setWorldSetting("bot", botSlider.value));
        botSpawnMassSlider.addEventListener("input", () => setWorldSetting("botSpawnMass", botSpawnMassSlider.value));
        botEjectRateSlider.addEventListener("input", () => setWorldSetting("botEjectRate", botEjectRateSlider.value));
        botModeSelect.addEventListener("change", () => setWorldSetting("botMode", botModeSelect.value));
        virusSlider.addEventListener("input", () => setWorldSetting("virus", virusSlider.value));
        foodSlider.addEventListener("input", () => setWorldSetting("food", foodSlider.value));
        spawnMassSlider.addEventListener("input", () => setWorldSetting("spawnMass", spawnMassSlider.value));
        ejectMassSlider.addEventListener("input", () => setWorldSetting("ejectMass", ejectMassSlider.value));
        ejectSpeedSlider.addEventListener("input", () => setWorldSetting("ejectSpeed", ejectSpeedSlider.value));
        ejectRateSlider.addEventListener("input", () => setWorldSetting("ejectRate", ejectRateSlider.value));
        splitRecoilSlider.addEventListener("input", () => setWorldSetting("splitRecoil", splitRecoilSlider.value));
        splitSpeedSlider.addEventListener("input", () => setWorldSetting("splitSpeed", splitSpeedSlider.value));
        splitDecayTimeSlider.addEventListener("input", () => setWorldSetting("splitDecayTime", splitDecayTimeSlider.value));
        splitInputSpeedSlider.addEventListener("input", () => setWorldSetting("splitInputSpeed", splitInputSpeedSlider.value));
        gameSpeedSlider.addEventListener("input", () => setWorldSetting("gameSpeed", gameSpeedSlider.value));
        renderRangeSlider.addEventListener("input", () => setWorldSetting("renderRange", renderRangeSlider.value));
        mergeCooldownSlider.addEventListener("input", () => setWorldSetting("mergeCooldown", mergeCooldownSlider.value));
        mergeCancelCooldownSlider.addEventListener("input", () => setWorldSetting("mergeCancelCooldown", mergeCancelCooldownSlider.value));
        worldSizeSlider.addEventListener("input", () => setWorldSetting("worldSize", worldSizeSlider.value));
        botMinBox.addEventListener("change", () => setSliderMin("bot", botMinBox.value));
        botSpawnMassMinBox.addEventListener("change", () => setSliderMin("botSpawnMass", botSpawnMassMinBox.value));
        botEjectRateMinBox.addEventListener("change", () => setSliderMin("botEjectRate", botEjectRateMinBox.value));
        virusMinBox.addEventListener("change", () => setSliderMin("virus", virusMinBox.value));
        foodMinBox.addEventListener("change", () => setSliderMin("food", foodMinBox.value));
        spawnMassMinBox.addEventListener("change", () => setSliderMin("spawnMass", spawnMassMinBox.value));
        ejectMassMinBox.addEventListener("change", () => setSliderMin("ejectMass", ejectMassMinBox.value));
        ejectSpeedMinBox.addEventListener("change", () => setSliderMin("ejectSpeed", ejectSpeedMinBox.value));
        ejectRateMinBox.addEventListener("change", () => setSliderMin("ejectRate", ejectRateMinBox.value));
        splitRecoilMinBox.addEventListener("change", () => setSliderMin("splitRecoil", splitRecoilMinBox.value));
        splitSpeedMinBox.addEventListener("change", () => setSliderMin("splitSpeed", splitSpeedMinBox.value));
        splitDecayTimeMinBox.addEventListener("change", () => setSliderMin("splitDecayTime", splitDecayTimeMinBox.value));
        splitInputSpeedMinBox.addEventListener("change", () => setSliderMin("splitInputSpeed", splitInputSpeedMinBox.value));
        gameSpeedMinBox.addEventListener("change", () => setSliderMin("gameSpeed", gameSpeedMinBox.value));
        renderRangeMinBox.addEventListener("change", () => setSliderMin("renderRange", renderRangeMinBox.value));
        mergeCooldownMinBox.addEventListener("change", () => setSliderMin("mergeCooldown", mergeCooldownMinBox.value));
        mergeCancelCooldownMinBox.addEventListener("change", () => setSliderMin("mergeCancelCooldown", mergeCancelCooldownMinBox.value));
        worldSizeMinBox.addEventListener("change", () => setSliderMin("worldSize", worldSizeMinBox.value));
        botMaxBox.addEventListener("change", () => setSliderMax("bot", botMaxBox.value));
        botSpawnMassMaxBox.addEventListener("change", () => setSliderMax("botSpawnMass", botSpawnMassMaxBox.value));
        botEjectRateMaxBox.addEventListener("change", () => setSliderMax("botEjectRate", botEjectRateMaxBox.value));
        virusMaxBox.addEventListener("change", () => setSliderMax("virus", virusMaxBox.value));
        foodMaxBox.addEventListener("change", () => setSliderMax("food", foodMaxBox.value));
        spawnMassMaxBox.addEventListener("change", () => setSliderMax("spawnMass", spawnMassMaxBox.value));
        ejectMassMaxBox.addEventListener("change", () => setSliderMax("ejectMass", ejectMassMaxBox.value));
        ejectSpeedMaxBox.addEventListener("change", () => setSliderMax("ejectSpeed", ejectSpeedMaxBox.value));
        ejectRateMaxBox.addEventListener("change", () => setSliderMax("ejectRate", ejectRateMaxBox.value));
        splitRecoilMaxBox.addEventListener("change", () => setSliderMax("splitRecoil", splitRecoilMaxBox.value));
        splitSpeedMaxBox.addEventListener("change", () => setSliderMax("splitSpeed", splitSpeedMaxBox.value));
        splitDecayTimeMaxBox.addEventListener("change", () => setSliderMax("splitDecayTime", splitDecayTimeMaxBox.value));
        splitInputSpeedMaxBox.addEventListener("change", () => setSliderMax("splitInputSpeed", splitInputSpeedMaxBox.value));
        gameSpeedMaxBox.addEventListener("change", () => setSliderMax("gameSpeed", gameSpeedMaxBox.value));
        renderRangeMaxBox.addEventListener("change", () => setSliderMax("renderRange", renderRangeMaxBox.value));
        mergeCooldownMaxBox.addEventListener("change", () => setSliderMax("mergeCooldown", mergeCooldownMaxBox.value));
        mergeCancelCooldownMaxBox.addEventListener("change", () => setSliderMax("mergeCancelCooldown", mergeCancelCooldownMaxBox.value));
        worldSizeMaxBox.addEventListener("change", () => setSliderMax("worldSize", worldSizeMaxBox.value));
      }

      function queuePlayerSplits(count) {
        const splitCount = clamp(Math.round(count) || 1, 1, 4);
        const actor = state.player && receivesPlayerInput(state.player)
          ? state.player
          : actorById(state.input.activeActorId);
        if (actor && receivesPlayerInput(actor)) {
          if (!actor.input.splitLockActive) {
            const aim = actorAimDirection(actor);
            actor.input.splitLockX = aim.x;
            actor.input.splitLockY = aim.y;
            actor.input.splitLockActive = true;
            actor.nextQueuedSplitAt = Math.min(actor.nextQueuedSplitAt, state.now);
          }
          actor.input.splitQueued = true;
          actor.input.splitCount += splitCount;
        } else {
          state.input.splitQueued = true;
          state.input.splitCount += splitCount;
        }
        state.input.splitSeq += 1;
        state.input.splitBurstCount = splitCount;
      }

      function seedInitialViruses(avoidX, avoidY) {
        state.viruses.length = 0;
        state.virusRespawnQueue.length = 0;
        const virusTarget = state.settings.virusTarget;
        if (virusTarget <= 0) return;
        const columns = Math.ceil(Math.sqrt(virusTarget));
        const rows = Math.ceil(virusTarget / columns);
        const margin = 420;
        const stepX = (WORLD_SIZE - margin * 2) / Math.max(1, columns - 1);
        const stepY = (WORLD_SIZE - margin * 2) / Math.max(1, rows - 1);
        const jitterX = Math.min(34, stepX * 0.22);
        const jitterY = Math.min(34, stepY * 0.22);

        for (let row = 0; row < rows && state.viruses.length < virusTarget; row += 1) {
          for (let column = 0; column < columns && state.viruses.length < virusTarget; column += 1) {
            const x = margin + column * stepX + rand(-jitterX, jitterX);
            const y = margin + row * stepY + rand(-jitterY, jitterY);
            if (distSq(x, y, avoidX, avoidY) < 560 * 560) continue;
            if (!virusSpawnIsSafe(x, y)) continue;
            state.viruses.push(createVirus(x, y));
          }
        }

        while (state.viruses.length < virusTarget) {
          state.viruses.push(spawnVirusSafely(avoidX, avoidY));
        }
      }

      function virusSpawnIsSafe(x, y) {
        const virusRadius = radiusFromMass(VIRUS_MASS);
        for (const virus of state.viruses) {
          if (virus.dead) continue;
          const safeDistance = virusRadius + virus.radius + 10;
          if (distSq(x, y, virus.x, virus.y) < safeDistance * safeDistance) return false;
        }

        for (const actor of state.actors) {
          for (const cell of actor.cells) {
            const safeDistance = cell.radius + virusRadius + 120;
            if (distSq(x, y, cell.x, cell.y) < safeDistance * safeDistance) return false;
          }
        }
        return true;
      }

      function init() {
        resize();
        loadLocalPreferences();
        bindInput();
        ensureRelayDefaults();
        setViewScalePercent(state.viewScale * 100);
        syncSettingsControls();
        syncKeyBindControls();
        nameBox.value = state.profile.name;
        cloneNameBox.value = state.profile.cloneName;
        setMenuPage("home");
        setMenuOpen(true);

        resetFreshWorld("player", false, false);

        scheduleNextFrame(0);
      }

      function scheduleNextFrame(delay = TARGET_FRAME_TIME * 1000) {
        setTimeout(() => loop(performance.now()), Math.max(0, delay));
      }

      function loop(time = performance.now()) {
        const frameStartedAt = performance.now();
        state.frameIndex += 1;
        const dt = Math.min(0.04, Math.max(0.001, (time - state.lastFrame) / 1000));
        state.lastFrame = time;
        const realNow = time / 1000;

        state.fpsSample += ((1 / dt) - state.fpsSample) * 0.08;
        state.fpsTimer += dt;
        if (state.fpsTimer > 0.25) {
          state.fps = state.fpsSample;
          state.fpsTimer = 0;
        }

        if (state.net.role === "client") {
          state.simTime += dt;
          update(dt, state.simTime, realNow);
        } else {
          const scaledDt = dt * gameSpeedScale();
          const steps = clamp(Math.ceil(scaledDt / 0.035), 1, 12);
          const stepDt = scaledDt / steps;
          for (let i = 0; i < steps; i += 1) {
            state.simTime += stepDt;
            update(stepDt, state.simTime, realNow);
          }
        }
        draw();
        const elapsed = performance.now() - frameStartedAt;
        scheduleNextFrame(TARGET_FRAME_TIME * 1000 - elapsed);
      }

      init();
    })();
