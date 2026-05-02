import { z } from 'zod';
import { getSession } from '@/lib/session';
import { createRateLimiter, rateLimitPresets, getClientIdentifier } from '@/lib/rate-limit';
import { NextResponse } from 'next/server';
import { processChatStream } from '@/server/services/ai.service';

// Input validation schema
const chatRequestSchema = z.object({
  messages: z.array(
    z.object({
      role: z.enum(['user', 'assistant']),
      content: z.string().min(1).max(5000),
    })
  ).min(1, "At least one message is required"),
});

// Rate limiter for chat (50 per day per user)
const chatLimiter = createRateLimiter({
  ...rateLimitPresets.chat,
  keyPrefix: "api:chat",
});

export async function POST(req: Request) {
  try {
    // Validate request body
    const body = await req.json().catch(() => ({}));
    const validationResult = chatRequestSchema.safeParse(body);
    
    if (!validationResult.success) {
      return NextResponse.json(
        {
          error: "Invalid request format",
          details: validationResult.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    const { messages } = validationResult.data;
    
    // Get session to identify the user, fallback to "anonymous"
    const session = await getSession();
    const userId = session?.userId ? String(session.userId) : "anonymous";

    // Apply rate limiting based on user ID or IP Address
    const rateLimitKey = session?.userId ? `user:${session.userId}` : `ip:${getClientIdentifier(req)}`;
    const rateLimitResult = await chatLimiter.limit(rateLimitKey);
    
    if (!rateLimitResult.success) {
      return NextResponse.json(
        { error: "Too many chat messages. Please try again later." },
        {
          status: 429,
          headers: {
            "x-ratelimit-limit": String(rateLimitPresets.chat.maxRequests),
            "x-ratelimit-remaining": String(rateLimitResult.remaining),
            "retry-after": String(Math.ceil((rateLimitResult.reset - Date.now()) / 1000)),
          },
        }
      );
    }

    // Call the minimal AI service
    return await processChatStream({ messages, userId });
  } catch (error: any) {
    console.error('[Chat] Endpoint error:', error);
    return NextResponse.json(
      { error: 'Internal Server Error', message: error?.message || 'Unknown error' },
      { status: 500 }
    );
  }
}
