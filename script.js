// 分割されたゲーム本体ファイルを順番に読み込み、元の実行スコープとして起動するローダーです。
(() => {
  "use strict";

  const GAME_CHUNKS = [
    "00-dom-state.js",
    "01-math-merge-consume.js",
    "02-actors-ui-storage.js",
    "03-entities-spawn.js",
    "04-actions-virus-bot.js",
    "05-movement-collision.js",
    "06-network-sync.js",
    "07-render-settings-loop.js"
  ];

  async function loadGame() {
    const baseUrl = new URL("./game/", document.currentScript.src);
    const sources = await Promise.all(GAME_CHUNKS.map(async (file) => {
      const url = new URL(file, baseUrl);
      const response = await fetch(url);
      if (!response.ok) throw new Error(`${file}: ${response.status}`);
      return `${await response.text()}\n//# sourceURL=${url.href}`;
    }));
    (0, eval)(sources.join("\n"));
  }

  loadGame().catch((error) => {
    console.error("Game load failed", error);
    const status = document.getElementById("onlineStatus");
    if (status) status.textContent = "????";
  });
})();
