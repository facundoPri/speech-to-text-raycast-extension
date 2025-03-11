import { useState, useEffect, useRef, useCallback } from "react";
import { showToast, Toast } from "@raycast/api";
import {
  checkSoxInstalled,
  generateAudioFilename,
  ensureTempDirectory,
  createRecordingProcess,
  verifyRecordingFile,
} from "../utils/audio";
import { RECORDING_MAX_DURATION } from "../constants";

export interface AudioRecorderHook {
  isRecording: boolean;
  recordingDuration: number;
  recordingPath: string | null;
  soxInstalled: boolean | null;
  error: string | null;
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<string | null>;
}

/**
 * Hook for recording audio using Sox
 * @returns AudioRecorderHook with recording state and methods
 */
export function useAudioRecorder(): AudioRecorderHook {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [recordingPath, setRecordingPath] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [soxInstalled, setSoxInstalled] = useState<boolean | null>(null);

  const recordingProcessRef = useRef<ReturnType<typeof createRecordingProcess> | null>(null);
  const durationInterval = useRef<NodeJS.Timeout | null>(null);
  const soxPathRef = useRef<string | null>(null);

  // Check if Sox is installed on mount
  useEffect(() => {
    async function checkSox() {
      const soxPath = await checkSoxInstalled();
      soxPathRef.current = soxPath;
      setSoxInstalled(!!soxPath);
      if (!soxPath) {
        setError("Sox is not installed. Please install it using 'brew install sox' and restart Raycast.");
      }
    }

    checkSox();

    // Cleanup on unmount
    return () => {
      if (isRecording) {
        stopRecording();
      }
    };
  }, []);

  /**
   * Start recording audio
   */
  const startRecording = useCallback(async () => {
    if (isRecording || !soxPathRef.current) return;

    try {
      setError(null);
      setIsRecording(true);
      setRecordingDuration(0);

      // Start timer to track recording duration
      durationInterval.current = setInterval(() => {
        setRecordingDuration((prev) => prev + 1);
      }, 1000);

      // Show recording toast
      await showToast({
        style: Toast.Style.Animated,
        title: "Recording...",
        message: "Press Stop when you're done",
      });

      // Ensure temp directory exists and generate filename
      const tempDir = await ensureTempDirectory();
      const filePath = generateAudioFilename(tempDir);
      setRecordingPath(filePath);

      // Start the recording process
      recordingProcessRef.current = createRecordingProcess(soxPathRef.current, filePath, RECORDING_MAX_DURATION);

      // Handle process exit for max duration reached
      recordingProcessRef.current.once("close", () => {
        if (isRecording) {
          setIsRecording(false);
          if (durationInterval.current) {
            clearInterval(durationInterval.current);
            durationInterval.current = null;
          }

          showToast({
            style: Toast.Style.Success,
            title: "Recording Complete",
            message: "Maximum duration reached",
          });
        }
      });
    } catch (error) {
      console.error("Error starting recording:", error);
      setError(error instanceof Error ? error.message : String(error));
      setIsRecording(false);
      if (durationInterval.current) {
        clearInterval(durationInterval.current);
        durationInterval.current = null;
      }

      await showToast({
        style: Toast.Style.Failure,
        title: "Recording Failed",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }, [isRecording]);

  /**
   * Stop recording audio
   * @returns Path to the recorded file or null if failed
   */
  const stopRecording = useCallback(async (): Promise<string | null> => {
    if (!isRecording || !recordingProcessRef.current || !recordingPath) return null;

    try {
      // Kill the recording process
      recordingProcessRef.current.kill();
      recordingProcessRef.current = null;

      // Clear the duration interval
      if (durationInterval.current) {
        clearInterval(durationInterval.current);
        durationInterval.current = null;
      }

      setIsRecording(false);

      // Verify the recording file
      await verifyRecordingFile(recordingPath);

      await showToast({
        style: Toast.Style.Success,
        title: "Recording Complete",
        message: `Duration: ${recordingDuration} seconds`,
      });

      return recordingPath;
    } catch (error) {
      console.error("Error stopping recording:", error);
      setError(error instanceof Error ? error.message : String(error));

      await showToast({
        style: Toast.Style.Failure,
        title: "Recording Failed",
        message: error instanceof Error ? error.message : String(error),
      });

      setIsRecording(false);
      recordingProcessRef.current = null;
      return null;
    }
  }, [isRecording, recordingPath, recordingDuration]);

  return {
    isRecording,
    recordingDuration,
    recordingPath,
    soxInstalled,
    error,
    startRecording,
    stopRecording,
  };
}
