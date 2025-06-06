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
});

export type AppRouter = typeof appRouter; 