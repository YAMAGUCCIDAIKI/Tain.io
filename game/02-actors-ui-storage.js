// プレイヤーやbotの個体管理、メニューUI、設定保存と復元を扱います。
      function createActor(id, name, color, isHuman = false, control = null) {
        return {
          id,
          name,
          color,
          isHuman,
          control: control || (isHuman ? "local" : "bot"),
          input: {
            targetX: WORLD_SIZE * 0.5,
            targetY: WORLD_SIZE * 0.5,
            keys: new Set(),
            splitQueued: false,
            splitCount: 0,
            splitLockActive: false,
            splitLockX: 1,
            splitLockY: 0,
            ejectQueued: false,
            lastAimX: 1,
            lastAimY: 0,
            lastNetSplitSeq: 0,
            lastNetEjectSeq: 0,
            lastNetRespawnSeq: 0,
            lastNetCloneSeq: 0
          },
          cells: [],
          aiTimer: 0,
          lastEject: -100,
          nextEjectIndex: 0,
          lastSplit: -100,
          lastSplitFrame: -1,
          lastSplitRecoilAt: -100,
          nextQueuedSplitAt: -100,
          lastMergeFrame: -1,
          mergeCancelUntil: new Map(),
          mergeDominantByPair: new Map(),
          wanderX: rand(300, WORLD_SIZE - 300),
          wanderY: rand(300, WORLD_SIZE - 300),
          respawnAt: 0,
          respawns: 0,
          nextSplitPriority: 1
        };
      }

      function randomActorColor(previous = "") {
        if (!playerPalette.length) return "#2e90fa";
        let color = previous;
        for (let i = 0; i < 6 && color === previous; i += 1) {
          color = playerPalette[Math.floor(Math.random() * playerPalette.length)];
        }
        return color || playerPalette[0];
      }

      function actorById(id) {
        return state.actors.find((actor) => actor.id === id) || null;
      }

      function isLocalActor(actor) {
        return actor && actor.id === state.localActorId;
      }

      function isPlayerControlled(actor) {
        return actor && (actor.control === "local" || actor.control === "remote");
      }

      function receivesPlayerInput(actor) {
        if (!actor) return false;
        if (actor.control === "remote") return true;
        return actor.control === "local" && actor.id === state.input.activeActorId;
      }

      function isLocalViewActor(actor) {
        return actor && actor.isHuman && (
          actor.control === "local" ||
          isLocalControlledActorId(actor.id) ||
          (actor.localClone && isLocalCloneActorId(actor.id))
        );
      }

      function localHumanActors() {
        return state.actors.filter(isLocalViewActor);
      }

      function primaryLocalActor() {
        return localHumanActors().find((actor) => !actor.localClone) || actorById(state.localActorId) || null;
      }

      function localCloneActor() {
        return localHumanActors().find((actor) => actor.localClone) || null;
      }

      function localCloneId(baseId = state.localActorId) {
        return `${baseId}-clone-1`;
      }

      function isLocalCloneActorId(id) {
        return id === localCloneId() || (id === "local-clone-1" && state.net.role !== "client");
      }

      function isLocalControlledActorId(id) {
        return id === state.localActorId || isLocalCloneActorId(id);
      }

      function isActiveLocalActor(actor) {
        return Boolean(actor && actor.control === "local" && actor.id === state.input.activeActorId);
      }

      function actorRenderColor(actor) {
        if (state.settings.activeColorHighlight && isActiveLocalActor(actor)) return ACTIVE_CONTROL_COLOR;
        return actor ? actor.color : "#2e90fa";
      }

      function remoteCloneActor(baseId = "guest") {
        return state.actors.find((actor) => actor.id === localCloneId(baseId) && actor.localClone) || null;
      }

      function liveLocalHumanActors() {
        return localHumanActors().filter((actor) => actor.cells.some((cell) => !cell.dead));
      }

      function switchActiveLocalActorIfDead() {
        const liveActors = liveLocalHumanActors();
        if (!liveActors.length) return false;
        const activeActor = actorById(state.input.activeActorId);
        if (activeActor && activeActor.control === "local" && liveCellCount(activeActor) > 0) return false;
        const nextActor = liveActors.find((actor) => actor !== activeActor) || liveActors[0];
        setActiveLocalActor(nextActor);
        state.net.lastSnapshotSend = -100;
        return true;
      }

      function localPlayerIsDead() {
        return liveLocalHumanActors().length === 0;
      }

      function syncSpectateButton() {
        const canSpectate = localPlayerIsDead();
        if (!canSpectate && state.spectating) state.spectating = false;
        spectateBtn.disabled = !canSpectate;
        spectateBtn.textContent = state.spectating ? "観戦中" : "観戦";
      }

      function clearActorControlInput(actor, preserveSplits = false) {
        if (!actor || !actor.input) return;
        actor.input.keys.clear();
        actor.input.ejectQueued = false;
        if (!preserveSplits) {
          actor.input.splitQueued = false;
          actor.input.splitCount = 0;
          actor.input.splitLockActive = false;
        }
      }

      function setActiveLocalActor(actor) {
        if (!actor) return;
        for (const localActor of localHumanActors()) {
          if (localActor !== actor) clearActorControlInput(localActor, true);
        }
        state.player = actor;
        state.input.activeActorId = actor.id;
        actor.input.targetX = state.input.mouseWorldX;
        actor.input.targetY = state.input.mouseWorldY;
      }

      function sanitizeProfileText(value, fallback, maxLength) {
        const text = String(value || "").replace(/[<>{}[\]\\]/g, "").trim().slice(0, maxLength);
        return text || fallback;
      }

      function syncProfileFromInputs() {
        state.profile.name = sanitizeProfileText(nameBox.value, "YOU", 18);
        state.profile.cloneName = sanitizeProfileText(cloneNameBox.value, `${state.profile.name || "YOU"}2`, 18);
      }

      function localProfileName(isClone = false) {
        const name = sanitizeProfileText(state.profile.name, "YOU", 18);
        if (!isClone) return name;
        return sanitizeProfileText(state.profile.cloneName, `${name}2`, 18);
      }

      function playerSpawnMass() {
        return clamp(Math.round(Number(state.settings.spawnMass) || DEFAULT_SPAWN_MASS), MIN_CELL_MASS, state.settings.max.spawnMass);
      }

      function botSpawnMass() {
        return clamp(Math.round(Number(state.settings.botSpawnMass) || BOT_SPAWN_MASS), MIN_CELL_MASS, state.settings.max.botSpawnMass);
      }

      function spawnBotActor(bot) {
        const mass = botSpawnMass();
        const pos = findBotSpawnPosition(mass);
        spawnActor(bot, mass, pos.x, pos.y);
      }

      function applyLocalProfile() {
        syncProfileFromInputs();
        for (const actor of localHumanActors()) {
          actor.name = localProfileName(actor.localClone);
        }
        state.net.lastSnapshotSend = -100;
        saveLocalPreferences();
      }

      function escapeHtml(value) {
        return String(value).replace(/[&<>"']/g, (char) => ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          "\"": "&quot;",
          "'": "&#39;"
        })[char]);
      }

      function findLocalActorSpawnPosition(actor, anchorActor, mass) {
        const radius = radiusFromMass(mass);
        const margin = Math.min(Math.max(radius + 24, 80), WORLD_SIZE * 0.5 - 1);
        const options = {
          avoidViruses: true,
          virusPadding: 130,
          cellPadding: 36
        };
        let best = null;
        let bestScore = -Infinity;

        if (anchorActor && liveCellCount(anchorActor) > 0) {
          let anchorCell = null;
          for (const cell of anchorActor.cells) {
            if (cell.dead) continue;
            if (!anchorCell || cell.radius > anchorCell.radius) anchorCell = cell;
          }
          if (anchorCell) {
            const aim = actorAimDirection(anchorActor);
            const angle = Math.atan2(aim.y, aim.x);
            const targetDistance = anchorCell.radius + radiusFromMass(2000);
            const minDistance = Math.max(anchorCell.radius + radius + 2, targetDistance);
            const overlapsAnyCell = (x, y) => {
              for (const otherActor of state.actors) {
                for (const otherCell of otherActor.cells) {
                  if (otherCell.dead) continue;
                  const gap = otherCell.radius + radius + 2;
                  if (distSq(x, y, otherCell.x, otherCell.y) < gap * gap) return true;
                }
              }
              return false;
            };
            for (let ring = 0; ring < 8; ring += 1) {
              const distance = minDistance + ring * Math.max(10, radius * 0.28);
              for (let i = 0; i < 16; i += 1) {
                const offset = i === 0 ? 0 : ((i % 2 === 0 ? 1 : -1) * Math.ceil(i / 2) * (TAU / 16));
                const nextAngle = angle + offset;
                const x = clamp(anchorCell.x + Math.cos(nextAngle) * distance, margin, WORLD_SIZE - margin);
                const y = clamp(anchorCell.y + Math.sin(nextAngle) * distance, margin, WORLD_SIZE - margin);
                if (!overlapsAnyCell(x, y)) return { x, y };
              }
            }
            for (let ring = 8; ring < 24; ring += 1) {
              const distance = minDistance + ring * Math.max(10, radius * 0.36);
              for (let i = 0; i < 20; i += 1) {
                const nextAngle = angle + (i / 20) * TAU;
                const x = clamp(anchorCell.x + Math.cos(nextAngle) * distance, margin, WORLD_SIZE - margin);
                const y = clamp(anchorCell.y + Math.sin(nextAngle) * distance, margin, WORLD_SIZE - margin);
                if (!overlapsAnyCell(x, y)) return { x, y };
              }
            }
          }
        }

        const consider = (x, y) => {
          const clampedX = clamp(x, margin, WORLD_SIZE - margin);
          const clampedY = clamp(y, margin, WORLD_SIZE - margin);
          const score = spawnClearanceScore(clampedX, clampedY, radius, options);
          if (score > bestScore) {
            bestScore = score;
            best = { x: clampedX, y: clampedY };
          }
        };

        if (anchorActor && liveCellCount(anchorActor) > 0) {
          const anchor = actorCenter(anchorActor);
          let anchorRadius = 0;
          for (const cell of anchorActor.cells) {
            if (!cell.dead) anchorRadius = Math.max(anchorRadius, cell.radius);
          }
          const aim = actorAimDirection(anchorActor);
          const baseAngle = Math.atan2(aim.y, aim.x);
          const massRange = clamp(anchorRadius * 0.75 + radius * 0.45, 24, anchorRadius * 2);
          const baseDistance = Math.min(anchorRadius * 3, radius + anchorRadius + options.cellPadding + massRange);
          for (let ring = 0; ring < 2; ring += 1) {
            const distance = Math.min(anchorRadius * 3, baseDistance + ring * Math.max(24, massRange * 0.32));
            for (let i = 0; i < 24; i += 1) {
              const angle = baseAngle + (i / 24) * TAU;
              consider(anchor.x + Math.cos(angle) * distance, anchor.y + Math.sin(angle) * distance);
            }
          }
        }

        const fallback = findOpenSpawnPosition(radius, margin, 96, options);
        consider(fallback.x, fallback.y);
        return best || fallback;
      }

      function spawnLocalActorBeside(actor, anchorActor) {
        const mass = playerSpawnMass();
        const pos = findLocalActorSpawnPosition(actor, anchorActor, mass);
        spawnActor(actor, mass, pos.x, pos.y);
        state.net.lastSnapshotSend = -100;
        rebuildSpatialHashes();
      }

      function requestRemoteCloneToggle() {
        const main = primaryLocalActor() || actorById(state.localActorId);
        const clone = localCloneActor();
        const nextId = state.player === clone ? state.localActorId : localCloneId();
        const nextActor = actorById(nextId);
        if (nextActor && nextActor.control === "local") {
          setActiveLocalActor(nextActor);
        } else if (main) {
          state.input.activeActorId = nextId;
          setActiveLocalActor(main);
          state.input.activeActorId = nextId;
        }
        if (main && main.input) {
          main.input.targetX = state.input.mouseWorldX;
          main.input.targetY = state.input.mouseWorldY;
        }
        state.input.cloneQueued = true;
        state.input.cloneSeq += 1;
        state.net.lastInputSend = -100;
      }

      function ensureRemoteClone(main) {
        let clone = remoteCloneActor(main.id);
        if (!clone) {
          clone = createActor(localCloneId(main.id), `${main.name || "P2"}2`, main.color, true, "remote");
          clone.localClone = true;
          state.actors.push(clone);
          spawnLocalActorBeside(clone, main);
        }
        return clone;
      }

      function handleRemoteCloneToggle(main) {
        const clone = ensureRemoteClone(main);
        if (liveCellCount(main) <= 0) {
          spawnLocalActorBeside(main, clone);
        } else if (liveCellCount(clone) <= 0) {
          spawnLocalActorBeside(clone, main);
        }
        return clone;
      }

      function displayActorName(actor) {
        if (actor && actor.isHuman) return actor.name || (actor.control === "local" ? "自分" : "P2");
        return actor ? actor.name : "";
      }

      function statusLabel(text) {
        const direct = {
          "OFFLINE": "オフライン",
          "OFFLINE PLAY": "オフライン継続",
          "CONNECTED": "接続済み",
          "CONNECTING": "接続中",
          "CHECKING": "確認中",
          "CLOSED": "切断済み",
          "ICE FAILED": "ICE失敗",
          "CHANNEL NG": "通信エラー",
          "ROOM FULL": "満室",
          "NO ROOM": "部屋なし",
          "ROOM NG": "部屋エラー",
          "ROOM BUSY": "部屋使用中",
          "ROOM LOST": "部屋切断",
          "ROOM OPENING": "部屋作成中",
          "ROOM JOINING": "入室中",
          "ROOM SEND NG": "部屋送信失敗",
          "SEND NG": "送信失敗",
          "NO WEBRTC": "WebRTCなし",
          "NO WS": "WebSocketなし",
          "NO HOST": "ホストなし",
          "NO PEER": "相手なし",
          "MAKE OFFER": "オファー作成中",
          "OFFER OK": "オファー完了",
          "MAKE ANSWER": "回答作成中",
          "ANSWER OK": "回答完了",
          "ANSWER NG": "回答失敗",
          "SET RELAY URL": "リレーURL入力",
          "RELAY CONNECT": "リレー接続中",
          "RELAY JOIN": "リレー入室中",
          "RELAY NG": "リレー失敗",
          "RELAY SEND NG": "リレー送信失敗",
          "RELAY CLOSED": "リレー切断",
          "HOST RESET": "ホストでリセット",
          "PEERJS LOAD NG": "PeerJS読込失敗"
        };
        if (direct[text]) return direct[text];
        if (text.startsWith("ROOM ")) return text.replace("ROOM ", "部屋 ");
        if (text.startsWith("PEER ")) return text.replace("PEER ", "相手 ");
        if (text.startsWith("ICE ")) return text.replace("ICE ", "ICE ");
        if (text.includes(" WAIT")) return text.replace(" WAIT", " 待機中");
        if (text.includes(" NG")) return text.replace(" NG", " 失敗");
        return text;
      }

      function setStatus(text) {
        state.net.status = text;
        onlineStatusEl.textContent = statusLabel(text);
      }

      function defaultRelayUrl() {
        if (location.hostname === "localhost" || location.hostname === "127.0.0.1") {
          return `ws://${location.host}/ws`;
        }
        return "ws://localhost:8080/ws";
      }

      function ensureRelayDefaults() {
        if (serverUrlBox && !serverUrlBox.value.trim()) serverUrlBox.value = defaultRelayUrl();
        if (roomBox && !roomBox.value.trim()) roomBox.value = "agar";
      }

      function setMenuOpen(open) {
        if (!open && state.waitingForPlay && localPlayerIsDead() && !state.spectating) open = true;
        state.menuOpen = Boolean(open);
        if (state.menuOpen) {
          state.input.keys.clear();
          state.input.splitQueued = false;
          state.input.splitCount = 0;
          state.input.splitBurstCount = 0;
          state.input.ejectQueued = false;
          state.input.botSplitQueued = false;
          state.input.botEjectQueued = false;
          for (const actor of localHumanActors()) clearActorControlInput(actor);
        } else {
          state.keyCaptureAction = null;
          if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
        }
        document.body.classList.toggle("menu-open", state.menuOpen);
        syncSpectateButton();
        syncKeyBindControls();
      }

      function setMenuPage(page) {
        for (const button of menuTabButtons) {
          button.classList.toggle("active", button.dataset.menuPage === page);
        }
        for (const panel of menuPagePanels) {
          panel.classList.toggle("active", panel.dataset.menuPagePanel === page);
        }
      }

      function keyLabel(code) {
        if (!code) return "";
        if (code === "Space") return "Space";
        if (code === "Tab") return "Tab";
        if (code === "Escape") return "Esc";
        if (code.startsWith("Key")) return code.slice(3);
        if (code.startsWith("Digit")) return code.slice(5);
        if (code.startsWith("Numpad")) return `Num ${code.slice(6)}`;
        if (code.startsWith("Arrow")) return code.replace("Arrow", "");
        return code;
      }

      function syncKeyBindControls() {
        for (const button of keyBindButtons) {
          const action = button.dataset.keybind;
          button.textContent = state.keyCaptureAction === action ? "入力中" : keyLabel(state.keyBindings[action]);
        }
      }

      function beginKeyCapture(action) {
        if (!Object.prototype.hasOwnProperty.call(state.keyBindings, action)) return;
        state.keyCaptureAction = action;
        syncKeyBindControls();
      }

      function captureKeyBinding(code) {
        if (!state.keyCaptureAction) return false;
        if (code === "Escape") {
          state.keyCaptureAction = null;
          syncKeyBindControls();
          return true;
        }
        for (const action of Object.keys(state.keyBindings)) {
          if (action !== state.keyCaptureAction && state.keyBindings[action] === code) {
            state.keyBindings[action] = "";
          }
        }
        state.keyBindings[state.keyCaptureAction] = code;
        state.keyCaptureAction = null;
        syncKeyBindControls();
        saveLocalPreferences();
        return true;
      }

      function localStorageAvailable() {
        try {
          return typeof localStorage !== "undefined";
        } catch (error) {
          return false;
        }
      }

      function saveLocalPreferences() {
        if (!localStorageAvailable()) return;
        const prefs = {
          profile: { ...state.profile },
          keyBindings: { ...state.keyBindings },
          viewScale: state.viewScale,
          settings: {
            botEnabled: state.settings.botEnabled,
            botTarget: state.settings.botTarget,
            botMode: state.settings.botMode,
            botSpawnMass: state.settings.botSpawnMass,
            botEjectRate: state.settings.botEjectRate,
            virusTarget: state.settings.virusTarget,
            foodTarget: state.settings.foodTarget,
            spawnMass: state.settings.spawnMass,
            ejectMass: state.settings.ejectMass,
            ejectSpeed: state.settings.ejectSpeed,
            ejectRate: state.settings.ejectRate,
            splitRecoil: state.settings.splitRecoil,
            splitSpeed: state.settings.splitSpeed,
            splitDecayTime: state.settings.splitDecayTime,
            splitInputSpeed: state.settings.splitInputSpeed,
            gameSpeed: state.settings.gameSpeed,
            renderRange: state.settings.renderRange,
            mergeCooldown: state.settings.mergeCooldown,
            mergeCancelCooldown: state.settings.mergeCancelCooldown,
            worldSize: state.settings.worldSize,
            cursorLine: state.settings.cursorLine,
            nRespawnEnabled: state.settings.nRespawnEnabled,
            activeColorHighlight: state.settings.activeColorHighlight,
            showOtherMass: state.settings.showOtherMass,
            showOwnMass: state.settings.showOwnMass
          },
          min: { ...state.settings.min },
          max: { ...state.settings.max }
        };
        try {
          localStorage.setItem(LOCAL_PREFS_KEY, JSON.stringify(prefs));
        } catch (error) {}
      }

      function loadLocalPreferences() {
        if (!localStorageAvailable()) return;
        let prefs = null;
        try {
          prefs = JSON.parse(localStorage.getItem(LOCAL_PREFS_KEY) || "null");
        } catch (error) {
          return;
        }
        if (!prefs || typeof prefs !== "object") return;
        if (prefs.profile) {
          state.profile.name = sanitizeProfileText(prefs.profile.name, state.profile.name, 18);
          state.profile.cloneName = sanitizeProfileText(prefs.profile.cloneName, state.profile.cloneName, 18);
        }
        if (prefs.keyBindings && typeof prefs.keyBindings === "object") {
          for (const action of Object.keys(state.keyBindings)) {
            if (typeof prefs.keyBindings[action] === "string") state.keyBindings[action] = prefs.keyBindings[action];
          }
        }
        if (prefs.min && typeof prefs.min === "object") {
          for (const kind of Object.keys(state.settings.min)) {
            if (kind === "splitInputSpeed" && prefs.min[kind] <= 4) continue;
            if (Number.isFinite(prefs.min[kind])) setSliderBound(kind, "min", prefs.min[kind], false);
          }
        }
        if (prefs.max && typeof prefs.max === "object") {
          for (const kind of Object.keys(state.settings.max)) {
            if (kind === "splitInputSpeed" && prefs.max[kind] <= 4) continue;
            if (Number.isFinite(prefs.max[kind])) setSliderBound(kind, "max", prefs.max[kind], false);
          }
        }
        state.settings.max.ejectRate = Math.max(state.settings.max.ejectRate, TARGET_FPS);
        state.settings.max.botEjectRate = Math.max(state.settings.max.botEjectRate, TARGET_FPS);
        if (prefs.settings && typeof prefs.settings === "object") {
          const saved = prefs.settings;
          if (saved.botEnabled != null) state.settings.botEnabled = Boolean(saved.botEnabled);
          if (Number.isFinite(saved.botTarget)) state.settings.botTarget = clamp(roundSliderValue("bot", saved.botTarget), state.settings.min.bot, state.settings.max.bot);
          if (["hunt", "chase", "virus", "cursor", "eject"].includes(saved.botMode)) state.settings.botMode = saved.botMode;
          if (Number.isFinite(saved.botSpawnMass)) state.settings.botSpawnMass = clamp(roundSliderValue("botSpawnMass", saved.botSpawnMass), state.settings.min.botSpawnMass, state.settings.max.botSpawnMass);
          if (Number.isFinite(saved.botEjectRate)) state.settings.botEjectRate = clamp(roundSliderValue("botEjectRate", saved.botEjectRate), state.settings.min.botEjectRate, state.settings.max.botEjectRate);
          if (Number.isFinite(saved.virusTarget)) state.settings.virusTarget = clamp(roundSliderValue("virus", saved.virusTarget), state.settings.min.virus, state.settings.max.virus);
          if (Number.isFinite(saved.foodTarget)) state.settings.foodTarget = clamp(roundSliderValue("food", saved.foodTarget), state.settings.min.food, state.settings.max.food);
          if (Number.isFinite(saved.spawnMass)) state.settings.spawnMass = clamp(roundSliderValue("spawnMass", saved.spawnMass), state.settings.min.spawnMass, state.settings.max.spawnMass);
          if (Number.isFinite(saved.ejectMass)) state.settings.ejectMass = clamp(roundSliderValue("ejectMass", saved.ejectMass), state.settings.min.ejectMass, state.settings.max.ejectMass);
          if (Number.isFinite(saved.ejectSpeed)) state.settings.ejectSpeed = clamp(roundSliderValue("ejectSpeed", saved.ejectSpeed), state.settings.min.ejectSpeed, state.settings.max.ejectSpeed);
          if (Number.isFinite(saved.ejectRate)) state.settings.ejectRate = clamp(roundSliderValue("ejectRate", saved.ejectRate), state.settings.min.ejectRate, state.settings.max.ejectRate);
          if (Number.isFinite(saved.splitRecoil)) state.settings.splitRecoil = clamp(roundSliderValue("splitRecoil", saved.splitRecoil), state.settings.min.splitRecoil, state.settings.max.splitRecoil);
          if (Number.isFinite(saved.splitSpeed)) state.settings.splitSpeed = clamp(roundSliderValue("splitSpeed", saved.splitSpeed), state.settings.min.splitSpeed, state.settings.max.splitSpeed);
          if (Number.isFinite(saved.splitDecayTime)) state.settings.splitDecayTime = clamp(roundSliderValue("splitDecayTime", saved.splitDecayTime), state.settings.min.splitDecayTime, state.settings.max.splitDecayTime);
          else if (Number.isFinite(saved.splitMomentum)) state.settings.splitDecayTime = clamp(roundSliderValue("splitDecayTime", saved.splitMomentum / 100), state.settings.min.splitDecayTime, state.settings.max.splitDecayTime);
          if (Number.isFinite(saved.splitInputSpeed)) state.settings.splitInputSpeed = clamp(roundSliderValue("splitInputSpeed", saved.splitInputSpeed), state.settings.min.splitInputSpeed, state.settings.max.splitInputSpeed);
          if (Number.isFinite(saved.gameSpeed)) state.settings.gameSpeed = clamp(roundSliderValue("gameSpeed", saved.gameSpeed), state.settings.min.gameSpeed, state.settings.max.gameSpeed);
          if (Number.isFinite(saved.renderRange)) state.settings.renderRange = clamp(roundSliderValue("renderRange", saved.renderRange), state.settings.min.renderRange, state.settings.max.renderRange);
          if (Number.isFinite(saved.mergeCooldown)) state.settings.mergeCooldown = clamp(roundSliderValue("mergeCooldown", saved.mergeCooldown), state.settings.min.mergeCooldown, state.settings.max.mergeCooldown);
          if (Number.isFinite(saved.mergeCancelCooldown)) state.settings.mergeCancelCooldown = clamp(roundSliderValue("mergeCancelCooldown", saved.mergeCancelCooldown), state.settings.min.mergeCancelCooldown, state.settings.max.mergeCancelCooldown);
          if (Number.isFinite(saved.worldSize)) state.settings.worldSize = clamp(roundSliderValue("worldSize", saved.worldSize), state.settings.min.worldSize, state.settings.max.worldSize);
          if (saved.cursorLine != null) state.settings.cursorLine = Boolean(saved.cursorLine);
          if (saved.nRespawnEnabled != null) state.settings.nRespawnEnabled = Boolean(saved.nRespawnEnabled);
          if (saved.activeColorHighlight != null) state.settings.activeColorHighlight = Boolean(saved.activeColorHighlight);
          if (saved.showOtherMass != null) state.settings.showOtherMass = Boolean(saved.showOtherMass);
          if (saved.showOwnMass != null) state.settings.showOwnMass = Boolean(saved.showOwnMass);
        }
        if (Number.isFinite(prefs.viewScale)) state.viewScale = clamp(prefs.viewScale, 0.55, 2.2);
      }

      function actionForKey(code) {
        for (const [action, keyCode] of Object.entries(state.keyBindings)) {
          if (keyCode && keyCode === code) return action;
        }
        return null;
      }

      function isTextEditingTarget(target) {
        return Boolean(target && target.closest && target.closest("input, textarea, select"));
      }

      function actorAutoEjectHeld(actor) {
        return Boolean(actor?.input?.keys?.has(state.keyBindings.autoEject) || actor?.input?.keys?.has(remoteAutoEjectKey));
      }

      function updateLocalActorInput() {
        if (state.spectating) return;
        const localActors = localHumanActors();
        if (!localActors.length) return;
        switchActiveLocalActorIfDead();
        let actor = state.player && state.player.control === "local" && state.player.isHuman
          ? state.player
          : localActors[0];
        if (liveCellCount(actor) <= 0) {
          actor = localActors.find((candidate) => liveCellCount(candidate) > 0) || actor;
          setActiveLocalActor(actor);
        }
        for (const actor of localActors) {
          if (actor !== state.player) {
            clearActorControlInput(actor, true);
            continue;
          }
          actor.input.targetX = state.input.mouseWorldX;
          actor.input.targetY = state.input.mouseWorldY;
          actor.input.keys.clear();
          if (state.input.keys.has(state.keyBindings.autoEject)) actor.input.keys.add(state.keyBindings.autoEject);
          if (state.input.ejectQueued) actor.input.ejectQueued = true;
          if (state.input.splitQueued) {
            actor.input.splitQueued = true;
            actor.input.splitCount += Math.max(1, state.input.splitCount || 1);
          }
        }
        if (state.input.ejectQueued) state.input.ejectQueued = false;
        if (state.input.splitQueued) {
          state.input.splitQueued = false;
          state.input.splitCount = 0;
        }
      }

      function toggleLocalCloneControl() {
        if (state.net.role === "client") {
          requestRemoteCloneToggle();
          return;
        }
        const main = primaryLocalActor();
        if (!main) return;
        if (liveCellCount(main) <= 0) {
          spawnLocalActorBeside(main, localCloneActor());
          setActiveLocalActor(main);
          return;
        }
        let clone = localCloneActor();
        if (!clone) {
          state.localCloneIndex = 1;
          clone = createActor("local-clone-1", localProfileName(true), botPalette[1 % botPalette.length], true, "local");
          clone.localClone = true;
          state.actors.push(clone);
          spawnLocalActorBeside(clone, main);
        }
        if (liveCellCount(clone) <= 0) {
          spawnLocalActorBeside(clone, main);
          setActiveLocalActor(clone);
          return;
        }
        const nextActor = state.player === clone ? main : clone;
        setActiveLocalActor(nextActor);
        state.net.lastSnapshotSend = -100;
      }

      function setSpectating(enabled) {
        state.spectating = Boolean(enabled) && localPlayerIsDead();
        if (state.spectating) state.spectatorMode = "leader";
        syncSpectateButton();
        if (!state.spectating) return;
        state.input.keys.clear();
        state.input.splitQueued = false;
        state.input.splitCount = 0;
        state.input.splitBurstCount = 0;
        state.input.ejectQueued = false;
        state.input.respawnQueued = false;
        state.input.botSplitQueued = false;
        state.input.botEjectQueued = false;
        for (const actor of localHumanActors()) clearActorControlInput(actor);
      }

      function toggleSpectating() {
        if (!localPlayerIsDead()) return;
        setSpectating(!state.spectating);
        if (state.spectating) setMenuOpen(false);
      }

      function toggleSpectatorCameraMode() {
        if (!state.spectating) return;
        state.spectatorMode = state.spectatorMode === "leader" ? "cursor" : "leader";
      }

      function syncClientLifeState() {
        if (state.net.role !== "client") return;
        if (!localPlayerIsDead()) {
          state.waitingForPlay = false;
          state.clientPlayRequestUntil = 0;
          if (state.spectating) setSpectating(false);
          return;
        }
        if (state.clientPlayRequestUntil > (state.realNow || state.now || 0)) return;
        state.waitingForPlay = true;
        if (!state.spectating) setMenuOpen(true);
        syncSpectateButton();
      }

      function playLocalPlayer() {
        applyLocalProfile();
        if (state.net.role === "client") {
          state.input.respawnQueued = true;
          state.input.respawnSeq += 1;
          state.waitingForPlay = false;
          state.clientPlayRequestUntil = (state.realNow || state.now || 0) + 1.5;
          setSpectating(false);
          setMenuOpen(false);
          return;
        }
        let actor = primaryLocalActor() || actorById(state.localActorId);
        if (!actor) {
          resetFreshWorld(state.localActorId || "player", state.net.role !== "offline");
          actor = state.player;
        }
        if (localPlayerIsDead()) {
          spawnActor(actor, playerSpawnMass());
          setActiveLocalActor(actor);
          state.waitingForPlay = false;
          state.flashUntil = state.now + 1.0;
          state.net.lastSnapshotSend = -100;
          rebuildSpatialHashes();
        }
        setSpectating(false);
        setMenuOpen(false);
      }

      function createBotActor() {
        const index = state.nextBotIndex;
        state.nextBotIndex += 1;
        const botName = `${botNames[index % botNames.length]} ${String(index + 1).padStart(2, "0")}`;
        const bot = createActor(`bot-${index}`, botName, botPalette[index % botPalette.length]);
        state.actors.push(bot);
        spawnBotActor(bot);
        return bot;
      }

      function ensureBotPopulation() {
        const target = state.settings.botEnabled ? state.settings.botTarget : 0;
        let botCount = 0;
        for (const actor of state.actors) {
          if (!actor.isHuman) botCount += 1;
        }
        for (let i = state.actors.length - 1; i >= 0 && botCount > target; i -= 1) {
          if (state.actors[i].isHuman) continue;
          state.actors.splice(i, 1);
          botCount -= 1;
        }
        while (botCount < target) {
          createBotActor();
          botCount += 1;
        }
      }
