export interface TrainingPrompt {
  id: string;
  text: string;
  emotion: string;
  focus: string;
}

export interface VoiceModel {
  id: string;
  name: string;
  description: string;
  gender: string;
  accent: string;
  baseVoice: "Puck" | "Charon" | "Kore" | "Fenrir" | "Aoede" | "Zephyr" | string;
  styleGuidance: string; // Direct performance direction for speechMetadata.style
  pitch: string; // Low, Medium-Low, Medium, Medium-High, High
  speed: number; // e.g. 1.0 (standard native)
  narrationStyle: string;
  trainingPrompts: TrainingPrompt[];
  createdAt: string;
}

export interface AudioClip {
  id: string;
  modelId: string;
  promptId?: string;
  title?: string;
  text: string;
  baseVoice: string;
  styleApplied?: string;
  pitch?: string;
  speed: number;
  duration: number; // in seconds
  audioBase64: string; // WAV base64 string
  createdAt: string;
  mode?: "single" | "dialogue" | "audiobook";
  speaker2Voice?: string;
}

export interface DialogueLine {
  id: string;
  speaker: string;
  text: string;
  style?: string;
}

// --- LoRA Training & Dataset Studio Interfaces ---

export interface LoRATrainingConfig {
  framework: "xtts_v2" | "f5_tts" | "styletts2" | "huggingface_ljspeech";
  loraRank: number; // 8, 16, 32, 64
  loraAlpha: number; // 16, 32, 64
  learningRate: string; // e.g. "5e-5"
  batchSize: number; // e.g. 4
  epochs: number; // e.g. 50
  trainValSplit: number; // e.g. 0.9 (90% train, 10% val)
  metadataDelimiter: string; // "|" or "," or "\t"
  normalizeRms: boolean;
}

// --- Professional Audiobook Creator & ACX Compliance Interfaces ---

export interface ACXMetrics {
  rms: number; // dBFS (target: -23.0 to -18.0)
  peak: number; // dBFS (target: <= -3.0)
  noiseFloor: number; // dBFS (target: <= -60.0)
  sampleRate: number; // Hz (target: 44100 or 48000)
  duration: number; // seconds
  isCompliant: boolean;
  rmsStatus: "pass" | "warn" | "fail";
  peakStatus: "pass" | "warn" | "fail";
  noiseFloorStatus: "pass" | "warn" | "fail";
  sampleRateStatus: "pass" | "warn" | "fail";
  details?: Record<string, string>;
}

export interface ACXSettings {
  targetRms: number; // default -20.0
  maxPeak: number; // default -3.1
  highPassHz: number; // default 80
  noiseGateDb: number; // default -65
  enableEq: boolean; // default true
  eqWarmthDb: number; // default 1.2
  eqPresenceDb: number; // default 2.2
  eqDeEssDb: number; // default -1.8
  enableCompressor: boolean; // default true
  compressorRatio: number; // default 2.5
  enableLimiter: boolean; // default true
  sampleRate: number; // default 44100
  bitrateKbps: number; // default 192
}

export interface AudiobookCharacter {
  id: string;
  name: string;
  gender: string;
  baseVoice: "Puck" | "Charon" | "Kore" | "Fenrir" | "Aoede" | "Zephyr" | string;
  accent: string;
  styleGuidance: string;
}

export interface AudiobookChunk {
  id: string;
  index: number;
  text: string;
  speaker: string; // e.g. "Narrator", "Holmes", "Watson"
  characterId?: string;
  baseVoice: string; // Puck, Charon, Kore, Fenrir, Aoede, Zephyr
  styleGuidance: string; // Acting direction for speechMetadata.style
  status: "pending" | "rendering" | "ready" | "approved" | "error";
  audioBase64?: string;
  rawAudioBase64?: string; // preserve original before ACX mastering
  duration?: number;
  error?: string;
  acxMetrics?: ACXMetrics;
  isAcxProcessed?: boolean;
}

export interface AudiobookChapter {
  id: string;
  title: string;
  chapterNumber: number;
  rawManuscript: string;
  chunks: AudiobookChunk[];
  compiledAudioBase64?: string;
  rawCompiledAudioBase64?: string; // original before chapter ACX mastering
  compiledDuration?: number;
  status: "draft" | "chunked" | "rendered" | "compiled";
  isMultiVoice: boolean;
  acxMetrics?: ACXMetrics;
  isAcxProcessed?: boolean;
}

export interface AudiobookProject {
  id: string;
  title: string;
  author: string;
  narratorName?: string;
  publisher?: string;
  genre?: string;
  year?: string;
  copyright?: string;
  description?: string;
  coverImageBase64?: string; // Base64 PNG/JPG data URI or base64 string
  narrationMode: "solo" | "multi";
  defaultSoloVoice: string;
  defaultSoloAccent: string;
  defaultSoloStyle: string;
  characters: AudiobookCharacter[];
  chapters: AudiobookChapter[];
  pauseBetweenChunksMs: number; // default 400ms
  activeChapterId?: string;
  acxSettings?: ACXSettings;
  // Compiled M4B Cache
  compiledM4BBase64?: string;
  compiledM4BSize?: number;
  compiledM4BDuration?: number;
  compiledM4BChapters?: Array<{ title: string; startFormatted: string; duration: number }>;
}
