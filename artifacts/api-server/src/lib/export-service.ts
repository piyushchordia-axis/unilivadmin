/**
 * Tabular export helpers — produce CSV and PDF (via pdf-lib, already a
 * dependency). Used by report and guest-list exports (Persona st.34, st.47).
 *
 * WS11: standardised on CSV + PDF only — the legacy .xls (SpreadsheetML 2003)
 * output has been removed. Every export carries a human-readable document
 * header showing the property name and the export date.
 */
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

export interface ExportTable {
  title: string;
  headers: string[];
  rows: (string | number | null | undefined)[][];
  /** Optional property name rendered in the document/header line. */
  propertyName?: string | null;
  /** Optional data date-range label rendered in the header (e.g. "01/06/2026 → 23/06/2026"). */
  dateRange?: string | null;
  /** Timestamp the file was generated. Defaults to "now" at render time. */
  exportDate?: Date;
}

/* ── Date formatting ──────────────────────────────────────────────────────────
 * Centralised human-readable formatters. All exports go through these so that
 * dates never leak out as raw ISO/epoch strings. */

const pad = (n: number) => String(n).padStart(2, "0");

/** dd/MM/yyyy — for a calendar date (e.g. service date). */
export function fmtDate(value: Date | string | number | null | undefined): string {
  if (value == null || value === "") return "";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

/** dd/MM/yyyy HH:mm — for a datetime (e.g. delivered-at). */
export function fmtDateTime(value: Date | string | number | null | undefined): string {
  if (value == null || value === "") return "";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** yyyy-MM-dd — unambiguous date stamp for filenames. */
export function fileDateStamp(value: Date = new Date()): string {
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
}

/** Strip filesystem-unsafe characters from a label so it can go in a filename. */
export function sanitizeForFilename(label: string | null | undefined): string {
  return String(label ?? "")
    .replace(/[\\/:*?"<>|]+/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

/* ── CSV ──────────────────────────────────────────────────────────────────── */

const csvEsc = (v: unknown) => {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/**
 * Builds a CSV document for one table. Prepends a metadata block (title,
 * property, date-range, export date) above the column header so the file is
 * self-describing, mirroring the PDF header.
 */
export function toCsv(table: ExportTable): string {
  const exportDate = table.exportDate ?? new Date();
  const meta: string[] = [csvEsc(table.title)];
  if (table.propertyName) meta.push(`Property: ${table.propertyName}`);
  if (table.dateRange) meta.push(`Range: ${table.dateRange}`);
  meta.push(`Exported: ${fmtDateTime(exportDate)}`);

  const lines: string[] = [];
  // One metadata cell per line keeps the header readable in a spreadsheet.
  for (const m of meta) lines.push(csvEsc(m));
  lines.push(""); // blank separator row
  lines.push(table.headers.map(csvEsc).join(","));
  for (const r of table.rows) lines.push(r.map(csvEsc).join(","));
  // BOM so Excel reads UTF-8 correctly.
  return "﻿" + lines.join("\n");
}

/* ── PDF ──────────────────────────────────────────────────────────────────── */

/** Builds a landscape A4 PDF table; paginates rows automatically. */
export async function toPdf(table: ExportTable): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const pageW = 842; // A4 landscape
  const pageH = 595;
  const margin = 36;
  const navy = rgb(0.06, 0.09, 0.16);
  const orange = rgb(0.98, 0.45, 0.09);
  const grey = rgb(0.42, 0.45, 0.5);
  const lightRow = rgb(0.96, 0.98, 0.99);

  const cols = table.headers.length;
  const usableW = pageW - margin * 2;
  const colW = usableW / cols;
  const rowH = 20;
  const fontSize = 8;

  const fit = (text: string, width: number) => {
    let s = String(text ?? "");
    while (s.length > 0 && font.widthOfTextAtSize(s, fontSize) > width - 6) s = s.slice(0, -1);
    return s.length < String(text ?? "").length ? s.slice(0, -1) + "…" : s;
  };

  let page = doc.addPage([pageW, pageH]);
  let y = pageH - margin;

  const exportDate = table.exportDate ?? new Date();
  // Metadata line below the title: property + date-range + export timestamp.
  const metaParts: string[] = [];
  if (table.propertyName) metaParts.push(`Property: ${table.propertyName}`);
  if (table.dateRange) metaParts.push(`Range: ${table.dateRange}`);
  metaParts.push(`Exported: ${fmtDateTime(exportDate)}`);
  const metaLine = metaParts.join("    ");

  const drawTitle = () => {
    page.drawText(table.title, { x: margin, y: y - 4, size: 14, font: bold, color: navy });
    page.drawRectangle({ x: margin, y: y - 12, width: 48, height: 3, color: orange });
    y -= 26;
    page.drawText(metaLine, { x: margin, y: y - 4, size: 8, font, color: grey });
    y -= 18;
  };
  const drawHeader = () => {
    page.drawRectangle({ x: margin, y: y - rowH + 4, width: usableW, height: rowH, color: navy });
    table.headers.forEach((h, i) => {
      page.drawText(fit(h, colW), {
        x: margin + i * colW + 4,
        y: y - rowH + 10,
        size: fontSize,
        font: bold,
        color: rgb(1, 1, 1),
      });
    });
    y -= rowH;
  };

  drawTitle();
  drawHeader();

  table.rows.forEach((row, idx) => {
    if (y < margin + rowH) {
      page = doc.addPage([pageW, pageH]);
      y = pageH - margin;
      drawHeader();
    }
    if (idx % 2 === 0) {
      page.drawRectangle({ x: margin, y: y - rowH + 4, width: usableW, height: rowH, color: lightRow });
    }
    row.forEach((cell, i) => {
      page.drawText(fit(cell == null ? "" : String(cell), colW), {
        x: margin + i * colW + 4,
        y: y - rowH + 10,
        size: fontSize,
        font,
        color: rgb(0.1, 0.12, 0.16),
      });
    });
    y -= rowH;
  });

  return doc.save();
}

/**
 * @deprecated WS11 removed SpreadsheetML (.xls) exports. This stub remains only
 * so any stale import resolves; it throws to surface accidental use. Use toCsv
 * or toPdf instead. No endpoint emits .xls anymore.
 */
export function toXls(_table: ExportTable): string {
  throw new Error("toXls is deprecated and removed (WS11). Use toCsv or toPdf.");
}
