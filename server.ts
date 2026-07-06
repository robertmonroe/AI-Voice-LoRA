import express from "express";
import path from "path";
import { GoogleGenAI, Modality, Type } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(express.json({ limit: "25mb" }));

const PORT = 3000;

// Helper to get Gemini SDK instance, preferring custom user key if provided
const getGoogleAIInstance = (userKey?: string) => {
  const key = userKey || process.env.GEMINI_API_KEY;
  if (!key) {
    throw new Error("Google AI API Key is missing. Please configure it in the application Settings or environment variables.");
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

// Endpoint: Design a voice model profile
app.post("/api/voice-models/design", async (req, res) => {
  try {
    const { prompt, apiProvider, googleApiKey, openRouterApiKey, openRouterModel } = req.body;
    if (!prompt) {
      return res.status(400).json({ error: "Prompt is required" });
    }

    if (apiProvider === "openrouter") {
      const activeOrKey = openRouterApiKey || process.env.OPENROUTER_API_KEY;
      if (!activeOrKey) {
        return res.status(400).json({ error: "OpenRouter API Key is missing. Please enter it in the API Credentials card on the left." });
      }

      const model = openRouterModel || "google/gemini-2.5-flash";
      const systemInstruction = `Design a high-quality speech voice model profile for LoRA training.
      
      Generate a realistic character or narrator persona, and select the optimal parameters for TTS voice generation. Include standard voice characteristics and a set of 12 highly diverse training script prompts that are custom written for this voice model's style, designed to cover a wide phonetic range (allophones, plosives, fricatives, nasals, varied punctuation, numbers, and emotional ranges) essential for training high-quality voice clones/LoRAs.

      Design a persistent "voiceSeed" representing a locked vocal fingerprint and timber signature formula. This seed acts as an acoustic anchor that describes the physical/tonal profile of the throat, vocal fold thickness, and resonance style to force identical voice preservation across different script syntheses (e.g. "SEED-9041-MALE-GRAVEL-320HZ").

      Return the response STRICTLY as a valid JSON object matching this schema. Do not enclose it in any markdown backticks or any other text. Output ONLY raw valid JSON:
      {
        "name": "A suitable concise name for this voice model (e.g., 'Grizzled Noir Detective', 'Enthusiastic Tech Reviewer')",
        "description": "A detailed description of the voice profile, persona, accent, age, gender, and style.",
        "gender": "Male / Female / Neutral / Other",
        "accent": "e.g., American (Southern), British (RP), Scottish, Mid-Atlantic",
        "baseVoice": "Choose the closest matching prebuilt voice from: Puck, Charon, Kore, Fenrir, Zephyr",
        "recommendedPitch": "Low / Medium-Low / Medium / Medium-High / High",
        "recommendedSpeed": 0.90, // float value between 0.75 and 1.50 representing standard rate
        "prosodyInstructions": "Detailed styling instructions to prepend or guide the TTS generation (e.g. 'Speak gravelly, slowly, with a dramatic pause between clauses')",
        "narrationStyle": "e.g., Audiobook Narration, Dramatic Dialogue, Educational, High Energy Promo",
        "voiceSeed": "A unique voice seed code representing locked timber (e.g. 'SEED-4921-TENOR-WARM-RESONANCE')",
        "trainingPrompts": [
          {
            "id": "prompt_1",
            "text": "The training script sentence 1...",
            "emotion": "Neutral / Happy / Sad / Serious / Whispering",
            "focus": "phonetic coverages, e.g. plosives and pauses"
          }
        ]
      }`;

      // Call OpenRouter API
      const openRouterUrl = "https://openrouter.ai/api/v1/chat/completions";
      const openRouterResponse = await fetch(openRouterUrl, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${activeOrKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://ai.studio/build",
          "X-Title": "AI Voice Studio Clone"
        },
        body: JSON.stringify({
          model: model,
          messages: [
            { role: "system", content: systemInstruction },
            { role: "user", content: `Create a voice profile based on this description: "${prompt}"` }
          ],
          response_format: { type: "json_object" }
        })
      });

      if (!openRouterResponse.ok) {
        const errorText = await openRouterResponse.text();
        throw new Error(`OpenRouter API responded with status ${openRouterResponse.status}: ${errorText}`);
      }

      const openRouterJson: any = await openRouterResponse.json();
      const content = openRouterJson.choices?.[0]?.message?.content;
      if (!content) {
        throw new Error("No response content received from OpenRouter model.");
      }

      // Safe parse JSON
      let parsedData;
      try {
        parsedData = JSON.parse(content.trim());
      } catch (e) {
        // Fallback: try to extract JSON from markdown block
        const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/) || content.match(/```\s*([\s\S]*?)\s*```/);
        if (jsonMatch && jsonMatch[1]) {
          parsedData = JSON.parse(jsonMatch[1].trim());
        } else {
          throw new Error("Failed to parse response as JSON. Output was: " + content);
        }
      }

      res.json(parsedData);
    } else {
      // Use Google AI
      const aiInstance = getGoogleAIInstance(googleApiKey);
      const response = await aiInstance.models.generateContent({
        model: "gemini-3.5-flash",
        contents: `Design a high-quality speech voice model profile for LoRA training based on this description: "${prompt}".
        
        Generate a realistic character or narrator persona, and select the optimal parameters for TTS voice generation. Include standard voice characteristics and a set of 12 highly diverse training script prompts that are custom written for this voice model's style, designed to cover a wide phonetic range (allophones, plosives, fricatives, nasals, varied punctuation, numbers, and emotional ranges) essential for training high-quality voice clones/LoRAs.

        Design a persistent "voiceSeed" representing a locked vocal fingerprint and timber signature formula. This seed acts as an acoustic anchor that describes the physical/tonal profile of the throat, vocal fold thickness, and resonance style to force identical voice preservation across different script syntheses (e.g. "SEED-9041-MALE-GRAVEL-320HZ").

        Return the response strictly as a JSON object matching this schema:
        {
          "name": "A suitable concise name for this voice model (e.g., 'Grizzled Noir Detective', 'Enthusiastic Tech Reviewer')",
          "description": "A detailed description of the voice profile, persona, accent, age, gender, and style.",
          "gender": "Male / Female / Neutral / Other",
          "accent": "e.g., American (Southern), British (RP), Scottish, Mid-Atlantic",
          "baseVoice": "Choose the closest matching prebuilt voice from: Puck, Charon, Kore, Fenrir, Zephyr",
          "recommendedPitch": "Low / Medium-Low / Medium / Medium-High / High",
          "recommendedSpeed": 0.90, // float value between 0.75 and 1.50 representing standard rate
          "prosodyInstructions": "Detailed styling instructions to prepend or guide the TTS generation (e.g. 'Speak gravelly, slowly, with a dramatic pause between clauses')",
          "narrationStyle": "e.g., Audiobook Narration, Dramatic Dialogue, Educational, High Energy Promo",
          "voiceSeed": "A unique voice seed code representing locked timber (e.g. 'SEED-4921-TENOR-WARM-RESONANCE')",
          "trainingPrompts": [
            {
              "id": "prompt_1",
              "text": "The training script sentence 1...",
              "emotion": "Neutral / Happy / Sad / Serious / Whispering",
              "focus": "phonetic coverages, e.g. plosives and pauses"
            }
          ]
        }`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              name: { type: Type.STRING },
              description: { type: Type.STRING },
              gender: { type: Type.STRING },
              accent: { type: Type.STRING },
              baseVoice: { type: Type.STRING },
              recommendedPitch: { type: Type.STRING },
              recommendedSpeed: { type: Type.NUMBER },
              prosodyInstructions: { type: Type.STRING },
              narrationStyle: { type: Type.STRING },
              voiceSeed: { type: Type.STRING },
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
              "recommendedPitch",
              "recommendedSpeed",
              "prosodyInstructions",
              "narrationStyle",
              "voiceSeed",
              "trainingPrompts",
            ],
          },
        },
      });

      const text = response.text;
      if (!text) {
        throw new Error("No text content returned from Gemini model");
      }

      const data = JSON.parse(text.trim());
      res.json(data);
    }
  } catch (error: any) {
    console.error("Design API Error:", error);
    res.status(500).json({ error: error.message || "Failed to design voice profile" });
  }
});

// Endpoint: Generate high-quality TTS audio clip
app.post("/api/audio/generate", async (req, res) => {
  try {
    const { text, baseVoice, pitch, speed, emotion, prosodyInstructions, voiceSeed, googleApiKey } = req.body;
    
    if (!text) {
      return res.status(400).json({ error: "Text script is required" });
    }

    // Embed pitch, speed, emotional cues, prosody instructions, and the locked voiceSeed
    // directly into the prompting context. Enforce strict adherence to the voiceSeed's signature
    // to anchor voice timber consistency across varied script runs.
    const cues: string[] = [];
    if (voiceSeed) cues.push(`Voice Seed Anchor: ${voiceSeed}`);
    if (emotion) cues.push(`Emotion/Mood: ${emotion}`);
    if (pitch) cues.push(`Pitch: ${pitch}`);
    if (speed) cues.push(`Speed: ${speed}`);
    if (prosodyInstructions) cues.push(`Style cues: ${prosodyInstructions}`);

    const styleBlock = cues.length > 0 ? `[Acoustic Signature Constraints: ${cues.join(", ")}] ` : "";
    const ttsPrompt = `${styleBlock}Say naturally, with the same locked character voice timber: ${text}`;

    const voiceName = baseVoice || "Kore";

    // Obtain the Gemini SDK instance using the key (preferred custom or default env key)
    const aiInstance = getGoogleAIInstance(googleApiKey);

    const response = await aiInstance.models.generateContent({
      model: "gemini-3.1-flash-tts-preview",
      contents: [{ parts: [{ text: ttsPrompt }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: voiceName },
          },
        },
      },
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!base64Audio) {
      return res.status(500).json({ error: "No audio data generated by Gemini TTS API" });
    }

    res.json({ audio: base64Audio });
  } catch (error: any) {
    console.error("Generate Audio API Error:", error);
    res.status(500).json({ error: error.message || "Failed to generate TTS audio clip" });
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
    console.log(`Server running on port ${PORT}`);
  });
}

startServer();
