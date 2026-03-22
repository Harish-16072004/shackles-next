import { Prisma, PrismaClient } from "@prisma/client";

type SerializableRetryOptions = {
  maxRetries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isSerializableRetryableError(error: unknown) {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2034") return true;
  }

  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return (
      message.includes("could not serialize access") ||
      message.includes("deadlock detected") ||
      message.includes("serialization")
    );
  }

  return false;
}

export async function runSerializableTransaction<T>(
  prisma: PrismaClient,
  callback: (tx: Prisma.TransactionClient) => Promise<T>,
  options?: SerializableRetryOptions
): Promise<T> {
  const maxRetries = options?.maxRetries ?? 3;
  const baseDelayMs = options?.baseDelayMs ?? 40;
  const maxDelayMs = options?.maxDelayMs ?? 400;

  let attempt = 0;

  while (true) {
    try {
      return await prisma.$transaction(callback, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (error) {
      if (!isSerializableRetryableError(error) || attempt >= maxRetries) {
        throw error;
      }

      const exponentialDelay = Math.min(maxDelayMs, baseDelayMs * 2 ** attempt);
      const jitter = Math.floor(Math.random() * Math.max(1, Math.floor(exponentialDelay / 2)));
      await sleep(exponentialDelay + jitter);
      attempt += 1;
    }
  }
}
