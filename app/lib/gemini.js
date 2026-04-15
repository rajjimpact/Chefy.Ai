/**
 * Gemini API helper — simple, direct, always tries all available keys.
 */

const GEMINI_API_BASE =
  "https://generativelanguage.googleapis.com/v1beta/models";

// Models to try in order
const MODELS = ["gemini-1.5-flash", "gemini-2.0-flash"];

/**
 * Makes ONE Gemini API call with a specific key + model.
 * Returns { ok, data, status, message }
 */
async function callGemini(key, model, requestBody) {
  const url = `${GEMINI_API_BASE}/${model}:generateContent?key=${key}`;

  let response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
      cache: "no-store",
    });
  } catch (networkErr) {
    return { ok: false, status: 0, message: `Network error: ${networkErr.message}` };
  }

  let body;
  try {
    body = await response.json();
  } catch {
    return { ok: false, status: response.status, message: "Invalid JSON from Gemini API" };
  }

  if (response.ok) {
    return { ok: true, data: body };
  }

  const message = body?.error?.message || `HTTP ${response.status}`;
  return { ok: false, status: response.status, message };
}

/**
 * Tries each API key against each model until one succeeds.
 * Never stops early — always exhausts all keys before giving up.
 *
 * @param {object} requestBody - Gemini request body
 * @param {string|null} customKey - Optional key from user (tried first)
 */
export async function callGeminiWithRotation(requestBody, customKey = null) {
  // Build key list — custom key goes FIRST
  const keys = [];

  if (customKey && customKey.trim()) {
    keys.push({ key: customKey.trim(), label: "Custom" });
  }

  const envKeys = [
    process.env.GEMINI_API_KEY_1,
    process.env.GEMINI_API_KEY_2,
    process.env.GEMINI_API_KEY_3,
  ];

  for (let i = 0; i < envKeys.length; i++) {
    const k = envKeys[i];
    if (k && k.trim() && k.trim().startsWith("AIzaSy")) {
      const trimmed = k.trim();
      // Don't duplicate if same as custom key
      if (!keys.some((x) => x.key === trimmed)) {
        keys.push({ key: trimmed, label: `System-${i + 1}` });
      }
    }
  }

  console.log(`[Gemini] Keys to try: ${keys.map((k) => k.label).join(", ") || "NONE"}`);

  if (keys.length === 0) {
    throw new Error(
      "No API keys found. Open ⚙️ Settings and paste a Gemini API key from aistudio.google.com"
    );
  }

  const errors = [];

  for (const { key, label } of keys) {
    for (const model of MODELS) {
      console.log(`[Gemini] Trying ${label} + ${model}...`);
      const result = await callGemini(key, model, requestBody);

      if (result.ok) {
        console.log(`[Gemini] ✓ Success: ${label} + ${model}`);
        return result.data;
      }

      console.warn(`[Gemini] ✗ ${label}/${model}: ${result.status} — ${result.message}`);
      errors.push(`[${label}/${model}] ${result.status}: ${result.message}`);

      // If it's an auth/key error, no point trying other models with same key
      if (result.status === 400 || result.status === 401 || result.status === 403) {
        break; // skip remaining models for THIS key, try next key
      }
    }
  }

  // All keys + models failed
  console.error("[Gemini] All attempts failed:\n" + errors.join("\n"));

  // Show the most relevant error (from the custom key if present, else first error)
  const firstError = errors[0] || "Unknown error";
  const isAuthError = errors.some((e) => /expired|invalid|forbidden|unauthorized/i.test(e));
  const isQuotaError = errors.some((e) => /429|quota/i.test(e));

  if (isAuthError) {
    throw new Error(
      "API key error: " +
        (errors[0]?.split(": ").slice(2).join(": ") || "Invalid or expired key") +
        " — Try a new key from aistudio.google.com in ⚙️ Settings"
    );
  }
  if (isQuotaError) {
    throw new Error(
      "All API keys hit quota. Open ⚙️ Settings and paste a fresh key from aistudio.google.com"
    );
  }

  throw new Error(firstError);
}
