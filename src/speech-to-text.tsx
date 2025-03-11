import { useState, useEffect } from "react";
import {
  Action, 
  ActionPanel,
  Detail,
  Icon,
  Clipboard,
  showToast,
  Toast,
  Color,
  Alert,
  confirmAlert,
  Form 
} from "@raycast/api";
import { useForm } from "@raycast/utils";
import { transcribeAudio } from "./utils/ai/transcription";
import { useAudioRecorder } from "./hooks/useAudioRecorder";

interface TranscriptFormValues {
  transcription: string;
}

export default function Command() {
  const [isEditing, setIsEditing] = useState(false);
  const [transcriptionText, setTranscriptionText] = useState<string | null>(null);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [viewMode, setViewMode] = useState<"recording" | "transcript" | "welcome">("welcome");

  // Form for editing transcription
  const { handleSubmit, itemProps, setValue, reset } = useForm<TranscriptFormValues>({
    onSubmit: (values) => {
      setTranscriptionText(values.transcription);
      setIsEditing(false);
    },
    initialValues: {
      transcription: "",
    },
    validation: {
      transcription: (value) => {
        if (!value) return "Transcription cannot be empty";
        return undefined;
      },
    },
  });

  // Use our audio recorder hook
  const { isRecording, recordingDuration, recordingPath, soxInstalled, error, startRecording, stopRecording } =
    useAudioRecorder();

  // Update view mode based on state
  useEffect(() => {
    if (isRecording || recordingPath) {
      setViewMode("recording");
    } else if (transcriptionText) {
      setViewMode("transcript");
    } else {
      setViewMode("welcome");
    }
  }, [isRecording, recordingPath, transcriptionText]);

  // Update form values when transcription changes
  useEffect(() => {
    if (transcriptionText) {
      setValue("transcription", transcriptionText);
    }
  }, [transcriptionText, setValue]);

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
      setValue("transcription", result.text);

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

  const handleNewRecording = async () => {
    if (transcriptionText) {
      const shouldContinue = await confirmAlert({
        title: "Start New Recording?",
        message: "This will discard your current transcription. Are you sure you want to continue?",
        primaryAction: {
          title: "Continue",
          style: Alert.ActionStyle.Destructive,
        },
      });

      if (!shouldContinue) return;
    }

    setTranscriptionText(null);
    reset({
      transcription: "",
    });
  };

  const editTranscript = () => {
    setIsEditing(true);
  };

  const cancelEditing = () => {
    setValue("transcription", transcriptionText || "");
    setIsEditing(false);
  };

  const renderEditForm = () => {
    return (
      <Form
        isLoading={isTranscribing}
        actions={
          <ActionPanel>
            <Action.SubmitForm title="Save Changes" icon={Icon.Check} onSubmit={handleSubmit} />
            <Action title="Cancel" icon={Icon.XMarkCircle} onAction={cancelEditing} />
          </ActionPanel>
        }
      >
        <Form.TextArea
          {...itemProps.transcription}
          title="Transcription"
          placeholder="Your transcription will appear here"
          enableMarkdown
          autoFocus
        />
      </Form>
    );
  };

  const getMarkdown = () => {
    if (error) {
      return `# ❌ Error\n\n${error}`;
    }

    if (!soxInstalled) {
      return `# 🔍 Sox Not Installed\n\nSox is required for audio recording. Please install it using:\n\n\`\`\`\nbrew install sox\n\`\`\`\n\nThen restart Raycast.`;
    }

    if (isEditing) {
      return "";
    }

    if (viewMode === "transcript" && transcriptionText) {
      return `# 📝 Transcription Result\n\n${transcriptionText}\n\n---\n\n*Recording duration: ${formatTime(recordingDuration)}*`;
    }

    if (isRecording) {
      return `# 🎙️ Recording in Progress\n\n${getRecordingIndicator()} **Recording... ${formatTime(recordingDuration)}**\n\nPress **Stop Recording** when you're done.`;
    }

    if (viewMode === "recording" && recordingPath && !transcriptionText) {
      return `# ✅ Recording Complete\n\n**Recording saved to:** \`${recordingPath}\`\n\n**Duration:** ${formatTime(recordingDuration)}\n\nPress **Transcribe** to convert your audio to text.`;
    }

    return `# 🎤 Speech to Text\n\nWelcome to Speech to Text! This extension allows you to record audio and transcribe it to text using Groq's API.\n\n## Getting Started\n\n1. Press **Start Recording** to begin capturing audio\n2. Speak clearly into your microphone\n3. Press **Stop Recording** when you're done\n4. Press **Transcribe** to convert your audio to text\n\n*Keyboard Shortcuts*\n- Start Recording: ⌘ + R\n- Stop Recording: ⌘ + S\n- Transcribe: ⌘ + T\n- Copy Text: ⌘ + C`;
  };

  const getRecordingIndicator = () => {
    const pulseCount = Math.floor(recordingDuration % 4);
    const pulses = ["⬤", "⬤⬤", "⬤⬤⬤", "⬤⬤⬤⬤"];
    return `🔴 ${pulses[pulseCount]}`;
  };

  if (isEditing) {
    return renderEditForm();
  }

  return (
    <Detail
      markdown={getMarkdown()}
      metadata={
        transcriptionText ? (
          <Detail.Metadata>
            <Detail.Metadata.Label
              title="Duration"
              text={formatTime(recordingDuration)}
              icon={{ source: Icon.Clock, tintColor: Color.PrimaryText }}
            />
            <Detail.Metadata.Separator />
            <Detail.Metadata.TagList title="Status">
              <Detail.Metadata.TagList.Item text="Transcribed" color={Color.Green} />
            </Detail.Metadata.TagList>
            <Detail.Metadata.Separator />
            <Detail.Metadata.Label
              title="Word Count"
              text={transcriptionText.split(/\s+/).filter(Boolean).length.toString()}
              icon={{ source: Icon.TextDocument, tintColor: Color.PrimaryText }}
            />
          </Detail.Metadata>
        ) : isRecording ? (
          <Detail.Metadata>
            <Detail.Metadata.Label
              title="Duration"
              text={formatTime(recordingDuration)}
              icon={{ source: Icon.Clock, tintColor: Color.Red }}
            />
            <Detail.Metadata.Separator />
            <Detail.Metadata.TagList title="Status">
              <Detail.Metadata.TagList.Item text="Recording" color={Color.Red} />
            </Detail.Metadata.TagList>
          </Detail.Metadata>
        ) : recordingPath ? (
          <Detail.Metadata>
            <Detail.Metadata.Label
              title="Duration"
              text={formatTime(recordingDuration)}
              icon={{ source: Icon.Clock, tintColor: Color.PrimaryText }}
            />
            <Detail.Metadata.Separator />
            <Detail.Metadata.TagList title="Status">
              <Detail.Metadata.TagList.Item text="Ready to Transcribe" color={Color.Yellow} />
            </Detail.Metadata.TagList>
          </Detail.Metadata>
        ) : null
      }
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
            <ActionPanel.Section title="Transcript Actions">
              <Action
                title="Copy to Clipboard"
                icon={Icon.Clipboard}
                onAction={() => Clipboard.copy(transcriptionText)}
                shortcut={{ modifiers: ["cmd"], key: "c" }}
              />
              <Action
                title="Edit Transcription"
                icon={Icon.Pencil}
                onAction={editTranscript}
                shortcut={{ modifiers: ["cmd"], key: "e" }}
              />
            </ActionPanel.Section>
          )}

          {(recordingPath || transcriptionText) && (
            <ActionPanel.Section title="Recording">
              <Action
                title="New Recording"
                icon={Icon.Plus}
                onAction={handleNewRecording}
                shortcut={{ modifiers: ["cmd"], key: "n" }}
              />
            </ActionPanel.Section>
          )}
        </ActionPanel>
      }
      isLoading={isTranscribing}
    />
  );
}
