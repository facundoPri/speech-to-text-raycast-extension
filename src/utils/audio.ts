import { execSync, spawn, ChildProcess } from "child_process";
import fs from "fs-extra";
import path from "path";
import { DEFAULT_TEMP_DIR, RECORDING_FILE_FORMAT, RECORDING_MAX_DURATION, RECORDING_SAMPLE_RATE } from "../constants";

export interface RecordingProcess {
  filePath: string;
  process: ChildProcess;
  stop: () => Promise<string>;
}

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
 * Creates a recording process using sox
 * @param soxPath Path to the sox executable
 * @param filePath Path to save the recording
 * @param duration Maximum recording duration in seconds
 * @returns ChildProcess instance
 */
export function createRecordingProcess(
  soxPath: string,
  filePath: string,
  duration: number = RECORDING_MAX_DURATION,
): ChildProcess {
  return spawn(soxPath, [
    "-d", // Use default audio input device
    "-r",
    String(RECORDING_SAMPLE_RATE), // Sample rate
    filePath, // Output file path
    "trim",
    "0",
    String(duration), // Duration
  ]);
}

/**
 * Verifies that a recording file exists and has content
 * @param filePath Path to the recording file
 * @throws Error if file doesn't exist or is empty
 */
export async function verifyRecordingFile(filePath: string): Promise<void> {
  try {
    const stats = await fs.stat(filePath);
    if (stats.size === 0) {
      throw new Error("Recording file is empty. Please check your microphone permissions.");
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes("empty")) {
      throw error;
    }
    throw new Error(`Failed to verify recording: ${error instanceof Error ? error.message : String(error)}`);
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
 * Cleans up old audio files from the temp directory
 * @param directory Directory to clean
 * @param maxAge Maximum age of files to keep (in milliseconds)
 */
export async function cleanupOldAudioFiles(
  directory: string = DEFAULT_TEMP_DIR,
  maxAge: number = 24 * 60 * 60 * 1000, // 24 hours
): Promise<void> {
  try {
    const now = Date.now();
    const files = await listAudioFiles(directory);

    for (const file of files) {
      try {
        const stats = await fs.stat(file);
        const fileAge = now - stats.mtimeMs;

        if (fileAge > maxAge) {
          await fs.unlink(file);
          console.log(`Deleted old recording: ${file}`);
        }
      } catch (error) {
        console.error(`Error processing file ${file}:`, error);
      }
    }
  } catch (error) {
    console.error("Error cleaning up old audio files:", error);
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