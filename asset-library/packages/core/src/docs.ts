// 由分类体系生成 Markdown 文档（docs/taxonomy.md），保证文档与代码一致。
import { CATEGORIES, CONTENT_BY_MEDIUM, DECISION_TREE } from "./taxonomy.ts";

export function taxonomyMarkdown(): string {
  const n = CATEGORIES.reduce((a, c) => a + c.subtypes.length, 0);
  const L: string[] = [
    "# 素材分类体系", "",
    `> 由 \`packages/core/src/taxonomy.ts\` 自动生成（\`lib docs\`），请勿手改。共 ${CATEGORIES.length} 大类、${n} 小类。`, "",
    "## 归类决策树（互斥且穷尽）", "",
    "依次回答，第一个「是」决定大类；全部为「否」时，它是画面里出现的「东西」，归画面内容，再按媒介形态选小类。", "",
  ];
  DECISION_TREE.forEach((d, i) => {
    L.push(`${i + 1}. **${d.question}** → \`${d.yes.category}\``, `   - ${d.hint}`, `   - 小类：${d.yes.choose?.map((c) => `\`${c.subtype}\`（${c.when}）`).join("、")}`);
  });
  L.push(`${DECISION_TREE.length + 1}. **以上全否** → \`content\`，按媒介形态：${CONTENT_BY_MEDIUM.map((c) => `\`${c.subtype}\`（${c.when}）`).join("、")}`, "");
  for (const c of CATEGORIES) {
    L.push(`## ${c.name} · \`${c.id}\``, "", c.description, "");
    for (const s of c.subtypes) {
      L.push(`### ${s.name} · \`${c.id}.${s.id}\``, "", s.description, "",
        `- **例子**：${s.examples.join("；")}`,
        `- **存储**：${s.stores.join("；")}`,
        `- **提交审查必填**：${s.requiredForReview.map((x) => `\`spec.${x}\``).join("、")}`,
        `- **制作路线**：${s.routes.join("、")}`, "");
    }
  }
  return L.join("\n");
}
