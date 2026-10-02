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
  BookOpen,
  Mic,
  CheckCircle2,
  Settings2,
  FileAudio,
  AlertCircle,
  Copy,
  Check,
  Key,
  Eye,
  EyeOff,
  Users,
  Sliders,
  RefreshCw,
  Layers,
  Wand2,
  Music2,
  ListOrdered,
  Database,
  Brain,
  Cpu,
  Headphones,
  ShieldCheck,
  Film,
  X,
  PanelLeftClose,
  PanelLeftOpen
} from "lucide-react";
import JSZip from "jszip";
import { VoiceModel, AudioClip, TrainingPrompt, DialogueLine, AudiobookProject, AudiobookChapter } from "./types";
import { AudiobookStudio } from "./components/AudiobookStudio";
import { LoRADatasetStudio } from "./components/LoRADatasetStudio";
import { M4BCreatorPanel } from "./components/M4BCreatorPanel";
import { ACXMasteringPanel } from "./components/ACXMasteringPanel";
import { DialogueStudio } from "./components/DialogueStudio";

// Official 6 Prebuilt Acoustic Engines in Gemini 3.8 Flash TTS
export const ROSTER_VOICES = [
  {
    id: "Puck",
    gender: "Male",
    tone: "Agile, youthful, lively",
    description: "Lightweight, energetic tenor with high flexibility for fast-paced, spirited delivery.",
    color: "from-amber-500/20 to-orange-500/10 border-amber-500/30 text-amber-300"
  },
  {
    id: "Charon",
    gender: "Male",
    tone: "Deep, grave, resonant",
    description: "Low, authoritative baritone with cinematic weight, steady gravitas, and commanding presence.",
    color: "from-blue-500/20 to-indigo-500/10 border-blue-500/30 text-blue-300"
  },
  {
    id: "Kore",
    gender: "Female",
    tone: "Warm, soothing, clear",
    description: "Balanced, natural feminine resonance with rich vocal warmth and pristine audiobook articulation.",
    color: "from-emerald-500/20 to-teal-500/10 border-emerald-500/30 text-emerald-300"
  },
  {
    id: "Fenrir",
    gender: "Male",
    tone: "Gravelly, rough, bold",
    description: "Deep, weathered, textured male timber with authentic grit, commanding presence, and dramatic impact.",
    color: "from-purple-500/20 to-indigo-500/10 border-purple-500/30 text-purple-300"
  },
  {
    id: "Aoede",
    gender: "Female",
    tone: "Melodic, expressive, lyrical",
    description: "Dynamic, bright, articulate female voice with wide emotional range and natural musicality.",
    color: "from-rose-500/20 to-pink-500/10 border-rose-500/30 text-rose-300"
  },
  {
    id: "Zephyr",
    gender: "Male",
    tone: "Crisp, dynamic, conversational",
    description: "Modern, articulate, high-clarity male voice perfect for natural conversations and fast explanations.",
    color: "from-cyan-500/20 to-sky-500/10 border-cyan-500/30 text-cyan-300"
  }
];

// Curated dialect suggestions
export const ACCENT_PRESETS = [
  "British (Received Pronunciation)",
  "British (Cockney London)",
  "Scottish (Highlands)",
  "Irish (Dublin)",
  "Australian (Broad Outback)",
  "American (Southern Drawl)",
  "American (New York / Brooklyn)",
  "American (Pacific Northwest)",
  "Mid-Atlantic (Golden-Era Cinema)",
  "Spanish-accented English",
  "French-accented English",
  "Japanese-accented English"
];

// Expressive tags supported by Gemini 3.8 Flash TTS
export const VOCAL_BURSTS = [
  { tag: "<laugh>", label: "Laugh", desc: "Natural laughter burst" },
  { tag: "<gasp>", label: "Gasp", desc: "Audible intake of shock or surprise" },
  { tag: "<breath>", label: "Breath", desc: "Controlled audible pause or sigh" },
  { tag: "<chuckle>", label: "Chuckle", desc: "Brief subdued laugh" },
  { tag: "<sigh>", label: "Sigh", desc: "Exhale of relief or weariness" },
  { tag: "|mhm|", label: "|mhm|", desc: "Agreement backchanneling" },
  { tag: "|yeah|", label: "|yeah|", desc: "Casual conversational affirmation" },
  { tag: "|right|", label: "|right|", desc: "Attentive backchanneling" }
];

export default function App() {
  // --- Persistent State ---
  const [voiceModels, setVoiceModels] = useState<VoiceModel[]>([]);
  const [audioClips, setAudioClips] = useState<AudioClip[]>([]);
  const [selectedModelId, setSelectedModelId] = useState<string>("");
  const [isLoadedFromServer, setIsLoadedFromServer] = useState(false);

  // Active voice model
  const activeModel = voiceModels.find(m => m.id === selectedModelId) || voiceModels[0] || null;
  const activeModelClips = activeModel ? audioClips.filter(c => c.modelId === activeModel.id) : [];

  // --- UI Navigation ---
  const [activeTab, setActiveTab] = useState<"audiobook" | "m4b" | "acx" | "lora" | "screenplay" | "designer" | "studio" | "library">("audiobook");
  const [showVoiceSidebar, setShowVoiceSidebar] = useState(false);

  // --- Shared Audiobook Project (for Audiobook, M4B Creator, and ACX tabs) ---
  const [audiobookProject, setAudiobookProject] = useState<AudiobookProject>(() => {
    const saved = localStorage.getItem("gemini_audiobook_project");
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {}
    }
    return {
      id: "project_default",
      title: "Alice's Adventures in Wonderland",
      author: "Lewis Carroll",
      narrationMode: "multi",
      defaultSoloVoice: "Kore",
      defaultSoloAccent: "British (Received Pronunciation)",
      defaultSoloStyle: "Articulate, expressive storytelling with warm pacing and whimsy.",
      characters: [
        {
          id: "char_narrator",
          name: "Narrator",
          gender: "Female",
          baseVoice: "Kore",
          accent: "British (Received Pronunciation)",
          styleGuidance: "Rich, whimsical storytelling with crisp classic British cadence."
        },
        {
          id: "char_alice",
          name: "Alice",
          gender: "Female",
          baseVoice: "Aoede",
          accent: "British (Received Pronunciation)",
          styleGuidance: "Curious, thoughtful, young Victorian girl speaking with wonder."
        },
        {
          id: "char_rabbit",
          name: "White Rabbit",
          gender: "Male",
          baseVoice: "Puck",
          accent: "British (Cockney London)",
          styleGuidance: "Fretful, frantic, nervous mutterings, hurried pacing <gasp>."
        }
      ],
      chapters: [],
      pauseBetweenChunksMs: 400
    };
  });

  const handleUpdateAudiobookProject = (updated: AudiobookProject) => {
    setAudiobookProject(updated);
    try {
      localStorage.setItem("gemini_audiobook_project", JSON.stringify(updated));
    } catch {}
  };

  // Active chapter for ACX mastering
  const activeChapter = audiobookProject.chapters.find(c => c.id === audiobookProject.activeChapterId) || audiobookProject.chapters[0] || null;

  // --- API Credentials ---
  const [googleApiKey, setGoogleApiKey] = useState(() => localStorage.getItem("gemini_tts_api_key") || "");
  const [showApiKey, setShowApiKey] = useState(false);

  // --- Voice Designer Workspace State ---
  const [designerMode, setDesignerMode] = useState<"direct" | "ai">("direct");
  const [draftName, setDraftName] = useState("Custom Character Voice");
  const [draftDescription, setDraftDescription] = useState("Authentic, expressive persona designed for Gemini 3.8 Flash TTS.");
  const [draftGender, setDraftGender] = useState("Male");
  const [draftAccent, setDraftAccent] = useState("British (Cockney London)");
  const [isCustomAccent, setIsCustomAccent] = useState(false);
  const [draftBaseVoice, setDraftBaseVoice] = useState<string>("Puck");
  const [draftStyleGuidance, setDraftStyleGuidance] = useState("Authentic East London Cockney accent, lively street merchant rhythm, expressive and spirited.");
  const [draftPitch, setDraftPitch] = useState("Medium");
  const [draftSpeed, setDraftSpeed] = useState(1.0);
  const [draftNarrationStyle, setDraftNarrationStyle] = useState("Character Dialogue & Audiobook");
  const [draftPrompts, setDraftPrompts] = useState<TrainingPrompt[]>([
    { id: "p_1", text: "Right, listen 'ere mate, <laugh> you can't just stroll into the docklands thinkin' nobody's watchin'!", emotion: "Lively", focus: "Glottal stops, diphthongs, and burst laughter" },
    { id: "p_2", text: "Proper mystery, that is. Thirty-two crates vanished clean into thin air, and not a soul saw a thing!", emotion: "Surprised", focus: "Rapid articulation and question cadence" },
    { id: "p_3", text: "Watch your step by the wet stones. <breath> One slip and you'll be swimming in the Thames before midnight.", emotion: "Serious", focus: "Measured pause, breath control, and dental stops" }
  ]);

  // AI Prompt Designer State
  const [aiDesignPrompt, setAiDesignPrompt] = useState("");
  const [isAiDesigning, setIsAiDesigning] = useState(false);
  const [aiDesignError, setAiDesignError] = useState<string | null>(null);

  // Live Acoustic Preview State
  const [previewText, setPreviewText] = useState("Right then! This is a live preview test using the new Gemini 3.8 Flash TTS engine. How does my accent and delivery sound to you?");
  const [previewAudioBase64, setPreviewAudioBase64] = useState<string | null>(null);
  const [isPreviewGenerating, setIsPreviewGenerating] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [isPlayingPreview, setIsPlayingPreview] = useState(false);
  const [previewProgress, setPreviewProgress] = useState(0);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);
  const previewIntervalRef = useRef<any>(null);

  // Script Generation State
  const [isGeneratingPrompts, setIsGeneratingPrompts] = useState(false);

  // --- Clip Studio Synthesizer State ---
  const [studioText, setStudioText] = useState("");
  const [studioStyleOverride, setStudioStyleOverride] = useState("");
  const [isGeneratingClip, setIsGeneratingClip] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [activePromptId, setActivePromptId] = useState<string | null>(null);

  // --- Active Audio Clip Player State ---
  const [playingClipId, setPlayingClipId] = useState<string | null>(null);
  const [playbackProgress, setPlaybackProgress] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const playbackIntervalRef = useRef<any>(null);

  // --- Dataset Exporter Format ---
  const [exportSeparator, setExportSeparator] = useState<"|" | ",">("|");

  // Load from backend server on mount
  useEffect(() => {
    let active = true;
    const loadServerData = async () => {
      try {
        const response = await fetch("/api/data");
        if (response.ok && active) {
          const data = await response.json();
          if (data.voiceModels && Array.isArray(data.voiceModels) && data.voiceModels.length > 0) {
            setVoiceModels(data.voiceModels);
            setSelectedModelId(data.voiceModels[0].id);
          }
          if (data.audioClips && Array.isArray(data.audioClips)) {
            setAudioClips(data.audioClips);
          }
        }
      } catch (err) {
        console.warn("Could not load dataset from server database:", err);
      } finally {
        if (active) {
          setIsLoadedFromServer(true);
        }
      }
    };
    loadServerData();
    return () => {
      active = false;
    };
  }, []);

  // Sync to backend database whenever models or clips change
  useEffect(() => {
    if (!isLoadedFromServer) return;
    const sync = async () => {
      try {
        await fetch("/api/data/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ voiceModels, audioClips }),
        });
      } catch (err) {
        console.error("Failed to sync data with server:", err);
      }
    };
    sync();
  }, [voiceModels, audioClips, isLoadedFromServer]);

  // When active voice model changes, sync studio inputs
  useEffect(() => {
    if (activeModel) {
      setStudioStyleOverride(activeModel.styleGuidance || "");
      if (activeModel.trainingPrompts && activeModel.trainingPrompts.length > 0) {
        setStudioText(activeModel.trainingPrompts[0].text);
        setActivePromptId(activeModel.trainingPrompts[0].id);
      } else {
        setStudioText("");
        setActivePromptId(null);
      }
    }
  }, [selectedModelId]);

  // Handle API key change
  const handleApiKeyChange = (val: string) => {
    setGoogleApiKey(val);
    localStorage.setItem("gemini_tts_api_key", val);
  };

  // --- Voice Model Management: Create Blank Voice Model ---
  const handleCreateBlankVoice = () => {
    setDraftName("New Custom Voice");
    setDraftDescription("Created from scratch with direct vocal controls.");
    setDraftGender("Neutral");
    setDraftAccent("British (Received Pronunciation)");
    setIsCustomAccent(false);
    setDraftBaseVoice("Kore");
    setDraftStyleGuidance("Clear, articulate, and natural conversational cadence.");
    setDraftPitch("Medium");
    setDraftSpeed(1.0);
    setDraftNarrationStyle("Audiobook & Dialogue");
    setDraftPrompts([
      { id: `tp_${Date.now()}_1`, text: "The morning light filtered through the courtyard, waking the quiet stone city.", emotion: "Neutral", focus: "Vowel flow and sibilants" },
      { id: `tp_${Date.now()}_2`, text: "Could you please explain how this apparatus functions in low-gravity conditions?", emotion: "Inquisitive", focus: "Question rise and plosives" }
    ]);
    setPreviewText("This is a live preview of my new custom voice profile. Clean audio, zero prompt wrapping.");
    setPreviewAudioBase64(null);
    setDesignerMode("direct");
    setActiveTab("designer");
  };

  // --- Load Existing Model into Designer for Editing ---
  const handleEditModelInDesigner = (model: VoiceModel) => {
    setDraftName(model.name);
    setDraftDescription(model.description);
    setDraftGender(model.gender);
    setDraftAccent(model.accent);
    setIsCustomAccent(!ACCENT_PRESETS.includes(model.accent));
    setDraftBaseVoice(model.baseVoice);
    setDraftStyleGuidance(model.styleGuidance);
    setDraftPitch(model.pitch);
    setDraftSpeed(model.speed);
    setDraftNarrationStyle(model.narrationStyle);
    setDraftPrompts(model.trainingPrompts || []);
    setPreviewText(model.trainingPrompts?.[0]?.text || "Testing my voice model.");
    setPreviewAudioBase64(null);
    setDesignerMode("direct");
    setActiveTab("designer");
  };

  // --- Duplicate Voice Model ---
  const handleDuplicateModel = (model: VoiceModel) => {
    const duplicated: VoiceModel = {
      ...model,
      id: `model_${Date.now()}`,
      name: `${model.name} (Copy)`,
      createdAt: new Date().toISOString()
    };
    setVoiceModels(prev => [duplicated, ...prev]);
    setSelectedModelId(duplicated.id);
  };

  // --- Delete Voice Model (Allows deleting ANY model, no forced presets!) ---
  const handleDeleteModel = (modelId: string) => {
    if (voiceModels.length <= 1) {
      alert("At least one voice profile should remain in your studio. You can edit it or create a new one!");
      return;
    }
    const confirmed = confirm("Are you sure you want to delete this voice model profile?");
    if (!confirmed) return;

    setVoiceModels(prev => prev.filter(m => m.id !== modelId));
    setAudioClips(prev => prev.filter(c => c.modelId !== modelId));
    if (selectedModelId === modelId) {
      const remaining = voiceModels.filter(m => m.id !== modelId);
      if (remaining.length > 0) {
        setSelectedModelId(remaining[0].id);
      }
    }
  };

  // --- AI Voice Persona Designer (gemini-3.8-flash) ---
  const handleAiDesignVoice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!aiDesignPrompt.trim()) return;

    setIsAiDesigning(true);
    setAiDesignError(null);

    try {
      const response = await fetch("/api/voice-models/design", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: aiDesignPrompt,
          googleApiKey
        })
      });

      if (!response.ok) {
        let errorText = "Failed to design voice profile.";
        try {
          const err = await response.json();
          errorText = err.error || err.message || errorText;
        } catch {
          errorText = await response.text();
        }
        try {
          const parsed = JSON.parse(errorText);
          if (parsed.error?.message) {
            errorText = parsed.error.message;
          }
        } catch {}
        throw new Error(errorText);
      }

      const data = await response.json();

      setDraftName(data.name || "Custom Persona");
      setDraftDescription(data.description || "Designed with Gemini 3.8 Flash.");
      setDraftGender(data.gender || "Neutral");
      setDraftAccent(data.accent || "British (Received Pronunciation)");
      setIsCustomAccent(!ACCENT_PRESETS.includes(data.accent || ""));
      setDraftBaseVoice(data.baseVoice || "Kore");
      setDraftPitch(data.pitch || "Medium");
      setDraftSpeed(data.speed || 1.0);
      setDraftStyleGuidance(data.styleGuidance || "");
      setDraftNarrationStyle(data.narrationStyle || "General");
      setDraftPrompts(data.trainingPrompts || []);

      if (data.trainingPrompts?.[0]?.text) {
        setPreviewText(data.trainingPrompts[0].text);
      }

      setPreviewAudioBase64(null);
      setDesignerMode("direct");
    } catch (err: any) {
      console.error(err);
      let msg = err.message || "Failed to design voice persona.";
      try {
        const parsed = JSON.parse(msg);
        if (parsed.error?.message) msg = parsed.error.message;
      } catch {}
      setAiDesignError(msg);
    } finally {
      setIsAiDesigning(false);
    }
  };

  // --- Synthesize Live Acoustic Preview with Gemini 3.8 Flash TTS ---
  const handleGeneratePreview = async () => {
    if (!previewText.trim()) return;

    setIsPreviewGenerating(true);
    setPreviewError(null);
    setPreviewAudioBase64(null);
    setIsPlayingPreview(false);
    setPreviewProgress(0);
    if (previewIntervalRef.current) clearInterval(previewIntervalRef.current);

    try {
      const response = await fetch("/api/audio/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: previewText,
          baseVoice: draftBaseVoice,
          styleGuidance: draftStyleGuidance,
          speed: draftSpeed,
          pitch: draftPitch,
          googleApiKey
        })
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || "Preview generation failed.");
      }

      const data = await response.json();
      if (!data.audio) {
        throw new Error("No audio payload returned from Gemini 3.8 Flash TTS.");
      }

      setPreviewAudioBase64(data.audio);

      // Trigger immediate preview playback
      playBase64Wav(data.audio, (audio) => {
        previewAudioRef.current = audio;
        setIsPlayingPreview(true);
        audio.onended = () => {
          setIsPlayingPreview(false);
          setPreviewProgress(100);
          if (previewIntervalRef.current) clearInterval(previewIntervalRef.current);
        };
        previewIntervalRef.current = setInterval(() => {
          if (audio && audio.duration) {
            setPreviewProgress(Math.min((audio.currentTime / audio.duration) * 100, 100));
          }
        }, 80);
      });
    } catch (err: any) {
      console.error(err);
      setPreviewError(err.message || "Preview generation failed. Please check your Gemini API key.");
    } finally {
      setIsPreviewGenerating(false);
    }
  };

  const handleTogglePlayPreview = () => {
    if (!previewAudioBase64) return;
    if (isPlayingPreview && previewAudioRef.current) {
      previewAudioRef.current.pause();
      setIsPlayingPreview(false);
      if (previewIntervalRef.current) clearInterval(previewIntervalRef.current);
    } else if (previewAudioRef.current) {
      previewAudioRef.current.play();
      setIsPlayingPreview(true);
      previewIntervalRef.current = setInterval(() => {
        if (previewAudioRef.current && previewAudioRef.current.duration) {
          setPreviewProgress(Math.min((previewAudioRef.current.currentTime / previewAudioRef.current.duration) * 100, 100));
        }
      }, 80);
    } else {
      playBase64Wav(previewAudioBase64, (audio) => {
        previewAudioRef.current = audio;
        setIsPlayingPreview(true);
        audio.onended = () => {
          setIsPlayingPreview(false);
          setPreviewProgress(100);
        };
      });
    }
  };

  // --- Generate 10 Custom Phonetic Scripts via Gemini 3.8 ---
  const handleGenerateCustomPrompts = async () => {
    setIsGeneratingPrompts(true);
    try {
      const response = await fetch("/api/voice-models/generate-prompts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: draftName,
          gender: draftGender,
          accent: draftAccent,
          baseVoice: draftBaseVoice,
          narrationStyle: draftNarrationStyle,
          styleGuidance: draftStyleGuidance,
          googleApiKey
        })
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || "Failed to generate scripts.");
      }

      const prompts = await response.json();
      if (Array.isArray(prompts) && prompts.length > 0) {
        setDraftPrompts(prompts);
      }
    } catch (err: any) {
      alert("Error generating prompts: " + err.message);
    } finally {
      setIsGeneratingPrompts(false);
    }
  };

  // --- Save / Commit Voice Model to Studio Library ---
  const handleSaveDraftVoiceModel = () => {
    if (!draftName.trim()) {
      alert("Voice name cannot be empty.");
      return;
    }

    const newModel: VoiceModel = {
      id: `model_${Date.now()}`,
      name: draftName.trim(),
      description: draftDescription.trim(),
      gender: draftGender,
      accent: draftAccent,
      baseVoice: draftBaseVoice,
      styleGuidance: draftStyleGuidance.trim(),
      pitch: draftPitch,
      speed: draftSpeed,
      narrationStyle: draftNarrationStyle,
      trainingPrompts: draftPrompts,
      createdAt: new Date().toISOString()
    };

    setVoiceModels(prev => [newModel, ...prev]);
    setSelectedModelId(newModel.id);
    setActiveTab("studio");
  };

  // --- Synthesize High-Quality Clip in Clip Studio ---
  const handleGenerateStudioClip = async () => {
    if (!studioText.trim() || !activeModel) return;

    setIsGeneratingClip(true);
    setGenerationError(null);

    try {
      const response = await fetch("/api/audio/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: studioText,
          baseVoice: activeModel.baseVoice,
          styleGuidance: studioStyleOverride || activeModel.styleGuidance,
          speed: activeModel.speed,
          pitch: activeModel.pitch,
          googleApiKey
        })
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || "Synthesis failed.");
      }

      const data = await response.json();
      if (!data.audio) {
        throw new Error("No audio payload returned from Gemini 3.8 Flash TTS.");
      }

      // Estimate duration (24kHz mono 16-bit = 48,000 bytes per second)
      const binary = atob(data.audio);
      const estDuration = Math.max(0.5, Math.round(((binary.length - 44) / 48000) * 10) / 10);

      const newClip: AudioClip = {
        id: `clip_${Date.now()}`,
        modelId: activeModel.id,
        promptId: activePromptId || undefined,
        text: studioText.trim(),
        baseVoice: activeModel.baseVoice,
        styleApplied: studioStyleOverride || activeModel.styleGuidance,
        speed: activeModel.speed,
        pitch: activeModel.pitch,
        duration: estDuration,
        audioBase64: data.audio,
        createdAt: new Date().toISOString(),
        mode: "single"
      };

      setAudioClips(prev => [newClip, ...prev]);

      // Automatically play synthesized clip
      handlePlayClip(newClip);
    } catch (err: any) {
      console.error(err);
      setGenerationError(err.message || "Synthesis failed. Please verify API key configuration.");
    } finally {
      setIsGeneratingClip(false);
    }
  };

  // --- Audio Clip Playback Controller ---
  const handlePlayClip = (clip: AudioClip) => {
    if (playingClipId === clip.id) {
      if (audioRef.current) {
        audioRef.current.pause();
      }
      setPlayingClipId(null);
      if (playbackIntervalRef.current) clearInterval(playbackIntervalRef.current);
      return;
    }

    if (audioRef.current) {
      audioRef.current.pause();
    }
    if (playbackIntervalRef.current) clearInterval(playbackIntervalRef.current);

    setPlayingClipId(clip.id);
    setPlaybackProgress(0);

    playBase64Wav(clip.audioBase64, (audio) => {
      audioRef.current = audio;
      audio.onended = () => {
        setPlayingClipId(null);
        setPlaybackProgress(100);
        if (playbackIntervalRef.current) clearInterval(playbackIntervalRef.current);
      };

      playbackIntervalRef.current = setInterval(() => {
        if (audio && audio.duration) {
          setPlaybackProgress(Math.min((audio.currentTime / audio.duration) * 100, 100));
        }
      }, 80);
    });
  };

  // Helper to play base64 WAV file
  const playBase64Wav = (base64: string, onReady: (audio: HTMLAudioElement) => void) => {
    try {
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      const blob = new Blob([bytes], { type: "audio/wav" });
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audio.play().catch(e => console.warn("Audio autoplay blocked:", e));
      onReady(audio);
    } catch (err) {
      console.error("Failed to decode WAV:", err);
    }
  };

  // Helper to download single WAV
  const handleDownloadWav = (clip: AudioClip) => {
    const binary = atob(clip.audioBase64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    const blob = new Blob([bytes], { type: "audio/wav" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `gemini38_${clip.id}.wav`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Helper to export dataset as ZIP with metadata.csv
  const handleExportDatasetZip = async () => {
    if (activeModelClips.length === 0) {
      alert("No audio clips synthesized for this model yet. Generate clips in Clip Studio first!");
      return;
    }

    const zip = new JSZip();
    const audioFolder = zip.folder("wavs");
    let csvRows = ["audio_filename" + exportSeparator + "transcript" + exportSeparator + "speaker" + exportSeparator + "style"];

    activeModelClips.forEach((clip, index) => {
      const filename = `clip_${index + 1}.wav`;
      const binary = atob(clip.audioBase64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      audioFolder?.file(filename, bytes);

      const cleanTranscript = clip.text.replace(/"/g, '""').replace(/[\r\n]+/g, " ");
      const speaker = activeModel?.name || "Speaker";
      const style = (clip.styleApplied || "").replace(/"/g, '""');

      csvRows.push(`wavs/${filename}${exportSeparator}"${cleanTranscript}"${exportSeparator}"${speaker}"${exportSeparator}"${style}"`);
    });

    zip.file("metadata.csv", csvRows.join("\n"));

    const readme = `# LoRA / TTS Training Dataset - ${activeModel?.name || "Voice Persona"}
Synthesized with native Gemini 3.8 Flash TTS.
- Base Resonance: ${activeModel?.baseVoice}
- Accent / Dialect: ${activeModel?.accent}
- Performance Style: ${activeModel?.styleGuidance}
- Sample Rate: 24,000Hz WAV (Mono, 16-bit LE)
- Total Clips: ${activeModelClips.length}
`;
    zip.file("README.md", readme);

    const blob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(activeModel?.name || "voice_model").toLowerCase().replace(/\s+/g, "_")}_dataset.zip`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Insert tag helper
  const handleInsertTag = (tag: string, targetSetter: React.Dispatch<React.SetStateAction<string>>) => {
    targetSetter(prev => `${prev} ${tag} `);
  };

  // Generate dynamic waveform bars for visualizer
  const renderWaveBars = (base64: string, isPlaying: boolean, progress: number) => {
    const barsCount = 36;
    const bars = [];
    for (let i = 0; i < barsCount; i++) {
      const heightPercent = 25 + Math.abs(Math.sin((i * 1.5) + (base64.charCodeAt(i % base64.length) || 0))) * 65;
      const isPassed = isPlaying && (i / barsCount) * 100 <= progress;
      bars.push(
        <div
          key={i}
          className={`flex-1 rounded-full transition-all duration-100 ${
            isPassed ? "bg-indigo-400" : isPlaying ? "bg-slate-700" : "bg-slate-800"
          }`}
          style={{ height: `${heightPercent}%`, transform: isPassed ? "scaleY(1.2)" : "scaleY(1)" }}
        />
      );
    }
    return bars;
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* HEADER BAR */}
      <header className="border-b border-slate-800/80 bg-slate-900/70 backdrop-blur-md px-6 py-3.5 flex flex-col md:flex-row md:items-center md:justify-between gap-4 sticky top-0 z-40">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl text-white shadow-lg shadow-indigo-500/20">
            <Volume2 className="h-6 w-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold font-display tracking-tight text-white">
                Gemini 3.8 Flash TTS Studio
              </h1>
              <span className="text-[10px] uppercase font-mono font-bold tracking-wider px-2 py-0.5 bg-indigo-500/20 text-indigo-300 rounded border border-indigo-500/30">
                Flagship Audio
              </span>
            </div>
            <p className="text-xs text-slate-400">Multi-speaker audiobook production, ACX compliance mastering, uninhibited voice design, and Pro M4B packaging.</p>
          </div>
        </div>

        {/* Global Active Voice Selector & Blank Voice Action */}
        <div className="flex items-center gap-2">
          {voiceModels.length > 0 && (
            <div className="flex items-center gap-2 bg-slate-950 border border-slate-800 rounded-lg p-1">
              <span className="text-xs text-slate-400 pl-2">Active:</span>
              <select
                value={selectedModelId}
                onChange={(e) => setSelectedModelId(e.target.value)}
                className="bg-slate-900 border border-slate-700 text-xs text-slate-100 rounded px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-medium"
              >
                {voiceModels.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} ({m.baseVoice} • {m.accent.split("(")[0].trim()})
                  </option>
                ))}
              </select>
            </div>
          )}

          <button
            onClick={() => setShowVoiceSidebar(!showVoiceSidebar)}
            className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg border transition-colors cursor-pointer ${
              showVoiceSidebar
                ? "bg-indigo-600 text-white border-indigo-500 shadow-md shadow-indigo-600/20"
                : "bg-slate-900 hover:bg-slate-800 text-slate-300 border-slate-800"
            }`}
            title="Toggle Voice Models & 6-Voice Acoustic Roster drawer"
          >
            <Layers className="h-4 w-4 text-indigo-400" />
            <span>Voice Models ({voiceModels.length})</span>
          </button>

          <button
            onClick={handleCreateBlankVoice}
            className="bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white font-semibold text-xs py-2 px-3 rounded-lg flex items-center gap-1.5 transition-colors shadow-md shadow-indigo-600/20 cursor-pointer"
          >
            <Plus className="h-3.5 w-3.5" /> New Voice
          </button>
        </div>
      </header>

      {/* FULL WIDTH MAIN CONTAINER */}
      <main className="flex-1 w-full px-4 lg:px-8 py-5 flex flex-col gap-5">
        
        {/* TOP TAB BAR: ALL PRODUCTION TABS */}
        <div className="flex border-b border-slate-800 bg-slate-950/80 p-1.5 rounded-xl gap-1 overflow-x-auto w-full shadow-lg">
          <button
            onClick={() => setActiveTab("audiobook")}
            className={`px-4 py-2.5 text-xs font-bold transition-all flex items-center gap-2 rounded-lg whitespace-nowrap cursor-pointer ${
              activeTab === "audiobook"
                ? "bg-emerald-600 text-white shadow-lg shadow-emerald-600/20"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
            }`}
          >
            <BookOpen className="h-4 w-4 text-emerald-400" /> Multi-Speaker Audiobook Studio
          </button>

          <button
            onClick={() => setActiveTab("m4b")}
            className={`px-4 py-2.5 text-xs font-bold transition-all flex items-center gap-2 rounded-lg whitespace-nowrap cursor-pointer ${
              activeTab === "m4b"
                ? "bg-purple-600 text-white shadow-lg shadow-purple-600/20"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
            }`}
          >
            <Headphones className="h-4 w-4 text-purple-400" /> Pro M4B Creator
          </button>

          <button
            onClick={() => setActiveTab("acx")}
            className={`px-4 py-2.5 text-xs font-bold transition-all flex items-center gap-2 rounded-lg whitespace-nowrap cursor-pointer ${
              activeTab === "acx"
                ? "bg-amber-600 text-white shadow-lg shadow-amber-600/20"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
            }`}
          >
            <ShieldCheck className="h-4 w-4 text-amber-400" /> ACX Audio Mastering
          </button>

          <button
            onClick={() => setActiveTab("lora")}
            className={`px-4 py-2.5 text-xs font-bold transition-all flex items-center gap-2 rounded-lg whitespace-nowrap cursor-pointer ${
              activeTab === "lora" || activeTab === "library"
                ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/20"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
            }`}
          >
            <Database className="h-4 w-4 text-indigo-400" /> LoRA Training / Dataset Studio ({audioClips.length})
          </button>

          <button
            onClick={() => setActiveTab("screenplay")}
            className={`px-4 py-2.5 text-xs font-bold transition-all flex items-center gap-2 rounded-lg whitespace-nowrap cursor-pointer ${
              activeTab === "screenplay"
                ? "bg-cyan-600 text-white shadow-lg shadow-cyan-600/20"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
            }`}
          >
            <Film className="h-4 w-4 text-cyan-400" /> Multi-Speaker Screenplay
          </button>

          <button
            onClick={() => setActiveTab("designer")}
            className={`px-4 py-2.5 text-xs font-bold transition-all flex items-center gap-2 rounded-lg whitespace-nowrap cursor-pointer ${
              activeTab === "designer"
                ? "bg-pink-600 text-white shadow-lg shadow-pink-600/20"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
            }`}
          >
            <Wand2 className="h-4 w-4 text-pink-400" /> Voice Designer
          </button>

          <button
            onClick={() => setActiveTab("studio")}
            className={`px-4 py-2.5 text-xs font-bold transition-all flex items-center gap-2 rounded-lg whitespace-nowrap cursor-pointer ${
              activeTab === "studio"
                ? "bg-blue-600 text-white shadow-lg shadow-blue-600/20"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
            }`}
          >
            <Mic className="h-4 w-4 text-blue-400" /> Clip Studio
          </button>
        </div>

        {/* WORKSPACE CANVAS (FULL WIDTH) */}
        <section className="w-full flex-1 flex flex-col bg-slate-900/90 rounded-xl border border-slate-800 overflow-hidden shadow-2xl">
          <div className="p-6 flex-1 flex flex-col w-full">

            {/* TAB: AUDIOBOOK STUDIO */}
            {activeTab === "audiobook" && (
              <AudiobookStudio
                voiceModels={voiceModels}
                googleApiKey={googleApiKey}
                project={audiobookProject}
                onUpdateProject={handleUpdateAudiobookProject}
              />
            )}

            {/* TAB: PRO M4B CREATOR */}
            {activeTab === "m4b" && (
              <M4BCreatorPanel
                project={audiobookProject}
                onUpdateProject={handleUpdateAudiobookProject}
                onSwitchToTab={(t) => {
                  if (t === "import" || t === "director") setActiveTab("audiobook");
                  else if (t === "acx") setActiveTab("acx");
                }}
              />
            )}

            {/* TAB: ACX AUDIO MASTERING */}
            {activeTab === "acx" && (
              <ACXMasteringPanel
                project={audiobookProject}
                activeChapter={activeChapter}
                onUpdateChapter={(up) => {
                  const updatedChs = audiobookProject.chapters.map(c => c.id === up.id ? up : c);
                  handleUpdateAudiobookProject({ ...audiobookProject, chapters: updatedChs });
                }}
                onUpdateChunk={(chunkId, upChunk) => {
                  const updatedChs = audiobookProject.chapters.map(c => ({
                    ...c,
                    chunks: c.chunks.map(k => k.id === chunkId ? { ...k, ...upChunk } : k)
                  }));
                  handleUpdateAudiobookProject({ ...audiobookProject, chapters: updatedChs });
                }}
                onUpdateAllChapters={(chs) => handleUpdateAudiobookProject({ ...audiobookProject, chapters: chs })}
              />
            )}

            {/* TAB: MULTI-SPEAKER SCREENPLAY */}
            {activeTab === "screenplay" && (
              <DialogueStudio voiceModels={voiceModels} googleApiKey={googleApiKey} />
            )}

            {/* TAB: ADVANCED VOICE DESIGNER */}
            {activeTab === "designer" && (
              <div className="flex flex-col gap-6 flex-1">
                
                {/* Header & Mode Switcher */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
                  <div>
                    <h2 className="text-lg font-bold text-white flex items-center gap-2">
                      <Sparkles className="h-5 w-5 text-amber-400" />
                      Gemini 3.8 Voice Designer
                    </h2>
                    <p className="text-xs text-slate-400">Design your vocal profile using direct parameters or draft automatically with AI.</p>
                  </div>

                  <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800">
                    <button
                      onClick={() => setDesignerMode("direct")}
                      className={`text-xs font-semibold px-3 py-1.5 rounded transition-all cursor-pointer ${
                        designerMode === "direct" ? "bg-indigo-600 text-white shadow" : "text-slate-400 hover:text-slate-200"
                      }`}
                    >
                      <Sliders className="h-3.5 w-3.5 inline mr-1" /> Direct Controls
                    </button>
                    <button
                      onClick={() => setDesignerMode("ai")}
                      className={`text-xs font-semibold px-3 py-1.5 rounded transition-all cursor-pointer ${
                        designerMode === "ai" ? "bg-indigo-600 text-white shadow" : "text-slate-400 hover:text-slate-200"
                      }`}
                    >
                      <Sparkles className="h-3.5 w-3.5 inline mr-1 text-amber-300" /> AI Persona Generator
                    </button>
                  </div>
                </div>

                {/* AI Persona Prompt Mode */}
                {designerMode === "ai" && (
                  <form onSubmit={handleAiDesignVoice} className="bg-slate-950/70 border border-slate-800 p-4 rounded-xl flex flex-col gap-3">
                    <label className="text-xs font-bold text-indigo-300 uppercase tracking-wider font-mono">
                      Describe the Voice Persona
                    </label>
                    <textarea
                      value={aiDesignPrompt}
                      onChange={(e) => setAiDesignPrompt(e.target.value)}
                      placeholder="e.g. A fast-talking, cheeky Cockney street merchant who laughs frequently (<laugh>) and speaks with quick wit..."
                      rows={3}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg p-3 text-xs text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 leading-relaxed placeholder-slate-600"
                    />

                    <div className="flex items-center justify-between gap-3">
                      <span className="text-[11px] text-slate-400">Gemini 3.8 will extract accent, acoustic base voice, style guidance, and script prompts.</span>
                      <button
                        type="submit"
                        disabled={isAiDesigning || !aiDesignPrompt.trim()}
                        className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-bold py-2 px-4 rounded-lg flex items-center gap-1.5 cursor-pointer shrink-0"
                      >
                        {isAiDesigning ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                        Generate Persona
                      </button>
                    </div>

                    {aiDesignError && (
                      <div className="p-3 rounded-lg bg-rose-950/40 border border-rose-800/60 text-rose-200 text-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-lg">
                        <div className="flex items-center gap-2">
                          <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
                          <span>{aiDesignError}</span>
                        </div>
                        <button
                          type="submit"
                          disabled={isAiDesigning}
                          className="px-3 py-1 bg-rose-800 hover:bg-rose-700 text-white rounded text-[11px] font-semibold transition-colors flex items-center gap-1.5 cursor-pointer shrink-0 self-end sm:self-auto"
                        >
                          <RefreshCw className="h-3 w-3" />
                          Retry
                        </button>
                      </div>
                    )}
                  </form>
                )}

                {/* Direct Voice Parameter Settings */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5 bg-slate-950/40 p-4 rounded-xl border border-slate-800">
                  
                  {/* Name */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-mono uppercase tracking-wider font-bold text-slate-300">Voice Profile Name</label>
                    <input
                      type="text"
                      value={draftName}
                      onChange={(e) => setDraftName(e.target.value)}
                      placeholder="e.g. Cockney Streetwise Narrator"
                      className="bg-slate-900 border border-slate-800 rounded px-3 py-2 text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-medium"
                    />
                  </div>

                  {/* Accent / Dialect */}
                  <div className="flex flex-col gap-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-mono uppercase tracking-wider font-bold text-slate-300">
                        Accent / Regional Dialect
                      </label>
                      <button
                        type="button"
                        onClick={() => setIsCustomAccent(prev => !prev)}
                        className="text-[11px] text-indigo-400 hover:text-indigo-300 flex items-center gap-1 font-semibold cursor-pointer"
                      >
                        {isCustomAccent ? "📋 Select from List" : "✏️ Type Custom"}
                      </button>
                    </div>

                    {!isCustomAccent && ACCENT_PRESETS.includes(draftAccent) ? (
                      <select
                        value={draftAccent}
                        onChange={(e) => {
                          const val = e.target.value;
                          if (val === "__custom__") {
                            setIsCustomAccent(true);
                          } else {
                            setDraftAccent(val);
                          }
                        }}
                        className="w-full bg-slate-900 border border-slate-800 rounded px-3 py-2 text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-medium cursor-pointer"
                      >
                        {ACCENT_PRESETS.map((acc) => (
                          <option key={acc} value={acc}>{acc}</option>
                        ))}
                        <option value="__custom__">-- ✏️ Custom Dialect (Type Manually) --</option>
                      </select>
                    ) : (
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={draftAccent}
                          onChange={(e) => setDraftAccent(e.target.value)}
                          placeholder="e.g. Scottish Highlands, South African, Welsh, Geordie"
                          autoFocus
                          className="w-full bg-slate-900 border border-indigo-500/50 rounded px-3 py-2 text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-medium placeholder-slate-500"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            setIsCustomAccent(false);
                            if (!ACCENT_PRESETS.includes(draftAccent)) {
                              setDraftAccent(ACCENT_PRESETS[0]);
                            }
                          }}
                          className="px-2.5 py-1 text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 rounded border border-slate-700 shrink-0 cursor-pointer"
                          title="Back to dropdown list"
                        >
                          List
                        </button>
                      </div>
                    )}

                    {/* Quick Popular Accent Chips */}
                    <div className="flex flex-wrap items-center gap-1.5 pt-1">
                      <span className="text-[10px] text-slate-500 font-mono">Popular:</span>
                      {[
                        { label: "Cockney", full: "British (Cockney London)" },
                        { label: "British RP", full: "British (Received Pronunciation)" },
                        { label: "Scottish", full: "Scottish (Highlands)" },
                        { label: "Irish", full: "Irish (Dublin)" },
                        { label: "Australian", full: "Australian (Broad Outback)" },
                        { label: "Southern US", full: "American (Southern Drawl)" },
                      ].map(pill => (
                        <button
                          key={pill.label}
                          type="button"
                          onClick={() => {
                            setDraftAccent(pill.full);
                            setIsCustomAccent(false);
                          }}
                          className={`text-[10px] px-2 py-0.5 rounded-full border transition-all cursor-pointer font-medium ${
                            draftAccent === pill.full
                              ? "bg-indigo-600/30 border-indigo-400 text-indigo-300"
                              : "bg-slate-900 hover:bg-slate-800 border-slate-800 text-slate-400"
                          }`}
                        >
                          {pill.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Base Prebuilt Voice Resonance Selection */}
                  <div className="flex flex-col gap-1.5 md:col-span-2">
                    <label className="text-xs font-mono uppercase tracking-wider font-bold text-slate-300 flex items-center justify-between">
                      <span>Base Physical Resonance (All 6 Gemini 3.8 Voices)</span>
                      <span className="text-[11px] text-indigo-400 font-normal">Active: <strong>{draftBaseVoice}</strong></span>
                    </label>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
                      {ROSTER_VOICES.map((v) => (
                        <button
                          key={v.id}
                          type="button"
                          onClick={() => setDraftBaseVoice(v.id)}
                          className={`p-2 rounded-lg border text-left flex flex-col transition-all cursor-pointer ${
                            draftBaseVoice === v.id
                              ? "bg-indigo-600/30 border-indigo-400 ring-1 ring-indigo-400"
                              : "bg-slate-900 border-slate-800 hover:border-slate-700"
                          }`}
                        >
                          <div className="flex items-center justify-between w-full">
                            <span className="font-bold text-xs text-white">{v.id}</span>
                            <span className="text-[9px] text-slate-400">{v.gender[0]}</span>
                          </div>
                          <span className="text-[10px] text-slate-400 truncate mt-0.5">{v.tone}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Style Guidance (Direct speechMetadata.style - NO prompt wrapping) */}
                  <div className="flex flex-col gap-1.5 md:col-span-2">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-mono uppercase tracking-wider font-bold text-slate-300">
                        Acting &amp; Style Guidance (Sent directly to speechMetadata.style)
                      </label>
                      <span className="text-[10px] text-emerald-400 font-mono">100% Clean Performance</span>
                    </div>
                    <textarea
                      value={draftStyleGuidance}
                      onChange={(e) => setDraftStyleGuidance(e.target.value)}
                      rows={2}
                      placeholder="e.g. Speak with an authentic Cockney accent, lively street merchant rhythm, warm and expressive."
                      className="bg-slate-900 border border-slate-800 rounded-lg p-2.5 text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-indigo-500 leading-normal"
                    />
                    <span className="text-[10px] text-slate-400">
                      Gemini 3.8 Flash TTS naturally executes authentic accents, emotional cadence, and throat texture when instructed directly.
                    </span>
                  </div>

                  {/* Pace Slider & Pitch */}
                  <div className="flex flex-col gap-1.5">
                    <div className="flex justify-between items-center text-xs font-mono">
                      <label className="uppercase tracking-wider font-bold text-slate-300">Speaking Pace / Rate</label>
                      <span className="text-indigo-400 font-bold">{draftSpeed.toFixed(2)}x (Native)</span>
                    </div>
                    <input
                      type="range"
                      min="0.75"
                      max="1.50"
                      step="0.05"
                      value={draftSpeed}
                      onChange={(e) => setDraftSpeed(parseFloat(e.target.value))}
                      className="w-full accent-indigo-500 cursor-pointer h-1.5 bg-slate-900 rounded-lg appearance-none mt-2"
                    />
                    <div className="flex justify-between text-[10px] text-slate-500 font-mono">
                      <span>0.75x</span>
                      <span className="text-slate-300 font-bold">1.00x (Standard)</span>
                      <span>1.50x</span>
                    </div>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-mono uppercase tracking-wider font-bold text-slate-300">Vocal Pitch</label>
                    <select
                      value={draftPitch}
                      onChange={(e) => setDraftPitch(e.target.value)}
                      className="bg-slate-900 border border-slate-800 rounded px-3 py-2 text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-medium"
                    >
                      <option value="Low">Low (Deep)</option>
                      <option value="Medium-Low">Medium-Low</option>
                      <option value="Medium">Medium (Balanced)</option>
                      <option value="Medium-High">Medium-High</option>
                      <option value="High">High (Bright)</option>
                    </select>
                  </div>

                </div>

                {/* LIVE ACOUSTIC PREVIEW CARD */}
                <div className="bg-indigo-950/20 border border-indigo-500/25 p-5 rounded-xl flex flex-col gap-4 shadow-xl">
                  <div className="flex items-center justify-between border-b border-indigo-500/20 pb-2.5">
                    <div className="flex items-center gap-2">
                      <Volume2 className="h-5 w-5 text-indigo-400 animate-pulse" />
                      <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-indigo-300">
                        Live Acoustic Preview (Gemini 3.8 Flash TTS)
                      </h3>
                    </div>
                    <span className="text-[10px] font-mono bg-indigo-500/10 text-indigo-300 px-2 py-0.5 rounded border border-indigo-500/20">
                      24kHz RIFF WAV
                    </span>
                  </div>

                  <div className="flex flex-col gap-2">
                    <div className="flex justify-between items-center text-xs">
                      <label className="text-slate-300 font-medium">Test Script Sentence</label>
                      <div className="flex items-center gap-1">
                        <span className="text-[10px] text-slate-400">Quick Insert Bursts:</span>
                        {VOCAL_BURSTS.slice(0, 4).map(b => (
                          <button
                            key={b.tag}
                            type="button"
                            onClick={() => handleInsertTag(b.tag, setPreviewText)}
                            className="text-[10px] font-mono bg-slate-900 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 px-1.5 py-0.5 rounded cursor-pointer transition-colors"
                            title={b.desc}
                          >
                            {b.tag}
                          </button>
                        ))}
                      </div>
                    </div>
                    <textarea
                      value={previewText}
                      onChange={(e) => setPreviewText(e.target.value)}
                      rows={2}
                      className="bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-indigo-500 leading-normal"
                    />
                  </div>

                  {/* Preview Trigger and Wave Visualizer */}
                  <div className="flex flex-col sm:flex-row items-center gap-4">
                    <button
                      type="button"
                      onClick={handleGeneratePreview}
                      disabled={isPreviewGenerating || !previewText.trim()}
                      className="w-full sm:w-auto bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold text-xs py-2.5 px-5 rounded-lg flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-indigo-600/20"
                    >
                      {isPreviewGenerating ? (
                        <>
                          <RefreshCw className="h-4 w-4 animate-spin" /> Synthesizing WAV...
                        </>
                      ) : (
                        <>
                          <Volume2 className="h-4 w-4" /> Synthesize Live Preview
                        </>
                      )}
                    </button>

                    {previewAudioBase64 && (
                      <div className="flex-1 w-full flex items-center gap-3 bg-slate-950/80 px-4 py-2 rounded-lg border border-slate-800">
                        <button
                          type="button"
                          onClick={handleTogglePlayPreview}
                          className="p-2 rounded-full bg-indigo-600 text-white hover:bg-indigo-500 transition-colors cursor-pointer"
                        >
                          {isPlayingPreview ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 fill-current ml-0.5" />}
                        </button>
                        <div className="flex-1 flex items-end gap-1 h-8">
                          {renderWaveBars(previewAudioBase64, isPlayingPreview, previewProgress)}
                        </div>
                      </div>
                    )}
                  </div>

                  {previewError && (
                    <div className="p-2.5 rounded bg-rose-950/30 border border-rose-900/50 text-rose-300 text-xs flex items-center gap-2">
                      <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
                      <span>{previewError}</span>
                    </div>
                  )}
                </div>

                {/* Training Scripts Editor for LoRA fine-tuning */}
                <div className="bg-slate-950/40 border border-slate-800 p-4 rounded-xl flex flex-col gap-3">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                    <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                      <BookOpen className="h-4 w-4 text-indigo-400" /> Phonetic Training Scripts ({draftPrompts.length})
                    </h3>
                    <button
                      type="button"
                      onClick={handleGenerateCustomPrompts}
                      disabled={isGeneratingPrompts}
                      className="text-xs font-semibold text-indigo-400 hover:text-indigo-300 flex items-center gap-1 cursor-pointer"
                    >
                      {isGeneratingPrompts ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                      Generate More Scripts
                    </button>
                  </div>

                  <div className="flex flex-col gap-2 max-h-[220px] overflow-y-auto pr-1">
                    {draftPrompts.map((p, idx) => (
                      <div key={p.id || idx} className="p-2.5 bg-slate-900/90 rounded border border-slate-800 flex flex-col gap-1.5">
                        <div className="flex items-center justify-between text-[10px] font-mono text-slate-400">
                          <span className="font-bold text-slate-300">Script #{idx + 1}</span>
                          <span className="text-indigo-400 font-semibold">{p.emotion}</span>
                        </div>
                        <input
                          type="text"
                          value={p.text}
                          onChange={(e) => {
                            const val = e.target.value;
                            setDraftPrompts(prev => prev.map((item, i) => i === idx ? { ...item, text: val } : item));
                          }}
                          className="bg-slate-950 border border-slate-800 rounded px-2.5 py-1 text-xs text-slate-200"
                        />
                      </div>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setDraftPrompts(prev => [
                        ...prev,
                        { id: `tp_${Date.now()}`, text: "Add your custom training script line here...", emotion: "Neutral", focus: "Phonetic practice" }
                      ]);
                    }}
                    className="self-start text-xs font-semibold text-indigo-400 hover:text-indigo-300 flex items-center gap-1 cursor-pointer pt-1"
                  >
                    + Add Training Line
                  </button>
                </div>

                {/* Commit to Studio Library */}
                <div className="flex justify-end gap-3 pt-2 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={handleSaveDraftVoiceModel}
                    className="bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white font-bold text-xs py-3 px-6 rounded-lg shadow-lg shadow-emerald-600/20 flex items-center gap-2 cursor-pointer transition-all"
                  >
                    <CheckCircle2 className="h-4 w-4" /> Save Voice Model to Studio Library
                  </button>
                </div>

              </div>
            )}

            {/* TAB 2: CLIP STUDIO SYNTHESIZER */}
            {activeTab === "studio" && (
              <div className="flex flex-col gap-6 flex-1">
                {activeModel ? (
                  <>
                    {/* Active Voice Summary Card */}
                    <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex flex-col">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-white">{activeModel.name}</span>
                          <span className="text-xs font-mono px-2 py-0.5 bg-indigo-500/10 text-indigo-400 rounded border border-indigo-500/20">
                            {activeModel.baseVoice}
                          </span>
                        </div>
                        <span className="text-xs text-slate-400 mt-0.5">{activeModel.accent} • {activeModel.narrationStyle}</span>
                      </div>
                      <button
                        onClick={() => handleEditModelInDesigner(activeModel)}
                        className="text-xs font-semibold text-indigo-400 hover:text-indigo-300 flex items-center gap-1 cursor-pointer self-start sm:self-auto"
                      >
                        <Settings2 className="h-3.5 w-3.5" /> Edit Profile in Designer
                      </button>
                    </div>

                    {/* Script Synthesis Box */}
                    <div className="flex flex-col gap-2">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-mono uppercase tracking-wider font-bold text-slate-300">
                          Synthesis Script
                        </label>
                        <span className="text-[11px] text-slate-500 font-mono">{studioText.length} chars</span>
                      </div>

                      <textarea
                        value={studioText}
                        onChange={(e) => setStudioText(e.target.value)}
                        placeholder="Type script sentence or select a recommended prompt below..."
                        rows={4}
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 leading-relaxed placeholder-slate-600"
                      />

                      {/* Expressive Burst & Backchannel Toolbar */}
                      <div className="flex flex-wrap items-center gap-1.5 p-2 bg-slate-950/80 border border-slate-800/80 rounded-lg">
                        <span className="text-[10px] font-mono text-slate-400 pr-1">Insert Gemini 3.8 Bursts:</span>
                        {VOCAL_BURSTS.map((burst) => (
                          <button
                            key={burst.tag}
                            type="button"
                            onClick={() => handleInsertTag(burst.tag, setStudioText)}
                            className="text-[11px] font-mono bg-slate-900 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 px-2 py-1 rounded cursor-pointer transition-colors"
                            title={burst.desc}
                          >
                            {burst.tag}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Active Style Guidance Display */}
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-mono uppercase tracking-wider font-bold text-slate-400">
                        Performance Direction (speechMetadata.style)
                      </label>
                      <input
                        type="text"
                        value={studioStyleOverride}
                        onChange={(e) => setStudioStyleOverride(e.target.value)}
                        placeholder="Style cues passed to Gemini 3.8 Flash TTS..."
                        className="bg-slate-950 border border-slate-800 rounded px-3 py-2 text-xs text-slate-200"
                      />
                    </div>

                    {/* Synthesize Action */}
                    <button
                      type="button"
                      onClick={handleGenerateStudioClip}
                      disabled={isGeneratingClip || !studioText.trim()}
                      className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold text-sm py-3 px-6 rounded-lg flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/20 cursor-pointer transition-all"
                    >
                      {isGeneratingClip ? (
                        <>
                          <RefreshCw className="h-4 w-4 animate-spin" /> Synthesizing High-Fidelity Audio...
                        </>
                      ) : (
                        <>
                          <Volume2 className="h-4 w-4" /> Synthesize &amp; Save Clip (WAV)
                        </>
                      )}
                    </button>

                    {generationError && (
                      <div className="p-3 rounded-lg bg-rose-950/30 border border-rose-900/50 text-rose-300 text-xs flex items-center gap-2">
                        <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
                        <span>{generationError}</span>
                      </div>
                    )}

                    {/* Recommended Scripts Selector */}
                    {activeModel.trainingPrompts && activeModel.trainingPrompts.length > 0 && (
                      <div className="flex flex-col gap-2 pt-2 border-t border-slate-800">
                        <span className="text-xs font-mono font-bold uppercase tracking-wider text-slate-400">
                          Recommended Persona Training Scripts:
                        </span>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {activeModel.trainingPrompts.map((p) => (
                            <div
                              key={p.id}
                              onClick={() => {
                                setStudioText(p.text);
                                setActivePromptId(p.id);
                              }}
                              className={`p-2.5 rounded-lg border text-left cursor-pointer transition-all ${
                                studioText === p.text
                                  ? "bg-indigo-950/40 border-indigo-500/70"
                                  : "bg-slate-950/40 border-slate-800 hover:bg-slate-900"
                              }`}
                            >
                              <div className="flex justify-between items-center text-[10px] font-mono text-slate-500 mb-1">
                                <span className="font-semibold text-indigo-400">{p.emotion}</span>
                                <span className="truncate">{p.focus}</span>
                              </div>
                              <p className="text-xs text-slate-200 line-clamp-2 italic">"{p.text}"</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="p-8 text-center text-slate-400">
                    No voice model selected. Click "New Voice from Scratch" to begin.
                  </div>
                )}
              </div>
            )}

            {/* TAB: LORA TRAINING & DATASET STUDIO */}
            {(activeTab === "lora" || activeTab === "library") && (
              <LoRADatasetStudio
                activeModel={activeModel}
                voiceModels={voiceModels}
                onSelectModel={setSelectedModelId}
                audioClips={audioClips}
                setAudioClips={setAudioClips}
                googleApiKey={googleApiKey}
                onNavigateToDesigner={() => setActiveTab("designer")}
                onNavigateToClipStudio={() => setActiveTab("studio")}
              />
            )}

          </div>

        </section>

        {/* SLIDE-OVER DRAWER: VOICE MODELS & ACOUSTIC ROSTER */}
        {showVoiceSidebar && (
          <div className="fixed inset-0 z-50 flex justify-end animate-in fade-in duration-200">
            {/* Backdrop */}
            <div
              className="fixed inset-0 bg-black/70 backdrop-blur-sm"
              onClick={() => setShowVoiceSidebar(false)}
            />

            {/* Slide Sheet */}
            <aside className="relative w-full max-w-md bg-slate-900 border-l border-slate-800 p-6 flex flex-col gap-5 shadow-2xl z-10 overflow-y-auto">
              {/* Header */}
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <Layers className="h-5 w-5 text-indigo-400" />
                  <h2 className="text-sm font-bold text-white uppercase tracking-wider font-mono">
                    Voice Models &amp; Roster
                  </h2>
                </div>
                <button
                  onClick={() => setShowVoiceSidebar(false)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
                  title="Close panel"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Action: Create New Voice */}
              <button
                onClick={() => {
                  handleCreateBlankVoice();
                  setShowVoiceSidebar(false);
                  setActiveTab("designer");
                }}
                className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs py-2.5 px-4 rounded-lg flex items-center justify-center gap-2 shadow-md shadow-indigo-600/20 cursor-pointer transition-all"
              >
                <Plus className="h-4 w-4" /> Create New Voice from Scratch
              </button>

              {/* My Voice Profiles */}
              <div className="flex flex-col gap-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono font-bold uppercase text-slate-300">
                    My Voice Profiles ({voiceModels.length})
                  </span>
                </div>

                <div className="flex flex-col gap-2 max-h-[260px] overflow-y-auto pr-1">
                  {voiceModels.length === 0 ? (
                    <div className="p-4 text-center text-xs text-slate-500 border border-dashed border-slate-800 rounded-lg">
                      No custom voice models created yet.
                    </div>
                  ) : (
                    voiceModels.map((model) => {
                      const isSelected = model.id === selectedModelId;
                      const clipCount = audioClips.filter((c) => c.modelId === model.id).length;

                      return (
                        <div
                          key={model.id}
                          onClick={() => {
                            setSelectedModelId(model.id);
                          }}
                          className={`p-3 rounded-lg border text-left cursor-pointer transition-all flex flex-col gap-2 ${
                            isSelected
                              ? "bg-slate-800/90 border-indigo-500 shadow-md ring-1 ring-indigo-500/40"
                              : "bg-slate-950/60 border-slate-800 hover:bg-slate-950 hover:border-slate-700"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex flex-col min-w-0">
                              <span className="text-xs font-bold text-slate-100 truncate">{model.name}</span>
                              <span className="text-[11px] text-indigo-400 font-medium truncate">{model.accent}</span>
                            </div>
                            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-400 shrink-0">
                              {model.baseVoice}
                            </span>
                          </div>

                          <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1 border-t border-slate-800/50">
                            <span className="font-mono">{clipCount} clips</span>
                            <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                              <button
                                onClick={() => {
                                  handleEditModelInDesigner(model);
                                  setShowVoiceSidebar(false);
                                  setActiveTab("designer");
                                }}
                                className="text-slate-400 hover:text-indigo-300 p-1 rounded hover:bg-slate-800 transition-colors"
                                title="Edit in Voice Designer"
                              >
                                <Settings2 className="h-3.5 w-3.5" />
                              </button>
                              <button
                                onClick={() => handleDuplicateModel(model)}
                                className="text-slate-400 hover:text-slate-200 p-1 rounded hover:bg-slate-800 transition-colors"
                                title="Duplicate Model"
                              >
                                <Copy className="h-3.5 w-3.5" />
                              </button>
                              <button
                                onClick={() => handleDeleteModel(model.id)}
                                className="text-slate-500 hover:text-rose-400 p-1 rounded hover:bg-rose-500/10 transition-colors"
                                title="Delete Voice Model"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Gemini 3.8 Voice Roster */}
              <div className="flex flex-col gap-2.5 pt-3 border-t border-slate-800">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono font-bold uppercase text-slate-300">
                    6 Acoustic Engines (Gemini 3.8)
                  </span>
                  <span className="text-[10px] font-mono text-emerald-400 font-semibold">Active</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {ROSTER_VOICES.map((v) => (
                    <div
                      key={v.id}
                      onClick={() => {
                        setDraftBaseVoice(v.id);
                        setShowVoiceSidebar(false);
                        setActiveTab("designer");
                      }}
                      className={`p-2.5 rounded-lg border bg-gradient-to-br cursor-pointer transition-all hover:scale-[1.02] flex flex-col gap-1 ${v.color} ${
                        draftBaseVoice === v.id ? "ring-2 ring-indigo-400" : ""
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-xs text-white">{v.id}</span>
                        <span className="text-[10px] font-mono opacity-80">{v.gender}</span>
                      </div>
                      <span className="text-[10px] font-medium opacity-90 truncate">{v.tone}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* API Key Settings */}
              <div className="flex flex-col gap-2 pt-3 border-t border-slate-800 mt-auto">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono uppercase tracking-wider font-bold text-slate-300 flex items-center gap-1.5">
                    <Key className="h-3.5 w-3.5 text-indigo-400" /> API Settings
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowApiKey(!showApiKey)}
                    className="text-[11px] text-indigo-400 hover:text-indigo-300 flex items-center gap-1 cursor-pointer"
                  >
                    {showApiKey ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                    {showApiKey ? "Hide" : "Show"}
                  </button>
                </div>
                <input
                  type={showApiKey ? "text" : "password"}
                  value={googleApiKey}
                  onChange={(e) => handleApiKeyChange(e.target.value)}
                  placeholder="Server key active (optional custom key)"
                  className="bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono"
                />
              </div>

            </aside>
          </div>
        )}

      </main>

      {/* FOOTER */}
      <footer className="mt-auto border-t border-slate-800/80 bg-slate-950 p-4 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto w-full flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5 px-4">
          <p>Powered natively by Google Gemini 3.8 Flash TTS. RIFF WAV 24,000Hz Output.</p>
          <div className="flex items-center justify-center gap-3 font-mono text-[10px]">
            <span className="text-emerald-400 flex items-center gap-1 font-medium">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-ping" />
              gemini-3.8-flash-tts
            </span>
            <span>•</span>
            <span>gemini-3.8-flash</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
