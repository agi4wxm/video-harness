// 字幕切行：参考集字幕每行中位 8 字、P90 13 字；默认每行 ≤ 12 字（theme.layout.captionMaxChars）。
import type { VoiceT } from "./types";

export type CaptionLine = { text: string; s: number; e: number };

export function buildCaptions(voice: VoiceT, maxChars: number): CaptionLine[] {
  const lines: CaptionLine[] = [];
  for (const seg of voice.segments) {
    const words = voice.words.filter((w) => (w.s + w.e) / 2 >= seg.s && (w.s + w.e) / 2 <= seg.e);
    if (!words.length) continue;
    const total = words.reduce((n, w) => n + [...w.w].length, 0);
    const n = Math.max(1, Math.ceil(total / maxChars));
    const target = Math.ceil(total / n);
    let cur: typeof words = [];
    let len = 0;
    const flush = () => {
      if (!cur.length) return;
      lines.push({ text: cur.map((w) => w.w).join(""), s: cur[0].s, e: cur[cur.length - 1].e });
      cur = [];
      len = 0;
    };
    for (const w of words) {
      const l = [...w.w].length;
      if (len + l > target && len > 0) flush();
      cur.push(w);
      len += l;
    }
    flush();
  }
  // 每行显示到下一行开始（同一句内无缝衔接），句末保留到语音结束后 0.2s
  for (let i = 0; i < lines.length; i++) {
    const next = lines[i + 1];
    lines[i].e = next && next.s - lines[i].e < 0.6 ? next.s : lines[i].e + 0.2;
  }
  return lines;
}
