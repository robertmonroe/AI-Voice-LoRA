import React, { useState, useRef, useEffect } from "react";
import {
  ShieldCheck,
  AlertTriangle,
  XCircle,
  Activity,
  SlidersHorizontal,
  Play,
  Pause,
  RefreshCw,
  Wand2,
  Check,
  Sparkles,
  Volume2,
  Layers,
  ChevronDown,
  ChevronUp
} from "lucide-react";
import {
  AudiobookProject,
  AudiobookChapter,
  AudiobookChunk,
  ACXMetrics,
  ACXSettings
} from "../types";

interface ACXMasteringPanelProps {
  project: AudiobookProject;
  activeChapter: AudiobookChapter | null;
  onUpdateChapter: (updatedChapter: AudiobookChapter) => void;
  onUpdateChunk: (chunkId: string, updatedChunk: Partial<AudiobookChunk>) => void;
  onUpdateAllChapters: (updatedChapters: AudiobookChapter[]) => void;
}

export function ACXMasteringPanel({
  project,
  activeChapter,
  onUpdateChapter,
  onUpdateChunk,
  onUpdateAllChapters
}: ACXMasteringPanelProps) {
  const [selectedTarget, setSelectedTarget] = useState<"chapter" | "chunk" | "all">("chapter");
  const [selectedChunkId, setSelectedChunkId] = useState<string>("");
  
  // Custom DSP Settings
  const [settings, setSettings] = useState<ACXSettings>(project.acxSettings || {
    targetRms: -20.0,
    maxPeak: -3.1,
    highPassHz: 80,
    noiseGateDb: -65,
    enableEq: true,
    eqWarmthDb: 1.2,
    eqPresenceDb: 2.2,
    eqDeEssDb: -1.8,
    enableCompressor: true,
    compressorRatio: 2.5,
    enableLimiter: true,
    sampleRate: 44100,
    bitrateKbps: 192,
  });

  const [showAdvancedDsp, setShowAdvancedDsp] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isAuditing, setIsAuditing] = useState(false);
  const [auditError, setAuditError] = useState<string | null>(null);

  // A/B Player State
  const [abMode, setAbMode] = useState<"mastered" | "raw">("mastered");
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioProgress, setAudioProgress] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const timerRef = useRef<any>(null);

  // Current audio to inspect
  const currentChunk = activeChapter?.chunks.find(c => c.id === selectedChunkId) || activeChapter?.chunks[0] || null;

  const currentAudioBase64 =
    selectedTarget === "chunk"
      ? currentChunk?.audioBase64
      : activeChapter?.compiledAudioBase64;

  const currentRawAudioBase64 =
    selectedTarget === "chunk"
      ? currentChunk?.rawAudioBase64 || currentChunk?.audioBase64
      : activeChapter?.rawCompiledAudioBase64 || activeChapter?.compiledAudioBase64;

  const currentMetrics: ACXMetrics | undefined =
    selectedTarget === "chunk"
      ? currentChunk?.acxMetrics
      : activeChapter?.acxMetrics;

  const isCurrentProcessed =
    selectedTarget === "chunk"
      ? currentChunk?.isAcxProcessed
      : activeChapter?.isAcxProcessed;

  // Set default selected chunk
  useEffect(() => {
    if (!selectedChunkId && activeChapter?.chunks.length) {
      const firstWithAudio = activeChapter.chunks.find(c => c.audioBase64);
      if (firstWithAudio) setSelectedChunkId(firstWithAudio.id);
    }
  }, [activeChapter, selectedChunkId]);

  // Stop playback when target changes
  useEffect(() => {
    if (audioRef.current) audioRef.current.pause();
    setIsPlaying(false);
    setAudioProgress(0);
    if (timerRef.current) clearInterval(timerRef.current);
  }, [selectedTarget, selectedChunkId, abMode]);

  // Audit ACX Compliance
  const handleAuditACX = async () => {
    if (!currentAudioBase64) return;
    setIsAuditing(true);
    setAuditError(null);

    try {
      const res = await fetch("/api/audio/acx-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ audioBase64: currentAudioBase64 }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "ACX audit failed");
      }

      const data = await res.json();
      if (!data.metrics) throw new Error("No metrics returned");

      if (selectedTarget === "chapter" && activeChapter) {
        onUpdateChapter({
          ...activeChapter,
          acxMetrics: data.metrics,
        });
      } else if (selectedTarget === "chunk" && currentChunk) {
        onUpdateChunk(currentChunk.id, {
          acxMetrics: data.metrics,
        });
      }
    } catch (e: any) {
      setAuditError(e.message || "Failed to audit audio");
    } finally {
      setIsAuditing(false);
    }
  };

  // Master with ACX DSP chain
  const handleMasterACX = async () => {
    const audioToMaster = currentRawAudioBase64 || currentAudioBase64;
    if (!audioToMaster) return;

    setIsProcessing(true);
    setAuditError(null);

    try {
      const res = await fetch("/api/audio/acx-process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          audioBase64: audioToMaster,
          settings,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "ACX mastering failed");
      }

      const data = await res.json();
      if (!data.audioBase64) throw new Error("No processed audio returned");

      if (selectedTarget === "chapter" && activeChapter) {
        onUpdateChapter({
          ...activeChapter,
          rawCompiledAudioBase64: activeChapter.rawCompiledAudioBase64 || activeChapter.compiledAudioBase64,
          compiledAudioBase64: data.audioBase64,
          compiledDuration: data.metrics.duration,
          acxMetrics: data.metrics,
          isAcxProcessed: true,
        });
      } else if (selectedTarget === "chunk" && currentChunk) {
        onUpdateChunk(currentChunk.id, {
          rawAudioBase64: currentChunk.rawAudioBase64 || currentChunk.audioBase64,
          audioBase64: data.audioBase64,
          duration: data.metrics.duration,
          acxMetrics: data.metrics,
          isAcxProcessed: true,
        });
      }

      setAbMode("mastered");
    } catch (e: any) {
      setAuditError(e.message || "Failed to process audio");
    } finally {
      setIsProcessing(false);
    }
  };

  // Master All Chapters in Batch
  const handleMasterAllChapters = async () => {
    const chaptersWithAudio = project.chapters.filter(c => c.compiledAudioBase64);
    if (chaptersWithAudio.length === 0) {
      alert("No compiled chapters found. Please compile chapters before mastering the full audiobook.");
      return;
    }

    setIsProcessing(true);
    setAuditError(null);

    try {
      const updatedChapters = [...project.chapters];

      for (let i = 0; i < updatedChapters.length; i++) {
        const ch = updatedChapters[i];
        const audioSource = ch.rawCompiledAudioBase64 || ch.compiledAudioBase64;
        if (!audioSource) continue;

        const res = await fetch("/api/audio/acx-process", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            audioBase64: audioSource,
            settings,
          }),
        });

        if (res.ok) {
          const data = await res.json();
          updatedChapters[i] = {
            ...ch,
            rawCompiledAudioBase64: ch.rawCompiledAudioBase64 || ch.compiledAudioBase64,
            compiledAudioBase64: data.audioBase64,
            compiledDuration: data.metrics.duration,
            acxMetrics: data.metrics,
            isAcxProcessed: true,
          };
        }
      }

      onUpdateAllChapters(updatedChapters);
    } catch (e: any) {
      setAuditError(e.message || "Failed to batch master chapters");
    } finally {
      setIsProcessing(false);
    }
  };

  // Toggle A/B Playback
  const handleTogglePlay = () => {
    const base64 = abMode === "mastered" ? currentAudioBase64 : currentRawAudioBase64;
    if (!base64) return;

    if (isPlaying && audioRef.current) {
      audioRef.current.pause();
      setIsPlaying(false);
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }

    if (audioRef.current) audioRef.current.pause();
    if (timerRef.current) clearInterval(timerRef.current);

    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const blob = new Blob([bytes], { type: "audio/wav" });
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    audioRef.current = audio;

    audio.play().catch(e => console.warn(e));
    setIsPlaying(true);

    audio.onended = () => {
      setIsPlaying(false);
      setAudioProgress(100);
      if (timerRef.current) clearInterval(timerRef.current);
    };

    timerRef.current = setInterval(() => {
      if (audio && audio.duration) {
        setAudioProgress(Math.min((audio.currentTime / audio.duration) * 100, 100));
      }
    }, 80);
  };

  return (
    <div className="flex flex-col gap-6 bg-slate-950/40 p-6 rounded-xl border border-slate-800">
      
      {/* HEADER */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <h3 className="text-base font-bold text-white flex items-center gap-2 font-mono uppercase tracking-wider">
            <ShieldCheck className="h-5 w-5 text-emerald-400" />
            ACX Audio Compliance & Mastering Suite
          </h3>
          <p className="text-xs text-slate-400 mt-1">
            Industry-standard DSP processing: Rumble Filter, 3-Band Parametric EQ, Noise Floor Gate, Compression & True Peak Limiter.
          </p>
        </div>

        {/* Target Scope Switcher */}
        <div className="flex items-center gap-1 bg-slate-900 border border-slate-800 p-1 rounded-lg self-start md:self-auto">
          <button
            onClick={() => setSelectedTarget("chapter")}
            className={`text-xs font-semibold px-3 py-1.5 rounded transition-all cursor-pointer ${
              selectedTarget === "chapter" ? "bg-emerald-600 text-white shadow" : "text-slate-400 hover:text-slate-200"
            }`}
          >
            Active Chapter
          </button>
          <button
            onClick={() => setSelectedTarget("chunk")}
            className={`text-xs font-semibold px-3 py-1.5 rounded transition-all cursor-pointer ${
              selectedTarget === "chunk" ? "bg-emerald-600 text-white shadow" : "text-slate-400 hover:text-slate-200"
            }`}
          >
            Specific Clip
          </button>
          <button
            onClick={() => setSelectedTarget("all")}
            className={`text-xs font-semibold px-3 py-1.5 rounded transition-all cursor-pointer ${
              selectedTarget === "all" ? "bg-purple-600 text-white shadow" : "text-slate-400 hover:text-slate-200"
            }`}
          >
            All Chapters (Full Book)
          </button>
        </div>
      </div>

      {/* ERROR BANNER */}
      {auditError && (
        <div className="bg-red-500/10 border border-red-500/30 p-3 rounded-lg text-xs text-red-300 flex items-center gap-2">
          <XCircle className="h-4 w-4 shrink-0 text-red-400" />
          <span>{auditError}</span>
        </div>
      )}

      {/* TARGET SELECTION SPECIFICS */}
      {selectedTarget === "chunk" && (
        <div className="flex items-center gap-3 bg-slate-900/60 p-3 rounded-lg border border-slate-800 text-xs">
          <span className="font-semibold text-slate-300">Select Clip:</span>
          <select
            value={selectedChunkId}
            onChange={(e) => setSelectedChunkId(e.target.value)}
            className="flex-1 bg-slate-950 border border-slate-800 rounded px-3 py-1.5 text-white focus:outline-none focus:border-emerald-500"
          >
            {activeChapter?.chunks.map((c) => (
              <option key={c.id} value={c.id}>
                #{c.index} ({c.speaker}): {c.text.slice(0, 50)}... {c.audioBase64 ? "✓ Audio" : "No Audio"}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* ACX METRICS DASHBOARD */}
      {selectedTarget !== "all" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          
          {/* RMS LOUDNESS */}
          <div className="bg-slate-900/80 p-4 rounded-xl border border-slate-800 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono uppercase text-slate-400">RMS Loudness</span>
                {currentMetrics ? (
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase font-mono ${
                    currentMetrics.rmsStatus === "pass" ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30" : "bg-red-500/20 text-red-300 border border-red-500/30"
                  }`}>
                    {currentMetrics.rmsStatus}
                  </span>
                ) : (
                  <span className="text-[10px] text-slate-500">Unchecked</span>
                )}
              </div>
              <div className="mt-2 text-2xl font-black font-mono text-white">
                {currentMetrics ? `${currentMetrics.rms.toFixed(1)} dBFS` : "--"}
              </div>
            </div>
            <div className="mt-3 text-[11px] text-slate-400 border-t border-slate-800 pt-2 flex justify-between">
              <span>Target Range:</span>
              <span className="font-mono text-emerald-400">-23.0 to -18.0 dB</span>
            </div>
          </div>

          {/* PEAK LEVEL */}
          <div className="bg-slate-900/80 p-4 rounded-xl border border-slate-800 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono uppercase text-slate-400">True Peak</span>
                {currentMetrics ? (
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase font-mono ${
                    currentMetrics.peakStatus === "pass" ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30" : "bg-red-500/20 text-red-300 border border-red-500/30"
                  }`}>
                    {currentMetrics.peakStatus}
                  </span>
                ) : (
                  <span className="text-[10px] text-slate-500">Unchecked</span>
                )}
              </div>
              <div className="mt-2 text-2xl font-black font-mono text-white">
                {currentMetrics ? `${currentMetrics.peak.toFixed(1)} dBFS` : "--"}
              </div>
            </div>
            <div className="mt-3 text-[11px] text-slate-400 border-t border-slate-800 pt-2 flex justify-between">
              <span>Maximum Ceiling:</span>
              <span className="font-mono text-emerald-400">&le; -3.0 dBFS</span>
            </div>
          </div>

          {/* NOISE FLOOR */}
          <div className="bg-slate-900/80 p-4 rounded-xl border border-slate-800 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono uppercase text-slate-400">Noise Floor</span>
                {currentMetrics ? (
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase font-mono ${
                    currentMetrics.noiseFloorStatus === "pass" ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30" : "bg-red-500/20 text-red-300 border border-red-500/30"
                  }`}>
                    {currentMetrics.noiseFloorStatus}
                  </span>
                ) : (
                  <span className="text-[10px] text-slate-500">Unchecked</span>
                )}
              </div>
              <div className="mt-2 text-2xl font-black font-mono text-white">
                {currentMetrics ? `${currentMetrics.noiseFloor.toFixed(1)} dBFS` : "--"}
              </div>
            </div>
            <div className="mt-3 text-[11px] text-slate-400 border-t border-slate-800 pt-2 flex justify-between">
              <span>Maximum Limit:</span>
              <span className="font-mono text-emerald-400">&le; -60.0 dB RMS</span>
            </div>
          </div>

          {/* SAMPLE RATE & STATUS */}
          <div className="bg-slate-900/80 p-4 rounded-xl border border-slate-800 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono uppercase text-slate-400">Format & Audit</span>
                {currentMetrics?.isCompliant ? (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded uppercase font-mono bg-emerald-500 text-slate-950 font-bold">
                    ACX PASS
                  </span>
                ) : (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded uppercase font-mono bg-amber-500/20 text-amber-300 border border-amber-500/30">
                    Needs Master
                  </span>
                )}
              </div>
              <div className="mt-2 text-2xl font-black font-mono text-white">
                {currentMetrics ? `${(currentMetrics.sampleRate / 1000).toFixed(1)} kHz` : "44.1 kHz"}
              </div>
            </div>
            <div className="mt-3 text-[11px] text-slate-400 border-t border-slate-800 pt-2 flex justify-between">
              <span>Duration:</span>
              <span className="font-mono text-slate-300">
                {currentMetrics ? `${currentMetrics.duration}s` : "--"}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ACTION TOOLBAR & 1-CLICK MASTER */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900/50 p-4 rounded-xl border border-slate-800">
        <div className="flex items-center gap-2">
          {selectedTarget !== "all" && (
            <button
              onClick={handleAuditACX}
              disabled={isAuditing || !currentAudioBase64}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs rounded-lg flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
            >
              <Activity className={`h-3.5 w-3.5 ${isAuditing ? "animate-spin text-indigo-400" : ""}`} />
              Run ACX Audit
            </button>
          )}

          {selectedTarget !== "all" ? (
            <button
              onClick={handleMasterACX}
              disabled={isProcessing || !currentAudioBase64}
              className="px-5 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs rounded-lg flex items-center gap-2 shadow-lg shadow-emerald-600/20 transition-all cursor-pointer disabled:opacity-50"
            >
              <Sparkles className={`h-4 w-4 ${isProcessing ? "animate-spin" : ""}`} />
              {isProcessing ? "Mastering Audio..." : "⚡ Master for ACX Compliance"}
            </button>
          ) : (
            <button
              onClick={handleMasterAllChapters}
              disabled={isProcessing}
              className="px-5 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold text-xs rounded-lg flex items-center gap-2 shadow-lg shadow-purple-600/20 transition-all cursor-pointer disabled:opacity-50"
            >
              <Layers className={`h-4 w-4 ${isProcessing ? "animate-spin" : ""}`} />
              {isProcessing ? "Mastering All Chapters..." : "⚡ Master Entire Audiobook for ACX"}
            </button>
          )}

          {isCurrentProcessed && (
            <span className="text-xs text-emerald-400 font-semibold flex items-center gap-1 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded">
              <Check className="h-3 w-3" /> Mastered & Applied
            </span>
          )}
        </div>

        <button
          onClick={() => setShowAdvancedDsp(!showAdvancedDsp)}
          className="text-xs text-slate-400 hover:text-slate-200 flex items-center gap-1 cursor-pointer"
        >
          <SlidersHorizontal className="h-3.5 w-3.5 text-indigo-400" />
          {showAdvancedDsp ? "Hide DSP Tuning" : "Tune EQ & Compressor Settings"}
          {showAdvancedDsp ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        </button>
      </div>

      {/* ADVANCED DSP DRAWER */}
      {showAdvancedDsp && (
        <div className="bg-slate-900/90 p-5 rounded-xl border border-slate-800 grid grid-cols-1 md:grid-cols-3 gap-6 animate-fadeIn">
          {/* EQUALIZER */}
          <div className="flex flex-col gap-3">
            <h4 className="text-xs font-mono uppercase text-indigo-400 font-bold border-b border-slate-800 pb-1.5 flex items-center gap-1.5">
              <SlidersHorizontal className="h-3.5 w-3.5" /> 1. Voice Parametric EQ
            </h4>
            
            <div className="flex flex-col gap-1">
              <div className="flex justify-between text-xs text-slate-300">
                <span>Rumble Cut (Highpass)</span>
                <span className="font-mono text-indigo-400">{settings.highPassHz} Hz</span>
              </div>
              <input
                type="range"
                min="40"
                max="120"
                step="5"
                value={settings.highPassHz}
                onChange={(e) => setSettings({ ...settings, highPassHz: parseFloat(e.target.value) })}
                className="w-full accent-indigo-500"
              />
            </div>

            <div className="flex flex-col gap-1">
              <div className="flex justify-between text-xs text-slate-300">
                <span>Body Warmth (220 Hz)</span>
                <span className="font-mono text-indigo-400">+{settings.eqWarmthDb.toFixed(1)} dB</span>
              </div>
              <input
                type="range"
                min="0"
                max="3.5"
                step="0.1"
                value={settings.eqWarmthDb}
                onChange={(e) => setSettings({ ...settings, eqWarmthDb: parseFloat(e.target.value) })}
                className="w-full accent-indigo-500"
              />
            </div>

            <div className="flex flex-col gap-1">
              <div className="flex justify-between text-xs text-slate-300">
                <span>Presence / Clarity (3.2 kHz)</span>
                <span className="font-mono text-indigo-400">+{settings.eqPresenceDb.toFixed(1)} dB</span>
              </div>
              <input
                type="range"
                min="0"
                max="4.0"
                step="0.1"
                value={settings.eqPresenceDb}
                onChange={(e) => setSettings({ ...settings, eqPresenceDb: parseFloat(e.target.value) })}
                className="w-full accent-indigo-500"
              />
            </div>

            <div className="flex flex-col gap-1">
              <div className="flex justify-between text-xs text-slate-300">
                <span>De-Esser Sibilance (7.5 kHz)</span>
                <span className="font-mono text-indigo-400">{settings.eqDeEssDb.toFixed(1)} dB</span>
              </div>
              <input
                type="range"
                min="-4.0"
                max="0.0"
                step="0.2"
                value={settings.eqDeEssDb}
                onChange={(e) => setSettings({ ...settings, eqDeEssDb: parseFloat(e.target.value) })}
                className="w-full accent-indigo-500"
              />
            </div>
          </div>

          {/* DYNAMICS COMPRESSOR */}
          <div className="flex flex-col gap-3">
            <h4 className="text-xs font-mono uppercase text-indigo-400 font-bold border-b border-slate-800 pb-1.5 flex items-center gap-1.5">
              <Activity className="h-3.5 w-3.5" /> 2. Dynamic Compressor
            </h4>

            <div className="flex items-center justify-between text-xs text-slate-300">
              <span>Enable Compression</span>
              <input
                type="checkbox"
                checked={settings.enableCompressor}
                onChange={(e) => setSettings({ ...settings, enableCompressor: e.target.checked })}
                className="accent-indigo-500 h-4 w-4"
              />
            </div>

            <div className="flex flex-col gap-1">
              <div className="flex justify-between text-xs text-slate-300">
                <span>Compression Ratio</span>
                <span className="font-mono text-indigo-400">{settings.compressorRatio}:1</span>
              </div>
              <input
                type="range"
                min="1.5"
                max="4.0"
                step="0.1"
                value={settings.compressorRatio}
                onChange={(e) => setSettings({ ...settings, compressorRatio: parseFloat(e.target.value) })}
                className="w-full accent-indigo-500"
              />
            </div>

            <div className="flex flex-col gap-1">
              <div className="flex justify-between text-xs text-slate-300">
                <span>Noise Gate Threshold</span>
                <span className="font-mono text-indigo-400">{settings.noiseGateDb} dB</span>
              </div>
              <input
                type="range"
                min="-80"
                max="-50"
                step="2"
                value={settings.noiseGateDb}
                onChange={(e) => setSettings({ ...settings, noiseGateDb: parseInt(e.target.value) })}
                className="w-full accent-indigo-500"
              />
            </div>
          </div>

          {/* LOUDNORM & LIMITER */}
          <div className="flex flex-col gap-3">
            <h4 className="text-xs font-mono uppercase text-indigo-400 font-bold border-b border-slate-800 pb-1.5 flex items-center gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5" /> 3. ACX Loudnorm & Limiter
            </h4>

            <div className="flex flex-col gap-1">
              <div className="flex justify-between text-xs text-slate-300">
                <span>Target RMS Loudness</span>
                <span className="font-mono text-emerald-400">{settings.targetRms.toFixed(1)} dBFS</span>
              </div>
              <input
                type="range"
                min="-22.5"
                max="-18.5"
                step="0.5"
                value={settings.targetRms}
                onChange={(e) => setSettings({ ...settings, targetRms: parseFloat(e.target.value) })}
                className="w-full accent-emerald-500"
              />
            </div>

            <div className="flex flex-col gap-1">
              <div className="flex justify-between text-xs text-slate-300">
                <span>Peak Ceiling Limit</span>
                <span className="font-mono text-emerald-400">{settings.maxPeak.toFixed(1)} dBFS</span>
              </div>
              <input
                type="range"
                min="-4.0"
                max="-3.1"
                step="0.1"
                value={settings.maxPeak}
                onChange={(e) => setSettings({ ...settings, maxPeak: parseFloat(e.target.value) })}
                className="w-full accent-emerald-500"
              />
            </div>

            <div className="flex justify-between text-xs text-slate-400 mt-2">
              <span>Sample Rate:</span>
              <span className="font-mono text-slate-200">44,100 Hz (16-bit Mono)</span>
            </div>
          </div>
        </div>
      )}

      {/* A/B AUDITION PLAYER */}
      {currentAudioBase64 && (
        <div className="bg-slate-900/70 p-4 rounded-xl border border-slate-800 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono uppercase text-slate-400 font-bold">A/B Audition Deck:</span>
              
              <div className="flex items-center bg-slate-950 p-1 rounded-lg border border-slate-800">
                <button
                  onClick={() => setAbMode("mastered")}
                  className={`text-xs px-2.5 py-1 rounded font-semibold transition-all cursor-pointer ${
                    abMode === "mastered" ? "bg-emerald-600 text-white shadow" : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  Mastered (ACX)
                </button>
                <button
                  onClick={() => setAbMode("raw")}
                  className={`text-xs px-2.5 py-1 rounded font-semibold transition-all cursor-pointer ${
                    abMode === "raw" ? "bg-slate-700 text-white shadow" : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  Raw (TTS)
                </button>
              </div>
            </div>

            <div className="text-xs text-slate-400">
              {abMode === "mastered" ? "Hearing: ACX Mastered Audio" : "Hearing: Original Unprocessed Audio"}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleTogglePlay}
              className={`p-3 rounded-full text-white cursor-pointer shadow-md transition-all ${
                abMode === "mastered" ? "bg-emerald-600 hover:bg-emerald-500" : "bg-indigo-600 hover:bg-indigo-500"
              }`}
            >
              {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 ml-0.5" />}
            </button>

            <div className="flex-1 bg-slate-950 h-2.5 rounded-full overflow-hidden border border-slate-800 relative">
              <div
                className={`h-full transition-all duration-100 ${
                  abMode === "mastered" ? "bg-emerald-500" : "bg-indigo-500"
                }`}
                style={{ width: `${audioProgress}%` }}
              />
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
