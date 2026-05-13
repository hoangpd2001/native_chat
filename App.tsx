import "./global.css";
import Clipboard from "@react-native-clipboard/clipboard";
import { StatusBar } from "expo-status-bar";
import { AlertCircle, Mic, MicOff, Radio, Square } from "lucide-react-native";
import { useEffect, useMemo } from "react";
import { ActivityIndicator, Linking, Pressable, Text, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import type { ChatMessage } from "@/components/chat/ChatArea";
import { ChatArea } from "@/components/chat/ChatArea";
import { useAnswerStream } from "@/hooks/use-answer-stream";
import { useMicrophone } from "@/hooks/use-microphone";
import { useRealtimeTranscription } from "@/hooks/use-realtime-transcription";
import { MODEL_KEYS, type ModelKey } from "@/lib/llm/types";
import type { RealtimeConnectionState } from "@/lib/realtime/types";
import { colors } from "@/lib/theme";

export default function App() {
  const activeModel: ModelKey = "openai";
  const mic = useMicrophone();
  const rt = useRealtimeTranscription({ stream: mic.stream });
  const { answers } = useAnswerStream(rt.questions);

  const isGranted = mic.state === "granted";
  const hasMicError =
    mic.state === "denied" || mic.state === "error" || mic.state === "unsupported";

  const messages = useMemo<ChatMessage[]>(() => {
    const out: ChatMessage[] = [];
    for (const q of rt.questions) {
      const row = answers[q.id];

      const onCopy = () => {
        const labels = ["A", "B", "C", "D"] as const;
        const parts = [`【面接質問】\n${q.text}`];
        MODEL_KEYS.forEach((model, i) => {
          const entry = row?.[model];
          const text =
            entry?.status === "done" || entry?.status === "streaming"
              ? entry.text
              : entry?.status === "error"
                ? "(エラー)"
                : "(生成中)";
          parts.push(`\n【解答${labels[i]}】\n${text}`);
        });
        Clipboard.setString(parts.join("\n"));
      };

      out.push({ kind: "question", id: `q-${q.id}`, text: q.text, createdAt: q.createdAt, onCopy });
      const entry = answers[q.id]?.[activeModel];
      if (entry)
        out.push({ kind: "answer", id: `a-${q.id}-${activeModel}`, questionId: q.id, entry });
    }
    return out;
  }, [rt.questions, answers]);

  // マイク許可 → 文字起こし自動接続
  useEffect(() => {
    if (mic.state === "granted" && rt.connectionState === "idle") {
      void rt.start();
    }
  }, [mic.state, rt.connectionState, rt.start]);

  return (
    <SafeAreaProvider>
      <SafeAreaView className="flex-1 bg-background" edges={["top", "bottom"]}>
        <View className="mx-auto h-full w-full max-w-md flex-col">
          {/* マイクレベルバー (RealtimeClient の VAD から得た outbound audio level) */}
          {isGranted && !mic.muted ? (
            <View className="h-1 w-full overflow-hidden bg-muted">
              <View
                className="h-full bg-primary"
                style={{ width: `${Math.round(rt.audioLevel * 100)}%` }}
              />
            </View>
          ) : null}

          {/* チャットエリア */}
          <ChatArea messages={messages} partial={isGranted ? rt.partial : ""} />

          {/* エラー表示 */}
          {hasMicError && mic.error ? (
            <View className="px-4 py-2">
              <ErrorBox message={mic.error} showSettingsLink={mic.state === "denied"} />
            </View>
          ) : null}
          {rt.error ? (
            <View className="px-4 py-2">
              <ErrorBox message={`文字起こし: ${rt.error}`} />
            </View>
          ) : null}

          {/* フッター: 左=接続バッジ / 中央=ミュート/開始 / 右=停止 */}
          <View className="flex-row items-center border-t border-border bg-background px-4 pt-2 pb-3">
            <View className="flex-1">
              <ConnectionBadge state={rt.connectionState} muted={isGranted && mic.muted} />
            </View>

            <View className="flex-1 items-center">
              {mic.state === "idle" || mic.state === "requesting" ? (
                <Pressable
                  onPress={mic.start}
                  disabled={mic.state === "requesting"}
                  accessibilityLabel={mic.state === "requesting" ? "確認中" : "マイクを開始"}
                  className="h-14 w-14 items-center justify-center rounded-full bg-primary active:opacity-80"
                >
                  {mic.state === "requesting" ? (
                    <ActivityIndicator size="small" color={colors.primaryForeground} />
                  ) : (
                    <Mic size={24} color={colors.primaryForeground} />
                  )}
                </Pressable>
              ) : mic.state === "granted" ? (
                <Pressable
                  onPress={mic.toggleMute}
                  accessibilityLabel={mic.muted ? "ミュート解除" : "ミュート"}
                  className={
                    mic.muted
                      ? "h-14 w-14 items-center justify-center rounded-full bg-destructive active:opacity-80"
                      : "h-14 w-14 items-center justify-center rounded-full bg-primary active:opacity-80"
                  }
                >
                  <MicOff size={24} color={colors.destructiveForeground} />
                </Pressable>
              ) : (
                <Pressable
                  onPress={mic.start}
                  className="min-h-[48px] min-w-[200px] flex-row items-center justify-center rounded-md border border-border bg-card px-4 active:opacity-80"
                >
                  <Mic size={20} color={colors.foreground} />
                  <Text className="ml-2 text-base text-foreground">もう一度試す</Text>
                </Pressable>
              )}
            </View>

            <View className="flex-1 items-end">
              {isGranted ? (
                <Pressable
                  onPress={mic.stop}
                  accessibilityLabel="マイクを停止"
                  className="h-11 w-11 items-center justify-center rounded-md active:opacity-60"
                >
                  <Square size={16} color={colors.foreground} />
                </Pressable>
              ) : null}
            </View>
          </View>
        </View>
        <StatusBar style="light" />
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

type ConnectionBadgeProps = {
  state: RealtimeConnectionState;
  muted: boolean;
};

function ConnectionBadge({ state, muted }: ConnectionBadgeProps) {
  if (state === "connected") {
    if (muted) {
      return (
        <View className="flex-row items-center gap-1">
          <MicOff size={12} color={colors.mutedForeground} />
          <Text className="text-xs text-muted-foreground">ミュート中</Text>
        </View>
      );
    }
    return (
      <View className="flex-row items-center gap-1">
        <Radio size={12} color={colors.primary} />
        <Text className="text-xs text-muted-foreground">接続中</Text>
      </View>
    );
  }
  if (state === "connecting") {
    return (
      <View className="flex-row items-center gap-1">
        <ActivityIndicator size="small" color={colors.mutedForeground} />
        <Text className="text-xs text-muted-foreground">接続中…</Text>
      </View>
    );
  }
  if (state === "error") {
    return (
      <View className="flex-row items-center gap-1">
        <AlertCircle size={12} color={colors.destructive} />
        <Text className="text-xs text-destructive">切断</Text>
      </View>
    );
  }
  return null;
}

function ErrorBox({
  message,
  showSettingsLink = false,
}: {
  message: string;
  showSettingsLink?: boolean;
}) {
  return (
    <View className="gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-4">
      <View className="flex-row items-start gap-2">
        <AlertCircle size={16} color={colors.destructive} />
        <Text className="flex-1 text-sm text-destructive">{message}</Text>
      </View>
      {showSettingsLink ? (
        <Pressable
          onPress={() => void Linking.openSettings()}
          accessibilityLabel="設定を開く"
          className="mt-1 self-start rounded-md border border-destructive/40 px-3 py-1.5 active:opacity-70"
        >
          <Text className="text-sm text-destructive">設定を開く</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
