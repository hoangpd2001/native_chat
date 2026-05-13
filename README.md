# カンペAI (Native)

面接想定のリアルタイム文字起こし + 解答提案アプリの React Native 版。

バックエンド (LLM 呼び出し / Realtime API トークン発行) は Web リポジトリ ([`../kanpe-ai`](../kanpe-ai)) の API Route を `API_BASE_URL` 経由で呼び出す。

## 技術スタック

| 領域 | 採用 |
|---|---|
| フレームワーク | Expo SDK 54 + React Native 0.81 + TypeScript |
| スタイル | Nativewind v4 (Tailwind for RN) |
| Linter/Formatter | Biome |
| Realtime 通信 | react-native-webrtc (DataChannel + audio streaming) |
| マイク権限 | PermissionsAndroid (Android) / react-native-permissions (iOS) |
| ストリーミング | XMLHttpRequest `onprogress` (fetch streaming 非対応) |
| ビルド・配布 | EAS Build + EAS Workflows |

## 動作環境

| 項目 | 必須/推奨 |
|---|---|
| Node.js | 20.x |
| Android Studio + SDK 36 + NDK 27 | Android 開発時 |
| Xcode + CocoaPods | iOS 開発時 (Mac 限定) |
| Android emulator / 実機 + USB debug | テスト時 |
| Web ([`../kanpe-ai`](../kanpe-ai)) が `localhost:3000` で起動 | API 呼び出しのため |

## セットアップ

```bash
pnpm install
cp .env.example .env
# .env を開いて API_BASE_URL を編集
```

pnpm が未インストールの場合: `corepack enable` で有効化 (Node 20+ に同梱)。バージョンは `package.json` の `packageManager` フィールドで `pnpm@10.33.0` に固定済み。

初回 / native module 追加時のみ:

```bash
npx expo prebuild --platform android --clean   # android/ フォルダ生成
npx expo run:android                           # build + install + Metro 起動
```

2 回目以降は `npx expo start --dev-client` だけで OK (Metro のみ起動)。

## 主要コマンド

| コマンド | 内容 |
|---|---|
| `npx expo start --dev-client` | Metro Bundler 起動 (dev build モード、Expo Go 不可) |
| `npx expo run:android` | Android ネイティブビルド + インストール + Metro |
| `npx expo prebuild --platform android --clean` | `android/` フォルダ再生成 |
| `pnpm lint` | Biome lint 実行 |
| `pnpm format` | Biome format 実行 (自動修正) |
| `pnpm check` | Biome lint + format 一括実行 (自動修正) |
| `npx tsc --noEmit` | TypeScript 型チェック |
| `adb install <apk>` | 既存 APK を端末にインストール |

## 環境変数

### ローカル開発

```bash
cp .env.example .env
# .env を開いて値を入力
```

| キー | 用途 | 値の例 |
|---|---|---|
| `API_BASE_URL` | Web BE のベース URL | `http://10.0.2.2:3000` (Android emulator 用) |

- Android emulator: `http://10.0.2.2:3000` (host の localhost に到達)
- 実機 (Wi-Fi): `http://<PC の LAN IP>:3000`
- 本番: Railway のデプロイ URL

`.env` は `.gitignore` で除外済みのため、コミットされません。

### EAS Build 用 Secrets (本番環境)

1. https://expo.dev/ → プロジェクト → **Secrets**
2. **Create Secret** で `API_BASE_URL` を追加 (本番 URL を入れる)
3. push 時に EAS Workflows が自動で `process.env` に inject

`EAS_PROJECT_ID` は `app.config.ts` にハードコード済み (機密ではないため commit OK)。

## CI / CD

| ワークフロー | トリガー | 内容 |
|---|---|---|
| [.github/workflows/ci.yml](.github/workflows/ci.yml) | push / PR to `main` | Biome check + TypeScript 型チェック |
| [.eas/workflows/build.yml](.eas/workflows/build.yml) | push to `main` | EAS で Android + iOS preview ビルド |

EAS Build の結果は https://expo.dev/ プロジェクト → **Builds** タブで確認。APK ダウンロード可能。

## トラブルシューティング

| エラー | 原因 | 対処 |
|---|---|---|
| `RNCClipboard could not be found` | Expo Go で起動した (native module 非対応) | `npx expo start --dev-client` を使う |
| `Tried to use permissions API while not attached to an Activity` | react-native-permissions の new arch バグ (Android) | Android は PermissionsAndroid を使う ([hooks/use-microphone.ts](hooks/use-microphone.ts) で対応済み) |
| `Network request failed` (Realtime token) | Web (`pnpm dev`) 未起動 or `API_BASE_URL` 間違い | Web 起動を確認、emulator 内では `10.0.2.2` 必須 |
| `ERR_PNPM_FROZEN_LOCKFILE_WITH_OUTDATED_LOCKFILE` | `package.json` 変更後に `pnpm-lock.yaml` 未更新 | `pnpm install` で lockfile を更新 |
| `WebRTC disconnected` 一定時間後 | OpenAI Realtime セッションの寿命切れ | マイクをタップして再接続 |
| `There is not enough space on the disk` | Android build が ~10GB 必要 | ドライブの空きを増やす |
| Port 8081 衝突 | 前回の Metro が残留 | `Get-NetTCPConnection -LocalPort 8081 \| Stop-Process -Id { $_.OwningProcess } -Force` |

## ディレクトリ構造

```
kanpe-ai-native/
├── App.tsx                          # エントリ
├── app.config.ts                    # Expo 設定 (env / plugins / projectId)
├── eas.json                         # EAS Build profiles
├── .eas/workflows/build.yml         # 自動ビルド (push → EAS)
├── .github/workflows/ci.yml         # 型 / lint チェック
├── .claude/                         # Claude Code skills + commands
├── components/chat/                 # ChatArea, MessageBubble, etc.
├── hooks/                           # useMicrophone, useRealtimeTranscription, useAnswerStream
├── lib/
│   ├── env.ts                       # Zod env validation
│   ├── theme.js                     # デザイントークン (色)
│   ├── llm/types.ts                 # MODEL_KEYS
│   └── realtime/                    # WebRTC client + VAD
└── README.md
```

## 関連リポジトリ

- Web (BE + Web FE): [`../kanpe-ai`](../kanpe-ai)
- 本リポジトリ: Native フロントエンドのみ。BE は Web を経由する。
