# 素材库设计

## 1. 原则

1. **一条素材 = 一个目录**：`entry.yaml`（档案）+ `files/`（本体）+ `previews/`（预览）+ `src/`（源文件或生成代码）+ `reviews/`（审查记录）。
2. **分类存储、组合使用**：库里只存"零件"，镜头在项目里组装。
3. **只引用不复制**：`deps` 写 `<id>@<主版本>`，风格写在 `styles`。
4. **来源可追溯**：自制 / 拆解（`derived_from: reference.video/<id>#t=<秒>`）/ 生成（模型 + 提示词）/ 授权（license）/ 用户提供。
5. **审查状态决定能不能用**：`draft → review → approved`，任何状态可 `deprecated`；`review` 可退回 `draft`。
6. **预览是必需项**：提交审查前至少一个预览；审查只看预览。
7. **文本和大文件分开**：档案、代码、SVG 进 git；大文件放 `blobs/<sha256 前两位>/<sha256>.<ext>`，档案里写 `blob:sha256:…`。
8. **通过后不可修改**：要改先 `lib bump`，生成新版本（回到草稿）。

## 2. 分类与完备性

8 大类 · 46 小类，定义在 `packages/core/src/taxonomy.ts`，文档由它生成（[taxonomy.md](taxonomy.md)）。

归类决策树（第一个"是"决定大类）：

1. 是一整条参考视频的拆解记录？→ `reference`
2. 是视频之外的知识 / 文字信息？→ `knowledge`
3. 是听到的？→ `sound`
4. 是组织时间的（跨多个镜头）？→ `structure`
5. 是一组规则 / 参数而非可见的东西？→ `style`
6. 是驱动画面的数据或公式？→ `data`
7. 是一种"变化或处理"而非"东西"？→ `effect`
8. 以上全否 → 画面里的"东西" → `content`，按媒介形态（3D 模型 / 3D 场景 / 材质 / 图表 / 界面 / 文字 / 字体 / 标识 / 预制动画 / 矢量 / 视频 / 位图）选小类

**为什么穷尽**：前 7 问逐步剥离"信息、声音、时间结构、规则、数据、变化"，剩下的只能是画面上可见的实体；实体的媒介形态列表本身是穷尽的（最后两项"其他矢量 / 其他位图"兜底所有二维图像）。同一个现象的不同侧面归不同类：例如"800 公斤"这个数字是 `knowledge.fact`，它在画面上的大字是 `content.typography`，大字的弹出动作是 `effect.text-motion`。

## 3. 条目档案（entry.yaml）

```yaml
id: content.model3d/minicar-teal        # <大类>.<小类>/<短名>
type: content.model3d
version: 1.2.0
title: 薄荷色微型车
summary: 写实微型电动车，气罐、阀门、喷口可拆
tags: { topic: [汽车, 仿真], role: [主体] }
styles: [style.pack/sim-explainer-dark]
status: approved                        # draft | review | approved | deprecated
provenance:
  kind: licensed                        # made | decomposed | generated | licensed | user-provided
  source: Sketchfab · 作者 X
  derived_from: [reference.video/hoverslam-zjucat#t=12]
  generator: { model: …, prompt: … }    # 生成类必填
  license: CC-BY-4.0                    # 授权类必填
  restrictions: []                      # real-person | brand | editorial-only | internal-reference | no-commercial
files: { main: "blob:sha256:…glb" }
previews: [previews/turntable.mp4, previews/views.png]
deps: [style.palette/sim-explainer-semantic@1]
spec: { format: glb, units: m, parts: [body, tank_1, …] }   # 类型专属，必填项见分类体系 requiredForReview
usage: { projects: [car-softlanding], count: 1, rating: 4.5 }
created: 2026-11-10
updated: 2026-11-12
```

## 4. 各类型存什么

每个小类的"存储清单"和"提交审查必填 spec 字段"定义在分类体系里（`stores`、`requiredForReview`），见 [taxonomy.md](taxonomy.md)。要点：

| 类型 | 本体 | 关键 spec |
|---|---|---|
| 风格包 / 色板 / 规范 | 风格帧图片、规则文档 | colors（token、hex、含义）、roles、zones、durations、banned |
| 3D 模型 / 场景 | glb、源文件、HDRI | units、parts（命名节点）、materials、placements、cameras |
| 矢量 / 图表 / 界面 / 文字 | 分层 SVG、模板代码 | layers、states、bindings、fields、fonts |
| 位图 / 视频 / 预制动画 | 原文件（blob） | 生成记录或授权、dimensions、duration、fps、可用区间 |
| 仿真 / 数据集 / 公式 | 代码、数据文件 | params、channels（名称 + 单位）、checks、latex、variables |
| 效果 | 实现代码 + 样片 | runtime、params、slots / data_slots、duration |
| 声音 | 音频或生成代码 | provider、bpm、mood、sections、onset_ms |
| 结构 | 模板文档 | sections、beats、metrics、constraints |
| 拆解记录 | 关键帧、分析数据 | meta、segments、metrics、audio |

## 5. 审查

`reviews/<时间>.yaml`：审查人、结论（approve / reject / comment）、版本、逐项检查结果、意见。审查清单 = 通用项 + 大类项 + 小类项（`checklistFor`）。通过需要：满足提交审查条件 + 一条针对当前版本的"通过"记录。

## 6. 检索与关系

- 全文检索（中文按单字 + 双字切分）：标题、简介、标签、spec。
- 关系图：依赖（deps）、风格（styles）、拆解来源（derived_from）→ `index/graph.json`。
- 统计：按类型、大类、状态 → `index/stats.json`。

## 7. 本地 API（桌面应用与浏览器共用）

| 接口 | 作用 |
|---|---|
| `GET /api/library` | 库信息与统计 |
| `GET /api/taxonomy` | 分类体系、决策树、归类样例 |
| `GET /api/entries?q=&category=&type=&status=&provenance=&style=&reference=` | 目录（检索 + 筛选） |
| `GET /api/entries/<id>` | 详情：档案、审查记录、清单、提交条件、校验、被引用、拆出条目、文件 |
| `PATCH /api/entries/<id>` | 修改标题、简介、标签、spec、评分等（已通过的需先升版本） |
| `POST /api/entries` | 新建草稿 |
| `POST /api/entries/<id>/status` · `/review` · `/bump` | 状态流转、审查、升版本 |
| `GET /api/file/<id>?ref=` | 读取条目文件（支持 Range，可播放视频） |
| `GET /api/lint` · `GET /api/graph` · `POST /api/reindex` · `POST /api/classify` | 校验、关系图、重建、归类建议 |

只监听 `127.0.0.1`。
