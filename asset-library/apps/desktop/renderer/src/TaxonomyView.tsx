// 分类体系：8 大类 · 小类卡片、归类向导（决策树）、归类样例
import React, { useMemo, useState } from "react";
import { api, type Taxonomy } from "./api.ts";
import { Icon } from "./icons.tsx";
import { typeInfo, type Tax } from "./ui.tsx";

export function TaxonomyView({ tax, taxonomy, counts, onFilter }: { tax: Tax; taxonomy: Taxonomy; counts: Record<string, number>; onFilter: (type: string) => void }) {
  const [sel, setSel] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const selInfo = sel ? typeInfo(tax, sel) : null;
  const total = taxonomy.categories.reduce((n, c) => n + c.subtypes.length, 0);
  const els = useMemo(() => taxonomy.elements.filter((e) => !q || e.element.includes(q) || e.genre.includes(q) || e.type.includes(q)), [q, taxonomy]);
  return (
    <div className="page">
      <h2>分类体系</h2>
      <p className="lead">任何视频里的任何构成要素，都能用下面的问题依次判断，落到唯一的类别：{taxonomy.categories.length} 大类 · {total} 小类。问题互斥且穷尽——去掉"知识、声音、结构、规则、数据、变化"之后，剩下的一定是画面里出现的"东西"，再按媒介形态细分。</p>
      <Wizard tax={tax} taxonomy={taxonomy} onFilter={onFilter} />

      <div className="section-h"><h3>全部类别</h3><span>点小类查看说明，再点一次在素材库里筛选</span></div>
      <div className="cat-grid">
        {taxonomy.categories.map((c) => (
          <div className="cat-card" key={c.id}>
            <div className="glow" style={{ background: c.color }} />
            <header>
              <div className="ic" style={{ background: c.color }}><Icon name={c.icon} /></div>
              <div><h4>{c.name}</h4><div className="en">{c.en} · {c.id}</div></div>
              <div className="n">{c.subtypes.reduce((n, s) => n + (counts[`${c.id}.${s.id}`] ?? 0), 0)}</div>
            </header>
            <p>{c.description}</p>
            <div className="sub-chips">
              {c.subtypes.map((s) => {
                const t = `${c.id}.${s.id}`;
                return <button key={s.id} className={`sub-chip${sel === t ? " on" : ""}`} onClick={() => (sel === t ? onFilter(t) : setSel(t))}>{s.name}<b>{counts[t] ?? 0}</b></button>;
              })}
            </div>
          </div>
        ))}
      </div>
      {selInfo?.sub ? (
        <div className="sub-detail">
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <span className="badge" style={{ background: selInfo.color }}>{selInfo.catLabel}</span>
              <h3 style={{ margin: 0, fontSize: 16 }}>{selInfo.sub.name}</h3><code className="inline">{sel}</code>
              <button className="btn" style={{ marginLeft: "auto" }} onClick={() => onFilter(sel!)}>查看素材 →</button>
            </div>
            <p style={{ color: "var(--text-2)", margin: "0 0 12px" }}>{selInfo.sub.description}</p>
            <h4>例子</h4><ul>{selInfo.sub.examples.map((x) => <li key={x}>{x}</li>)}</ul>
          </div>
          <div>
            <h4>存储什么</h4><ul>{selInfo.sub.stores.map((x) => <li key={x}>{x}</li>)}</ul>
            <h4 style={{ marginTop: 12 }}>提交审查必填</h4><div className="tags">{selInfo.sub.requiredForReview.map((x) => <span className="tag" key={x}>spec.{x}</span>)}</div>
            <h4 style={{ marginTop: 12 }}>制作路线</h4><div className="tags">{selInfo.sub.routes.map((x) => <span className="tag" key={x}>{x}</span>)}</div>
          </div>
        </div>
      ) : null}

      <div className="section-h"><h3>归类样例</h3><span>{taxonomy.elements.length} 个来自不同题材的真实要素</span></div>
      <div className="search" style={{ width: 320, marginBottom: 10 }}><Icon name="search" /><input placeholder="搜索要素、题材或类型" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      <table className="el-table">
        <thead><tr><th>构成要素</th><th>题材</th><th>归类</th></tr></thead>
        <tbody>{els.map((e, i) => { const t = typeInfo(tax, e.type); return <tr key={i}><td>{e.element}</td><td style={{ color: "var(--muted)" }}>{e.genre}</td><td><span style={{ color: t.color }}>●</span> {t.catLabel} · {t.label} <code className="inline">{e.type}</code></td></tr>; })}</tbody>
      </table>
    </div>
  );
}

function Wizard({ tax, taxonomy, onFilter }: { tax: Tax; taxonomy: Taxonomy; onFilter: (t: string) => void }) {
  const [step, setStep] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [choose, setChoose] = useState<Array<{ subtype: string; when: string }> | null>(null);
  const [cat, setCat] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [sug, setSug] = useState<Array<{ type: string; name: string }>>([]);
  const nodes = taxonomy.decisionTree;
  const reset = () => { setStep(0); setPicked(null); setChoose(null); setCat(null); };
  const yes = () => { const n = nodes[step]; setCat(n.yes.category); setChoose(n.yes.choose ?? []); };
  const no = () => { if (step + 1 < nodes.length) setStep(step + 1); else { setCat("content"); setChoose(taxonomy.contentByMedium); } };
  const result = picked ? typeInfo(tax, picked) : null;
  return (
    <div className="wizard">
      <div className="steps">
        {nodes.map((n, i) => <div key={n.id} className={`step${i < step || (cat && i === step && cat !== "content") ? " done" : ""}${i === step && !cat ? " cur" : ""}`}><span className="n">{i + 1}</span>{tax.byId[n.yes.category]?.name}</div>)}
        <div className={`step${cat === "content" ? " cur" : ""}`}><span className="n">∗</span>画面内容</div>
      </div>
      <div className="q-card">
        {result?.sub ? (
          <>
            <div className="result">
              <div className="cat-card" style={{ padding: 10, border: 0, background: "transparent" }}><div className="ic" style={{ background: result.color }}><Icon name={result.cat!.icon} /></div></div>
              <div><div style={{ color: "var(--muted)", fontSize: 12 }}>归入</div><div className="big">{result.catLabel} · {result.sub.name}</div><code className="inline">{picked}</code></div>
            </div>
            <p style={{ marginTop: 12 }}>{result.sub.description}</p>
            <div style={{ display: "flex", gap: 8 }}><button className="btn primary" onClick={() => onFilter(picked!)}>查看这类素材</button><button className="btn" onClick={reset}>再归类一个</button></div>
          </>
        ) : choose ? (
          <>
            <h3>{cat === "content" ? "它是画面里出现的「东西」。是哪种媒介形态？" : `属于「${tax.byId[cat!]?.name}」。具体是哪一种？`}</h3>
            <div className="choice-grid">{choose.map((c) => { const t = typeInfo(tax, `${cat}.${c.subtype}`); return <button key={c.subtype} className="choice" onClick={() => setPicked(`${cat}.${c.subtype}`)}><b><span style={{ color: t.color }}>●</span> {t.label}</b><span>{c.when}</span></button>; })}</div>
            <button className="btn" style={{ marginTop: 12 }} onClick={reset}>重新开始</button>
          </>
        ) : (
          <>
            <div style={{ color: "var(--muted)", fontSize: 12, marginBottom: 6 }}>归类向导 · 第 {step + 1} / {nodes.length} 问</div>
            <h3>{nodes[step].question}</h3>
            <p>{nodes[step].hint}</p>
            <div style={{ display: "flex", gap: 8 }}><button className="btn primary" onClick={yes}>是</button><button className="btn" onClick={no}>否</button>{step > 0 ? <button className="btn" onClick={() => setStep(step - 1)}>上一步</button> : null}</div>
          </>
        )}
        <div className="suggest-input">
          <input placeholder="或者直接描述一个要素，例如：右侧半透明遥测面板" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") api.suggest(text).then(setSug); }} />
          <button className="btn" onClick={() => api.suggest(text).then(setSug)}><Icon name="wand" />建议</button>
        </div>
        {sug.length ? <div className="tags" style={{ marginTop: 8 }}>{sug.map((s) => <button key={s.type} className="chip" onClick={() => setPicked(s.type)}><span className="dot" style={{ background: typeInfo(tax, s.type).color }} />{s.name}</button>)}</div> : text && sug.length === 0 ? null : null}
      </div>
    </div>
  );
}
