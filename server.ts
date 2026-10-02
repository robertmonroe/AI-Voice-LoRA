import express from "express";
import path from "path";
import { GoogleGenAI, Modality, Type } from "@google/genai";
import dotenv from "dotenv";
import fs from "fs";
import { analyzeAudioBuffer, processACXBuffer, buildM4BFile } from "./src/server/acxService";

dotenv.config();

const app = express();
app.use(express.json({ limit: "150mb" }));
app.use(express.urlencoded({ limit: "150mb", extended: true }));

const DATA_DIR = path.join(process.cwd(), "data");
const DB_FILE = path.join(DATA_DIR, "db.json");

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const PORT = 3000;

// Helper to get Gemini SDK instance, preferring custom user key if provided
const getGoogleAIInstance = (userKey?: string) => {
  const key = userKey || process.env.GEMINI_API_KEY;
  if (!key) {
    throw new Error("Google AI API Key is missing. Please configure it in your environment or Settings.");
  }
  return new GoogleGenAI({
    apiKey: key,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
};

// Valid prebuilt voices in Gemini 3.8 Flash TTS
const VALID_VOICES = ["Puck", "Charon", "Kore", "Fenrir", "Aoede", "Zephyr"];

// Format errors cleanly, stripping raw JSON error bodies from upstream
const formatErrorMessage = (error: any): string => {
  if (!error) return "An unexpected error occurred.";
  const rawMsg = error.message || String(error);
  try {
    const parsed = JSON.parse(rawMsg);
    if (parsed.error?.message) {
      if (parsed.error.code === 503 || parsed.error.message.includes("high demand")) {
        return "The Gemini model is currently experiencing high demand on Google servers. Please retry in a few moments.";
      }
      return parsed.error.message;
    }
  } catch {}
  if (rawMsg.includes("503") || rawMsg.includes("high demand") || rawMsg.includes("UNAVAILABLE")) {
    return "The Gemini model is currently experiencing high demand on Google servers. Please retry in a few moments.";
  }
  return rawMsg;
};

// Helper: Call text models with auto-retry and multi-model fallback on 503 / high demand
const callGeminiTextWithFallback = async (
  aiInstance: GoogleGenAI,
  generateParams: any,
  modelsToTry: string[] = ["gemini-3.8-flash", "gemini-flash-latest", "gemini-3.1-pro-preview"]
) => {
  let lastError: any = null;
  for (const model of modelsToTry) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const response = await aiInstance.models.generateContent({
          ...generateParams,
          model,
        });
        return response;
      } catch (err: any) {
        lastError = err;
        const msg = (err?.message || JSON.stringify(err)).toLowerCase();
        const isTemporary = msg.includes("503") || msg.includes("429") || msg.includes("high demand") || msg.includes("unavailable");
        if (isTemporary) {
          console.warn(`[Gemini API] Model ${model} high demand/503 on attempt ${attempt + 1}. Retrying...`);
          await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
          continue;
        }
        break; // Non-transient error, move to next model or throw
      }
    }
  }
  throw lastError;
};

// Resilient heuristic persona designer if Google API is under 503 load
const buildFallbackPersona = (prompt: string) => {
  const p = prompt.toLowerCase();
  let baseVoice = "Fenrir";
  let gender = "Male";
  let accent = "Hungarian (Eastern European)";
  let pitch = "Low";
  let speed = 0.90;
  let narrationStyle = "Gothic Horror & Dramatic Performance";

  if (p.includes("hungarian")) {
    accent = "Hungarian (Eastern European)";
  } else if (p.includes("romanian") || p.includes("romanin")) {
    accent = "Romanian (Eastern European)";
  } else if (p.includes("cockney")) {
    accent = "Cockney (London)";
  } else if (p.includes("scottish")) {
    accent = "Scottish (Highlands)";
  } else if (p.includes("irish")) {
    accent = "Irish";
  } else if (p.includes("british") || p.includes("english")) {
    accent = "British (Received Pronunciation)";
  }

  if (p.includes("female") || p.includes("woman") || p.includes("lady") || p.includes("vampiress")) {
    gender = "Female";
    baseVoice = p.includes("young") ? "Aoede" : "Kore";
  } else {
    gender = "Male";
    baseVoice = p.includes("vampire") || p.includes("ancient") || p.includes("gravel") ? "Fenrir" : "Charon";
  }

  let styleGuidance = `Authentic ${accent} accent with aristocratic cadence, deep and menacing vocal resonance, controlled breaths (<breath>) and deliberate pace.`;
  if (p.includes("vampire")) {
    pitch = "Low";
    speed = 0.88;
    styleGuidance = `Thick authentic ${accent} accent, centuries-old aristocratic composure, gravelly undertone, chilling pauses, and cold sibilants.`;
  }

  const rawTitle = prompt.replace(/[^\w\s]/gi, "").trim();
  const name = rawTitle.length > 28 ? rawTitle.slice(0, 24) + "..." : rawTitle || "Custom Character";

  return {
    name: name.charAt(0).toUpperCase() + name.slice(1),
    description: `Voice persona derived from: "${prompt}". Designed with acoustic base and dialect styling.`,
    gender,
    accent,
    baseVoice,
    pitch,
    speed,
    styleGuidance,
    narrationStyle,
    trainingPrompts: [
      {
        id: "p_1",
        text: "I have crossed oceans of time to find you... <breath> and now you stand before me in the dark.",
        emotion: "Ancient & Chilling",
        focus: "Low chest resonance and sustained sibilants"
      },
      {
        id: "p_2",
        text: "Listen to the creatures of the night... <laugh> what glorious music they compose under the pale moon.",
        emotion: "Aristocratic Mockery",
        focus: "Vocal burst laugh and sudden pitch shifts"
      },
      {
        id: "p_3",
        text: "You speak of mortality as if it were a shield. Six centuries have taught me otherwise.",
        emotion: "Cold Authority",
        focus: "Plosive consonant precision and steady cadence"
      },
      {
        id: "p_4",
        text: "Step inside my castle. Enter freely and of your own will, and leave something of the happiness you bring. <sigh>",
        emotion: "Menacing Hospitality",
        focus: "Vocal burst sigh and velvet cadence"
      },
      {
        id: "p_5",
        text: "Do you truly think a crucifix can stay my hand? The shadows answer only to me.",
        emotion: "Dark Defiance",
        focus: "Throat compression and grave tonal drop"
      }
    ]
  };
};

// Endpoint: AI-assisted Voice Persona Designer (gemini-3.8-flash with multi-model fallback & smart resilience)
app.post("/api/voice-models/design", async (req, res) => {
  try {
    const { prompt, googleApiKey } = req.body;
    if (!prompt || typeof prompt !== "string") {
      return res.status(400).json({ error: "Prompt description is required" });
    }

    const aiInstance = getGoogleAIInstance(googleApiKey);

    const systemInstruction = `You are an expert voice casting director and acoustic designer for Gemini 3.8 Flash TTS.
Your task is to translate the user's voice description into an authentic vocal persona.
Select the optimal base prebuilt voice from the available roster: [Puck, Charon, Kore, Fenrir, Aoede, Zephyr].
- Puck: Youthful, agile, energetic, slightly playful male resonance
- Charon: Deep, resonant, grave, authoritative male resonance
- Kore: Warm, soothing, balanced, natural female resonance
- Fenrir: Deep, gravelly, rough, commanding male resonance
- Aoede: Melodic, clear, highly expressive female resonance
- Zephyr: Bright, articulate, conversational, dynamic male resonance

Provide authentic accent guidance and a concise, effective "styleGuidance" string.
The "styleGuidance" is passed directly to Gemini 3.8 Flash TTS speechMetadata.style to control dialect, delivery, emotional tone, and cadence (e.g. "British Cockney accent, lively street merchant rhythm, warm and raspy" or "Authentic Scottish Highlands accent, deliberate and weathered").
Speed must default to standard 1.0 (between 0.85 and 1.25).
Generate 6-8 diverse training script sentences featuring natural dialogue, appropriate vocal bursts (<laugh>, <gasp>, <breath>) or backchanneling (|mhm|, |yeah|) where suitable.`;

    try {
      const response = await callGeminiTextWithFallback(
        aiInstance,
        {
          contents: `Design a complete voice persona based on this description: "${prompt}"`,
          config: {
            systemInstruction,
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING },
                description: { type: Type.STRING },
                gender: { type: Type.STRING },
                accent: { type: Type.STRING },
                baseVoice: { type: Type.STRING, enum: VALID_VOICES },
                pitch: { type: Type.STRING },
                speed: { type: Type.NUMBER },
                styleGuidance: { type: Type.STRING },
                narrationStyle: { type: Type.STRING },
                trainingPrompts: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      id: { type: Type.STRING },
                      text: { type: Type.STRING },
                      emotion: { type: Type.STRING },
                      focus: { type: Type.STRING },
                    },
                    required: ["id", "text", "emotion", "focus"],
                  },
                },
              },
              required: [
                "name",
                "description",
                "gender",
                "accent",
                "baseVoice",
                "pitch",
                "speed",
                "styleGuidance",
                "narrationStyle",
                "trainingPrompts",
              ],
            },
          },
        },
        ["gemini-3.8-flash", "gemini-flash-latest", "gemini-3.1-pro-preview"]
      );

      const text = response.text;
      if (!text) {
        throw new Error("No text content returned from Gemini model");
      }

      const data = JSON.parse(text.trim());
      return res.json(data);
    } catch (err: any) {
      console.warn("Gemini design returned error, evaluating fallback persona:", err?.message);
      const is503 = (err?.message || "").includes("503") || (err?.message || "").includes("high demand") || (err?.message || "").includes("UNAVAILABLE");
      if (is503) {
        // Provide resilient auto-generated persona so user is never blocked
        const fallback = buildFallbackPersona(prompt);
        return res.json(fallback);
      }
      throw err;
    }
  } catch (error: any) {
    console.error("Design API Error:", error);
    res.status(500).json({ error: formatErrorMessage(error) });
  }
});

// Endpoint: Generate custom training script prompts (gemini-3.8-flash)
app.post("/api/voice-models/generate-prompts", async (req, res) => {
  try {
    const { name, description, gender, accent, baseVoice, narrationStyle, styleGuidance, googleApiKey } = req.body;

    const voiceSpecs = `
Voice Name: ${name || "Custom"}
Gender: ${gender || "Neutral"}
Accent / Dialect: ${accent || "Standard"}
Base Voice: ${baseVoice || "Kore"}
Style: ${narrationStyle || "General"}
Style Guidance: ${styleGuidance || "Natural"}
Description: ${description || "None"}
`;

    const aiInstance = getGoogleAIInstance(googleApiKey);

    const response = await callGeminiTextWithFallback(
      aiInstance,
      {
        contents: `Generate 10 phonetically diverse, emotionally rich training script prompts specifically tailored to this voice persona:\n${voiceSpecs}\n
Ensure wide coverage of vowels, sibilants, plosives, varied phrasing, pacing, and questions. You can include natural Gemini 3.8 speech tags such as <laugh>, <gasp>, or <breath> on some lines where natural.`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.STRING },
                text: { type: Type.STRING },
                emotion: { type: Type.STRING },
                focus: { type: Type.STRING },
              },
              required: ["id", "text", "emotion", "focus"],
            },
          },
        },
      },
      ["gemini-3.8-flash", "gemini-flash-latest", "gemini-3.1-pro-preview"]
    );

    const text = response.text;
    if (!text) {
      throw new Error("No text returned from Gemini model");
    }

    const data = JSON.parse(text.trim());
    res.json(data);
  } catch (error: any) {
    console.error("Generate Prompts API Error:", error);
    res.status(500).json({ error: formatErrorMessage(error) });
  }
});

// Endpoint: Generate high-fidelity TTS audio with Gemini 3.8 Flash TTS
app.post("/api/audio/generate", async (req, res) => {
  try {
    const { text, baseVoice, styleGuidance, googleApiKey } = req.body;

    if (!text || typeof text !== "string" || !text.trim()) {
      return res.status(400).json({ error: "Script text is required" });
    }

    const cleanText = text.trim();
    const voiceName = VALID_VOICES.includes(baseVoice) ? baseVoice : "Kore";
    const aiInstance = getGoogleAIInstance(googleApiKey);

    // Build parts with clean speechMetadata (NO clumsy text prompt-wrapping)
    const part: any = {
      text: cleanText,
    };

    if (styleGuidance && typeof styleGuidance === "string" && styleGuidance.trim()) {
      part.speechMetadata = {
        style: styleGuidance.trim(),
      };
    }

    let response: any = null;
    const ttsModels = ["gemini-3.8-flash-tts", "gemini-3.8-flash-lite-tts"];
    let lastError: any = null;

    for (const ttsModel of ttsModels) {
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          response = await aiInstance.models.generateContent({
            model: ttsModel,
            contents: [
              {
                role: "user",
                parts: [part],
              },
            ],
            config: {
              responseModalities: [Modality.AUDIO],
              speechConfig: {
                voiceConfig: {
                  prebuiltVoiceConfig: { voiceName },
                },
              },
            },
          });
          break;
        } catch (err: any) {
          lastError = err;
          const msg = (err?.message || "").toLowerCase();
          if (msg.includes("503") || msg.includes("429") || msg.includes("high demand") || msg.includes("unavailable")) {
            console.warn(`[TTS Retry] ${ttsModel} returned high demand on attempt ${attempt + 1}. Retrying...`);
            await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
            continue;
          }
          break;
        }
      }
      if (response) break;
    }

    if (!response) {
      throw lastError || new Error("Failed to generate TTS audio");
    }

    // Unary default returns complete 24kHz mono 16-bit WAV file with RIFF header
    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!base64Audio) {
      throw new Error("No audio data returned by Gemini 3.8 Flash TTS");
    }

    res.json({ audio: base64Audio });
  } catch (error: any) {
    console.error("Generate Audio API Error:", error);
    res.status(500).json({ error: formatErrorMessage(error) });
  }
});

// Endpoint: Parse complete manuscript into chapters
app.post("/api/audiobook/parse-manuscript", async (req, res) => {
  try {
    const { manuscriptText, googleApiKey } = req.body;
    if (!manuscriptText || typeof manuscriptText !== "string" || !manuscriptText.trim()) {
      return res.status(400).json({ error: "Manuscript text is required" });
    }

    const aiInstance = getGoogleAIInstance(googleApiKey);

    const systemInstruction = `You are a professional literary editor and audiobook production coordinator.
Analyze the provided book manuscript and segment it into sequential chapters.
Extract the chapter title or number for each section (e.g. "Chapter 1: The Gathering Storm", "Prologue", "Chapter II", "Epilogue").
For each chapter, preserve the exact original prose without omitting text or summarizing.
Return a valid JSON array of chapters matching the schema.`;

    const response = await callGeminiTextWithFallback(
      aiInstance,
      {
        contents: `Parse this manuscript into chapters:\n\n${manuscriptText.slice(0, 100000)}`,
        config: {
          systemInstruction,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                chapterNumber: { type: Type.INTEGER },
                title: { type: Type.STRING },
                content: { type: Type.STRING },
              },
              required: ["chapterNumber", "title", "content"],
            },
          },
        },
      },
      ["gemini-3.8-flash", "gemini-flash-latest", "gemini-3.1-pro-preview"]
    );

    const text = response.text;
    if (!text) {
      throw new Error("No chapter parsing response returned from Gemini");
    }

    const chapters = JSON.parse(text.trim());
    res.json({ chapters });
  } catch (error: any) {
    console.error("Parse Manuscript Error:", error);
    res.status(500).json({ error: formatErrorMessage(error) });
  }
});

// Endpoint: Intelligently chunk a chapter and assign directorial acting instructions
app.post("/api/audiobook/chunk-and-direct", async (req, res) => {
  try {
    const {
      chapterTitle,
      chapterText,
      narrationMode, // "solo" | "multi"
      defaultVoice, // Puck, Charon, Kore, Fenrir, Aoede, Zephyr
      defaultAccent,
      defaultStyle,
      existingCharacters,
      googleApiKey,
    } = req.body;

    if (!chapterText || typeof chapterText !== "string" || !chapterText.trim()) {
      return res.status(400).json({ error: "Chapter text is required" });
    }

    const aiInstance = getGoogleAIInstance(googleApiKey);

    const systemInstruction = `You are an executive audiobook director and voice supervisor for Gemini 3.8 Flash TTS.
Your task is to take this chapter and break it down into natural audio performance chunks (sentences or dialogue beats, typically 25 to 75 words each).
For every chunk:
1. "speaker": In multi-voice mode, identify who is speaking: "Narrator" or the specific character's name (e.g. "Sherlock Holmes", "Dr. Watson", "Alice"). In solo mode, "Narrator".
2. "baseVoice": Assign the best matching prebuilt voice from [Puck, Charon, Kore, Fenrir, Aoede, Zephyr].
   - Puck: Youthful, agile, energetic male
   - Charon: Deep, grave, commanding baritone
   - Kore: Warm, soothing, clear storyteller female
   - Fenrir: Deep, gravelly, rough, dramatic male
   - Aoede: Melodic, expressive, lyrical female
   - Zephyr: Crisp, conversational, dynamic tenor male
3. "styleGuidance": Craft a direct, evocative acting instruction for Gemini 3.8 Flash TTS speechMetadata.style.
   Include accent, emotional tone, cadence, and vocal texture (e.g. "British RP accent, solemn whisper with dramatic pause", "Cockney accent, fast-talking, laughing <laugh>").
   You may embed appropriate Gemini 3.8 speech tags (<laugh>, <gasp>, <breath>, <sigh>, |mhm|, |yeah|) where natural in dialogue.
4. "discoveredCharacters": List any distinct characters identified in this chapter with their suggested gender, recommended voice from the roster, accent, and default acting style.`;

    const promptPayload = `Chapter Title: ${chapterTitle || "Untitled"}
Narration Mode: ${narrationMode || "solo"}
Default Voice: ${defaultVoice || "Kore"}
Default Accent: ${defaultAccent || "Standard"}
Default Style: ${defaultStyle || "Clear audiobook narration"}
Existing Known Characters: ${JSON.stringify(existingCharacters || [])}

Chapter Prose to Segment and Direct:
${chapterText.slice(0, 50000)}`;

    const response = await callGeminiTextWithFallback(
      aiInstance,
      {
        contents: promptPayload,
        config: {
          systemInstruction,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              chunks: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    index: { type: Type.INTEGER },
                    speaker: { type: Type.STRING },
                    baseVoice: { type: Type.STRING, enum: VALID_VOICES },
                    styleGuidance: { type: Type.STRING },
                    text: { type: Type.STRING },
                  },
                  required: ["index", "speaker", "baseVoice", "styleGuidance", "text"],
                },
              },
              discoveredCharacters: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    name: { type: Type.STRING },
                    gender: { type: Type.STRING },
                    baseVoice: { type: Type.STRING, enum: VALID_VOICES },
                    accent: { type: Type.STRING },
                    styleGuidance: { type: Type.STRING },
                  },
                  required: ["name", "gender", "baseVoice", "accent", "styleGuidance"],
                },
              },
            },
            required: ["chunks", "discoveredCharacters"],
          },
        },
      },
      ["gemini-3.8-flash", "gemini-flash-latest", "gemini-3.1-pro-preview"]
    );

    const text = response.text;
    if (!text) {
      throw new Error("No directorial chunking response from Gemini");
    }

    const data = JSON.parse(text.trim());
    res.json(data);
  } catch (error: any) {
    console.error("Chunk & Direct Error:", error);
    res.status(500).json({ error: formatErrorMessage(error) });
  }
});

// Endpoint: Seamlessly compile and concatenate chapter chunks into a master WAV file
app.post("/api/audiobook/compile-chapter", (req, res) => {
  try {
    const { chunksAudio, pauseMs = 400 } = req.body;

    if (!chunksAudio || !Array.isArray(chunksAudio) || chunksAudio.length === 0) {
      return res.status(400).json({ error: "Array of audio chunks is required for compilation" });
    }

    // 24kHz, 16-bit, mono: 24,000 samples/sec * 2 bytes/sample = 48,000 bytes/sec
    const pauseSamples = Math.max(0, Math.floor(24000 * (pauseMs / 1000)));
    const silenceBuffer = Buffer.alloc(pauseSamples * 2, 0); // zero bytes for pure PCM silence

    const pcmBuffers: Buffer[] = [];

    chunksAudio.forEach((base64Audio: string, idx: number) => {
      if (!base64Audio || typeof base64Audio !== "string") return;

      const wavBuffer = Buffer.from(base64Audio, "base64");
      // Standard RIFF WAV header is 44 bytes; slice payload
      const pcmPayload = wavBuffer.length > 44 ? wavBuffer.subarray(44) : wavBuffer;

      // Add silence between chunks (except before first chunk)
      if (idx > 0 && silenceBuffer.length > 0) {
        pcmBuffers.push(silenceBuffer);
      }

      pcmBuffers.push(pcmPayload);
    });

    const totalPcm = Buffer.concat(pcmBuffers);

    // Build master 44-byte WAV header
    const header = Buffer.alloc(44);
    // RIFF chunk
    header.write("RIFF", 0);
    header.writeUInt32LE(totalPcm.length + 36, 4); // file size - 8
    header.write("WAVE", 8);

    // fmt chunk
    header.write("fmt ", 12);
    header.writeUInt32LE(16, 16); // fmt chunk size
    header.writeUInt16LE(1, 20); // linear PCM
    header.writeUInt16LE(1, 22); // mono
    header.writeUInt32LE(24000, 24); // sample rate
    header.writeUInt32LE(48000, 28); // byte rate (24000 * 1 * 2)
    header.writeUInt16LE(2, 32); // block align
    header.writeUInt16LE(16, 34); // bits per sample

    // data chunk
    header.write("data", 36);
    header.writeUInt32LE(totalPcm.length, 40); // data size

    const finalMasterWav = Buffer.concat([header, totalPcm]);
    const totalDurationSec = Math.round((totalPcm.length / 48000) * 10) / 10;

    res.json({
      compiledAudio: finalMasterWav.toString("base64"),
      totalDuration: totalDurationSec,
    });
  } catch (error: any) {
    console.error("Compile Chapter Error:", error);
    res.status(500).json({ error: error.message || "Failed to compile chapter master audio" });
  }
});

// Endpoint: Check ACX compliance of audio
app.post("/api/audio/acx-check", (req, res) => {
  try {
    const { audioBase64 } = req.body;
    if (!audioBase64 || typeof audioBase64 !== "string") {
      return res.status(400).json({ error: "audioBase64 string is required" });
    }

    const buffer = Buffer.from(audioBase64, "base64");
    const metrics = analyzeAudioBuffer(buffer);
    res.json({ metrics });
  } catch (error: any) {
    console.error("ACX Check Error:", error);
    res.status(500).json({ error: error.message || "Failed to check ACX compliance" });
  }
});

// Endpoint: Process audio for ACX compliance (EQ, compression, noise floor, loudness)
app.post("/api/audio/acx-process", (req, res) => {
  try {
    const { audioBase64, settings } = req.body;
    if (!audioBase64 || typeof audioBase64 !== "string") {
      return res.status(400).json({ error: "audioBase64 string is required" });
    }

    const buffer = Buffer.from(audioBase64, "base64");
    const result = processACXBuffer(buffer, settings);
    res.json({
      audioBase64: result.processedBuffer.toString("base64"),
      metrics: result.metrics,
      beforeMetrics: result.beforeMetrics,
    });
  } catch (error: any) {
    console.error("ACX Process Error:", error);
    res.status(500).json({ error: error.message || "Failed to master audio for ACX" });
  }
});

// Endpoint: Batch process multiple audio clips for ACX compliance
app.post("/api/audio/batch-acx-process", (req, res) => {
  try {
    const { items, settings } = req.body;
    if (!items || !Array.isArray(items)) {
      return res.status(400).json({ error: "items array is required" });
    }

    const processedItems = items.map((item: { id: string; audioBase64: string }) => {
      try {
        const buffer = Buffer.from(item.audioBase64, "base64");
        const result = processACXBuffer(buffer, settings);
        return {
          id: item.id,
          audioBase64: result.processedBuffer.toString("base64"),
          metrics: result.metrics,
          beforeMetrics: result.beforeMetrics,
          success: true,
        };
      } catch (e: any) {
        return {
          id: item.id,
          error: e.message || "Failed to process",
          success: false,
        };
      }
    });

    res.json({ items: processedItems });
  } catch (error: any) {
    console.error("Batch ACX Process Error:", error);
    res.status(500).json({ error: error.message || "Failed to process audio batch" });
  }
});

// Endpoint: Create Professional .M4B Audiobook with cover art and chapters
app.post("/api/audiobook/create-m4b", (req, res) => {
  try {
    const {
      title,
      author,
      narrator,
      publisher,
      genre,
      year,
      copyright,
      description,
      coverImageBase64,
      chapters,
      bitrateKbps,
      applyAcxMastering,
    } = req.body;

    if (!title || !chapters || !Array.isArray(chapters) || chapters.length === 0) {
      return res.status(400).json({ error: "Title and at least one chapter are required for M4B compilation" });
    }

    // Prepare chapters
    const preparedChapters = chapters.map((ch: any, idx: number) => {
      if (!ch.audioBase64) {
        throw new Error(`Chapter "${ch.title || idx + 1}" is missing compiled audio.`);
      }
      return {
        title: ch.title || `Chapter ${idx + 1}`,
        chapterNumber: ch.chapterNumber || idx + 1,
        audioBuffer: Buffer.from(ch.audioBase64, "base64"),
        duration: ch.duration,
      };
    });

    // Prepare cover image buffer if provided
    let coverBuffer: Buffer | undefined;
    if (coverImageBase64 && typeof coverImageBase64 === "string") {
      const cleanBase64 = coverImageBase64.replace(/^data:image\/[a-z]+;base64,/, "");
      coverBuffer = Buffer.from(cleanBase64, "base64");
    }

    const result = buildM4BFile({
      title: title || "Untitled Audiobook",
      author: author || "Unknown Author",
      narrator: narrator || "Gemini 3.8 Flash TTS",
      publisher: publisher || "AI Studio Audiobooks",
      genre: genre || "Audiobook",
      year: year || new Date().getFullYear().toString(),
      copyright: copyright || `© ${new Date().getFullYear()} ${author || "Author"}`,
      description: description || "Professional audiobook compiled with Gemini 3.8 Flash TTS",
      coverImageBuffer: coverBuffer,
      chapters: preparedChapters,
      bitrateKbps: bitrateKbps || 192,
      applyAcxMastering: !!applyAcxMastering,
    });

    res.json({
      m4bBase64: result.m4bBuffer.toString("base64"),
      fileSize: result.fileSize,
      totalDuration: result.totalDuration,
      chapters: result.chapters,
    });
  } catch (error: any) {
    console.error("Create M4B Error:", error);
    res.status(500).json({ error: error.message || "Failed to create M4B audiobook" });
  }
});

// Endpoint: Get persisted voice models, audio clips, and audiobook projects
app.get("/api/data", (req, res) => {
  try {
    if (fs.existsSync(DB_FILE)) {
      const raw = fs.readFileSync(DB_FILE, "utf-8");
      return res.json(JSON.parse(raw));
    }
  } catch (err: any) {
    console.error("Failed to read server DB file:", err);
  }
  return res.json({ voiceModels: [], audioClips: [], audiobookProjects: [] });
});

// Endpoint: Sync and persist voice models, audio clips, and audiobook projects
app.post("/api/data/sync", (req, res) => {
  try {
    const { voiceModels, audioClips, audiobookProjects } = req.body;
    fs.writeFileSync(DB_FILE, JSON.stringify({ voiceModels, audioClips, audiobookProjects: audiobookProjects || [] }, null, 2), "utf-8");
    return res.json({ success: true });
  } catch (err: any) {
    console.error("Failed to write server DB file:", err);
    return res.status(500).json({ error: "Failed to persist data server-side: " + err.message });
  }
});

// Serve frontend assets and SPA fallback
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Gemini 3.8 Flash TTS Server running on port ${PORT}`);
  });
}

startServer();
