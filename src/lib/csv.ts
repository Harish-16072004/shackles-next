export function parseCsv(content: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let inQuotes = false;

  for (let index = 0; index < content.length; index += 1) {
    const char = content[index];

    if (char === '"') {
      const nextChar = content[index + 1];
      if (inQuotes && nextChar === '"') {
        value += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ',' && !inQuotes) {
      row.push(value.trim());
      value = "";
      continue;
    }

    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && content[index + 1] === '\n') {
        index += 1;
      }
      row.push(value.trim());
      value = "";

      if (row.some((field) => field !== "")) {
        rows.push(row);
      }

      row = [];
      continue;
    }

    value += char;
  }

  row.push(value.trim());
  if (row.some((field) => field !== "")) {
    rows.push(row);
  }

  return rows;
}

export function stringifyCsvRow(values: Array<string | number | boolean | null | undefined>) {
  return values
    .map((value) => {
      const normalized = value == null ? "" : String(value);
      if (/[",\n\r]/.test(normalized)) {
        return `"${normalized.replace(/"/g, '""')}"`;
      }
      return normalized;
    })
    .join(',');
}

export function csvHeaderMap(headerRow: string[]) {
  const map = new Map<string, number>();
  headerRow.forEach((header, index) => {
    map.set(header.trim().toLowerCase(), index);
  });
  return map;
}

export function readCsvField(row: string[], headerMap: Map<string, number>, key: string) {
  const index = headerMap.get(key.toLowerCase());
  if (index == null) return "";
  return (row[index] || "").trim();
}
