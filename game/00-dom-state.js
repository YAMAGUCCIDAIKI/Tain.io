// DOM参照、定数、ゲーム全体の状態オブジェクトを定義します。
﻿    (() => {
      "use strict";

      const canvas = document.getElementById("game");
      const ctx = canvas.getContext("2d", { alpha: true });
      const massEl = document.getElementById("mass");
      const cellsEl = document.getElementById("cells");
      const fpsEl = document.getElementById("fps");
      const versionEl = document.getElementById("version");
      const scoreboardEl = document.getElementById("scoreboard");
      const flashEl = document.getElementById("flash");
      const menuBtn = document.getElementById("menuBtn");
      const playBtn = document.getElementById("playBtn");
      const nameBox = document.getElementById("nameBox");
      const cloneNameBox = document.getElementById("cloneNameBox");
      const menuTabButtons = Array.from(document.querySelectorAll("[data-menu-page]"));
      const menuPagePanels = Array.from(document.querySelectorAll("[data-menu-page-panel]"));
      const onlineStatusEl = document.getElementById("onlineStatus");
      const hostBtn = document.getElementById("hostBtn");
      const joinBtn = document.getElementById("joinBtn");
      const applyAnswerBtn = document.getElementById("applyAnswerBtn");
      const disconnectBtn = document.getElementById("disconnectBtn");
      const relayHostBtn = document.getElementById("relayHostBtn");
      const relayJoinBtn = document.getElementById("relayJoinBtn");
      const spectateBtn = document.getElementById("spectateBtn");
      const serverUrlBox = document.getElementById("serverUrlBox");
      const roomBox = document.getElementById("roomBox");
      const offerBox = document.getElementById("offerBox");
      const answerBox = document.getElementById("answerBox");
      const viewValueEl = document.getElementById("viewValue");
      const gameResetBtn = document.getElementById("gameResetBtn");
      const cursorLineToggle = document.getElementById("cursorLineToggle");
      const cursorLineValueEl = document.getElementById("cursorLineValue");
      const nRespawnToggle = document.getElementById("nRespawnToggle");
      const nRespawnValueEl = document.getElementById("nRespawnValue");
      const activeColorToggle = document.getElementById("activeColorToggle");
      const activeColorValueEl = document.getElementById("activeColorValue");
      const otherMassToggle = document.getElementById("otherMassToggle");
      const otherMassValueEl = document.getElementById("otherMassValue");
      const ownMassToggle = document.getElementById("ownMassToggle");
      const ownMassValueEl = document.getElementById("ownMassValue");
      const botEnabledToggle = document.getElementById("botEnabledToggle");
      const botEnabledValueEl = document.getElementById("botEnabledValue");
      const botSlider = document.getElementById("botSlider");
      const botValueEl = document.getElementById("botValue");
      const botMinBox = document.getElementById("botMinBox");
      const botMaxBox = document.getElementById("botMaxBox");
      const botSpawnMassSlider = document.getElementById("botSpawnMassSlider");
      const botSpawnMassValueEl = document.getElementById("botSpawnMassValue");
      const botSpawnMassMinBox = document.getElementById("botSpawnMassMinBox");
      const botSpawnMassMaxBox = document.getElementById("botSpawnMassMaxBox");
      const botEjectRateSlider = document.getElementById("botEjectRateSlider");
      const botEjectRateValueEl = document.getElementById("botEjectRateValue");
      const botEjectRateMinBox = document.getElementById("botEjectRateMinBox");
      const botEjectRateMaxBox = document.getElementById("botEjectRateMaxBox");
      const botModeSelect = document.getElementById("botModeSelect");
      const virusSlider = document.getElementById("virusSlider");
      const virusValueEl = document.getElementById("virusValue");
      const virusMinBox = document.getElementById("virusMinBox");
      const virusMaxBox = document.getElementById("virusMaxBox");
      const foodSlider = document.getElementById("foodSlider");
      const foodValueEl = document.getElementById("foodValue");
      const foodMinBox = document.getElementById("foodMinBox");
      const foodMaxBox = document.getElementById("foodMaxBox");
      const spawnMassSlider = document.getElementById("spawnMassSlider");
      const spawnMassValueEl = document.getElementById("spawnMassValue");
      const spawnMassMinBox = document.getElementById("spawnMassMinBox");
      const spawnMassMaxBox = document.getElementById("spawnMassMaxBox");
      const ejectMassSlider = document.getElementById("ejectMassSlider");
      const ejectMassValueEl = document.getElementById("ejectMassValue");
      const ejectMassMinBox = document.getElementById("ejectMassMinBox");
      const ejectMassMaxBox = document.getElementById("ejectMassMaxBox");
      const ejectSpeedSlider = document.getElementById("ejectSpeedSlider");
      const ejectSpeedValueEl = document.getElementById("ejectSpeedValue");
      const ejectSpeedMinBox = document.getElementById("ejectSpeedMinBox");
      const ejectSpeedMaxBox = document.getElementById("ejectSpeedMaxBox");
      const ejectRateSlider = document.getElementById("ejectRateSlider");
      const ejectRateValueEl = document.getElementById("ejectRateValue");
      const ejectRateMinBox = document.getElementById("ejectRateMinBox");
      const ejectRateMaxBox = document.getElementById("ejectRateMaxBox");
      const splitRecoilSlider = document.getElementById("splitRecoilSlider");
      const splitRecoilValueEl = document.getElementById("splitRecoilValue");
      const splitRecoilMinBox = document.getElementById("splitRecoilMinBox");
      const splitRecoilMaxBox = document.getElementById("splitRecoilMaxBox");
      const splitSpeedSlider = document.getElementById("splitSpeedSlider");
      const splitSpeedValueEl = document.getElementById("splitSpeedValue");
      const splitSpeedMinBox = document.getElementById("splitSpeedMinBox");
      const splitSpeedMaxBox = document.getElementById("splitSpeedMaxBox");
      const splitDecayTimeSlider = document.getElementById("splitDecayTimeSlider");
      const splitDecayTimeValueEl = document.getElementById("splitDecayTimeValue");
      const splitDecayTimeMinBox = document.getElementById("splitDecayTimeMinBox");
      const splitDecayTimeMaxBox = document.getElementById("splitDecayTimeMaxBox");
      const splitInputSpeedSlider = document.getElementById("splitInputSpeedSlider");
      const splitInputSpeedValueEl = document.getElementById("splitInputSpeedValue");
      const splitInputSpeedMinBox = document.getElementById("splitInputSpeedMinBox");
      const splitInputSpeedMaxBox = document.getElementById("splitInputSpeedMaxBox");
      const gameSpeedSlider = document.getElementById("gameSpeedSlider");
      const gameSpeedValueEl = document.getElementById("gameSpeedValue");
      const gameSpeedMinBox = document.getElementById("gameSpeedMinBox");
      const gameSpeedMaxBox = document.getElementById("gameSpeedMaxBox");
      const renderRangeSlider = document.getElementById("renderRangeSlider");
      const renderRangeValueEl = document.getElementById("renderRangeValue");
      const renderRangeMinBox = document.getElementById("renderRangeMinBox");
      const renderRangeMaxBox = document.getElementById("renderRangeMaxBox");
      const mergeCooldownSlider = document.getElementById("mergeCooldownSlider");
      const mergeCooldownValueEl = document.getElementById("mergeCooldownValue");
      const mergeCooldownMinBox = document.getElementById("mergeCooldownMinBox");
      const mergeCooldownMaxBox = document.getElementById("mergeCooldownMaxBox");
      const mergeCancelCooldownSlider = document.getElementById("mergeCancelCooldownSlider");
      const mergeCancelCooldownValueEl = document.getElementById("mergeCancelCooldownValue");
      const mergeCancelCooldownMinBox = document.getElementById("mergeCancelCooldownMinBox");
      const mergeCancelCooldownMaxBox = document.getElementById("mergeCancelCooldownMaxBox");
      const worldSizeSlider = document.getElementById("worldSizeSlider");
      const worldSizeValueEl = document.getElementById("worldSizeValue");
      const worldSizeMinBox = document.getElementById("worldSizeMinBox");
      const worldSizeMaxBox = document.getElementById("worldSizeMaxBox");
      const keyBindButtons = Array.from(document.querySelectorAll("[data-keybind]"));

      const externalData = window.TAIN_DATA || {};
      const TAU = Math.PI * 2;
      const APP_VERSION = externalData.APP_VERSION || "v2026.05.12.14";
      let WORLD_SIZE = 5000;
      const GRID_SMALL = 50;
      const GRID_LARGE = 250;
      const MAX_CELLS = 16;
      const MAX_CELL_MASS = 22500;
      const MAX_MERGE_VIRUS_HIT_MASS = MAX_CELL_MASS * 2;
      const UNCONSUMABLE_CELL_MASS = 16900;
      const MIN_CELL_MASS = 12;
      const MIN_SPLIT_SOURCE_MASS = 36;
      const MIN_EJECT_SOURCE_MASS = 32;
      const VIRUS_MASS = 100;
      const VIRUS_EXPLODE_MASS = 133;
      const DEFAULT_EJECT_MASS = 21;
      const DEFAULT_EJECT_SPEED = 710;
      const DEFAULT_EJECT_RATE = 11;
      const MAX_EJECT_RATE = 10000;
      const MAX_EJECT_BURSTS_PER_FRAME = 512;
      const DEFAULT_SPAWN_MASS = 132;
      const DEFAULT_FOOD_TARGET = 1200;
      const DEFAULT_VIRUS_TARGET = 36;
      const DEFAULT_BOT_COUNT = 100;
      const DEFAULT_SPLIT_RECOIL = 0;
      const DEFAULT_SPLIT_SPEED = 110;
      const DEFAULT_SPLIT_DECAY_TIME = 0.7;
      const DEFAULT_SPLIT_INPUT_SPEED = 0;
      const DEFAULT_GAME_SPEED = 1;
      const DEFAULT_RENDER_RANGE = 65;
      const DEFAULT_MERGE_COOLDOWN = 30;
      const BOT_SPAWN_MASS = 132;
      const CONSUME_MASS_RATIO = 1.325;
      const CONSUME_RADIUS_RATIO = Math.sqrt(CONSUME_MASS_RATIO);
      const MASS_DECAY_PER_SECOND = 0.002;
      const MASS_CAP_SETTLE_FRAMES = 10;
      const VIRUS_FEED_LIMIT = 7;
      const VIRUS_RESPAWN_DELAY = 0.5;
      const BOT_AI_SCAN_RANGE = 1050;
      const VIRUS_CORE_SPLIT_MASS = 700;
      const VIRUS_FRAGMENT_LIFE = 2.8;
      const MAX_CELL_SPREAD = 2400;
      const WORLD_SYNC_CHUNK = 300;
      const MAX_SYNC_FOODS = 1800;
      const MAX_SYNC_FEEDS = 520;
      const MAX_SYNC_VIRUSES = 600;
      const MAX_SYNC_BOTS = 120;
      const NETWORK_RENDER_RANGE = 2600;
      const CLIENT_WORLD_CHUNKS_PER_FRAME = 4;
      const CLIENT_WORLD_QUEUE_LIMIT = 40;
      const MAX_FOOD_SPAWNS_PER_FRAME = 80;
      const MAX_VIRUS_SPAWNS_PER_FRAME = 8;
      const RENDER_SIMPLE_CELL_COUNT = 280;
      const RENDER_FAST_CELL_COUNT = 480;
      const FOOD_AVOID_LIMIT = 2400;
      const DEFAULT_VIEW_SCALE = 1;
      const TARGET_FPS = 256;
      const TARGET_FRAME_TIME = 1 / TARGET_FPS;
      const CLIENT_INPUT_SEND_RATE = 1 / TARGET_FPS;
      const HOST_SNAPSHOT_RATE = 1 / 60;
      const HOST_FEED_SNAPSHOT_RATE = 1 / 12;
      const HOST_BOT_SNAPSHOT_RATE = 1 / 15;
      const HOST_WORLD_SYNC_RATE = 2.0;
      const GAMEPLAY_SPEED_SCALE = 0.6;
      const CELL_MOVE_SPEED_SCALE = 0.52 * GAMEPLAY_SPEED_SCALE;
      const SPLIT_LAUNCH_SPEED_SCALE = GAMEPLAY_SPEED_SCALE;
      const VIRUS_BURST_SPEED_SCALE = GAMEPLAY_SPEED_SCALE;
      const MERGE_CAP_OVERSIZE_RATIO = 1.04;
      const EATEN_CELL_RESTORE_WINDOW = 0.55;
      const SPLIT_BOOST_DURATION = 0.08;
      const SPLIT_BOOST_DECAY = 0.82;
      const SPLIT_MAX_BOOST = 560;
      const SPLIT_SPAWN_OFFSET_RATIO = 0.42;
      const SPLIT_SPREAD_ALLOWANCE = 900;
      const SPLIT_CATCH_MOMENTUM_SCALE = 0.88;
      const SPLIT_RECOIL_COOLDOWN = 0.22;
      const SPLIT_HOLD_DURATION = 0.035;
      const MAX_QUEUED_SPLITS_PER_FRAME = 4;
      const ACTIVE_CONTROL_COLOR = "#fff200";
      const ACTIVE_CONTROL_STROKE = "#111827";

      const foodPalette = [...(externalData.foodPalette || [])];
      const playerPalette = [...(externalData.playerPalette || [])];
      const botPalette = [...(externalData.botPalette || [])];

      const defaultKeyBindings = { ...(externalData.defaultKeyBindings || {}) };

      const remoteAutoEjectKey = "__remoteAutoEject";
      const LOCAL_PREFS_KEY = "agarCanvasLocalPreferences:v2";

      const state = {
        width: 1,
        height: 1,
        dpr: 1,
        now: 0,
        realNow: 0,
        simTime: 0,
        frameIndex: 0,
        lastFrame: performance.now(),
        fps: TARGET_FPS,
        fpsSample: TARGET_FPS,
        fpsTimer: 0,
        lastRenderMode: 0,
        nextId: 1,
        nextBotIndex: 0,
        player: null,
        localActorId: "player",
        localCloneIndex: 0,
        menuOpen: true,
        keyCaptureAction: null,
        keyBindings: { ...defaultKeyBindings },
        actors: [],
        foods: [],
        feeds: [],
        viruses: [],
        virusRespawnQueue: [],
        camera: {
          x: WORLD_SIZE * 0.5,
          y: WORLD_SIZE * 0.5,
          zoom: 0.86
        },
        viewScale: DEFAULT_VIEW_SCALE,
        spectating: false,
        spectatorMode: "leader",
        waitingForPlay: true,
        clientPlayRequestUntil: 0,
        profile: {
          name: "YOU",
          cloneName: "YOU2"
        },
        settings: {
          botEnabled: true,
          botTarget: DEFAULT_BOT_COUNT,
          botMode: "hunt",
          botSpawnMass: BOT_SPAWN_MASS,
          botEjectRate: DEFAULT_EJECT_RATE,
          virusTarget: DEFAULT_VIRUS_TARGET,
          foodTarget: DEFAULT_FOOD_TARGET,
          spawnMass: DEFAULT_SPAWN_MASS,
          ejectMass: DEFAULT_EJECT_MASS,
          ejectSpeed: DEFAULT_EJECT_SPEED,
          ejectRate: DEFAULT_EJECT_RATE,
          splitRecoil: DEFAULT_SPLIT_RECOIL,
          splitSpeed: DEFAULT_SPLIT_SPEED,
          splitDecayTime: DEFAULT_SPLIT_DECAY_TIME,
          splitInputSpeed: DEFAULT_SPLIT_INPUT_SPEED,
          gameSpeed: DEFAULT_GAME_SPEED,
          renderRange: DEFAULT_RENDER_RANGE,
          mergeCooldown: DEFAULT_MERGE_COOLDOWN,
          mergeCancelCooldown: 3,
          worldSize: WORLD_SIZE,
          cursorLine: true,
          nRespawnEnabled: true,
          activeColorHighlight: true,
          showOtherMass: false,
          showOwnMass: true,
          min: {
            bot: 0,
            botSpawnMass: MIN_CELL_MASS,
            botEjectRate: 1,
            virus: 0,
            food: 0,
            spawnMass: 132,
            ejectMass: 5,
            ejectSpeed: 300,
            ejectRate: 1,
            splitRecoil: 0,
            splitSpeed: 10,
            splitDecayTime: 0.1,
            splitInputSpeed: 0,
            gameSpeed: 0.1,
            renderRange: 35,
            mergeCooldown: 0,
            mergeCancelCooldown: 0,
            worldSize: 2000
          },
          max: {
            bot: 200,
            botSpawnMass: 5000,
            botEjectRate: MAX_EJECT_RATE,
            virus: 500,
            food: 100000,
            spawnMass: 5000,
            ejectMass: 80,
            ejectSpeed: 1400,
            ejectRate: MAX_EJECT_RATE,
            splitRecoil: 40,
            splitSpeed: 300,
            splitDecayTime: 2,
            splitInputSpeed: 500,
            gameSpeed: 3,
            renderRange: 120,
            mergeCooldown: 60,
            mergeCancelCooldown: 10,
            worldSize: 15000
          }
        },
        input: {
          mouseX: 0,
          mouseY: 0,
          mouseWorldX: WORLD_SIZE * 0.5,
          mouseWorldY: WORLD_SIZE * 0.5,
          keys: new Set(),
          splitQueued: false,
          splitCount: 0,
          splitSeq: 0,
          splitBurstCount: 0,
          ejectQueued: false,
          ejectSeq: 0,
          respawnQueued: false,
          respawnSeq: 0,
          cloneQueued: false,
          cloneSeq: 0,
          activeActorId: "player",
          botSplitQueued: false,
          botEjectQueued: false,
          lastAimX: 1,
          lastAimY: 0
        },
        net: {
          role: "offline",
          transport: "none",
          pc: null,
          channel: null,
          peer: null,
          peerConn: null,
          connectTimer: 0,
          socket: null,
          connected: false,
          status: "OFFLINE",
          iceCandidates: 0,
          worldSeq: 0,
          worldBuffer: null,
          pendingSnapshot: null,
          pendingWorldChunks: [],
          lastInputSend: -100,
          lastSnapshotSend: -100,
          lastFeedSnapshotSend: -100,
          lastBotSnapshotSend: -100,
          lastWorldSend: -100,
          removedFeedIds: new Set(),
          removedVirusIds: new Set(),
          removedCellKeys: new Set(),
          clientRemovedFeedIds: new Set(),
          clientRemovedVirusIds: new Set()
        },
        foodGridDirty: true,
        flashUntil: 0,
        hudTimer: 0
      };

      class SpatialHash {
        constructor(cellSize) {
          this.cellSize = cellSize;
          this.map = new Map();
        }

        clear() {
          this.map.clear();
        }

        key(cx, cy) {
          return `${cx},${cy}`;
        }

        insert(item) {
          const cx = Math.floor(item.x / this.cellSize);
          const cy = Math.floor(item.y / this.cellSize);
          const key = this.key(cx, cy);
          let bucket = this.map.get(key);
          if (!bucket) {
            bucket = [];
            this.map.set(key, bucket);
          }
          bucket.push(item);
        }

        query(x, y, range, out = []) {
          out.length = 0;
          const minX = Math.floor((x - range) / this.cellSize);
          const maxX = Math.floor((x + range) / this.cellSize);
          const minY = Math.floor((y - range) / this.cellSize);
          const maxY = Math.floor((y + range) / this.cellSize);
          for (let cy = minY; cy <= maxY; cy += 1) {
            for (let cx = minX; cx <= maxX; cx += 1) {
              const bucket = this.map.get(this.key(cx, cy));
              if (bucket) out.push(...bucket);
            }
          }
          return out;
        }

        queryRect(left, top, right, bottom, out = []) {
          out.length = 0;
          const minX = Math.floor(left / this.cellSize);
          const maxX = Math.floor(right / this.cellSize);
          const minY = Math.floor(top / this.cellSize);
          const maxY = Math.floor(bottom / this.cellSize);
          for (let cy = minY; cy <= maxY; cy += 1) {
            for (let cx = minX; cx <= maxX; cx += 1) {
              const bucket = this.map.get(this.key(cx, cy));
              if (bucket) out.push(...bucket);
            }
          }
          return out;
        }
      }

      const foodGrid = new SpatialHash(180);
      const feedGrid = new SpatialHash(220);
      const virusGrid = new SpatialHash(300);
      const cellGrid = new SpatialHash(430);
      const scratch = [];
      const aiCellsScratch = [];
      const aiEntityScratch = [];
      const cellQueryScratch = [];
      const renderCellQueryScratch = [];
      const renderEntityQueryScratch = [];
      const renderCellsScratch = [];
      const renderSizedEntitiesScratch = [];
      const detailCellsScratch = [];
      const foodRenderScratch = [];
      const feedRenderScratch = [];
      const cellBatchByColor = new Map();
      const entityBatchByColor = new Map();
      const virusSpikePointCache = new Map();
      const darkenCache = new Map();
