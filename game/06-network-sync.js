// オンライン接続、状態同期、スナップショット反映を扱います。
      function networkSupported() {
        return typeof RTCPeerConnection === "function";
      }

      function peerJsSupported() {
        return typeof Peer === "function";
      }

      function normalizeRoomId() {
        ensureRelayDefaults();
        const room = roomBox.value.trim().replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 24) || "agar";
        roomBox.value = room;
        return `agar-canvas-${room}`;
      }

      function createPeerConnection() {
        state.net.iceCandidates = 0;
        const pc = new RTCPeerConnection({
          iceServers: [
            { urls: "stun:stun.l.google.com:19302" },
            { urls: "stun:stun1.l.google.com:19302" }
          ]
        });
        pc.onicecandidate = (event) => {
          if (event.candidate) {
            state.net.iceCandidates += 1;
            if (!state.net.connected) setStatus(`ICE ${state.net.iceCandidates}`);
          }
        };
        pc.onconnectionstatechange = () => {
          const status = pc.connectionState.toUpperCase();
          if (pc.connectionState === "connected") setStatus("CONNECTED");
          else if (pc.connectionState === "failed" || pc.connectionState === "disconnected") setStatus(status);
          else setStatus(status);
        };
        pc.oniceconnectionstatechange = () => {
          if (pc.iceConnectionState === "checking") setStatus("CHECKING");
          if (pc.iceConnectionState === "connected" || pc.iceConnectionState === "completed") setStatus("CONNECTED");
          if (pc.iceConnectionState === "failed") setStatus("ICE FAILED");
        };
        return pc;
      }

      function waitForIceGathering(pc, label = "ICE") {
        if (pc.iceGatheringState === "complete") return Promise.resolve();
        return new Promise((resolve) => {
          let done = false;
          const finish = () => {
            if (done) return;
            done = true;
            pc.removeEventListener("icegatheringstatechange", onChange);
            resolve();
          };
          const onChange = () => {
            if (!done) setStatus(`${label} ${pc.iceGatheringState.toUpperCase()}`);
            if (pc.iceGatheringState === "complete") finish();
          };
          pc.addEventListener("icegatheringstatechange", onChange);
          setStatus(`${label} WAIT`);
          setTimeout(finish, 9000);
        });
      }

      function parseSignal(text, label) {
        try {
          const value = text.trim();
          const signal = value.startsWith("AGAR1:")
            ? JSON.parse(base64UrlDecode(value.slice(6)))
            : JSON.parse(value);
          if (!signal || !signal.type || !signal.sdp) throw new Error("bad signal");
          return signal;
        } catch (error) {
          setStatus(`${label} NG`);
          return null;
        }
      }

      function base64UrlEncode(text) {
        return btoa(text).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
      }

      function base64UrlDecode(text) {
        const normalized = text.replace(/-/g, "+").replace(/_/g, "/");
        const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
        return atob(padded);
      }

      function encodeSignal(description) {
        const payload = JSON.stringify({
          type: description.type,
          sdp: description.sdp
        });
        return `AGAR1:${base64UrlEncode(payload)}`;
      }

      function copySignal(text) {
        if (!navigator.clipboard || !navigator.clipboard.writeText) return;
        navigator.clipboard.writeText(text).catch(() => {});
      }

      function netSend(message) {
        if (state.net.transport === "peerjs") {
          const conn = state.net.peerConn;
          if (!conn || !conn.open) return false;
          try {
            conn.send(JSON.stringify(message));
            return true;
          } catch (error) {
            setStatus("ROOM SEND NG");
            return false;
          }
        }

        if (state.net.transport === "relay") {
          const socket = state.net.socket;
          if (!socket || socket.readyState !== WebSocket.OPEN) return false;
          try {
            socket.send(JSON.stringify(message));
            return true;
          } catch (error) {
            setStatus("RELAY SEND NG");
            return false;
          }
        }

        const channel = state.net.channel;
        if (!channel || channel.readyState !== "open") return false;
        try {
          channel.send(JSON.stringify(message));
          return true;
        } catch (error) {
          setStatus("SEND NG");
          return false;
        }
      }

      function setupDataChannel(channel) {
        state.net.transport = "webrtc";
        state.net.channel = channel;
        channel.onopen = () => {
          state.net.connected = true;
          setStatus("CONNECTED");
          if (state.net.role === "host") {
            state.net.lastSnapshotSend = -100;
            state.net.lastFeedSnapshotSend = -100;
            state.net.lastBotSnapshotSend = -100;
            state.net.lastWorldSend = -100;
            sendAuthoritativeSnapshot(state.realNow || performance.now() / 1000, true);
          }
        };
        channel.onclose = () => {
          if (state.net.channel === channel) state.net.channel = null;
          state.net.connected = false;
          if (state.net.role === "client") {
            continueOfflineAfterHostLoss();
            return;
          }
          setStatus("CLOSED");
        };
        channel.onerror = () => {
          if (state.net.channel === channel) state.net.channel = null;
          if (state.net.role === "client") {
            continueOfflineAfterHostLoss();
            return;
          }
          setStatus("CHANNEL NG");
        };
        channel.onmessage = (event) => handleNetMessage(event.data);
      }

      function setupPeerJsConnection(conn) {
        if (state.net.peerConn && state.net.peerConn !== conn) {
          if (state.net.connected && state.net.peerConn.open !== false) {
            try { conn.close(); } catch (error) {}
            setStatus("ROOM FULL");
            return;
          }
          try { state.net.peerConn.close(); } catch (error) {}
          state.net.peerConn = null;
          state.net.connected = false;
        }

        state.net.transport = "peerjs";
        state.net.peerConn = conn;
        conn.on("open", () => {
          if (state.net.connectTimer) {
            clearTimeout(state.net.connectTimer);
            state.net.connectTimer = 0;
          }
          state.net.connected = true;
          setStatus("CONNECTED");
          if (state.net.role === "host") {
            state.net.lastSnapshotSend = -100;
            state.net.lastFeedSnapshotSend = -100;
            state.net.lastBotSnapshotSend = -100;
            state.net.lastWorldSend = -100;
            sendAuthoritativeSnapshot(state.realNow || performance.now() / 1000, true);
          }
        });
        conn.on("data", (data) => {
          handleNetMessage(typeof data === "string" ? data : JSON.stringify(data));
        });
        conn.on("close", () => {
          if (state.net.peerConn === conn) state.net.peerConn = null;
          state.net.connected = false;
          if (state.net.role === "client") {
            continueOfflineAfterHostLoss();
            return;
          }
          setStatus("CLOSED");
        });
        conn.on("error", () => {
          if (state.net.peerConn === conn) state.net.peerConn = null;
          state.net.connected = false;
          if (state.net.role === "client" && !state.net.connected) {
            setStatus("NO ROOM");
            setTimeout(() => {
              if (state.net.transport === "peerjs" && !state.net.connected) continueOfflineAfterHostLoss();
            }, 900);
            return;
          }
          setStatus("ROOM NG");
        });
      }

      function resetFreshWorld(localId, onlineMode = false, spawnLocalPlayer = true) {
        syncProfileFromInputs();
        WORLD_SIZE = state.settings.worldSize;
        setSpectating(false);
        state.waitingForPlay = !spawnLocalPlayer;
        state.localCloneIndex = 0;
        state.localActorId = localId;
        state.input.activeActorId = localId;
        state.input.cloneQueued = false;
        state.input.cloneSeq = 0;
        state.input.splitBurstCount = 0;
        state.input.botSplitQueued = false;
        state.actors.length = 0;
        state.foods.length = 0;
        state.foodGridDirty = true;
        state.feeds.length = 0;
        state.viruses.length = 0;
        state.virusRespawnQueue.length = 0;
        state.nextBotIndex = 0;

        if (onlineMode) {
          const host = createActor("host", localId === "host" ? localProfileName() : "P1", "#2e90fa", true, localId === "host" ? "local" : "remote");
          const guest = createActor("guest", localId === "guest" ? localProfileName() : "P2", "#f04438", true, localId === "guest" ? "local" : "remote");
          state.actors.push(host, guest);
          state.player = localId === "guest" ? guest : host;
          if (localId === "host") {
            if (spawnLocalPlayer) spawnActor(host, playerSpawnMass());
            const initialFood = Math.min(state.settings.foodTarget, DEFAULT_FOOD_TARGET);
            while (state.foods.length < initialFood) addFood();
            const center = spawnLocalPlayer ? actorCenter(host) : { x: WORLD_SIZE * 0.5, y: WORLD_SIZE * 0.5 };
            seedInitialViruses(center.x, center.y);
          } else if (localId === "guest") {
            if (spawnLocalPlayer) spawnActor(guest, playerSpawnMass());
          }
        } else {
          const player = createActor("player", localProfileName(), "#2e90fa", true, "local");
          state.player = player;
          state.actors.push(player);
          if (spawnLocalPlayer) spawnActor(player, playerSpawnMass());
          ensureBotPopulation();
          const initialFood = Math.min(state.settings.foodTarget, DEFAULT_FOOD_TARGET);
          while (state.foods.length < initialFood) addFood();
          const center = spawnLocalPlayer ? actorCenter(player) : { x: WORLD_SIZE * 0.5, y: WORLD_SIZE * 0.5 };
          seedInitialViruses(center.x, center.y);
        }

        const center = spawnLocalPlayer ? actorCenter(state.player) : { x: WORLD_SIZE * 0.5, y: WORLD_SIZE * 0.5, mass: 1 };
        state.camera.x = center.x;
        state.camera.y = center.y;
        state.camera.zoom = mobileTargetZoom(Math.max(1, center.mass), Math.max(1, state.player?.cells.length || 1));
        rebuildSpatialHashes();
        state.flashUntil = state.now + 1.0;
        syncSpectateButton();
      }

      function closeNetwork(keepWorld = true) {
        if (state.net.connectTimer) {
          clearTimeout(state.net.connectTimer);
          state.net.connectTimer = 0;
        }
        if (state.net.socket) {
          state.net.socket.onopen = null;
          state.net.socket.onclose = null;
          state.net.socket.onerror = null;
          state.net.socket.onmessage = null;
          try { state.net.socket.close(); } catch (error) {}
        }
        if (state.net.channel) {
          state.net.channel.onopen = null;
          state.net.channel.onclose = null;
          state.net.channel.onerror = null;
          state.net.channel.onmessage = null;
          try { state.net.channel.close(); } catch (error) {}
        }
        if (state.net.peerConn) {
          try { state.net.peerConn.close(); } catch (error) {}
        }
        if (state.net.peer) {
          state.net.peer.removeAllListeners();
          try { state.net.peer.destroy(); } catch (error) {}
        }
        if (state.net.pc) {
          state.net.pc.onconnectionstatechange = null;
          state.net.pc.oniceconnectionstatechange = null;
          state.net.pc.ondatachannel = null;
          try { state.net.pc.close(); } catch (error) {}
        }
        state.net.role = "offline";
        state.net.transport = "none";
        state.net.pc = null;
        state.net.channel = null;
        state.net.peer = null;
        state.net.peerConn = null;
        state.net.connectTimer = 0;
        state.net.socket = null;
        state.net.connected = false;
        state.net.iceCandidates = 0;
        state.net.worldBuffer = null;
        state.net.pendingSnapshot = null;
        state.net.pendingWorldChunks.length = 0;
        state.net.lastInputSend = -100;
        state.net.lastSnapshotSend = -100;
        state.net.lastFeedSnapshotSend = -100;
        state.net.lastBotSnapshotSend = -100;
        state.net.lastWorldSend = -100;
        state.net.removedFeedIds.clear();
        state.net.removedVirusIds.clear();
        state.net.removedCellKeys.clear();
        state.net.clientRemovedFeedIds.clear();
        state.net.clientRemovedVirusIds.clear();
        setStatus("OFFLINE");
        if (!keepWorld) resetFreshWorld("player", false);
      }

      function continueOfflineAfterHostLoss() {
        if (state.net.role !== "client") return;
        closeNetwork(false);
        setStatus("OFFLINE PLAY");
      }

      async function startHostOnline() {
        if (!networkSupported()) {
          setStatus("NO WEBRTC");
          return;
        }
        closeNetwork(true);
        resetFreshWorld("host", true);
        state.net.role = "host";
        state.net.transport = "webrtc";
        const pc = createPeerConnection();
        state.net.pc = pc;
        setupDataChannel(pc.createDataChannel("agar-state"));
        setStatus("MAKE OFFER");
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        await waitForIceGathering(pc, "OFFER ICE");
        const signal = encodeSignal(pc.localDescription);
        offerBox.value = signal;
        copySignal(signal);
        offerBox.focus();
        offerBox.select();
        setStatus("OFFER OK");
      }

      function startRoomHost() {
        if (!peerJsSupported()) {
          setStatus("PEERJS LOAD NG");
          return;
        }

        closeNetwork(true);
        resetFreshWorld("host", true);
        state.net.role = "host";
        state.net.transport = "peerjs";
        const peerId = normalizeRoomId();
        const peer = new Peer(peerId, {
          debug: 0,
          config: {
            iceServers: [
              { urls: "stun:stun.l.google.com:19302" },
              { urls: "stun:stun1.l.google.com:19302" }
            ]
          }
        });
        state.net.peer = peer;
        setStatus("ROOM OPENING");
        peer.on("open", () => setStatus(`ROOM ${roomBox.value}`));
        peer.on("connection", setupPeerJsConnection);
        peer.on("error", (error) => {
          if (error && error.type === "unavailable-id") setStatus("ROOM BUSY");
          else setStatus("ROOM NG");
        });
        peer.on("disconnected", () => setStatus("ROOM LOST"));
      }

      function joinOrHostRoom() {
        joinRoom(true);
      }

      function joinRoom(autoHostOnMiss = false) {
        if (!peerJsSupported()) {
          setStatus("PEERJS LOAD NG");
          return;
        }

        closeNetwork(true);
        resetFreshWorld("guest", true, false);
        state.net.role = "client";
        state.net.transport = "peerjs";
        const hostPeerId = normalizeRoomId();
        const peer = new Peer(undefined, {
          debug: 0,
          config: {
            iceServers: [
              { urls: "stun:stun.l.google.com:19302" },
              { urls: "stun:stun1.l.google.com:19302" }
            ]
          }
        });
        state.net.peer = peer;
        setStatus("ROOM JOINING");
        peer.on("open", () => {
          const conn = peer.connect(hostPeerId, {
            label: "agar-state",
            reliable: false
          });
          setupPeerJsConnection(conn);
          state.net.connectTimer = setTimeout(() => {
            if (state.net.transport !== "peerjs" || state.net.connected) return;
            if (autoHostOnMiss) {
              startRoomHost();
              return;
            }
            setStatus("NO ROOM");
            setTimeout(() => {
              if (state.net.transport === "peerjs" && !state.net.connected) continueOfflineAfterHostLoss();
            }, 900);
          }, 3500);
        });
        peer.on("error", () => {
          if (autoHostOnMiss && !state.net.connected) {
            startRoomHost();
            return;
          }
          continueOfflineAfterHostLoss();
        });
        peer.on("disconnected", () => {
          if (autoHostOnMiss && !state.net.connected) {
            startRoomHost();
            return;
          }
          continueOfflineAfterHostLoss();
        });
      }

      async function createGuestAnswer() {
        if (!networkSupported()) {
          setStatus("NO WEBRTC");
          return;
        }
        const offer = parseSignal(offerBox.value, "OFFER");
        if (!offer) return;
        closeNetwork(true);
        resetFreshWorld("guest", true, false);
        state.net.role = "client";
        state.net.transport = "webrtc";
        const pc = createPeerConnection();
        state.net.pc = pc;
        pc.ondatachannel = (event) => setupDataChannel(event.channel);
        setStatus("MAKE ANSWER");
        await pc.setRemoteDescription(offer);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        await waitForIceGathering(pc, "ANSWER ICE");
        const signal = encodeSignal(pc.localDescription);
        answerBox.value = signal;
        copySignal(signal);
        answerBox.focus();
        answerBox.select();
        setStatus("ANSWER OK");
      }

      async function applyHostAnswer() {
        if (state.net.role !== "host" || !state.net.pc) {
          setStatus("NO HOST");
          return;
        }
        const answer = parseSignal(answerBox.value, "ANSWER");
        if (!answer) return;
        await state.net.pc.setRemoteDescription(answer);
        setStatus("CONNECTING");
      }

      function startRelayOnline(role) {
        if (typeof WebSocket !== "function") {
          setStatus("NO WS");
          return;
        }

        ensureRelayDefaults();
        const url = serverUrlBox.value.trim();
        if (!/^wss?:\/\//i.test(url)) {
          setStatus("SET RELAY URL");
          serverUrlBox.focus();
          return;
        }
        const room = roomBox.value.trim().replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 24) || "agar";
        roomBox.value = room;

        closeNetwork(true);
        resetFreshWorld(role === "host" ? "host" : "guest", true, role === "host");
        state.net.role = role === "host" ? "host" : "client";
        state.net.transport = "relay";
        state.net.connected = false;
        setStatus("RELAY CONNECT");

        const socket = new WebSocket(url);
        state.net.socket = socket;

        socket.onopen = () => {
          state.net.connected = true;
          setStatus("RELAY JOIN");
          socket.send(JSON.stringify({
            t: "relayJoin",
            room,
            role: state.net.role
          }));
          if (state.net.role === "host") {
            state.net.lastSnapshotSend = -100;
            state.net.lastFeedSnapshotSend = -100;
            state.net.lastBotSnapshotSend = -100;
            state.net.lastWorldSend = -100;
          }
        };

        socket.onmessage = (event) => handleRelayMessage(event.data);
        socket.onerror = () => setStatus("RELAY NG");
        socket.onclose = () => {
          state.net.connected = false;
          if (state.net.transport !== "relay") return;
          if (state.net.role === "client") {
            continueOfflineAfterHostLoss();
            return;
          }
          setStatus("RELAY CLOSED");
        };
      }

      function handleRelayMessage(data) {
        let message = null;
        try {
          message = JSON.parse(data);
        } catch (error) {
          return;
        }

        if (message.t === "relayReady") {
          setStatus(`ROOM ${message.peers}/2`);
          return;
        }

        if (message.t === "relayPeer") {
          setStatus(`PEER ${message.peers}/2`);
          if (state.net.role === "host" && message.peers >= 2) {
            sendAuthoritativeSnapshot(state.realNow || performance.now() / 1000, true);
          }
          return;
        }

        if (message.t === "relayError") {
          setStatus(message.message || "RELAY ERROR");
          return;
        }

        handleNetMessage(JSON.stringify(message));
      }

      function serializeCell(cell) {
        return {
          id: cell.id,
          x: cell.x,
          y: cell.y,
          mass: cell.mass,
          vx: cell.vx,
          vy: cell.vy,
          boostX: cell.boostX,
          boostY: cell.boostY,
          faceX: cell.faceX,
          faceY: cell.faceY,
          mergeReadyAt: cell.mergeReadyAt,
          capFramesLeft: cell.capFramesLeft,
          birthAge: cell.birthAge,
          birthDuration: cell.birthDuration,
          birthX: cell.birthX,
          birthY: cell.birthY,
          birthScale: cell.birthScale,
          fragmentAge: cell.fragmentAge,
          launchVelocityAge: cell.launchVelocityAge,
          splitBoostAge: cell.splitBoostAge,
          splitHoldAge: cell.splitHoldAge,
          pendingBoostX: cell.pendingBoostX,
          pendingBoostY: cell.pendingBoostY,
          virusCooldown: cell.virusCooldown,
          mergeVirusWindow: cell.mergeVirusWindow,
          mergeOverflowMass: cell.mergeOverflowMass,
          mergeBurstPieces: cell.mergeBurstPieces,
          mergeBurstTotal: cell.mergeBurstTotal,
          splitPriority: cell.splitPriority,
          targetX: cell.targetX,
          targetY: cell.targetY
        };
      }

      function serializeActor(actor) {
        return {
          id: actor.id,
          name: actor.name,
          color: actor.color,
          isHuman: actor.isHuman,
          localClone: Boolean(actor.localClone),
          cells: actor.cells.filter((cell) => !cell.dead).map(serializeCell)
        };
      }

      function actorNearAnyHuman(actor, range = NETWORK_RENDER_RANGE) {
        if (!actor || actor.isHuman || actor.cells.length <= 0) return actor && actor.isHuman;
        const center = actorCenter(actor);
        for (const human of state.actors) {
          if (!human.isHuman || human.cells.length <= 0) continue;
          const humanCenter = actorCenter(human);
          const dx = center.x - humanCenter.x;
          const dy = center.y - humanCenter.y;
          if (dx * dx + dy * dy <= range * range) return true;
        }
        return false;
      }

      function nearestHumanDistanceSq(x, y) {
        let best = Infinity;
        for (const human of state.actors) {
          if (!human.isHuman || human.cells.length <= 0) continue;
          const center = actorCenter(human);
          const d2 = distSq(x, y, center.x, center.y);
          if (d2 < best) best = d2;
        }
        return best;
      }

      function actorsForNetwork(sendBots) {
        const actors = [];
        const bots = [];
        for (const actor of state.actors) {
          if (actor.isHuman) {
            actors.push(actor);
            continue;
          }
          if (!sendBots) continue;
          if (!actorNearAnyHuman(actor, NETWORK_RENDER_RANGE)) continue;
          const center = actorCenter(actor);
          bots.push({ actor, d2: nearestHumanDistanceSq(center.x, center.y) });
        }
        bots.sort((a, b) => a.d2 - b.d2);
        for (const item of bots.slice(0, MAX_SYNC_BOTS)) actors.push(item.actor);
        return actors;
      }

      function serializeCircle(entity) {
        return {
          id: entity.id,
          x: entity.x,
          y: entity.y,
          mass: entity.mass,
          radius: entity.radius,
          color: entity.color,
          vx: entity.vx || 0,
          vy: entity.vy || 0,
          age: entity.age || 0,
          feedCount: entity.feedCount || 0,
          ownerId: entity.ownerId || "",
          natural: entity.natural !== false
        };
      }

      function sendAuthoritativeSnapshot(now, forceWorld = false) {
        if (state.net.role !== "host" || !state.net.connected) return;
        const sendFast = forceWorld || now - state.net.lastSnapshotSend >= HOST_SNAPSHOT_RATE;
        const sendFeeds = forceWorld || now - state.net.lastFeedSnapshotSend >= HOST_FEED_SNAPSHOT_RATE;
        const sendBots = state.settings.botEnabled && (forceWorld || now - state.net.lastBotSnapshotSend >= HOST_BOT_SNAPSHOT_RATE);
        const sendWorld = forceWorld || now - state.net.lastWorldSend >= HOST_WORLD_SYNC_RATE;
        if (!sendFast && !sendWorld) return;

        const message = {
          t: "snapshot",
          now,
          worldSize: WORLD_SIZE,
          settings: {
            splitSpeed: state.settings.splitSpeed,
            splitDecayTime: state.settings.splitDecayTime,
            splitInputSpeed: state.settings.splitInputSpeed,
            spawnMass: state.settings.spawnMass,
            gameSpeed: state.settings.gameSpeed,
            botEnabled: state.settings.botEnabled,
            nRespawnEnabled: state.settings.nRespawnEnabled
          },
          partialActors: true,
          actors: actorsForNetwork(sendBots).map(serializeActor)
        };
        const removedFeedIds = Array.from(state.net.removedFeedIds);
        if (removedFeedIds.length) message.removedFeedIds = removedFeedIds;
        const removedVirusIds = Array.from(state.net.removedVirusIds);
        if (removedVirusIds.length) message.removedVirusIds = removedVirusIds;
        const removedCells = Array.from(state.net.removedCellKeys, (key) => {
          const separator = key.lastIndexOf(":");
          return {
            ownerId: key.slice(0, separator),
            id: Number(key.slice(separator + 1))
          };
        });
        if (removedCells.length) message.removedCells = removedCells;
        if (sendFeeds) {
          message.feeds = feedsForNetworkSync().map(serializeCircle);
        }
        if (netSend(message)) {
          state.net.lastSnapshotSend = now;
          if (sendFeeds) state.net.lastFeedSnapshotSend = now;
          if (sendBots) state.net.lastBotSnapshotSend = now;
          for (const id of removedFeedIds) state.net.removedFeedIds.delete(id);
          for (const id of removedVirusIds) state.net.removedVirusIds.delete(id);
          for (const cell of removedCells) state.net.removedCellKeys.delete(`${cell.ownerId}:${cell.id}`);
        }
        if (sendWorld) {
          state.net.worldSeq += 1;
          sendWorldChunks("foods", foodsForNetworkSync().map(serializeCircle), state.net.worldSeq);
          sendWorldChunks("viruses", virusesForNetworkSync().map(serializeCircle), state.net.worldSeq);
          state.net.lastWorldSend = now;
        }
      }

      function foodsForNetworkSync() {
        if (state.foodGridDirty) rebuildFoodGridOnly();
        const liveFoods = state.foods.filter((food) => !food.dead);
        if (liveFoods.length <= MAX_SYNC_FOODS) return liveFoods;
        return networkEntitiesNearHumans(foodGrid, MAX_SYNC_FOODS, NETWORK_RENDER_RANGE);
      }

      function feedsForNetworkSync() {
        const liveFeeds = state.feeds.filter((feed) => !feed.dead);
        if (liveFeeds.length <= MAX_SYNC_FEEDS) return liveFeeds;
        return networkEntitiesNearHumans(feedGrid, MAX_SYNC_FEEDS, Math.min(NETWORK_RENDER_RANGE, 2300));
      }

      function virusesForNetworkSync() {
        const liveViruses = state.viruses.filter((virus) => !virus.dead);
        if (liveViruses.length <= MAX_SYNC_VIRUSES) return liveViruses;
        return networkEntitiesNearHumans(virusGrid, MAX_SYNC_VIRUSES, NETWORK_RENDER_RANGE);
      }

      function networkEntitiesNearHumans(grid, limit, range) {
        const byId = new Map();
        for (const actor of state.actors) {
          if (!actor || !actor.isHuman) continue;
          const center = actorCenter(actor);
          const nearby = grid.queryRect(center.x - range, center.y - range, center.x + range, center.y + range, aiEntityScratch);
          for (const item of nearby) {
            if (item.dead) continue;
            const d2 = distSq(item.x, item.y, center.x, center.y);
            const existing = byId.get(item.id);
            if (!existing || d2 < existing.d2) byId.set(item.id, { item, d2 });
          }
        }
        return Array.from(byId.values())
          .sort((a, b) => a.d2 - b.d2)
          .slice(0, limit)
          .map((entry) => entry.item);
      }

      function sendWorldChunks(kind, items, seq) {
        const total = Math.max(1, Math.ceil(items.length / WORLD_SYNC_CHUNK));
        for (let index = 0; index < total; index += 1) {
          const start = index * WORLD_SYNC_CHUNK;
          netSend({
            t: "world",
            kind,
            seq,
            index,
            total,
            items: items.slice(start, start + WORLD_SYNC_CHUNK)
          });
        }
      }

      function sendLocalInput(now) {
        if (state.net.role !== "client" || !state.net.connected || !state.player) return;
        if (state.spectating) return;
        const activeActorId = state.input.activeActorId || state.player.id;
        const activeActor = actorById(activeActorId) || state.player;
        const inputActor = activeActor && activeActor.input ? activeActor : state.player;
        const pendingRemoteActor = activeActorId !== state.player.id && activeActor === state.player;
        const targetX = pendingRemoteActor ? state.input.mouseWorldX : (Number.isFinite(inputActor.input.targetX) ? inputActor.input.targetX : state.input.mouseWorldX);
        const targetY = pendingRemoteActor ? state.input.mouseWorldY : (Number.isFinite(inputActor.input.targetY) ? inputActor.input.targetY : state.input.mouseWorldY);
        const urgent = inputActor.input.splitQueued || inputActor.input.ejectQueued || state.input.respawnQueued || state.input.cloneQueued;
        if (!urgent && now - state.net.lastInputSend < CLIENT_INPUT_SEND_RATE) return;
        netSend({
          t: "input",
          activeActorId,
          targetX,
          targetY,
          e: actorAutoEjectHeld(inputActor),
          ejectSeq: state.input.ejectSeq,
          splitSeq: state.input.splitSeq,
          splitCount: state.input.splitBurstCount || Math.max(1, inputActor.input.splitCount || 1),
          respawnSeq: state.input.respawnSeq,
          cloneSeq: state.input.cloneSeq
        });
        inputActor.input.ejectQueued = false;
        inputActor.input.splitQueued = false;
        inputActor.input.splitCount = 0;
        state.input.splitBurstCount = 0;
        if (inputActor !== state.player) {
          state.player.input.ejectQueued = false;
          state.player.input.splitQueued = false;
          state.player.input.splitCount = 0;
        }
        state.input.respawnQueued = false;
        state.input.cloneQueued = false;
        state.net.lastInputSend = now;
      }

      function processClientNetworkUpdates() {
        const chunks = state.net.pendingWorldChunks;
        for (let i = 0; i < CLIENT_WORLD_CHUNKS_PER_FRAME && chunks.length; i += 1) {
          applyWorldChunk(chunks.shift());
        }
        if (state.net.pendingSnapshot) {
          const snapshot = state.net.pendingSnapshot;
          state.net.pendingSnapshot = null;
          applySnapshot(snapshot);
        }
      }

      function updateRenderPosition(entity, dt, followRate = 18) {
        if (!Number.isFinite(entity.renderX)) entity.renderX = entity.x;
        if (!Number.isFinite(entity.renderY)) entity.renderY = entity.y;
        const speed = Math.hypot((entity.vx || 0) + (entity.boostX || 0), (entity.vy || 0) + (entity.boostY || 0));
        const lead = entity.splitBoostAge > 0 ? Math.min(0.12, dt * 4) : Math.min(0.08, dt * 2);
        const targetX = clamp(entity.x + ((entity.vx || 0) + (entity.boostX || 0)) * lead, 0, WORLD_SIZE);
        const targetY = clamp(entity.y + ((entity.vy || 0) + (entity.boostY || 0)) * lead, 0, WORLD_SIZE);
        if (entity.splitBoostAge > 0 && speed > 220) followRate = Math.max(followRate, 30);
        const follow = 1 - Math.exp(-dt * followRate);
        entity.renderX += (targetX - entity.renderX) * follow;
        entity.renderY += (targetY - entity.renderY) * follow;
      }

      function updateCellRenderRadii(dt) {
        for (const actor of state.actors) {
          for (const cell of actor.cells) updateRenderRadius(cell, dt);
        }
      }

      function updateClientRenderState(dt) {
        predictClientCellMotion(dt);
        for (const actor of state.actors) {
          for (const cell of actor.cells) updateRenderPosition(cell, dt, 20);
        }
        updateCellRenderRadii(dt);
        for (const feed of state.feeds) updateRenderPosition(feed, dt, 14);
        for (const virus of state.viruses) updateRenderPosition(virus, dt, 10);
      }

      function predictClientCellMotion(dt) {
        for (const actor of state.actors) {
          if (!isLocalViewActor(actor) && actor.control !== "bot") continue;
          for (const cell of actor.cells) {
            if (cell.splitHoldAge > 0) {
              cell.splitHoldAge = Math.max(0, cell.splitHoldAge - dt);
              if (cell.splitHoldAge <= 0) {
                cell.boostX += cell.pendingBoostX || 0;
                cell.boostY += cell.pendingBoostY || 0;
                cell.pendingBoostX = 0;
                cell.pendingBoostY = 0;
              }
            }
            const boostSpeed = Math.hypot(cell.boostX || 0, cell.boostY || 0);
            const predictScale = actor.control === "bot" ? 0.62 : 1;
            cell.x += ((cell.vx || 0) + (cell.boostX || 0)) * dt * predictScale;
            cell.y += ((cell.vy || 0) + (cell.boostY || 0)) * dt * predictScale;
            clampCellToWorld(cell);
            if (boostSpeed > 0.02) {
              const decayRate = cell.splitBoostAge > 0 || boostSpeed > 30
                ? SPLIT_BOOST_DECAY / Math.max(0.1, state.settings.splitDecayTime)
                : 3.7;
              const decay = Math.exp(-dt * decayRate);
              cell.boostX *= decay;
              cell.boostY *= decay;
            }
            if (cell.splitBoostAge > 0) cell.splitBoostAge = Math.max(0, cell.splitBoostAge - dt);
          }
        }
      }

      function handleNetMessage(data) {
        let message = null;
        try {
          message = JSON.parse(data);
        } catch (error) {
          return;
        }

        if (state.net.role === "host" && message.t === "input") {
          const guest = actorById("guest");
          if (!guest) return;
          let urgentInput = false;
          const cloneSeq = Number(message.cloneSeq) || 0;
          let guestClone = remoteCloneActor("guest");
          if (cloneSeq > guest.input.lastNetCloneSeq) {
            guestClone = handleRemoteCloneToggle(guest);
            guest.input.lastNetCloneSeq = cloneSeq;
            urgentInput = true;
          }

          const requestedActorId = typeof message.activeActorId === "string" ? message.activeActorId : "guest";
          guestClone = remoteCloneActor("guest");
          let activeGuest = requestedActorId === localCloneId("guest") && guestClone ? guestClone : guest;
          if (liveCellCount(activeGuest) <= 0 && liveCellCount(guest) > 0) activeGuest = guest;
          if (liveCellCount(activeGuest) <= 0 && guestClone && liveCellCount(guestClone) > 0) activeGuest = guestClone;
          for (const actor of [guest, guestClone]) {
            if (actor && actor !== activeGuest) clearActorControlInput(actor, true);
          }

          activeGuest.input.targetX = clamp(Number(message.targetX) || WORLD_SIZE * 0.5, 0, WORLD_SIZE);
          activeGuest.input.targetY = clamp(Number(message.targetY) || WORLD_SIZE * 0.5, 0, WORLD_SIZE);
          if (message.e) activeGuest.input.keys.add(remoteAutoEjectKey);
          else activeGuest.input.keys.delete(remoteAutoEjectKey);
          const ejectSeq = Number(message.ejectSeq) || 0;
          if (ejectSeq > guest.input.lastNetEjectSeq) {
            activeGuest.input.ejectQueued = true;
            guest.input.lastNetEjectSeq = ejectSeq;
            urgentInput = true;
          }
          const splitSeq = Number(message.splitSeq) || 0;
          if (splitSeq > guest.input.lastNetSplitSeq) {
            const splitCount = clamp(Math.round(Number(message.splitCount) || (splitSeq - guest.input.lastNetSplitSeq)), 1, 4);
            activeGuest.input.splitQueued = true;
            activeGuest.input.splitCount += splitCount;
            guest.input.lastNetSplitSeq = splitSeq;
            urgentInput = true;
          }
          const respawnSeq = Number(message.respawnSeq) || 0;
          if (respawnSeq > guest.input.lastNetRespawnSeq) {
            if (state.settings.nRespawnEnabled) {
              spawnActor(activeGuest, playerSpawnMass());
            }
            guest.input.lastNetRespawnSeq = respawnSeq;
            urgentInput = true;
          }
          if (urgentInput) state.net.lastSnapshotSend = -100;
          return;
        }

        if (state.net.role === "client" && message.t === "splitEvent" && message.actor) {
          const actor = applyActorSnapshot(message.actor);
          if (!state.actors.includes(actor)) state.actors.push(actor);
          if (isLocalControlledActorId(actor.id) && actor.id === state.input.activeActorId) state.player = actor;
          updateClientRenderState(1 / 60);
          return;
        }

        if (state.net.role === "client" && message.t === "snapshot") {
          state.net.pendingSnapshot = message;
          return;
        }

        if (state.net.role === "client" && message.t === "world") {
          state.net.pendingWorldChunks.push(message);
          if (state.net.pendingWorldChunks.length > CLIENT_WORLD_QUEUE_LIMIT) {
            state.net.pendingWorldChunks.splice(0, state.net.pendingWorldChunks.length - CLIENT_WORLD_QUEUE_LIMIT);
          }
        }
      }

      function applyCellSnapshot(actor, data, existing = null) {
        const cell = existing || {};
        cell.id = data.id;
        cell.actor = actor;
        cell.ownerId = actor.id;
        cell.x = clamp(data.x, 0, WORLD_SIZE);
        cell.y = clamp(data.y, 0, WORLD_SIZE);
        cell.mass = Math.max(MIN_CELL_MASS, data.mass);
        cell.radius = 1;
        cell.vx = data.vx || 0;
        cell.vy = data.vy || 0;
        cell.boostX = data.boostX || 0;
        cell.boostY = data.boostY || 0;
        const face = normalized(
          data.faceX == null ? (Number.isFinite(existing?.faceX) ? existing.faceX : 1) : data.faceX,
          data.faceY == null ? (Number.isFinite(existing?.faceY) ? existing.faceY : 0) : data.faceY,
          1,
          0
        );
        cell.faceX = face.x;
        cell.faceY = face.y;
        cell.sweepActive = false;
        cell.sweepPoints = null;
        cell.sweepFromX = cell.x;
        cell.sweepFromY = cell.y;
        cell.sweepToX = cell.x;
        cell.sweepToY = cell.y;
        cell.renderX = Number.isFinite(existing?.renderX) ? existing.renderX : cell.x;
        cell.renderY = Number.isFinite(existing?.renderY) ? existing.renderY : cell.y;
        cell.renderRadius = Number.isFinite(existing?.renderRadius) ? existing.renderRadius : radiusFromMass(cell.mass);
        cell.radiusAnimFrom = Number.isFinite(existing?.radiusAnimFrom) ? existing.radiusAnimFrom : cell.renderRadius;
        cell.radiusAnimTo = Number.isFinite(existing?.radiusAnimTo) ? existing.radiusAnimTo : cell.renderRadius;
        cell.radiusAnimAge = Number.isFinite(existing?.radiusAnimAge) ? existing.radiusAnimAge : 0;
        cell.cooldown = 0;
        cell.mergeReadyAt = data.mergeReadyAt || 0;
        cell.capFramesLeft = data.capFramesLeft || 0;
        cell.birthAge = data.birthAge == null ? 1 : data.birthAge;
        cell.birthDuration = data.birthDuration || 0;
        cell.birthX = data.birthX == null ? data.x : data.birthX;
        cell.birthY = data.birthY == null ? data.y : data.birthY;
        cell.birthScale = data.birthScale == null ? 1 : data.birthScale;
        cell.fragmentAge = data.fragmentAge || 0;
        cell.launchVelocityAge = data.launchVelocityAge || 0;
        cell.splitBoostAge = data.splitBoostAge || 0;
        cell.splitHoldAge = data.splitHoldAge || 0;
        cell.pendingBoostX = data.pendingBoostX || 0;
        cell.pendingBoostY = data.pendingBoostY || 0;
        cell.virusCooldown = data.virusCooldown || 0;
        cell.mergeVirusWindow = data.mergeVirusWindow || 0;
        cell.mergeOverflowMass = data.mergeOverflowMass || 0;
        cell.mergeBurstPieces = data.mergeBurstPieces || 1;
        cell.mergeBurstTotal = data.mergeBurstTotal || data.mass;
        cell.splitPriority = data.splitPriority || existing?.splitPriority || 0;
        cell.targetX = data.targetX == null ? data.x : data.targetX;
        cell.targetY = data.targetY == null ? data.y : data.targetY;
        cell.dead = false;
        refreshCell(cell);
        return cell;
      }

      function applyActorSnapshot(data) {
        const isLocalControlled = isLocalControlledActorId(data.id);
        let actor = actorById(data.id);
        if (!actor) {
          actor = createActor(
            data.id,
            data.name || data.id,
            data.color || "#2e90fa",
            Boolean(data.isHuman),
            isLocalControlled ? "local" : (data.isHuman ? "remote" : "bot")
          );
        }
        actor.name = data.name || actor.name;
        actor.color = data.color || actor.color;
        actor.isHuman = Boolean(data.isHuman);
        actor.localClone = Boolean(data.localClone);
        actor.control = isLocalControlled ? "local" : (actor.isHuman ? "remote" : "bot");
        if (isLocalControlled && actor.cells.length > 0 && (!Array.isArray(data.cells) || data.cells.length === 0)) {
          actor.netSeenAt = state.realNow || performance.now() / 1000;
          return actor;
        }
        const cellsById = new Map(actor.cells.map((cell) => [cell.id, cell]));
        actor.cells = (data.cells || []).map((cellData) => applyCellSnapshot(actor, cellData, cellsById.get(cellData.id)));
        refreshNextSplitPriority(actor);
        actor.netSeenAt = state.realNow || performance.now() / 1000;
        return actor;
      }

      function applyEntitySnapshot(data, type, existing = null) {
        return {
          id: data.id,
          type,
          x: clamp(data.x, 0, WORLD_SIZE),
          y: clamp(data.y, 0, WORLD_SIZE),
          mass: Math.max(type === "food" ? 1 : MIN_CELL_MASS, data.mass),
          radius: data.radius || radiusFromMass(data.mass),
          color: data.color || (type === "virus" ? "#12e05a" : foodPalette[0]),
          vx: data.vx || 0,
          vy: data.vy || 0,
          age: data.age || 0,
          feedCount: data.feedCount || 0,
          ownerId: data.ownerId || "",
          natural: type === "virus" ? data.natural !== false : false,
          renderX: Number.isFinite(existing?.renderX) ? existing.renderX : clamp(data.x, 0, WORLD_SIZE),
          renderY: Number.isFinite(existing?.renderY) ? existing.renderY : clamp(data.y, 0, WORLD_SIZE),
          netSeenAt: existing?.netSeenAt || 0,
          dead: false
        };
      }

      function applyEntityListSnapshot(items, type, existingList) {
        const byId = new Map(existingList.map((entity) => [entity.id, entity]));
        return (items || []).map((entity) => applyEntitySnapshot(entity, type, byId.get(entity.id)));
      }

      function mergeEntityListSnapshot(items, type, existingList, maxAge = 4) {
        const now = state.realNow || performance.now() / 1000;
        const byId = new Map(existingList.map((entity) => [entity.id, entity]));
        for (const item of items || []) {
          const next = applyEntitySnapshot(item, type, byId.get(item.id));
          next.netSeenAt = now;
          byId.set(item.id, next);
        }
        return Array.from(byId.values()).filter((entity) => now - (entity.netSeenAt == null ? 0 : entity.netSeenAt) <= maxAge);
      }

      function mergeActorListSnapshot(items, existingList) {
        const now = state.realNow || performance.now() / 1000;
        const incoming = (items || []).map(applyActorSnapshot);
        const byId = new Map(existingList.map((actor) => [actor.id, actor]));
        for (const actor of incoming) byId.set(actor.id, actor);
        return Array.from(byId.values()).filter((actor) => actor.isHuman || now - (actor.netSeenAt == null ? 0 : actor.netSeenAt) <= 12);
      }

      function removeEntityIds(existingList, ids) {
        if (!ids || !ids.length) return existingList;
        const removed = new Set(ids);
        return existingList.filter((entity) => !removed.has(entity.id));
      }

      function removeCellsFromActors(actors, removedCells) {
        if (!removedCells || !removedCells.length) return actors;
        const removed = new Set(removedCells.map((cell) => `${cell.ownerId}:${cell.id}`));
        for (const actor of actors) {
          actor.cells = actor.cells.filter((cell) => !removed.has(`${actor.id}:${cell.id}`));
        }
        return actors.filter((actor) => actor.isHuman || actor.cells.length > 0);
      }

      function rememberRemovedIds(cache, ids, maxSize = 4000) {
        if (!ids || !ids.length) return;
        for (const id of ids) cache.add(id);
        if (cache.size <= maxSize) return;
        const overflow = cache.size - maxSize;
        let removed = 0;
        for (const id of cache) {
          cache.delete(id);
          removed += 1;
          if (removed >= overflow) break;
        }
      }

      function applySnapshot(message) {
        if (message.worldSize) {
          const incomingWorldSize = Math.max(2000, Math.round(Number(message.worldSize) / 100) * 100);
          const previousMax = state.settings.max.worldSize;
          state.settings.max.worldSize = Math.max(previousMax, incomingWorldSize);
          const nextWorldSize = clamp(incomingWorldSize, 2000, state.settings.max.worldSize);
          const worldChanged = nextWorldSize !== state.settings.worldSize || nextWorldSize !== WORLD_SIZE;
          if (worldChanged) {
            state.settings.worldSize = nextWorldSize;
            clampWorldEntities();
          }
          if (worldChanged || state.settings.max.worldSize !== previousMax) syncSettingsControls();
        }
        if (message.settings) {
          let settingsChanged = false;
          if (Number.isFinite(message.settings.splitSpeed)) {
            const nextMax = Math.max(state.settings.max.splitSpeed, message.settings.splitSpeed);
            const nextValue = clamp(message.settings.splitSpeed, 10, nextMax);
            settingsChanged = settingsChanged || nextMax !== state.settings.max.splitSpeed || nextValue !== state.settings.splitSpeed;
            state.settings.max.splitSpeed = nextMax;
            state.settings.splitSpeed = nextValue;
          }
          if (Number.isFinite(message.settings.splitDecayTime)) {
            const nextMax = Math.max(state.settings.max.splitDecayTime, message.settings.splitDecayTime);
            const nextValue = clamp(Math.round(message.settings.splitDecayTime * 10) / 10, state.settings.min.splitDecayTime, nextMax);
            settingsChanged = settingsChanged || nextMax !== state.settings.max.splitDecayTime || nextValue !== state.settings.splitDecayTime;
            state.settings.max.splitDecayTime = nextMax;
            state.settings.splitDecayTime = nextValue;
          }
          if (Number.isFinite(message.settings.splitInputSpeed)) {
            const nextMax = Math.max(state.settings.max.splitInputSpeed, message.settings.splitInputSpeed);
            const nextValue = clamp(Math.round(message.settings.splitInputSpeed / 10) * 10, state.settings.min.splitInputSpeed, nextMax);
            settingsChanged = settingsChanged || nextMax !== state.settings.max.splitInputSpeed || nextValue !== state.settings.splitInputSpeed;
            state.settings.max.splitInputSpeed = nextMax;
            state.settings.splitInputSpeed = nextValue;
          }
          if (Number.isFinite(message.settings.spawnMass)) {
            const nextMax = Math.max(state.settings.max.spawnMass, message.settings.spawnMass);
            const nextValue = clamp(message.settings.spawnMass, MIN_CELL_MASS, nextMax);
            settingsChanged = settingsChanged || nextMax !== state.settings.max.spawnMass || nextValue !== state.settings.spawnMass;
            state.settings.max.spawnMass = nextMax;
            state.settings.spawnMass = nextValue;
          }
          if (Number.isFinite(message.settings.gameSpeed)) {
            const nextMax = Math.max(state.settings.max.gameSpeed, message.settings.gameSpeed);
            const nextValue = clamp(message.settings.gameSpeed, 0.1, nextMax);
            settingsChanged = settingsChanged || nextMax !== state.settings.max.gameSpeed || nextValue !== state.settings.gameSpeed;
            state.settings.max.gameSpeed = nextMax;
            state.settings.gameSpeed = nextValue;
          }
          if (message.settings.nRespawnEnabled != null) {
            const nextValue = Boolean(message.settings.nRespawnEnabled);
            settingsChanged = settingsChanged || nextValue !== state.settings.nRespawnEnabled;
            state.settings.nRespawnEnabled = nextValue;
          }
          if (message.settings.botEnabled != null) {
            const nextValue = Boolean(message.settings.botEnabled);
            settingsChanged = settingsChanged || nextValue !== state.settings.botEnabled;
            state.settings.botEnabled = nextValue;
          }
          if (settingsChanged) syncSettingsControls();
        }
        state.actors = mergeActorListSnapshot(message.actors || [], state.actors);
        if (!state.settings.botEnabled) state.actors = state.actors.filter((actor) => actor.isHuman);
        if (Array.isArray(message.removedCells)) {
          state.actors = removeCellsFromActors(state.actors, message.removedCells);
        }
        const actors = state.actors;
        const activeActor = actorById(state.input.activeActorId);
        state.player = activeActor && activeActor.control === "local"
          ? activeActor
          : actorById(state.localActorId) || actors[0] || state.player;
        syncClientLifeState();

        if (Array.isArray(message.removedFeedIds)) {
          state.feeds = removeEntityIds(state.feeds, message.removedFeedIds);
          rememberRemovedIds(state.net.clientRemovedFeedIds, message.removedFeedIds);
        }
        if (Array.isArray(message.removedVirusIds)) {
          state.viruses = removeEntityIds(state.viruses, message.removedVirusIds);
          for (const id of message.removedVirusIds) state.net.clientRemovedVirusIds.add(id);
        }
        if (Array.isArray(message.feeds)) {
          state.feeds = mergeEntityListSnapshot(
            message.feeds.filter((feed) => !state.net.clientRemovedFeedIds.has(feed.id)),
            "feed",
            state.feeds,
            10
          );
        }
      }

      function applyWorldChunk(message) {
        if (message.kind !== "foods" && message.kind !== "viruses") return;
        if (!state.net.worldBuffer || state.net.worldBuffer.seq !== message.seq) {
          state.net.worldBuffer = {
            seq: message.seq,
            foods: new Map(),
            viruses: new Map()
          };
        }

        const bucket = state.net.worldBuffer[message.kind];
        bucket.set(message.index, message.items || []);
        if (bucket.size < message.total) return;

        const merged = [];
        for (let index = 0; index < message.total; index += 1) {
          const chunk = bucket.get(index);
          if (!chunk) return;
          merged.push(...chunk);
        }

        if (message.kind === "foods") {
          state.foods = applyEntityListSnapshot(merged, "food", state.foods);
          state.foodGridDirty = true;
          rebuildFoodGridOnly();
        } else {
          state.viruses = applyEntityListSnapshot(
            merged.filter((virus) => !state.net.clientRemovedVirusIds.has(virus.id)),
            "virus",
            state.viruses
          );
        }
      }
