import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getPineconeIndex } from '@/lib/pinecone';
import { getLocalEmbedding } from '@/lib/embeddings';

export async function POST(req: Request) {
  try {
    // 1. Authorization
    const authHeader = req.headers.get('Authorization');
    if (authHeader !== `Bearer ${process.env.ADMIN_SECRET || 'dev-secret'}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2. Fetch Data
    const events = await prisma.event.findMany({
      select: {
        id: true,
        name: true,
        description: true,
        type: true,
      },
    });

    if (!events || events.length === 0) {
      return NextResponse.json({ message: 'No events found in DB to sync' });
    }

    // 3. Process and Embed
    const validVectors: any[] = [];

    for (const event of events) {
      try {
        const textToEmbed = `Event Name: ${event.name}\nType: ${event.type}\nDescription: ${event.description}`;
        console.log(`Syncing: ${event.name}...`);

        const vector = await getLocalEmbedding(textToEmbed);

        if (vector && vector.length > 0) {
          validVectors.push({
            id: String(event.id),
            values: vector,
            metadata: {
              name: String(event.name),
              type: String(event.type),
            },
          });
        }
      } catch (err) {
        console.error(`Skipping event ${event.id} due to error:`, err);
      }
    }

    // 4. Pinecone Upsert (The fix for your "at least 1 record" error)
    if (validVectors.length === 0) {
      return NextResponse.json(
        { error: 'Failed to generate any valid vectors for sync' },
        { status: 500 }
      );
    }

    const index = getPineconeIndex();
    await index.upsert({ records: validVectors });

    return NextResponse.json({ 
      success: true, 
      syncedCount: validVectors.length 
    });

  } catch (error: any) {
    console.error('Critical sync error:', error);
    return NextResponse.json(
      { error: 'Sync process failed', details: error.message },
      { status: 500 }
    );
  }
}