import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const key = searchParams.get("key") || "";

  if (!key) {
    return NextResponse.json({
      error: "Provide a key via ?key=... (AIzaSy... for Gemini, gsk_... for Groq)",
    }, { status: 400 });
  }

  const keyPreview = key.slice(0, 8) + "..." + key.slice(-4);
  const isGroq = key.startsWith("gsk_");
  const isGemini = key.startsWith("AIzaSy");

  if (isGroq) {
    // Test Groq key
    const models = ["llama-3.3-70b-versatile", "llama-3.1-8b-instant"];
    const results = [];
    for (const model of models) {
      try {
        const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
          body: JSON.stringify({
            model,
            messages: [{ role: "user", content: "Say hello in one word." }],
            max_tokens: 10,
          }),
          cache: "no-store",
        });
        const data = await res.json();
        if (res.ok) {
          results.push({ model, status: res.status, success: true, response: data.choices?.[0]?.message?.content });
        } else {
          results.push({ model, status: res.status, success: false, error: data?.error?.message?.slice(0, 100) });
        }
      } catch (err) {
        results.push({ model, status: 0, success: false, error: err.message });
      }
    }
    return NextResponse.json({ keyPreview, keyType: "Groq", overallSuccess: results.some(r => r.success), results });
  }

  if (isGemini) {
    // Test Gemini key
    const models = ["gemini-2.0-flash-lite", "gemini-2.0-flash"];
    const results = [];
    const testBody = { contents: [{ parts: [{ text: "Say hello in one word." }] }], generationConfig: { maxOutputTokens: 10 } };
    for (const model of models) {
      try {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(testBody),
          cache: "no-store",
        });
        const data = await res.json();
        if (res.ok) {
          const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
          results.push({ model, status: res.status, success: true, response: text });
        } else {
          results.push({ model, status: res.status, success: false, error: data?.error?.message?.slice(0, 150) });
        }
      } catch (err) {
        results.push({ model, status: 0, success: false, error: err.message });
      }
    }
    return NextResponse.json({ keyPreview, keyType: "Gemini", overallSuccess: results.some(r => r.success), results });
  }

  return NextResponse.json({
    error: "Key format not recognized. Must start with AIzaSy (Gemini) or gsk_ (Groq)",
    keyPreview,
  }, { status: 400 });
}
