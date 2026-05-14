import Constants from "expo-constants";
import { z } from "zod";

const envSchema = z.object({
  API_BASE_URL: z.url(),
});

const raw = (Constants.expoConfig?.extra ?? {}) as Record<string, unknown>;

const parsed = envSchema.safeParse(raw);

if (!parsed.success) {
  console.warn(" 環境変数が不正です:", parsed.error.issues);
}

export const env = parsed.success
  ? parsed.data
  : new Proxy({} as z.infer<typeof envSchema>, {
      get(_: z.infer<typeof envSchema>, key: string) {
        throw new Error(`環境変数 ${key} は設定されていません`);
      },
    });
