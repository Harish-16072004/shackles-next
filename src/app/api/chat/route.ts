import { streamText, tool } from 'ai';
import { google } from '@ai-sdk/google';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getPineconeIndex } from '@/lib/pinecone';
import { getSession } from '@/lib/session';
import { getLocalEmbedding } from '@/lib/embeddings';

export async function POST(req: Request) {
  try {
    const { messages } = await req.json();
    
    const session = await getSession();
    // if (!session?.userId) return new Response('Unauthorized', { status: 401 });
    const userId = session?.userId ? String(session.userId) : "testuser";

    const result = streamText({
      model: google('gemini-pro'),
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
            const embeddingVector = await getLocalEmbedding(interests);

            const index = getPineconeIndex();
            const results = await index.query({
              vector: embeddingVector,
              topK: 3,
              includeMetadata: true,
            });

            return results.matches.map((match) => ({
              id: match.id,
              name: match.metadata?.name,
              type: match.metadata?.type,
              score: match.score,
            }));
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
              })
              
              if (!user) {
                  return { success: false, message: 'User not found in the system. Cannot register.'}
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
               console.error("Registration error:", e);
               return { success: false, message: 'There was an unexpected error processing your registration.'}
            }
          },
        }),
      },
    });

    return result.toUIMessageStreamResponse();
  } catch (error: any) {
    console.error('Chat endpoint error:', error);
    require('fs').writeFileSync('chat_error_log.txt', String(error?.stack || error));
    return new Response('Internal Server Error: ' + (error?.message || String(error)), { status: 500 });
  }
}
