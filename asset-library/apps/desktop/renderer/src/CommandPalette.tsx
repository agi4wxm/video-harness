// ⌘K 命令面板：搜索素材、跳转视图
import React, { useEffect, useMemo, useRef, useState } from "react";
import { api, type CatalogItem } from "./api.ts";
import { Icon } from "./icons.tsx";
import { typeInfo, type Tax } from "./ui.tsx";

export interface Command { id: string; title: string; icon: string; run: () => void; meta?: string }

export function CommandPalette({ tax, commands, onOpen, onClose }: { tax: Tax; commands: Command[]; onOpen: (id: string) => void; onClose: () => void }) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<CatalogItem[]>([]);
  const [i, setI] = useState(0);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { ref.current?.focus(); }, []);
  useEffect(() => {
    if (!q.trim()) { setHits([]); return; }
    const t = setTimeout(() => api.entries({ q }).then((r) => setHits(r.slice(0, 12))), 90);
    return () => clearTimeout(t);
  }, [q]);
  const cmds = useMemo(() => commands.filter((c) => !q || c.title.includes(q)), [q, commands]);
  const rows: Array<{ key: string; run: () => void; node: React.ReactNode; group: string }> = [
    ...hits.map((h) => { const t = typeInfo(tax, h.type); return { key: h.id, group: "素材", run: () => onOpen(h.id), node: <><span className="dot" style={{ background: t.color }} />{h.title}<span className="meta">{t.catLabel} · {t.label}</span></> }; }),
    ...cmds.map((c) => ({ key: c.id, group: "跳转", run: c.run, node: <><Icon name={c.icon} style={{ width: 15, height: 15, opacity: 0.7 }} />{c.title}{c.meta ? <span className="meta">{c.meta}</span> : null}</> })),
  ];
  const go = (k: number) => { rows[k]?.run(); onClose(); };
  return (
    <div className="overlay" onMouseDown={onClose}>
      <div className="cmdk" onMouseDown={(e) => e.stopPropagation()}>
        <input ref={ref} placeholder="搜索素材、类别或命令…" value={q} onChange={(e) => { setQ(e.target.value); setI(0); }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") { e.preventDefault(); setI(Math.min(rows.length - 1, i + 1)); }
            else if (e.key === "ArrowUp") { e.preventDefault(); setI(Math.max(0, i - 1)); }
            else if (e.key === "Enter") go(i);
            else if (e.key === "Escape") onClose();
          }} />
        <div className="res">
          {rows.map((r, k) => (
            <React.Fragment key={r.key}>
              {k === 0 || rows[k - 1].group !== r.group ? <div className="grp">{r.group}</div> : null}
              <button className={`it${k === i ? " on" : ""}`} onMouseEnter={() => setI(k)} onClick={() => go(k)}>{r.node}</button>
            </React.Fragment>
          ))}
          {!rows.length ? <div className="grp">没有结果</div> : null}
        </div>
      </div>
    </div>
  );
}
