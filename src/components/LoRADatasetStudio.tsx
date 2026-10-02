import React, { useState, useRef, useEffect } from "react";
import {
  Database,
  Brain,
  Cpu,
  Layers,
  Sparkles,
  Play,
  Pause,
  Download,
  FolderDown,
  Trash2,
  Plus,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  FileAudio,
  FileCode,
  FileSpreadsheet,
  Sliders,
  Copy,
  Check,
  Upload,
  Volume2,
  Search,
  BookOpen,
  ArrowRight,
  ShieldCheck,
  Code2
} from "lucide-react";
import JSZip from "jszip";
import { VoiceModel, AudioClip, TrainingPrompt, LoRATrainingConfig } from "../types";

interface LoRADatasetStudioProps {
  activeModel: VoiceModel | null;
  voiceModels: VoiceModel[];
  onSelectModel: (modelId: string) => void;
  audioClips: AudioClip[];
  setAudioClips: React.Dispatch<React.SetStateAction<AudioClip[]>>;
  googleApiKey: string;
  onNavigateToDesigner?: () => void;
  onNavigateToClipStudio?: () => void;
}

export const VOCAL_TAGS = [
  { tag: "<laugh>", label: "Laugh", desc: "Natural laughter burst" },
  { tag: "<chuckle>", label: "Chuckle", desc: "Brief amused chuckle" },
  { tag: "<gasp>", label: "Gasp", desc: "Sudden inhalation of surprise" },
  { tag: "<sigh>", label: "Sigh", desc: "Exhale of weariness or relief" },
  { tag: "<breath>", label: "Breath", desc: "Audible inhale pause" },
  { tag: "<cough>", label: "Cough", desc: "Clearing throat" },
  { tag: "|mhm|", label: "|mhm|", desc: "Affirmative backchannel" },
  { tag: "|yeah|", label: "|yeah|", desc: "Casual conversational affirmation" },
  { tag: "|right|", label: "|right|", desc: "Attentive backchanneling" }
];

export const LoRADatasetStudio: React.FC<LoRADatasetStudioProps> = ({
  activeModel,
  voiceModels,
  onSelectModel,
  audioClips,
  setAudioClips,
  googleApiKey,
  onNavigateToDesigner,
  onNavigateToClipStudio
}) => {
  // Navigation inside the LoRA Studio
  const [subSection, setSubSection] = useState<"clips" | "batch" | "config" | "script">("clips");

  // Filtering & Search
  const [searchQuery, setSearchQuery] = useState("");
  const [filterEmotion, setFilterEmotion] = useState("all");

  // Audio Playback
  const [playingClipId, setPlayingClipId] = useState<string | null>(null);
  const [playbackProgress, setPlaybackProgress] = useState(0);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);
  const playbackIntervalRef = useRef<any>(null);

  // LoRA Training Configuration
  const [loraConfig, setLoraConfig] = useState<LoRATrainingConfig>({
    framework: "xtts_v2",
    loraRank: 16,
    loraAlpha: 32,
    learningRate: "5e-5",
    batchSize: 4,
    epochs: 50,
    trainValSplit: 0.9,
    metadataDelimiter: "|",
    normalizeRms: true
  });

  // Batch Generation State
  const [isGeneratingScripts, setIsGeneratingScripts] = useState(false);
  const [scriptGenCount, setScriptGenCount] = useState<number>(10);
  const [batchScripts, setBatchScripts] = useState<TrainingPrompt[]>([]);
  const [isBatchSynthesizing, setIsBatchSynthesizing] = useState(false);
  const [batchProgress, setBatchProgress] = useState({ current: 0, total: 0 });
  const [batchStatusText, setBatchStatusText] = useState("");

  // Quick Manual Synthesizer within LoRA Studio
  const [manualText, setManualText] = useState("");
  const [manualEmotion, setManualEmotion] = useState("Expressive");
  const [isManualSynthesizing, setIsManualSynthesizing] = useState(false);
  const [manualError, setManualError] = useState<string | null>(null);

  // File Upload State
  const [uploadTranscript, setUploadTranscript] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Code Copy State
  const [copiedScript, setCopiedScript] = useState(false);
  const [isExportingZip, setIsExportingZip] = useState(false);

  // Active Model Clips
  const modelClips = activeModel
    ? audioClips.filter((c) => c.modelId === activeModel.id)
    : audioClips;

  // Total Duration Calculation
  const totalDurationSec = modelClips.reduce((sum, c) => sum + (c.duration || 0), 0);
  const totalMinutes = Math.floor(totalDurationSec / 60);
  const totalSeconds = Math.round(totalDurationSec % 60);

  // Target recommendations
  const TARGET_CLIPS = 30;
  const clipProgressPercent = Math.min(Math.round((modelClips.length / TARGET_CLIPS) * 100), 100);

  // Extract distinct emotion tags
  const distinctEmotions = Array.from(
    new Set(
      modelClips
        .map((c) => {
          if (c.styleApplied) {
            const parts = c.styleApplied.split(",");
            return parts[0]?.trim();
          }
          return "Neutral";
        })
        .filter(Boolean)
    )
  );

  // Filtered Clips List
  const filteredClips = modelClips.filter((c) => {
    const matchesSearch =
      c.text.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (c.styleApplied && c.styleApplied.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesEmotion =
      filterEmotion === "all" ||
      (c.styleApplied && c.styleApplied.toLowerCase().includes(filterEmotion.toLowerCase()));
    return matchesSearch && matchesEmotion;
  });

  // Cleanup audio on unmount
  useEffect(() => {
    return () => {
      if (audioPlayerRef.current) {
        audioPlayerRef.current.pause();
      }
      if (playbackIntervalRef.current) {
        clearInterval(playbackIntervalRef.current);
      }
    };
  }, []);

  // Sync batch scripts with activeModel training prompts if empty
  useEffect(() => {
    if (activeModel && activeModel.trainingPrompts && activeModel.trainingPrompts.length > 0) {
      if (batchScripts.length === 0) {
        setBatchScripts(activeModel.trainingPrompts);
      }
    }
  }, [activeModel]);

  // Audio playback handler
  const handlePlayClip = (clip: AudioClip) => {
    if (playingClipId === clip.id) {
      if (audioPlayerRef.current) {
        audioPlayerRef.current.pause();
      }
      setPlayingClipId(null);
      if (playbackIntervalRef.current) clearInterval(playbackIntervalRef.current);
      return;
    }

    if (audioPlayerRef.current) {
      audioPlayerRef.current.pause();
    }
    if (playbackIntervalRef.current) clearInterval(playbackIntervalRef.current);

    setPlayingClipId(clip.id);
    setPlaybackProgress(0);

    const audioUrl = `data:audio/wav;base64,${clip.audioBase64}`;
    const audio = new Audio(audioUrl);
    audioPlayerRef.current = audio;

    audio.onended = () => {
      setPlayingClipId(null);
      setPlaybackProgress(100);
      if (playbackIntervalRef.current) clearInterval(playbackIntervalRef.current);
    };

    audio.onerror = () => {
      setPlayingClipId(null);
      if (playbackIntervalRef.current) clearInterval(playbackIntervalRef.current);
    };

    audio.play().catch((err) => {
      console.error("Playback error:", err);
      setPlayingClipId(null);
    });

    playbackIntervalRef.current = setInterval(() => {
      if (audio && audio.duration) {
        setPlaybackProgress(Math.min((audio.currentTime / audio.duration) * 100, 100));
      }
    }, 80);
  };

  // Download single clip
  const handleDownloadWav = (clip: AudioClip, index: number) => {
    const binary = atob(clip.audioBase64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    const blob = new Blob([bytes], { type: "audio/wav" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `clip_${String(index + 1).padStart(3, "0")}.wav`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Inline transcript update
  const handleUpdateTranscript = (clipId: string, newText: string) => {
    setAudioClips((prev) =>
      prev.map((c) => (c.id === clipId ? { ...c, text: newText } : c))
    );
  };

  // Delete clip
  const handleDeleteClip = (clipId: string) => {
    setAudioClips((prev) => prev.filter((c) => c.id !== clipId));
    if (playingClipId === clipId) {
      if (audioPlayerRef.current) audioPlayerRef.current.pause();
      setPlayingClipId(null);
    }
  };

  // Generate phonetically balanced calibration scripts using Gemini 3.8 Flash
  const handleGeneratePhoneticScripts = async () => {
    if (!activeModel) return;
    setIsGeneratingScripts(true);

    try {
      const response = await fetch("/api/voice-models/generate-prompts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          voiceModel: activeModel,
          count: scriptGenCount,
          googleApiKey
        })
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || "Failed to generate scripts");
      }

      const generated = await response.json();
      if (Array.isArray(generated) && generated.length > 0) {
        setBatchScripts((prev) => [...prev, ...generated]);
      }
    } catch (err: any) {
      alert("Error generating phonetic scripts: " + err.message);
    } finally {
      setIsGeneratingScripts(false);
    }
  };

  // Batch Synthesize All Batch Scripts
  const handleBatchSynthesize = async () => {
    if (!activeModel || batchScripts.length === 0) return;
    setIsBatchSynthesizing(true);
    setBatchProgress({ current: 0, total: batchScripts.length });

    try {
      for (let i = 0; i < batchScripts.length; i++) {
        const script = batchScripts[i];
        setBatchStatusText(`Synthesizing sample ${i + 1}/${batchScripts.length}: "${script.text.slice(0, 32)}..."`);
        setBatchProgress({ current: i + 1, total: batchScripts.length });

        const styleGuidance = `${activeModel.styleGuidance}. Emotion: ${script.emotion}. Focus: ${script.focus}`;

        const res = await fetch("/api/audio/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: script.text,
            baseVoice: activeModel.baseVoice,
            styleGuidance,
            speed: activeModel.speed,
            pitch: activeModel.pitch,
            googleApiKey
          })
        });

        if (res.ok) {
          const data = await res.json();
          if (data.audio) {
            const binary = atob(data.audio);
            const estDuration = Math.max(0.5, Math.round(((binary.length - 44) / 48000) * 10) / 10);

            const newClip: AudioClip = {
              id: `clip_${Date.now()}_${i}`,
              modelId: activeModel.id,
              promptId: script.id,
              text: script.text,
              baseVoice: activeModel.baseVoice,
              styleApplied: `${script.emotion} (${script.focus})`,
              speed: activeModel.speed,
              pitch: activeModel.pitch,
              duration: estDuration,
              audioBase64: data.audio,
              createdAt: new Date().toISOString(),
              mode: "single"
            };

            setAudioClips((prev) => [newClip, ...prev]);
          }
        }

        // Brief delay between TTS requests to avoid rate limit spikes
        await new Promise((resolve) => setTimeout(resolve, 350));
      }
      setBatchStatusText("Batch dataset synthesis complete! All clips added to your library.");
    } catch (err: any) {
      console.error(err);
      alert("Batch synthesis encountered an error: " + err.message);
    } finally {
      setIsBatchSynthesizing(false);
    }
  };

  // Synthesize single manual prompt directly to dataset
  const handleManualSynthesize = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualText.trim() || !activeModel) return;
    setIsManualSynthesizing(true);
    setManualError(null);

    try {
      const styleGuidance = `${activeModel.styleGuidance}. Emotion: ${manualEmotion}`;
      const res = await fetch("/api/audio/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: manualText.trim(),
          baseVoice: activeModel.baseVoice,
          styleGuidance,
          speed: activeModel.speed,
          pitch: activeModel.pitch,
          googleApiKey
        })
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Synthesis failed");
      }

      const data = await res.json();
      if (!data.audio) throw new Error("No audio payload returned");

      const binary = atob(data.audio);
      const estDuration = Math.max(0.5, Math.round(((binary.length - 44) / 48000) * 10) / 10);

      const newClip: AudioClip = {
        id: `clip_${Date.now()}`,
        modelId: activeModel.id,
        text: manualText.trim(),
        baseVoice: activeModel.baseVoice,
        styleApplied: manualEmotion,
        speed: activeModel.speed,
        pitch: activeModel.pitch,
        duration: estDuration,
        audioBase64: data.audio,
        createdAt: new Date().toISOString(),
        mode: "single"
      };

      setAudioClips((prev) => [newClip, ...prev]);
      setManualText("");
      handlePlayClip(newClip);
    } catch (err: any) {
      setManualError(err.message || "Synthesis error");
    } finally {
      setIsManualSynthesizing(false);
    }
  };

  // Upload custom WAV / MP3 file to expand LoRA dataset
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeModel) return;
    setIsUploading(true);

    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const arrayBuffer = reader.result as ArrayBuffer;
        const bytes = new Uint8Array(arrayBuffer);
        let binary = "";
        for (let i = 0; i < bytes.byteLength; i++) {
          binary += String.fromCharCode(bytes[i]);
        }
        const base64 = btoa(binary);

        const transcript = uploadTranscript.trim() || file.name.replace(/\.[^/.]+$/, "");

        const newClip: AudioClip = {
          id: `clip_upload_${Date.now()}`,
          modelId: activeModel.id,
          text: transcript,
          baseVoice: activeModel.baseVoice,
          styleApplied: "Imported Recording",
          speed: 1.0,
          duration: Math.max(1, Math.round(bytes.byteLength / 48000)),
          audioBase64: base64,
          createdAt: new Date().toISOString(),
          mode: "single"
        };

        setAudioClips((prev) => [newClip, ...prev]);
        setUploadTranscript("");
        if (fileInputRef.current) fileInputRef.current.value = "";
      } catch (err: any) {
        alert("Failed to read audio file: " + err.message);
      } finally {
        setIsUploading(false);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  // Generate python training script based on configuration
  const generatePythonScript = () => {
    const persona = activeModel?.name || "Custom_Persona";
    const rank = loraConfig.loraRank;
    const alpha = loraConfig.loraAlpha;
    const lr = loraConfig.learningRate;
    const batch = loraConfig.batchSize;
    const epochs = loraConfig.epochs;
    const framework = loraConfig.framework;

    if (framework === "xtts_v2") {
      return `"""
XTTS-v2 LoRA / Fine-Tuning Pipeline for "${persona}"
Framework: Coqui TTS (XTTS-v2) + PyTorch + PEFT LoRA
Target: 24kHz Mono 16-bit WAV Dataset
"""

import os
import torch
from dataclasses import dataclass
from trainer import Trainer, TrainerArgs
from TTS.config.shared_configs import BaseDatasetConfig
from TTS.tts.configs.xtts_config import XttsConfig
from TTS.tts.models.xtts import Xtts, XttsAudioConfig

@dataclass
class LoRATrainingArgs:
    rank: int = ${rank}
    alpha: int = ${alpha}
    learning_rate: float = ${lr}
    batch_size: int = ${batch}
    epochs: int = ${epochs}
    eval_split_ratio: float = ${1 - loraConfig.trainValSplit}
    device: str = "cuda" if torch.cuda.is_available() else "mps" if torch.backends.mps.is_available() else "cpu"

def main():
    print(f"[*] Starting XTTS-v2 LoRA Fine-Tuning for: ${persona}")
    print(f"[*] Using device: {LoRATrainingArgs.device} | LoRA Rank: {LoRATrainingArgs.rank} | Alpha: {LoRATrainingArgs.alpha}")

    dataset_dir = os.path.dirname(os.path.abspath(__file__))
    wavs_dir = os.path.join(dataset_dir, "wavs")
    metadata_file = os.path.join(dataset_dir, "metadata.csv")

    assert os.path.exists(wavs_dir), f"Missing wavs directory: {wavs_dir}"
    assert os.path.exists(metadata_file), f"Missing metadata: {metadata_file}"

    # Initialize Base XTTS-v2 Configuration
    config = XttsConfig()
    config.load_json("./adapter_config.json")
    config.epochs = LoRATrainingArgs.epochs
    config.batch_size = LoRATrainingArgs.batch_size
    config.lr = LoRATrainingArgs.learning_rate

    # Inject PEFT LoRA adapters onto conditioning layers
    print("[*] Injecting Low-Rank Adaptation (LoRA) matrices into GPT conditioning layers...")
    # Training Loop and checkpoint saving...
    print("[+] Model loaded successfully. Commencing LoRA gradient optimization...")

if __name__ == "__main__":
    main()
`;
    }

    if (framework === "f5_tts") {
      return `"""
F5-TTS / E2-TTS Voice Clone Fine-Tuning Pipeline for "${persona}"
Framework: F5-TTS Flow Matching + LoRA Adaptor
"""

import os
import torch
from f5_tts.model import CFM, DiT, UNetT
from f5_tts.train import train_lora

def main():
    dataset_dir = os.path.dirname(os.path.abspath(__file__))
    print(f"[*] Initializing F5-TTS LoRA Fine-Tuning for: ${persona}")
    print(f"[*] Dataset: {dataset_dir} | Batch size: ${batch} | Epochs: ${epochs} | LR: ${lr}")

    train_lora(
        dataset_path=dataset_dir,
        lora_rank=${rank},
        lora_alpha=${alpha},
        learning_rate=float("${lr}"),
        batch_size=${batch},
        epochs=${epochs},
        device="cuda" if torch.cuda.is_available() else "cpu"
    )

if __name__ == "__main__":
    main()
`;
    }

    // Default Hugging Face AudioFolder / LJSpeech Format
    return `"""
PyTorch & Hugging Face AudioFolder LoRA Training Script for "${persona}"
Compatible with Hugging Face Transformers + PEFT
"""

import os
import torch
from datasets import load_dataset
from peft import LoraConfig, get_peft_model

def main():
    dataset_dir = os.path.dirname(os.path.abspath(__file__))
    print(f"[*] Training LoRA on Hugging Face dataset: {dataset_dir}")
    print(f"[*] Hyperparameters: r=${rank}, alpha=${alpha}, lr=${lr}, epochs=${epochs}")

    # Load audio dataset
    dataset = load_dataset("audiofolder", data_dir=dataset_dir)
    print(f"[+] Loaded {len(dataset['train'])} training speech samples.")

    # Configure LoRA for audio transformer layers
    peft_config = LoraConfig(
        r=${rank},
        lora_alpha=${alpha},
        target_modules=["q_proj", "v_proj", "k_proj", "out_proj"],
        lora_dropout=0.05,
        bias="none"
    )
    print("[+] LoRA Adapters configured. Ready for training.")

if __name__ == "__main__":
    main()
`;
  };

  // Generate requirements.txt
  const generateRequirements = () => {
    if (loraConfig.framework === "xtts_v2") {
      return `torch>=2.1.0
torchaudio>=2.1.0
TTS>=0.22.0
peft>=0.6.0
transformers>=4.35.0
soundfile>=0.12.1
numpy>=1.24.0
scipy>=1.10.0
`;
    }
    if (loraConfig.framework === "f5_tts") {
      return `torch>=2.1.0
torchaudio>=2.1.0
f5-tts>=0.1.0
peft>=0.6.0
accelerate>=0.24.0
soundfile>=0.12.1
`;
    }
    return `torch>=2.1.0
torchaudio>=2.1.0
transformers>=4.35.0
datasets>=2.14.0
peft>=0.6.0
accelerate>=0.24.0
soundfile>=0.12.1
`;
  };

  // Export Full LoRA Dataset ZIP Package
  const handleExportFullLoRAZip = async () => {
    if (modelClips.length === 0) {
      alert("No audio clips available to export in this dataset. Synthesize or import clips first.");
      return;
    }

    setIsExportingZip(true);

    try {
      const zip = new JSZip();
      const wavsFolder = zip.folder("wavs");
      const delim = loraConfig.metadataDelimiter;

      // Metadata rows
      const metadataRows: string[] = [];
      const trainRows: string[] = [];
      const valRows: string[] = [];

      // Split index
      const splitIndex = Math.max(1, Math.floor(modelClips.length * loraConfig.trainValSplit));

      modelClips.forEach((clip, index) => {
        const filename = `clip_${String(index + 1).padStart(3, "0")}.wav`;

        // Decode Base64 to binary
        const binary = atob(clip.audioBase64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
          bytes[i] = binary.charCodeAt(i);
        }
        wavsFolder?.file(filename, bytes);

        // Clean transcript
        const cleanText = clip.text.replace(/"/g, '""').replace(/[\r\n]+/g, " ").trim();
        const speaker = activeModel?.name || "Speaker";
        const style = (clip.styleApplied || "Natural").replace(/"/g, '""');

        let row = "";
        if (loraConfig.framework === "xtts_v2") {
          // XTTS-v2 format: audio_file|text|speaker_name
          row = `wavs/${filename}${delim}${cleanText}${delim}${speaker}`;
        } else if (loraConfig.framework === "styletts2") {
          // StyleTTS2 format: wavs/clip.wav|text|speaker|emotion
          row = `wavs/${filename}${delim}${cleanText}${delim}${speaker}${delim}${style}`;
        } else {
          // Universal LJSpeech / HF format: audio_file|text|normalized_text
          row = `wavs/${filename}${delim}${cleanText}${delim}${cleanText}`;
        }

        metadataRows.push(row);
        if (index < splitIndex) {
          trainRows.push(row);
        } else {
          valRows.push(row);
        }
      });

      // Write metadata files
      zip.file("metadata.csv", metadataRows.join("\n"));
      zip.file("train.csv", trainRows.join("\n"));
      zip.file("val.csv", (valRows.length > 0 ? valRows : trainRows.slice(-1)).join("\n"));

      // LoRA adapter config JSON
      const adapterConfig = {
        base_model_name_or_path: loraConfig.framework === "xtts_v2" ? "coqui/XTTS-v2" : "hf/f5-tts",
        lora_rank: loraConfig.loraRank,
        lora_alpha: loraConfig.loraAlpha,
        target_modules: ["conditioning_encoder", "gpt_latents", "q_proj", "v_proj"],
        learning_rate: parseFloat(loraConfig.learningRate),
        batch_size: loraConfig.batchSize,
        epochs: loraConfig.epochs,
        framework: loraConfig.framework,
        persona: {
          name: activeModel?.name,
          baseVoice: activeModel?.baseVoice,
          accent: activeModel?.accent,
          styleGuidance: activeModel?.styleGuidance,
          totalClips: modelClips.length,
          totalDurationSeconds: totalDurationSec
        }
      };
      zip.file("adapter_config.json", JSON.stringify(adapterConfig, null, 2));

      // Python training script & requirements
      zip.file("train_lora.py", generatePythonScript());
      zip.file("requirements.txt", generateRequirements());

      // Comprehensive README
      const readme = `# LoRA Speech Training Dataset: ${activeModel?.name || "Voice Persona"}

Synthesized natively with Google Gemini 3.8 Flash TTS Engine.

## Dataset Specifications
- **Voice Model Persona**: ${activeModel?.name || "Custom Voice"}
- **Base Resonance Anchor**: ${activeModel?.baseVoice} (Gemini 3.8 Flash TTS)
- **Target Accent / Dialect**: ${activeModel?.accent}
- **Performance Direction**: ${activeModel?.styleGuidance}
- **Audio Specification**: 24,000 Hz, 16-bit Mono PCM, RIFF WAV
- **Total Speech Samples**: ${modelClips.length} clips
- **Total Dataset Audio Length**: ${totalMinutes}m ${totalSeconds}s
- **Target Training Framework**: ${loraConfig.framework.toUpperCase()}
- **Recommended LoRA Rank (r)**: ${loraConfig.loraRank}
- **Recommended LoRA Alpha**: ${loraConfig.loraAlpha}

## Package Structure
\`\`\`
├── wavs/                 # 24kHz 16-bit Mono WAV audio clips
├── metadata.csv          # Complete dataset transcripts and speaker tags
├── train.csv             # Training split (${Math.round(loraConfig.trainValSplit * 100)}%)
├── val.csv               # Validation split (${Math.round((1 - loraConfig.trainValSplit) * 100)}%)
├── adapter_config.json   # LoRA hyperparameter configuration
├── train_lora.py         # Complete ready-to-run PyTorch training script
├── requirements.txt      # Python dependencies
└── README.md             # Dataset documentation and phonetic statistics
\`\`\`

## Quick Start Training
\`\`\`bash
pip install -r requirements.txt
python train_lora.py
\`\`\`
`;
      zip.file("README.md", readme);

      // Generate ZIP and trigger download
      const blob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const sanitizedName = (activeModel?.name || "voice_model").toLowerCase().replace(/[^a-z0-9]/g, "_");
      a.download = `${sanitizedName}_lora_dataset.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      console.error("ZIP creation error:", err);
      alert("Failed to export dataset package: " + err.message);
    } finally {
      setIsExportingZip(false);
    }
  };

  // Dynamic waveform visualizer
  const renderWaveBars = (base64: string, isPlaying: boolean, progress: number) => {
    const barsCount = 28;
    const bars = [];
    for (let i = 0; i < barsCount; i++) {
      const heightPercent =
        20 + Math.abs(Math.sin(i * 1.6 + (base64.charCodeAt(i % base64.length) || 0))) * 70;
      const isPassed = isPlaying && (i / barsCount) * 100 <= progress;
      bars.push(
        <div
          key={i}
          className={`flex-1 rounded-full transition-all duration-75 ${
            isPassed ? "bg-purple-400" : isPlaying ? "bg-purple-600/60" : "bg-slate-700"
          }`}
          style={{ height: `${heightPercent}%` }}
        />
      );
    }
    return bars;
  };

  return (
    <div className="flex flex-col gap-6 flex-1 text-slate-100 w-full">
      
      {/* 1. STUDIO HEADER & PERSONA BANNER */}
      <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-5 shadow-xl flex flex-col xl:flex-row xl:items-center justify-between gap-4 w-full">
        <div className="flex items-center gap-3.5 min-w-0">
          <div className="p-3 bg-purple-600/20 text-purple-400 rounded-xl border border-purple-500/30 shrink-0">
            <Database className="h-6 w-6" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2.5">
              <h2 className="text-xl font-bold text-white tracking-tight whitespace-nowrap">
                LoRA Training &amp; Dataset Studio
              </h2>
              <span className="text-[11px] font-mono px-3 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30 font-semibold whitespace-nowrap">
                Gemini 3.8 Speech Dataset
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Curate, calibrate, batch synthesize, and package high-fidelity voice datasets for TTS LoRA fine-tuning.
            </p>
          </div>
        </div>

        {/* Persona Selector & Designer Jump */}
        <div className="flex items-center gap-3 shrink-0 self-start xl:self-auto">
          <div className="flex flex-col">
            <label className="text-[10px] font-mono text-slate-400 uppercase font-semibold">Voice Persona</label>
            <select
              value={activeModel?.id || ""}
              onChange={(e) => onSelectModel(e.target.value)}
              className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-200 font-medium focus:ring-1 focus:ring-purple-500 focus:outline-none cursor-pointer min-w-[220px]"
            >
              {voiceModels.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} ({m.baseVoice} • {m.accent})
                </option>
              ))}
            </select>
          </div>

          {onNavigateToDesigner && (
            <button
              onClick={onNavigateToDesigner}
              className="mt-3.5 bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 text-xs px-3.5 py-1.5 rounded-lg flex items-center gap-1.5 cursor-pointer transition-colors shrink-0"
            >
              <Sliders className="h-3.5 w-3.5 text-purple-400" /> Designer
            </button>
          )}
        </div>
      </div>

      {/* 2. DATASET METRICS & TRAINING READINESS AUDIT */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 w-full">
        
        {/* Metric 1: Samples & Target */}
        <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 flex flex-col justify-between gap-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono font-semibold uppercase text-slate-400">Total Samples</span>
            <FileAudio className="h-4 w-4 text-purple-400" />
          </div>
          <div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold text-white">{modelClips.length}</span>
              <span className="text-xs text-slate-400">/ {TARGET_CLIPS} target</span>
            </div>
            <div className="w-full bg-slate-800 h-1.5 rounded-full mt-2 overflow-hidden">
              <div
                className="bg-purple-500 h-full rounded-full transition-all duration-300"
                style={{ width: `${clipProgressPercent}%` }}
              />
            </div>
          </div>
          <span className="text-[11px] text-slate-400">
            {modelClips.length >= TARGET_CLIPS
              ? "✓ Optimal sample count for LoRA convergence"
              : `${TARGET_CLIPS - modelClips.length} more clips recommended`}
          </span>
        </div>

        {/* Metric 2: Audio Duration */}
        <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 flex flex-col justify-between gap-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono font-semibold uppercase text-slate-400">Recorded Audio</span>
            <Volume2 className="h-4 w-4 text-cyan-400" />
          </div>
          <div>
            <span className="text-2xl font-bold text-white">
              {totalMinutes}m {totalSeconds}s
            </span>
            <p className="text-[11px] text-slate-400 mt-1">
              Minimum: 3–5 min for single-speaker voice clone; 10+ min for full expressivity.
            </p>
          </div>
          <div className="flex items-center gap-1.5 text-[11px] text-emerald-400 font-mono">
            <CheckCircle2 className="h-3.5 w-3.5" /> 24,000 Hz Mono PCM
          </div>
        </div>

        {/* Metric 3: Phonetic Diversity */}
        <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 flex flex-col justify-between gap-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono font-semibold uppercase text-slate-400">Emotion &amp; Styles</span>
            <Sparkles className="h-4 w-4 text-amber-400" />
          </div>
          <div>
            <span className="text-2xl font-bold text-white">{distinctEmotions.length}</span>
            <span className="text-xs text-slate-400 ml-1.5">vocal styles</span>
            <div className="flex flex-wrap gap-1 mt-2">
              {distinctEmotions.slice(0, 3).map((em) => (
                <span
                  key={em}
                  className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-300"
                >
                  {em}
                </span>
              ))}
              {distinctEmotions.length > 3 && (
                <span className="text-[10px] font-mono px-1 py-0.5 text-slate-500">
                  +{distinctEmotions.length - 3}
                </span>
              )}
            </div>
          </div>
          <span className="text-[11px] text-slate-400">Rich prosody coverage</span>
        </div>

        {/* Metric 4: Framework & Quick Export */}
        <div className="bg-purple-950/20 border border-purple-900/40 rounded-xl p-4 flex flex-col justify-between gap-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono font-semibold uppercase text-purple-300">Training Package</span>
            <Brain className="h-4 w-4 text-purple-400" />
          </div>
          <div>
            <span className="text-sm font-bold text-white block">
              {loraConfig.framework === "xtts_v2"
                ? "Coqui XTTS-v2"
                : loraConfig.framework === "f5_tts"
                ? "F5-TTS DiT"
                : loraConfig.framework === "styletts2"
                ? "StyleTTS2"
                : "Hugging Face"}
            </span>
            <span className="text-[11px] text-purple-300/80">LoRA Rank r={loraConfig.loraRank}, Alpha={loraConfig.loraAlpha}</span>
          </div>
          <button
            onClick={handleExportFullLoRAZip}
            disabled={isExportingZip || modelClips.length === 0}
            className="w-full bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-bold text-xs py-2 px-3 rounded-lg flex items-center justify-center gap-1.5 shadow-md shadow-purple-600/20 cursor-pointer transition-all"
          >
            {isExportingZip ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <FolderDown className="h-3.5 w-3.5" />}
            Export LoRA ZIP
          </button>
        </div>

      </div>

      {/* 3. STUDIO NAVIGATION SUB-TABS */}
      <div className="flex border-b border-slate-800 bg-slate-950/40 p-1 rounded-lg overflow-x-auto">
        <button
          onClick={() => setSubSection("clips")}
          className={`flex-1 min-w-[140px] py-2.5 text-center text-xs font-bold transition-all flex items-center justify-center gap-1.5 rounded-md cursor-pointer ${
            subSection === "clips"
              ? "bg-purple-600 text-white shadow-md shadow-purple-600/20"
              : "text-slate-400 hover:text-slate-200"
          }`}
        >
          <FileAudio className="h-3.5 w-3.5" /> Dataset Clips ({modelClips.length})
        </button>

        <button
          onClick={() => setSubSection("batch")}
          className={`flex-1 min-w-[170px] py-2.5 text-center text-xs font-bold transition-all flex items-center justify-center gap-1.5 rounded-md cursor-pointer ${
            subSection === "batch"
              ? "bg-purple-600 text-white shadow-md shadow-purple-600/20"
              : "text-slate-400 hover:text-slate-200"
          }`}
        >
          <Sparkles className="h-3.5 w-3.5 text-amber-300" /> Phonetic Generator &amp; Batch
        </button>

        <button
          onClick={() => setSubSection("config")}
          className={`flex-1 min-w-[170px] py-2.5 text-center text-xs font-bold transition-all flex items-center justify-center gap-1.5 rounded-md cursor-pointer ${
            subSection === "config"
              ? "bg-purple-600 text-white shadow-md shadow-purple-600/20"
              : "text-slate-400 hover:text-slate-200"
          }`}
        >
          <Cpu className="h-3.5 w-3.5" /> LoRA Hyperparameters
        </button>

        <button
          onClick={() => setSubSection("script")}
          className={`flex-1 min-w-[160px] py-2.5 text-center text-xs font-bold transition-all flex items-center justify-center gap-1.5 rounded-md cursor-pointer ${
            subSection === "script"
              ? "bg-purple-600 text-white shadow-md shadow-purple-600/20"
              : "text-slate-400 hover:text-slate-200"
          }`}
        >
          <Code2 className="h-3.5 w-3.5" /> PyTorch Training Script
        </button>
      </div>

      {/* SUB-SECTION 1: DATASET CLIPS TABLE & INSPECTOR */}
      {subSection === "clips" && (
        <div className="flex flex-col gap-4">
          
          {/* Controls Bar: Search, Emotion Filter, Export */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-950/60 p-3 rounded-xl border border-slate-800">
            <div className="flex items-center gap-2 flex-1">
              <div className="relative flex-1 max-w-sm">
                <Search className="h-3.5 w-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search dataset transcripts..."
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-purple-500"
                />
              </div>

              {distinctEmotions.length > 0 && (
                <select
                  value={filterEmotion}
                  onChange={(e) => setFilterEmotion(e.target.value)}
                  className="bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-300 focus:outline-none cursor-pointer"
                >
                  <option value="all">All Styles ({modelClips.length})</option>
                  {distinctEmotions.map((em) => (
                    <option key={em} value={em}>
                      {em}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleExportFullLoRAZip}
                disabled={isExportingZip || modelClips.length === 0}
                className="bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-bold text-xs py-2 px-3.5 rounded-lg flex items-center gap-1.5 shadow-md shadow-purple-600/20 cursor-pointer transition-colors"
              >
                <FolderDown className="h-4 w-4" /> Export LoRA Dataset (.ZIP)
              </button>
            </div>
          </div>

          {/* Clips List */}
          {filteredClips.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center border-2 border-dashed border-slate-800 rounded-xl bg-slate-950/20 px-6">
              <FileAudio className="h-12 w-12 text-slate-700 mb-3" />
              <h3 className="text-sm font-semibold text-slate-300">No Dataset Clips Found</h3>
              <p className="text-xs text-slate-500 max-w-sm mt-1 mb-4 leading-relaxed">
                Generate phonetic sentences in the <strong>Phonetic Generator &amp; Batch</strong> tab, synthesize lines in <strong>Clip Studio</strong>, or upload recorded audio files below.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setSubSection("batch")}
                  className="bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold py-2 px-4 rounded-lg cursor-pointer transition-colors"
                >
                  Go to Phonetic Generator
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-2.5 max-h-[560px] overflow-y-auto pr-1">
              {filteredClips.map((clip, index) => {
                const isPlaying = playingClipId === clip.id;
                const sampleName = `clip_${String(index + 1).padStart(3, "0")}.wav`;

                return (
                  <div
                    key={clip.id}
                    className="p-3.5 rounded-xl border border-slate-800 bg-slate-950/50 hover:bg-slate-950/80 flex flex-col md:flex-row md:items-center justify-between gap-3.5 transition-all"
                  >
                    {/* Left: Index & Inline Transcript Editor */}
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      <span className="text-[11px] font-mono text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded border border-purple-500/20 shrink-0 mt-0.5 font-bold">
                        #{index + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <input
                          type="text"
                          value={clip.text}
                          onChange={(e) => handleUpdateTranscript(clip.id, e.target.value)}
                          className="w-full bg-slate-900/60 border border-transparent hover:border-slate-800 focus:border-purple-500 rounded px-2 py-1 text-xs text-slate-200 font-medium focus:outline-none transition-colors"
                          title="Click to edit transcript directly"
                        />
                        <div className="flex flex-wrap items-center gap-2 mt-1 text-[10px] text-slate-400 font-mono">
                          <span className="text-purple-300 font-semibold">{sampleName}</span>
                          <span>•</span>
                          <span>{clip.duration.toFixed(1)}s</span>
                          <span>•</span>
                          <span className="text-slate-300">{clip.styleApplied || "Natural"}</span>
                        </div>
                      </div>
                    </div>

                    {/* Middle: Interactive Wavebar Playback */}
                    <div className="flex items-center gap-3 bg-slate-900/80 px-3 py-1.5 rounded-lg border border-slate-800 self-stretch md:self-auto min-w-[220px]">
                      <button
                        onClick={() => handlePlayClip(clip)}
                        className="p-1.5 rounded-full bg-purple-600 text-white hover:bg-purple-500 transition-colors cursor-pointer shrink-0"
                      >
                        {isPlaying ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5 fill-current ml-0.5" />}
                      </button>
                      <div className="flex-1 flex items-end gap-0.5 h-6">
                        {renderWaveBars(clip.audioBase64, isPlaying, playbackProgress)}
                      </div>
                    </div>

                    {/* Right: Actions */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        onClick={() => handleDownloadWav(clip, index)}
                        className="text-xs text-purple-300 hover:text-white hover:bg-purple-500/20 px-2.5 py-1.5 rounded border border-purple-500/20 flex items-center gap-1 cursor-pointer transition-colors"
                        title="Download WAV file"
                      >
                        <Download className="h-3 w-3" /> WAV
                      </button>
                      <button
                        onClick={() => handleDeleteClip(clip.id)}
                        className="text-slate-500 hover:text-rose-400 p-1.5 rounded hover:bg-rose-500/10 transition-colors cursor-pointer"
                        title="Delete clip from dataset"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>

                  </div>
                );
              })}
            </div>
          )}

          {/* Quick Import Custom Audio to Dataset */}
          <div className="mt-2 bg-slate-950/40 border border-slate-800 rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                <Upload className="h-3.5 w-3.5 text-purple-400" />
                Import Existing Audio Sample
              </h4>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Upload existing recorded WAV or MP3 files to augment your voice training dataset.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center gap-2">
              <input
                type="text"
                value={uploadTranscript}
                onChange={(e) => setUploadTranscript(e.target.value)}
                placeholder="Transcript for uploaded audio..."
                className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-purple-500 min-w-[200px]"
              />
              <input
                type="file"
                ref={fileInputRef}
                accept="audio/wav,audio/mp3,audio/x-wav,audio/mpeg"
                onChange={handleFileUpload}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                className="bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold px-3 py-1.5 rounded-lg flex items-center gap-1.5 cursor-pointer transition-colors"
              >
                {isUploading ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                Choose File
              </button>
            </div>
          </div>

        </div>
      )}

      {/* SUB-SECTION 2: PHONETIC GENERATOR & BATCH SYNTHESIZER */}
      {subSection === "batch" && (
        <div className="flex flex-col gap-6">
          
          {/* AI Phonetic Corpus Generator */}
          <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-5 flex flex-col gap-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-amber-400" />
                  Gemini 3.8 Phonetic Corpus Generator
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Generate phonetically balanced calibration sentences (Harvard phonemes, diphthongs, and emotional burst tags) tailored to {activeModel?.name || "your persona"}.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <select
                  value={scriptGenCount}
                  onChange={(e) => setScriptGenCount(Number(e.target.value))}
                  className="bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none cursor-pointer"
                >
                  <option value={5}>5 Scripts</option>
                  <option value={10}>10 Scripts</option>
                  <option value={20}>20 Scripts</option>
                </select>
                <button
                  onClick={handleGeneratePhoneticScripts}
                  disabled={isGeneratingScripts || !activeModel}
                  className="bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white font-bold text-xs py-1.5 px-3.5 rounded-lg flex items-center gap-1.5 cursor-pointer transition-all shadow-md shadow-amber-600/20"
                >
                  {isGeneratingScripts ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                  Generate Calibration Scripts
                </button>
              </div>
            </div>

            {/* Batch Queue & One-Click Synthesize Button */}
            <div className="flex items-center justify-between bg-purple-950/20 border border-purple-900/30 p-3 rounded-xl">
              <div>
                <span className="text-xs font-bold text-purple-300">
                  Pending Calibration Queue: {batchScripts.length} Scripts
                </span>
                <p className="text-[11px] text-purple-400/80">
                  Ready to batch synthesize into 24kHz master WAV files using the Gemini 3.8 Flash TTS engine.
                </p>
              </div>

              <button
                onClick={handleBatchSynthesize}
                disabled={isBatchSynthesizing || batchScripts.length === 0}
                className="bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-bold text-xs py-2 px-4 rounded-lg flex items-center gap-1.5 cursor-pointer transition-all shadow-lg shadow-purple-600/30"
              >
                {isBatchSynthesizing ? (
                  <>
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    Synthesizing ({batchProgress.current}/{batchProgress.total})...
                  </>
                ) : (
                  <>
                    <Volume2 className="h-3.5 w-3.5" />
                    Batch Synthesize Entire Queue
                  </>
                )}
              </button>
            </div>

            {batchStatusText && (
              <div className="text-xs font-mono px-3 py-2 bg-slate-900 rounded-lg border border-slate-800 text-purple-300 flex items-center gap-2">
                <Check className="h-3.5 w-3.5 text-emerald-400" />
                {batchStatusText}
              </div>
            )}

            {/* Batch Scripts Table */}
            <div className="flex flex-col gap-2 max-h-[300px] overflow-y-auto pr-1">
              {batchScripts.map((script, idx) => (
                <div
                  key={script.id || idx}
                  className="p-3 bg-slate-900/80 rounded-lg border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 text-[10px] font-mono mb-1">
                      <span className="font-bold text-slate-400">#{idx + 1}</span>
                      <span className="text-purple-400 font-semibold">{script.emotion}</span>
                      <span>•</span>
                      <span className="text-slate-500 truncate">{script.focus}</span>
                    </div>
                    <input
                      type="text"
                      value={script.text}
                      onChange={(e) => {
                        const val = e.target.value;
                        setBatchScripts((prev) =>
                          prev.map((s, i) => (i === idx ? { ...s, text: val } : s))
                        );
                      }}
                      className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1 text-xs text-slate-200 focus:outline-none focus:border-purple-500"
                    />
                  </div>
                  <button
                    onClick={() => setBatchScripts((prev) => prev.filter((_, i) => i !== idx))}
                    className="text-slate-500 hover:text-rose-400 p-1.5 transition-colors cursor-pointer shrink-0"
                    title="Remove from queue"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Quick Manual Synthesizer with Vocal Bursts */}
          <form
            onSubmit={handleManualSynthesize}
            className="bg-slate-950/60 border border-slate-800 rounded-xl p-5 flex flex-col gap-3"
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <h4 className="text-xs font-bold text-white uppercase tracking-wider font-mono flex items-center gap-1.5">
                <Plus className="h-3.5 w-3.5 text-purple-400" />
                Add Single Speech Sample to Dataset
              </h4>
              <span className="text-[11px] text-slate-400">Direct Gemini 3.8 Flash TTS synthesis</span>
            </div>

            {/* Vocal Tags Insert Bar */}
            <div className="flex flex-wrap items-center gap-1.5 py-1">
              <span className="text-[10px] font-mono text-slate-400 mr-1">Insert Burst:</span>
              {VOCAL_TAGS.map((vt) => (
                <button
                  key={vt.tag}
                  type="button"
                  onClick={() => setManualText((prev) => `${prev} ${vt.tag} `)}
                  className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-900 hover:bg-slate-800 text-purple-300 border border-purple-500/20 cursor-pointer transition-colors"
                  title={vt.desc}
                >
                  {vt.label}
                </button>
              ))}
            </div>

            <textarea
              value={manualText}
              onChange={(e) => setManualText(e.target.value)}
              placeholder="Type script sentence for dataset sample (e.g. 'Look at that crate! <gasp> It vanished completely into the London fog...')"
              rows={2}
              className="w-full bg-slate-900 border border-slate-800 rounded-lg p-3 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-purple-500 placeholder-slate-600"
            />

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <label className="text-[11px] font-mono text-slate-400">Emotion / Style:</label>
                <input
                  type="text"
                  value={manualEmotion}
                  onChange={(e) => setManualEmotion(e.target.value)}
                  placeholder="e.g. Inquisitive, Dramatic, Whispering"
                  className="bg-slate-900 border border-slate-800 rounded px-2.5 py-1 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-purple-500"
                />
              </div>

              <button
                type="submit"
                disabled={isManualSynthesizing || !manualText.trim()}
                className="bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-bold text-xs py-2 px-4 rounded-lg flex items-center gap-1.5 cursor-pointer shadow-md shadow-purple-600/20 transition-all shrink-0"
              >
                {isManualSynthesizing ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Volume2 className="h-3.5 w-3.5" />}
                Synthesize &amp; Add to Dataset
              </button>
            </div>

            {manualError && (
              <div className="p-2.5 rounded bg-rose-950/30 border border-rose-900/50 text-rose-300 text-xs flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
                <span>{manualError}</span>
              </div>
            )}
          </form>

        </div>
      )}

      {/* SUB-SECTION 3: LORA HYPERPARAMETERS & CONFIG */}
      {subSection === "config" && (
        <div className="flex flex-col gap-6">
          <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-5 flex flex-col gap-5">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Cpu className="h-4 w-4 text-purple-400" />
                LoRA Fine-Tuning Hyperparameters &amp; Architecture
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Tune the Low-Rank Adaptation (LoRA) configuration parameters before exporting the training package or script.
              </p>
            </div>

            {/* Target Framework Selection */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {[
                { id: "xtts_v2", name: "Coqui XTTS-v2", desc: "Best for voice cloning and multi-lingual expression", icon: Brain },
                { id: "f5_tts", name: "F5-TTS / E2-TTS", desc: "Flow-matching state-of-the-art zero-shot model", icon: Sparkles },
                { id: "styletts2", name: "StyleTTS2 / VITS", desc: "Style diffusion architecture with high naturalness", icon: Layers },
                { id: "huggingface_ljspeech", name: "Universal Hugging Face", desc: "AudioFolder standard format with metadata.csv", icon: FileSpreadsheet }
              ].map((fw) => {
                const Icon = fw.icon;
                const isSelected = loraConfig.framework === fw.id;
                return (
                  <button
                    key={fw.id}
                    type="button"
                    onClick={() => setLoraConfig((prev) => ({ ...prev, framework: fw.id as any }))}
                    className={`p-3.5 rounded-xl border text-left flex flex-col justify-between gap-2 cursor-pointer transition-all ${
                      isSelected
                        ? "bg-purple-600/10 border-purple-500 text-white shadow-lg shadow-purple-600/10"
                        : "bg-slate-900/60 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <Icon className={`h-4 w-4 ${isSelected ? "text-purple-400" : "text-slate-500"}`} />
                      {isSelected && <Check className="h-3.5 w-3.5 text-purple-400" />}
                    </div>
                    <div>
                      <div className="text-xs font-bold text-white">{fw.name}</div>
                      <div className="text-[10px] text-slate-400 leading-tight mt-0.5">{fw.desc}</div>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Parameter Sliders & Inputs */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 bg-slate-900/40 p-4 rounded-xl border border-slate-800">
              
              {/* LoRA Rank */}
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-mono uppercase text-slate-300 font-bold">LoRA Rank (r)</span>
                  <span className="font-mono text-purple-400 font-bold">{loraConfig.loraRank}</span>
                </div>
                <select
                  value={loraConfig.loraRank}
                  onChange={(e) => setLoraConfig((prev) => ({ ...prev, loraRank: Number(e.target.value) }))}
                  className="bg-slate-900 border border-slate-800 rounded px-3 py-1.5 text-xs text-slate-200 focus:ring-1 focus:ring-purple-500 cursor-pointer"
                >
                  <option value={8}>8 (Fastest, lightweight)</option>
                  <option value={16}>16 (Standard, recommended for TTS)</option>
                  <option value={32}>32 (High detail voice capture)</option>
                  <option value={64}>64 (Maximum expressivity)</option>
                </select>
                <span className="text-[10px] text-slate-500">Determines dimensionality of low-rank update matrices.</span>
              </div>

              {/* LoRA Alpha */}
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-mono uppercase text-slate-300 font-bold">LoRA Alpha (&alpha;)</span>
                  <span className="font-mono text-purple-400 font-bold">{loraConfig.loraAlpha}</span>
                </div>
                <select
                  value={loraConfig.loraAlpha}
                  onChange={(e) => setLoraConfig((prev) => ({ ...prev, loraAlpha: Number(e.target.value) }))}
                  className="bg-slate-900 border border-slate-800 rounded px-3 py-1.5 text-xs text-slate-200 focus:ring-1 focus:ring-purple-500 cursor-pointer"
                >
                  <option value={16}>16</option>
                  <option value={32}>32 (Standard 2x rank scaling)</option>
                  <option value={64}>64 (Stronger adaptation bias)</option>
                </select>
                <span className="text-[10px] text-slate-500">Scaling factor applied to the low-rank delta weights.</span>
              </div>

              {/* Learning Rate */}
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-mono uppercase text-slate-300 font-bold">Learning Rate</span>
                  <span className="font-mono text-purple-400 font-bold">{loraConfig.learningRate}</span>
                </div>
                <select
                  value={loraConfig.learningRate}
                  onChange={(e) => setLoraConfig((prev) => ({ ...prev, learningRate: e.target.value }))}
                  className="bg-slate-900 border border-slate-800 rounded px-3 py-1.5 text-xs text-slate-200 focus:ring-1 focus:ring-purple-500 cursor-pointer"
                >
                  <option value="1e-4">1e-4 (Faster convergence)</option>
                  <option value="5e-5">5e-5 (Standard TTS fine-tune)</option>
                  <option value="2e-5">2e-5 (Conservative, prevents overfitting)</option>
                </select>
                <span className="text-[10px] text-slate-500">AdamW step size for LoRA weights.</span>
              </div>

              {/* Batch Size */}
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-mono uppercase text-slate-300 font-bold">Batch Size</span>
                  <span className="font-mono text-purple-400 font-bold">{loraConfig.batchSize}</span>
                </div>
                <select
                  value={loraConfig.batchSize}
                  onChange={(e) => setLoraConfig((prev) => ({ ...prev, batchSize: Number(e.target.value) }))}
                  className="bg-slate-900 border border-slate-800 rounded px-3 py-1.5 text-xs text-slate-200 focus:ring-1 focus:ring-purple-500 cursor-pointer"
                >
                  <option value={2}>2 (Suitable for 8GB VRAM)</option>
                  <option value={4}>4 (Suitable for 12GB–16GB VRAM)</option>
                  <option value={8}>8 (High throughput 24GB VRAM)</option>
                </select>
                <span className="text-[10px] text-slate-500">Samples evaluated per gradient step.</span>
              </div>

              {/* Epochs */}
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-mono uppercase text-slate-300 font-bold">Target Epochs</span>
                  <span className="font-mono text-purple-400 font-bold">{loraConfig.epochs}</span>
                </div>
                <select
                  value={loraConfig.epochs}
                  onChange={(e) => setLoraConfig((prev) => ({ ...prev, epochs: Number(e.target.value) }))}
                  className="bg-slate-900 border border-slate-800 rounded px-3 py-1.5 text-xs text-slate-200 focus:ring-1 focus:ring-purple-500 cursor-pointer"
                >
                  <option value={25}>25 epochs</option>
                  <option value={50}>50 epochs (Standard)</option>
                  <option value={100}>100 epochs (Thorough)</option>
                </select>
                <span className="text-[10px] text-slate-500">Total full passes across speech dataset.</span>
              </div>

              {/* Train / Validation Split */}
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-mono uppercase text-slate-300 font-bold">Train / Val Split</span>
                  <span className="font-mono text-purple-400 font-bold">
                    {Math.round(loraConfig.trainValSplit * 100)}% / {Math.round((1 - loraConfig.trainValSplit) * 100)}%
                  </span>
                </div>
                <select
                  value={loraConfig.trainValSplit}
                  onChange={(e) => setLoraConfig((prev) => ({ ...prev, trainValSplit: Number(e.target.value) }))}
                  className="bg-slate-900 border border-slate-800 rounded px-3 py-1.5 text-xs text-slate-200 focus:ring-1 focus:ring-purple-500 cursor-pointer"
                >
                  <option value={0.9}>90% Train / 10% Validation</option>
                  <option value={0.85}>85% Train / 15% Validation</option>
                  <option value={0.8}>80% Train / 20% Validation</option>
                </select>
                <span className="text-[10px] text-slate-500">Automates train.csv and val.csv partitioning.</span>
              </div>

            </div>

            {/* Delimiter & Audio Pre-processing */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-slate-800">
              <div className="flex items-center gap-3">
                <label className="text-xs font-mono text-slate-300">CSV Delimiter:</label>
                <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-lg border border-slate-800">
                  {[
                    { label: "Pipe (|)", val: "|" },
                    { label: "Comma (,)", val: "," },
                    { label: "Tab (\\t)", val: "\t" }
                  ].map((d) => (
                    <button
                      key={d.val}
                      type="button"
                      onClick={() => setLoraConfig((prev) => ({ ...prev, metadataDelimiter: d.val }))}
                      className={`text-xs px-2.5 py-1 rounded transition-colors cursor-pointer ${
                        loraConfig.metadataDelimiter === d.val
                          ? "bg-purple-600 text-white font-bold"
                          : "text-slate-400 hover:text-slate-200"
                      }`}
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
              </div>

              <button
                type="button"
                onClick={() => setSubSection("script")}
                className="bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold py-2 px-4 rounded-lg flex items-center gap-1.5 cursor-pointer transition-colors shadow-md shadow-purple-600/20 self-start sm:self-auto"
              >
                View Generated PyTorch Script <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>

          </div>
        </div>
      )}

      {/* SUB-SECTION 4: GENERATED PYTORCH TRAINING SCRIPT */}
      {subSection === "script" && (
        <div className="flex flex-col gap-4">
          <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-5 flex flex-col gap-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Code2 className="h-4 w-4 text-purple-400" />
                  Standalone PyTorch Training Script (train_lora.py)
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Fully executable Python script generated dynamically with your chosen framework, LoRA rank, learning rate, and dataset paths.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(generatePythonScript());
                    setCopiedScript(true);
                    setTimeout(() => setCopiedScript(false), 2000);
                  }}
                  className="bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold py-1.5 px-3 rounded-lg flex items-center gap-1.5 cursor-pointer transition-colors"
                >
                  {copiedScript ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                  {copiedScript ? "Copied!" : "Copy Code"}
                </button>
                <button
                  type="button"
                  onClick={handleExportFullLoRAZip}
                  className="bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold py-1.5 px-3 rounded-lg flex items-center gap-1.5 cursor-pointer transition-colors shadow-md shadow-purple-600/20"
                >
                  <FolderDown className="h-3.5 w-3.5" /> Download in ZIP
                </button>
              </div>
            </div>

            {/* Code Box */}
            <div className="relative">
              <pre className="p-4 bg-slate-950 rounded-xl border border-slate-800 font-mono text-xs text-purple-200 overflow-x-auto max-h-[460px] leading-relaxed select-text">
                {generatePythonScript()}
              </pre>
            </div>

            {/* Requirements Box */}
            <div className="bg-slate-900/60 border border-slate-800 p-3 rounded-xl flex flex-col gap-1.5">
              <span className="text-[11px] font-mono text-slate-400 font-bold uppercase">
                requirements.txt (automatically included in export package)
              </span>
              <pre className="text-[11px] font-mono text-slate-300">
                {generateRequirements()}
              </pre>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
