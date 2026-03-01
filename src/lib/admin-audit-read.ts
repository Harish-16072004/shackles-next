import { readFile } from "node:fs/promises";
import path from "node:path";

export type AdminAuditRecord = {
  timestamp: string;
  action: string;
  actorId: string;
  actorEmail?: string | null;
  target?: string;
  status?: "SUCCESS" | "FAILED";
  details?: Record<string, unknown>;
};

type FilterOptions = {
  action?: string;
  dateFrom?: string;
  dateTo?: string;
  q?: string;
  limit?: number;
};

function parseLine(line: string): AdminAuditRecord | null {
  try {
    const parsed = JSON.parse(line) as AdminAuditRecord;
    if (!parsed.timestamp || !parsed.action || !parsed.actorId) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function startOfDay(isoDate: string) {
  return new Date(`${isoDate}T00:00:00.000Z`);
}

function endOfDay(isoDate: string) {
  return new Date(`${isoDate}T23:59:59.999Z`);
}

export async function readAdminAuditLogs(options: FilterOptions = {}) {
  const filePath = path.join(process.cwd(), "logs", "admin-audit.log");
  let raw = "";

  try {
    raw = await readFile(filePath, "utf8");
  } catch {
    return [] as AdminAuditRecord[];
  }

  const lines = raw.split(/\r?\n/).filter((line) => line.trim().length > 0);
  const records = lines
    .map(parseLine)
    .filter((record): record is AdminAuditRecord => Boolean(record))
    .sort((left, right) => new Date(right.timestamp).getTime() - new Date(left.timestamp).getTime());

  const actionFilter = options.action?.trim().toUpperCase();
  const dateFrom = options.dateFrom?.trim() ? startOfDay(options.dateFrom.trim()) : null;
  const dateTo = options.dateTo?.trim() ? endOfDay(options.dateTo.trim()) : null;
  const query = options.q?.trim().toLowerCase();

  const filtered = records.filter((record) => {
    if (actionFilter && record.action.toUpperCase() !== actionFilter) return false;

    const timestamp = new Date(record.timestamp);
    if (dateFrom && timestamp < dateFrom) return false;
    if (dateTo && timestamp > dateTo) return false;

    if (query) {
      const haystack = `${record.action} ${record.actorEmail || ""} ${record.actorId} ${record.target || ""} ${JSON.stringify(record.details || {})}`.toLowerCase();
      if (!haystack.includes(query)) return false;
    }

    return true;
  });

  const limit = options.limit && options.limit > 0 ? options.limit : 500;
  return filtered.slice(0, limit);
}
