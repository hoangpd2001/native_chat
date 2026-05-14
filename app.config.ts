import type { ConfigContext, ExpoConfig } from "expo/config";

/**
 * 環境変数 (.env or CI Secret) からビルド時に注入する設定。
 * Local dev: .env ファイル (Expo が自動 load)
 * CI build: GitHub Actions → EAS Build → process.env
 */
const easProjectId = process.env.EAS_PROJECT_ID;
const apiBaseUrl = process.env.API_BASE_URL ?? "http://localhost:3000";

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: "kanpe-ai-native",
  slug: "kanpe-ai-native",
  version: "1.0.0",
  orientation: "portrait",
  icon: "./assets/icon.png",
  userInterfaceStyle: "dark",
  newArchEnabled: true,
  splash: {
    image: "./assets/splash-icon.png",
    resizeMode: "contain",
    backgroundColor: "#0b0f1a",
  },
  ios: {
    supportsTablet: true,
    infoPlist: {
      NSMicrophoneUsageDescription: "マイクを使って面接音声をリアルタイムで文字起こしします。",
    },
    bundleIdentifier: "jp.nulogic.kanpe-ai-native",
  },
  android: {
    adaptiveIcon: {
      foregroundImage: "./assets/adaptive-icon.png",
      backgroundColor: "#0b0f1a",
    },
    edgeToEdgeEnabled: true,
    predictiveBackGestureEnabled: false,
    permissions: ["android.permission.RECORD_AUDIO", "android.permission.INTERNET"],
    package: "jp.nulogic.kanpe_ai_native",
  },
  web: {
    favicon: "./assets/favicon.png",
  },
  plugins: [
    "@config-plugins/react-native-webrtc",
    [
      "react-native-permissions",
      {
        iosPermissions: ["Microphone"],
      },
    ],
  ],
  extra: {
    API_BASE_URL: apiBaseUrl,
    // EAS が projectId を要求するのは build 時のみ。Local 起動時は undefined でも OK。
    ...(easProjectId ? { eas: { projectId: easProjectId } } : {}),
  },
});
