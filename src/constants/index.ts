import { homedir } from "os";
import path from "path";

export const DEFAULT_TEMP_DIR = path.join(homedir(), ".raycast-speech-to-text-temp");

export const GROQ_MODELS = [
  { id: "whisper-large-v3", name: "Whisper Large v3" },
  { id: "whisper-large-v3-turbo", name: "Whisper Large v3 Turbo" },
  { id: "distil-whisper-large-v3-en", name: "Distil Whisper" },
];

export const RECORDING_MAX_DURATION = 60; // seconds
export const RECORDING_SAMPLE_RATE = 16000; // Hz
export const RECORDING_FILE_FORMAT = "wav";
