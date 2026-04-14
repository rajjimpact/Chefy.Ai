/**
 * Gemini API key rotation helper.
 *
 * Reads up to 3 keys from env vars and tries each in order.
 * Moves to the next key on a 429 (quota exceeded) response.
 * Throws if all keys are exhausted.
 */

const GEMINI_API_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";

function getKeys() {
  const keys = [
    process.env.GEMINI_API_KEY_1,
    process.env.GEMINI_API_KEY_2,
    process.env.GEMINI_API_KEY_3,
  ].filter((k) => k && k.trim() !== "");

  if (keys.length === 0) {
    throw new Error("No Gemini API keys configured in .env.local");
  }
  return keys;
}

/**
 * Call the Gemini API with automatic key rotation on 429 errors.
 *
 * @param {object} requestBody  - The full Gemini request body
 * @param {string} customKey    - Optional user-provided API key to prioritize
 * @returns {Promise<object>}   - Parsed Gemini JSON response
 * @throws {Error}              - If all keys fail
 */
export async function callGeminiWithRotation(requestBody, customKey = null) {
  let keys = getKeys();
  if (customKey && customKey.trim() !== "") {
    // Only add if not already the first element
    keys = [customKey.trim(), ...keys.filter(k => k !== customKey.trim())];
  }
  
  let lastError = null;

  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    const keyLabel = i === 0 && customKey ? "Custom Key" : `Key ${i + 1}`;

    try {
      console.log(`[Gemini] Trying ${keyLabel}...`);
      const response = await fetch(`${GEMINI_API_URL}?key=${key}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });

      if (response.ok) {
        console.log(`[Gemini] ${keyLabel} succeeded.`);
        return await response.json();
      }

      const errText = await response.text();
      let errJson = {};
      try {
        errJson = JSON.parse(errText);
      } catch {
        /* ignore */
      }

      const statusCode = response.status;
      const message = errJson?.error?.message || errText;

      if (statusCode === 429) {
        // Quota exceeded — rotate to next key
        console.warn(`[Gemini] ${keyLabel} quota exhausted, rotating... (${message.slice(0, 120)})`);
        lastError = { statusCode: 429, message };
        continue; // try next key
      }

      // Non-429 error — fail immediately (wrong model, auth issue, etc.)
      console.error(`[Gemini] ${keyLabel} failed with ${statusCode}:`, message);
      throw new Error(message);
    } catch (err) {
      // Network / timeout errors — try next key
      if (err.message?.includes("Connect Timeout") || err.code === "UND_ERR_CONNECT_TIMEOUT") {
        console.warn(`[Gemini] ${keyLabel} timed out, rotating...`);
        lastError = { statusCode: 503, message: "Connection timed out" };
        continue;
      }
      throw err; // Re-throw unexpected errors immediately
    }
  }

  // All keys exhausted
  const msg =
    lastError?.statusCode === 429
      ? "All API keys have reached their quota limit. Please try again later."
      : lastError?.message || "All API keys failed.";
  throw new Error(msg);
}
