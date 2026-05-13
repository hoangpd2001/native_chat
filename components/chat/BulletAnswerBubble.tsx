import { AlertCircle } from "lucide-react-native";
import { useEffect, useRef } from "react";
import { Animated, Text, View } from "react-native";
import type { AnswerEntry } from "@/hooks/use-answer-stream";
import { colors } from "@/lib/theme";

type BulletAnswerBubbleProps = {
  entry: AnswerEntry;
};

function parseBullets(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => line.replace(/^[-・*]\s*/, ""));
}

function LoadingBubble() {
  const dots = useRef([
    new Animated.Value(0),
    new Animated.Value(0),
    new Animated.Value(0),
  ]).current;
  useEffect(() => {
    const anims = dots.map((dot, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 150),
          Animated.timing(dot, { toValue: 1, duration: 400, useNativeDriver: true }),
          Animated.timing(dot, { toValue: 0, duration: 400, useNativeDriver: true }),
        ])
      )
    );
    for (const a of anims) a.start();
    return () => {
      for (const a of anims) a.stop();
    };
  }, [dots]);

  const dotKeys = ["d0", "d1", "d2"];
  return (
    <View className="min-h-[3rem] min-w-[3rem] self-end items-center justify-center rounded-2xl rounded-br-sm border border-primary/20 bg-primary/5 px-4 py-3">
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
    </View>
  );
}

/**
 * 解答を箇条書き形式で表示する専用バブル。
 * 現状は variant=prose を使用しているため未利用 (将来 variant 切替時に有効化)。
 */
export function BulletAnswerBubble({ entry }: BulletAnswerBubbleProps) {
  if (entry.status === "loading") {
    return <LoadingBubble />;
  }

  if (entry.status === "streaming") {
    const lines = parseBullets(entry.text);
    if (lines.length === 0) return <LoadingBubble />;
    return (
      <>
        {lines.map((line, i) => {
          const isLast = i === lines.length - 1;
          return (
            <View
              // biome-ignore lint/suspicious/noArrayIndexKey: bullets derived from streaming text — no stable id
              key={`${i}-${line}`}
              className="max-w-[90%] self-end rounded-2xl rounded-br-sm border border-primary/20 bg-primary/5 px-4 py-3"
              style={isLast ? { opacity: 0.6 } : undefined}
            >
              <Text className="text-base text-foreground">
                {line}
                {isLast ? <Text className="text-primary"> ▍</Text> : null}
              </Text>
            </View>
          );
        })}
      </>
    );
  }

  if (entry.status === "done") {
    return (
      <>
        {parseBullets(entry.text).map((line, i) => (
          <View
            // biome-ignore lint/suspicious/noArrayIndexKey: bullets derived from streaming text — no stable id
            key={`${i}-${line}`}
            className="max-w-[90%] self-end rounded-2xl rounded-br-sm border border-primary/20 bg-primary/5 px-4 py-3"
          >
            <Text className="text-base text-foreground">{line}</Text>
          </View>
        ))}
      </>
    );
  }

  // error
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
