import { GoogleGenAI } from '@google/genai';
import { symposiumContext } from '@/data/events-context';

export interface ProcessChatParams {
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  userId: string;
}

export async function processChatStream({ messages, userId }: ProcessChatParams) {
  try {
    const ai = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY || '',
    });

    // Format messages for @google/genai
    const formattedMessages = messages.map(msg => ({
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: msg.content }],
    }));

    // Start streaming content
    const stream = await ai.models.generateContentStream({
      model: 'gemini-2.5-flash',
      contents: formattedMessages,
      config: {
        systemInstruction: `You are the friendly, concise, and helpful Shackles Symposium AI Assistant.
Your job is to help attendees navigate the symposium, recommend events, and answer questions about rules, venue, and registration.

Use the following strict context about the symposium to answer questions. If the user asks something not covered in this context, politely tell them you don't have that information but they can check the website or contact the organizers. Keep your answers brief and straight to the point. Do not make up any information.

<CONTEXT>
${symposiumContext}
</CONTEXT>

If you are recommending an event, briefly mention its type. If they ask how to register, tell them to navigate to the specific event page.`,
        temperature: 0.2,
      }
    });

    // Create a ReadableStream to pipe back to the client
    const readableStream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of stream) {
            if (chunk.text) {
              controller.enqueue(new TextEncoder().encode(chunk.text));
            }
          }
          controller.close();
        } catch (err) {
          controller.error(err);
        }
      }
    });

    return new Response(readableStream, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Transfer-Encoding': 'chunked',
        'Cache-Control': 'no-cache, no-transform',
      },
    });

  } catch (error) {
    console.error('[AI Service] Error processing chat stream:', error);
    throw error;
  }
}
