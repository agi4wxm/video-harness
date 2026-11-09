// 配音：script.md → 逐句调用 ElevenLabs（with-timestamps）→ 拼接 + 精确停顿 + 响度规范化 → public/vh/voice.wav + voice.json。
// 付费步骤：默认只做预估（dry run），加 --yes 才合成；已缓存的句子不再扣额度。
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { VoiceT } from "@video-harness/core";
import type { Project } from "./project.ts";
import { VhError, audioDuration, cacheDir, httpJson, log, sha, writeJson } from "./util.ts";

export interface ScriptSentence { text: string; para: number; pauseBefore: number }

/** 解析 script.md：空行分段；`[pause 1.2]` 单独一行表示额外停顿；# 标题、> 注释、front matter 忽略。 */
export function parseScript(src: string, pauses: { sentence: number; paragraph: number }): ScriptSentence[] {
  const body = src.replace(/^---\n[\s\S]*?\n---\n?/, "");
  const out: ScriptSentence[] = [];
  let para = 0, extra = 0, newPara = false;
  const lines = body.split("\n");
  let buf: string[] = [];
  const flush = () => {
    const text = buf.join(" ").replace(/\s+/g, " ").trim();
    buf = [];
    if (!text) return;
    const parts = text.match(/[^.!?。！？]+(?:[.!?。！？]+["”’)]?|$)/g)?.map((x) => x.trim()).filter(Boolean) ?? [text];
    parts.forEach((p, i) => {
      const base = out.length === 0 ? 0 : i === 0 && newPara ? pauses.paragraph : pauses.sentence;
      out.push({ text: p, para, pauseBefore: base + (i === 0 ? extra : 0) });
    });
    extra = 0;
    newPara = false;
  };
  for (const raw of lines) {
    const line = raw.trim();
    const pm = /^\[pause\s+([\d.]+)\]$/i.exec(line);
    if (pm) { flush(); extra += Number(pm[1]); continue; }
    if (line.startsWith("#") || line.startsWith(">")) continue;
    if (!line) { if (buf.length) { flush(); para++; newPara = true; } continue; }
    buf.push(line);
  }
  flush();
  return out;
}

interface TtsResult { audio_base64: string; alignment: { characters: string[]; character_start_times_seconds: number[]; character_end_times_seconds: number[] } }

function cacheKey(pr: Project, s: ScriptSentence, prev: string, next: string) {
  const v = pr.file.voice;
  return sha(JSON.stringify([v.model_id, v.voice_id, v.settings, s.text, prev, next]));
}

async function tts(pr: Project, text: string, prev: string, next: string): Promise<TtsResult> {
  const v = pr.file.voice;
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${v.voice_id}/with-timestamps?output_format=mp3_44100_128`;
  const body: Record<string, unknown> = { text, model_id: v.model_id, voice_settings: { stability: v.settings.stability, similarity_boost: v.settings.similarity_boost, style: v.settings.style, speed: v.settings.speed } };
  if (prev) body.previous_text = prev;
  if (next) body.next_text = next;
  const key = process.env.ELEVENLABS_API_KEY ?? "proxy-injected";
  for (let attempt = 0; attempt < 3; attempt++) {
    const r = httpJson("POST", url, { "xi-api-key": key }, body);
    if (r.status === 200 && r.json) return r.json as TtsResult;
    if (r.status === 429 || r.status >= 500) { await new Promise((ok) => setTimeout(ok, 2000 * (attempt + 1))); continue; }
    throw new VhError(`ElevenLabs ${r.status}: ${r.text.slice(0, 300)}`);
  }
  throw new VhError("ElevenLabs 多次重试失败");
}

function quota(): { used: number; limit: number } | null {
  try {
    const r = httpJson("GET", "https://api.elevenlabs.io/v1/user", { "xi-api-key": process.env.ELEVENLABS_API_KEY ?? "proxy-injected" });
    const sub = r.json?.subscription;
    return r.status === 200 && sub ? { used: sub.character_count, limit: sub.character_limit } : null;
  } catch { return null; }
}

export async function voice(pr: Project, opts: { yes: boolean }): Promise<Record<string, unknown>> {
  if (!existsSync(pr.paths.script)) throw new VhError("还没有 script.md", "写旁白文案到 script.md");
  const src = readFileSync(pr.paths.script, "utf8");
  const sentences = parseScript(src, pr.file.voice.pauses);
  if (!sentences.length) throw new VhError("script.md 里没有可朗读的文字");
  const dir = cacheDir("tts");
  const keys = sentences.map((s, i) => cacheKey(pr, s, sentences[i - 1]?.text ?? "", sentences[i + 1]?.text ?? ""));
  const missing = sentences.filter((_, i) => !existsSync(join(dir, `${keys[i]}.json`)));
  const chars = missing.reduce((n, s) => n + s.text.length, 0);
  const plan = { sentences: sentences.length, cached: sentences.length - missing.length, to_synthesize: missing.length, characters: chars, model: pr.file.voice.model_id, voice_id: pr.file.voice.voice_id };
  if (missing.length && !opts.yes) {
    return { dry_run: true, ...plan, quota: quota(), next: "确认后运行 vh voice --yes（会消耗上面的字符数）" };
  }
  for (let i = 0; i < sentences.length; i++) {
    const f = join(dir, `${keys[i]}.json`);
    if (existsSync(f)) continue;
    log(`tts ${i + 1}/${sentences.length}: ${sentences[i].text.slice(0, 50)}`);
    const r = await tts(pr, sentences[i].text, sentences[i - 1]?.text ?? "", sentences[i + 1]?.text ?? "");
    writeFileSync(f, JSON.stringify(r));
  }
  // 拼接：每句解码成 wav，前面插入停顿
  const tmp = join(tmpdir(), `vh-voice-${process.pid}`);
  mkdirSync(tmp, { recursive: true });
  const words: VoiceT["words"] = [], segments: VoiceT["segments"] = [], pauses: VoiceT["pauses"] = [];
  const list: string[] = [];
  let off = 0;
  const silence = (sec: number, name: string) => {
    const p = join(tmp, name);
    execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "anullsrc=r=44100:cl=mono", "-t", sec.toFixed(3), "-c:a", "pcm_s16le", p]);
    return p;
  };
  for (let i = 0; i < sentences.length; i++) {
    const s = sentences[i];
    const r = JSON.parse(readFileSync(join(dir, `${keys[i]}.json`), "utf8")) as TtsResult;
    if (s.pauseBefore > 0) {
      list.push(silence(s.pauseBefore, `p${i}.wav`));
      if (i > 0) pauses.push({ s: +off.toFixed(3), e: +(off + s.pauseBefore).toFixed(3) });
      off += s.pauseBefore;
    }
    const mp3 = join(tmp, `s${i}.mp3`), wav = join(tmp, `s${i}.wav`);
    writeFileSync(mp3, Buffer.from(r.audio_base64, "base64"));
    execFileSync("ffmpeg", ["-v", "error", "-y", "-i", mp3, "-ac", "1", "-ar", "44100", "-c:a", "pcm_s16le", wav]);
    const dur = audioDuration(wav);
    const a = r.alignment;
    // 字符 → 词：拉丁文按空格切，中日文每个字一个词
    let cur: { w: string; s: number; e: number } | null = null;
    for (let k = 0; k < a.characters.length; k++) {
      const ch = a.characters[k], cs = off + a.character_start_times_seconds[k], ce = off + a.character_end_times_seconds[k];
      if (/\s/.test(ch)) { if (cur) { words.push(cur); cur = null; } continue; }
      if (/[⺀-鿿]/.test(ch)) { if (cur) { words.push(cur); cur = null; } words.push({ w: ch, s: +cs.toFixed(3), e: +ce.toFixed(3) }); continue; }
      if (!cur) cur = { w: ch, s: +cs.toFixed(3), e: +ce.toFixed(3) }; else { cur.w += ch; cur.e = +ce.toFixed(3); }
    }
    if (cur) words.push(cur);
    const st = a.character_start_times_seconds, en = a.character_end_times_seconds;
    segments.push({ text: s.text, s: +(off + (st[0] ?? 0)).toFixed(3), e: +(off + (en[en.length - 1] ?? dur)).toFixed(3), para: s.para });
    list.push(wav);
    off += dur;
  }
  const tail = 0.6;
  list.push(silence(tail, "tail.wav"));
  off += tail;
  const listFile = join(tmp, "list.txt");
  writeFileSync(listFile, list.map((p) => `file '${p}'`).join("\n"));
  const outDir = join(pr.paths.public, "vh");
  mkdirSync(outDir, { recursive: true });
  const raw = join(tmp, "raw.wav"), out = join(outDir, "voice.wav");
  execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", listFile, "-c:a", "pcm_s16le", raw]);
  // 响度规范化到 -14 LUFS / -1.5 dBTP（规范 H9）；loudnorm 只改增益与动态，不改变时间轴
  execFileSync("ffmpeg", ["-v", "error", "-y", "-i", raw, "-af", "acompressor=threshold=-22dB:ratio=3:attack=5:release=120:makeup=4,loudnorm=I=-14:TP=-1.5:LRA=7", "-ar", "44100", "-ac", "1", "-c:a", "pcm_s16le", out]);
  rmSync(tmp, { recursive: true, force: true });
  const v: VoiceT = {
    audio: "vh/voice.wav", duration: +audioDuration(out).toFixed(3), words, segments, pauses,
    source: { provider: "elevenlabs", model: pr.file.voice.model_id, voice_id: pr.file.voice.voice_id, script_hash: sha(src) },
  };
  writeJson(pr.paths.voice, v);
  return { ...plan, duration: v.duration, segments: segments.length, words: words.length, voice: pr.paths.voice, audio: out, next: "vh status" };
}

export function scriptHash(pr: Project): string | null {
  return existsSync(pr.paths.script) ? sha(readFileSync(pr.paths.script, "utf8")) : null;
}
