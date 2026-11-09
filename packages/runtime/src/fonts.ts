// 字体随 runtime 打包（@fontsource，OFL），渲染时不联网。按本片实际出现的文字触发加载，delayRender 到加载完成。
import "@fontsource/fredoka/500.css";
import "@fontsource/fredoka/600.css";
import "@fontsource/fredoka/700.css";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import "@fontsource/noto-sans-sc/500.css";
import "@fontsource/noto-sans-sc/700.css";
import "@fontsource/noto-sans-sc/900.css";
import "@fontsource/jetbrains-mono/500.css";

const FACES: Array<[string, number[]]> = [
  ["Fredoka", [500, 600, 700]],
  ["Inter", [400, 500, 600, 700]],
  ["Noto Sans SC", [500, 700, 900]],
  ["JetBrains Mono", [500]],
];

export async function loadFonts(sample: string): Promise<void> {
  const text = Array.from(new Set([...sample])).join("") || "A";
  await Promise.all(FACES.flatMap(([f, ws]) => ws.map((w) => document.fonts.load(`${w} 48px "${f}"`, text).catch(() => []))));
  await document.fonts.ready;
}
