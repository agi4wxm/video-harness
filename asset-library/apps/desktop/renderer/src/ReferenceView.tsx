// 拆解记录：元信息、实测指标、分段时间线、每段拆出的素材
import React, { useEffect, useState } from "react";
import { api, type CatalogItem, type EntryDetail } from "./api.ts";
import { Card, Empty, type Tax } from "./ui.tsx";

const SEG_COLORS = ["#5B6CFF", "#2FB98A", "#E0A030", "#F0644B", "#C46BE8", "#14B8C4", "#8C93A8", "#5B8DEF", "#9A7B5B", "#D9487D"];

export function ReferenceView({ tax, id, all, selected, onSelect }: { tax: Tax; id: string; all: CatalogItem[]; selected: string | null; onSelect: (id: string) => void }) {
  const [d, setD] = useState<EntryDetail | null>(null);
  const [seg, setSeg] = useState(0);
  useEffect(() => { setD(null); api.entry(id).then(setD); }, [id]);
  if (!d) return <Empty icon="film" title="加载中…" />;
  const e = d.entry;
  const spec = e.spec as any;
  const segs: Array<{ start: number; end: number; title: string; notes?: string }> = spec.segments ?? [];
  const dur = spec.meta?.duration_s ?? segs.at(-1)?.end ?? 1;
  const metrics: Record<string, number> = spec.metrics ?? {};
  const byId = new Map(all.map((x) => [x.id, x]));
  const atOf = (x: EntryDetail["derived"][number]) => (x.at ? Number(x.at.replace("t=", "").split("-")[0]) : NaN);
  const inSeg = (s: { start: number; end: number }) => d.derived.filter((x) => { const t = atOf(x); return t >= s.start && t < s.end; });
  const cur = segs[seg];
  const LABEL: Record<string, string> = { speech_chars: "旁白字数", chars_per_min_speaking: "语速（字/分，说话时）", segment_median_s: "段时长中位（秒）", montage_cut_s: "蒙太奇每镜（秒）", cuts_in_pause: "切点落在停顿里", loudness_lufs: "响度（LUFS）", lra_lu: "响度范围（LU）", chars_per_min_overall: "语速（字/分，全片）" };
  return (
    <div className="page">
      <div className="ref-hero">
        <div className="cover">{e.previews[0] ? <img src={api.fileUrl(e.id, e.previews[0])} alt="" /> : null}</div>
        <div>
          <div style={{ color: "var(--muted)", fontSize: 12 }}>拆解记录 · {spec.meta?.author}</div>
          <h2 style={{ margin: "4px 0 8px" }}>{spec.meta?.title ?? e.title}</h2>
          <p className="lead" style={{ margin: 0 }}>{e.summary}</p>
          <div className="metrics">
            {Object.entries(metrics).slice(0, 6).map(([k, v]) => <div className="metric" key={k}><b>{k === "cuts_in_pause" ? `${Math.round(v * 100)}%` : v}</b><span>{LABEL[k] ?? k}</span></div>)}
          </div>
          <div style={{ marginTop: 12, color: "var(--muted)", fontSize: 12 }}>{spec.meta?.resolution} · {spec.meta?.fps}fps · {dur}s · 拆出 {d.derived.length} 条素材</div>
        </div>
      </div>

      <div className="section-h"><h3>叙事结构</h3><span>宽度按时长；点一段查看这段拆出的素材</span></div>
      <div className="timeline">
        {segs.map((s, i) => (
          <button key={i} className={i === seg ? "on" : ""} style={{ width: `${((s.end - s.start) / dur) * 100}%`, background: SEG_COLORS[i % SEG_COLORS.length] }} onClick={() => setSeg(i)} title={s.title}>{s.title}</button>
        ))}
      </div>
      {cur ? (
        <div className="seg-detail">
          <div className="about">
            <div className="time">{cur.start.toFixed(1)}s – {cur.end.toFixed(1)}s</div>
            <h4 style={{ fontSize: 15 }}>{cur.title}</h4>
            <p style={{ color: "var(--text-2)", margin: 0, lineHeight: 1.6 }}>{cur.notes}</p>
          </div>
          <div className="mini-grid">
            {inSeg(cur).map((x) => { const it = byId.get(x.id); return it ? <Card key={x.id} tax={tax} item={it} selected={selected === x.id} onClick={() => onSelect(x.id)} /> : null; })}
            {inSeg(cur).length === 0 ? <div style={{ color: "var(--muted)" }}>这一段没有登记素材</div> : null}
          </div>
        </div>
      ) : null}
      {spec.audio ? (
        <>
          <div className="section-h"><h3>声音</h3></div>
          <div className="box"><dl className="kv">{Object.entries(spec.audio).map(([k, v]) => <React.Fragment key={k}><dt>{k === "music" ? "配乐" : k === "sfx" ? "音效" : k}</dt><dd>{String(v)}</dd></React.Fragment>)}</dl></div>
        </>
      ) : null}
    </div>
  );
}
