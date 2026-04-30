import { streamText, tool } from 'ai';
import { google } from '@ai-sdk/google';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getPineconeIndex } from '@/lib/pinecone';
import { getLocalEmbedding } from '@/lib/embeddings';

// In-memory cache for event recommendations to reduce Pinecone and embedding calls
const recommendationCache = new Map<string, { data: any; expiry: number }>();
const CACHE_TTL_MS = 1000 * 60 * 60; // 1 hour

export interface ProcessChatParams {
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  userId: string;
}

export async function processChatStream({ messages, userId }: ProcessChatParams) {
  const result = streamText({
    model: google('gemini-1.5-flash'),
    system: `You are the friendly and helpful Shackles Symposium AI Assistant.
Your job is to help attendees navigate the symposium, recommend technical and non-technical events, and register them for workshops.
Always be polite, concise, and enthusiastic. Use the provided tools to answer questions about events.
If you register a user successfully, congratulate them enthusiastically!`,
    messages,
    tools: {
      getFestInfo: tool({
        description: 'Get general information about the Shackles Symposium',
        inputSchema: z.object({ dummy: z.string().optional() }),
        execute: async ({ dummy }: any) => {
          return {
            dates: 'April 20-22, 2026',
            location: 'Main Campus',
            generalRules: 'All participants must carry their ID cards. Registrations are final.',
          };
        },
      }),
      recommendEvents: tool({
        description: 'Recommend technical events or workshops based on the user profile or stated interests.',
        inputSchema: z.object({
          interests: z.string().describe('A summary of the user\'s interests or department.'),
        }),
        execute: async ({ interests }: { interests: string }) => {
          try {
            const cacheKey = interests.toLowerCase().trim();
            const cached = recommendationCache.get(cacheKey);
            if (cached && Date.now() < cached.expiry) {
              return cached.data;
            }

            const embeddingVector = await getLocalEmbedding(interests);

            const index = getPineconeIndex();
            const results = await index.query({
              vector: embeddingVector,
              topK: 3,
              includeMetadata: true,
            });

            const mappedResults = results.matches.map((match) => ({
              id: match.id,
              name: match.metadata?.name,
              type: match.metadata?.type,
              score: match.score,
            }));

            // Save to cache
            recommendationCache.set(cacheKey, {
              data: mappedResults,
              expiry: Date.now() + CACHE_TTL_MS,
            });

            return mappedResults;
          } catch (error) {
            console.error('[Chat] Recommendation error:', error);
            return { error: 'Unable to fetch event recommendations at this time' };
          }
        },
      }),
      registerForEvent: tool({
        description: 'Register the user for a specific workshop or event.',
        inputSchema: z.object({
          eventId: z.string().describe('The database ID of the event/workshop to register for'),
        }),
        execute: async ({ eventId }: { eventId: string }) => {
          try {
            const event = await prisma.event.findUnique({
              where: { id: eventId },
            });

            if (!event) {
               return { success: false, message: 'Event not found.' };
            }

            // Check if user exists
            const user = await prisma.user.findUnique({
                where: { id: userId }
            });
            
            if (!user) {
                return { success: false, message: 'User not found in the system. Cannot register.'};
            }

            // Check if already registered
            const existingRegistration = await prisma.eventRegistration.findUnique({
              where: {
                userId_eventId: {
                  userId: userId,
                  eventId: eventId,
                },
              },
            });

            if (existingRegistration) {
              return { success: false, message: 'You are already registered for this event!' };
            }

            // Proceed to register
            await prisma.eventRegistration.create({
              data: {
                userId: userId,
                eventId: eventId,
                source: "ONLINE", 
              },
            });

            return { success: true, message: `Successfully registered for ${event.name}! 🎉 Your spot is confirmed.` };
          } catch (e: any) {
             console.error("[Chat] Registration error:", e);
             return { success: false, message: 'There was an unexpected error processing your registration.'};
          }
        },
      }),
    },
  });

  return result.toTextStreamResponse();
}