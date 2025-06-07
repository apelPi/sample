import { z } from 'zod';
import { baseProcedure, createTRPCRouter } from '../init';
import { GoogleGenAI } from '@google/genai';

export const appRouter = createTRPCRouter({
  gemini: baseProcedure
    .input(z.object({
      history: z.array(z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string(),
      }))
    }))
    .mutation(async ({ input }) => {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
      // Gemini expects: [{ role: 'user'|'model', parts: [{ text: '...' }] }]
      const contents = input.history.map(msg => ({
        role: msg.role === 'assistant' ? 'model' : msg.role,
        parts: [{ text: msg.content }],
      }));
      const response = await ai.models.generateContent({
        model: 'gemini-2.0-flash',
        contents,
      });
      // Adjust this depending on the actual response structure
      return { response: response.text };
    }),
  geminiTitle: baseProcedure
    .input(z.object({ prompt: z.string() }))
    .mutation(async ({ input }) => {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
      const response = await ai.models.generateContent({
        model: 'gemini-2.0-flash',
        contents: [
          { role: 'user', parts: [{ text: input.prompt }] }
        ],
      });
      // Return the title as plain text
      return { title: response.text };
    }),
    generateImage: baseProcedure
    .input(z.object({ prompt: z.string() }))
    .mutation(async ({ input }) => {
      // Call Gemini API for image generation
      const apiKey = process.env.GEMINI_API_KEY!;
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp-image-generation:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: input.prompt }] }],
            generationConfig: { responseModalities: ["Text", "Image"] },
          }),
        }
      );
      const data = await response.json();
      const parts = data?.candidates?.[0]?.content?.parts || [];
      const imagePart = parts.find((p: any) => p.inlineData?.data);
      if (!imagePart) throw new Error("No image generated");
      return { imageBase64: imagePart.inlineData.data };
    }),
});

export type AppRouter = typeof appRouter; 