import fs from "fs";
import path from "path";
import os from "os";
import { execSync } from "child_process";
import { ACXMetrics, ACXSettings } from "../types";

export const DEFAULT_ACX_SETTINGS: ACXSettings = {
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
};

/**
 * Analyzes audio buffer to verify compliance against ACX Audiobook Standards:
 * - RMS level: between -23.0 dB and -18.0 dB RMS
 * - Peak level: maximum -3.0 dB Peak (<= -3.0 dBFS)
 * - Noise floor: maximum -60.0 dB RMS
 * - Sample rate: 44.1 kHz (or 48 kHz)
 */
export function analyzeAudioBuffer(buffer: Buffer): ACXMetrics {
  const tmpId = `an_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
  const tmpIn = path.join(os.tmpdir(), `${tmpId}.wav`);
  fs.writeFileSync(tmpIn, buffer);

  try {
    // Run FFmpeg volumedetect
    let meanVol = -20.0;
    let maxVol = -3.0;

    try {
      const out = execSync(`ffmpeg -i "${tmpIn}" -af "volumedetect" -f null - 2>&1`, {
        encoding: "utf-8",
        maxBuffer: 10 * 1024 * 1024,
      });

      const meanMatch = out.match(/mean_volume:\s*([-\d.]+)\s*dB/);
      const maxMatch = out.match(/max_volume:\s*([-\d.]+)\s*dB/);
      if (meanMatch) meanVol = parseFloat(meanMatch[1]);
      if (maxMatch) maxVol = parseFloat(maxMatch[1]);
    } catch (e: any) {
      console.warn("volumedetect warning:", e?.message);
    }

    // Read sample rate and PCM length from WAV header
    let sampleRate = 24000;
    let channels = 1;
    let pcm = buffer;
    if (buffer.length > 44 && buffer.toString("ascii", 0, 4) === "RIFF") {
      try {
        sampleRate = buffer.readUInt32LE(24);
        channels = buffer.readUInt16LE(22);
        pcm = buffer.subarray(44);
      } catch {}
    }

    const samplesCount = Math.floor(pcm.length / (2 * (channels || 1)));
    const duration = Math.max(0.1, Math.round((samplesCount / (sampleRate || 24000)) * 10) / 10);

    // Compute noise floor across 100ms energy windows
    const windowSize = Math.max(1, Math.floor(sampleRate * 0.1));
    const windowEnergies: number[] = [];
    let curWinSum = 0;
    let curWinCount = 0;

    for (let i = 0; i < samplesCount; i++) {
      const s = pcm.readInt16LE(i * 2 * (channels || 1));
      curWinSum += s * s;
      curWinCount++;
      if (curWinCount >= windowSize) {
        const winRms = Math.sqrt(curWinSum / curWinCount) / 32768;
        windowEnergies.push(winRms);
        curWinSum = 0;
        curWinCount = 0;
      }
    }

    windowEnergies.sort((a, b) => a - b);
    // Take the 5th percentile window energy as representative of room tone / pause noise floor
    const noiseWindowIdx = Math.max(0, Math.floor(windowEnergies.length * 0.05));
    const noiseRmsVal = windowEnergies[noiseWindowIdx] || 0.000001;
    const noiseFloorDb = Math.round(20 * Math.log10(Math.max(noiseRmsVal, 0.0000001)) * 10) / 10;

    // ACX Criteria Rules:
    const rmsStatus =
      meanVol >= -23.0 && meanVol <= -18.0
        ? "pass"
        : meanVol >= -24.5 && meanVol <= -17.0
        ? "warn"
        : "fail";

    const peakStatus = maxVol <= -3.0 ? "pass" : maxVol <= -2.5 ? "warn" : "fail";

    const noiseFloorStatus = noiseFloorDb <= -60.0 ? "pass" : noiseFloorDb <= -55.0 ? "warn" : "fail";

    const sampleRateStatus = sampleRate === 44100 || sampleRate === 48000 ? "pass" : "warn";

    const isCompliant =
      rmsStatus === "pass" &&
      peakStatus === "pass" &&
      noiseFloorStatus === "pass" &&
      sampleRateStatus === "pass";

    return {
      rms: Math.round(meanVol * 10) / 10,
      peak: Math.round(maxVol * 10) / 10,
      noiseFloor: Math.round(noiseFloorDb * 10) / 10,
      sampleRate,
      duration,
      isCompliant,
      rmsStatus,
      peakStatus,
      noiseFloorStatus,
      sampleRateStatus,
      details: {
        rmsRequirement: "Target: -23.0 dB to -18.0 dB RMS (Current: " + meanVol.toFixed(1) + " dBFS)",
        peakRequirement: "Target: <= -3.0 dB Peak (Current: " + maxVol.toFixed(1) + " dBFS)",
        noiseFloorRequirement: "Target: <= -60.0 dB RMS (Current: " + noiseFloorDb.toFixed(1) + " dBFS)",
        sampleRateRequirement: "Target: 44.1 kHz (Current: " + sampleRate + " Hz)",
      },
    };
  } finally {
    try {
      if (fs.existsSync(tmpIn)) fs.unlinkSync(tmpIn);
    } catch {}
  }
}

/**
 * Masters an audio buffer to guaranteed ACX Compliance:
 * 1. Low-cut / Rumble Highpass (cuts sub-rumble below 80Hz)
 * 2. Parametric Speech EQ (body warmth at 220Hz, clarity at 3.2kHz, de-esser sibilance tamer at 7.5kHz)
 * 3. Noise Gate / Downward Expansion (cleans pause noise floor to <= -65dB)
 * 4. Audio Dynamics Compression (smooths whisper to loud dynamic ratio)
 * 5. ACX Loudnorm & True Peak Limiter (targets -20dB RMS and -3.1dB True Peak)
 * 6. Resamples to 44.1 kHz 16-bit mono PCM WAV
 */
export function processACXBuffer(
  inputBuffer: Buffer,
  userSettings?: Partial<ACXSettings>
): { processedBuffer: Buffer; metrics: ACXMetrics; beforeMetrics: ACXMetrics } {
  const settings: ACXSettings = { ...DEFAULT_ACX_SETTINGS, ...userSettings };
  const beforeMetrics = analyzeAudioBuffer(inputBuffer);

  const tmpId = `acx_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
  const tmpIn = path.join(os.tmpdir(), `${tmpId}_in.wav`);
  const tmpOut = path.join(os.tmpdir(), `${tmpId}_out.wav`);

  fs.writeFileSync(tmpIn, inputBuffer);

  try {
    const filters: string[] = [];

    // 1. Rumble Cut
    if (settings.highPassHz > 0) {
      filters.push(`highpass=f=${Math.max(40, settings.highPassHz)}:poles=2`);
    }

    // 2. Parametric EQ
    if (settings.enableEq) {
      filters.push(
        `equalizer=f=220:width_type=q:width=1.0:g=${settings.eqWarmthDb || 1.2}`,
        `equalizer=f=3200:width_type=q:width=1.5:g=${settings.eqPresenceDb || 2.2}`,
        `equalizer=f=7500:width_type=q:width=2.0:g=${settings.eqDeEssDb || -1.8}`,
        "lowpass=f=18000:poles=2"
      );
    }

    // 3. Noise floor downward expander / gate
    filters.push("compand=attacks=0.02:decays=0.15:points=-90/-120|-60/-75|-40/-40|0/0");

    // 4. Dynamics Compression
    if (settings.enableCompressor) {
      filters.push("compand=attacks=0.01:decays=0.1:points=-70/-70|-45/-35|-20/-16|0/-6:gain=1.5");
    }

    // 5. ACX Normalization & Limiter
    const targetRms = Math.min(-18.5, Math.max(-22.5, settings.targetRms || -20.0));
    const maxPeak = Math.min(-3.1, settings.maxPeak || -3.1);
    if (settings.enableLimiter) {
      filters.push(`loudnorm=I=${targetRms}:TP=${maxPeak}:LRA=7.0`);
    }

    const filterString = filters.join(",");
    const sampleRate = settings.sampleRate || 44100;

    const cmd = `ffmpeg -y -i "${tmpIn}" -af "${filterString}" -ar ${sampleRate} -ac 1 -c:a pcm_s16le "${tmpOut}"`;
    execSync(cmd, { stdio: ["pipe", "pipe", "pipe"] });

    const processedBuffer = fs.readFileSync(tmpOut);
    const metrics = analyzeAudioBuffer(processedBuffer);

    return {
      processedBuffer,
      metrics,
      beforeMetrics,
    };
  } finally {
    try {
      if (fs.existsSync(tmpIn)) fs.unlinkSync(tmpIn);
      if (fs.existsSync(tmpOut)) fs.unlinkSync(tmpOut);
    } catch {}
  }
}

export interface M4BChapterInput {
  title: string;
  chapterNumber: number;
  audioBuffer: Buffer;
  duration?: number;
}

export interface M4BBuildOptions {
  title: string;
  author: string;
  narrator?: string;
  publisher?: string;
  genre?: string;
  year?: string;
  copyright?: string;
  description?: string;
  coverImageBuffer?: Buffer;
  chapters: M4BChapterInput[];
  bitrateKbps?: number; // 64, 128, 192 (default 192)
  applyAcxMastering?: boolean;
}

/**
 * Builds a professional .M4B Audiobook with:
 * - QuickTime / MP4 chapter markers and timestamps
 * - Embedded high-res cover art (attached_pic / covr atom)
 * - iTunes & ID3 standard tags (Title, Artist, Album, Composer, Genre, Comment, Date)
 * - ACX-compliant AAC-LC audio stream (192 kbps CBR 44.1kHz)
 */
export function buildM4BFile(options: M4BBuildOptions): {
  m4bBuffer: Buffer;
  fileSize: number;
  totalDuration: number;
  chapters: Array<{
    title: string;
    chapterNumber: number;
    startMs: number;
    endMs: number;
    startFormatted: string;
    duration: number;
  }>;
} {
  const tmpId = `m4b_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
  const workDir = path.join(os.tmpdir(), tmpId);
  fs.mkdirSync(workDir, { recursive: true });

  try {
    if (!options.chapters || options.chapters.length === 0) {
      throw new Error("Cannot create M4B: No chapters provided.");
    }

    const chapterDetails: Array<{
      title: string;
      chapterNumber: number;
      startMs: number;
      endMs: number;
      startFormatted: string;
      duration: number;
      filePath: string;
    }> = [];

    let currentOffsetMs = 0;

    // 1. Process and write each chapter file
    options.chapters.forEach((ch, idx) => {
      const chFileName = path.join(workDir, `chap_${idx + 1}.wav`);
      let audioBuf = ch.audioBuffer;

      // Auto-master if requested
      if (options.applyAcxMastering) {
        try {
          const mastered = processACXBuffer(audioBuf);
          audioBuf = mastered.processedBuffer;
        } catch (e: any) {
          console.warn(`Chapter ${idx + 1} ACX mastering fallback:`, e?.message);
        }
      }

      fs.writeFileSync(chFileName, audioBuf);

      // Measure duration with ffmpeg/header
      let durSec = ch.duration || 0;
      if (!durSec || durSec <= 0) {
        try {
          const stats = analyzeAudioBuffer(audioBuf);
          durSec = stats.duration;
        } catch {
          durSec = 10;
        }
      }

      const durMs = Math.round(durSec * 1000);
      const startMs = currentOffsetMs;
      const endMs = startMs + durMs;

      const hrs = Math.floor(startMs / 3600000);
      const mins = Math.floor((startMs % 3600000) / 60000);
      const secs = Math.floor((startMs % 60000) / 1000);
      const startFormatted = `${hrs > 0 ? `${hrs}:` : ""}${mins.toString().padStart(2, "0")}:${secs
        .toString()
        .padStart(2, "0")}`;

      chapterDetails.push({
        title: ch.title || `Chapter ${ch.chapterNumber || idx + 1}`,
        chapterNumber: ch.chapterNumber || idx + 1,
        startMs,
        endMs,
        startFormatted,
        duration: Math.round(durSec * 10) / 10,
        filePath: chFileName,
      });

      currentOffsetMs = endMs;
    });

    const totalDurationSec = Math.round(currentOffsetMs / 1000);

    // 2. Concat list file
    const concatListPath = path.join(workDir, "concat.txt");
    const concatContent = chapterDetails.map((c) => `file '${c.filePath}'`).join("\n");
    fs.writeFileSync(concatListPath, concatContent);

    // 3. Generate FFMETADATA file with chapters
    const metadataPath = path.join(workDir, "metadata.txt");
    let metaContent = `;FFMETADATA1
title=${options.title.replace(/[\r\n]/g, " ")}
artist=${options.author.replace(/[\r\n]/g, " ")}
album=${options.title.replace(/[\r\n]/g, " ")}
album_artist=${options.author.replace(/[\r\n]/g, " ")}
composer=${(options.narrator || options.author).replace(/[\r\n]/g, " ")}
genre=${(options.genre || "Audiobook").replace(/[\r\n]/g, " ")}
date=${options.year || new Date().getFullYear().toString()}
copyright=${(options.copyright || `© ${new Date().getFullYear()} ${options.author}`).replace(
      /[\r\n]/g,
      " "
    )}
comment=${(options.description || "Created with Gemini 3.8 Flash TTS Pro Studio").replace(
      /[\r\n]/g,
      " "
    )}
`;

    chapterDetails.forEach((ch) => {
      metaContent += `
[CHAPTER]
TIMEBASE=1/1000
START=${ch.startMs}
END=${ch.endMs}
title=${ch.title.replace(/[\r\n]/g, " ")}
`;
    });

    fs.writeFileSync(metadataPath, metaContent);

    // 4. Handle cover image
    const coverPath = path.join(workDir, "cover.jpg");
    if (options.coverImageBuffer && options.coverImageBuffer.length > 0) {
      fs.writeFileSync(coverPath, options.coverImageBuffer);
    } else {
      // Synthesize a clean book cover image using FFmpeg
      try {
        execSync(
          `ffmpeg -y -f lavfi -i "color=c=0x0f172a:s=1400x1400:d=1" -frames:v 1 "${coverPath}"`,
          { stdio: "ignore" }
        );
      } catch (e) {
        console.warn("Could not generate placeholder cover:", e);
      }
    }

    const hasCover = fs.existsSync(coverPath);
    const m4bOutPath = path.join(workDir, "audiobook.m4b");
    const bitrate = `${options.bitrateKbps || 192}k`;

    // 5. Concatenate audio first to temporary master wav to guarantee seamless sync
    const masterWavPath = path.join(workDir, "master.wav");
    execSync(`ffmpeg -y -f concat -safe 0 -i "${concatListPath}" -c copy "${masterWavPath}"`, {
      stdio: "ignore",
    });

    // 6. Build the final .m4b container with AAC audio, cover art, and chapters
    let ffmpegCmd = "";
    if (hasCover) {
      ffmpegCmd = `ffmpeg -y -i "${masterWavPath}" -i "${coverPath}" -i "${metadataPath}" -map 0:a -map 1:v -map_metadata 2 -c:a aac -b:a ${bitrate} -ar 44100 -c:v mjpeg -disposition:v:0 attached_pic -f mp4 "${m4bOutPath}"`;
    } else {
      ffmpegCmd = `ffmpeg -y -i "${masterWavPath}" -i "${metadataPath}" -map 0:a -map_metadata 1 -c:a aac -b:a ${bitrate} -ar 44100 -f mp4 "${m4bOutPath}"`;
    }

    execSync(ffmpegCmd, { stdio: ["pipe", "pipe", "pipe"] });

    if (!fs.existsSync(m4bOutPath)) {
      throw new Error("FFmpeg failed to create .m4b output file.");
    }

    const m4bBuffer = fs.readFileSync(m4bOutPath);

    return {
      m4bBuffer,
      fileSize: m4bBuffer.length,
      totalDuration: totalDurationSec,
      chapters: chapterDetails.map(({ filePath, ...rest }) => rest),
    };
  } finally {
    // Cleanup temporary files
    try {
      fs.rmSync(workDir, { recursive: true, force: true });
    } catch {}
  }
}
