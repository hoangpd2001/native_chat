import Constants from "expo-constants";
import { z } from "zod";

const envSchema = z.object({
  API_BASE_URL: z.url(),
});

const raw = (Constants.expoConfig?.extra ?? {}) as Record<string, unknown>;

export const env = envSchema.parse(raw);
