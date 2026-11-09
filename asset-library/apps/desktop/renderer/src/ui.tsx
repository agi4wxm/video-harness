import React from "react";
import { api, type CatalogItem, type Category } from "./api.ts";
import { Icon } from "./icons.tsx";

export const STATUS_LABEL: Record<string, string> = { draft: "草稿", review: "待审", approved: "已通过", deprecated: "已弃用" };
export const PROV_LABEL: Record<string, string> = { made: "自制", decomposed: "拆解", generated: "生成", licensed: "授权", "user-provided": "用户提供" };

export interface Tax { cats: Category[]; byId: Record<string, Category> }

export function typeInfo(tax: Tax, type: string) {
  const [c, s] = type.split(".");
  const cat = tax.byId[c];
  const sub = cat?.subtypes.find((x) => x.id === s);
  return { cat, sub, color: cat?.color ?? "#888", label: sub ? sub.name : type, catLabel: cat?.name ?? c };
}

export function hash(s: string) { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; }

export function StatusPill({ status }: { status: string }) {
  return <span className={`status ${status}`}>{status === "approved" ? <Icon name="check" style={{ width: 11, height: 11 }} /> : null}{STATUS_LABEL[status] ?? status}</span>;
}

export function TypeBadge({ tax, type }: { tax: Tax; type: string }) {
  const t = typeInfo(tax, type);
  return <span className="badge"><span className="dot" style={{ background: t.color }} />{t.label}</span>;
}

/** 卡片 / 列表缩略图：有封面用封面；色板画色块；知识类画文字卡；声音画波形；其他画分类图标 */
export function Thumb({ tax, item, small }: { tax: Tax; item: CatalogItem; small?: boolean }) {
  const t = typeInfo(tax, item.type);
  if (item.cover && item.category === "sound") {
    const h = hash(item.id);
    return (
      <>
        <img src={api.fileUrl(item.id, item.cover)} loading="lazy" alt="" style={{ filter: "saturate(.6) brightness(.8)" }} />
        <div className="wave over">{Array.from({ length: small ? 10 : 34 }, (_, i) => <i key={i} style={{ height: `${18 + ((h >> (i % 24)) % 60)}%`, background: "#fff", opacity: 0.55 + ((h >> i) % 4) / 10 }} />)}</div>
      </>
    );
  }
  if (item.cover && !(item.swatches.length && item.type === "style.palette")) {
    return (
      <>
        <img src={api.fileUrl(item.id, item.cover)} loading="lazy" alt="" />
        {item.swatches.length && !small ? <div className="swatches mini">{item.swatches.map((c, i) => <i key={i} style={{ background: c }} />)}</div> : null}
      </>
    );
  }
  if (item.swatches.length) return <div className="swatches">{item.swatches.map((c, i) => <i key={i} style={{ background: c }} />)}</div>;
  const grad = `radial-gradient(120% 90% at 0% 0%, ${t.color}55, transparent 60%), linear-gradient(160deg, ${t.color}22, ${t.color}08)`;
  if (item.category === "knowledge" && !small) {
    return <div className="quote-tile" style={{ background: grad }}><div className="k" style={{ color: t.color }}>{t.label}</div><div className="q">{item.title}</div></div>;
  }
  if (item.category === "sound") {
    const h = hash(item.id);
    return (
      <div className="wave" style={{ background: grad }}>
        {Array.from({ length: small ? 10 : 34 }, (_, i) => <i key={i} style={{ height: `${18 + ((h >> (i % 24)) % 60)}%`, background: t.color, opacity: 0.55 + ((h >> i) % 4) / 10 }} />)}
      </div>
    );
  }
  return <div className="tile" style={{ background: grad, color: t.color }}><Icon name={t.cat?.icon ?? "shapes"} /></div>;
}

export function Card({ tax, item, selected, onClick }: { tax: Tax; item: CatalogItem; selected: boolean; onClick: () => void }) {
  const t = typeInfo(tax, item.type);
  return (
    <button className={`card${selected ? " selected" : ""}`} onClick={onClick}>
      <div className="thumb">
        <Thumb tax={tax} item={item} />
        <span className="type-tag"><TypeBadge tax={tax} type={item.type} /></span>
        <span className="status-tag"><StatusPill status={item.status} /></span>
      </div>
      <div className="card-body">
        <div className="card-title">{item.title}</div>
        <div className="card-meta"><span style={{ color: t.color }}>●</span>{t.catLabel}<span>·</span>{PROV_LABEL[item.provenance] ?? item.provenance}<span>·</span>v{item.version}</div>
      </div>
    </button>
  );
}

export function Row({ tax, item, selected, onClick }: { tax: Tax; item: CatalogItem; selected: boolean; onClick: () => void }) {
  const t = typeInfo(tax, item.type);
  return (
    <button className={`row${selected ? " selected" : ""}`} onClick={onClick}>
      <div className="mini-thumb"><Thumb tax={tax} item={item} small /></div>
      <div style={{ minWidth: 0 }}><div className="t">{item.title}</div><div className="s">{item.summary || item.id}</div></div>
      <div className="s"><span style={{ color: t.color }}>●</span> {t.catLabel} · {t.label}</div>
      <div><StatusPill status={item.status} /></div>
      <div className="s">{item.updated}</div>
    </button>
  );
}

export function Empty({ icon = "inbox", title, hint }: { icon?: string; title: string; hint?: string }) {
  return <div className="empty"><div><Icon name={icon} /><div style={{ fontWeight: 600, color: "var(--text-2)", marginTop: 8 }}>{title}</div>{hint ? <div style={{ fontSize: 12, marginTop: 4 }}>{hint}</div> : null}</div></div>;
}

/** spec 的通用展示：标量 → 文本；对象数组 → 表格；对象 → 嵌套键值 */
export function SpecView({ value }: { value: unknown }): React.ReactElement {
  if (value === null || value === undefined || value === "") return <span style={{ color: "var(--faint)" }}>—</span>;
  if (typeof value !== "object") return <span>{String(value)}</span>;
  if (Array.isArray(value)) {
    if (value.length && value.every((v) => v && typeof v === "object" && !Array.isArray(v))) {
      const cols = [...new Set(value.flatMap((v) => Object.keys(v as object)))].slice(0, 5);
      return (
        <table className="spec-table">
          <thead><tr>{cols.map((c) => <th key={c}>{c}</th>)}</tr></thead>
          <tbody>{value.map((v, i) => <tr key={i}>{cols.map((c) => <td key={c}><SpecView value={(v as any)[c]} /></td>)}</tr>)}</tbody>
        </table>
      );
    }
    return <div className="tags">{value.map((v, i) => <span className="tag" key={i}>{typeof v === "object" ? JSON.stringify(v) : String(v)}</span>)}</div>;
  }
  return (
    <dl className="kv">
      {Object.entries(value as object).map(([k, v]) => <React.Fragment key={k}><dt>{k}</dt><dd><SpecView value={v} /></dd></React.Fragment>)}
    </dl>
  );
}
