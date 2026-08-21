import { GoogleGenAI } from "@google/genai";    
export const gemini =  new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
});
if (!gemini) {
  throw new Error("Missing GEMINI_API_KEY environment variable.")}