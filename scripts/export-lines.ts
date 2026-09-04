// Regenerates src/soundassets/lines.json + tts.csv from the single source of
// truth: VOICE_LINES in src/game/dialogue.ts. Run after any dialogue edit:
//
//   npm run export:lines
//
// Do NOT hand-edit lines.json / tts.csv — they are generated output.
import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { VOICE_LINES } from "../src/game/dialogue.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(__dirname, "../src/soundassets");

type Row = {
  file: string;
  who: string;
  mood: string;
  dialog: string;
  emo_text: string;
  emo_alpha: number;
};

const rows: Row[] = VOICE_LINES.map((line) => ({
  file: line.file,
  who: line.speaker,
  mood: line.mood,
  dialog: line.text,
  emo_text: line.emo_text,
  emo_alpha: line.emo_alpha,
}));

// lines.json — same shape TTS tooling already reads, now including emo fields.
const jsonPath = resolve(outDir, "lines.json");
writeFileSync(jsonPath, `${JSON.stringify(rows, null, 2)}\n`, "utf8");

// tts.csv — CSV export with proper quoting for commas/quotes in text fields.
function csvField(value: string | number): string {
  const s = String(value);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

const header = "file,who,mood,dialog,emo_text,emo_alpha";
const csvLines = [
  header,
  ...rows.map((r) =>
    [r.file, r.who, r.mood, r.dialog, r.emo_text, r.emo_alpha].map(csvField).join(","),
  ),
];
const csvPath = resolve(outDir, "tts.csv");
writeFileSync(csvPath, `${csvLines.join("\n")}\n`, "utf8");

console.log(`Exported ${rows.length} lines from dialogue.ts ->`);
console.log(`  ${jsonPath}`);
console.log(`  ${csvPath}`);
