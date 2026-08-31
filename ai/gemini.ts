import 'dotenv/config';
import { GoogleGenAI } from "@google/genai";

if (!process.env.GEMINI_API_KEY) {
  console.warn("[Gemini] Warning: GEMINI_API_KEY environment variable is not defined.");
}

export const gemini = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY || "",
});