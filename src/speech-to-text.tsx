import { useState, useEffect } from "react";
import {
  Action, 
  ActionPanel,
  Form,
  Clipboard,
  showToast,
  Toast,
  open,
  getPreferenceValues
} from "@raycast/api";
import { useForm } from "@raycast/utils";
import { transcribeAudio } from "./utils/ai/transcription";
import { useAudioRecorder } from "./hooks/useAudioRecorder";
import { Preferences } from "./types";
import { LANGUAGE_OPTIONS } from "./constants";

interface TranscriptFormValues {
  transcription: string;
  language: string;
}

export default function Command() {
  const [isTranscribing, setIsTranscribing] = useState(false);
  const preferences = getPreferenceValues<Preferences>();

  // Use our audio recorder hook
  const { isRecording, recordingDuration, error, startRecording, stopRecording } =
    useAudioRecorder();

  // Form for transcription
  const { handleSubmit, itemProps, setValue, values } = useForm<TranscriptFormValues>({
    onSubmit: (values) => {
      Clipboard.copy(values.transcription);
      showToast({
        style: Toast.Style.Success,
        title: "Copied to clipboard",
      });
    },
    initialValues: {
      transcription: "",
      language: preferences.language || "auto",
    },
  });

  const handleStopRecording = async () => {
    const recordingFilePath = await stopRecording();
    
    if (recordingFilePath) {
      try {
        setIsTranscribing(true);
        
        // Determine the language title for the toast
        const languageTitle = values.language === "auto" 
          ? "Auto-detect" 
          : LANGUAGE_OPTIONS.find(option => option.value === values.language)?.title || "Auto-detect";
        
        // Show a toast with transcription info
        await showToast({
          style: Toast.Style.Animated,
          title: "Transcribing...",
          message: `Language: ${languageTitle}`,
        });
        
        // Pass the selected language to the transcription function
        const result = await transcribeAudio(recordingFilePath, values.language);
        setValue("transcription", result.text);
        
        // Copy to clipboard automatically
        await Clipboard.copy(result.text);
        
        await showToast({
          style: Toast.Style.Success,
          title: "Transcription complete",
          message: "Text copied to clipboard",
        });
      } catch (error) {
        console.error("Transcription error:", error);
        await showToast({
          style: Toast.Style.Failure,
          title: "Transcription failed",
          message: error instanceof Error ? error.message : "Unknown error",
        });
      } finally {
        setIsTranscribing(false);
      }
    }
  };

  const handleNewRecording = () => {
    setValue("transcription", "");
    startRecording();
  };
  
  // Handle errors
  useEffect(() => {
    if (error) {
      showToast({
        style: Toast.Style.Failure,
        title: "Error",
        message: error,
      });
    }
  }, [error]);

  // Format recording duration nicely
  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Get appropriate placeholder text
  const getPlaceholder = () => {
    if (isRecording) {
      return `Recording in progress... (${formatDuration(recordingDuration)})`;
    }
    if (isTranscribing) {
      return "Transcribing your audio...";
    }
    return "Start recording with ⌘+R";
  };

  // Get form title with status indicator
  const getTitle = () => {
    if (isRecording) {
      return "Recording";
    }
    if (isTranscribing) {
      return "Transcribing";
    }
    return "Speech to Text";
  };

  return (
    <Form
      isLoading={isTranscribing}
      actions={
        <ActionPanel>
          {!isRecording && (
            <Action
              title="Start Recording"
              onAction={handleNewRecording}
              shortcut={{ modifiers: ["cmd"], key: "r" }}
            />
          )}
          
          {isRecording && (
            <Action
              title="Stop Recording"
              onAction={handleStopRecording}
              shortcut={{ modifiers: ["cmd"], key: "s" }}
            />
          )}
          
          <Action.SubmitForm 
            title="Copy to Clipboard" 
            onSubmit={handleSubmit} 
            shortcut={{ modifiers: ["cmd"], key: "c" }}
          />
          
          <Action
            title="New Recording"
            onAction={handleNewRecording}
            shortcut={{ modifiers: ["cmd"], key: "n" }}
          />
          
          <Action
            title="View History"
            onAction={() => open("raycast://extensions/facundo_prieto/speech-to-text/transcription-history")}
            shortcut={{ modifiers: ["cmd", "shift"], key: "h" }}
          />
        </ActionPanel>
      }
    >
      {/* Language dropdown for quick selection */}
      <Form.Dropdown
        {...itemProps.language}
        title="Language"
        info="Select a language for better transcription accuracy"
      >
        {LANGUAGE_OPTIONS.map(option => (
          <Form.Dropdown.Item 
            key={option.value} 
            value={option.value} 
            title={option.title} 
          />
        ))}
      </Form.Dropdown>
      
      <Form.TextArea
        {...itemProps.transcription}
        title={getTitle()}
        placeholder={getPlaceholder()}
        enableMarkdown={false}
        autoFocus
      />
    </Form>
  );
}
