import React, { useState, useEffect, useRef } from "react";
import {
  BookOpen,
  Sparkles,
  Volume2,
  Play,
  Pause,
  RefreshCw,
  Download,
  FolderDown,
  CheckCircle2,
  Trash2,
  Plus,
  Users,
  Sliders,
  Check,
  Edit3,
  FileText,
  Upload,
  AlertCircle,
  Clock,
  Layers,
  ChevronRight,
  ChevronDown,
  Wand2,
  ListOrdered,
  ShieldCheck,
  Headphones,
  Disc
} from "lucide-react";
import JSZip from "jszip";
import {
  AudiobookProject,
  AudiobookChapter,
  AudiobookChunk,
  AudiobookCharacter,
  VoiceModel
} from "../types";
import { ROSTER_VOICES, VOCAL_BURSTS, ACCENT_PRESETS } from "../App";
import { ACXMasteringPanel } from "./ACXMasteringPanel";
import { M4BCreatorPanel } from "./M4BCreatorPanel";

interface AudiobookStudioProps {
  voiceModels: VoiceModel[];
  googleApiKey: string;
  project?: AudiobookProject;
  onUpdateProject?: (updated: AudiobookProject) => void;
}

// Public Domain Sample Manuscript: Chapter 1 of Alice in Wonderland
const SAMPLE_MANUSCRIPT = `Chapter 1: Down the Rabbit-Hole

Alice was beginning to get very tired of sitting by her sister on the bank, and of having nothing to do. Once or twice she had peeped into the book her sister was reading, but it had no pictures or conversations in it. "And what is the use of a book," thought Alice, "without pictures or conversations?"

So she was considering in her own mind whether the pleasure of making a daisy-chain would be worth the trouble of getting up and picking the daisies, when suddenly a White Rabbit with pink eyes ran close by her.

There was nothing so very remarkable in that; nor did Alice think it so very much out of the way to hear the Rabbit say to itself, "Oh dear! Oh dear! I shall be late!" But when the Rabbit actually took a watch out of its waistcoat-pocket, and looked at it, and then hurried on, Alice started to her feet, for it flashed across her mind that she had never before seen a rabbit with either a waistcoat-pocket, or a watch to take out of it.

Burning with curiosity, she ran across the field after it, and fortunately was just in time to see it pop down a large rabbit-hole under the hedge.

In another moment down went Alice after it, never once considering how in the world she was to get out again.

Chapter 2: The Pool of Tears

"Curiouser and curiouser!" cried Alice; she was so much surprised, that for the moment she quite forgot how to speak good English. "Now I'm opening out like the largest telescope that ever was! Good-bye, feet!"

For when she looked down at her feet, they seemed to be almost out of sight, they were getting so far off. "Oh, my poor little feet, I wonder who will put on your shoes and stockings for you now, dears?"`;

export function AudiobookStudio({
  voiceModels,
  googleApiKey,
  project: propProject,
  onUpdateProject
}: AudiobookStudioProps) {
  // Project State
  const [project, setProject] = useState<AudiobookProject>(() => {
    if (propProject) return propProject;
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

  const [activeChapterId, setActiveChapterId] = useState<string>("");

  // Sub-views
  const [subTab, setSubTab] = useState<"import" | "director" | "acx" | "m4b" | "master" | "cast">("import");

  // Import / Ingestion State
  const [importMode, setImportMode] = useState<"book" | "single_chapter">("book");
  const [rawPastedManuscript, setRawPastedManuscript] = useState("");
  const [singleChapterTitle, setSingleChapterTitle] = useState("Chapter 1: The Beginning");
  const [singleChapterText, setSingleChapterText] = useState("");
  const [isParsingManuscript, setIsParsingManuscript] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);

  // Director's Review Deck State
  const [isChunking, setIsChunking] = useState(false);
  const [chunkingError, setChunkingError] = useState<string | null>(null);
  const [isBatchRendering, setIsBatchRendering] = useState(false);
  const [batchProgress, setBatchProgress] = useState({ current: 0, total: 0 });
  const [renderingChunkId, setRenderingChunkId] = useState<string | null>(null);

  // Player State
  const [playingChunkId, setPlayingChunkId] = useState<string | null>(null);
  const [playingProgress, setPlayingProgress] = useState(0);
  const chunkAudioRef = useRef<HTMLAudioElement | null>(null);
  const chunkIntervalRef = useRef<any>(null);

  // Master Chapter Compilation State
  const [isCompiling, setIsCompiling] = useState(false);
  const [compileError, setCompileError] = useState<string | null>(null);
  const [isPlayingMaster, setIsPlayingMaster] = useState(false);
  const [masterProgress, setMasterProgress] = useState(0);
  const masterAudioRef = useRef<HTMLAudioElement | null>(null);
  const masterIntervalRef = useRef<any>(null);

  // Active Chapter
  const activeChapter = project.chapters.find(c => c.id === activeChapterId) || project.chapters[0] || null;

  // Persist project changes
  useEffect(() => {
    localStorage.setItem("gemini_audiobook_project", JSON.stringify(project));
    if (onUpdateProject) {
      onUpdateProject(project);
    }
  }, [project]);

  // Set default active chapter if none selected
  useEffect(() => {
    if (!activeChapterId && project.chapters.length > 0) {
      setActiveChapterId(project.chapters[0].id);
    }
  }, [project.chapters, activeChapterId]);

  // --- Manuscript Ingestion: Load Sample Manuscript ---
  const handleLoadSample = () => {
    setRawPastedManuscript(SAMPLE_MANUSCRIPT);
  };

  // --- Manuscript Ingestion: Parse Full Book with AI ---
  const handleParseManuscript = async () => {
    if (!rawPastedManuscript.trim()) return;

    setIsParsingManuscript(true);
    setParseError(null);

    try {
      const response = await fetch("/api/audiobook/parse-manuscript", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          manuscriptText: rawPastedManuscript,
          googleApiKey
        })
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || "Failed to parse manuscript.");
      }

      const data = await response.json();
      if (!data.chapters || !Array.isArray(data.chapters) || data.chapters.length === 0) {
        throw new Error("No chapters detected in the manuscript.");
      }

      const newChapters: AudiobookChapter[] = data.chapters.map((ch: any, idx: number) => ({
        id: `chap_${Date.now()}_${idx + 1}`,
        title: ch.title || `Chapter ${idx + 1}`,
        chapterNumber: ch.chapterNumber || (idx + 1),
        rawManuscript: ch.content || "",
        chunks: [],
        status: "draft",
        isMultiVoice: project.narrationMode === "multi"
      }));

      setProject(prev => ({
        ...prev,
        chapters: newChapters
      }));

      setActiveChapterId(newChapters[0].id);
      setSubTab("director");
    } catch (err: any) {
      console.error(err);
      setParseError(err.message || "Failed to parse manuscript.");
    } finally {
      setIsParsingManuscript(false);
    }
  };

  // --- Manuscript Ingestion: Add Single Chapter ---
  const handleAddSingleChapter = () => {
    if (!singleChapterText.trim()) return;

    const newChapter: AudiobookChapter = {
      id: `chap_${Date.now()}`,
      title: singleChapterTitle.trim() || `Chapter ${project.chapters.length + 1}`,
      chapterNumber: project.chapters.length + 1,
      rawManuscript: singleChapterText.trim(),
      chunks: [],
      status: "draft",
      isMultiVoice: project.narrationMode === "multi"
    };

    setProject(prev => ({
      ...prev,
      chapters: [...prev.chapters, newChapter]
    }));

    setActiveChapterId(newChapter.id);
    setSingleChapterText("");
    setSubTab("director");
  };

  // --- AI Chunking & Directorial Assignment (gemini-3.8-flash) ---
  const handleChunkAndDirectChapter = async (targetChapter: AudiobookChapter) => {
    if (!targetChapter.rawManuscript.trim()) return;

    setIsChunking(true);
    setChunkingError(null);

    try {
      const response = await fetch("/api/audiobook/chunk-and-direct", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chapterTitle: targetChapter.title,
          chapterText: targetChapter.rawManuscript,
          narrationMode: project.narrationMode,
          defaultVoice: project.defaultSoloVoice,
          defaultAccent: project.defaultSoloAccent,
          defaultStyle: project.defaultSoloStyle,
          existingCharacters: project.characters,
          googleApiKey
        })
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || "Failed to chunk chapter.");
      }

      const data = await response.json();
      if (!data.chunks || !Array.isArray(data.chunks)) {
        throw new Error("No directorial chunks returned.");
      }

      const formattedChunks: AudiobookChunk[] = data.chunks.map((c: any, idx: number) => ({
        id: `chunk_${Date.now()}_${idx + 1}`,
        index: idx + 1,
        text: c.text,
        speaker: c.speaker || "Narrator",
        baseVoice: c.baseVoice || project.defaultSoloVoice,
        styleGuidance: c.styleGuidance || project.defaultSoloStyle,
        status: "pending"
      }));

      // Add newly discovered characters to project roster
      let updatedCharacters = [...project.characters];
      if (data.discoveredCharacters && Array.isArray(data.discoveredCharacters)) {
        data.discoveredCharacters.forEach((dc: any) => {
          if (!updatedCharacters.some(c => c.name.toLowerCase() === dc.name.toLowerCase())) {
            updatedCharacters.push({
              id: `char_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
              name: dc.name,
              gender: dc.gender || "Neutral",
              baseVoice: dc.baseVoice || "Kore",
              accent: dc.accent || "Standard",
              styleGuidance: dc.styleGuidance || "Natural delivery"
            });
          }
        });
      }

      setProject(prev => ({
        ...prev,
        characters: updatedCharacters,
        chapters: prev.chapters.map(ch =>
          ch.id === targetChapter.id
            ? { ...ch, chunks: formattedChunks, status: "chunked" }
            : ch
        )
      }));
    } catch (err: any) {
      console.error(err);
      setChunkingError(err.message || "Failed to chunk chapter.");
    } finally {
      setIsChunking(false);
    }
  };

  // --- Render Single Chunk Audio (gemini-3.8-flash-tts) ---
  const handleRenderSingleChunk = async (chunk: AudiobookChunk) => {
    if (!activeChapter) return;
    setRenderingChunkId(chunk.id);

    try {
      const response = await fetch("/api/audio/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: chunk.text,
          baseVoice: chunk.baseVoice,
          styleGuidance: chunk.styleGuidance,
          speed: 1.0,
          googleApiKey
        })
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || "Chunk rendering failed.");
      }

      const data = await response.json();
      if (!data.audio) throw new Error("No audio returned from Gemini.");

      const binary = atob(data.audio);
      const estDuration = Math.max(0.5, Math.round(((binary.length - 44) / 48000) * 10) / 10);

      // Update chunk state
      setProject(prev => ({
        ...prev,
        chapters: prev.chapters.map(ch =>
          ch.id === activeChapter.id
            ? {
                ...ch,
                chunks: ch.chunks.map(c =>
                  c.id === chunk.id
                    ? {
                        ...c,
                        status: "ready",
                        audioBase64: data.audio,
                        duration: estDuration,
                        error: undefined
                      }
                    : c
                )
              }
            : ch
        )
      }));
    } catch (err: any) {
      console.error(err);
      setProject(prev => ({
        ...prev,
        chapters: prev.chapters.map(ch =>
          ch.id === activeChapter.id
            ? {
                ...ch,
                chunks: ch.chunks.map(c =>
                  c.id === chunk.id ? { ...c, status: "error", error: err.message } : c
                )
              }
            : ch
        )
      }));
    } finally {
      setRenderingChunkId(null);
    }
  };

  // --- Batch Render All Pending Chunks in Active Chapter ---
  const handleBatchRenderAllChunks = async () => {
    if (!activeChapter || isBatchRendering) return;

    const pendingChunks = activeChapter.chunks.filter(c => c.status !== "approved" && c.status !== "ready");
    if (pendingChunks.length === 0) {
      alert("All chunks in this chapter are already rendered!");
      return;
    }

    setIsBatchRendering(true);
    setBatchProgress({ current: 0, total: pendingChunks.length });

    for (let i = 0; i < pendingChunks.length; i++) {
      setBatchProgress({ current: i + 1, total: pendingChunks.length });
      await handleRenderSingleChunk(pendingChunks[i]);
    }

    setIsBatchRendering(false);
  };

  // --- Toggle Chunk Approval ---
  const handleToggleChunkApproved = (chunkId: string) => {
    if (!activeChapter) return;
    setProject(prev => ({
      ...prev,
      chapters: prev.chapters.map(ch =>
        ch.id === activeChapter.id
          ? {
              ...ch,
              chunks: ch.chunks.map(c =>
                c.id === chunkId ? { ...c, status: c.status === "approved" ? "ready" : "approved" } : c
              )
            }
          : ch
      )
    }));
  };

  // --- Update Chunk In-Line Text or Directorial Style ---
  const handleUpdateChunkField = (chunkId: string, field: "text" | "styleGuidance" | "baseVoice" | "speaker", value: string) => {
    if (!activeChapter) return;
    setProject(prev => ({
      ...prev,
      chapters: prev.chapters.map(ch =>
        ch.id === activeChapter.id
          ? {
              ...ch,
              chunks: ch.chunks.map(c =>
                c.id === chunkId
                  ? {
                      ...c,
                      [field]: value,
                      // If text or style changed, reset approval status
                      status: field === "text" || field === "styleGuidance" || field === "baseVoice" ? "pending" : c.status
                    }
                  : c
              )
            }
          : ch
      )
    }));
  };

  // --- Play Individual Chunk Audio ---
  const handlePlayChunk = (chunk: AudiobookChunk) => {
    if (!chunk.audioBase64) return;

    if (playingChunkId === chunk.id && chunkAudioRef.current) {
      chunkAudioRef.current.pause();
      setPlayingChunkId(null);
      if (chunkIntervalRef.current) clearInterval(chunkIntervalRef.current);
      return;
    }

    if (chunkAudioRef.current) {
      chunkAudioRef.current.pause();
    }
    if (chunkIntervalRef.current) clearInterval(chunkIntervalRef.current);

    setPlayingChunkId(chunk.id);
    setPlayingProgress(0);

    const binary = atob(chunk.audioBase64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const blob = new Blob([bytes], { type: "audio/wav" });
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    chunkAudioRef.current = audio;

    audio.play().catch(e => console.warn(e));

    audio.onended = () => {
      setPlayingChunkId(null);
      setPlayingProgress(100);
      if (chunkIntervalRef.current) clearInterval(chunkIntervalRef.current);
    };

    chunkIntervalRef.current = setInterval(() => {
      if (audio && audio.duration) {
        setPlayingProgress(Math.min((audio.currentTime / audio.duration) * 100, 100));
      }
    }, 80);
  };

  // --- ACX & Chapter Updates Handlers ---
  const handleUpdateChapter = (updatedChapter: AudiobookChapter) => {
    setProject(prev => ({
      ...prev,
      chapters: prev.chapters.map(c => c.id === updatedChapter.id ? updatedChapter : c)
    }));
  };

  const handleUpdateChunk = (chunkId: string, updatedChunk: Partial<AudiobookChunk>) => {
    if (!activeChapter) return;
    setProject(prev => ({
      ...prev,
      chapters: prev.chapters.map(ch =>
        ch.id === activeChapter.id
          ? {
              ...ch,
              chunks: ch.chunks.map(c => c.id === chunkId ? { ...c, ...updatedChunk } : c)
            }
          : ch
      )
    }));
  };

  const handleUpdateAllChapters = (updatedChapters: AudiobookChapter[]) => {
    setProject(prev => ({
      ...prev,
      chapters: updatedChapters
    }));
  };

  // Quick 1-click master for a single chunk
  const handleQuickMasterChunk = async (chunk: AudiobookChunk) => {
    if (!chunk.audioBase64 || !activeChapter) return;

    try {
      const res = await fetch("/api/audio/acx-process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          audioBase64: chunk.rawAudioBase64 || chunk.audioBase64,
          settings: project.acxSettings
        })
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "ACX master failed");
      }

      const data = await res.json();
      handleUpdateChunk(chunk.id, {
        rawAudioBase64: chunk.rawAudioBase64 || chunk.audioBase64,
        audioBase64: data.audioBase64,
        duration: data.metrics.duration,
        acxMetrics: data.metrics,
        isAcxProcessed: true
      });
    } catch (e: any) {
      alert("Quick ACX Master failed: " + e.message);
    }
  };

  // --- Recompile Chapter Master Audio ---
  const handleCompileChapter = async () => {
    if (!activeChapter) return;

    const readyChunks = activeChapter.chunks.filter(c => c.audioBase64);
    if (readyChunks.length === 0) {
      alert("No audio has been rendered for this chapter yet. Please render chunks first.");
      return;
    }

    setIsCompiling(true);
    setCompileError(null);

    try {
      const chunksAudio = readyChunks.map(c => c.audioBase64 as string);
      const response = await fetch("/api/audiobook/compile-chapter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chunksAudio,
          pauseMs: project.pauseBetweenChunksMs
        })
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || "Compilation failed.");
      }

      const data = await response.json();
      if (!data.compiledAudio) throw new Error("No compiled audio returned.");

      setProject(prev => ({
        ...prev,
        chapters: prev.chapters.map(ch =>
          ch.id === activeChapter.id
            ? {
                ...ch,
                compiledAudioBase64: data.compiledAudio,
                compiledDuration: data.totalDuration,
                status: "compiled"
              }
            : ch
        )
      }));

      setSubTab("master");
    } catch (err: any) {
      console.error(err);
      setCompileError(err.message || "Failed to compile chapter.");
    } finally {
      setIsCompiling(false);
    }
  };

  // --- Master Chapter Playback ---
  const handleTogglePlayMaster = () => {
    if (!activeChapter?.compiledAudioBase64) return;

    if (isPlayingMaster && masterAudioRef.current) {
      masterAudioRef.current.pause();
      setIsPlayingMaster(false);
      if (masterIntervalRef.current) clearInterval(masterIntervalRef.current);
      return;
    }

    if (masterAudioRef.current) {
      masterAudioRef.current.pause();
    }
    if (masterIntervalRef.current) clearInterval(masterIntervalRef.current);

    const binary = atob(activeChapter.compiledAudioBase64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const blob = new Blob([bytes], { type: "audio/wav" });
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    masterAudioRef.current = audio;

    audio.play().catch(e => console.warn(e));
    setIsPlayingMaster(true);

    audio.onended = () => {
      setIsPlayingMaster(false);
      setMasterProgress(100);
      if (masterIntervalRef.current) clearInterval(masterIntervalRef.current);
    };

    masterIntervalRef.current = setInterval(() => {
      if (audio && audio.duration) {
        setMasterProgress(Math.min((audio.currentTime / audio.duration) * 100, 100));
      }
    }, 100);
  };

  // --- Download Master Chapter WAV ---
  const handleDownloadMasterWav = () => {
    if (!activeChapter?.compiledAudioBase64) return;
    const binary = atob(activeChapter.compiledAudioBase64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const blob = new Blob([bytes], { type: "audio/wav" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${activeChapter.title.toLowerCase().replace(/[^a-z0-9]+/g, "_")}_master.wav`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // --- Export Full Audiobook Package (ZIP) ---
  const handleExportFullAudiobookZip = async () => {
    const zip = new JSZip();
    const masterFolder = zip.folder("master_chapters");

    let totalMasterSeconds = 0;

    project.chapters.forEach((ch, idx) => {
      if (ch.compiledAudioBase64) {
        const filename = `chapter_${idx + 1}_${ch.title.toLowerCase().replace(/[^a-z0-9]+/g, "_")}.wav`;
        const binary = atob(ch.compiledAudioBase64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        masterFolder?.file(filename, bytes);
        totalMasterSeconds += ch.compiledDuration || 0;
      }
    });

    const manifest = {
      title: project.title,
      author: project.author,
      narrationMode: project.narrationMode,
      totalDurationSeconds: totalMasterSeconds,
      engine: "Gemini 3.8 Flash TTS",
      sampleRate: "24,000Hz (16-bit mono RIFF WAV)",
      chapters: project.chapters.map(ch => ({
        title: ch.title,
        chapterNumber: ch.chapterNumber,
        durationSeconds: ch.compiledDuration || 0,
        chunksCount: ch.chunks.length
      })),
      characters: project.characters
    };

    zip.file("audiobook_manifest.json", JSON.stringify(manifest, null, 2));

    const readme = `# ${project.title} by ${project.author}
Audiobook Master Package
Compiled with native Google Gemini 3.8 Flash TTS.
- Chapters Count: ${project.chapters.length}
- Total Duration: ${Math.floor(totalMasterSeconds / 60)} min ${Math.round(totalMasterSeconds % 60)} sec
- Audio Specification: 24,000Hz Mono 16-bit LE RIFF WAV
`;
    zip.file("README.md", readme);

    const blob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${project.title.toLowerCase().replace(/[^a-z0-9]+/g, "_")}_audiobook_package.zip`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Helper to insert speech tags into chunk
  const handleInsertChunkTag = (chunkId: string, tag: string) => {
    if (!activeChapter) return;
    const chunk = activeChapter.chunks.find(c => c.id === chunkId);
    if (!chunk) return;
    handleUpdateChunkField(chunkId, "text", `${chunk.text} ${tag} `);
  };

  return (
    <div className="flex flex-col gap-6 flex-1 text-slate-100">
      
      {/* AUDIOBOOK HEADER & MODE CONFIG */}
      <div className="bg-slate-950/70 p-4 rounded-xl border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-gradient-to-br from-indigo-600 to-purple-600 rounded-xl text-white shadow-lg shadow-indigo-600/20">
            <BookOpen className="h-6 w-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={project.title}
                onChange={(e) => setProject(prev => ({ ...prev, title: e.target.value }))}
                className="text-base md:text-lg font-bold bg-transparent border-b border-dashed border-slate-700 hover:border-indigo-400 focus:border-indigo-500 focus:outline-none text-white"
                placeholder="Audiobook Title"
              />
              <span className="text-[10px] font-mono uppercase bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 px-2 py-0.5 rounded">
                Master Studio
              </span>
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-400 mt-1">
              <span>by</span>
              <input
                type="text"
                value={project.author}
                onChange={(e) => setProject(prev => ({ ...prev, author: e.target.value }))}
                className="bg-transparent border-b border-dashed border-slate-800 hover:border-slate-600 focus:border-indigo-500 focus:outline-none text-slate-300 text-xs"
                placeholder="Author Name"
              />
              <span>•</span>
              <span className="text-indigo-400 font-semibold">{project.chapters.length} Chapters</span>
            </div>
          </div>
        </div>

        {/* Global Narration Mode Selector & Batch Export */}
        <div className="flex flex-wrap items-center gap-3 self-start md:self-auto">
          <div className="flex items-center gap-1 bg-slate-900 border border-slate-800 p-1 rounded-lg">
            <button
              onClick={() => setProject(prev => ({ ...prev, narrationMode: "solo" }))}
              className={`text-xs font-semibold px-3 py-1.5 rounded transition-all cursor-pointer ${
                project.narrationMode === "solo"
                  ? "bg-indigo-600 text-white shadow"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <Volume2 className="h-3 w-3 inline mr-1" /> Solo Narrator
            </button>
            <button
              onClick={() => setProject(prev => ({ ...prev, narrationMode: "multi" }))}
              className={`text-xs font-semibold px-3 py-1.5 rounded transition-all cursor-pointer ${
                project.narrationMode === "multi"
                  ? "bg-purple-600 text-white shadow"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <Users className="h-3 w-3 inline mr-1 text-purple-300" /> Full-Cast Multi-Voice
            </button>
          </div>

          {project.chapters.some(c => c.compiledAudioBase64) && (
            <button
              onClick={handleExportFullAudiobookZip}
              className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs py-2 px-3.5 rounded-lg flex items-center gap-1.5 shadow-md shadow-emerald-600/20 cursor-pointer"
            >
              <FolderDown className="h-4 w-4" /> Export Book Package (ZIP)
            </button>
          )}
        </div>
      </div>

      {/* SUB-TABS NAVIGATION */}
      <div className="flex border-b border-slate-800 bg-slate-950/40 p-1 rounded-lg overflow-x-auto">
        <button
          onClick={() => setSubTab("import")}
          className={`flex-1 min-w-[120px] py-2.5 text-center text-xs font-bold transition-all flex items-center justify-center gap-1.5 rounded-md cursor-pointer ${
            subTab === "import" ? "bg-indigo-600 text-white shadow" : "text-slate-400 hover:text-slate-200"
          }`}
        >
          <Upload className="h-3.5 w-3.5" /> 1. Ingestion
        </button>
        <button
          onClick={() => setSubTab("director")}
          className={`flex-1 min-w-[140px] py-2.5 text-center text-xs font-bold transition-all flex items-center justify-center gap-1.5 rounded-md cursor-pointer ${
            subTab === "director" ? "bg-indigo-600 text-white shadow" : "text-slate-400 hover:text-slate-200"
          }`}
        >
          <Sliders className="h-3.5 w-3.5" /> 2. Review Deck
        </button>
        {project.narrationMode === "multi" && (
          <button
            onClick={() => setSubTab("cast")}
            className={`flex-1 min-w-[130px] py-2.5 text-center text-xs font-bold transition-all flex items-center justify-center gap-1.5 rounded-md cursor-pointer ${
              subTab === "cast" ? "bg-purple-600 text-white shadow" : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Users className="h-3.5 w-3.5" /> 3. Cast ({project.characters.length})
          </button>
        )}
        <button
          onClick={() => setSubTab("acx")}
          className={`flex-1 min-w-[160px] py-2.5 text-center text-xs font-bold transition-all flex items-center justify-center gap-1.5 rounded-md cursor-pointer ${
            subTab === "acx" ? "bg-emerald-600 text-white shadow" : "text-slate-400 hover:text-slate-200"
          }`}
        >
          <ShieldCheck className="h-3.5 w-3.5 text-emerald-300" /> 4. ACX Mastering
        </button>
        <button
          onClick={() => setSubTab("m4b")}
          className={`flex-1 min-w-[160px] py-2.5 text-center text-xs font-bold transition-all flex items-center justify-center gap-1.5 rounded-md cursor-pointer ${
            subTab === "m4b" ? "bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow" : "text-slate-400 hover:text-slate-200"
          }`}
        >
          <Headphones className="h-3.5 w-3.5 text-pink-300" /> 5. Pro M4B Creator
        </button>
        <button
          onClick={() => setSubTab("master")}
          className={`flex-1 min-w-[130px] py-2.5 text-center text-xs font-bold transition-all flex items-center justify-center gap-1.5 rounded-md cursor-pointer ${
            subTab === "master" ? "bg-slate-800 text-white shadow" : "text-slate-400 hover:text-slate-200"
          }`}
        >
          <FileText className="h-3.5 w-3.5" /> 6. Chapter WAV
        </button>
      </div>

      {/* SUB-VIEW 1: MANUSCRIPT INGESTION */}
      {subTab === "import" && (
        <div className="flex flex-col gap-5 bg-slate-950/40 p-5 rounded-xl border border-slate-800">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
            <div>
              <h3 className="text-sm font-bold uppercase tracking-wider text-indigo-400 font-mono flex items-center gap-2">
                <Upload className="h-4 w-4" /> Manuscript Ingestion
              </h3>
              <p className="text-xs text-slate-400">
                Upload a complete book manuscript to automatically slice chapters, or enter individual chapters one-by-one.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleLoadSample}
                className="text-xs font-semibold text-amber-400 hover:text-amber-300 bg-amber-500/10 border border-amber-500/20 px-3 py-1.5 rounded-lg flex items-center gap-1 cursor-pointer"
              >
                <Sparkles className="h-3.5 w-3.5" /> Load Sample Manuscript (Alice in Wonderland)
              </button>
            </div>
          </div>

          {/* Mode Switch: Full Manuscript vs Single Chapter */}
          <div className="flex gap-2">
            <button
              onClick={() => setImportMode("book")}
              className={`text-xs font-semibold px-4 py-2 rounded-lg border transition-all cursor-pointer ${
                importMode === "book" ? "bg-indigo-600/30 border-indigo-500 text-white" : "bg-slate-900 border-slate-800 text-slate-400"
              }`}
            >
              Parse Entire Manuscript (Auto-detect Chapters)
            </button>
            <button
              onClick={() => setImportMode("single_chapter")}
              className={`text-xs font-semibold px-4 py-2 rounded-lg border transition-all cursor-pointer ${
                importMode === "single_chapter" ? "bg-indigo-600/30 border-indigo-500 text-white" : "bg-slate-900 border-slate-800 text-slate-400"
              }`}
            >
              Add Single Chapter Manually
            </button>
          </div>

          {/* Mode A: Full Manuscript Auto-Chunker */}
          {importMode === "book" ? (
            <div className="flex flex-col gap-3">
              <label className="text-xs font-mono uppercase tracking-wider font-bold text-slate-300">
                Manuscript Prose (.txt or markdown)
              </label>
              <textarea
                value={rawPastedManuscript}
                onChange={(e) => setRawPastedManuscript(e.target.value)}
                placeholder="Paste complete manuscript here (e.g. Chapter 1: ..., Chapter 2: ...)..."
                rows={10}
                className="w-full bg-slate-900 border border-slate-800 rounded-lg p-3 text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-indigo-500 leading-relaxed font-mono"
              />

              <div className="flex items-center justify-between">
                <span className="text-[11px] text-slate-400 font-mono">
                  {rawPastedManuscript.length} characters • Gemini 3.8 will detect all chapter headings &amp; prose boundaries
                </span>
                <button
                  onClick={handleParseManuscript}
                  disabled={isParsingManuscript || !rawPastedManuscript.trim()}
                  className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold text-xs py-2.5 px-5 rounded-lg flex items-center gap-2 cursor-pointer shadow-lg shadow-indigo-600/20"
                >
                  {isParsingManuscript ? (
                    <>
                      <RefreshCw className="h-3.5 w-3.5 animate-spin" /> Parsing Chapters...
                    </>
                  ) : (
                    <>
                      <Wand2 className="h-3.5 w-3.5" /> Parse Chapters &amp; Start Production
                    </>
                  )}
                </button>
              </div>

              {parseError && (
                <div className="p-3 rounded-lg bg-rose-950/30 border border-rose-900/50 text-rose-300 text-xs flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
                  <span>{parseError}</span>
                </div>
              )}
            </div>
          ) : (
            /* Mode B: Add Single Chapter */
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-mono uppercase tracking-wider font-bold text-slate-300">Chapter Title</label>
                <input
                  type="text"
                  value={singleChapterTitle}
                  onChange={(e) => setSingleChapterTitle(e.target.value)}
                  placeholder="e.g. Chapter 3: The Secret Vault"
                  className="bg-slate-900 border border-slate-800 rounded px-3 py-2 text-xs text-slate-100"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-mono uppercase tracking-wider font-bold text-slate-300">Chapter Prose Text</label>
                <textarea
                  value={singleChapterText}
                  onChange={(e) => setSingleChapterText(e.target.value)}
                  placeholder="Paste the chapter text here..."
                  rows={8}
                  className="bg-slate-900 border border-slate-800 rounded-lg p-3 text-xs text-slate-100 font-mono"
                />
              </div>

              <button
                onClick={handleAddSingleChapter}
                disabled={!singleChapterText.trim()}
                className="self-end bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold text-xs py-2 px-4 rounded-lg flex items-center gap-1.5 cursor-pointer"
              >
                <Plus className="h-3.5 w-3.5" /> Add Chapter to Project
              </button>
            </div>
          )}

          {/* Existing Project Chapters Overview */}
          {project.chapters.length > 0 && (
            <div className="flex flex-col gap-2 pt-4 border-t border-slate-800">
              <span className="text-xs font-mono uppercase tracking-wider font-bold text-slate-400">
                Loaded Project Chapters ({project.chapters.length}):
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                {project.chapters.map((ch) => (
                  <div
                    key={ch.id}
                    onClick={() => {
                      setActiveChapterId(ch.id);
                      setSubTab("director");
                    }}
                    className={`p-3 rounded-lg border text-left cursor-pointer transition-all ${
                      activeChapterId === ch.id
                        ? "bg-indigo-950/40 border-indigo-500/80"
                        : "bg-slate-900/80 border-slate-800 hover:bg-slate-900"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-200 truncate">{ch.title}</span>
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-950 text-slate-400">
                        {ch.chunks.length} chunks
                      </span>
                    </div>
                    <span className="text-[11px] text-slate-500 mt-1 block">
                      Status: <strong className="text-indigo-400 capitalize">{ch.status}</strong>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* SUB-VIEW 2: DIRECTOR'S REVIEW DECK */}
      {subTab === "director" && (
        <div className="flex flex-col gap-5">
          {activeChapter ? (
            <>
              {/* Chapter Header & Action Bar */}
              <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono font-bold uppercase text-indigo-400">Active Chapter:</span>
                    <select
                      value={activeChapterId}
                      onChange={(e) => setActiveChapterId(e.target.value)}
                      className="bg-slate-900 border border-slate-700 text-xs text-slate-100 rounded px-2.5 py-1.5 font-bold"
                    >
                      {project.chapters.map((ch) => (
                        <option key={ch.id} value={ch.id}>
                          {ch.title} ({ch.chunks.length} chunks)
                        </option>
                      ))}
                    </select>
                  </div>
                  <p className="text-xs text-slate-400 mt-1">
                    {activeChapter.chunks.length === 0
                      ? "Chapter is in draft state. Click 'AI Segment & Direct Chapter' to generate production lines."
                      : `${activeChapter.chunks.filter(c => c.status === "approved" || c.status === "ready").length} of ${activeChapter.chunks.length} chunks ready for compilation.`}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {activeChapter.chunks.length === 0 ? (
                    <button
                      onClick={() => handleChunkAndDirectChapter(activeChapter)}
                      disabled={isChunking}
                      className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold text-xs py-2.5 px-4 rounded-lg flex items-center gap-2 shadow-lg shadow-indigo-600/20 cursor-pointer"
                    >
                      {isChunking ? (
                        <>
                          <RefreshCw className="h-4 w-4 animate-spin" /> Slicing &amp; Directing...
                        </>
                      ) : (
                        <>
                          <Wand2 className="h-4 w-4" /> AI Segment &amp; Direct Chapter
                        </>
                      )}
                    </button>
                  ) : (
                    <>
                      <button
                        onClick={handleBatchRenderAllChunks}
                        disabled={isBatchRendering}
                        className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold text-xs py-2 px-3.5 rounded-lg flex items-center gap-1.5 shadow-md shadow-indigo-600/20 cursor-pointer"
                      >
                        {isBatchRendering ? (
                          <>
                            <RefreshCw className="h-3.5 w-3.5 animate-spin" /> Rendering {batchProgress.current}/{batchProgress.total}...
                          </>
                        ) : (
                          <>
                            <Volume2 className="h-3.5 w-3.5" /> Synthesize All Chunks
                          </>
                        )}
                      </button>

                      <button
                        onClick={handleCompileChapter}
                        disabled={isCompiling || activeChapter.chunks.every(c => !c.audioBase64)}
                        className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold text-xs py-2 px-3.5 rounded-lg flex items-center gap-1.5 shadow-md shadow-emerald-600/20 cursor-pointer"
                      >
                        {isCompiling ? (
                          <>
                            <RefreshCw className="h-3.5 w-3.5 animate-spin" /> Compiling...
                          </>
                        ) : (
                          <>
                            <CheckCircle2 className="h-3.5 w-3.5" /> Compile Chapter Master WAV
                          </>
                        )}
                      </button>
                    </>
                  )}
                </div>
              </div>

              {chunkingError && (
                <div className="p-3 rounded-lg bg-rose-950/30 border border-rose-900/50 text-rose-300 text-xs flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
                  <span>{chunkingError}</span>
                </div>
              )}

              {/* Chunks List (Listening Room / Review Desk) */}
              {activeChapter.chunks.length > 0 && (
                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-between text-xs font-mono text-slate-400">
                    <span>PRODUCTION CHUNKS ({activeChapter.chunks.length})</span>
                    <span>Click on any line to edit script text or acting guidance</span>
                  </div>

                  <div className="flex flex-col gap-3 max-h-[560px] overflow-y-auto pr-1">
                    {activeChapter.chunks.map((chunk) => {
                      const isPlaying = playingChunkId === chunk.id;
                      const isRendering = renderingChunkId === chunk.id;
                      const isApproved = chunk.status === "approved";

                      return (
                        <div
                          key={chunk.id}
                          className={`p-4 rounded-xl border transition-all flex flex-col gap-3 ${
                            isApproved
                              ? "bg-slate-950/80 border-emerald-500/50 shadow-sm"
                              : chunk.status === "ready"
                              ? "bg-slate-950/60 border-indigo-500/40"
                              : "bg-slate-950/40 border-slate-800"
                          }`}
                        >
                          {/* Chunk Top Meta: Speaker, Voice, Acting Style & Approval */}
                          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/60 pb-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-[10px] font-mono font-bold px-2 py-0.5 bg-slate-900 border border-slate-800 rounded text-slate-400">
                                #{chunk.index}
                              </span>

                              {/* Speaker Name */}
                              <input
                                type="text"
                                value={chunk.speaker}
                                onChange={(e) => handleUpdateChunkField(chunk.id, "speaker", e.target.value)}
                                className="bg-slate-900 border border-slate-800 rounded px-2 py-0.5 text-xs text-indigo-300 font-bold focus:outline-none w-28"
                                placeholder="Speaker"
                              />

                              {/* Base Voice Selector */}
                              <select
                                value={chunk.baseVoice}
                                onChange={(e) => handleUpdateChunkField(chunk.id, "baseVoice", e.target.value)}
                                className="bg-slate-900 border border-slate-800 rounded px-2 py-0.5 text-xs text-slate-200 font-medium focus:outline-none"
                              >
                                {ROSTER_VOICES.map((v) => (
                                  <option key={v.id} value={v.id}>{v.id} ({v.tone})</option>
                                ))}
                              </select>

                              {chunk.duration && (
                                <span className="text-[10px] font-mono text-slate-500">
                                  {chunk.duration.toFixed(1)}s
                                </span>
                              )}
                            </div>

                            {/* Approval Toggle */}
                            <div className="flex items-center gap-2">
                              {chunk.audioBase64 && (
                                <button
                                  type="button"
                                  onClick={() => handleToggleChunkApproved(chunk.id)}
                                  className={`text-xs font-semibold px-2.5 py-1 rounded flex items-center gap-1 transition-colors cursor-pointer ${
                                    isApproved
                                      ? "bg-emerald-600 text-white"
                                      : "bg-slate-900 hover:bg-slate-800 text-slate-400 border border-slate-800"
                                  }`}
                                >
                                  <Check className="h-3 w-3" /> {isApproved ? "Approved" : "Mark Approved"}
                                </button>
                              )}

                              <button
                                type="button"
                                onClick={() => handleRenderSingleChunk(chunk)}
                                disabled={isRendering}
                                className="text-xs font-semibold px-2.5 py-1 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded flex items-center gap-1 transition-colors cursor-pointer"
                              >
                                {isRendering ? (
                                  <RefreshCw className="h-3 w-3 animate-spin" />
                                ) : (
                                  <Volume2 className="h-3 w-3" />
                                )}
                                {chunk.audioBase64 ? "Re-render" : "Synthesize"}
                              </button>
                            </div>
                          </div>

                          {/* Script Text (Inline Editable) */}
                          <div className="flex flex-col gap-1.5">
                            <textarea
                              value={chunk.text}
                              onChange={(e) => handleUpdateChunkField(chunk.id, "text", e.target.value)}
                              rows={2}
                              className="w-full bg-slate-900/90 border border-slate-800 rounded-lg p-2.5 text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-sans leading-relaxed"
                            />

                            {/* Vocal Burst Insertion helper */}
                            <div className="flex flex-wrap items-center gap-1">
                              <span className="text-[9px] font-mono text-slate-500">Insert tag:</span>
                              {VOCAL_BURSTS.slice(0, 5).map(b => (
                                <button
                                  key={b.tag}
                                  type="button"
                                  onClick={() => handleInsertChunkTag(chunk.id, b.tag)}
                                  className="text-[9px] font-mono bg-slate-900 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/20 px-1.5 py-0.5 rounded cursor-pointer"
                                >
                                  {b.tag}
                                </button>
                              ))}
                            </div>
                          </div>

                          {/* Directorial Acting Guidance (Inline Editable) */}
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-mono font-bold text-slate-400 shrink-0 uppercase tracking-wider">
                              Acting Style:
                            </span>
                            <input
                              type="text"
                              value={chunk.styleGuidance}
                              onChange={(e) => handleUpdateChunkField(chunk.id, "styleGuidance", e.target.value)}
                              placeholder="Directorial acting style for speechMetadata.style..."
                              className="flex-1 bg-slate-900 border border-slate-800 rounded px-2 py-1 text-[11px] text-slate-300 focus:outline-none focus:ring-1 focus:ring-indigo-500 italic"
                            />
                          </div>

                          {/* Playback Wavebar if audio is ready */}
                          {chunk.audioBase64 && (
                            <div className="flex flex-wrap items-center gap-3 bg-slate-900/60 px-3 py-2 rounded-lg border border-slate-800">
                              <button
                                type="button"
                                onClick={() => handlePlayChunk(chunk)}
                                className="p-1.5 rounded-full bg-indigo-600 text-white hover:bg-indigo-500 transition-colors cursor-pointer shrink-0"
                              >
                                {isPlaying ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3 fill-current ml-0.5" />}
                              </button>
                              <div className="flex-1 min-w-[120px] h-1.5 bg-slate-800 rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-indigo-400 transition-all duration-100"
                                  style={{ width: `${isPlaying ? playingProgress : 100}%` }}
                                />
                              </div>

                              <div className="flex items-center gap-2">
                                {chunk.isAcxProcessed ? (
                                  <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded flex items-center gap-1">
                                    <ShieldCheck className="h-3 w-3 text-emerald-400" /> ACX Pass
                                  </span>
                                ) : (
                                  <span className="text-[10px] font-mono text-slate-400">Ready</span>
                                )}

                                <button
                                  type="button"
                                  onClick={() => handleQuickMasterChunk(chunk)}
                                  className="text-[10px] bg-slate-900 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/20 px-2 py-0.5 rounded flex items-center gap-1 cursor-pointer transition-colors"
                                  title="Apply 80Hz rumble cut, 3-band EQ, compression, and ACX loudness"
                                >
                                  <ShieldCheck className="h-3 w-3 text-emerald-400" />
                                  {chunk.isAcxProcessed ? "Re-Master ACX" : "⚡ Master ACX"}
                                </button>
                              </div>
                            </div>
                          )}

                          {chunk.error && (
                            <div className="text-rose-400 text-[10px] flex items-center gap-1">
                              <AlertCircle className="h-3 w-3" /> {chunk.error}
                            </div>
                          )}

                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="p-8 text-center text-slate-400 border border-dashed border-slate-800 rounded-xl">
              No chapters in this project yet. Go to **Manuscript Ingestion** to add chapters.
            </div>
          )}
        </div>
      )}

      {/* SUB-VIEW 3: CHARACTER CAST MANAGER */}
      {subTab === "cast" && project.narrationMode === "multi" && (
        <div className="flex flex-col gap-5 bg-slate-950/40 p-5 rounded-xl border border-slate-800">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div>
              <h3 className="text-sm font-bold uppercase tracking-wider text-purple-400 font-mono flex items-center gap-2">
                <Users className="h-4 w-4" /> Character Cast Roster ({project.characters.length})
              </h3>
              <p className="text-xs text-slate-400">
                Manage the actors for your audiobook. Assign each character their physical base voice, regional accent, and default acting disposition.
              </p>
            </div>
            <button
              onClick={() => {
                const newChar: AudiobookCharacter = {
                  id: `char_${Date.now()}`,
                  name: `New Character ${project.characters.length + 1}`,
                  gender: "Neutral",
                  baseVoice: "Kore",
                  accent: "British (Received Pronunciation)",
                  styleGuidance: "Natural, articulate delivery"
                };
                setProject(prev => ({ ...prev, characters: [...prev.characters, newChar] }));
              }}
              className="bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs py-2 px-3.5 rounded-lg flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="h-3.5 w-3.5" /> Add Character
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {project.characters.map((char) => (
              <div key={char.id} className="p-4 bg-slate-900/90 rounded-xl border border-slate-800 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <input
                    type="text"
                    value={char.name}
                    onChange={(e) => {
                      const val = e.target.value;
                      setProject(prev => ({
                        ...prev,
                        characters: prev.characters.map(c => c.id === char.id ? { ...c, name: val } : c)
                      }));
                    }}
                    className="font-bold text-sm text-purple-300 bg-transparent border-b border-slate-800 focus:outline-none focus:border-purple-400"
                  />
                  {project.characters.length > 1 && (
                    <button
                      onClick={() => setProject(prev => ({ ...prev, characters: prev.characters.filter(c => c.id !== char.id) }))}
                      className="text-slate-500 hover:text-rose-400 p-1 rounded"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-mono text-slate-400 uppercase">Base Voice</label>
                    <select
                      value={char.baseVoice}
                      onChange={(e) => {
                        const val = e.target.value;
                        setProject(prev => ({
                          ...prev,
                          characters: prev.characters.map(c => c.id === char.id ? { ...c, baseVoice: val } : c)
                        }));
                      }}
                      className="bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs text-slate-200"
                    >
                      {ROSTER_VOICES.map(v => (
                        <option key={v.id} value={v.id}>{v.id} ({v.tone})</option>
                      ))}
                    </select>
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-mono text-slate-400 uppercase">Accent / Dialect</label>
                    <input
                      type="text"
                      value={char.accent}
                      onChange={(e) => {
                        const val = e.target.value;
                        setProject(prev => ({
                          ...prev,
                          characters: prev.characters.map(c => c.id === char.id ? { ...c, accent: val } : c)
                        }));
                      }}
                      placeholder="e.g. Scottish, Cockney"
                      className="bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs text-slate-200"
                    />
                  </div>
                </div>

                <div className="flex flex-col gap-1 text-xs">
                  <label className="text-[10px] font-mono text-slate-400 uppercase">Default Acting Guidance</label>
                  <input
                    type="text"
                    value={char.styleGuidance}
                    onChange={(e) => {
                      const val = e.target.value;
                      setProject(prev => ({
                        ...prev,
                        characters: prev.characters.map(c => c.id === char.id ? { ...c, styleGuidance: val } : c)
                      }));
                    }}
                    placeholder="e.g. Fast, frantic mutterings with high energy"
                    className="bg-slate-950 border border-slate-800 rounded px-2.5 py-1 text-xs text-slate-200"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* SUB-VIEW 4: MASTER CHAPTER RECOMPILER */}
      {subTab === "master" && (
        <div className="flex flex-col gap-5 bg-slate-950/40 p-5 rounded-xl border border-slate-800">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
            <div>
              <h3 className="text-sm font-bold uppercase tracking-wider text-emerald-400 font-mono flex items-center gap-2">
                <FileText className="h-4 w-4" /> Master Chapter Recompiler
              </h3>
              <p className="text-xs text-slate-400">
                Stitches all approved audio chunks into a continuous 24,000Hz master audio file with configurable breath and sentence pauses.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-lg text-xs font-mono">
                <span className="text-slate-400">Inter-chunk Pause:</span>
                <input
                  type="number"
                  min={100}
                  max={1500}
                  step={50}
                  value={project.pauseBetweenChunksMs}
                  onChange={(e) => setProject(prev => ({ ...prev, pauseBetweenChunksMs: parseInt(e.target.value) || 400 }))}
                  className="w-16 bg-slate-950 border border-slate-800 text-indigo-400 rounded px-1.5 py-0.5 text-center font-bold"
                />
                <span className="text-slate-500">ms</span>
              </div>

              <button
                onClick={handleCompileChapter}
                disabled={isCompiling || !activeChapter || activeChapter.chunks.every(c => !c.audioBase64)}
                className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold text-xs py-2 px-4 rounded-lg flex items-center gap-1.5 shadow-md shadow-emerald-600/20 cursor-pointer"
              >
                {isCompiling ? (
                  <>
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" /> Compiling Master...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-3.5 w-3.5" /> Recompile Master WAV
                  </>
                )}
              </button>
            </div>
          </div>

          {compileError && (
            <div className="p-3 rounded-lg bg-rose-950/30 border border-rose-900/50 text-rose-300 text-xs flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
              <span>{compileError}</span>
            </div>
          )}

          {activeChapter?.compiledAudioBase64 ? (
            <div className="p-5 bg-gradient-to-br from-emerald-950/30 to-slate-900/80 border border-emerald-500/30 rounded-xl flex flex-col gap-4 shadow-xl">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                  <div>
                    <h4 className="text-sm font-bold text-white">{activeChapter.title} — Master Audio</h4>
                    <span className="text-xs text-slate-400 font-mono">
                      Total Duration: {Math.floor((activeChapter.compiledDuration || 0) / 60)}m {Math.round((activeChapter.compiledDuration || 0) % 60)}s • 24,000Hz 16-bit Mono WAV
                    </span>
                  </div>
                </div>

                <button
                  onClick={handleDownloadMasterWav}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs py-2 px-4 rounded-lg flex items-center gap-1.5 shadow-lg shadow-emerald-600/20 cursor-pointer"
                >
                  <Download className="h-3.5 w-3.5" /> Download Chapter Master WAV
                </button>
              </div>

              {/* Master Player Controls */}
              <div className="flex items-center gap-4 bg-slate-950/80 p-3 rounded-lg border border-slate-800">
                <button
                  type="button"
                  onClick={handleTogglePlayMaster}
                  className="p-3 rounded-full bg-emerald-600 text-white hover:bg-emerald-500 transition-colors cursor-pointer shrink-0"
                >
                  {isPlayingMaster ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 fill-current ml-0.5" />}
                </button>

                <div className="flex-1 flex flex-col gap-1">
                  <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-emerald-400 transition-all duration-100"
                      style={{ width: `${masterProgress}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-[10px] font-mono text-slate-500">
                    <span>{isPlayingMaster ? "Playing master..." : "Ready to play"}</span>
                    <span>{Math.round(masterProgress)}%</span>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="p-8 text-center text-slate-400 border border-dashed border-slate-800 rounded-xl">
              No master audio compiled for this chapter yet. Go to **Director's Review Deck**, render the chunks, and click **Compile Chapter Master WAV**.
            </div>
          )}
        </div>
      )}

      {/* SUB-VIEW: ACX AUDIO MASTERING & COMPLIANCE */}
      {subTab === "acx" && (
        <ACXMasteringPanel
          project={project}
          activeChapter={activeChapter}
          onUpdateChapter={handleUpdateChapter}
          onUpdateChunk={handleUpdateChunk}
          onUpdateAllChapters={handleUpdateAllChapters}
        />
      )}

      {/* SUB-VIEW: PRO M4B CREATOR & PACKAGING */}
      {subTab === "m4b" && (
        <M4BCreatorPanel
          project={project}
          onUpdateProject={(updated) => setProject(updated)}
          onSwitchToTab={(tab) => setSubTab(tab)}
        />
      )}

    </div>
  );
}
