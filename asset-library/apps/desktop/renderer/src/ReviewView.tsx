// 审查队列与校验问题
import React, { useEffect, useState } from "react";
import { api, type CatalogItem, type LintIssue } from "./api.ts";
import { Card, Empty, type Tax } from "./ui.tsx";

export function ReviewView({ tax, items, selected, onSelect }: { tax: Tax; items: CatalogItem[]; selected: string | null; onSelect: (id: string) => void }) {
  const queue = items.filter((x) => x.status === "review");
  const drafts = items.filter((x) => x.status === "draft");
  return (
    <div>
      <div className="group-title"><h2>待审查</h2><span>{queue.length} 条 · 审查只看预览，逐项打勾后通过或退回</span></div>
      {queue.length ? <div className="grid">{queue.map((x) => <Card key={x.id} tax={tax} item={x} selected={selected === x.id} onClick={() => onSelect(x.id)} />)}</div> : <div style={{ padding: "12px 18px", color: "var(--muted)" }}>没有待审查的素材。草稿准备好后在右侧面板「审查」里提交。</div>}
      <div className="group-title"><h2>草稿</h2><span>{drafts.length} 条</span></div>
      <div className="grid">{drafts.slice(0, 60).map((x) => <Card key={x.id} tax={tax} item={x} selected={selected === x.id} onClick={() => onSelect(x.id)} />)}</div>
    </div>
  );
}

export function IssuesView({ onSelect }: { onSelect: (id: string) => void }) {
  const [issues, setIssues] = useState<LintIssue[] | null>(null);
  useEffect(() => { api.lint().then(setIssues); }, []);
  if (!issues) return <Empty title="校验中…" />;
  if (!issues.length) return <Empty icon="checkCircle" title="没有问题" hint="所有条目格式正确、文件齐全、依赖可解析。" />;
  return (
    <div style={{ padding: "8px 18px" }}>
      {issues.map((i, k) => (
        <div className="issue-row" key={k}>
          <span className={`lv ${i.level}`}>●</span>
          <button style={{ textAlign: "left", color: "var(--accent)" }} onClick={() => i.id.includes("/") && onSelect(i.id)}>{i.id}</button>
          <span style={{ color: "var(--muted)" }}>{i.rule}</span>
          <span>{i.message}</span>
        </div>
      ))}
    </div>
  );
}
