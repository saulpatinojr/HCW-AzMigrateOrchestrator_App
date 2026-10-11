export interface CsvPreview {
  headers: string[];
  rows: string[][];
  rowCount: number;
  warnings: string[];
}

/** Split one CSV line into cells, honouring double-quoted cells (an embedded delimiter stays inside its cell, `""` is a quote). */
export function splitCsvLine(line: string, delim: string): string[] {
  const out: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === delim) { out.push(cell); cell = ""; }
    else cell += c;
  }
  out.push(cell);
  return out.map((c) => c.trim());
}

const lineSplit = (text: string): string[] => text.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim());
const sniffDelimiter = (header: string): string => [",", ";", "\t"].sort((a, b) => header.split(b).length - header.split(a).length)[0];

/** Lightweight client-side preview (first rows/columns) and column sanity warnings before upload. */
export function previewCsv(text: string, maxRows = 5, maxCols = 8): CsvPreview {
  const lines = lineSplit(text);
  if (!lines.length) return { headers: [], rows: [], rowCount: 0, warnings: ["The file is empty."] };
  const delim = sniffDelimiter(lines[0]);
  const cells = (l: string) => splitCsvLine(l, delim).slice(0, maxCols);
  const headers = cells(lines[0]);
  const low = headers.map((h) => h.toLowerCase());
  const warnings: string[] = [];
  if (!low.includes("name")) warnings.push("No NAME column found — the assessment will be rejected.");
  if (!low.some((h) => h === "type" || h === "resource type")) warnings.push("No TYPE column found — the assessment will be rejected.");
  const hasId = low.some((h) => h.includes("resource id") || h === "id");
  const hasLink = low.some((h) => h === "resource link" || h === "portal link" || h === "link");
  if (!hasId && hasLink) warnings.push("No RESOURCE ID column: resource ids will be derived from the RESOURCE LINK column of the portal export.");
  else if (!hasId) warnings.push("No RESOURCE ID column: parent/child relationships cannot be discovered. Re-export with the Resource ID column for better results.");
  return { headers, rows: lines.slice(1, 1 + maxRows).map(cells), rowCount: lines.length - 1, warnings };
}

/**
 * Distinct, non-empty values of the first column whose header (case-insensitive) is one of `headerNames`, in first-seen order.
 * Used to tell the questionnaire which regions the export already lives in. Never throws on a malformed file: it returns [].
 */
export function csvColumnValues(text: string, headerNames: string[], maxValues = 50): string[] {
  const lines = lineSplit(text);
  if (!lines.length) return [];
  const delim = sniffDelimiter(lines[0]);
  const headers = splitCsvLine(lines[0], delim).map((h) => h.toLowerCase());
  const wanted = headerNames.map((h) => h.toLowerCase());
  const col = headers.findIndex((h) => wanted.includes(h));
  if (col === -1) return [];
  const seen = new Set<string>();
  for (const line of lines.slice(1)) {
    const v = splitCsvLine(line, delim)[col];
    if (v) seen.add(v);
    if (seen.size >= maxValues) break;
  }
  return [...seen];
}
