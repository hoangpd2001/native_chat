---
description: UI変更後に baseline-ui スキルでスペーシング・タイポ・インタラクション状態を磨く (RN 版)
---

直近で変更・作成された UI ファイル (`components/` 配下、`App.tsx` など見た目に関わるファイル) に対して `baseline-ui` スキルを適用してください。

## やること
1. 直近のコミットまたは作業ツリーから、変更された UI ファイルを特定する
2. `baseline-ui` スキルを呼び出し、対象ファイルに対して以下を実施:
   - スペーシングの調整
   - タイポグラフィの整え
   - インタラクション状態 (active / disabled / focused) の確認と補強
     ※ RN なので hover は無視。Pressable の `active:` バリアントを使う
3. 変更点を要約して報告する

## RN 特有の注意点
- shadcn/ui や HTML primitive は使わない。`View` / `Text` / `Pressable` / `ScrollView` / `Animated` を使う
- 色やサイズは [lib/theme.js](../../lib/theme.js) のトークンから取得 (hex 直書き禁止)
- アイコンは `lucide-react-native` (web 版 `lucide-react` ではない)
- `react-native-safe-area-context` の `SafeAreaView` を使い、デフォルトの `react-native` 版は使わない (deprecated)
- フォントサイズはやや大きめ (本文 16px+) を維持 — スマホとの距離考慮
- Nativewind の制約: `backdrop-blur-*` 等 web 専用 class は動かない、注意

## やってはいけないこと
- 機能的なロジックには手を入れないこと (あくまで仕上げのみ)
- 追加の UI ライブラリをインストールしない (現状の RN primitive + Nativewind で完結)
- Tailwind class の変更は Biome の format に通る形で
- `web` プラットフォーム向けの専用 class や hack を入れない
