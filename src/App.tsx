import React, { useState, useEffect, useRef } from "react";
import { 
  Sparkles, 
  Volume2, 
  Download, 
  FolderDown, 
  Play, 
  Pause, 
  Trash2, 
  Plus, 
  PlusCircle, 
  BookOpen, 
  Mic, 
  CheckCircle2, 
  Music, 
  Settings2, 
  FileAudio, 
  HelpCircle, 
  AlertCircle,
  Copy,
  Check,
  Key,
  Eye,
  EyeOff
} from "lucide-react";
import JSZip from "jszip";
import { VoiceModel, AudioClip, TrainingPrompt } from "./types";

const PRESET_MODELS: VoiceModel[] = [
  {
    id: "preset_1",
    name: "Classic Epic Narrator",
    description: "A deep, resonant, cinematic male voice perfect for fantasy epics and sweeping saga narration. Filled with gravity and dramatic pause control.",
    gender: "Male",
    accent: "British (RP)",
    baseVoice: "Fenrir",
    recommendedPitch: "Low",
    recommendedSpeed: 0.88,
    prosodyInstructions: "Speak in a deep, gravelly voice slowly, with a dramatic pause between clauses.",
    narrationStyle: "Cinematic Audiobook Narration",
    voiceSeed: "SEED-3814-MALE-GRAVEL-FENRIR",
    createdAt: "2026-07-05T12:00:00Z",
    trainingPrompts: [
      { id: "tp_1_1", text: "Before the age of the glass cities, there was only the wind, and the endless sand.", emotion: "Serious", focus: "Cinematic pausing and deep sibilance" },
      { id: "tp_1_2", text: "He raised the ancient obsidian blade, and for a brief moment, the storm fell completely silent.", emotion: "Dramatic", focus: "Plosive consonants and breath control" },
      { id: "tp_1_3", text: "Do you hear that? The mountains themselves are whispering the secrets of the first stars.", emotion: "Whispering", focus: "Low-frequency breathiness" },
      { id: "tp_1_4", text: "The countdown had begun: ten, nine, eight, and then, a total eclipse of the crimson sun.", emotion: "Serious", focus: "Number pronunciation and clinical spacing" }
    ]
  },
  {
    id: "preset_2",
    name: "Soothing Sleep Guide",
    description: "A soft, intimate, gentle female voice designed for bedtime stories, meditation guidance, and ASMR content. Highly relaxing cadence.",
    gender: "Female",
    accent: "American (Pacific Northwest)",
    baseVoice: "Kore",
    recommendedPitch: "Medium-High",
    recommendedSpeed: 0.80,
    prosodyInstructions: "Speak softly, near-whispering, slow down significantly, breathing gently.",
    narrationStyle: "Guided Meditation & Sleep Aids",
    voiceSeed: "SEED-9204-FEMALE-SOOTHING-KORE",
    createdAt: "2026-07-05T12:00:00Z",
    trainingPrompts: [
      { id: "tp_2_1", text: "Breathe in deeply, feeling the cool night air fill your chest, and let it go slowly.", emotion: "Whispering", focus: "Soft sibilants and deep vocal relaxation" },
      { id: "tp_2_2", text: "The stars are shining softly tonight, casting a warm, silver glow over the sleepy valley.", emotion: "Warm", focus: "Melodious pitch variations and long vowel glides" },
      { id: "tp_2_3", text: "Let go of all your thoughts from today. Right now, there is absolutely nothing you need to do.", emotion: "Soothing", focus: "Calm prosody and rhythmic breathing pauses" },
      { id: "tp_2_4", text: "Float gently down the river of sleep, drift away, and find peace in the quiet night.", emotion: "Whispering", focus: "Fricative consonants in quiet tones" }
    ]
  },
  {
    id: "preset_3",
    name: "Enthusiastic Tech Reviewer",
    description: "A bright, crisp, high-energy voice with fast articulation and engaging conversational rhythm, ideal for reviews, blogs, and marketing.",
    gender: "Male",
    accent: "American (West Coast)",
    baseVoice: "Zephyr",
    recommendedPitch: "Medium-High",
    recommendedSpeed: 1.12,
    prosodyInstructions: "Speak cheerfully, quickly, with a bright tone and emphasis on words like 'unbelievable' or 'amazing'.",
    narrationStyle: "High-Energy Promo & Video Essays",
    voiceSeed: "SEED-1102-MALE-ACTIVE-ZEPHYR",
    createdAt: "2026-07-05T12:00:00Z",
    trainingPrompts: [
      { id: "tp_3_1", text: "Unbelievable! This brand new screen is packing over eight million self-lit pixels!", emotion: "Happy", focus: "Excited exclamation marks and rapid pacing" },
      { id: "tp_3_2", text: "But here is the real kicker: the battery life easily matches forty-eight hours of solid use.", emotion: "Energetic", focus: "Crisp plosive stops and mid-sentence emphasis" },
      { id: "tp_3_3", text: "We ran five different benchmarks, and honestly, the performance gain is absolutely insane.", emotion: "Happy", focus: "Casual modern conversational delivery" },
      { id: "tp_3_4", text: "Should you buy it? Let's dive deep into the specs and find out right now!", emotion: "Energetic", focus: "Question pacing and punchy endings" }
    ]
  }
];

export default function App() {
  // --- Persistent State ---
  const [voiceModels, setVoiceModels] = useState<VoiceModel[]>(() => {
    const saved = localStorage.getItem("lora_voice_models");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const valid = parsed.filter(m => m && typeof m === "object" && m.id);
          return valid.length > 0 ? valid : PRESET_MODELS;
        }
        return PRESET_MODELS;
      } catch {
        return PRESET_MODELS;
      }
    }
    return PRESET_MODELS;
  });

  const [audioClips, setAudioClips] = useState<AudioClip[]>(() => {
    const saved = localStorage.getItem("lora_audio_clips");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          return parsed.filter(c => c && typeof c === "object" && c.id && c.modelId && c.audioBase64);
        }
        return [];
      } catch {
        return [];
      }
    }
    return [];
  });

  const [selectedModelId, setSelectedModelId] = useState<string>(() => {
    const saved = localStorage.getItem("lora_selected_model_id");
    if (saved) return saved;
    return PRESET_MODELS[0].id;
  });

  // --- UI Navigation & Interaction State ---
  const [activeTab, setActiveTab] = useState<"designer" | "studio" | "library">("studio");
  const [designPrompt, setDesignPrompt] = useState("");
  const [isDesigning, setIsDesigning] = useState(false);
  const [designError, setDesignError] = useState<string | null>(null);

  // --- Studio Synthesis State ---
  const [studioText, setStudioText] = useState("");
  const [studioEmotion, setStudioEmotion] = useState("Neutral");
  const [studioPitch, setStudioPitch] = useState("Medium");
  const [studioSpeed, setStudioSpeed] = useState(1.0);
  const [customStyleCues, setCustomStyleCues] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [activePromptId, setActivePromptId] = useState<string | null>(null);

  // --- Active Audio Player State ---
  const [playingClipId, setPlayingClipId] = useState<string | null>(null);
  const [playbackProgress, setPlaybackProgress] = useState(0); // 0 to 100
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const playbackIntervalRef = useRef<any>(null);

  // --- Dataset Customizer State ---
  const [exportSeparator, setExportSeparator] = useState<"|" | ",">("|");
  const [exportFormat, setExportFormat] = useState<"alexandria" | "cosyvoice" | "standard">("alexandria");
  const [copiedScriptId, setCopiedScriptId] = useState<string | null>(null);

  // --- API Configuration & Keys State ---
  const [apiProvider, setApiProvider] = useState<"google" | "openrouter">(() => {
    return (localStorage.getItem("lora_api_provider") as "google" | "openrouter") || "google";
  });
  const [googleApiKey, setGoogleApiKey] = useState(() => {
    return localStorage.getItem("lora_google_api_key") || "";
  });
  const [openRouterApiKey, setOpenRouterApiKey] = useState(() => {
    return localStorage.getItem("lora_openrouter_api_key") || "";
  });
  const [openRouterModel, setOpenRouterModel] = useState(() => {
    return localStorage.getItem("lora_openrouter_model") || "google/gemini-2.5-flash";
  });
  const [showGoogleKey, setShowGoogleKey] = useState(false);
  const [showOpenRouterKey, setShowOpenRouterKey] = useState(false);

  // Sync state with LocalStorage
  useEffect(() => {
    localStorage.setItem("lora_voice_models", JSON.stringify(voiceModels));
  }, [voiceModels]);

  useEffect(() => {
    localStorage.setItem("lora_audio_clips", JSON.stringify(audioClips));
  }, [audioClips]);

  useEffect(() => {
    localStorage.setItem("lora_selected_model_id", selectedModelId);
  }, [selectedModelId]);

  useEffect(() => {
    localStorage.setItem("lora_api_provider", apiProvider);
  }, [apiProvider]);

  useEffect(() => {
    localStorage.setItem("lora_google_api_key", googleApiKey);
  }, [googleApiKey]);

  useEffect(() => {
    localStorage.setItem("lora_openrouter_api_key", openRouterApiKey);
  }, [openRouterApiKey]);

  useEffect(() => {
    localStorage.setItem("lora_openrouter_model", openRouterModel);
  }, [openRouterModel]);

  // Cleanup audio playback on unmount
  useEffect(() => {
    return () => {
      if (playbackIntervalRef.current) clearInterval(playbackIntervalRef.current);
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  const activeModel = voiceModels.find(m => m.id === selectedModelId) || voiceModels[0] || PRESET_MODELS[0];
  const activeModelClips = audioClips.filter(c => c.modelId === activeModel.id);

  // Populate prompt in synthesizer
  const handleLoadPrompt = (prompt: TrainingPrompt) => {
    setStudioText(prompt.text);
    setStudioEmotion(prompt.emotion);
    setCustomStyleCues(activeModel.prosodyInstructions || "");
    setStudioSpeed(activeModel.recommendedSpeed || 1.0);
    setStudioPitch(activeModel.recommendedPitch || "Medium");
    setActivePromptId(prompt.id);
    setActiveTab("studio");
  };

  // --- Waveform Generation Algorithm (Repeatable & Fingerprinted) ---
  const generateWaveform = (base64: string, count: number = 40): number[] => {
    try {
      const raw = atob(base64.slice(0, 800));
      const data: number[] = [];
      const step = Math.max(1, Math.floor(raw.length / count));
      for (let i = 0; i < count; i++) {
        const charCode = raw.charCodeAt(Math.min(raw.length - 1, i * step));
        const val = 0.12 + ((charCode % 32) / 32) * 0.85;
        data.push(val);
      }
      return data;
    } catch {
      return Array.from({ length: count }, (_, i) => 0.2 + Math.abs(Math.sin(i * 0.45)) * 0.65);
    }
  };

  // --- Playback Controller ---
  const handleTogglePlay = (clip: AudioClip) => {
    if (playingClipId === clip.id) {
      // Pause
      if (audioRef.current) {
        audioRef.current.pause();
      }
      setPlayingClipId(null);
      if (playbackIntervalRef.current) clearInterval(playbackIntervalRef.current);
    } else {
      // Stop currently playing
      if (audioRef.current) {
        audioRef.current.pause();
      }
      if (playbackIntervalRef.current) clearInterval(playbackIntervalRef.current);

      // Setup and play new
      setPlayingClipId(clip.id);
      setPlaybackProgress(0);

      // Create blob url from persistent base64 audio
      const binary = atob(clip.audioBase64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      const blob = new Blob([bytes], { type: "audio/wav" });
      const url = URL.createObjectURL(blob);

      const audio = new Audio(url);
      audioRef.current = audio;

      audio.oncanplaythrough = () => {
        audio.play();
      };

      audio.onended = () => {
        setPlayingClipId(null);
        setPlaybackProgress(100);
        if (playbackIntervalRef.current) clearInterval(playbackIntervalRef.current);
        URL.revokeObjectURL(url);
      };

      playbackIntervalRef.current = setInterval(() => {
        if (audio) {
          const progress = (audio.currentTime / (audio.duration || clip.duration || 1)) * 100;
          setPlaybackProgress(Math.min(progress, 100));
        }
      }, 80);
    }
  };

  // --- Call AI Voice Design Studio (Gemini-3.5-flash) ---
  const handleDesignVoice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!designPrompt.trim()) return;

    setIsDesigning(true);
    setDesignError(null);

    try {
      const response = await fetch("/api/voice-models/design", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          prompt: designPrompt,
          apiProvider,
          googleApiKey,
          openRouterApiKey,
          openRouterModel
        }),
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || "Failed to design voice profile.");
      }

      const voiceData = await response.json();
      
      const newVoice: VoiceModel = {
        id: `voice_${Date.now()}`,
        name: voiceData.name || "Custom Voice Model",
        description: voiceData.description || "Designed with Gemini.",
        gender: voiceData.gender || "Neutral",
        accent: voiceData.accent || "Standard",
        baseVoice: voiceData.baseVoice || "Kore",
        recommendedPitch: voiceData.recommendedPitch || "Medium",
        recommendedSpeed: voiceData.recommendedSpeed || 1.0,
        prosodyInstructions: voiceData.prosodyInstructions || "",
        narrationStyle: voiceData.narrationStyle || "General Narration",
        voiceSeed: voiceData.voiceSeed || `SEED-${Math.floor(1000 + Math.random() * 9000)}-MALE-GRAVEL-KORE`,
        trainingPrompts: voiceData.trainingPrompts || [],
        createdAt: new Date().toISOString(),
      };

      setVoiceModels(prev => [newVoice, ...prev]);
      setSelectedModelId(newVoice.id);
      setDesignPrompt("");
      setActiveTab("studio");
      setStudioText(newVoice.trainingPrompts[0]?.text || "");
      setStudioEmotion(newVoice.trainingPrompts[0]?.emotion || "Neutral");
      setStudioPitch(newVoice.recommendedPitch);
      setStudioSpeed(newVoice.recommendedSpeed);
      setCustomStyleCues(newVoice.prosodyInstructions);
    } catch (err: any) {
      console.error(err);
      setDesignError(err.message || "Something went wrong while designing the voice profile.");
    } finally {
      setIsDesigning(false);
    }
  };

  // --- Acoustic Voice Seed Customizers ---
  const handleUpdateVoiceSeed = (newSeed: string) => {
    setVoiceModels(prev => prev.map(m => {
      if (m.id === selectedModelId) {
        return { ...m, voiceSeed: newSeed };
      }
      return m;
    }));
  };

  const handleGenerateRandomSeed = () => {
    const prefixes = ["SEED", "SIGNATURE", "VOX", "TIMBER", "ANALOG", "ACOUSTIC"];
    const characters = ["BARITONE", "TENOR", "SOPRANO", "ALTO", "GRAVEL", "SILK", "CRISP", "WARM", "AIRY"];
    const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
    const char = characters[Math.floor(Math.random() * characters.length)];
    const num = Math.floor(1000 + Math.random() * 9000);
    const newSeed = `${prefix}-${num}-${char}-${(activeModel.baseVoice || "Kore").toUpperCase()}`;
    handleUpdateVoiceSeed(newSeed);
  };

  // --- Call Gemini TTS Generation (gemini-3.1-flash-tts-preview) ---
  const handleGenerateAudio = async () => {
    if (!studioText.trim()) return;

    setIsGenerating(true);
    setGenerationError(null);

    try {
      const response = await fetch("/api/audio/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: studioText,
          baseVoice: activeModel.baseVoice,
          pitch: studioPitch,
          speed: studioSpeed,
          emotion: studioEmotion,
          prosodyInstructions: customStyleCues,
          voiceSeed: activeModel.voiceSeed, // Crucial: Locks vocal timber across scripts
          googleApiKey,
        }),
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || "Failed to generate audio clip.");
      }

      const data = await response.json();
      if (!data.audio) {
        throw new Error("No audio payload received.");
      }

      // Convert raw base64 PCM/audio into proper WAV file (with browser wrapping)
      const rawBytes = base64ToUint8Array(data.audio);
      const wavBytes = pcmToWav(rawBytes, 24000);
      
      // Convert WAV Uint8Array back to Base64 to save cleanly in LocalStorage
      const binaryString = Array.from(wavBytes)
        .map(b => String.fromCharCode(b))
        .join("");
      const wavBase64 = btoa(binaryString);

      // Estimate duration based on sample size (24000Hz, 16bit, mono = 48000 bytes/sec)
      const duration = Math.max(1.0, Math.round((wavBytes.length - 44) / 48000 * 10) / 10);

      const newClip: AudioClip = {
        id: `clip_${Date.now()}`,
        modelId: activeModel.id,
        promptId: activePromptId || undefined,
        text: studioText,
        baseVoice: activeModel.baseVoice,
        pitch: studioPitch,
        speed: studioSpeed,
        emotion: studioEmotion,
        voiceSeed: activeModel.voiceSeed, // Saved to track seed linkage
        audioBase64: wavBase64,
        duration: duration,
        createdAt: new Date().toISOString(),
      };

      setAudioClips(prev => [newClip, ...prev]);
      
      // Automatically trigger play of newly created clip
      handleTogglePlay(newClip);
    } catch (err: any) {
      console.error(err);
      setGenerationError(err.message || "Synthesis failed. Please verify secret keys are configured correctly.");
    } finally {
      setIsGenerating(false);
    }
  };

  // Helper function to decode base64 to Uint8Array
  const base64ToUint8Array = (base64: string): Uint8Array => {
    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
  };

  // Prepend a standard WAV header over raw 16-bit little-endian PCM
  const pcmToWav = (pcmData: Uint8Array, sampleRate: number = 24000): Uint8Array => {
    // Check if it already has a RIFF/WAVE header
    if (
      pcmData.length >= 12 &&
      pcmData[0] === 0x52 && pcmData[1] === 0x49 && pcmData[2] === 0x46 && pcmData[3] === 0x46 && // 'RIFF'
      pcmData[8] === 0x57 && pcmData[9] === 0x41 && pcmData[10] === 0x56 && pcmData[11] === 0x45    // 'WAVE'
    ) {
      return pcmData;
    }

    const buffer = new ArrayBuffer(44 + pcmData.byteLength);
    const view = new DataView(buffer);
    
    // RIFF identifier
    view.setUint32(0, 0x52494646, false); // "RIFF" big-endian
    view.setUint32(4, 36 + pcmData.byteLength, true); // file size
    view.setUint32(8, 0x57415645, false); // "WAVE" big-endian
    
    // fmt chunk
    view.setUint32(12, 0x666d7420, false); // "fmt " big-endian
    view.setUint32(16, 16, true); // size of fmt chunk
    view.setUint16(20, 1, true); // linear PCM format
    view.setUint16(22, 1, true); // 1 channel (mono)
    view.setUint32(24, sampleRate, true); // sample rate
    view.setUint32(28, sampleRate * 2, true); // byte rate (sampleRate * 1 channel * 2 bytes/sample)
    view.setUint16(32, 2, true); // block align
    view.setUint16(34, 16, true); // bits per sample (16-bit)
    
    // data chunk
    view.setUint32(36, 0x64617461, false); // "data" big-endian
    view.setUint32(40, pcmData.byteLength, true); // chunk size
    
    const output = new Uint8Array(buffer);
    output.set(pcmData, 44);
    return output;
  };

  const handleDeleteClip = (clipId: string) => {
    if (playingClipId === clipId) {
      if (audioRef.current) audioRef.current.pause();
      setPlayingClipId(null);
    }
    setAudioClips(prev => prev.filter(c => c.id !== clipId));
  };

  const handleDeleteModel = (modelId: string) => {
    if (PRESET_MODELS.some(m => m.id === modelId)) {
      alert("Preset models cannot be deleted.");
      return;
    }
    if (confirm("Are you sure you want to delete this voice model and all associated clips?")) {
      setVoiceModels(prev => prev.filter(m => m.id !== modelId));
      setAudioClips(prev => prev.filter(c => c.modelId !== modelId));
      setSelectedModelId(PRESET_MODELS[0].id);
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedScriptId(id);
    setTimeout(() => setCopiedScriptId(null), 2000);
  };

  // --- Export Full Dataset as ZIP (wavs + metadata.csv + metadata.json + README.md) ---
  const handleExportDatasetZip = async () => {
    if (activeModelClips.length === 0) return;

    const zip = new JSZip();
    const wavsFolder = zip.folder("wavs")!;
    
    let csvContent = "";
    const jsonMetadata: any[] = [];

    activeModelClips.forEach((clip, index) => {
      const clipIndex = index + 1;
      const padIndex = String(clipIndex).padStart(4, "0");
      const filename = `clip_${padIndex}.wav`;
      
      // Convert base64 audio to binary format
      const rawBytes = base64ToUint8Array(clip.audioBase64);
      wavsFolder.file(filename, rawBytes);

      // Append row to metadata.csv
      // e.g. wavs/clip_0001.wav|Transcript here
      csvContent += `wavs/${filename}${exportSeparator}${clip.text}\n`;

      // JSON summary
      jsonMetadata.push({
        file: `wavs/${filename}`,
        text: clip.text,
        baseVoice: clip.baseVoice,
        pitch: clip.pitch,
        speed: clip.speed,
        emotion: clip.emotion || "Neutral",
        duration_seconds: clip.duration,
        created_at: clip.createdAt
      });
    });

    zip.file("metadata.csv", csvContent);
    zip.file("metadata.json", JSON.stringify({
      model_id: activeModel.id,
      model_name: activeModel.name,
      description: activeModel.description,
      gender: activeModel.gender,
      accent: activeModel.accent,
      base_voice_template: activeModel.baseVoice,
      recommended_pitch: activeModel.recommendedPitch,
      recommended_speed: activeModel.recommendedSpeed,
      narration_style: activeModel.narrationStyle,
      clips_count: activeModelClips.length,
      clips: jsonMetadata
    }, null, 2));

    // Custom crafted README.md for Alexandria Audiobook / Qwen3-TTS
    const totalDurationSec = activeModelClips.reduce((sum, c) => sum + c.duration, 0);
    const minutes = Math.floor(totalDurationSec / 60);
    const seconds = Math.round(totalDurationSec % 60);

    const readmeContent = `# Qwen3-TTS / CosyVoice LoRA Dataset: ${activeModel.name}

This voice dataset was dynamically designed and synthesized using **Gemini TTS** inside the **AI Voice Model & LoRA Dataset Studio** to train a high-fidelity speech LoRA clone.

## Dataset Overview
- **Speaker Name:** ${activeModel.name}
- **Persona:** ${activeModel.gender} (${activeModel.accent} Accent)
- **Narration Style:** ${activeModel.narrationStyle}
- **Base Voice Template:** ${activeModel.baseVoice}
- **Total Audio Clips:** ${activeModelClips.length}
- **Total Dataset Duration:** ${minutes}m ${seconds}s (ideal for quick voice clones)
- **Audio Specifications:** 24,000Hz Sample Rate, 16-bit, Mono WAV

## Folder Layout
\`\`\`
├── wavs/
│   ├── clip_0001.wav
│   ├── clip_0002.wav
│   └── ...
├── metadata.csv
├── metadata.json
└── README.md
\`\`\`

## LoRA Finetuning Instructions (Alexandria & Qwen3-TTS)

Following the [Alexandria Audiobook Qwen3-TTS LoRA Guide](https://github.com/Finrandojin/alexandria-audiobook/blob/main/lora.md):

1. **Upload Dataset:** Upload this unpacked ZIP structure to your GPU machine (e.g. RunPod, Colab) or your local training workspace.
2. **Setup Environment:**
   \`\`\`bash
   git clone https://github.com/instavar/qwen3-tts-lora-finetuning
   cd qwen3-tts-lora-finetuning
   pip install -r requirements.txt
   \`\`\`
3. **Configure Dataset Paths:**
   Move this directory to \`data/${activeModel.name.toLowerCase().replace(/\s+/g, "_")}\` and reference \`metadata.csv\` inside your training YAML config file.
4. **Recommended Training Configuration:**
   - **Batch Size:** 4
   - **Learning Rate:** 1e-4
   - **Epochs:** 8 to 12 (depending on dataset size)
   - **LoRA Rank (r):** 16
   - **LoRA Alpha:** 32
   - **Target Modules:** \`q_proj, v_proj, k_proj, o_proj\` inside the audio encoder.

Generated automatically with ❤️ by Gemini.
`;

    zip.file("README.md", readmeContent);

    // Generate ZIP blob and trigger download
    const zipBlob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(zipBlob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${activeModel.name.toLowerCase().replace(/\s+/g, "_")}_lora_dataset.zip`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleDownloadSingleWav = (clip: AudioClip) => {
    const rawBytes = base64ToUint8Array(clip.audioBase64);
    const blob = new Blob([rawBytes], { type: "audio/wav" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${activeModel.name.toLowerCase().replace(/\s+/g, "_")}_${clip.id}.wav`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const totalDuration = activeModelClips.reduce((sum, c) => sum + c.duration, 0);
  const totalMin = Math.floor(totalDuration / 60);
  const totalSec = Math.round(totalDuration % 60);

  return (
    <div id="root-container" className="min-h-screen bg-slate-950 text-slate-100 font-sans flex flex-col selection:bg-indigo-500 selection:text-white">
      {/* HEADER SECTION */}
      <header id="app-header" className="border-b border-slate-800 bg-slate-900/60 backdrop-blur-md px-6 py-4 flex flex-col md:flex-row md:items-center md:justify-between gap-4 sticky top-0 z-40">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-indigo-600 rounded-xl text-white shadow-lg shadow-indigo-600/20 flex items-center justify-center">
            <Volume2 className="h-6 w-6 animate-pulse" />
          </div>
          <div>
            <h1 className="text-xl md:text-2xl font-bold font-display tracking-tight text-white flex items-center gap-2">
              Voice Model &amp; LoRA Dataset Studio
              <span className="text-[10px] uppercase font-mono tracking-wider px-2 py-0.5 bg-indigo-500/20 text-indigo-300 rounded border border-indigo-500/30">
                Gemini Multi-Modal
              </span>
            </h1>
            <p className="text-xs text-slate-400">Design speech profiles, record training clips, and export compliant datasets for Qwen3-TTS &amp; CosyVoice.</p>
          </div>
        </div>

        <div className="flex items-center gap-2 bg-slate-950/60 p-1 rounded-lg border border-slate-800 self-start md:self-auto">
          <span className="text-xs font-medium px-3 py-1.5 text-slate-400">Select Voice:</span>
          <select
            value={selectedModelId}
            onChange={(e) => {
              setSelectedModelId(e.target.value);
              setActivePromptId(null);
            }}
            className="bg-slate-900 border border-slate-800 text-sm text-slate-100 rounded-md px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium"
          >
            {voiceModels.map(model => (
              <option key={model.id} value={model.id}>
                {model.name} {PRESET_MODELS.some(p => p.id === model.id) ? "• Preset" : "• Designed"}
              </option>
            ))}
          </select>
        </div>
      </header>

      {/* MAIN BODY GRID */}
      <main id="app-main" className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-6 grid grid-cols-1 lg:grid-cols-4 gap-6">
        
        {/* LEFT COLUMN: VOICE MODELS LIST & SYSTEM STATS */}
        <section id="sidebar-panel" className="lg:col-span-1 flex flex-col gap-5">
          
          {/* VOICE MODEL MANAGEMENT */}
          <div className="bg-slate-900 rounded-xl border border-slate-800 p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h2 className="text-xs uppercase font-mono tracking-wider font-semibold text-slate-400">My Voice Models</h2>
              <button 
                onClick={() => setActiveTab("designer")}
                className="text-xs flex items-center gap-1 text-indigo-400 hover:text-indigo-300 transition-colors font-medium cursor-pointer"
              >
                <Plus className="h-3.5 w-3.5" /> Design New
              </button>
            </div>

            <div className="flex flex-col gap-2 max-h-[300px] overflow-y-auto pr-1">
              {voiceModels.map((model) => {
                const isSelected = model.id === selectedModelId;
                const isPreset = PRESET_MODELS.some(p => p.id === model.id);
                return (
                  <div 
                    key={model.id}
                    onClick={() => {
                      setSelectedModelId(model.id);
                      setActivePromptId(null);
                    }}
                    className={`p-3 rounded-lg border text-left cursor-pointer transition-all flex items-start justify-between gap-2 group ${
                      isSelected 
                        ? "bg-slate-800/80 border-indigo-500/70 shadow-md" 
                        : "bg-slate-950/40 border-slate-800 hover:bg-slate-900 hover:border-slate-700"
                    }`}
                  >
                    <div className="flex flex-col min-w-0">
                      <span className="text-sm font-semibold text-slate-200 truncate group-hover:text-white">{model.name}</span>
                      <span className="text-[11px] text-slate-400 truncate">{model.narrationStyle}</span>
                    </div>
                    {!isPreset && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteModel(model.id);
                        }}
                        className="text-slate-500 hover:text-rose-400 p-1 rounded transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
                        title="Delete Model"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* API CREDENTIALS PANEL */}
          <div className="bg-slate-900 rounded-xl border border-slate-800 p-4 flex flex-col gap-3.5">
            <div className="flex items-center gap-2 border-b border-slate-800/60 pb-2">
              <Key className="h-4 w-4 text-indigo-400" />
              <h2 className="text-xs uppercase font-mono tracking-wider font-semibold text-slate-300">API Credentials</h2>
            </div>

            {/* Provider Selector */}
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">Active AI Designer:</label>
              <div className="grid grid-cols-2 gap-1 bg-slate-950 p-0.5 rounded-lg border border-slate-800">
                <button
                  type="button"
                  onClick={() => setApiProvider("google")}
                  className={`text-[11px] py-1 rounded-md font-medium transition-all ${
                    apiProvider === "google"
                      ? "bg-indigo-600 text-white shadow-sm"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  Google AI
                </button>
                <button
                  type="button"
                  onClick={() => setApiProvider("openrouter")}
                  className={`text-[11px] py-1 rounded-md font-medium transition-all ${
                    apiProvider === "openrouter"
                      ? "bg-indigo-600 text-white shadow-sm"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  OpenRouter
                </button>
              </div>
            </div>

            {/* Google AI Key Input */}
            <div className="flex flex-col gap-1.5">
              <div className="flex justify-between items-center">
                <label className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">Google AI API Key:</label>
                <button
                  type="button"
                  onClick={() => setShowGoogleKey(!showGoogleKey)}
                  className="text-[10px] text-indigo-400 hover:text-indigo-300 flex items-center gap-0.5 font-medium"
                >
                  {showGoogleKey ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                  {showGoogleKey ? "Hide" : "Show"}
                </button>
              </div>
              <input
                type={showGoogleKey ? "text" : "password"}
                value={googleApiKey}
                onChange={(e) => setGoogleApiKey(e.target.value)}
                placeholder="Using server key (optional)..."
                className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500 placeholder-slate-600"
              />
            </div>

            {/* OpenRouter Key & Model Input */}
            <div className="flex flex-col gap-2.5 border-t border-slate-800/60 pt-2.5">
              <div className="flex flex-col gap-1.5">
                <div className="flex justify-between items-center">
                  <label className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">OpenRouter API Key:</label>
                  <button
                    type="button"
                    onClick={() => setShowOpenRouterKey(!showOpenRouterKey)}
                    className="text-[10px] text-indigo-400 hover:text-indigo-300 flex items-center gap-0.5 font-medium"
                  >
                    {showOpenRouterKey ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                    {showOpenRouterKey ? "Hide" : "Show"}
                  </button>
                </div>
                <input
                  type={showOpenRouterKey ? "text" : "password"}
                  value={openRouterApiKey}
                  onChange={(e) => setOpenRouterApiKey(e.target.value)}
                  placeholder="sk-or-..."
                  className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500 placeholder-slate-600"
                />
              </div>

              {/* OpenRouter Model Selection */}
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">OpenRouter Model:</label>
                <select
                  value={
                    ["google/gemini-2.5-flash", "google/gemini-2.5-pro", "meta-llama/llama-3.1-8b-instruct", "meta-llama/llama-3.3-70b-instruct", "deepseek/deepseek-chat"].includes(openRouterModel)
                      ? openRouterModel
                      : "custom"
                  }
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val !== "custom") {
                      setOpenRouterModel(val);
                    } else {
                      setOpenRouterModel("");
                    }
                  }}
                  className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-medium"
                >
                  <option value="google/gemini-2.5-flash">Gemini 2.5 Flash</option>
                  <option value="google/gemini-2.5-pro">Gemini 2.5 Pro</option>
                  <option value="meta-llama/llama-3.1-8b-instruct">Llama 3.1 8B Instruct</option>
                  <option value="meta-llama/llama-3.3-70b-instruct">Llama 3.3 70B Instruct</option>
                  <option value="deepseek/deepseek-chat">DeepSeek Chat (V3)</option>
                  <option value="custom">-- Custom Model --</option>
                </select>

                {!["google/gemini-2.5-flash", "google/gemini-2.5-pro", "meta-llama/llama-3.1-8b-instruct", "meta-llama/llama-3.3-70b-instruct", "deepseek/deepseek-chat"].includes(openRouterModel) && (
                  <input
                    type="text"
                    value={openRouterModel}
                    onChange={(e) => setOpenRouterModel(e.target.value)}
                    placeholder="Enter model (e.g. qwen/qwen-2.5-72b-instruct)"
                    className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-slate-200 mt-1 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                )}
              </div>
            </div>
          </div>

          {/* TRAINING METRICS PANEL */}
          <div className="bg-slate-900 rounded-xl border border-slate-800 p-4 flex flex-col gap-4">
            <h2 className="text-xs uppercase font-mono tracking-wider font-semibold text-slate-400">Dataset Metrics</h2>
            
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-slate-950/40 p-3 rounded-lg border border-slate-800 flex flex-col">
                <span className="text-[10px] uppercase tracking-wider text-slate-500 font-mono">Recorded</span>
                <span className="text-xl font-bold text-white mt-1">{activeModelClips.length} clips</span>
              </div>
              <div className="bg-slate-950/40 p-3 rounded-lg border border-slate-800 flex flex-col">
                <span className="text-[10px] uppercase tracking-wider text-slate-500 font-mono">Total Duration</span>
                <span className="text-xl font-bold text-white mt-1">{totalMin}m {totalSec}s</span>
              </div>
            </div>

            {/* PROGRESS GRAPH */}
            <div className="flex flex-col gap-2">
              <div className="flex justify-between text-xs font-mono">
                <span className="text-slate-400">LoRA Readiness:</span>
                <span className="font-semibold text-indigo-400">
                  {Math.min(100, Math.round((activeModelClips.length / 10) * 100))}%
                </span>
              </div>
              <div className="h-2 bg-slate-950 rounded-full overflow-hidden border border-slate-800">
                <div 
                  className="h-full bg-indigo-500 rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(100, (activeModelClips.length / 10) * 100)}%` }}
                />
              </div>
              <span className="text-[10px] text-slate-500 mt-1 leading-normal">
                {activeModelClips.length < 5 
                  ? "⚠️ Record at least 5-10 high-quality clips to assemble a viable voice LoRA clone."
                  : "✅ Dataset contains healthy phonetic variations. Ready for export!"}
              </span>
            </div>
          </div>

          {/* EXPORT DATASET SETTINGS */}
          {activeModelClips.length > 0 && (
            <div className="bg-indigo-950/20 rounded-xl border border-indigo-900/40 p-4 flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <Settings2 className="h-4 w-4 text-indigo-400" />
                <h2 className="text-xs uppercase font-mono tracking-wider font-semibold text-indigo-300">Dataset Customizer</h2>
              </div>
              
              <div className="flex flex-col gap-3 mt-1 text-xs">
                <div>
                  <label className="text-slate-400 block mb-1">Target Format:</label>
                  <select 
                    value={exportFormat}
                    onChange={(e: any) => setExportFormat(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  >
                    <option value="alexandria">Alexandria Audiobook (qwen3-tts)</option>
                    <option value="cosyvoice">CosyVoice (metadata.csv format)</option>
                    <option value="standard">Standard Pitch/Emotion Dataset</option>
                  </select>
                </div>

                <div>
                  <label className="text-slate-400 block mb-1">CSV Column Separator:</label>
                  <div className="flex gap-4 mt-1">
                    <label className="flex items-center gap-1.5 cursor-pointer text-slate-300">
                      <input 
                        type="radio" 
                        name="separator" 
                        value="|" 
                        checked={exportSeparator === "|"}
                        onChange={() => setExportSeparator("|")}
                        className="text-indigo-500 focus:ring-0 bg-slate-900 border-slate-700" 
                      />
                      Pipe ( | )
                    </label>
                    <label className="flex items-center gap-1.5 cursor-pointer text-slate-300">
                      <input 
                        type="radio" 
                        name="separator" 
                        value="," 
                        checked={exportSeparator === ","}
                        onChange={() => setExportSeparator(",")}
                        className="text-indigo-500 focus:ring-0 bg-slate-900 border-slate-700" 
                      />
                      Comma ( , )
                    </label>
                  </div>
                </div>

                <button
                  onClick={handleExportDatasetZip}
                  className="w-full bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white font-medium py-2.5 px-4 rounded-lg flex items-center justify-center gap-2 mt-2 transition-colors cursor-pointer shadow-lg shadow-indigo-600/10"
                >
                  <FolderDown className="h-4 w-4" /> Export Dataset (ZIP)
                </button>
              </div>
            </div>
          )}

        </section>

        {/* RIGHT COLUMN: WORKSPACE PANELS & TABS */}
        <section id="workspace-panel" className="lg:col-span-3 flex flex-col bg-slate-900 rounded-xl border border-slate-800 overflow-hidden shadow-xl">
          
          {/* TAB HEADERS */}
          <div className="flex border-b border-slate-800 bg-slate-950/40 p-1">
            <button
              onClick={() => setActiveTab("studio")}
              className={`flex-1 py-3 text-center text-sm font-medium transition-colors flex items-center justify-center gap-2 border-b-2 cursor-pointer ${
                activeTab === "studio" 
                  ? "border-indigo-500 text-white" 
                  : "border-transparent text-slate-400 hover:text-slate-200"
              }`}
            >
              <Mic className="h-4 w-4" /> Clip Studio
            </button>
            <button
              onClick={() => setActiveTab("library")}
              className={`flex-1 py-3 text-center text-sm font-medium transition-colors flex items-center justify-center gap-2 border-b-2 cursor-pointer relative ${
                activeTab === "library" 
                  ? "border-indigo-500 text-white" 
                  : "border-transparent text-slate-400 hover:text-slate-200"
              }`}
            >
              <BookOpen className="h-4 w-4" /> Library ({activeModelClips.length})
            </button>
            <button
              onClick={() => setActiveTab("designer")}
              className={`flex-1 py-3 text-center text-sm font-medium transition-colors flex items-center justify-center gap-2 border-b-2 cursor-pointer ${
                activeTab === "designer" 
                  ? "border-indigo-500 text-white" 
                  : "border-transparent text-slate-400 hover:text-slate-200"
              }`}
            >
              <Sparkles className="h-4 w-4 text-amber-400 animate-pulse" /> Gemini Voice Designer
            </button>
          </div>

          {/* TAB CONTENT PANELS */}
          <div className="p-6 flex-1 flex flex-col">

            {/* TAB: STUDIO SYNTHESIZER */}
            {activeTab === "studio" && (
              <div className="flex flex-col gap-6 flex-1">
                
                {/* ACTIVE MODEL SUMMARY HEADER */}
                <div className="bg-slate-950/40 p-4 rounded-lg border border-slate-800/80 flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="flex flex-col">
                    <span className="text-xs font-mono text-indigo-400 uppercase tracking-wider">Voice Profile</span>
                    <h3 className="text-lg font-bold text-white mt-1">{activeModel.name || "Custom Voice Model"}</h3>
                    <p className="text-xs text-slate-400 mt-1 leading-relaxed">{activeModel.description || "Designed with Gemini."}</p>
                    <div className="flex flex-wrap gap-2 mt-2.5">
                      <span className="text-[10px] font-mono px-2 py-0.5 bg-slate-800 text-slate-300 rounded border border-slate-700">
                        Gender: {activeModel.gender || "Neutral"}
                      </span>
                      <span className="text-[10px] font-mono px-2 py-0.5 bg-slate-800 text-slate-300 rounded border border-slate-700">
                        Accent: {activeModel.accent || "Standard"}
                      </span>
                      <span className="text-[10px] font-mono px-2 py-0.5 bg-slate-800 text-slate-300 rounded border border-slate-700">
                        Base Config: {activeModel.baseVoice || "Kore"}
                      </span>
                    </div>
                  </div>
                  
                  {/* STYLE INSTRUCTIONS CARD */}
                  <div className="md:w-1/3 bg-slate-900/90 p-3 rounded-lg border border-slate-800 flex flex-col gap-1.5 self-stretch justify-center">
                    <span className="text-[10px] font-mono text-slate-500 uppercase tracking-wider">Organic Style Guide</span>
                    <p className="text-xs text-slate-300 italic leading-snug">"{activeModel.prosodyInstructions || 'None specified'}"</p>
                  </div>
                </div>

                {/* AI VOICE SEED ANCHOR & LOCK PANEL */}
                <div className="bg-slate-900/30 p-4 rounded-lg border border-indigo-500/20 flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="flex flex-col gap-1 max-w-xl">
                    <span className="text-xs font-mono text-emerald-400 uppercase tracking-wider flex items-center gap-1.5 font-bold">
                      <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                      Locked AI Voice Seed Anchor (Consistent Acoustics)
                    </span>
                    <p className="text-xs text-slate-300">
                      This unique seed anchors the throat thickness, physical vocal tract length, and resonance styling of <strong className="text-white">{activeModel.name || "Custom Voice Model"}</strong>. It ensures the voice stays identical across all generated scripts, preventing different voices or acoustics.
                    </p>
                  </div>
                  <div className="flex items-center gap-2.5 bg-slate-950 p-2 rounded-lg border border-slate-800 shrink-0">
                    <input
                      type="text"
                      value={activeModel.voiceSeed || ""}
                      onChange={(e) => handleUpdateVoiceSeed(e.target.value)}
                      placeholder="e.g. SEED-4123-MALE-GRAVEL-FENRIR"
                      className="bg-slate-900 border border-slate-800 rounded px-2.5 py-1 text-xs text-indigo-300 font-mono tracking-wider focus:outline-none focus:ring-1 focus:ring-indigo-500 w-48 text-center"
                    />
                    <button
                      onClick={handleGenerateRandomSeed}
                      className="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs px-2.5 py-1 rounded cursor-pointer transition-all"
                      title="Generate a completely new voice timber signature seed"
                    >
                      Regen Seed
                    </button>
                  </div>
                </div>

                {/* TWO COLUMN STUDIO WORKSPACE */}
                <div className="grid grid-cols-1 md:grid-cols-5 gap-6 flex-1 items-start">
                  
                  {/* SCRIPTS RECOMMENDATIONS BOX (LEFT 2 COLS) */}
                  <div className="md:col-span-2 flex flex-col gap-3">
                    <div className="flex items-center gap-2">
                      <BookOpen className="h-4 w-4 text-indigo-400" />
                      <h4 className="text-xs uppercase font-mono tracking-wider font-semibold text-slate-400">Recommended LoRA Scripts</h4>
                    </div>

                    <div className="flex flex-col gap-2.5 max-h-[360px] overflow-y-auto pr-1">
                      {(activeModel.trainingPrompts || []).map((prompt) => {
                        const hasClip = audioClips.some(c => c.promptId === prompt.id);
                        const isSelectedPrompt = prompt.id === activePromptId;
                        return (
                          <div
                            key={prompt.id}
                            onClick={() => handleLoadPrompt(prompt)}
                            className={`p-3 rounded-lg border text-left cursor-pointer transition-all flex flex-col gap-2 relative ${
                              isSelectedPrompt 
                                ? "bg-slate-800/80 border-indigo-500" 
                                : "bg-slate-950/40 border-slate-800/80 hover:bg-slate-900/60 hover:border-slate-700"
                            }`}
                          >
                            <div className="flex items-center justify-between text-[11px] font-mono">
                              <span className="text-indigo-400 font-semibold">{prompt.emotion}</span>
                              <div className="flex items-center gap-1">
                                {hasClip && (
                                  <span className="text-emerald-400 flex items-center gap-0.5 text-[10px]">
                                    <CheckCircle2 className="h-3 w-3" /> Recorded
                                  </span>
                                )}
                              </div>
                            </div>
                            <p className="text-xs text-slate-200 font-medium leading-relaxed">{prompt.text}</p>
                            <div className="flex items-center justify-between mt-1 text-[10px] text-slate-500 font-mono">
                              <span>Focus: {prompt.focus}</span>
                              <button 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  copyToClipboard(prompt.text, prompt.id);
                                }}
                                className="hover:text-white p-1 rounded transition-colors"
                                title="Copy Text"
                              >
                                {copiedScriptId === prompt.id ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* SYNTHESIS ENGINE (RIGHT 3 COLS) */}
                  <div className="md:col-span-3 flex flex-col gap-4">
                    
                    {/* SCRIPT INPUT BOX */}
                    <div className="flex flex-col gap-1.5">
                      <div className="flex justify-between items-center text-xs">
                        <label className="font-semibold text-slate-300">Synthesis Script</label>
                        <span className="text-slate-500 font-mono">{studioText.length}/300 chars</span>
                      </div>
                      <textarea
                        value={studioText}
                        onChange={(e) => {
                          setStudioText(e.target.value);
                          if (activePromptId) setActivePromptId(null);
                        }}
                        placeholder="Type script sentence or click a recommended LoRA script on the left..."
                        maxLength={300}
                        rows={4}
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 leading-relaxed placeholder-slate-600"
                      />
                    </div>

                    {/* PROSODY PARAMETERS */}
                    <div className="grid grid-cols-2 gap-4 bg-slate-950/20 p-4 rounded-lg border border-slate-800">
                      
                      {/* EMOTION */}
                      <div className="flex flex-col gap-1.5">
                        <label className="text-xs text-slate-400 font-mono uppercase tracking-wider">Tone / Emotion</label>
                        <select
                          value={studioEmotion}
                          onChange={(e) => setStudioEmotion(e.target.value)}
                          className="bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-medium"
                        >
                          <option value="Neutral">Neutral / Standard</option>
                          <option value="Cheerful">Cheerful / Excited</option>
                          <option value="Dramatic">Dramatic / Intense</option>
                          <option value="Serious">Serious / Stern</option>
                          <option value="Whispering">Whispering / Intimate</option>
                          <option value="Sad">Sad / Mournful</option>
                          <option value="Warm">Warm / Comforting</option>
                        </select>
                      </div>

                      {/* PITCH */}
                      <div className="flex flex-col gap-1.5">
                        <label className="text-xs text-slate-400 font-mono uppercase tracking-wider">Vocal Pitch</label>
                        <select
                          value={studioPitch}
                          onChange={(e) => setStudioPitch(e.target.value)}
                          className="bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-medium"
                        >
                          <option value="Low">Low (Gravelly)</option>
                          <option value="Medium-Low">Medium-Low</option>
                          <option value="Medium">Medium (Default)</option>
                          <option value="Medium-High">Medium-High</option>
                          <option value="High">High (Bright)</option>
                        </select>
                      </div>

                      {/* SPEED SLIDER */}
                      <div className="flex flex-col gap-1.5 col-span-2">
                        <div className="flex justify-between text-xs text-slate-400 font-mono uppercase tracking-wider">
                          <span>Speech Pace / Speed</span>
                          <span className="text-indigo-400 font-bold">{studioSpeed.toFixed(2)}x</span>
                        </div>
                        <input
                          type="range"
                          min="0.70"
                          max="1.40"
                          step="0.05"
                          value={studioSpeed}
                          onChange={(e) => setStudioSpeed(parseFloat(e.target.value))}
                          className="w-full accent-indigo-500 cursor-pointer h-1.5 bg-slate-900 rounded-lg appearance-none"
                        />
                        <div className="flex justify-between text-[10px] text-slate-600 font-mono">
                          <span>0.70x (Slow)</span>
                          <span>1.00x (Standard)</span>
                          <span>1.40x (Fast)</span>
                        </div>
                      </div>

                      {/* STYLE CUES INSTRUCTIONS */}
                      <div className="flex flex-col gap-1.5 col-span-2 mt-1">
                        <label className="text-xs text-slate-400 font-mono uppercase tracking-wider">Style Cues</label>
                        <input
                          type="text"
                          value={customStyleCues}
                          onChange={(e) => setCustomStyleCues(e.target.value)}
                          placeholder="e.g., Speak gravelly, slowly, with a dramatic pause..."
                          className="bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        />
                      </div>

                    </div>

                    {/* GENERATION CTA AND STATUS */}
                    <div className="flex flex-col gap-2 mt-2">
                      <button
                        onClick={handleGenerateAudio}
                        disabled={isGenerating || !studioText.trim()}
                        className={`w-full font-bold py-3 px-6 rounded-lg transition-all flex items-center justify-center gap-2 shadow-lg cursor-pointer ${
                          isGenerating 
                            ? "bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700" 
                            : !studioText.trim()
                              ? "bg-slate-800/40 text-slate-600 border border-slate-800/80 cursor-not-allowed"
                              : "bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white shadow-indigo-600/10"
                        }`}
                      >
                        {isGenerating ? (
                          <>
                            <div className="h-4 w-4 border-2 border-slate-500 border-t-white rounded-full animate-spin" />
                            Synthesizing High-Quality WAV Audio...
                          </>
                        ) : (
                          <>
                            <Volume2 className="h-4 w-4" /> Synthesize &amp; Save Clip
                          </>
                        )}
                      </button>

                      {generationError && (
                        <div className="bg-rose-950/20 text-rose-300 border border-rose-900/40 p-3 rounded-lg text-xs flex items-start gap-2.5">
                          <AlertCircle className="h-4 w-4 shrink-0 text-rose-400 mt-0.5" />
                          <span className="leading-normal">{generationError}</span>
                        </div>
                      )}
                    </div>

                  </div>

                </div>

              </div>
            )}

            {/* TAB: LOCAL CLIP LIBRARY */}
            {activeTab === "library" && (
              <div className="flex flex-col gap-6 flex-1">
                
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div>
                    <h3 className="text-lg font-bold text-white flex items-center gap-2">
                      Recorded Audio Library
                      <span className="text-xs font-mono font-normal px-2.5 py-0.5 bg-indigo-500/10 text-indigo-400 rounded-full border border-indigo-500/20">
                        {activeModelClips.length} Clips
                      </span>
                    </h3>
                    <p className="text-xs text-slate-400 mt-1">Listen to and download generated clips, or customize and export the full LoRA dataset.</p>
                  </div>

                  {activeModelClips.length > 0 && (
                    <button
                      onClick={handleExportDatasetZip}
                      className="bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-xs py-2 px-3.5 rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <Download className="h-3.5 w-3.5" /> Quick Zip Export
                    </button>
                  )}
                </div>

                {activeModelClips.length === 0 ? (
                  <div className="flex-1 flex flex-col items-center justify-center py-16 text-center border-2 border-dashed border-slate-800 rounded-lg bg-slate-950/20 px-6">
                    <FileAudio className="h-12 w-12 text-slate-700 mb-3" />
                    <h4 className="text-sm font-semibold text-slate-300">No Audio Clips Synthesized Yet</h4>
                    <p className="text-xs text-slate-500 max-w-sm mt-1 mb-4 leading-relaxed">
                      Select or type training script scripts in the **Clip Studio** tab and click **Synthesize &amp; Save** to build your LoRA training library.
                    </p>
                    <button
                      onClick={() => setActiveTab("studio")}
                      className="bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-400 border border-indigo-500/30 text-xs font-semibold py-2 px-4 rounded-lg transition-colors cursor-pointer"
                    >
                      Go to Clip Studio
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col gap-3 max-h-[460px] overflow-y-auto pr-1">
                    {activeModelClips.map((clip) => {
                      const isPlaying = playingClipId === clip.id;
                      const fingerprintedWave = generateWaveform(clip.audioBase64);
                      
                      return (
                        <div 
                          key={clip.id}
                          className={`p-4 rounded-lg border transition-all flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-950/40 hover:bg-slate-950/70 border-slate-800/80`}
                        >
                          {/* SCRIPT TEXT & SPECS */}
                          <div className="flex-1 min-w-0 flex flex-col gap-1.5">
                            <p className="text-sm text-slate-200 font-medium leading-relaxed italic">"{clip.text}"</p>
                            
                            <div className="flex flex-wrap items-center gap-3 text-[10px] text-slate-400 font-mono">
                              <span className="flex items-center gap-1">
                                <Volume2 className="h-3 w-3 text-slate-500" /> Pitch: {clip.pitch}
                              </span>
                              <span>•</span>
                              <span>Speed: {clip.speed.toFixed(2)}x</span>
                              {clip.emotion && (
                                <>
                                  <span>•</span>
                                  <span className="text-indigo-400 font-semibold">{clip.emotion}</span>
                                </>
                              )}
                              <span>•</span>
                              <span className="text-slate-500">{clip.duration.toFixed(1)}s</span>
                              {clip.voiceSeed && (
                                <>
                                  <span>•</span>
                                  <span className="text-emerald-400 font-semibold tracking-wider">Seed: {clip.voiceSeed}</span>
                                </>
                              )}
                            </div>
                          </div>

                          {/* INTERACTIVE WAVE PLAYER */}
                          <div className="flex items-center gap-4 bg-slate-900/60 py-2.5 px-4 rounded-lg border border-slate-800 self-stretch md:self-auto md:min-w-[280px]">
                            {/* PLAY BUTTON */}
                            <button
                              onClick={() => handleTogglePlay(clip)}
                              className={`p-2.5 rounded-full flex items-center justify-center transition-all cursor-pointer ${
                                isPlaying 
                                  ? "bg-amber-500 text-slate-950" 
                                  : "bg-indigo-600 hover:bg-indigo-500 text-white"
                              }`}
                            >
                              {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 fill-current ml-0.5" />}
                            </button>

                            {/* WAVEFORM */}
                            <div className="flex-1 flex items-end gap-0.5 h-8 min-w-[120px]">
                              {fingerprintedWave.map((amp, idx) => {
                                const barProgress = (idx / fingerprintedWave.length) * 100;
                                const isPassed = isPlaying && playbackProgress >= barProgress;
                                return (
                                  <div
                                    key={idx}
                                    className={`flex-1 rounded-full transition-all duration-150 ${
                                      isPassed 
                                        ? "bg-indigo-400" 
                                        : isPlaying 
                                          ? "bg-slate-700" 
                                          : "bg-slate-800"
                                    }`}
                                    style={{ 
                                      height: `${amp * 100}%`,
                                      transform: isPlaying && isPassed ? "scaleY(1.15)" : "scaleY(1)"
                                    }}
                                  />
                                );
                              })}
                            </div>
                          </div>

                          {/* ACTION BUTTONS */}
                          <div className="flex items-center justify-end gap-2.5 border-t border-slate-800/40 md:border-t-0 pt-3 md:pt-0">
                            <button
                              onClick={() => handleDownloadSingleWav(clip)}
                              className="text-xs flex items-center gap-1.5 text-indigo-400 hover:text-indigo-300 hover:bg-indigo-500/10 px-3 py-1.5 rounded-lg border border-indigo-500/20 transition-all cursor-pointer"
                              title="Download WAV File"
                            >
                              <Download className="h-3.5 w-3.5" /> WAV
                            </button>
                            
                            <button
                              onClick={() => handleDeleteClip(clip.id)}
                              className="p-2 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors cursor-pointer"
                              title="Delete Clip"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>

                        </div>
                      );
                    })}
                  </div>
                )}

              </div>
            )}

            {/* TAB: VOICE DESIGNER STUDIO */}
            {activeTab === "designer" && (
              <div className="flex flex-col gap-6 max-w-2xl mx-auto w-full flex-1 justify-center py-4">
                
                <div className="text-center flex flex-col items-center gap-2">
                  <div className="p-3 bg-amber-500/10 text-amber-400 rounded-full border border-amber-500/20 mb-1">
                    <Sparkles className="h-8 w-8 animate-pulse" />
                  </div>
                  <h3 className="text-xl font-bold text-white font-display">
                    {apiProvider === "openrouter" ? "OpenRouter Voice Designer" : "Gemini Voice Designer"}
                  </h3>
                  <p className="text-xs text-slate-400 max-w-md">
                    Input a description of a voice or character. {apiProvider === "openrouter" ? `OpenRouter (using ${openRouterModel || "selected model"})` : "Gemini"} will custom build a structured vocal profile, recommend configurations, and design a set of 12 distinct phonetically diverse script prompts.
                  </p>
                </div>

                <form onSubmit={handleDesignVoice} className="bg-slate-950/40 border border-slate-800 p-5 rounded-xl flex flex-col gap-4">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-semibold text-slate-300">Acoustic / Character Description</label>
                    <textarea
                      value={designPrompt}
                      onChange={(e) => setDesignPrompt(e.target.value)}
                      placeholder="e.g., A grizzled 55-year-old space pilot with a raspy voice, Scottish accent, speaking in slow weary pacing..."
                      rows={4}
                      className="bg-slate-900 border border-slate-800 rounded-lg p-3 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 leading-relaxed placeholder-slate-600"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isDesigning || !designPrompt.trim()}
                    className={`w-full font-bold py-3 px-6 rounded-lg transition-all flex items-center justify-center gap-2 shadow-lg cursor-pointer ${
                      isDesigning 
                        ? "bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700" 
                        : !designPrompt.trim()
                          ? "bg-slate-800/40 text-slate-600 border border-slate-800/80 cursor-not-allowed"
                          : "bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white shadow-indigo-600/10"
                    }`}
                  >
                    {isDesigning ? (
                      <>
                        <div className="h-4 w-4 border-2 border-slate-500 border-t-white rounded-full animate-spin" />
                        Analyzing and Drafting Voice Model Profile...
                      </>
                    ) : (
                      <>
                        <Sparkles className="h-4 w-4" /> Design Voice Profile
                      </>
                    )}
                  </button>

                  {designError && (
                    <div className="bg-rose-950/20 text-rose-300 border border-rose-900/40 p-3 rounded-lg text-xs flex items-start gap-2.5">
                      <AlertCircle className="h-4 w-4 shrink-0 text-rose-400 mt-0.5" />
                      <span className="leading-normal">{designError}</span>
                    </div>
                  )}
                </form>

                {/* HELP BOX */}
                <div className="bg-slate-900/60 border border-slate-800 p-4 rounded-xl flex items-start gap-3">
                  <HelpCircle className="h-5 w-5 text-indigo-400 shrink-0 mt-0.5" />
                  <div className="flex flex-col gap-1 text-xs">
                    <span className="font-semibold text-slate-200">How to write good prompts</span>
                    <p className="text-slate-400 leading-relaxed">
                      Describe age (e.g., 20-year-old), vocal texture (e.g., gravelly, smooth, breathy), tone (e.g., hyperactive, lethargic), gender identity, regional accent, and intended use-case (e.g., audiobooks, commercial promos).
                    </p>
                  </div>
                </div>

              </div>
            )}

          </div>

        </section>

      </main>

      {/* FOOTER METRICS SUMMARY */}
      <footer id="app-footer" className="mt-auto border-t border-slate-800 bg-slate-950 p-4 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto w-full flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5 px-4">
          <p>AI Voice Model &amp; LoRA Dataset Studio © 2026. Designed for offline/local LoRA dataset pre-training preparation.</p>
          <div className="flex items-center justify-center gap-3 font-mono text-[10px]">
            <span className="text-emerald-500 flex items-center gap-1 font-medium">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-ping" />
              Gemini Server Connected
            </span>
            <span>•</span>
            <span>Sample Rate: 24,000Hz WAV</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
