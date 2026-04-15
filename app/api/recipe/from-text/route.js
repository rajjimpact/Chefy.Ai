import { NextResponse } from "next/server";
import { callGeminiWithRotation } from "../../../lib/gemini";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request) {
  try {
    const { ingredients } = await request.json();

    if (!ingredients || ingredients.length === 0) {
      return NextResponse.json(
        { error: "No ingredients provided" },
        { status: 400 }
      );
    }

    const ingredientList = ingredients.join(", ");

    const prompt = `Give me a recipe using: ${ingredientList}. Reply ONLY with JSON in this exact format:
{"title":"Name","ingredients":["amount item",...],"instructions":["Step 1",...]}`;

    const customKey = request.headers.get("x-custom-gemini-key");

    const geminiData = await callGeminiWithRotation(
      {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 1024 },
      },
      customKey
    );

    const rawText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text || "";
    const cleaned = rawText.replace(/```json\s*/gi, "").replace(/```\s*/gi, "").trim();

    let recipe;
    try {
      recipe = JSON.parse(cleaned);
    } catch {
      console.error("Failed to parse Gemini response:", rawText);
      return NextResponse.json(
        { error: "Failed to parse recipe from AI response" },
        { status: 500 }
      );
    }

    return NextResponse.json(recipe);
  } catch (error) {
    console.error("Route error:", error.message);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: error.message?.includes("quota") ? 429 : 500 }
    );
  }
}
