import { Mic } from "lucide-react-native";
import { useRef } from "react";
import { ScrollView, Text, View } from "react-native";
import type { AnswerEntry } from "@/hooks/use-answer-stream";
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
  return (
    <View className="flex-1 items-center justify-center gap-4 py-16">
      <View className="relative h-24 w-24 items-center justify-center">
        <View className="absolute h-24 w-24 rounded-full border border-primary/10" />
        <View className="absolute h-16 w-16 rounded-full border border-primary/20" />
        <Mic size={32} color="#4d8cff" opacity={0.4} />
      </View>
      <Text className="text-sm font-medium text-muted-foreground">準備完了</Text>
    </View>
  );
}

export function ChatArea({ messages, partial }: ChatAreaProps) {
  const scrollRef = useRef<ScrollView>(null);

  return (
    <ScrollView
      ref={scrollRef}
      className="flex-1"
      contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 12, gap: 12 }}
      showsVerticalScrollIndicator={false}
      // content の高さが変わるたびに下端へスクロール (新メッセージ・ストリーミング両方に対応)
      onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
    >
      {messages.length === 0 && !partial && <EmptyState />}
      {messages.map((msg) => {
        if (msg.kind === "question") {
          return (
            <MessageBubble
              key={msg.id}
              kind="question"
              text={msg.text}
              createdAt={msg.createdAt}
              onCopy={msg.onCopy}
            />
          );
        }
        return <MessageBubble key={msg.id} kind="answer" entry={msg.entry} />;
      })}
      {partial ? <PartialBubble text={partial} /> : null}
    </ScrollView>
  );
}
