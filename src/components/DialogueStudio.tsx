import React, { useState, useRef, useEffect } from "react";
import {
  Users,
  Play,
  Pause,
  Plus,
  Trash2,
  Volume2,
  Download,
  FolderDown,
  RefreshCw,
  Sparkles,
  Sliders,
  CheckCircle2,
  AlertCircle,
  FileAudio,
  Film
} from "lucide-react";
import JSZip from "jszip";
import { VoiceModel, DialogueLine } from "../types";
import { ROSTER_VOICES } from "../App";

interface DialogueStudioProps {
  voiceModels: VoiceModel[];
  googleApiKey: string;
}

export const VOCAL_TAGS = [
  { tag: "<laugh>", label: "Laugh" },
  { tag: "<chuckle>", label: "Chuckle" },
  { tag: "<gasp>", label: "Gasp" },
  { tag: "<sigh>", label: "Sigh" },
  { tag: "<breath>", label: "Breath" },
  { tag: "|mhm|", label: "|mhm|" },
  { tag: "|yeah|", label: "|yeah|" },
  { tag: "|right|", label: "|right|" }
];

export function DialogueStudio({ voiceModels, googleApiKey }: DialogueStudioProps) {
  // Characters Cast in this Scene
  const [cast, setCast] = useState<Array<{ name: string; voice: string; accent: string }>>([
    { name: "Narrator", voice: "Charon", accent: "British (Received Pronunciation)" },
    { name: "Alice", voice: "Aoede", accent: "British (Received Pronunciation)" },
    { name: "White Rabbit", voice: "Puck", accent: "British (Cockney London)" }
  ]);

  // Dialogue Beats / Lines
  const [lines, setLines] = useState<Array<DialogueLine & { audioBase64?: string; duration?: number; status?: "pending" | "rendering" | "ready" | "error" }>>([
    {
      id: "line_1",
      speaker: "Narrator",
      text: "Alice was beginning to get very tired of sitting by her sister on the bank, with nothing whatever to do.",
      style: "Cinematic, classic British literary narrator cadence.",
      status: "pending"
    },
    {
      id: "line_2",
      speaker: "Alice",
      text: "And what is the use of a book, <sigh> without pictures or conversations?",
      style: "Inquisitive, wistful Victorian girl voice.",
      status: "pending"
    },
    {
      id: "line_3",
      speaker: "White Rabbit",
      text: "Oh dear! Oh dear! <gasp> I shall be late! The Duchess will have my head!",
      style: "Frantic, panicky Cockney stutter.",
      status: "pending"
    }
  ]);

  // Master Scene Playback & Batch Synthesizing
  const [isSynthesizingScene, setIsSynthesizingScene] = useState(false);
  const [sceneProgress, setSceneProgress] = useState({ current: 0, total: 0 });
  const [playingLineId, setPlayingLineId] = useState<string | null>(null);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);

  // Clean up audio on unmount
  useEffect(() => {
    return () => {
      if (audioPlayerRef.current) audioPlayerRef.current.pause();
    };
  }, []);

  // Play line audio
  const handlePlayLine = (line: (typeof lines)[0]) => {
    if (!line.audioBase64) return;
    if (playingLineId === line.id) {
      if (audioPlayerRef.current) audioPlayerRef.current.pause();
      setPlayingLineId(null);
      return;
    }

    if (audioPlayerRef.current) audioPlayerRef.current.pause();
    setPlayingLineId(line.id);

    const audio = new Audio(`data:audio/wav;base64,${line.audioBase64}`);
    audioPlayerRef.current = audio;
    audio.onended = () => setPlayingLineId(null);
    audio.onerror = () => setPlayingLineId(null);
    audio.play().catch(() => setPlayingLineId(null));
  };

  // Synthesize single line
  const handleSynthesizeLine = async (lineId: string) => {
    const line = lines.find((l) => l.id === lineId);
    if (!line || !line.text.trim()) return;

    setLines((prev) =>
      prev.map((l) => (l.id === lineId ? { ...l, status: "rendering" } : l))
    );

    try {
      const char = cast.find((c) => c.name === line.speaker) || cast[0];
      const model = voiceModels.find((m) => m.name === line.speaker);
      const baseVoice = model ? model.baseVoice : char?.voice || "Kore";
      const styleGuidance = line.style || model?.styleGuidance || "Natural expressive dialogue.";

      const res = await fetch("/api/audio/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: line.text,
          baseVoice,
          styleGuidance,
          speed: 1.0,
          pitch: "Medium",
          googleApiKey
        })
      });

      if (!res.ok) throw new Error("Synthesis failed");
      const data = await res.json();
      if (!data.audio) throw new Error("No audio returned");

      const binary = atob(data.audio);
      const estDuration = Math.max(0.5, Math.round(((binary.length - 44) / 48000) * 10) / 10);

      setLines((prev) =>
        prev.map((l) =>
          l.id === lineId
            ? { ...l, audioBase64: data.audio, duration: estDuration, status: "ready" }
            : l
        )
      );
    } catch (err: any) {
      setLines((prev) =>
        prev.map((l) => (l.id === lineId ? { ...l, status: "error" } : l))
      );
    }
  };

  // Synthesize Full Scene Sequentially
  const handleSynthesizeFullScene = async () => {
    setIsSynthesizingScene(true);
    setSceneProgress({ current: 0, total: lines.length });

    for (let i = 0; i < lines.length; i++) {
      setSceneProgress({ current: i + 1, total: lines.length });
      await handleSynthesizeLine(lines[i].id);
      await new Promise((r) => setTimeout(r, 300));
    }

    setIsSynthesizingScene(false);
  };

  // Add new beat line
  const handleAddLine = () => {
    setLines((prev) => [
      ...prev,
      {
        id: `line_${Date.now()}`,
        speaker: cast[0]?.name || "Narrator",
        text: "New dialogue beat...",
        style: "Natural dialogue delivery",
        status: "pending"
      }
    ]);
  };

  // Export Scene as ZIP
  const handleExportSceneZip = async () => {
    const readyLines = lines.filter((l) => l.audioBase64);
    if (readyLines.length === 0) {
      alert("No lines synthesized yet. Synthesize lines first.");
      return;
    }

    const zip = new JSZip();
    const wavsFolder = zip.folder("scene_audio");
    let scriptContent = "# Multi-Speaker Screenplay Scene\n\n";

    readyLines.forEach((line, index) => {
      const filename = `line_${String(index + 1).padStart(2, "0")}_${line.speaker.toLowerCase().replace(/\s+/g, "_")}.wav`;
      const binary = atob(line.audioBase64!);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      wavsFolder?.file(filename, bytes);
      scriptContent += `[${line.speaker}]: "${line.text}" (${line.style || "Natural"})\n`;
    });

    zip.file("scene_script.txt", scriptContent);

    const blob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "screenplay_scene_audio.zip";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col gap-6 flex-1 text-slate-100 w-full">
      
      {/* Studio Header */}
      <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-5 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-indigo-600/20 text-indigo-400 rounded-xl border border-indigo-500/30">
            <Film className="h-6 w-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-white tracking-tight">Multi-Speaker Screenplay &amp; Dialogue Studio</h2>
              <span className="text-[10px] font-mono px-2.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 font-semibold">
                Multi-Voice Cast
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Direct and render multi-speaker script scenes with assigned character voices and distinct emotional delivery directions.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={handleSynthesizeFullScene}
            disabled={isSynthesizingScene}
            className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold text-xs py-2 px-4 rounded-lg flex items-center gap-1.5 shadow-md shadow-indigo-600/20 cursor-pointer transition-colors"
          >
            {isSynthesizingScene ? (
              <>
                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                Rendering Scene ({sceneProgress.current}/{sceneProgress.total})...
              </>
            ) : (
              <>
                <Volume2 className="h-3.5 w-3.5" />
                Render All Dialogue Beats
              </>
            )}
          </button>
          <button
            onClick={handleExportSceneZip}
            className="bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold py-2 px-3.5 rounded-lg flex items-center gap-1.5 border border-slate-700 cursor-pointer transition-colors"
          >
            <FolderDown className="h-3.5 w-3.5" /> Export Scene (ZIP)
          </button>
        </div>
      </div>

      {/* Cast Roster Bar */}
      <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 flex flex-col gap-3">
        <div className="flex items-center justify-between border-b border-slate-800 pb-2">
          <h3 className="text-xs font-mono uppercase tracking-wider font-bold text-slate-300 flex items-center gap-2">
            <Users className="h-4 w-4 text-indigo-400" /> Cast &amp; Voice Assignment ({cast.length} Characters)
          </h3>
          <button
            onClick={() => {
              const charName = prompt("Character name:")?.trim();
              if (charName) {
                setCast((prev) => [...prev, { name: charName, voice: "Kore", accent: "American (Standard)" }]);
              }
            }}
            className="text-xs font-semibold text-indigo-400 hover:text-indigo-300 flex items-center gap-1 cursor-pointer"
          >
            <Plus className="h-3.5 w-3.5" /> Add Character
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {cast.map((c, i) => (
            <div key={i} className="p-3 bg-slate-900/80 rounded-lg border border-slate-800 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <span className="text-xs font-bold text-white block truncate">{c.name}</span>
                <span className="text-[10px] text-indigo-400 font-mono">{c.voice} • {c.accent}</span>
              </div>
              <select
                value={c.voice}
                onChange={(e) => {
                  const val = e.target.value;
                  setCast((prev) => prev.map((item, idx) => (idx === i ? { ...item, voice: val } : item)));
                }}
                className="bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs text-slate-200 cursor-pointer"
              >
                {ROSTER_VOICES.map((r) => (
                  <option key={r.id} value={r.id}>{r.id} ({r.gender})</option>
                ))}
              </select>
            </div>
          ))}
        </div>
      </div>

      {/* Dialogue Script Beats */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            Dialogue Script Beats ({lines.length})
          </h3>
          <button
            onClick={handleAddLine}
            className="bg-slate-900 hover:bg-slate-800 text-indigo-300 border border-indigo-500/30 text-xs font-semibold py-1.5 px-3 rounded-lg flex items-center gap-1.5 cursor-pointer transition-colors"
          >
            <Plus className="h-3.5 w-3.5" /> Add Dialogue Beat
          </button>
        </div>

        <div className="flex flex-col gap-3">
          {lines.map((line, index) => {
            const isPlaying = playingLineId === line.id;
            return (
              <div
                key={line.id}
                className="p-4 bg-slate-950/70 border border-slate-800 rounded-xl flex flex-col md:flex-row md:items-start justify-between gap-4"
              >
                {/* Speaker Selector & Line # */}
                <div className="flex flex-col gap-2 shrink-0 md:w-44">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono font-bold text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-500/20">
                      Beat #{index + 1}
                    </span>
                    {line.status === "ready" && (
                      <span className="text-[10px] font-mono text-emerald-400 flex items-center gap-1">
                        <CheckCircle2 className="h-3 w-3" /> Ready
                      </span>
                    )}
                  </div>
                  <select
                    value={line.speaker}
                    onChange={(e) => {
                      const spk = e.target.value;
                      setLines((prev) => prev.map((l) => (l.id === line.id ? { ...l, speaker: spk } : l)));
                    }}
                    className="bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 font-bold cursor-pointer"
                  >
                    {cast.map((c) => (
                      <option key={c.name} value={c.name}>{c.name}</option>
                    ))}
                  </select>
                  <input
                    type="text"
                    value={line.style || ""}
                    onChange={(e) => {
                      const st = e.target.value;
                      setLines((prev) => prev.map((l) => (l.id === line.id ? { ...l, style: st } : l)));
                    }}
                    placeholder="Acting direction (e.g. whispering)"
                    className="bg-slate-900 border border-slate-800 rounded px-2 py-1 text-[11px] text-slate-300 placeholder-slate-600"
                  />
                </div>

                {/* Dialogue Text Area & Vocal Bursts */}
                <div className="flex-1 flex flex-col gap-2">
                  <textarea
                    value={line.text}
                    onChange={(e) => {
                      const val = e.target.value;
                      setLines((prev) => prev.map((l) => (l.id === line.id ? { ...l, text: val } : l)));
                    }}
                    rows={2}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg p-3 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                  <div className="flex flex-wrap items-center gap-1">
                    <span className="text-[10px] font-mono text-slate-500 mr-1">Insert Burst:</span>
                    {VOCAL_TAGS.map((vt) => (
                      <button
                        key={vt.tag}
                        type="button"
                        onClick={() => {
                          setLines((prev) =>
                            prev.map((l) => (l.id === line.id ? { ...l, text: `${l.text} ${vt.tag} ` } : l))
                          );
                        }}
                        className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-900 hover:bg-slate-800 text-indigo-300 border border-indigo-500/20 cursor-pointer"
                      >
                        {vt.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Actions: Synthesize, Play, Delete */}
                <div className="flex md:flex-col items-center gap-2 shrink-0">
                  <button
                    onClick={() => handleSynthesizeLine(line.id)}
                    disabled={line.status === "rendering"}
                    className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold py-1.5 px-3 rounded-lg flex items-center gap-1.5 cursor-pointer transition-colors"
                  >
                    {line.status === "rendering" ? (
                      <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Volume2 className="h-3.5 w-3.5" />
                    )}
                    Render Beat
                  </button>

                  {line.audioBase64 && (
                    <button
                      onClick={() => handlePlayLine(line)}
                      className="bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold py-1.5 px-3 rounded-lg flex items-center gap-1.5 cursor-pointer transition-colors"
                    >
                      {isPlaying ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5 fill-current ml-0.5" />}
                      {isPlaying ? "Pause" : `Play (${line.duration || 0}s)`}
                    </button>
                  )}

                  <button
                    onClick={() => setLines((prev) => prev.filter((l) => l.id !== line.id))}
                    className="text-slate-500 hover:text-rose-400 p-1.5 transition-colors cursor-pointer"
                    title="Delete Beat"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>

              </div>
            );
          })}
        </div>
      </div>

    </div>
  );
}
