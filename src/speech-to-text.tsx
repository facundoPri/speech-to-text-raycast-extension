import { useState } from "react";
import { Action, ActionPanel, Detail, Icon, Clipboard, showToast, Toast, useNavigation } from "@raycast/api";
import { transcribeAudio } from "./utils/ai/transcription";
import { useAudioRecorder } from "./hooks/useAudioRecorder";

export default function Command() {
  const [transcriptionText, setTranscriptionText] = useState<string | null>(null);
  const [isTranscribing, setIsTranscribing] = useState(false);

  // Use our audio recorder hook
  const { isRecording, recordingDuration, recordingPath, soxInstalled, error, startRecording, stopRecording } =
    useAudioRecorder();

  const transcribeRecording = async () => {
    if (!recordingPath) return;

    try {
      setIsTranscribing(true);

      await showToast({
        style: Toast.Style.Animated,
        title: "Transcribing...",
        message: "Processing your audio with Groq",
      });

      const result = await transcribeAudio(recordingPath);
      setTranscriptionText(result.text);

      await showToast({
        style: Toast.Style.Success,
        title: "Transcription Complete",
        message: "Text copied to clipboard",
      });

      // Copy to clipboard
      await Clipboard.copy(result.text);

    } catch (error) {
      console.error("Transcription error:", error);

      await showToast({
        style: Toast.Style.Failure,
        title: "Transcription Failed",
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setIsTranscribing(false);
    }
  };

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const getMarkdown = () => {
    if (error) {
      return `# Error\n\n${error}`;
    }

    if (!soxInstalled) {
      return `# Sox Not Installed\n\nSox is required for audio recording. Please install it using:\n\n\`\`\`\nbrew install sox\n\`\`\`\n\nThen restart Raycast.`;
    }

    if (transcriptionText) {
      return `# Transcription Result\n\n${transcriptionText}\n\n*Recording duration: ${formatTime(recordingDuration)}*`;
    }

    if (isRecording) {
      return `# Recording in Progress\n\n⏺️ Recording... ${formatTime(recordingDuration)}\n\nPress **Stop Recording** when you're done.`;
    }

    if (recordingPath && !transcriptionText) {
      return `# Recording Complete\n\nRecording saved to: \`${recordingPath}\`\n\nDuration: ${formatTime(recordingDuration)}\n\nPress **Transcribe** to convert your audio to text.`;
    }

    return `# Speech to Text\n\nPress **Start Recording** to begin capturing audio.\n\nYour recording will be transcribed using Groq's API.`;
  };

  const handleNewRecording = () => {
    setTranscriptionText(null);
  };

  return (
    <Detail
      markdown={getMarkdown()}
      actions={
        <ActionPanel>
          {!isRecording && !recordingPath && soxInstalled && (
            <Action
              title="Start Recording"
              icon={Icon.Microphone}
              onAction={startRecording}
              shortcut={{ modifiers: ["cmd"], key: "r" }}
            />
          )}

          {isRecording && (
            <Action
              title="Stop Recording"
              icon={Icon.Stop}
              onAction={stopRecording}
              shortcut={{ modifiers: ["cmd"], key: "s" }}
            />
          )}

          {recordingPath && !isRecording && !transcriptionText && (
            <Action
              title={isTranscribing ? "Transcribing…" : "Transcribe"}
              icon={Icon.Text}
              onAction={transcribeRecording}
              shortcut={{ modifiers: ["cmd"], key: "t" }}
            />
          )}

          {transcriptionText && (
            <Action
              title="Copy to Clipboard"
              icon={Icon.Clipboard}
              onAction={() => Clipboard.copy(transcriptionText)}
              shortcut={{ modifiers: ["cmd"], key: "c" }}
            />
          )}

          {recordingPath && (
            <Action
              title="New Recording"
              icon={Icon.Plus}
              onAction={handleNewRecording}
              shortcut={{ modifiers: ["cmd"], key: "n" }}
            />
          )}

        </ActionPanel>
      }
      isLoading={isTranscribing}
    />
  );
}
