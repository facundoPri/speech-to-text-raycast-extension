import { useEffect, useState } from "react";
import {
  Action,
  ActionPanel,
  Icon,
  List,
  Toast,
  showToast,
  Color,
  Clipboard,
  Alert,
  confirmAlert,
  trash,
} from "@raycast/api";
import fs from "fs-extra";
import path from "path";
import { exec } from "child_process";
import { listAudioFiles } from "./utils/audio";
import { transcribeAudio } from "./utils/ai/transcription";

interface TranscriptionFile {
  id: string;
  filePath: string;
  fileName: string;
  recordedAt: Date;
  duration: number;
  sizeInBytes: number;
  transcription: string | null;
}

export default function TranscriptionHistory() {
  const [files, setFiles] = useState<TranscriptionFile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchText, setSearchText] = useState("");
  const [activeTranscriptions, setActiveTranscriptions] = useState<Record<string, boolean>>({});

  const loadFiles = async () => {
    setIsLoading(true);

    try {
      const audioFiles = await listAudioFiles();
      const transcriptionFiles: TranscriptionFile[] = [];

      for (const filePath of audioFiles) {
        try {
          const stats = await fs.stat(filePath);
          const fileName = path.basename(filePath);
          
          // Extract timestamp from filename (format: recording-YYYY-MM-DDThh-mm-ss-xxxZ.wav)
          const dateMatch = fileName.match(/recording-(.+)\.wav$/);
          const dateStr = dateMatch ? dateMatch[1].replace(/-/g, (match, offset) => {
            if (offset === 10) return "T"; // After date
            if (offset > 10) return offset === 13 || offset === 16 ? ":" : "."; // Time separators
            return "-"; // Date separators
          }) : "";
          
          const recordedAt = dateStr ? new Date(dateStr) : new Date(stats.mtime);
          
          // Calculate audio duration (approximation based on file size)
          // For WAV files at 16kHz, 16-bit: duration in seconds ~= fileSize / (16000 * 2)
          const sampleRate = 16000; // Assuming 16kHz sample rate
          const bytesPerSample = 2; // 16-bit audio = 2 bytes per sample
          const estimatedDuration = Math.round(stats.size / (sampleRate * bytesPerSample));
          
          // Check if there's a corresponding transcription JSON file
          const transcriptionFilePath = filePath.replace(/\.wav$/, ".json");
          let transcription = null;
          
          if (await fs.pathExists(transcriptionFilePath)) {
            try {
              const transcriptionData = await fs.readJSON(transcriptionFilePath);
              transcription = transcriptionData.text || null;
            } catch (error) {
              console.error(`Error reading transcription file ${transcriptionFilePath}:`, error);
            }
          }
          
          transcriptionFiles.push({
            id: fileName,
            filePath,
            fileName,
            recordedAt,
            duration: estimatedDuration,
            sizeInBytes: stats.size,
            transcription,
          });
        } catch (error) {
          console.error(`Error processing file ${filePath}:`, error);
        }
      }
      
      // Sort by recording date (newest first)
      transcriptionFiles.sort((a, b) => b.recordedAt.getTime() - a.recordedAt.getTime());
      
      setFiles(transcriptionFiles);
    } catch (error) {
      console.error("Error loading audio files:", error);
      await showToast({
        style: Toast.Style.Failure,
        title: "Failed to Load Files",
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadFiles();
  }, []);

  const formatDate = (date: Date): string => {
    return date.toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const handleTranscribe = async (file: TranscriptionFile) => {
    try {
      setActiveTranscriptions(prev => ({ ...prev, [file.id]: true }));
      
      await showToast({
        style: Toast.Style.Animated,
        title: "Transcribing...",
        message: file.fileName,
      });

      const result = await transcribeAudio(file.filePath);
      
      // Save transcription to JSON file
      const transcriptionFilePath = file.filePath.replace(/\.wav$/, ".json");
      await fs.writeJSON(transcriptionFilePath, { 
        text: result.text,
        timestamp: new Date().toISOString() 
      });
      
      // Update file list
      setFiles(prevFiles => 
        prevFiles.map(f => 
          f.id === file.id 
            ? { ...f, transcription: result.text } 
            : f
        )
      );

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
      setActiveTranscriptions(prev => ({ ...prev, [file.id]: false }));
    }
  };

  const handleDeleteFile = async (file: TranscriptionFile) => {
    const shouldDelete = await confirmAlert({
      title: "Delete Recording",
      message: `Are you sure you want to delete "${file.fileName}"?`,
      primaryAction: {
        title: "Delete",
        style: Alert.ActionStyle.Destructive,
      },
    });

    if (!shouldDelete) return;

    try {
      // Delete the audio file
      await trash(file.filePath);
      
      // Delete the transcription file if it exists
      const transcriptionFilePath = file.filePath.replace(/\.wav$/, ".json");
      if (await fs.pathExists(transcriptionFilePath)) {
        await trash(transcriptionFilePath);
      }
      
      // Update the file list
      setFiles(prevFiles => prevFiles.filter(f => f.id !== file.id));
      
      await showToast({
        style: Toast.Style.Success,
        title: "Recording Deleted",
        message: file.fileName,
      });
    } catch (error) {
      console.error("Error deleting file:", error);
      
      await showToast({
        style: Toast.Style.Failure,
        title: "Delete Failed",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  };

  const filteredFiles = files.filter(file => {
    if (!searchText) return true;
    
    const searchLower = searchText.toLowerCase();
    return (
      file.fileName.toLowerCase().includes(searchLower) ||
      (file.transcription && file.transcription.toLowerCase().includes(searchLower))
    );
  });

  return (
    <List
      isLoading={isLoading}
      searchText={searchText}
      onSearchTextChange={setSearchText}
      searchBarPlaceholder="Search recordings and transcriptions..."
      throttle
    >
      <List.Section title="Recordings" subtitle={filteredFiles.length.toString()}>
        {filteredFiles.map(file => (
          <List.Item
            key={file.id}
            title={formatDate(file.recordedAt)}
            subtitle={file.transcription ? "Transcribed" : "Not transcribed"}
            accessories={[
              { text: formatDuration(file.duration) },
              { text: formatFileSize(file.sizeInBytes) },
              { 
                tag: { 
                  value: file.transcription ? "Transcribed" : "Audio Only",
                  color: file.transcription ? Color.Green : Color.Orange
                } 
              }
            ]}
            detail={
              <List.Item.Detail
                markdown={file.transcription 
                  ? `# Transcription\n\n${file.transcription}` 
                  : "# No Transcription\n\nThis recording hasn't been transcribed yet. Use the Transcribe action to generate a transcription."
                }
                metadata={
                  <List.Item.Detail.Metadata>
                    <List.Item.Detail.Metadata.Label
                      title="Recorded On"
                      text={formatDate(file.recordedAt)}
                      icon={{ source: Icon.Calendar, tintColor: Color.PrimaryText }}
                    />
                    <List.Item.Detail.Metadata.Separator />
                    <List.Item.Detail.Metadata.Label
                      title="Duration"
                      text={formatDuration(file.duration)}
                      icon={{ source: Icon.Clock, tintColor: Color.PrimaryText }}
                    />
                    <List.Item.Detail.Metadata.Separator />
                    <List.Item.Detail.Metadata.Label
                      title="File Size"
                      text={formatFileSize(file.sizeInBytes)}
                      icon={{ source: Icon.Document, tintColor: Color.PrimaryText }}
                    />
                    <List.Item.Detail.Metadata.Separator />
                    <List.Item.Detail.Metadata.Label
                      title="File Path"
                      text={file.filePath}
                      icon={{ source: Icon.Folder, tintColor: Color.PrimaryText }}
                    />
                    {file.transcription && (
                      <>
                        <List.Item.Detail.Metadata.Separator />
                        <List.Item.Detail.Metadata.Label
                          title="Word Count"
                          text={file.transcription.split(/\s+/).filter(Boolean).length.toString()}
                          icon={{ source: Icon.TextDocument, tintColor: Color.PrimaryText }}
                        />
                      </>
                    )}
                  </List.Item.Detail.Metadata>
                }
              />
            }
            actions={
              <ActionPanel>
                {!file.transcription && (
                  <Action
                    title={activeTranscriptions[file.id] ? "Transcribing..." : "Transcribe"}
                    icon={Icon.Text}
                    onAction={() => handleTranscribe(file)}
                  />
                )}
                {file.transcription && (
                  <ActionPanel.Section title="Transcription Actions">
                    <Action
                      title="Copy Transcription"
                      icon={Icon.Clipboard}
                      onAction={() => Clipboard.copy(file.transcription!)}
                    />
                    <Action
                      title={activeTranscriptions[file.id] ? "Re-transcribing..." : "Re-transcribe"}
                      icon={Icon.ArrowClockwise}
                      onAction={() => handleTranscribe(file)}
                    />
                  </ActionPanel.Section>
                )}
                <ActionPanel.Section title="File Actions">
                  <Action
                    title="Refresh List"
                    icon={Icon.RotateClockwise}
                    onAction={loadFiles}
                    shortcut={{ modifiers: ["cmd"], key: "r" }}
                  />
                  <Action
                    title="Open Folder"
                    icon={Icon.Folder}
                    onAction={() => {
                      const folder = path.dirname(file.filePath);
                      exec(`open "${folder}"`);
                    }}
                    shortcut={{ modifiers: ["cmd"], key: "o" }}
                  />
                  <Action
                    title="Delete Recording"
                    icon={Icon.Trash}
                    style={Action.Style.Destructive}
                    onAction={() => handleDeleteFile(file)}
                    shortcut={{ modifiers: ["ctrl"], key: "x" }}
                  />
                </ActionPanel.Section>
              </ActionPanel>
            }
          />
        ))}
      </List.Section>
    </List>
  );
}
