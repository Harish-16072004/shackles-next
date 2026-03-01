import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";

type AuditEntry = {
  action: string;
  actorId: string;
  actorEmail?: string | null;
  target?: string;
  status?: "SUCCESS" | "FAILED";
  details?: Record<string, unknown>;
};

export async function logAdminAudit(entry: AuditEntry) {
  try {
    const logsDir = path.join(process.cwd(), "logs");
    await mkdir(logsDir, { recursive: true });

    const payload = {
      timestamp: new Date().toISOString(),
      ...entry,
    };

    await appendFile(path.join(logsDir, "admin-audit.log"), `${JSON.stringify(payload)}\n`, "utf8");
  } catch (error) {
    console.error("[admin-audit] log write failed", error);
  }
}
