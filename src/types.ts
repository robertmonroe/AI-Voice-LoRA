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
  baseVoice: string; // Puck, Charon, Kore, Fenrir, Zephyr
  recommendedPitch: string; // Low, Medium, High, etc.
  recommendedSpeed: number; // e.g. 0.90
  prosodyInstructions: string;
  narrationStyle: string;
  voiceSeed: string; // Dynamic physical/acoustic anchor ID (e.g., 'Acoustic Signature #4928') to lock vocal timber and characteristics
  trainingPrompts: TrainingPrompt[];
  createdAt: string;
}

export interface AudioClip {
  id: string;
  modelId: string;
  promptId?: string; // Links back to a recommended prompt if applicable
  text: string;
  baseVoice: string;
  pitch: string; // Low / Medium / High
  speed: number; // multiplier e.g. 1.0
  emotion?: string;
  voiceSeed?: string; // Seed used to anchor this generation
  audioBase64: string; // Saved persistently as base64 in LocalStorage
  duration: number; // in seconds
  createdAt: string;
}
