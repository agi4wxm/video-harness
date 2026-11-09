// 右侧检视面板：预览、概览、来源、关系、审查、文件
import React, { useEffect, useState } from "react";
import { api, type EntryDetail } from "./api.ts";
import { Icon } from "./icons.tsx";
import { PROV_LABEL, SpecView, StatusPill, typeInfo, type Tax } from "./ui.tsx";

const isImg = (r: string) => /\.(png|jpe?g|webp|gif|svg|avif)$/i.test(r);
const isVideo = (r: string) => /\.(mp4|webm|mov)$/i.test(r);
const isAudio = (r: string) => /\.(mp3|wav|m4a|ogg)$/i.test(r);

export function Inspector({ tax, id, onClose, onOpen, onChanged, toast }: {
  tax: Tax; id: string; onClose: () => void; onOpen: (id: string) => void; onChanged: () => void; toast: (m: string, err?: boolean) => void;
}) {
  const [d, setD] = useState<EntryDetail | null>(null);
  const [tab, setTab] = useState<"overview" | "source" | "relations" | "review" | "files">("overview");
  const [pi, setPi] = useState(0);
  const [checks, setChecks] = useState<Record<string, string>>({});
  const [note, setNote] = useState("");
  const load = () => api.entry(id).then((x) => { setD(x); setChecks({}); setNote(""); }).catch((e) => toast(e.message, true));
  useEffect(() => { setD(null); setPi(0); load(); }, [id]);
  if (!d) return <aside className="inspector"><div className="insp-head" /></aside>;
  const e = d.entry;
  const t = typeInfo(tax, e.type);
  const previews = e.previews;
  const cur = previews[pi];
  const colors = Array.isArray((e.spec as any).colors) ? ((e.spec as any).colors as Array<{ token: string; hex: string; meaning?: string }>) : null;

  const act = async (fn: () => Promise<unknown>, ok: string) => {
    try { await fn(); toast(ok); await load(); onChanged(); } catch (err) { toast((err as Error).message, true); }
  };

  return (
    <aside className="inspector">
      <div className="insp-head">
        <StatusPill status={e.status} />
        <span style={{ color: "var(--muted)", fontSize: 12 }}>v{e.version}</span>
        <div className="spacer" />
        {window.desktop ? <button className="icon-btn" title="在访达中显示" onClick={() => window.desktop!.reveal(`entries/${e.type.replace(".", "/")}/${e.id.split("/")[1]}/entry.yaml`)}><Icon name="folder" /></button> : null}
        <button className="icon-btn" title="关闭" onClick={onClose}><Icon name="x" /></button>
      </div>
      <div className="insp-scroll">
        {cur ? (
          <div className="hero">
            {isImg(cur) ? <img src={api.fileUrl(e.id, cur)} alt="" /> : isVideo(cur) ? <video src={api.fileUrl(e.id, cur)} controls muted loop /> : isAudio(cur) ? <div style={{ padding: 20 }}><audio src={api.fileUrl(e.id, cur)} controls style={{ width: "100%" }} /></div> : <div className="tile"><Icon name="layers" /></div>}
          </div>
        ) : colors ? (
          <div className="hero"><div className="swatches">{colors.map((c) => <i key={c.token} style={{ background: c.hex }} />)}</div></div>
        ) : (
          <div className="hero"><div className="tile" style={{ background: `radial-gradient(120% 90% at 0% 0%, ${t.color}55, transparent 60%)`, color: t.color }}><Icon name={t.cat?.icon ?? "shapes"} /></div></div>
        )}
        {previews.length > 1 ? (
          <div className="thumbs">{previews.map((p, i) => <button key={p + i} className={i === pi ? "on" : ""} onClick={() => setPi(i)}>{isImg(p) ? <img src={api.fileUrl(e.id, p)} alt="" /> : <Icon name="film" />}</button>)}</div>
        ) : null}
        <div className="insp-body">
          <div className="crumbs"><span style={{ color: t.color }}>●</span>{t.catLabel}<Icon name="chevron" style={{ width: 11, height: 11 }} />{t.label}<span style={{ marginLeft: "auto" }}><code className="inline">{e.id}</code></span></div>
          <h2 className="insp-title">{e.title}</h2>
          {e.summary ? <p className="summary">{e.summary}</p> : null}
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <div className="stars">{[1, 2, 3, 4, 5].map((n) => <button key={n} className={(e.usage.rating ?? 0) >= n ? "on" : ""} onClick={() => act(() => api.patch(e.id, { rating: n }), "已评分")}>★</button>)}</div>
            <span style={{ color: "var(--muted)", fontSize: 12 }}>用于 {e.usage.count} 个项目</span>
          </div>

          <div className="tabs">
            {([["overview", "概览"], ["source", "来源"], ["relations", "关系"], ["review", `审查${d.reviews.length ? ` ${d.reviews.length}` : ""}`], ["files", "文件"]] as const).map(([k, l]) => (
              <button key={k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>{l}</button>
            ))}
          </div>

          {tab === "overview" && (
            <>
              {colors ? (
                <div className="palette-big">{colors.map((c) => <div className="sw" key={c.token}><i style={{ background: c.hex }} /><div><b>{c.hex}</b><span>{c.token}</span>{c.meaning ? <span>{c.meaning}</span> : null}</div></div>)}</div>
              ) : null}
              <div className="box"><h4>规格（spec）</h4><SpecView value={colors ? Object.fromEntries(Object.entries(e.spec).filter(([k]) => k !== "colors")) : e.spec} /></div>
              {Object.keys(e.tags).length || e.styles.length ? (
                <div className="box"><h4>标签与风格</h4>
                  <div className="tags">{Object.entries(e.tags).flatMap(([k, vs]) => vs.map((v) => <span className="tag" key={k + v}>{k}: {v}</span>))}</div>
                  {e.styles.map((s) => <button key={s} className="link-row" onClick={() => onOpen(s)}><span className="dot" style={{ background: typeInfo(tax, "style.pack").color }} />{s}<span className="meta">风格包</span></button>)}
                </div>
              ) : null}
              {t.sub ? <div className="box"><h4>这类素材应存储</h4><ul style={{ margin: 0, paddingLeft: 16, color: "var(--text-2)", lineHeight: 1.7, fontSize: 12.5 }}>{t.sub.stores.map((s) => <li key={s}>{s}</li>)}</ul></div> : null}
            </>
          )}

          {tab === "source" && (
            <div className="box">
              <dl className="kv">
                <dt>来源</dt><dd>{PROV_LABEL[e.provenance.kind] ?? e.provenance.kind}</dd>
                {e.provenance.source ? <><dt>说明</dt><dd>{e.provenance.source}</dd></> : null}
                {e.provenance.license ? <><dt>授权</dt><dd>{e.provenance.license}</dd></> : null}
                {e.provenance.attribution ? <><dt>署名</dt><dd>{e.provenance.attribution}</dd></> : null}
                {e.provenance.generator ? <><dt>生成</dt><dd><code>{e.provenance.generator.model}</code><div style={{ marginTop: 4, color: "var(--text-2)" }}>{e.provenance.generator.prompt}</div></dd></> : null}
                {e.provenance.restrictions.length ? <><dt>限制</dt><dd><div className="tags">{e.provenance.restrictions.map((r) => <span className="tag" key={r}>{r}</span>)}</div></dd></> : null}
                <dt>创建</dt><dd>{e.created}</dd><dt>更新</dt><dd>{e.updated}</dd>
              </dl>
              {e.provenance.derived_from.length ? <><h4 style={{ marginTop: 12 }}>拆解来源</h4>{e.provenance.derived_from.map((r) => { const [rid, at] = r.split("#"); return <button key={r} className="link-row" onClick={() => onOpen(rid)}><span className="dot" style={{ background: typeInfo(tax, "reference.video").color }} />{rid.split("/")[1]}<span className="meta">{at?.replace("t=", "") ?? ""}{at ? "s" : ""}</span></button>; })}</> : null}
            </div>
          )}

          {tab === "relations" && (
            <>
              <div className="box"><h4>依赖（{e.deps.length}）</h4>{e.deps.length ? e.deps.map((x) => <button key={x} className="link-row" onClick={() => onOpen(x.split("@")[0])}><span className="dot" style={{ background: typeInfo(tax, x.split("/")[0]).color }} />{x}</button>) : <span style={{ color: "var(--faint)" }}>无</span>}</div>
              <div className="box"><h4>被引用（{d.dependents.length}）</h4>{d.dependents.length ? d.dependents.map((x) => <button key={x.id} className="link-row" onClick={() => onOpen(x.id)}><span className="dot" style={{ background: typeInfo(tax, x.type).color }} />{x.title}<span className="meta">{typeInfo(tax, x.type).label}</span></button>) : <span style={{ color: "var(--faint)" }}>无</span>}</div>
              {d.derived.length ? <div className="box"><h4>从这里拆出（{d.derived.length}）</h4>{d.derived.map((x) => <button key={x.id} className="link-row" onClick={() => onOpen(x.id)}><span className="dot" style={{ background: typeInfo(tax, x.type).color }} />{x.title}<span className="meta">{x.at?.replace("t=", "")}{x.at ? "s" : ""}</span></button>)}</div> : null}
            </>
          )}

          {tab === "review" && (
            <>
              {d.readiness.length && e.status === "draft" ? <div className="box"><h4>提交审查前还需要</h4><ul className="problems">{d.readiness.map((p) => <li key={p}>{p}</li>)}</ul></div> : null}
              <div className="box">
                <h4>审查清单</h4>
                {d.checklist.map((c) => (
                  <div className="check-item" key={c}>
                    <span className="grow">{c}</span>
                    <div className="tri">{(["pass", "fail", "n/a"] as const).map((v) => <button key={v} className={`${v === "n/a" ? "na" : v}${checks[c] === v ? " on" : ""}`} onClick={() => setChecks({ ...checks, [c]: v })}>{v === "pass" ? "通过" : v === "fail" ? "不过" : "不适用"}</button>)}</div>
                  </div>
                ))}
                <textarea className="note" placeholder="审查意见：时间点 · 位置 · 问题 → 改法 · 保留什么" value={note} onChange={(x) => setNote(x.target.value)} />
                <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                  {e.status === "draft" ? <button className="btn primary" onClick={() => act(() => api.status(e.id, "review"), "已提交审查")}><Icon name="inbox" />提交审查</button> : null}
                  {e.status === "review" ? <button className="btn ok" onClick={() => act(() => api.review(e.id, { verdict: "approve", notes: note, checklist: checks }), "已通过")}><Icon name="check" />通过</button> : null}
                  {e.status === "review" ? <button className="btn danger" onClick={() => act(() => api.review(e.id, { verdict: "reject", notes: note, checklist: checks }), "已退回")}>退回修改</button> : null}
                  <button className="btn" onClick={() => act(() => api.review(e.id, { verdict: "comment", notes: note, checklist: checks }), "已记录意见")}>只记录意见</button>
                  {e.status === "approved" ? <button className="btn" onClick={() => act(() => api.bump(e.id), "已生成新版本（草稿）")}><Icon name="refresh" />升版本修改</button> : null}
                </div>
              </div>
              {d.reviews.length ? <div className="box"><h4>审查记录</h4><div className="history">{[...d.reviews].reverse().map((r, i) => <div key={i} className={`h ${r.verdict}`}><b>{r.verdict === "approve" ? "通过" : r.verdict === "reject" ? "退回" : "意见"}</b> · {r.reviewer} · v{r.version} · {r.date.slice(0, 16).replace("T", " ")}{r.notes ? <div style={{ color: "var(--text-2)", marginTop: 2 }}>{r.notes}</div> : null}</div>)}</div></div> : null}
            </>
          )}

          {tab === "files" && (
            <div className="box">
              {Object.entries(d.files).length ? Object.entries(d.files).map(([k, f]) => (
                <div key={k} className="link-row" style={{ cursor: "default" }}>
                  <span className="dot" style={{ background: f.exists ? "var(--ok)" : "var(--bad)" }} />
                  <span style={{ minWidth: 70, color: "var(--muted)" }}>{k}</span>
                  <code className="inline" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 190 }}>{f.ref.startsWith("blob:") ? f.ref.slice(0, 24) + "…" : f.ref}</code>
                  <span className="meta">{f.size !== null ? `${(f.size / 1024).toFixed(0)} KB` : "缺失"}</span>
                </div>
              )) : <span style={{ color: "var(--faint)" }}>还没有文件</span>}
              {d.lint.length ? <><h4 style={{ marginTop: 12 }}>校验</h4><ul className="problems">{d.lint.map((x, i) => <li key={i}>[{x.rule}] {x.message}</li>)}</ul></> : null}
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
