/**
 * AI API helper — supports BOTH Gemini (Google) and Groq (Llama) keys.
 *
 * Priority order:
 *   1. Custom key from Settings panel (detected automatically as Gemini or Groq)
 *   2. GROQ_API_KEY_1 / _2 / _3  (gsk_... keys)
 *   3. GEMINI_API_KEY_1 / _2 / _3 (AIza... keys)
 *
 * Add to .env.local either:
 *   GEMINI_API_KEY_1=AIza...   (Google AI Studio — free)
 *   or
 *   GROQ_API_KEY_1=gsk_...     (Groq — free)
 */

// ── Groq model config ─────────────────────────────────────────────
const GROQ_TEXT_MODEL = "llama-3.3-70b-versatile";
const GROQ_VISION_MODELS = [
  "meta-llama/llama-4-scout-17b-16e-instruct",
  "llama-3.2-90b-vision-preview",
  "llama-3.2-11b-vision-preview",
];

// ── Gemini model config ───────────────────────────────────────────
const GEMINI_TEXT_MODEL   = "gemini-2.0-flash";
const GEMINI_VISION_MODEL = "gemini-2.0-flash";
const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

// ─────────────────────────────────────────────────────────────────
// GROQ helpers
// ─────────────────────────────────────────────────────────────────

function toGroqBody(body, model) {
  const parts    = body?.contents?.[0]?.parts || [];
  const textPart = parts.find((p) => p.text)?.text || "";
  const imgPart  = parts.find((p) => p.inlineData);

  if (imgPart) {
    return {
      model,
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
    model,
    messages: [{ role: "user", content: textPart }],
  };
}

async function callGroqKey(key, body) {
  const parts    = body?.contents?.[0]?.parts || [];
  const hasImage = parts.some((p) => p.inlineData);
  const models   = hasImage ? GROQ_VISION_MODELS : [GROQ_TEXT_MODEL];

  for (const model of models) {
    const groqBody = toGroqBody(body, model);
    try {
      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
          ...groqBody,
          temperature: body?.generationConfig?.temperature ?? 0.7,
          max_tokens:  body?.generationConfig?.maxOutputTokens ?? 2048,
        }),
        cache: "no-store",
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        const msg = data?.error?.message || `HTTP ${res.status}`;
        console.warn(`[Groq] ${model}: ${res.status} — ${String(msg).slice(0, 120)}`);
        if (res.status === 401 || res.status === 403) {
          return { ok: false, status: res.status, message: msg, authError: true };
        }
        if (res.status === 404) continue;
        if (res.status === 429) {
          return { ok: false, status: 429, message: "Quota exceeded — rotating to next key" };
        }
        continue;
      }

      const text = data.choices?.[0]?.message?.content || "";
      console.log(`[Groq] ✓ ${model}`);
      return {
        ok: true,
        data: { candidates: [{ content: { parts: [{ text }] } }] },
      };

    } catch (err) {
      console.warn(`[Groq] ${model} network error: ${err.message}`);
      continue;
    }
  }

  return { ok: false, status: 500, message: "All Groq models failed for this key" };
}

// ─────────────────────────────────────────────────────────────────
// GEMINI helpers
// ─────────────────────────────────────────────────────────────────

async function callGeminiKey(key, body) {
  const parts    = body?.contents?.[0]?.parts || [];
  const hasImage = parts.some((p) => p.inlineData);
  const model    = hasImage ? GEMINI_VISION_MODEL : GEMINI_TEXT_MODEL;

  const url = `${GEMINI_BASE}/${model}:generateContent?key=${key}`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      const msg = data?.error?.message || `HTTP ${res.status}`;
      console.warn(`[Gemini] ${model}: ${res.status} — ${String(msg).slice(0, 120)}`);
      if (res.status === 401 || res.status === 403) {
        return { ok: false, status: res.status, message: msg, authError: true };
      }
      if (res.status === 429) {
        return { ok: false, status: 429, message: "Quota exceeded — rotating to next key" };
      }
      return { ok: false, status: res.status, message: msg };
    }

    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
    console.log(`[Gemini] ✓ ${model}`);
    return {
      ok: true,
      data: { candidates: [{ content: { parts: [{ text }] } }] },
    };

  } catch (err) {
    console.warn(`[Gemini] network error: ${err.message}`);
    return { ok: false, status: 500, message: err.message };
  }
}

// ─────────────────────────────────────────────────────────────────
// Main export
// ─────────────────────────────────────────────────────────────────

/**
 * Try all configured AI keys in order (custom → Groq pool → Gemini pool).
 * Named callGeminiWithRotation for backwards-compatibility.
 */
export async function callGeminiWithRotation(requestBody, customKey = null) {
  const groqKeys   = [];
  const geminiKeys = [];

  // ── Custom key from Settings panel ──────────────────────────────
  if (customKey?.trim()) {
    const k = customKey.trim();
    if (k.startsWith("gsk_")) {
      groqKeys.push({ key: k, label: "Custom-Groq", provider: "groq" });
    } else if (k.startsWith("AIza")) {
      geminiKeys.push({ key: k, label: "Custom-Gemini", provider: "gemini" });
    } else {
      console.warn("[AI] Custom key ignored — must start with gsk_ (Groq) or AIza (Gemini)");
    }
  }

  // ── Pool: Groq ───────────────────────────────────────────────────
  for (let i = 1; i <= 3; i++) {
    const k = process.env[`GROQ_API_KEY_${i}`]?.trim();
    if (!k) continue;
    if (!k.startsWith("gsk_")) {
      console.warn(`[Groq] Key ${i} skipped — must start with gsk_`);
      continue;
    }
    if (!groqKeys.some((e) => e.key === k)) {
      groqKeys.push({ key: k, label: `Groq-Key-${i}`, provider: "groq" });
    }
  }

  // ── Pool: Gemini ─────────────────────────────────────────────────
  for (let i = 1; i <= 3; i++) {
    const k = process.env[`GEMINI_API_KEY_${i}`]?.trim();
    if (!k) continue;
    if (!k.startsWith("AIza")) {
      console.warn(`[Gemini] Key ${i} skipped — must start with AIza`);
      continue;
    }
    if (!geminiKeys.some((e) => e.key === k)) {
      geminiKeys.push({ key: k, label: `Gemini-Key-${i}`, provider: "gemini" });
    }
  }

  const allKeys = [...groqKeys, ...geminiKeys];

  if (allKeys.length === 0) {
    throw new Error(
      "No API keys found. Add GEMINI_API_KEY_1 or GROQ_API_KEY_1 to .env.local"
    );
  }

  console.log(`[AI] Rotation: [${allKeys.map((e) => e.label).join(" → ")}]`);

  for (const { key, label, provider } of allKeys) {
    console.log(`[AI] Trying ${label}...`);

    const result =
      provider === "groq"
        ? await callGroqKey(key, requestBody)
        : await callGeminiKey(key, requestBody);

    if (result.ok) return result.data;

    console.warn(
      `[AI] ${label} failed: ${result.status} — ${String(result.message).slice(0, 100)}`
    );

    if (result.authError) {
      throw new Error(
        `Authentication failed for ${label}. Check your API key.`
      );
    }
    // Otherwise rotate to next key
  }

  throw new Error(
    "All AI API keys are quota-exhausted or failed. Please add a fresh key in ⚙️ Settings, or wait for quota reset."
  );
}
