export type RealtimeConnectionState = "idle" | "connecting" | "connected" | "error" | "closed";

export type RealtimeTranscriptEvent =
  | { type: "speech_started" }
  | { type: "transcript_delta"; itemId: string; delta: string }
  | { type: "transcript_completed"; itemId: string; transcript: string }
  | { type: "error"; message: string };

export type OpenAIRealtimeServerEvent =
  | { type: "input_audio_buffer.speech_started"; event_id?: string }
  | {
      type: "conversation.item.input_audio_transcription.delta";
      item_id: string;
      delta: string;
    }
  | {
      type: "conversation.item.input_audio_transcription.completed";
      item_id: string;
      transcript: string;
    }
  | {
      type: "error";
      error: { type?: string; code?: string; message: string };
    }
  | { type: string };

export type RealtimeTokenResponse = {
  clientSecret: string;
  expiresAt: number;
};

export type Question = {
  id: string;
  text: string;
  createdAt: number;
};

export type TurnDetectionOptions = {
  silenceDurationMs?: number;
  threshold?: number;
  prefixPaddingMs?: number;
};
