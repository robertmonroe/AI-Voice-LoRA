import React, { useState, useRef, useEffect } from "react";
import {
  Users,
  Play,
  Pause,
  Download,
  Plus,
  Trash2,
  Sparkles,
  RefreshCw,
  Volume2,
  Layers,
  CheckCircle2,
  AlertCircle,
  FolderDown,
  ChevronDown
} from "lucide-react";
import { VoiceModel, DialogueLine } from "../types";
import { ROSTER_VOICES } from "../App";

interface ScreenplayStudioProps {
  voiceModels: VoiceModel[];
  googleApiKey: string;
}

interface ScriptCharacter {
  id: string;
  name: string;
  voiceName: string; // Puck, Charon, Kore, etc. or VoiceModel name
  styleDirection: string;
  color: string;
}

const CHARACTER_COLORS = [
  "border-amber-500/40 bg-amber-500/10 text-amber-300",
  "border-cyan-500/40 bg-cyan-500/10 text-cyan-300",
  "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
  "border-purple-500/40 bg-purple-500/10 text-purple-300",
  "border-rose-500/40 bg-rose-500/10 text-rose-300",
  "border-blue-500/40 bg-blue-500/10 text-blue-300"
];

export const ScreenplayStudio: React.FC<ScreenplayStudioProps> = ({
  voiceModels,
  googleApiKey
}) => {
  // Script metadata
  const [scriptTitle, setScriptTitle] = useState("The Midnight Investigation");

  // Cast of multi-speaker characters (supports 2, 3, 4+ characters)
  const [characters, setCharacters] = useState<ScriptCharacter[]>([
    {
      id: "char_1",
      name: "Sherlock",
      voiceName: "Charon",
      styleDirection: "Authoritative, observant, calculated British cadence",
      color: CHARACTER_COLORS[0]
    },
    {
      id: "char_2",
      name: "Watson",
      voiceName: "Puck",
      styleDirection: "Inquisitive, loyal companion, warm and conversational",
      color: CHARACTER_COLORS[1]
    },
    {
      id: "char_3",
      name: "Inspector",
      voiceName: "Fenrir",
      styleDirection: "Gravelly, hurried, gruff Scotland Yard investigator",
      color: CHARACTER_COLORS[2]
    }
  ]);

  // Dialogue lines
  const [lines, setLines] = useState<Array<DialogueLine & { audioBase64?: string; duration?: number; status?: string }>>([
    {
      id: "dl_1",
      speaker: "Sherlock",
      text: "Look at the ashes on the carpet, Watson. <breath> Notice anything peculiar about the perimeter?",
      style: "Quietly observant, focused deduction"
    },
    {
      id: "dl_2",
      speaker: "Watson",
      text: "They seem freshly fallen, Holmes. <chuckle> But the fireplace hasn't been lit in three days!",
      style: "Surprised realization, animated"
    },
    {
      id: "dl_3",
      speaker: "Inspector",
      text: "Then someone broke in through the chimney flue! <gasp> And they left before midnight!",
      style: "Gruff, sudden burst of revelation"
    },
    {
      id: "dl_4",
      speaker: "Sherlock",
      text: "Precisely, Inspector. And they left this torn receipt in the grate.",
      style: "Satisfied, definitive"
    }
  ]);

  // AI Script Generator Prompt
  const [aiScenePrompt, setAiScenePrompt] = useState("A tense 4-line argument in a rain-soaked alleyway about a lost ledger.");
  const [isGeneratingAiScene, setIsGeneratingAiScene] = useState(false);

  // Playback & Rendering
  const [renderingLineId, setRenderingLineId] = useState<string | null>(null);
  const [playingLineId, setPlayingLineId] = useState<string | null>(null);
  const [isCompilingAll, setIsCompilingAll] = useState(false);
  const [compileProgress, setCompileProgress] = useState({ current: 0, total: 0 });

  // Master Compiled Audio
  const [compiledAudioBase64, setCompiledAudioBase64] = useState<string | null>(null);
  const [isPlayingMaster, setIsPlayingMaster] = useState(false);
  const [masterProgress, setMasterProgress] = useState(0);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const progressIntervalRef = useRef<any>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) audioRef.current.pause();
      if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
    };
  }, []);

  // Helper to find voice settings for a character
  const getCharacterVoice = (speakerName: string) => {
    const char = characters.find((c) => c.name.toLowerCase() === speakerName.toLowerCase());
    if (!char) return { baseVoice: "Puck", style: "Natural dialogue" };
    return { baseVoice: char.voiceName, style: char.styleDirection };
  };

  // Synthesize single line
  const handleRenderLine = async (lineId: string) => {
    const line = lines.find((l) => l.id === lineId);
    if (!line || !line.text.trim()) return;

    setRenderingLineId(lineId);

    try {
      const charVoice = getCharacterVoice(line.speaker);
      const combinedStyle = line.style
        ? `${charVoice.style}. Performance: ${line.style}`
        : charVoice.style;

      const res = await fetch("/api/audio/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: line.text,
          baseVoice: charVoice.baseVoice,
          styleGuidance: combinedStyle,
          speed: 1.0,
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

      setLines((prev) =>
        prev.map((l) =>
          l.id === lineId
            ? { ...l, audioBase64: data.audio, duration: estDuration, status: "ready" }
            : l
        )
      );
    } catch (err: any) {
      alert("Failed to render dialogue line: " + err.message);
    } finally {
      setRenderingLineId(null);
    }
  };

  // Play line audio
  const handlePlayLine = (audioBase64: string, lineId: string) => {
    if (playingLineId === lineId) {
      if (audioRef.current) audioRef.current.pause();
      setPlayingLineId(null);
      return;
    }

    if (audioRef.current) audioRef.current.pause();
    setPlayingLineId(lineId);

    const audio = new Audio(`data:audio/wav;base64,${audioBase64}`);
    audioRef.current = audio;
    audio.onended = () => setPlayingLineId(null);
    audio.onerror = () => setPlayingLineId(null);
    audio.play().catch(() => setPlayingLineId(null));
  };

  // Render all unrendered lines and compile full dialogue scene
  const handleCompileFullScene = async () => {
    setIsCompilingAll(true);
    setCompileProgress({ current: 0, total: lines.length });

    try {
      const updatedLines = [...lines];

      // 1. Synthesize any missing lines
      for (let i = 0; i < updatedLines.length; i++) {
        setCompileProgress({ current: i + 1, total: updatedLines.length });
        if (!updatedLines[i].audioBase64) {
          const line = updatedLines[i];
          const charVoice = getCharacterVoice(line.speaker);
          const combinedStyle = line.style
            ? `${charVoice.style}. Performance: ${line.style}`
            : charVoice.style;

          const res = await fetch("/api/audio/generate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              text: line.text,
              baseVoice: charVoice.baseVoice,
              styleGuidance: combinedStyle,
              speed: 1.0,
              googleApiKey
            })
          });

          if (res.ok) {
            const data = await res.json();
            if (data.audio) {
              const binary = atob(data.audio);
              const estDuration = Math.max(0.5, Math.round(((binary.length - 44) / 48000) * 10) / 10);
              updatedLines[i] = { ...line, audioBase64: data.audio, duration: estDuration };
            }
          }
          await new Promise((r) => setTimeout(r, 300));
        }
      }

      setLines(updatedLines);

      // 2. Concatenate all audio lines with pauses into master chapter WAV
      const chunkPayloads = updatedLines
        .filter((l) => !!l.audioBase64)
        .map((l) => ({ audioBase64: l.audioBase64, duration: l.duration || 2 }));

      const compileRes = await fetch("/api/audiobook/compile-chapter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chunks: chunkPayloads,
          pauseBetweenChunksMs: 350
        })
      });

      if (!compileRes.ok) {
        throw new Error("Failed to compile master scene audio");
      }

      const compileData = await compileRes.json();
      if (compileData.compiledAudio) {
        setCompiledAudioBase64(compileData.compiledAudio);
      }
    } catch (err: any) {
      alert("Scene compilation failed: " + err.message);
    } finally {
      setIsCompilingAll(false);
    }
  };

  // Play master dialogue scene
  const handleTogglePlayMaster = () => {
    if (!compiledAudioBase64) return;

    if (isPlayingMaster) {
      if (audioRef.current) audioRef.current.pause();
      setIsPlayingMaster(false);
      if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
      return;
    }

    if (audioRef.current) audioRef.current.pause();
    setIsPlayingMaster(true);
    setMasterProgress(0);

    const audio = new Audio(`data:audio/wav;base64,${compiledAudioBase64}`);
    audioRef.current = audio;

    audio.onended = () => {
      setIsPlayingMaster(false);
      setMasterProgress(100);
      if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
    };

    audio.play().catch(() => setIsPlayingMaster(false));

    progressIntervalRef.current = setInterval(() => {
      if (audio && audio.duration) {
        setMasterProgress(Math.min((audio.currentTime / audio.duration) * 100, 100));
      }
    }, 100);
  };

  // Download master dialogue WAV
  const handleDownloadMaster = () => {
    if (!compiledAudioBase64) return;
    const binary = atob(compiledAudioBase64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    const blob = new Blob([bytes], { type: "audio/wav" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${scriptTitle.toLowerCase().replace(/[^a-z0-9]/g, "_")}_full_scene.wav`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col gap-6 text-slate-100 flex-1">
      
      {/* HEADER */}
      <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-5 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-indigo-600/20 text-indigo-400 rounded-xl border border-indigo-500/30">
            <Users className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
              Multi-Speaker Screenplay &amp; Dialogue Studio
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Cast multiple distinct voices (3+ characters), write turn-by-turn dialogue, direct acting cues, and compile full conversational scenes into master audio.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <input
            type="text"
            value={scriptTitle}
            onChange={(e) => setScriptTitle(e.target.value)}
            className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-white font-semibold focus:outline-none focus:ring-1 focus:ring-indigo-500"
            placeholder="Scene Title..."
          />
        </div>
      </div>

      {/* CHARACTER CAST ROSTER */}
      <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 flex flex-col gap-3">
        <div className="flex items-center justify-between border-b border-slate-800 pb-2">
          <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
            <Users className="h-4 w-4 text-indigo-400" />
            Character Voice Cast ({characters.length})
          </h3>
          <button
            onClick={() => {
              const newId = `char_${Date.now()}`;
              setCharacters((prev) => [
                ...prev,
                {
                  id: newId,
                  name: `Character ${prev.length + 1}`,
                  voiceName: "Kore",
                  styleDirection: "Expressive character dialogue",
                  color: CHARACTER_COLORS[prev.length % CHARACTER_COLORS.length]
                }
              ]);
            }}
            className="text-xs font-semibold text-indigo-400 hover:text-indigo-300 flex items-center gap-1 cursor-pointer"
          >
            <Plus className="h-3.5 w-3.5" /> Add Actor
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {characters.map((char, idx) => (
            <div
              key={char.id}
              className={`p-3 rounded-lg border ${char.color} flex flex-col gap-2 relative`}
            >
              <div className="flex items-center justify-between">
                <input
                  type="text"
                  value={char.name}
                  onChange={(e) => {
                    const val = e.target.value;
                    setCharacters((prev) =>
                      prev.map((c) => (c.id === char.id ? { ...c, name: val } : c))
                    );
                  }}
                  className="bg-transparent font-bold text-xs text-white focus:outline-none border-b border-dashed border-slate-500 max-w-[140px]"
                />
                <select
                  value={char.voiceName}
                  onChange={(e) => {
                    const val = e.target.value;
                    setCharacters((prev) =>
                      prev.map((c) => (c.id === char.id ? { ...c, voiceName: val } : c))
                    );
                  }}
                  className="bg-slate-900 border border-slate-800 rounded px-2 py-0.5 text-[11px] text-slate-200 cursor-pointer focus:outline-none"
                >
                  <optgroup label="Official Gemini 3.8 Voices">
                    {ROSTER_VOICES.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.id} ({v.tone})
                      </option>
                    ))}
                  </optgroup>
                  {voiceModels.length > 0 && (
                    <optgroup label="Your Custom Voice Models">
                      {voiceModels.map((vm) => (
                        <option key={vm.id} value={vm.baseVoice}>
                          {vm.name} ({vm.baseVoice})
                        </option>
                      ))}
                    </optgroup>
                  )}
                </select>
              </div>

              <input
                type="text"
                value={char.styleDirection}
                onChange={(e) => {
                  const val = e.target.value;
                  setCharacters((prev) =>
                    prev.map((c) => (c.id === char.id ? { ...c, styleDirection: val } : c))
                  );
                }}
                placeholder="Acting style & accent direction..."
                className="w-full bg-slate-950/70 border border-slate-800 rounded px-2 py-1 text-[11px] text-slate-300 focus:outline-none"
              />
            </div>
          ))}
        </div>
      </div>

      {/* DIALOGUE LINES TIMELINE */}
      <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-5 flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
          <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Layers className="h-4 w-4 text-indigo-400" />
              Dialogue Script ({lines.length} Lines)
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Assign lines to characters, insert natural acting bursts, and render audio individually or altogether.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                const nextSpeaker = characters[lines.length % characters.length]?.name || "Speaker";
                setLines((prev) => [
                  ...prev,
                  {
                    id: `dl_${Date.now()}`,
                    speaker: nextSpeaker,
                    text: "New dialogue line here...",
                    style: "Natural conversation"
                  }
                ]);
              }}
              className="bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-800 text-xs font-semibold px-3 py-1.5 rounded-lg flex items-center gap-1 cursor-pointer transition-colors"
            >
              <Plus className="h-3.5 w-3.5" /> Add Line
            </button>

            <button
              onClick={handleCompileFullScene}
              disabled={isCompilingAll}
              className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold text-xs py-1.5 px-3.5 rounded-lg flex items-center gap-1.5 shadow-md shadow-indigo-600/20 cursor-pointer transition-all"
            >
              {isCompilingAll ? (
                <>
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  Rendering ({compileProgress.current}/{compileProgress.total})...
                </>
              ) : (
                <>
                  <Volume2 className="h-3.5 w-3.5" /> Compile Scene Master
                </>
              )}
            </button>
          </div>
        </div>

        {/* Lines Editor */}
        <div className="flex flex-col gap-3 max-h-[500px] overflow-y-auto pr-1">
          {lines.map((line, index) => {
            const char = characters.find((c) => c.name.toLowerCase() === line.speaker.toLowerCase());
            const isPlaying = playingLineId === line.id;
            const isRendering = renderingLineId === line.id;

            return (
              <div
                key={line.id}
                className="p-3.5 rounded-xl border border-slate-800 bg-slate-950/40 hover:bg-slate-950/80 flex flex-col md:flex-row md:items-center justify-between gap-3 transition-all"
              >
                {/* Speaker Selector & Line # */}
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[10px] font-mono text-slate-500 font-bold">#{index + 1}</span>
                  <select
                    value={line.speaker}
                    onChange={(e) => {
                      const val = e.target.value;
                      setLines((prev) =>
                        prev.map((l) => (l.id === line.id ? { ...l, speaker: val } : l))
                      );
                    }}
                    className="bg-slate-900 border border-slate-800 rounded px-2.5 py-1 text-xs font-bold text-white focus:outline-none cursor-pointer"
                  >
                    {characters.map((c) => (
                      <option key={c.id} value={c.name}>
                        {c.name} ({c.voiceName})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Text and Acting Direction */}
                <div className="flex-1 min-w-0 flex flex-col gap-1.5">
                  <input
                    type="text"
                    value={line.text}
                    onChange={(e) => {
                      const val = e.target.value;
                      setLines((prev) =>
                        prev.map((l) => (l.id === line.id ? { ...l, text: val } : l))
                      );
                    }}
                    className="w-full bg-slate-900/80 border border-slate-800 rounded px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 font-medium"
                    placeholder="Dialogue spoken by character..."
                  />
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono text-slate-500 uppercase">Direction:</span>
                    <input
                      type="text"
                      value={line.style || ""}
                      onChange={(e) => {
                        const val = e.target.value;
                        setLines((prev) =>
                          prev.map((l) => (l.id === line.id ? { ...l, style: val } : l))
                        );
                      }}
                      placeholder="Acting notes (e.g. whispering, exasperated laugh, fast-paced)..."
                      className="flex-1 bg-transparent text-[11px] text-slate-400 focus:outline-none border-b border-slate-800 focus:border-slate-600"
                    />
                  </div>
                </div>

                {/* Actions: Render & Play */}
                <div className="flex items-center gap-2 shrink-0">
                  {line.audioBase64 ? (
                    <button
                      onClick={() => handlePlayLine(line.audioBase64!, line.id)}
                      className="p-2 rounded-full bg-indigo-600 text-white hover:bg-indigo-500 transition-colors cursor-pointer"
                      title="Play rendered line"
                    >
                      {isPlaying ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5 fill-current ml-0.5" />}
                    </button>
                  ) : null}

                  <button
                    onClick={() => handleRenderLine(line.id)}
                    disabled={isRendering}
                    className="bg-slate-900 hover:bg-slate-800 text-indigo-400 border border-indigo-500/20 text-xs px-2.5 py-1.5 rounded-lg flex items-center gap-1 cursor-pointer transition-colors"
                  >
                    {isRendering ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Volume2 className="h-3 w-3" />}
                    {line.audioBase64 ? "Re-render" : "Render"}
                  </button>

                  <button
                    onClick={() => setLines((prev) => prev.filter((l) => l.id !== line.id))}
                    className="text-slate-500 hover:text-rose-400 p-1.5 transition-colors cursor-pointer"
                    title="Delete line"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Master Scene Playback Bar if Compiled */}
        {compiledAudioBase64 && (
          <div className="mt-3 p-4 bg-indigo-950/30 border border-indigo-900/50 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <button
                onClick={handleTogglePlayMaster}
                className="p-3 rounded-full bg-indigo-600 text-white hover:bg-indigo-500 transition-colors cursor-pointer shadow-lg shadow-indigo-600/30 shrink-0"
              >
                {isPlayingMaster ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5 fill-current ml-0.5" />}
              </button>
              <div>
                <span className="text-xs font-bold text-white flex items-center gap-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                  Full Multi-Speaker Scene Master Ready
                </span>
                <p className="text-[11px] text-slate-400">
                  Concatenated conversational audio with natural pacing pauses.
                </p>
              </div>
            </div>

            <button
              onClick={handleDownloadMaster}
              className="bg-slate-900 hover:bg-slate-800 text-white border border-slate-700 text-xs font-semibold py-2 px-4 rounded-lg flex items-center gap-1.5 cursor-pointer transition-colors"
            >
              <Download className="h-3.5 w-3.5" /> Download Full Scene WAV
            </button>
          </div>
        )}

      </div>

    </div>
  );
};
