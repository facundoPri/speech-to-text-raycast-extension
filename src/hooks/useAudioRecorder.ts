import { useState, useEffect, useRef } from "react";
import { ChildProcess, exec, spawn } from "child_process";
import fs from "fs";
import { generateAudioFilename, ensureTempDirectory } from "../utils/audio";
import { RECORDING_SAMPLE_RATE } from "../constants";
import { showToast, Toast } from "@raycast/api";

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
        setError("Sox is not installed. Please install it using 'brew install sox' and restart Raycast.");
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
   * Check if Sox is installed
   */
  const checkSoxInstalled = async (): Promise<string | null> => {
    return new Promise((resolve) => {
      // Try to execute Sox with the version flag to check if it's available
      exec(`which sox || ([ -f /usr/bin/sox ] && echo /usr/bin/sox) || ([ -f /usr/local/bin/sox ] && echo /usr/local/bin/sox) || ([ -f /opt/homebrew/bin/sox ] && echo /opt/homebrew/bin/sox)`, (error, stdout) => {
        if (error || !stdout.trim()) {
          console.error("Sox not found:", error);
          resolve(null);
        } else {
          const soxPath = stdout.trim();
          console.log("Sox found at:", soxPath);
          resolve(soxPath);
        }
      });
    });
  };
  
  /**
   * Start recording audio
   * @returns Promise<string | null> Path to the recording file or null if failed
   */
  const startRecording = async (): Promise<string | null> => {
    if (isRecording) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Already recording",
      });
      return null;
    }
    
    // Check if Sox is installed
    const soxPath = await checkSoxInstalled();
    if (!soxPath) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Sox not installed or not found",
        message: "Please install Sox using 'brew install sox' and restart Raycast",
      });
      return null;
    }
    
    try {
      setError(null);
      // Generate a unique filename
      const tempDir = await ensureTempDirectory();
      const outputPath = generateAudioFilename(tempDir);
      console.log("Recording to file:", outputPath);
      setRecordingPath(outputPath);
      
      // Start recording using Sox
      console.log("Starting recording with Sox");
      recordingProcess.current = spawn("sox", [
        "-d",                // Use default audio input device
        "-c", "1",           // Mono channel
        "-r", String(RECORDING_SAMPLE_RATE),       // 16kHz sample rate
        "-b", "16",          // 16-bit depth
        "-e", "signed-integer", // Signed integer encoding
        outputPath           // Output file path
      ]);
      
      // Add event listeners for debugging
      recordingProcess.current.stdout?.on('data', (data) => {
        console.log(`Sox stdout: ${data}`);
      });
      
      recordingProcess.current.stderr?.on('data', (data) => {
        console.error(`Sox stderr: ${data}`);
      });
      
      recordingProcess.current?.on('error', (error) => {
        console.error(`Sox process error: ${error.message}`);
        showToast({
          style: Toast.Style.Failure,
          title: "Recording error",
          message: error.message,
        });
      });
      
      recordingProcess.current?.on('close', (code) => {
        console.log(`Sox process exited with code ${code}`);
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
      console.error("Error starting recording:", error);
      await showToast({
        style: Toast.Style.Failure,
        title: "Failed to start recording",
        message: String(error),
      });
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
      setError(null);
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
      
      // Check if the recording file exists
      if (currentRecordingPath && fs.existsSync(currentRecordingPath)) {
        const stats = fs.statSync(currentRecordingPath);
        console.log("Recording file size:", stats.size, "bytes");
        
        if (stats.size === 0) {
          setError("The recording file is empty");
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
        await showToast({
          style: Toast.Style.Failure,
          title: "Recording failed",
          message: "No recording file was created",
        });
        return null;
      }
    } catch (error) {
      console.error("Error stopping recording:", error);
      await showToast({
        style: Toast.Style.Failure,
        title: "Failed to stop recording",
        message: String(error),
      });
      
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
