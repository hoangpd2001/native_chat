@AGENTS.md

# プロジェクト基本方針

## 対応プラットフォーム
- **モバイル (iOS / Android) 縦画面固定**。`orientation: portrait` (`app.config.ts`)。横画面・タブレット最適化はスコープ外。

## パッケージマネージャ
- **pnpm のみ使用**。`packageManager` フィールドで `pnpm@10.33.0` に固定。
- `npm` / `yarn` コマンドの使用禁止。lockfile は `pnpm-lock.yaml` のみ。
- `.npmrc` の `node-linker=hoisted` は変更禁止 (Metro / autolinking 互換のため)。

# コードレビュー規約

## TypeScript
- `any` 型の使用は原則禁止。必ず具体的な型 (interface / type alias) を定義すること。
- やむを得ず `any` を使用する場合は、例外である理由と影響範囲をコメントで明記すること。
- strict mode 準拠 (`tsconfig.json` で `"strict": true`)。

## インポート
- パスエイリアス `@/*` を使用 (例: `@/components/chat/ChatArea`)。
- 相対パスでルートを遡るインポート (`../../../`) は禁止。

## スタイリング
- UI には Nativewind v4 の `className` prop を使用すること。
- `className` で表現できない箇所 (Lucide icon の `color` prop 等) は `lib/theme.js` の `colors` トークンを参照すること。
- 色のハードコード (`#xxxxxx`) は禁止 — 必ず `colors` トークンを経由する。
- インラインの `style={{ ... }}` オブジェクトは原則禁止。動的スタイル等やむを得ない場合のみ使用。

## 命名規則
- コンポーネント・コンポーネントフォルダ: PascalCase (例: `ChatArea.tsx`, `components/chat/`)
- フック / ユーティリティファイル: kebab-case (例: `use-microphone.ts`, `env.ts`)
- 関数・変数名: camelCase
- 定数名: UPPER_SNAKE_CASE
- 型・interface: PascalCase

## 環境変数
- `process.env` をランタイムコード (hooks / components / lib) で参照しないこと。RN ランタイムには存在しない。
- 環境変数は `lib/env.ts` 経由でのみ読むこと (`import { env } from "@/lib/env"`)。
- 新しい環境変数を追加する場合は `lib/env.ts` の zod スキーマと `app.config.ts` の `extra` 両方を更新すること。

## データフロー
- UI コンポーネントは presentation に責務を限定すること。
- ネットワーク / WebRTC / 外部 API 呼び出しは hooks (`hooks/use-*.ts`) または `lib/` 内に閉じ込めること。
- secret (API キー等) を直接コードに埋め込まないこと — 必ず `lib/env.ts` 経由。

## フレームワーク準拠
- Expo SDK 54 + React Native 0.81 + New Architecture (`newArchEnabled: true`) 前提。
- 非推奨 (deprecated) API を使用していないか確認すること。

## Biome
- `pnpm exec biome check .` がパスすること。
- フォーマット規則 (indent 2 spaces / lineWidth 100 / double quote / trailing comma `es5`) を遵守。
