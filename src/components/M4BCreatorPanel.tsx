import React, { useState, useRef, useEffect } from "react";
import {
  Headphones,
  Disc,
  Upload,
  Image,
  Download,
  FolderDown,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Play,
  Pause,
  ListOrdered,
  Layers,
  ShieldCheck,
  RefreshCw,
  Clock,
  BookOpen
} from "lucide-react";
import { AudiobookProject, AudiobookChapter } from "../types";

interface M4BCreatorPanelProps {
  project: AudiobookProject;
  onUpdateProject: (updated: AudiobookProject) => void;
  onSwitchToTab: (tab: "import" | "director" | "acx" | "m4b" | "cast") => void;
}

export function M4BCreatorPanel({
  project,
  onUpdateProject,
  onSwitchToTab
}: M4BCreatorPanelProps) {
  const [coverPreview, setCoverPreview] = useState<string>(project.coverImageBase64 || "");
  const [narrator, setNarrator] = useState<string>(project.narratorName || "Gemini 3.8 Flash TTS");
  const [publisher, setPublisher] = useState<string>(project.publisher || "Studio Master Audiobooks");
  const [genre, setGenre] = useState<string>(project.genre || "Fiction");
  const [year, setYear] = useState<string>(project.year || new Date().getFullYear().toString());
  const [copyright, setCopyright] = useState<string>(
    project.copyright || `© ${new Date().getFullYear()} ${project.author || "Author"}`
  );
  const [description, setDescription] = useState<string>(
    project.description || `${project.title} by ${project.author}. Complete unabridged audiobook edition.`
  );
  const [bitrateKbps, setBitrateKbps] = useState<number>(192);
  const [applyAcxMastering, setApplyAcxMastering] = useState<boolean>(true);

  const [isBuilding, setIsBuilding] = useState<boolean>(false);
  const [buildError, setBuildError] = useState<string | null>(null);

  // M4B Playback State
  const [isPlayingM4B, setIsPlayingM4B] = useState<boolean>(false);
  const [currentM4BTime, setCurrentM4BTime] = useState<number>(0);
  const [m4bDuration, setM4bDuration] = useState<number>(0);
  const [selectedChapterNav, setSelectedChapterNav] = useState<number>(0);
  const m4bAudioRef = useRef<HTMLAudioElement | null>(null);
  const m4bIntervalRef = useRef<any>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Chapters with audio
  const compiledChapters = project.chapters.filter(c => c.compiledAudioBase64);
  const uncompiledCount = project.chapters.length - compiledChapters.length;

  // Compute chapter markers for preview
  let totalTimeMs = 0;
  const chapterTimeline = project.chapters.map((ch, idx) => {
    const durSec = ch.compiledDuration || 180;
    const durMs = durSec * 1000;
    const startMs = totalTimeMs;
    const endMs = startMs + durMs;
    totalTimeMs = endMs;

    const startSec = Math.floor(startMs / 1000);
    const startMin = Math.floor(startSec / 60);
    const startSecRem = startSec % 60;
    const timeFormatted = `${startMin.toString().padStart(2, "0")}:${startSecRem.toString().padStart(2, "0")}`;

    return {
      index: idx + 1,
      title: ch.title || `Chapter ${idx + 1}`,
      duration: durSec,
      startTimeFormatted: timeFormatted,
      startSeconds: startSec,
      hasAudio: !!ch.compiledAudioBase64,
      isAcx: !!ch.isAcxProcessed || ch.acxMetrics?.isCompliant,
    };
  });

  // Handle Cover Art Upload
  const handleCoverUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result as string;
      setCoverPreview(result);
      onUpdateProject({
        ...project,
        coverImageBase64: result,
      });
    };
    reader.readAsDataURL(file);
  };

  // Generate Sample Art on Canvas
  const handleGenerateSampleArt = () => {
    const canvas = document.createElement("canvas");
    canvas.width = 1400;
    canvas.height = 1400;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Gradient Background
    const grad = ctx.createLinearGradient(0, 0, 1400, 1400);
    grad.addColorStop(0, "#0f172a");
    grad.addColorStop(0.5, "#312e81");
    grad.addColorStop(1, "#1e1b4b");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 1400, 1400);

    // Decorative geometric ring
    ctx.strokeStyle = "rgba(99, 102, 241, 0.25)";
    ctx.lineWidth = 14;
    ctx.beginPath();
    ctx.arc(700, 650, 420, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = "rgba(168, 85, 247, 0.4)";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(700, 650, 460, 0, Math.PI * 2);
    ctx.stroke();

    // Top Brand Tag
    ctx.fillStyle = "#818cf8";
    ctx.font = "bold 32px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("UNABRIDGED AUDIOBOOK", 700, 220);

    // Book Title
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 78px serif";
    const words = project.title.split(" ");
    let line = "";
    let y = 580;
    for (let n = 0; n < words.length; n++) {
      const testLine = line + words[n] + " ";
      const metrics = ctx.measureText(testLine);
      if (metrics.width > 1100 && n > 0) {
        ctx.fillText(line.trim(), 700, y);
        line = words[n] + " ";
        y += 90;
      } else {
        line = testLine;
      }
    }
    ctx.fillText(line.trim(), 700, y);

    // Author
    ctx.fillStyle = "#c084fc";
    ctx.font = "italic 44px sans-serif";
    ctx.fillText(`by ${project.author}`, 700, y + 100);

    // Bottom Badge
    ctx.fillStyle = "#38bdf8";
    ctx.font = "bold 28px monospace";
    ctx.fillText("STUDIO PRO M4B • GEMINI 3.8 FLASH TTS", 700, 1260);

    const generatedUrl = canvas.toDataURL("image/jpeg", 0.92);
    setCoverPreview(generatedUrl);
    onUpdateProject({
      ...project,
      coverImageBase64: generatedUrl,
    });
  };

  // Build M4B File
  const handleBuildM4B = async () => {
    if (compiledChapters.length === 0) {
      alert("Please compile at least one chapter before building the M4B audiobook.");
      return;
    }

    setIsBuilding(true);
    setBuildError(null);

    try {
      const payload = {
        title: project.title,
        author: project.author,
        narrator,
        publisher,
        genre,
        year,
        copyright,
        description,
        coverImageBase64: coverPreview,
        bitrateKbps,
        applyAcxMastering,
        chapters: compiledChapters.map((ch) => ({
          title: ch.title,
          chapterNumber: ch.chapterNumber,
          audioBase64: ch.compiledAudioBase64,
          duration: ch.compiledDuration,
        })),
      };

      const res = await fetch("/api/audiobook/create-m4b", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to build M4B audiobook");
      }

      const data = await res.json();
      if (!data.m4bBase64) throw new Error("No M4B audio data returned");

      onUpdateProject({
        ...project,
        narratorName: narrator,
        publisher,
        genre,
        year,
        copyright,
        description,
        compiledM4BBase64: data.m4bBase64,
        compiledM4BSize: data.fileSize,
        compiledM4BDuration: data.totalDuration,
        compiledM4BChapters: data.chapters,
      });
    } catch (e: any) {
      setBuildError(e.message || "Failed to build M4B audiobook");
    } finally {
      setIsBuilding(false);
    }
  };

  // Download M4B
  const handleDownloadM4B = () => {
    if (!project.compiledM4BBase64) return;
    const binary = atob(project.compiledM4BBase64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const blob = new Blob([bytes], { type: "audio/mp4" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${project.title.toLowerCase().replace(/[^a-z0-9]+/g, "_")}.m4b`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // M4B Playback Controls
  const handleTogglePlayM4B = () => {
    if (!project.compiledM4BBase64) return;

    if (isPlayingM4B && m4bAudioRef.current) {
      m4bAudioRef.current.pause();
      setIsPlayingM4B(false);
      if (m4bIntervalRef.current) clearInterval(m4bIntervalRef.current);
      return;
    }

    if (m4bAudioRef.current) m4bAudioRef.current.pause();
    if (m4bIntervalRef.current) clearInterval(m4bIntervalRef.current);

    const binary = atob(project.compiledM4BBase64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const blob = new Blob([bytes], { type: "audio/mp4" });
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    m4bAudioRef.current = audio;

    audio.currentTime = currentM4BTime;
    audio.play().catch((e) => console.warn(e));
    setIsPlayingM4B(true);

    audio.onloadedmetadata = () => {
      setM4bDuration(audio.duration || project.compiledM4BDuration || 0);
    };

    audio.onended = () => {
      setIsPlayingM4B(false);
      setCurrentM4BTime(0);
      if (m4bIntervalRef.current) clearInterval(m4bIntervalRef.current);
    };

    m4bIntervalRef.current = setInterval(() => {
      if (audio) {
        setCurrentM4BTime(audio.currentTime);
      }
    }, 250);
  };

  // Seek to specific chapter
  const handleSeekChapter = (startSec: number, chapterIdx: number) => {
    setSelectedChapterNav(chapterIdx);
    setCurrentM4BTime(startSec);
    if (m4bAudioRef.current) {
      m4bAudioRef.current.currentTime = startSec;
      if (!isPlayingM4B) {
        m4bAudioRef.current.play().then(() => setIsPlayingM4B(true)).catch(() => {});
      }
    }
  };

  return (
    <div className="flex flex-col gap-6 bg-slate-950/40 p-6 rounded-xl border border-slate-800">
      
      {/* HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <h3 className="text-base font-bold text-white flex items-center gap-2 font-mono uppercase tracking-wider">
            <Headphones className="h-5 w-5 text-indigo-400" />
            Pro M4B Creator & Chapter Packaging
          </h3>
          <p className="text-xs text-slate-400 mt-1">
            Build distribution-ready MPEG-4 (.m4b) audiobooks with embedded cover art, QuickTime chapter markers, and ACX-grade AAC audio.
          </p>
        </div>

        {project.compiledM4BBase64 && (
          <button
            onClick={handleDownloadM4B}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-lg flex items-center gap-1.5 shadow-lg shadow-emerald-600/20 cursor-pointer self-start sm:self-auto"
          >
            <Download className="h-4 w-4" /> Download .M4B File ({((project.compiledM4BSize || 0) / 1024 / 1024).toFixed(1)} MB)
          </button>
        )}
      </div>

      {/* WARNING IF CHAPTERS UNCOMPILED */}
      {uncompiledCount > 0 && (
        <div className="bg-amber-500/10 border border-amber-500/30 p-3 rounded-lg flex items-center justify-between gap-3 text-xs text-amber-300">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0 text-amber-400" />
            <span>
              {uncompiledCount} of {project.chapters.length} chapters have not been compiled into master audio yet.
            </span>
          </div>
          <button
            onClick={() => onSwitchToTab("director")}
            className="text-xs font-bold text-amber-400 hover:underline cursor-pointer"
          >
            Go to Review Deck &rarr;
          </button>
        </div>
      )}

      {/* ERROR BANNER */}
      {buildError && (
        <div className="bg-red-500/10 border border-red-500/30 p-3 rounded-lg text-xs text-red-300 flex items-center gap-2">
          <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
          <span>{buildError}</span>
        </div>
      )}

      {/* GRID: COVER ART + METADATA */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* COLUMN 1: COVER ART STUDIO */}
        <div className="bg-slate-900/70 p-5 rounded-xl border border-slate-800 flex flex-col items-center justify-between gap-4">
          <div className="w-full text-center">
            <span className="text-xs font-mono uppercase text-slate-400 font-bold block mb-2">
              Book Cover Art (1:1 Ratio)
            </span>
            
            {/* Cover Card Preview */}
            <div className="relative mx-auto w-56 h-56 rounded-xl overflow-hidden shadow-2xl shadow-indigo-950/60 border-2 border-slate-700 bg-slate-950 flex items-center justify-center group">
              {coverPreview ? (
                <img
                  src={coverPreview}
                  alt="Book Cover"
                  className="w-full h-full object-cover group-hover:scale-105 transition-all duration-300"
                />
              ) : (
                <div className="flex flex-col items-center gap-2 text-slate-600 p-4 text-center">
                  <Image className="h-10 w-10 stroke-[1.5]" />
                  <span className="text-xs">No Cover Image</span>
                </div>
              )}

              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end justify-center p-3">
                <span className="text-[11px] text-white font-semibold">Square Format • 1400x1400+</span>
              </div>
            </div>
          </div>

          {/* Cover Art Actions */}
          <div className="w-full flex flex-col gap-2">
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleCoverUpload}
              accept="image/png, image/jpeg, image/webp"
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Upload className="h-3.5 w-3.5 text-indigo-400" /> Upload Custom Cover (JPG/PNG)
            </button>

            <button
              onClick={handleGenerateSampleArt}
              className="w-full py-2 bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Sparkles className="h-3.5 w-3.5 text-indigo-400" /> Auto-Generate Studio Cover Art
            </button>
          </div>
        </div>

        {/* COLUMNS 2 & 3: AUDIOBOOK METADATA & ENCODING SETTINGS */}
        <div className="lg:col-span-2 bg-slate-900/70 p-5 rounded-xl border border-slate-800 flex flex-col gap-4">
          <span className="text-xs font-mono uppercase text-slate-400 font-bold border-b border-slate-800 pb-2 flex items-center gap-2">
            <Disc className="h-4 w-4 text-purple-400" /> Distribution Metadata & ID3 Tags
          </span>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-semibold text-slate-400">Audiobook Title</label>
              <input
                type="text"
                value={project.title}
                onChange={(e) => onUpdateProject({ ...project, title: e.target.value })}
                className="bg-slate-950 border border-slate-800 rounded px-3 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-semibold text-slate-400">Author</label>
              <input
                type="text"
                value={project.author}
                onChange={(e) => onUpdateProject({ ...project, author: e.target.value })}
                className="bg-slate-950 border border-slate-800 rounded px-3 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-semibold text-slate-400">Narrator / Performer</label>
              <input
                type="text"
                value={narrator}
                onChange={(e) => setNarrator(e.target.value)}
                className="bg-slate-950 border border-slate-800 rounded px-3 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-semibold text-slate-400">Genre</label>
              <select
                value={genre}
                onChange={(e) => setGenre(e.target.value)}
                className="bg-slate-950 border border-slate-800 rounded px-3 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500"
              >
                <option value="Audiobook">General Audiobook</option>
                <option value="Fiction">Fiction</option>
                <option value="Classics">Classics</option>
                <option value="Sci-Fi & Fantasy">Sci-Fi &amp; Fantasy</option>
                <option value="Mystery & Thriller">Mystery &amp; Thriller</option>
                <option value="Non-Fiction">Non-Fiction</option>
                <option value="Biography">Biography</option>
                <option value="Self-Help">Self-Help</option>
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-semibold text-slate-400">Publisher</label>
              <input
                type="text"
                value={publisher}
                onChange={(e) => setPublisher(e.target.value)}
                className="bg-slate-950 border border-slate-800 rounded px-3 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-semibold text-slate-400">Copyright / Year</label>
              <input
                type="text"
                value={copyright}
                onChange={(e) => setCopyright(e.target.value)}
                className="bg-slate-950 border border-slate-800 rounded px-3 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-semibold text-slate-400">Description / Book Blurb</label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded p-2 text-xs text-white focus:outline-none focus:border-indigo-500 resize-none"
            />
          </div>

          {/* AUDIO QUALITY & MASTERING OPTIONS */}
          <div className="flex flex-wrap items-center justify-between gap-4 border-t border-slate-800 pt-3">
            <div className="flex items-center gap-4 text-xs">
              <div className="flex items-center gap-2">
                <span className="text-slate-400">AAC Bitrate:</span>
                <select
                  value={bitrateKbps}
                  onChange={(e) => setBitrateKbps(parseInt(e.target.value))}
                  className="bg-slate-950 border border-slate-800 rounded px-2.5 py-1 text-white font-mono"
                >
                  <option value={192}>192 kbps (Audible ACX Standard)</option>
                  <option value={128}>128 kbps (Standard Quality)</option>
                  <option value={64}>64 kbps (Voice Lightweight)</option>
                </select>
              </div>

              <label className="flex items-center gap-1.5 cursor-pointer text-slate-300">
                <input
                  type="checkbox"
                  checked={applyAcxMastering}
                  onChange={(e) => setApplyAcxMastering(e.target.checked)}
                  className="accent-emerald-500 h-4 w-4"
                />
                <span>Auto-Master for ACX during compilation</span>
              </label>
            </div>

            <button
              onClick={handleBuildM4B}
              disabled={isBuilding || compiledChapters.length === 0}
              className="px-6 py-2.5 bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 hover:from-indigo-500 hover:to-pink-500 text-white font-bold text-xs rounded-lg flex items-center gap-2 shadow-lg shadow-indigo-600/25 transition-all cursor-pointer disabled:opacity-50"
            >
              <Headphones className={`h-4 w-4 ${isBuilding ? "animate-spin" : ""}`} />
              {isBuilding ? "Compiling M4B File..." : "🎧 Build Pro M4B Audiobook"}
            </button>
          </div>
        </div>
      </div>

      {/* CHAPTER TIMELINE & MARKER LIST */}
      <div className="bg-slate-900/60 p-5 rounded-xl border border-slate-800 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-mono uppercase text-slate-400 font-bold flex items-center gap-2">
            <ListOrdered className="h-4 w-4 text-indigo-400" /> Embedded Chapter Markers ({chapterTimeline.length})
          </span>
          <span className="text-xs text-indigo-400 font-mono font-semibold">
            Total Duration: {Math.floor(totalTimeMs / 60000)}m {Math.round((totalTimeMs % 60000) / 1000)}s
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-950/60 text-slate-400 font-mono uppercase text-[10px] border-b border-slate-800">
              <tr>
                <th className="py-2.5 px-3">#</th>
                <th className="py-2.5 px-3">Chapter Title</th>
                <th className="py-2.5 px-3">Start Time</th>
                <th className="py-2.5 px-3">Duration</th>
                <th className="py-2.5 px-3">ACX Status</th>
                <th className="py-2.5 px-3">Audio Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-sans">
              {chapterTimeline.map((ch, idx) => (
                <tr key={idx} className="hover:bg-slate-800/40 transition-colors">
                  <td className="py-2.5 px-3 font-mono text-slate-500">{ch.index}</td>
                  <td className="py-2.5 px-3 font-medium text-white">{ch.title}</td>
                  <td className="py-2.5 px-3 font-mono text-indigo-300">{ch.startTimeFormatted}</td>
                  <td className="py-2.5 px-3 font-mono text-slate-400">{Math.round(ch.duration)}s</td>
                  <td className="py-2.5 px-3">
                    {ch.isAcx ? (
                      <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded">
                        ✓ ACX Pass
                      </span>
                    ) : (
                      <span className="text-[10px] font-mono text-slate-500">Unchecked</span>
                    )}
                  </td>
                  <td className="py-2.5 px-3">
                    {ch.hasAudio ? (
                      <span className="text-[10px] text-emerald-400 font-semibold">Compiled</span>
                    ) : (
                      <span className="text-[10px] text-amber-400 font-semibold">Needs Compilation</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* BUILT-IN M4B PLAYER */}
      {project.compiledM4BBase64 && (
        <div className="bg-gradient-to-br from-indigo-950/60 to-slate-900/90 p-5 rounded-xl border border-indigo-500/30 flex flex-col gap-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              {coverPreview && (
                <img src={coverPreview} alt="Cover" className="w-12 h-12 rounded-lg object-cover shadow border border-slate-700" />
              )}
              <div>
                <h4 className="text-sm font-bold text-white">{project.title}</h4>
                <p className="text-xs text-indigo-300 font-mono">
                  M4B Audiobook • {project.chapters.length} Chapters • {((project.compiledM4BSize || 0) / 1024 / 1024).toFixed(1)} MB
                </p>
              </div>
            </div>

            {/* Chapter Jump Selector */}
            <div className="flex items-center gap-2 text-xs">
              <span className="text-slate-400">Jump to Chapter:</span>
              <select
                value={selectedChapterNav}
                onChange={(e) => {
                  const idx = parseInt(e.target.value);
                  const ch = chapterTimeline[idx];
                  if (ch) handleSeekChapter(ch.startSeconds, idx);
                }}
                className="bg-slate-950 border border-slate-800 rounded px-3 py-1.5 text-white font-medium focus:outline-none focus:border-indigo-500"
              >
                {chapterTimeline.map((ch, idx) => (
                  <option key={idx} value={idx}>
                    {ch.title} ({ch.startTimeFormatted})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleTogglePlayM4B}
              className="p-3.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-full shadow-lg shadow-indigo-600/30 cursor-pointer transition-all"
            >
              {isPlayingM4B ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5 ml-0.5" />}
            </button>

            <div className="flex-1 flex flex-col gap-1">
              <div className="flex justify-between text-[11px] font-mono text-slate-400">
                <span>
                  {Math.floor(currentM4BTime / 60)}:{(Math.floor(currentM4BTime % 60)).toString().padStart(2, "0")}
                </span>
                <span>
                  {Math.floor(m4bDuration / 60)}:{(Math.floor(m4bDuration % 60)).toString().padStart(2, "0")}
                </span>
              </div>
              <div
                className="h-2 bg-slate-950 rounded-full overflow-hidden border border-slate-800 cursor-pointer relative"
                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const pct = (e.clientX - rect.left) / rect.width;
                  const newTime = pct * m4bDuration;
                  setCurrentM4BTime(newTime);
                  if (m4bAudioRef.current) m4bAudioRef.current.currentTime = newTime;
                }}
              >
                <div
                  className="h-full bg-gradient-to-r from-indigo-500 to-purple-500"
                  style={{ width: `${m4bDuration > 0 ? (currentM4BTime / m4bDuration) * 100 : 0}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
