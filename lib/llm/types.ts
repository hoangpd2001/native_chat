export const MODEL_KEYS = ["openai"] as const;

export type ModelKey = (typeof MODEL_KEYS)[number];
