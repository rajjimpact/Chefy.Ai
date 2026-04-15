/**
 * AI API helper — supports BOTH Gemini and Groq keys.
 *
 * Key auto-detection:
 *   AIzaSy...  → Gemini API  (free: 1,500 req/day)
 *   gsk_...    → Groq API    (free: 14,400 req/day — much better!)
 */

// ── Gemini config ──────────────────────────────────────────────
const GEMINI_MODELS = ["gemini-2.0-flash-lite", "gemini-2.0-flash"];

// ── Groq config ────────────────────────────────────────────────
const GROQ_TEXT_MODEL = "llama-3.3-70b-versatile";      // 14,400 RPD free

// Groq vision models tried in order (image must come FIRST in content)
const GROQ_VISION_MODELS = [
  "meta-llama/llama-4-scout-17b-16e-instruct", // Llama 4 Scout — supports vision
  "llama-3.2-90b-vision-preview",               // Llama 3.2 90B vision
  "llama-3.2-11b-vision-preview",               // Llama 3.2 11B vision
];

// ── Utilities ──────────────────────────────────────────────────

function getKeyType(key) {
  if (!key || !key.trim()) return null;
  if (key.trim().startsWith("AIzaSy")) return "gemini";
  if (key.trim().startsWith("gsk_"))   return "groq";
  return null;
}

// ── Gemini API ─────────────────────────────────────────────────

async function callGeminiModel(key, model, body) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) return { ok: true, data };
    return { ok: false, status: res.status, message: data?.error?.message || `HTTP ${res.status}` };
  } catch (err) {
    return { ok: false, status: 0, message: err.message };
  }
}

async function callGeminiKey(key, body) {
  for (const model of GEMINI_MODELS) {
    const r = await callGeminiModel(key, model, body);
    if (r.ok) { console.log(`[AI] ✓ Gemini/${model}`); return r; }
    console.warn(`[AI] Gemini/${model}: ${r.status} — ${String(r.message).slice(0,80)}`);
    // Auth errors → stop trying models with this key
    if (r.status === 401 || r.status === 403) return r;
    if (r.status === 400 && /expired|invalid.?key/i.test(r.message || "")) return r;
    // 404 / 429 → try next model
  }
  return { ok: false, status: 429, message: "All Gemini models quota-limited" };
}

// ── Groq API ───────────────────────────────────────────────────

/** Convert Gemini-format request body → Groq (OpenAI) request body */
function toGroqBody(body, visionModel = null) {
  const parts    = body?.contents?.[0]?.parts || [];
  const textPart = parts.find((p) => p.text)?.text || "";
  const imgPart  = parts.find((p) => p.inlineData);

  if (imgPart) {
    // ⚠️ Image MUST come first for Llama vision models
    return {
      model: visionModel || GROQ_VISION_MODELS[0],
      messages: [{
        role: "user",
        content: [
          {
            type: "image_url",
            image_url: {
              url: `data:${imgPart.inlineData.mimeType};base64,${imgPart.inlineData.data}`,
            },
          },
          { type: "text", text: textPart },
        ],
      }],
    };
  }

  return {
    model: GROQ_TEXT_MODEL,
    messages: [{ role: "user", content: textPart }],
  };
}

async function callGroqKey(key, body) {
  const parts   = body?.contents?.[0]?.parts || [];
  const hasImage = parts.some((p) => p.inlineData);

  // For vision, try each model in order; for text, just call once
  const modelsToTry = hasImage ? GROQ_VISION_MODELS : [GROQ_TEXT_MODEL];

  for (const model of modelsToTry) {
    const groqBody = toGroqBody(body, model);
    try {
      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({ ...groqBody, temperature: 0.7, max_tokens: 1024 }),
        cache: "no-store",
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = data?.error?.message || `HTTP ${res.status}`;
        console.warn(`[AI] Groq/${model}: ${res.status} — ${String(msg).slice(0,80)}`);
        // 404 = model not found → try next vision model
        if (res.status === 404) continue;
        // Auth errors → stop
        if (res.status === 401 || res.status === 403) return { ok: false, status: res.status, message: msg };
        // Other errors → try next model
        continue;
      }

      const text = data.choices?.[0]?.message?.content || "";
      console.log(`[AI] ✓ Groq/${model}`);
      return {
        ok: true,
        data: { candidates: [{ content: { parts: [{ text }] } }] },
      };
    } catch (err) {
      console.warn(`[AI] Groq/${model} error: ${err.message}`);
      continue;
    }
  }

  return { ok: false, status: 500, message: "All Groq vision models failed" };
}

// ── Main Export ────────────────────────────────────────────────

/**
 * Try keys in order. Custom key goes first.
 * Supports both Gemini (AIzaSy...) and Groq (gsk_...) keys.
 */
export async function callGeminiWithRotation(requestBody, customKey = null) {
  const entries = [];

  // Custom key (from Settings panel) — always first
  if (customKey?.trim()) {
    const type = getKeyType(customKey.trim());
    if (type) entries.push({ key: customKey.trim(), type, label: "Custom" });
    else console.warn("[AI] Custom key format not recognized — must start with AIzaSy or gsk_");
  }

  // Environment keys
  const envPairs = [
    [process.env.GROQ_API_KEY,      "Groq-Env"],
    [process.env.GEMINI_API_KEY_1,  "Gemini-1"],
    [process.env.GEMINI_API_KEY_2,  "Gemini-2"],
    [process.env.GEMINI_API_KEY_3,  "Gemini-3"],
  ];

  for (const [k, label] of envPairs) {
    if (!k?.trim()) continue;
    const type = getKeyType(k.trim());
    if (!type) continue;
    if (!entries.some((e) => e.key === k.trim())) {
      entries.push({ key: k.trim(), type, label });
    }
  }

  console.log(`[AI] Key order: [${entries.map((e) => `${e.label}(${e.type})`).join(", ")}]`);

  if (entries.length === 0) {
    throw new Error(
      "No API keys configured. Get a FREE Groq key at console.groq.com → add to ⚙️ Settings."
    );
  }

  for (const { key, type, label } of entries) {
    console.log(`[AI] Trying ${label} (${type})...`);
    const result = type === "groq"
      ? await callGroqKey(key, requestBody)
      : await callGeminiKey(key, requestBody);

    if (result.ok) return result.data;

    console.warn(`[AI] ${label} failed: ${result.status} — ${String(result.message).slice(0,80)}`);
    // Continue to next key
  }

  throw new Error(
    "All API keys failed. Get a free Groq key at console.groq.com and paste it in ⚙️ Settings."
  );
}
