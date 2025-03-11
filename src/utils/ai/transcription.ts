import Groq from "groq-sdk";
import fs from "fs-extra";
import { getPreferenceValues } from "@raycast/api";
import { Preferences } from "../../types";

/**
 * Transcribes an audio file using Groq's API
 * @param filePath Path to the audio file
 * @returns Transcription result with text and metadata
 */
export async function transcribeAudio(filePath: string) {
  const preferences = getPreferenceValues<Preferences>();

  if (!preferences.apiKey) {
    throw new Error("Groq API key is not set. Please set it in the extension preferences.");
  }

  // Create a Groq client with the API key
  const client = new Groq({
    apiKey: preferences.apiKey,
  });

  try {
    // Read the audio file
    const fileBuffer = fs.createReadStream(filePath);

    // Create a transcription of the audio file
    const transcription = await client.audio.transcriptions.create({
      file: fileBuffer,
      model: preferences.model || "whisper-large-v3-turbo",
      response_format: "verbose_json",
    });

    return {
      text: transcription.text,
    };
  } catch (error) {
    console.error("Transcription error:", error);
    throw new Error(`Failed to transcribe audio: ${error instanceof Error ? error.message : String(error)}`);
  }
}
