import { execSync } from "child_process";
import fs from "fs-extra";
import path from "path";
import { DEFAULT_TEMP_DIR, RECORDING_FILE_FORMAT, RECORDING_SAMPLE_RATE, SOX_CONFIG } from "../constants";
import { AudioValidationResult, ErrorTypes } from "../types";

const MIN_VALID_FILE_SIZE = 1024; // 1KB

/**
 * Ensures the temporary directory exists
 * @param directory Directory path to ensure
 */
export async function ensureTempDirectory(directory: string = DEFAULT_TEMP_DIR): Promise<string> {
  await fs.ensureDir(directory);
  return directory;
}

/**
 * Generates a unique filename for recording
 * @param directory Directory to save the file
 * @returns Full path to the new file
 */
export function generateAudioFilename(directory: string = DEFAULT_TEMP_DIR): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  return path.join(directory, `recording-${timestamp}.${RECORDING_FILE_FORMAT}`);
}

/**
 * Check if Sox is installed and return the path
 * @returns Path to Sox executable or null if not found
 */
export async function checkSoxInstalled(): Promise<string | null> {
  try {
    // Try multiple ways to find Sox
    const soxPath = execSync(
      `which sox || ([ -f /usr/bin/sox ] && echo /usr/bin/sox) || ([ -f /usr/local/bin/sox ] && echo /usr/local/bin/sox) || ([ -f /opt/homebrew/bin/sox ] && echo /opt/homebrew/bin/sox)`,
      { encoding: "utf8" },
    ).trim();

    if (soxPath) {
      console.log("Sox found at:", soxPath);
      return soxPath;
    }
    return null;
  } catch (error) {
    console.error("Sox not found:", error);
    return null;
  }
}

/**
 * Lists all audio files in the temp directory
 * @param directory Directory to list files from
 * @returns Array of file paths
 */
export async function listAudioFiles(directory: string = DEFAULT_TEMP_DIR): Promise<string[]> {
  await ensureTempDirectory(directory);
  const files = await fs.readdir(directory);
  const audioFiles = files
    .filter((file) => file.endsWith(`.${RECORDING_FILE_FORMAT}`))
    .map((file) => path.join(directory, file));
  return audioFiles;
}

/**
 * Validates an audio file to ensure it exists and has content
 * @param filePath Path to the audio file
 * @returns Object with validation result and optional error message
 */
export async function validateAudioFile(filePath: string): Promise<AudioValidationResult> {
  try {
    // Check if file exists
    if (!await fs.pathExists(filePath)) {
      return { isValid: false, error: ErrorTypes.AUDIO_FILE_MISSING };
    }
    
    // Check file size
    const stats = await fs.stat(filePath);
    if (stats.size === 0) {
      return { isValid: false, error: ErrorTypes.AUDIO_FILE_EMPTY };
    }
    
    if (stats.size < MIN_VALID_FILE_SIZE) {
      return { isValid: false, error: ErrorTypes.AUDIO_FILE_TOO_SMALL };
    }
    
    // Try to validate with Sox if possible
    const soxPath = await checkSoxInstalled();
    if (soxPath) {
      try {
        // This will throw an error if the file is not a valid audio file
        execSync(`${soxPath} --i "${filePath}"`, { stdio: 'pipe' });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return { 
          isValid: false, 
          error: `${ErrorTypes.AUDIO_FILE_INVALID_FORMAT}: ${errorMessage}` 
        };
      }
    }
    
    return { isValid: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return { 
      isValid: false, 
      error: `${ErrorTypes.AUDIO_FILE_VALIDATION_ERROR}: ${errorMessage}` 
    };
  }
}


async function estimateDurationFromFileSize(filePath: string): Promise<number> {
  const { size } = await fs.stat(filePath);
  const sampleRate = RECORDING_SAMPLE_RATE; // Use the constant from our config
  const bytesPerSample = 2; // 16-bit audio = 2 bytes per sample
  return Math.round(size / (sampleRate * bytesPerSample));
}

export async function getAudioDuration(filePath: string): Promise<number> {
  try {
    const soxPath = await checkSoxInstalled();
    if (!soxPath) {
      console.log("Sox not found, falling back to file size estimation");
      return estimateDurationFromFileSize(filePath);
    }

    const stdout = await execSync(`${soxPath} --i -D "${filePath}"`);
    const duration = parseFloat(stdout.toString().trim());
    
    if (isNaN(duration) || duration <= 0) {
      throw new Error("Invalid duration returned by Sox");
    }
    
    return Math.round(duration);
  } catch (error) {
    console.error(`Error getting duration for ${filePath}:`, error);
    
    try {
      return await estimateDurationFromFileSize(filePath);
    } catch (fallbackError) {
      throw new Error(
        `Failed to get audio duration: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
}

/**
 * Builds the Sox command arguments for recording
 * @param outputPath Path where the recording will be saved
 * @returns Array of command arguments for Sox
 */
export function buildSoxCommand(outputPath: string): string[] {
  return [
    "-d",                // Use default audio input device
    "-c", String(SOX_CONFIG.CHANNELS),
    "-r", String(RECORDING_SAMPLE_RATE),
    "-b", String(SOX_CONFIG.BIT_DEPTH),
    "-e", SOX_CONFIG.ENCODING,
    "-V" + String(SOX_CONFIG.VERBOSE_LEVEL), // Verbose level for better error reporting
    outputPath           // Output file path
  ];
}