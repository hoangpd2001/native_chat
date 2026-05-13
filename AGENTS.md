<!-- BEGIN:react-native-agent-rules -->
# This is React Native, not React for web

React Native ≠ React DOM。Web の知識をそのまま適用すると壊れる:
- `<div>` / `<span>` 等の HTML タグは存在しない → `<View>` / `<Text>` を使用
- CSS ファイルは使えない → Nativewind v4 の `className` prop のみ
- `window` / `document` / `localStorage` / `fetch` の Web 固有 API は存在しない (`fetch` のみ polyfill あり)
- リンクは `<a>` ではなく `Pressable` + `Linking.openURL`

加えて RN 0.81 + Expo SDK 54 は **New Architecture (Fabric / TurboModules) 有効**。training data の古い RN 知識 (Bridge / レガシー native module API) をそのまま適用しないこと。
<!-- END:react-native-agent-rules -->

# Native module / Expo Go

- 本リポジトリは `react-native-webrtc`, `react-native-audio-record`, `react-native-permissions` 等のネイティブモジュールを使用しているため **Expo Go では動作しない**。development build / EAS Build を使用すること。
- 新規ネイティブモジュール追加時:
  1. `pnpm add <module>`
  2. plugin 設定が必要な場合は `app.config.ts` の `plugins` に追加 (既存例: `@config-plugins/react-native-webrtc`, `react-native-permissions`)
  3. `pnpm exec expo prebuild --platform android --clean` で `android/` を再生成 (`android/` `ios/` は `.gitignore` 対象)
  4. EAS Build (preview) で動作確認

# Metro bundler / pnpm

- pnpm デフォルトの symlink モードは Metro の module 解決と非互換。`.npmrc` の `node-linker=hoisted` を絶対に変更しないこと。
- `metro.config.js` の `resolver.nodeModulesPaths` 等を編集する場合は hoisted 前提を崩さないか確認すること。

# 環境変数

- `process.env.*` は `app.config.ts` 内 (ビルド時) のみ使用可。ランタイムコードでは `Constants.expoConfig.extra` 経由でしか読めない。
- `lib/env.ts` は zod でバリデーションし、失敗時は `parse()` でモジュールロード時点でエラーをスロー (fail-fast)。新規変数追加時は zod スキーマと `app.config.ts` の `extra` 両方を更新する。
- API 呼び出し先のデフォルトは `http://10.0.2.2:3000` (Android emulator から host の localhost を指す alias)。

# React パフォーマンス

- React Compiler は設定されていないため、`useMemo` / `useCallback` は自動挿入されない。再生成すると参照が変わるオブジェクト / 重い計算には手動で使うこと。
- リストレンダリングは `FlatList` / `SectionList` を使用し、virtualization を効かせること。大量データを `.map()` で直接レンダリングしないこと。

# WebRTC 固有

- `lib/realtime/client.ts` の `RealtimeClient` は `gpt-realtime-whisper` が server_vad 非対応であるため、`getStats()` を 100ms 周期でポーリングして outbound audio level から無音区間を検知し `input_audio_buffer.commit` を自前で送信する設計。VAD ロジックを触る場合はこの前提を理解すること。
- マイク権限取得は `react-native-permissions` を使用。Expo の旧 `Permissions` API は使わない。

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
