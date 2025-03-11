import { getPreferenceValues } from "@raycast/api";
import os from "os";
import path from "path";
import { Preferences } from "./types";

const preferences = getPreferenceValues<Preferences>();
export const DEFAULT_TEMP_DIR = path.join(os.homedir(), preferences.tempDirectory ?? ".raycast-speech-to-text-temp");

export const RECORDING_FILE_FORMAT = "wav";
export const RECORDING_SAMPLE_RATE = 16000; // 16kHz

export const TRANSCRIPTION_MODELS = [
  { id: "whisper-large-v3", name: "Whisper Large v3" },
  { id: "whisper-large-v3-turbo", name: "Whisper Large v3 Turbo" },
  { id: "distil-whisper-large-v3-en", name: "Distil Whisper" },
];

// Available language options for transcription
export const LANGUAGE_OPTIONS = [
  { value: "auto", title: "Auto-detect" },
  { value: "en", title: "English" },
  { value: "es", title: "Spanish" },
  { value: "fr", title: "French" },
  { value: "de", title: "German" },
  { value: "it", title: "Italian" },
  { value: "pt", title: "Portuguese" },
  { value: "zh", title: "Chinese" },
  { value: "ja", title: "Japanese" },
  { value: "ko", title: "Korean" },
  { value: "ru", title: "Russian" },
] as const;

// Sox Configuration
export const SOX_CONFIG = {
  CHANNELS: 1,           // Mono channel
  BIT_DEPTH: 16,         // 16-bit depth
  ENCODING: "signed-integer", // Signed integer encoding
  VERBOSE_LEVEL: 1,      // Verbose level for better error reporting
} as const;
