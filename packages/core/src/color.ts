// 颜色工具：hex 解析、线性 sRGB 混合、WCAG 对比度、OKLab 亮度 / 彩度（与 analyze 的测量口径一致）。

export function parseHex(c: string): [number, number, number] {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(c.trim());
  if (!m) throw new Error(`不是 hex 颜色：${c}`);
  let h = m[1];
  if (h.length === 3) h = h.split("").map((x) => x + x).join("");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
export const isHex = (c: string) => /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(c.trim());
const toLin = (v: number) => { const x = v / 255; return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; };
const fromLin = (x: number) => Math.round(255 * (x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055));
const hex2 = (n: number) => Math.max(0, Math.min(255, n)).toString(16).padStart(2, "0");

export function mix(a: string, b: string, t: number): string {
  const A = parseHex(a).map(toLin), B = parseHex(b).map(toLin);
  return "#" + A.map((x, i) => hex2(fromLin(x + (B[i] - x) * t))).join("");
}

export function luminance(c: string): number {
  const [r, g, b] = parseHex(c).map(toLin);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function contrast(a: string, b: string): number {
  const la = luminance(a), lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

export function oklab(c: string): { L: number; C: number } {
  const [r, g, b] = parseHex(c).map(toLin);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return { L, C: Math.hypot(A, B) };
}
