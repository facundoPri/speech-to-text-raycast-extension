import Groq from "groq-sdk";
import fs from "fs-extra";
import { getPreferenceValues } from "@raycast/api";
import { Preferences, TranscriptionResult } from "../../types";

/**
 * Transcribes an audio file using Groq's API
 * @param filePath Path to the audio file
 * @param overrideLanguage Optional language to override the preference setting
 * @returns Transcription result with text and metadata
 * @throws Error When transcription fails
 */
export async function transcribeAudio(filePath: string, overrideLanguage?: string): Promise<TranscriptionResult> {
  const preferences = getPreferenceValues<Preferences>();

  if (!preferences.apiKey) {
    throw new Error("Groq API key is not set. Please set it in the extension preferences.");
  }

  try {
    // Create a Groq client with the API key
    const client = new Groq({
      apiKey: preferences.apiKey,
    });

    // Read the audio file
    const fileBuffer = fs.createReadStream(filePath);

    // Create a transcription request with optional language parameter
    const transcriptionOptions: {
      file: fs.ReadStream;
      model: string;
      response_format: "verbose_json" | "json" | "text";
      language?: string;
    } = {
      file: fileBuffer,
      model: preferences.model || "whisper-large-v3-turbo",
      response_format: "verbose_json",
    };

    // Use the override language if provided, otherwise use preferences
    const language = overrideLanguage ?? preferences.language;
    
    // Add language parameter if it's not set to auto
    if (language && language !== "auto") {
      transcriptionOptions.language = language;
    }

    // Create a transcription of the audio file
    const transcription = await client.audio.transcriptions.create(transcriptionOptions);

    // Save the transcription to a JSON file
    const result: TranscriptionResult = {
      text: transcription.text,
      timestamp: new Date().toISOString(),
    };

    await saveTranscription(filePath, result);

    return result;
  } catch (error) {
    // Check for rate limit errors
    if (error instanceof Error && 
        (error.message.includes("rate limit") || 
         error.message.includes("429") || 
         error.message.includes("too many requests"))) {
      throw new Error(
        "Groq API rate limit exceeded. Please try again later or reduce the length of your audio file."
      );
    }
    
    // Handle other API errors
    if (error instanceof Error && error.message.includes("400")) {
      throw new Error(
        "The API couldn't process this audio file. It might be corrupted or in an unsupported format."
      );
    }
    
    console.error("Transcription error:", error);
    throw new Error(`Failed to transcribe audio: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Saves transcription result to a JSON file
 * @param audioFilePath Path to the original audio file
 * @param transcriptionData The transcription data to save
 * @returns Path to the saved transcription file
 * @throws Error When saving fails
 */
export async function saveTranscription(
  audioFilePath: string, 
  transcriptionData: TranscriptionResult
): Promise<string> {
  const transcriptionFilePath = audioFilePath.replace(/\.[^.]+$/, ".json");
  
  const dataToSave = {
    ...transcriptionData,
    audioFile: audioFilePath
  };
  
  try {
    await fs.writeJSON(transcriptionFilePath, dataToSave, { spaces: 2 });
    return transcriptionFilePath;
  } catch (error) {
    console.error(`Error saving transcription for ${audioFilePath}:`, error);
    throw new Error(`Failed to save transcription: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Loads a saved transcription from a JSON file
 * @param audioFilePath Path to the audio file
 * @returns Transcription data or null if not found
 */
export async function loadTranscription(audioFilePath: string): Promise<TranscriptionResult | null> {
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
