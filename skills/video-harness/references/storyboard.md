# 分镜（storyboard.json v2）

分镜是"每个节拍画什么"的清单。**节拍（beat）是基本单位**：一句话、一个视觉想法。镜头（shot）是节拍的容器，决定用哪种画面实现和章节色板。

```jsonc
{
  "version": 2,
  "approved": false,                       // 节拍表给用户确认后改 true
  "semantic": { "drug": "#57D88C", "cancer": "negative" },   // 语义色：实体 → hex 或调色板角色，全片固定
  "motifs": [{ "id": "sun", "description": "开头、比喻图、日落反复出现的太阳" }],
  "captions": { "enabled": false },        // 讲解类横屏默认不加字幕
  "music": { "src": "music/bed.mp3", "gain_db": -18, "duck_db": 10 },   // 可选，文件放 public/
  "shots": [
    {
      "id": "s03", "start": 8.2, "end": 13.3,          // 秒；镜头首尾相接、覆盖全部配音（H11）
      "chapter": "night",                              // 设计包章节色板：day / night / sepia
      "transition": { "kind": "zoom", "duration": 0.4 },  // cut | fade | push-left | push-up | zoom | wipe
      "scene": { "kind": "kit", "kit": "kit/scale-zoom", "params": { /* vh kits show kit/scale-zoom */ } },
      "beats": [
        { "t": 8.28, "line": "Zoom into the air…", "idea": "一镜到底：天空 → 一团空气 → 一个分子", "focal": "分子", "motif": "molecule" }
      ]
    }
  ]
}
```

## 怎么写

1. 打开 `voice.json` 的 `segments`，每句话一行，先写**节拍表**：时间 · 旁白 · 视觉想法 · 焦点 · 母题。把这张表发给用户确认（这是 ⟂ 闸门）。
2. 相邻节拍如果是同一个画面在演变，放进同一个镜头（长镜头 + 镜头内动作）；画面主体换了才切镜。
3. 镜头边界放在语句开头前的停顿里（`start` 取上一句结束后、下一句开始前）；节拍 `t` 取语句开始时刻。
4. 给每个镜头选实现：
   - 积木能表达 → `kind: kit`（`vh kits`、`vh kits show <id>`、`vh kits preview <id>`）；
   - 积木不够 → `kind: local`（场景图，首选）/ `html` / `react`，见 [scene-contract.md](scene-contract.md)。
5. `vh check storyboard`：时间覆盖、节拍在镜头内、积木参数合法、颜色 token 存在、章节存在、母题已声明；M4 会提示没有画面变化的句子。

## 节奏参考（讲解类横屏）

- 段（切镜或节拍）时长中位 3–4s；视觉边界 12–18 次 / 分钟。
- 至少 40% 的画面变化落在旁白停顿里；不卡音乐节拍。
- 静止镜头里也要有生命：呼吸、漂移、视差（H8：内容区静止不超过 4s）。

## 视觉想法（idea）怎么写

写**具体的东西和动作**，不是信息类型：

| 差 | 好 |
|---|---|
| 展示生存率数据 | 100 个小人，绿色的从 10 个涨到 95 个 |
| 解释药物机制 | 发光的药物分子顺着血管流进肾，标签在到达时出现 |
| 介绍主角 | 主角坐在病床上抱着电脑，镜头缓慢推近，灯光由暖变冷 |
