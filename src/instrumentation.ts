/**
 * src/instrumentation.ts
 *
 * Next.js Instrumentation hook — executed ONCE at server startup,
 * before the first request is served.
 *
 * We use this as the canonical "fail-fast" entry point for:
 *   1. Environment variable validation  (validateServerEnv)
 *
 * Keeping startup validation here ensures that a misconfigured deployment
 * crashes immediately with a clear error instead of failing silently on the
 * first live request.
 *
 * Docs: https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */
export async function register() {
  // Only run server-side logic in the Node.js runtime.
  // The Edge runtime has a separate, limited environment.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { validateServerEnv } = await import("@/lib/env");
    validateServerEnv();
  }
}
