import React, { useCallback, useEffect, useMemo, useState } from "react";
import { api, type CatalogItem, type LibraryInfo, type Taxonomy } from "./api.ts";
import { CommandPalette, type Command } from "./CommandPalette.tsx";
import { Icon } from "./icons.tsx";
import { Inspector } from "./Inspector.tsx";
import { ReferenceView } from "./ReferenceView.tsx";
import { IssuesView, ReviewView } from "./ReviewView.tsx";
import { TaxonomyView } from "./TaxonomyView.tsx";
import { Card, Empty, Row, STATUS_LABEL, typeInfo, type Tax } from "./ui.tsx";

type View =
  | { kind: "library"; category?: string; type?: string; style?: string }
  | { kind: "taxonomy" } | { kind: "reference"; id: string } | { kind: "review" } | { kind: "issues" };

export function App() {
  const [taxonomy, setTaxonomy] = useState<Taxonomy | null>(null);
  const [info, setInfo] = useState<LibraryInfo | null>(null);
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [hits, setHits] = useState<string[] | null>(null);
  const [view, setView] = useState<View>({ kind: "library" });
  const [status, setStatus] = useState<string>("");
  const [prov, setProv] = useState<string>("");
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<string | null>(null);
  const [mode, setMode] = useState<"grid" | "list">(() => (localStorage.getItem("mode") as "grid" | "list") ?? "grid");
  const [size, setSize] = useState(() => Number(localStorage.getItem("size") ?? 220));
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [palette, setPalette] = useState(false);
  const [theme, setTheme] = useState<string>(() => localStorage.getItem("theme") ?? "system");
  const [toastMsg, setToast] = useState<{ m: string; err: boolean } | null>(null);
  const [creating, setCreating] = useState(false);

  const toast = useCallback((m: string, err = false) => { setToast({ m, err }); setTimeout(() => setToast(null), err ? 5000 : 2200); }, []);
  const refresh = useCallback(() => Promise.all([api.entries({}).then(setItems), api.library().then(setInfo)]).catch((e) => toast(e.message, true)), [toast]);

  useEffect(() => { api.taxonomy().then(setTaxonomy); refresh(); }, [refresh]);
  useEffect(() => { try { localStorage.setItem("mode", mode); localStorage.setItem("size", String(size)); localStorage.setItem("theme", theme); } catch { /* 无痕模式 */ } }, [mode, size, theme]);
  useEffect(() => { if (theme === "system") delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = theme; }, [theme]);
  useEffect(() => {
    if (!q.trim()) { setHits(null); return; }
    const t = setTimeout(() => api.entries({ q }).then((r) => setHits(r.map((x) => x.id))), 120);
    return () => clearTimeout(t);
  }, [q]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setPalette(true); }
      else if (e.key === "Escape") { setPalette(false); setCreating(false); }
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, []);

  const tax: Tax | null = useMemo(() => (taxonomy ? { cats: taxonomy.categories, byId: Object.fromEntries(taxonomy.categories.map((c) => [c.id, c])) } : null), [taxonomy]);

  const filtered = useMemo(() => {
    let out = items;
    if (hits) { const order = new Map(hits.map((h, i) => [h, i])); out = out.filter((x) => order.has(x.id)).sort((a, b) => order.get(a.id)! - order.get(b.id)!); }
    if (view.kind === "library") {
      if (view.category) out = out.filter((x) => x.category === view.category);
      if (view.type) out = out.filter((x) => x.type === view.type);
      if (view.style) out = out.filter((x) => x.styles.includes(view.style!) || x.id === view.style);
    }
    if (status) out = out.filter((x) => x.status === status);
    if (prov) out = out.filter((x) => x.provenance === prov);
    return out;
  }, [items, hits, view, status, prov]);

  if (!taxonomy || !tax || !info) return <div className="empty" style={{ height: "100%" }}><div>正在打开素材库…</div></div>;

  const counts = info.stats.byType;
  const styles = items.filter((x) => x.type === "style.pack");
  const refs = items.filter((x) => x.type === "reference.video");
  const go = (v: View) => { setView(v); setQ(""); if (v.kind === "taxonomy" || v.kind === "issues") setSel(null); };
  const openEntry = (id: string) => { if (id.startsWith("reference.video/")) { go({ kind: "reference", id }); setSel(null); } else setSel(id); };
  const isLib = (f: Partial<{ category: string; type: string; style: string }>) => view.kind === "library" && view.category === f.category && view.type === f.type && view.style === f.style;

  const title = view.kind === "library"
    ? view.type ? typeInfo(tax, view.type).label : view.category ? tax.byId[view.category].name : view.style ? items.find((x) => x.id === view.style)?.title ?? "风格包" : "全部素材"
    : view.kind === "taxonomy" ? "分类体系" : view.kind === "reference" ? "拆解记录" : view.kind === "review" ? "审查" : "校验问题";

  // 按小类分组（选了大类或全部时）
  const groups: Array<{ key: string; label: string; items: CatalogItem[] }> = (() => {
    if (view.kind !== "library" || view.type || hits) return [{ key: "all", label: "", items: filtered }];
    const m = new Map<string, CatalogItem[]>();
    for (const x of filtered) { const k = x.type; if (!m.has(k)) m.set(k, []); m.get(k)!.push(x); }
    const order = taxonomy.categories.flatMap((c) => c.subtypes.map((s) => `${c.id}.${s.id}`));
    return order.filter((k) => m.has(k)).map((k) => ({ key: k, label: `${typeInfo(tax, k).catLabel} · ${typeInfo(tax, k).label}`, items: m.get(k)! }));
  })();

  const commands: Command[] = [
    { id: "all", title: "全部素材", icon: "grid", run: () => go({ kind: "library" }) },
    { id: "tax", title: "分类体系与归类向导", icon: "tree", run: () => go({ kind: "taxonomy" }) },
    { id: "review", title: "审查队列", icon: "inbox", run: () => go({ kind: "review" }) },
    { id: "issues", title: "校验问题", icon: "alert", run: () => go({ kind: "issues" }) },
    ...taxonomy.categories.map((c) => ({ id: c.id, title: c.name, icon: c.icon, meta: c.en, run: () => go({ kind: "library", category: c.id }) })),
    ...refs.map((r) => ({ id: r.id, title: r.title, icon: "film", meta: "拆解记录", run: () => go({ kind: "reference", id: r.id }) })),
  ];

  return (
    <div className={`app${sel ? " with-inspector" : ""}`}>
      <aside className="sidebar">
        <div className="drag"><div className="brand"><span className="logo"><i style={{ background: "#7C9BFF" }} /><i style={{ background: "#FFC857" }} /><i style={{ background: "#4FE3B0" }} /><i style={{ background: "#E58CFF" }} /></span><span className="name" title={info.meta.name}>{info.meta.name}</span></div></div>
        <div className="side-scroll">
          <div className="side-section" style={{ marginTop: 4 }}>
            <button className={`side-item${isLib({}) && !status ? " active" : ""}`} onClick={() => { go({ kind: "library" }); setStatus(""); }}><Icon name="grid" />全部素材<span className="count">{info.stats.total}</span></button>
            <button className={`side-item${view.kind === "review" ? " active" : ""}`} onClick={() => go({ kind: "review" })}><Icon name="inbox" />审查<span className="count">{info.stats.byStatus.review || ""}</span></button>
            <button className={`side-item${isLib({}) && status === "approved" ? " active" : ""}`} onClick={() => { go({ kind: "library" }); setStatus("approved"); }}><Icon name="checkCircle" />已通过<span className="count">{info.stats.byStatus.approved}</span></button>
            <button className={`side-item${isLib({}) && status === "draft" ? " active" : ""}`} onClick={() => { go({ kind: "library" }); setStatus("draft"); }}><Icon name="pencil" />草稿<span className="count">{info.stats.byStatus.draft}</span></button>
          </div>
          <div className="side-section">
            <div className="side-title">分类</div>
            {taxonomy.categories.map((c) => (
              <div key={c.id}>
                <button className={`side-item${isLib({ category: c.id }) ? " active" : ""}`} onClick={() => { go({ kind: "library", category: c.id }); setOpen({ ...open, [c.id]: true }); }}>
                  <Icon name="chevron" className={`chev${open[c.id] ? " open" : ""}`} style={{}} />
                  <span className="dot" style={{ background: c.color }} />{c.name}<span className="count">{info.stats.byCategory[c.id] || ""}</span>
                </button>
                {open[c.id] ? (
                  <div className="side-sub">
                    {c.subtypes.map((s) => { const t = `${c.id}.${s.id}`; return <button key={t} className={`side-item${isLib({ type: t }) ? " active" : ""}`} onClick={() => go({ kind: "library", type: t })}>{s.name}<span className="count">{counts[t] || ""}</span></button>; })}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
          {styles.length ? (
            <div className="side-section">
              <div className="side-title">风格包</div>
              {styles.map((s) => <button key={s.id} className={`side-item${isLib({ style: s.id }) ? " active" : ""}`} onClick={() => go({ kind: "library", style: s.id })}><Icon name="palette" /><span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.title}</span></button>)}
            </div>
          ) : null}
          {refs.length ? (
            <div className="side-section">
              <div className="side-title">拆解记录</div>
              {refs.map((r) => <button key={r.id} className={`side-item${view.kind === "reference" && view.id === r.id ? " active" : ""}`} onClick={() => { go({ kind: "reference", id: r.id }); setSel(null); }}><Icon name="film" /><span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.title.replace(/[《》]/g, "")}</span></button>)}
            </div>
          ) : null}
          <div className="side-section">
            <div className="side-title">工具</div>
            <button className={`side-item${view.kind === "taxonomy" ? " active" : ""}`} onClick={() => go({ kind: "taxonomy" })}><Icon name="tree" />分类体系</button>
            <button className={`side-item${view.kind === "issues" ? " active" : ""}`} onClick={() => go({ kind: "issues" })}><Icon name="alert" />校验问题</button>
          </div>
        </div>
        <div className="side-foot">
          <Icon name="folder" style={{ width: 14, height: 14, flex: "none" }} />
          <span className="path" title={info.root}>{info.root}</span>
          {window.desktop ? <button className="icon-btn" style={{ width: 24, height: 24 }} title="打开其他素材库" onClick={() => window.desktop!.chooseLibrary()}><Icon name="refresh" /></button> : null}
        </div>
      </aside>

      <main className="main">
        <div className="toolbar">
          <h1>{title}</h1>
          {view.kind === "library" || view.kind === "review" ? <span className="sub">{filtered.length} 条</span> : null}
          <div className="spacer" />
          <div className="search" onClick={() => document.getElementById("q")?.focus()}>
            <Icon name="search" />
            <input id="q" placeholder="搜索素材" value={q} onChange={(e) => { setQ(e.target.value); if (view.kind !== "library" && view.kind !== "review") setView({ kind: "library" }); }} />
            <button className="kbd" onClick={() => setPalette(true)}>⌘K</button>
          </div>
          {view.kind === "library" ? (
            <>
              <div className="seg"><button className={mode === "grid" ? "on" : ""} onClick={() => setMode("grid")} title="网格"><Icon name="grid" style={{ width: 14, height: 14 }} /></button><button className={mode === "list" ? "on" : ""} onClick={() => setMode("list")} title="列表"><Icon name="list" style={{ width: 14, height: 14 }} /></button></div>
              {mode === "grid" ? <input type="range" min={160} max={360} value={size} onChange={(e) => setSize(Number(e.target.value))} style={{ width: 80 }} title="缩略图大小" /> : null}
            </>
          ) : null}
          <button className="icon-btn" title="切换外观" onClick={() => setTheme(theme === "dark" ? "light" : theme === "light" ? "system" : "dark")}><Icon name={theme === "light" ? "sun" : theme === "dark" ? "moon" : "compass"} /></button>
          <button className="icon-btn" title="重新载入素材库" onClick={() => api.reindex().then(refresh).then(() => toast("已重新载入"))}><Icon name="refresh" /></button>
          <button className="btn primary" onClick={() => setCreating(true)}><Icon name="plus" />新建</button>
        </div>

        {view.kind === "library" ? (
          <div className="filters">
            {["", "draft", "review", "approved", "deprecated"].map((s) => <button key={s || "all"} className={`chip${status === s ? " on" : ""}`} onClick={() => setStatus(s)}>{s ? STATUS_LABEL[s] : "全部状态"}</button>)}
            <span className="sep" />
            {[["", "全部来源"], ["decomposed", "拆解"], ["made", "自制"], ["generated", "生成"], ["licensed", "授权"], ["user-provided", "用户提供"]].map(([k, l]) => <button key={k || "all"} className={`chip${prov === k ? " on" : ""}`} onClick={() => setProv(k)}>{l}</button>)}
            {view.category ? <><span className="sep" />{tax.byId[view.category].subtypes.map((s) => { const t = `${view.category}.${s.id}`; return counts[t] ? <button key={t} className="chip" onClick={() => go({ kind: "library", type: t })}><span className="dot" style={{ background: tax.byId[view.category!].color }} />{s.name} {counts[t]}</button> : null; })}</> : null}
          </div>
        ) : null}

        <div className="content" style={{ ["--card-w" as string]: `${size}px` }}>
          {view.kind === "library" && (filtered.length === 0 ? <Empty title={q ? "没有找到" : "这里还没有素材"} hint={q ? "换个关键词试试，或用 ⌘K 搜索全部" : "点右上角「新建」，或用 lib add 命令添加"} /> : mode === "grid" ? (
            groups.map((g) => (
              <section key={g.key}>
                {g.label ? <div className="group-title"><h2>{g.label}</h2><span>{g.items.length}</span></div> : null}
                <div className="grid">{g.items.map((x) => <Card key={x.id} tax={tax} item={x} selected={sel === x.id} onClick={() => openEntry(x.id)} />)}</div>
              </section>
            ))
          ) : (
            <div className="list">{filtered.map((x) => <Row key={x.id} tax={tax} item={x} selected={sel === x.id} onClick={() => openEntry(x.id)} />)}</div>
          ))}
          {view.kind === "taxonomy" && <TaxonomyView tax={tax} taxonomy={taxonomy} counts={counts} onFilter={(t) => go({ kind: "library", type: t })} />}
          {view.kind === "reference" && <ReferenceView tax={tax} id={view.id} all={items} selected={sel} onSelect={setSel} />}
          {view.kind === "review" && <ReviewView tax={tax} items={filtered} selected={sel} onSelect={setSel} />}
          {view.kind === "issues" && <IssuesView onSelect={openEntry} />}
        </div>
      </main>

      {sel ? <Inspector tax={tax} id={sel} onClose={() => setSel(null)} onOpen={openEntry} onChanged={refresh} toast={toast} /> : null}
      {palette ? <CommandPalette tax={tax} commands={commands} onOpen={openEntry} onClose={() => setPalette(false)} /> : null}
      {creating ? <CreateDialog tax={tax} onClose={() => setCreating(false)} onCreated={(id) => { setCreating(false); refresh().then(() => setSel(id)); toast("已新建草稿"); }} toast={toast} /> : null}
      {toastMsg ? <div className={`toast${toastMsg.err ? " err" : ""}`}>{toastMsg.m}</div> : null}
    </div>
  );
}

function CreateDialog({ tax, onClose, onCreated, toast }: { tax: Tax; onClose: () => void; onCreated: (id: string) => void; toast: (m: string, e?: boolean) => void }) {
  const [type, setType] = useState("content.vector");
  const [slug, setSlug] = useState("");
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [kind, setKind] = useState("made");
  const t = typeInfo(tax, type);
  const submit = () => api.create({ type, slug, title, summary, provenance: { kind } }).then((e) => onCreated(e.id)).catch((e) => toast(e.message, true));
  const field: React.CSSProperties = { width: "100%", height: 34, borderRadius: 8, border: "1px solid var(--line)", background: "var(--bg)", padding: "0 10px", outline: 0 };
  return (
    <div className="overlay" onMouseDown={onClose}>
      <div className="cmdk" style={{ padding: 20 }} onMouseDown={(e) => e.stopPropagation()}>
        <h3 style={{ margin: "0 0 14px" }}>新建素材</h3>
        <div style={{ display: "grid", gap: 10 }}>
          <label>类型<select style={field} value={type} onChange={(e) => setType(e.target.value)}>{tax.cats.map((c) => <optgroup key={c.id} label={c.name}>{c.subtypes.map((s) => <option key={s.id} value={`${c.id}.${s.id}`}>{c.name} · {s.name}</option>)}</optgroup>)}</select></label>
          {t.sub ? <div style={{ color: "var(--muted)", fontSize: 12 }}>{t.sub.description}</div> : null}
          <label>短名（英文，用于 id）<input style={field} value={slug} placeholder="gas-tank-gauge" onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"))} /></label>
          <label>标题<input style={field} value={title} placeholder="气罐液位图标" onChange={(e) => setTitle(e.target.value)} /></label>
          <label>简介<input style={field} value={summary} onChange={(e) => setSummary(e.target.value)} /></label>
          <label>来源<select style={field} value={kind} onChange={(e) => setKind(e.target.value)}>{[["made", "自制"], ["decomposed", "拆解自参考视频"], ["generated", "模型生成"], ["licensed", "外部授权"], ["user-provided", "用户提供"]].map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
          <div style={{ color: "var(--muted)", fontSize: 12 }}>id：<code className="inline">{type}/{slug || "…"}</code></div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 6 }}><button className="btn" onClick={onClose}>取消</button><button className="btn primary" disabled={!slug || !title} onClick={submit}>新建草稿</button></div>
        </div>
      </div>
    </div>
  );
}
