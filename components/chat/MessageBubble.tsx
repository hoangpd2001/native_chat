import { AlertCircle, Check, Copy } from "lucide-react-native";
import { useCallback, useEffect, useRef, useState } from "react";
import { Animated, Pressable, Text, View } from "react-native";
import type { AnswerEntry } from "@/hooks/use-answer-stream";
import { colors } from "@/lib/theme";

type MessageBubbleProps =
  | {
      kind: "question";
      text: string;
      createdAt: number;
      onCopy?: () => void;
    }
  | { kind: "answer"; entry: AnswerEntry };

function formatTime(ts: number): string {
  const d = new Date(ts);
  const hh = `${d.getHours()}`.padStart(2, "0");
  const mm = `${d.getMinutes()}`.padStart(2, "0");
  return `${hh}:${mm}`;
}

function LoadingDots() {
  const dots = useRef([
    new Animated.Value(0),
    new Animated.Value(0),
    new Animated.Value(0),
  ]).current;

  useEffect(() => {
    const animations = dots.map((dot, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 150),
          Animated.timing(dot, { toValue: 1, duration: 400, useNativeDriver: true }),
          Animated.timing(dot, { toValue: 0, duration: 400, useNativeDriver: true }),
        ])
      )
    );
    for (const a of animations) a.start();
    return () => {
      for (const a of animations) a.stop();
    };
  }, [dots]);

  const dotKeys = ["d0", "d1", "d2"];
  return (
    <View className="flex-row gap-1">
      {dots.map((dot, i) => (
        <Animated.View
          key={dotKeys[i]}
          className="h-1.5 w-1.5 rounded-full bg-primary"
          style={{
            opacity: dot.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }),
            transform: [
              {
                translateY: dot.interpolate({ inputRange: [0, 1], outputRange: [0, -3] }),
              },
            ],
          }}
        />
      ))}
    </View>
  );
}

export function MessageBubble(props: MessageBubbleProps) {
  const [copied, setCopied] = useState(false);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current !== null) clearTimeout(copyTimerRef.current);
    };
  }, []);

  const handleCopy = useCallback(() => {
    if (props.kind !== "question") return;
    props.onCopy?.();
    setCopied(true);
    if (copyTimerRef.current !== null) clearTimeout(copyTimerRef.current);
    copyTimerRef.current = setTimeout(() => {
      copyTimerRef.current = null;
      setCopied(false);
    }, 2000);
  }, [props]);

  if (props.kind === "question") {
    return (
      <View className="max-w-[85%] self-start rounded-2xl rounded-bl-sm border border-border bg-card/80 px-4 py-3">
        <View className="mb-2 flex-row items-center justify-between">
          <View className="flex-row items-center gap-1.5">
            <View className="h-3.5 w-0.5 rounded-full bg-primary" />
            <Text className="text-xs font-medium uppercase text-primary">質問</Text>
          </View>
          {props.onCopy && (
            <Pressable
              onPress={handleCopy}
              hitSlop={10}
              accessibilityLabel="質問と全解答をコピー"
              className="h-7 w-7 items-center justify-center rounded-md active:opacity-60"
            >
              {copied ? (
                <Check size={14} color={colors.primary} />
              ) : (
                <Copy size={14} color={colors.mutedForeground} />
              )}
            </Pressable>
          )}
        </View>
        <Text className="text-base text-foreground">{props.text}</Text>
        <Text className="mt-1 text-right text-xs text-muted-foreground">
          {formatTime(props.createdAt)}
        </Text>
      </View>
    );
  }

  const { entry } = props;

  if (entry.status === "loading") {
    return (
      <View className="min-h-[3rem] min-w-[3rem] self-end items-center justify-center rounded-2xl rounded-br-sm border border-primary/20 bg-primary/5 px-4 py-3">
        <LoadingDots />
      </View>
    );
  }

  if (entry.status === "streaming") {
    return (
      <View className="max-w-[90%] self-end rounded-2xl rounded-br-sm border border-primary/20 bg-primary/5 px-4 py-3">
        <Text className="text-base leading-7 text-foreground">
          {entry.text}
          <Text className="text-primary"> ▍</Text>
        </Text>
      </View>
    );
  }

  if (entry.status === "done") {
    return (
      <View className="max-w-[90%] self-end rounded-2xl rounded-br-sm border border-primary/20 bg-primary/5 px-4 py-3">
        <Text className="text-base leading-7 text-foreground">{entry.text}</Text>
      </View>
    );
  }

  // status === "error"
  return (
    <View className="max-w-[90%] self-end rounded-2xl rounded-br-sm border border-destructive/30 bg-destructive/10 px-4 py-3">
      {entry.text ? <Text className="mb-2 text-base text-foreground/70">{entry.text}</Text> : null}
      <View className="flex-row items-center">
        <AlertCircle size={16} color={colors.destructive} />
        <Text className="ml-2 text-sm text-destructive">{entry.error}</Text>
      </View>
    </View>
  );
}
