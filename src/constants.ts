import os from "os";
import path from "path";

// export const DEFAULT_TEMP_DIR = path.join(os.tmpdir(), "raycast-speech-to-text");
// TODO: We should get path from user preferences
export const DEFAULT_TEMP_DIR = path.join(os.homedir(), ".raycast-speech-to-text-temp");

export const RECORDING_FILE_FORMAT = "wav";
export const RECORDING_MAX_DURATION = 60;
export const RECORDING_SAMPLE_RATE = 16000; // 16kHz

export const TRANSCRIPTION_MODELS = [
  { id: "whisper-large-v3", name: "Whisper Large v3" },
  { id: "whisper-large-v3-turbo", name: "Whisper Large v3 Turbo" },
  { id: "distil-whisper-large-v3-en", name: "Distil Whisper" },
];

/**
 * Maximum allowed audio duration in seconds
 * Groq has a daily limit of 8 hours (~28800 seconds)
 * We set a conservative limit of 2 hours per file
 */
export const MAX_AUDIO_DURATION_SECONDS = 7000; // ~2 hours
