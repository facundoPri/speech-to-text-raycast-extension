export interface Preferences {
  apiKey: string;
  model: string;
  tempDirectory?: string;
}

export interface TranscriptionFile {
  id: string;
  filePath: string;
  fileName: string;
  recordedAt: Date;
  duration: number;
  sizeInBytes: number;
  wordCount: number;
  transcription: string | null;
}

export interface TranscriptionResult {
  text: string;
  timestamp: string;
  audioFile?: string;
}
