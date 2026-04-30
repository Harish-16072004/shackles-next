import { NextResponse } from 'next/server';

export async function POST() {
  return NextResponse.json(
    { error: "Event sync is disabled." },
    { status: 503 }
  );
}