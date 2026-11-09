# 看图复核

协议沿用 rea-video 的"任务文件 + 答案文件"：工具出题，看图的人作答，工具合并；答案不直接改分镜。

```bash
vh review tasks     # 每个节拍渲染一张图（节拍后段，入场动画已完成）→ review/tasks.json + answers.json 模板 + 总拼图
# 看图作答 → review/answers.json
vh review apply     # → review/scorecard.json（轮次、P0/P1/P2、闸门结果）
```

## 作答规则

1. **用全新上下文**：能开子 agent 就开一个，只给它 `review/tasks.json` 和图片，不给代码和创作过程。
2. 每个任务有 J1–J6 六题（焦点、视觉想法是否可识别、是否和旁白一致、有没有抢焦点的装饰、是否廉价、与前后衔接）。每题填 `pass` / `fail` / `skip`。
3. 每个 `fail` 都写一条 issue，格式固定：

```json
{ "severity": "P1", "t": 17.8, "where": "右上计数", "problem": "red ×1 与背景对比太低", "fix": "改用 negative 色并加大字号", "keep": "计数出现的时机" }
```

4. P0 = 看不懂 / 焦点错 / 视觉想法没画出来；P1 = 明显的工艺问题；P2 = 可以更好。
5. 修完重新 `vh review tasks`（分镜改过后旧题作废）。**修复最多 3 轮**，仍有 P0 就停下来把问题交给用户决定。

廉价感对照 [anti-cheap.md](anti-cheap.md)。
