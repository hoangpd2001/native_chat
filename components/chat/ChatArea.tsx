import { Mic } from "lucide-react-native";
import { useCallback, useMemo } from "react";
import { FlatList, type ListRenderItem, Text, View } from "react-native";
import type { AnswerEntry } from "@/hooks/use-answer-stream";
import { colors } from "@/lib/theme";
import { MessageBubble } from "./MessageBubble";

export type ChatMessage =
  | { kind: "question"; id: string; text: string; createdAt: number; onCopy?: () => void }
  | { kind: "answer"; id: string; questionId: string; entry: AnswerEntry };

type ChatAreaProps = {
  messages: ChatMessage[];
  partial: string;
};

function PartialBubble({ text }: { text: string }) {
  return (
    <View className="max-w-[85%] self-start rounded-2xl border border-border bg-muted/20 px-4 py-3">
      <Text className="text-base text-foreground/70">{text}</Text>
    </View>
  );
}

function EmptyState() {
  // inverted: scaleY -1 で反転表示されるため、コンテンツも反転して正立させる
  return (
    <View
      className="flex-1 items-center justify-center gap-4 py-16"
      style={{ transform: [{ scaleY: -1 }] }}
    >
      <View className="relative h-24 w-24 items-center justify-center">
        <View className="absolute h-24 w-24 rounded-full border border-primary/10" />
        <View className="absolute h-16 w-16 rounded-full border border-primary/20" />
        <Mic size={32} color={colors.primary} opacity={0.4} />
      </View>
      <Text className="text-sm font-medium text-muted-foreground">準備完了</Text>
    </View>
  );
}

export function ChatArea({ messages, partial }: ChatAreaProps) {
  // inverted FlatList は index 0 が画面下端。新しいメッセージを下に積むため
  // messages を逆順にして FlatList に渡す (元配列を直接 reverse しない)
  const reversedMessages = useMemo(() => [...messages].reverse(), [messages]);

  const renderItem = useCallback<ListRenderItem<ChatMessage>>(({ item }) => {
    if (item.kind === "question") {
      return (
        <MessageBubble
          kind="question"
          text={item.text}
          createdAt={item.createdAt}
          onCopy={item.onCopy}
        />
      );
    }
    return <MessageBubble kind="answer" entry={item.entry} />;
  }, []);

  const keyExtractor = useCallback((item: ChatMessage) => item.id, []);

  return (
    <FlatList
      className="flex-1"
      data={reversedMessages}
      renderItem={renderItem}
      keyExtractor={keyExtractor}
      // inverted=true: 下から積み上げ。新しいメッセージは自動的に下端に表示される
      // (scrollToEnd を呼ばなくても content size 変化時に追従する)
      inverted
      contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 12, gap: 12 }}
      showsVerticalScrollIndicator={false}
      // パフォーマンス最適化 (KAN2-23 で MAX_QUESTIONS=20 のため初期描画も小さくて済む)
      initialNumToRender={10}
      maxToRenderPerBatch={5}
      windowSize={5}
      removeClippedSubviews
      // partial bubble は最新メッセージの「下」に表示したいので
      // inverted の ListHeaderComponent (= 画面下端) に配置する
      ListHeaderComponent={partial ? <PartialBubble text={partial} /> : null}
      // empty state は inverted で表示が反転するため EmptyState 側で打ち消す
      ListEmptyComponent={!partial ? <EmptyState /> : null}
    />
  );
}
