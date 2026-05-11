// バージョン、色、キー設定など分割されたデータ定義を一つにまとめるファイルです。
window.TAIN_DATA = {
  APP_VERSION: window.TAIN_DATA_VERSION || "v2026.05.12.13",
  ...(window.TAIN_PALETTES || {}),
  defaultKeyBindings: { ...(window.TAIN_DEFAULT_KEY_BINDINGS || {}) }
};
