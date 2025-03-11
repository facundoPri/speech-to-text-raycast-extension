import { useState, useEffect, useRef } from "react";
import { ChildProcess, spawn } from "child_process";
import { 
  generateAudioFilename, 
  ensureTempDirectory, 
  checkSoxInstalled, 
  buildSoxCommand,
  validateAudioFile,
} from "../utils/audio";
import { showToast, Toast } from "@raycast/api";
import { ErrorTypes } from "../types";

interface AudioRecorderHook {
  isRecording: boolean;
  recordingDuration: number;
  recordingPath: string | null;
  error: string | null;
  startRecording: () => Promise<string | null>;
  stopRecording: () => Promise<string | null>;
}

/**
 * Hook for recording audio using Sox
 * @returns AudioRecorderHook
 */
export function useAudioRecorder(): AudioRecorderHook {
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [recordingDuration, setRecordingDuration] = useState<number>(0);
  const [recordingPath, setRecordingPath] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  const recordingProcess = useRef<ChildProcess | null>(null);
  const durationInterval = useRef<NodeJS.Timeout | null>(null);
  
  // Check Sox installation on mount
  useEffect(() => {
    const checkSox = async () => {
      const soxPath = await checkSoxInstalled();
      if (!soxPath) {
        setError(ErrorTypes.SOX_NOT_INSTALLED);
      }
    };
    
    checkSox();
    
    // Cleanup on unmount
    return () => {
      if (isRecording) {
        stopRecording();
      }
    };
  }, []);

  /**
   * Shows a toast notification for an error without setting the error state
   */
  const showErrorToast = async (title: string, message: string): Promise<void> => {
    await showToast({
      style: Toast.Style.Failure,
      title,
      message,
    });
  };
  
  /**
   * Start recording audio
   * @returns Promise<string | null> Path to the recording file or null if failed
   */
  const startRecording = async (): Promise<string | null> => {
    // Clear any previous errors
    setError(null);
    
    // Check if already recording
    if (isRecording) {
      await showErrorToast("Already Recording", "A recording is already in progress");
      return null;
    }
    
    // Check if Sox is installed
    const soxPath = await checkSoxInstalled();
    if (!soxPath) {
      setError(ErrorTypes.SOX_NOT_INSTALLED);
      return null;
    }
    
    try {
      // Generate a unique filename
      const tempDir = await ensureTempDirectory();
      const outputPath = generateAudioFilename(tempDir);
      console.log("Recording to file:", outputPath);
      setRecordingPath(outputPath);
      
      // Start recording using Sox
      console.log("Starting recording with Sox");
      recordingProcess.current = spawn(soxPath, buildSoxCommand(outputPath));
      
      // Add event listeners for debugging
      recordingProcess.current.stdout?.on('data', (data) => {
        console.log(`Sox stdout: ${data}`);
      });
      
      recordingProcess.current.stderr?.on('data', (data) => {
        console.error(`Sox stderr: ${data}`);
      });
      
      recordingProcess.current?.on('error', (error) => {
        console.error(`Sox process error: ${error.message}`);
        setError(`${ErrorTypes.RECORDING_PROCESS_ERROR}: ${error.message}`);
        
        // Cleanup
        if (durationInterval.current) {
          clearInterval(durationInterval.current);
          durationInterval.current = null;
        }
        
        setIsRecording(false);
      });
      
      recordingProcess.current?.on('close', (code) => {
        console.log(`Sox process exited with code ${code}`);
        
        // If code is non-zero and we're still recording, it's an unexpected exit
        if (code !== 0 && isRecording) {
          setError(`Recording process exited unexpectedly with code ${code}`);
          
          // Cleanup
          if (durationInterval.current) {
            clearInterval(durationInterval.current);
            durationInterval.current = null;
          }
          
          setIsRecording(false);
        }
      });
      
      // Start timer to track recording duration
      setRecordingDuration(0);
      durationInterval.current = setInterval(() => {
        setRecordingDuration((prev) => prev + 1);
      }, 1000);
      
      setIsRecording(true);
      
      await showToast({
        style: Toast.Style.Success,
        title: "Recording started",
      });
      
      return outputPath;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error("Error starting recording:", error);
      
      setError(`${ErrorTypes.RECORDING_START_ERROR}: ${errorMessage}`);
      return null;
    }
  };
  
  /**
   * Stop recording audio
   * @returns Promise<string | null> Path to the recording file or null if failed
   */
  const stopRecording = async (): Promise<string | null> => {
    if (!isRecording || !recordingProcess.current) {
      return null;
    }
    
    const currentRecordingPath = recordingPath;
    console.log("Stopping recording, current path:", currentRecordingPath);
    
    try {
      // Stop the recording process
      recordingProcess.current.kill();
      recordingProcess.current = null;
      
      // Clear the duration interval
      if (durationInterval.current) {
        clearInterval(durationInterval.current);
        durationInterval.current = null;
      }
      
      setIsRecording(false);
      
      // Add a small delay to ensure the file is completely written
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Check if the recording file exists and is valid
      if (currentRecordingPath) {
        const validationResult = await validateAudioFile(currentRecordingPath);
        
        if (!validationResult.isValid) {
          setError(validationResult.error ?? ErrorTypes.INVALID_RECORDING);
          return null;
        }
        
        await showToast({
          style: Toast.Style.Success,
          title: "Recording stopped",
          message: `Duration: ${recordingDuration} seconds`,
        });
        
        console.log("Returning recording path:", currentRecordingPath);
        return currentRecordingPath;
      } else {
        setError(ErrorTypes.NO_RECORDING_FILE);
        return null;
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error("Error stopping recording:", error);
      
      setError(`${ErrorTypes.RECORDING_STOP_ERROR}: ${errorMessage}`);
      setIsRecording(false);
      return null;
    }
  };
  
  return {
    isRecording,
    recordingDuration,
    recordingPath,
    error,
    startRecording,
    stopRecording,
  };
}