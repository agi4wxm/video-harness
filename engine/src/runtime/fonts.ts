// 字体随引擎打包（@fontsource，OFL），渲染时不联网。
// 字体按 unicode-range 分片按需加载，所以要用本片实际出现的文字触发加载，并 delayRender 到加载完成。
import "@fontsource/noto-sans-sc/400.css";
import "@fontsource/noto-sans-sc/700.css";
import "@fontsource/noto-sans-sc/900.css";
import "@fontsource/inter/400.css";
import "@fontsource/inter/700.css";
import "@fontsource/inter/800.css";
import "@fontsource/jetbrains-mono/500.css";
import "@fontsource/jetbrains-mono/700.css";

const FACES: Array<[string, number[]]> = [
  ["Noto Sans SC", [400, 700, 900]],
  ["Inter", [400, 700, 800]],
  ["JetBrains Mono", [500, 700]],
];

export async function loadFonts(sample: string): Promise<void> {
  const text = Array.from(new Set([...sample])).join("") || "A";
  await Promise.all(
    FACES.flatMap(([family, weights]) => weights.map((w) => document.fonts.load(`${w} 48px "${family}"`, text))),
  );
  await document.fonts.ready;
}
