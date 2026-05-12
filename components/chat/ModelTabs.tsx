import { AlertCircle, Check } from "lucide-react-native";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import type { AnswerStatus } from "@/hooks/use-answer-stream";
import { MODEL_KEYS, type ModelKey } from "@/lib/llm/types";
import { colors } from "@/lib/theme";

type ModelTabsProps = {
  value: ModelKey;
  onChange: (m: ModelKey) => void;
  statusByModel: Record<ModelKey, AnswerStatus | "idle">;
};

const MODEL_LABELS: Record<ModelKey, string> = {
  openai: "GPT",
};

const MODELS: readonly ModelKey[] = MODEL_KEYS;

function StatusIcon({ status }: { status: AnswerStatus | "idle" }) {
  if (status === "idle") return null;
  if (status === "loading" || status === "streaming") {
    return <ActivityIndicator size="small" color={colors.primary} />;
  }
  if (status === "done") {
    return <Check size={14} color={colors.success} />;
  }
  return <AlertCircle size={14} color={colors.destructive} />;
}

/**
 * 解答モデル切替タブ。
 * 現状 MODEL_KEYS が ["openai"] のみのため実質的に表示されない (将来複数モデル対応時に有効化)。
 */
export function ModelTabs({ value, onChange, statusByModel }: ModelTabsProps) {
  return (
    <View className="border-b border-border bg-background px-3 py-2">
      <View className="w-full flex-row gap-1 rounded-md bg-card/50 p-1">
        {MODELS.map((model) => {
          const active = model === value;
          return (
            <Pressable
              key={model}
              onPress={() => onChange(model)}
              accessibilityLabel={`${MODEL_LABELS[model]} タブ`}
              className={`min-h-[48px] flex-1 items-center justify-center rounded-sm px-2 py-1 ${
                active ? "bg-background" : ""
              }`}
            >
              <StatusIcon status={statusByModel[model]} />
              <Text className="mt-1 text-sm font-medium text-foreground">
                {MODEL_LABELS[model]}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
