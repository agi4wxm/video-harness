// 文字尺寸估计：inspect 在 Node 里没有字体排版，用字符类别宽度近似（误差约 ±10%，校验留了余量）。
// runtime 渲染时按同一个框居中绘制，所以 inspect 的框与画面一致。

const CJK = /[⺀-鿿豈-﫿＀-￯　-〿]/;

export function charEm(ch: string, font: "display" | "sans" | "mono"): number {
  if (font === "mono") return CJK.test(ch) ? 1 : 0.6;
  if (CJK.test(ch)) return 1;
  if (ch === " ") return 0.27;
  if (/[il.,:;'!|]/.test(ch)) return 0.28;
  if (/[mwMW@%]/.test(ch)) return 0.86;
  if (/[A-Z]/.test(ch)) return font === "display" ? 0.66 : 0.64;
  if (/[0-9]/.test(ch)) return 0.6;
  return font === "display" ? 0.55 : 0.53;
}

export function textWidth(text: string, size: number, font: "display" | "sans" | "mono"): number {
  let em = 0;
  for (const ch of text) em += charEm(ch, font);
  return em * size;
}

/** 在 maxW 内放下一行：返回字号（不超过 size） */
export function fitSize(text: string, size: number, maxW: number, font: "display" | "sans" | "mono"): number {
  const w = textWidth(text, size, font);
  return w <= maxW ? size : Math.max(8, Math.floor((size * maxW) / w));
}

/** 文字框：以 (cx, cy) 为锚点，align 决定水平锚点含义 */
export function textBox(text: string, size: number, font: "display" | "sans" | "mono", cx: number, cy: number, align: "left" | "center" | "right" = "center") {
  const w = textWidth(text, size, font);
  const h = size * 1.25;
  const x = align === "center" ? cx - w / 2 : align === "left" ? cx : cx - w;
  return { x, y: cy - h / 2, w, h };
}
