// @ts-check
/**
 * デザイントークン。
 * Tailwind config と JS/TS コード (Lucide icon の color prop など className 不可な箇所)
 * の単一参照元。色を変更する場合はここ 1 箇所だけ更新する。
 *
 * .js (CommonJS) なのは tailwind.config.js から require できる必要があるため。
 * TS からも import 可能 (allowJs/checkJs 不要、TS の型推論が動く)。
 */

/** @satisfies {Record<string, string>} */
const colors = {
  // base
  background: "#0b0f1a",
  foreground: "#f0f1f4",
  card: "#161b27",
  cardForeground: "#f0f1f4",
  // semantic
  primary: "#4d8cff",
  primaryForeground: "#f7f8fa",
  muted: "#1f242f",
  mutedForeground: "#7d8390",
  destructive: "#e84545",
  destructiveForeground: "#ffffff",
  success: "#22c55e",
  // border
  border: "rgba(255,255,255,0.08)",
};

module.exports = { colors };
