// 积木：大字标题。对应参考集 kinetic-text 段与"放大"强调（emphasis=scale 占 18%）。
import React from "react";
import { AbsoluteFill } from "remotion";
import { useColor, useEnter, useFontPx, usePop, useSegment, useStagger, useTheme } from "../../_sdk";
import type { Params } from "./schema";

type Run = { text: string; emph: boolean };

function splitRuns(line: string, emphasis: string[]): Run[] {
  const runs: Run[] = [];
  let i = 0;
  while (i < line.length) {
    const hit = emphasis.filter((e) => e && line.startsWith(e, i)).sort((a, b) => b.length - a.length)[0];
    if (hit) {
      runs.push({ text: hit, emph: true });
      i += hit.length;
    } else {
      const last = runs[runs.length - 1];
      if (last && !last.emph) last.text += line[i];
      else runs.push({ text: line[i], emph: false });
      i += 1;
    }
  }
  return runs;
}

const Char: React.FC<{ ch: string; delayS: number; mode: Params["mode"] }> = ({ ch, delayS, mode }) => {
  const style = useEnter({ delayS, from: "bottom", distance: "sm", mode: mode === "pop" ? "pop" : "slide" });
  return <span style={{ display: "inline-block", whiteSpace: "pre", ...style }}>{ch}</span>;
};

const Emph: React.FC<{ text: string; delayS: number; mode: Params["mode"]; charDelay: number }> = ({ text, delayS, mode, charDelay }) => {
  const accent = useColor("accent2");
  const pop = usePop(delayS + text.length * charDelay + 0.1);
  const scale = 1 + 0.12 * Math.sin(Math.min(1, pop) * Math.PI) ;
  return (
    <span style={{ display: "inline-block", color: accent, transform: `scale(${scale})` }}>
      {[...text].map((c, i) => (
        <Char key={i} ch={c} delayS={delayS + i * charDelay} mode={mode} />
      ))}
    </span>
  );
};

export const TitleKinetic: React.FC<Params> = ({ lines, emphasis = [], subtitle, size = "display", mode = "chars" }) => {
  const { style, motion } = useTheme();
  const fg = useColor("fg");
  const muted = useColor("fgMuted");
  const { box } = useSegment();
  // 自动缩放：最长一行必须放得下（规范 H4），不允许意外折行
  const longest = Math.max(...lines.map((l) => [...l].reduce((n, c) => n + (/[\x00-\xff]/.test(c) ? 0.6 : 1), 0)));
  const fontPx = Math.min(useFontPx(size), Math.floor((box.w * 0.88) / Math.max(1, longest)));
  const subPx = useFontPx("body");
  const stagger = useStagger();
  const charDelay = mode === "chars" ? motion.charStaggerS : 0;
  const subStyle = useEnter({ delayS: stagger(lines.length) + motion.enterS, from: "bottom", mode: "slide" });

  let cursor = 0;
  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", padding: "0 6%" }}>
      <div style={{ textAlign: "center", fontFamily: style.font.sans, fontWeight: 900, color: fg, fontSize: fontPx, lineHeight: 1.18 }}>
        {lines.map((line, li) => {
          const lineDelay = mode === "lines" ? stagger(li) * 2 : cursor * charDelay + li * motion.staggerS;
          const runs = splitRuns(line, emphasis);
          let local = 0;
          const out = (
            <div key={li} style={{ whiteSpace: "nowrap" }}>
              {runs.map((r, ri) => {
                const d = lineDelay + local * charDelay;
                local += r.text.length;
                return r.emph ? (
                  <Emph key={ri} text={r.text} delayS={d} mode={mode} charDelay={charDelay} />
                ) : (
                  [...r.text].map((c, ci) => <Char key={`${ri}-${ci}`} ch={c} delayS={d + ci * charDelay} mode={mode} />)
                );
              })}
            </div>
          );
          cursor += line.length;
          return out;
        })}
        {subtitle ? (
          <div style={{ marginTop: fontPx * 0.35, fontSize: subPx, fontWeight: 500, color: muted, ...subStyle }}>{subtitle}</div>
        ) : null}
      </div>
    </AbsoluteFill>
  );
};

export default TitleKinetic;
