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

    // Save the transcription to a JSON file
    await saveTranscription(filePath, transcription.text);

    return {
      text: transcription.text,
    };
  } catch (error) {
    console.error("Transcription error:", error);
    throw new Error(`Failed to transcribe audio: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Saves transcription result to a JSON file
 * @param audioFilePath Path to the original audio file
 * @param transcriptionText The transcription text
 * @returns Path to the saved transcription file
 */
export async function saveTranscription(audioFilePath: string, transcriptionText: string): Promise<string> {
  const transcriptionFilePath = audioFilePath.replace(/\.[^.]+$/, ".json");
  
  const transcriptionData = {
    text: transcriptionText,
    timestamp: new Date().toISOString(),
    audioFile: audioFilePath
  };
  
  await fs.writeJSON(transcriptionFilePath, transcriptionData, { spaces: 2 });
  return transcriptionFilePath;
}

/**
 * Loads a saved transcription from a JSON file
 * @param audioFilePath Path to the audio file
 * @returns Transcription data or null if not found
 */
export async function loadTranscription(audioFilePath: string): Promise<{ text: string; timestamp: string } | null> {
  const transcriptionFilePath = audioFilePath.replace(/\.[^.]+$/, ".json");
  
  try {
    if (await fs.pathExists(transcriptionFilePath)) {
      return await fs.readJSON(transcriptionFilePath);
    }
    return null;
  } catch (error) {
    console.error(`Error loading transcription for ${audioFilePath}:`, error);
    return null;
  }
}
