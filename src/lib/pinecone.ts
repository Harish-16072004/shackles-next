import { Pinecone } from '@pinecone-database/pinecone';

if (!process.env.PINECONE_API_KEY) {
  console.warn('PINECONE_API_KEY is not defined in the environment variables');
}

export const pinecone = new Pinecone({
  apiKey: process.env.PINECONE_API_KEY || '',
});

export const getPineconeIndex = () => {
  const indexName = process.env.PINECONE_INDEX || 'shackles-events';
  return pinecone.Index(indexName);
};
