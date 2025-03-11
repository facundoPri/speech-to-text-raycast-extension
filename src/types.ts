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
  transcription: string | null;
}