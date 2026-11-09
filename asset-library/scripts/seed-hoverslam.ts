// 用参考片《汽车飞出高架，怎样才能软着陆？》的拆解生成素材库第一批条目（全部为草稿，等待审查）。
//
//   node --import tsx scripts/seed-hoverslam.ts [--video <参考视频.mp4>] [--root library]
//
// 给了 --video 时，会从视频里截取每条素材对应时刻的关键帧（低清，内部参照）放进 blobs/ 作为预览；
// 原视频本身不进素材库。可重复运行：已存在的条目会被更新（不会覆盖已通过审查的条目）。
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Library, writeIndex, type EntryInput } from "../packages/core/src/index.ts";

const argv = process.argv.slice(2);
const opt = (k: string) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : undefined; };
const root = resolve(opt("root") ?? "library");
const video = opt("video");
const lib = existsSync(join(root, "library.yaml")) ? Library.open(root) : Library.init(root, "video-harness 素材库", "代码生成讲解视频的素材库：风格、画面内容、数据、效果、声音、结构、知识与拆解记录。");
const REF = "reference.video/hoverslam-zjucat";
const tmp = mkdtempSync(join(tmpdir(), "seed-"));
const STYLE = "style.pack/sim-explainer-dark";

function frame(t: number, w = 640): string | null {
  if (!video || !existsSync(video)) return null;
  const out = join(tmp, `f_${t.toFixed(1)}_${w}.jpg`);
  execFileSync("ffmpeg", ["-nostdin", "-v", "error", "-y", "-ss", String(t), "-i", video, "-frames:v", "1", "-vf", `scale=${w}:-2`, "-q:v", "4", out]);
  return lib.importBlob(out);
}

type Seed = Omit<EntryInput, "id" | "created" | "updated" | "provenance"> & { slug: string; at?: number[]; kind?: "decomposed" | "made"; restrictions?: string[] };

function put(s: Seed) {
  const id = `${s.type}/${s.slug}`;
  const at = s.at ?? [];
  const previews = at.map((t) => frame(t)).filter(Boolean) as string[];
  const kind = s.kind ?? "decomposed";
  const provenance = {
    kind, source: "拆解自参考视频（浙大猫学长）",
    derived_from: kind === "decomposed" ? (at.length ? at.map((t) => `${REF}#t=${t}`) : [REF]) : [],
    restrictions: (s.restrictions ?? (previews.length ? ["internal-reference"] : [])) as any,
  };
  const { slug, at: _a, kind: _k, restrictions: _r, ...rest } = s;
  const existing = lib.get(id);
  if (existing?.status === "approved") return;
  if (existing) lib.save({ ...existing, ...rest, provenance, previews: previews.length ? previews : existing.previews } as any);
  else lib.create({ ...rest, slug, provenance, previews } as any);
}

// ---------------------------------------------------------------- 拆解记录
put({
  type: "reference.video", slug: "hoverslam-zjucat", at: [1, 11, 32, 56, 85, 128, 146, 158],
  title: "《汽车飞出高架，怎样才能软着陆？火箭「自杀式点火」背后的最优控制》",
  summary: "仿真驱动的硬核讲解：写实 3D 仿真 + 深色数学黑板 + 数据 HUD + 历史证据链。172 秒，横屏。",
  tags: { genre: ["硬核讲解", "物理仿真", "最优控制"], platform: ["YouTube", "B站"] },
  spec: {
    meta: { title: "汽车飞出高架，怎样才能软着陆？火箭「自杀式点火」背后的最优控制", author: "浙大猫学长", url: "https://youtu.be/WReBvXwbSt8", duration_s: 172, resolution: "1920x1080", fps: 30 },
    metrics: { speech_chars: 775, chars_per_min_overall: 287, chars_per_min_speaking: 335, segment_median_s: 2.2, montage_cut_s: 0.43, cuts_in_pause: 0.41, loudness_lufs: -14.0, lra_lu: 3.2 },
    segments: [
      { start: 0, end: 7.7, title: "钩子：结论先行", notes: "仿真轨迹叠加 + 计数器 → 暗场实验影像 → 大字「数学」" },
      { start: 7.7, end: 19.1, title: "设定交代（无旁白）", notes: "多角度拍照 → 点云重建 → 爆炸图 / X 光 → 35 MPa" },
      { start: 19.1, end: 27.4, title: "提出问题", notes: "800 公斤小车 80 km/h 冲出 9 米高架，1.3 秒后砸地" },
      { start: 27.4, end: 59.6, title: "建模", notes: "10 个阀门 → 代价 J → 气量约束 → 带约束最优化 → 轨迹族" },
      { start: 59.6, end: 69.1, title: "方案一（保守）", notes: "MPC：一直托着车，实景仿真 + 侧边 HUD" },
      { start: 69.1, end: 101, title: "转折与方案二", notes: "代价加入用气量 → 先自由下坠，最后 0.7 秒满推力 → 44 kg vs 88 kg ×2 → 联想火箭回收" },
      { start: 101, end: 108, title: "音乐蒙太奇", notes: "火箭着陆实拍快剪，每镜约 0.43 秒" },
      { start: 108, end: 145.7, title: "为什么（理论）", notes: "庞特里亚金极小值原理 → 哈密顿量对 u 线性 → 开关函数过零一次 → bang-bang" },
      { start: 145.7, end: 159.6, title: "历史佐证", notes: "1964 Meditch 论文 → 年份刻度 → SpaceX 工程师引用 → 金句" },
      { start: 159.6, end: 172, title: "彩蛋", notes: "GitHub 开源卡片 + 自由翻滚仿真" },
    ],
    audio: { music: "全程低电平铺底，人声段与非人声段电平几乎相同（-17.9 / -17.7 dB）；无旁白段由音乐撑起，蒙太奇段最响（约 -14 dB）", sfx: "撞击、喷气、读数跳动（待分轨确认）" },
  },
});

// ---------------------------------------------------------------- 风格
const pal = "style.palette/sim-explainer-semantic";
put({
  type: "style.pack", slug: "sim-explainer-dark", at: [1, 44, 64, 128],
  title: "仿真讲解 · 深色数学黑板 + 写实 3D", summary: "写实 3D 仿真作为证据，深色黑板上推导公式，固定的黄 / 蓝 / 橙语义色，右侧数据 HUD。",
  tags: { genre: ["硬核讲解", "工程", "数学"], mood: ["理性", "克制", "科技"] },
  deps: [`${pal}@0`, "style.type-system/sim-explainer-type@0", "style.layout/sim-explainer-layout@0", "style.motion-language/sim-explainer-motion@0", "style.grade/sim-explainer-grade@0"],
  spec: {
    palette: pal, type_system: "style.type-system/sim-explainer-type", layout: "style.layout/sim-explainer-layout",
    motion_language: "style.motion-language/sim-explainer-motion", grade: "style.grade/sim-explainer-grade",
    scene_tones: [
      { name: "写实 3D 仿真", use: "提出问题、展示方案、验证结论", look: "白天城市、天空光、投影、写实材质" },
      { name: "深色数学黑板", use: "建模与推导", look: "近黑底 #0E1315，白色 LaTeX，黄色强调，中文小字注释在项下" },
      { name: "暗场实验影像", use: "开头钩子与情绪高点", look: "纯黑、强光、烟雾" },
    ],
    material_language: [{ name: "X 光壳", meaning: "内部结构 / 这是示意", look: "青色半透明 + 边缘高光" }, { name: "残影", meaning: "很多次模拟", look: "低不透明度叠加" }],
    banned: ["装饰性粒子", "与数据无关的辉光", "彩虹色阶", "无单位的数字", "一屏超过 3 组数字"],
    frames: [],
  },
});
put({
  type: "style.palette", slug: "sim-explainer-semantic", at: [56, 92.5],
  title: "仿真讲解语义色板", summary: "颜色只表达含义：黄=关注 / 最优，浅蓝=对照，橙=超标 / 代价。取色自参考片。",
  spec: {
    colors: [
      { token: "board", hex: "#0E1315", meaning: "数学黑板底色" },
      { token: "ink", hex: "#EDEDEA", meaning: "正文与公式" },
      { token: "muted", hex: "#8A9298", meaning: "注释、坐标轴" },
      { token: "highlight", hex: "#E9BA42", meaning: "当前关注 / 最优解 / 方案二" },
      { token: "compare", hex: "#78C8E8", meaning: "对照组 / 方案一" },
      { token: "warn", hex: "#F4692E", meaning: "超标 / 代价 / 警示" },
      { token: "xray", hex: "#7FD3E6", meaning: "X 光壳（目测）" },
      { token: "panel", hex: "#1A1F24", meaning: "HUD 面板底（约 60% 不透明）" },
    ],
  },
});
put({
  type: "style.type-system", slug: "sim-explainer-type", at: [15, 44, 158],
  title: "仿真讲解字体规范", summary: "粗黑体章节标签、LaTeX 衬线公式、等宽读数、底部字幕关键词标黄。",
  spec: {
    roles: [
      { role: "章节标签", font: "思源黑体 Heavy", size_h: 0.04, color: "ink", position: "左上" },
      { role: "公式", font: "KaTeX / Computer Modern", size_h: 0.035, color: "ink", note: "新加的项用 highlight" },
      { role: "公式注释", font: "思源黑体 Regular", size_h: 0.016, color: "muted", note: "写在对应项正下方" },
      { role: "读数", font: "JetBrains Mono", size_h: 0.05, color: "ink", note: "单位小一号" },
      { role: "字幕", font: "思源黑体 Medium（斜体感）", size_h: 0.028, color: "ink", note: "关键词 highlight" },
      { role: "大字", font: "思源黑体 Heavy", size_h: 0.12, color: "ink / highlight" },
    ],
    scale: [0.016, 0.028, 0.035, 0.04, 0.05, 0.12],
  },
});
put({
  type: "style.layout", slug: "sim-explainer-layout", at: [64, 32],
  title: "仿真讲解版式", summary: "左上章节标签、右侧半透明 HUD、底部居中字幕；黑板场景公式在上、图在下。",
  spec: {
    canvas: { w: 1920, h: 1080 },
    zones: [
      { name: "章节标签", x: 0.02, y: 0.03, w: 0.3, h: 0.07 },
      { name: "HUD 面板", x: 0.72, y: 0.12, w: 0.25, h: 0.62 },
      { name: "字幕", x: 0.2, y: 0.9, w: 0.6, h: 0.06 },
      { name: "黑板 · 公式区", x: 0.1, y: 0.05, w: 0.8, h: 0.25 },
      { name: "黑板 · 图区", x: 0.1, y: 0.32, w: 0.8, h: 0.52 },
    ],
  },
});
put({
  type: "style.motion-language", slug: "sim-explainer-motion", at: [44, 128],
  title: "仿真讲解动效语言", summary: "克制：元素淡入加轻微位移，公式逐项追加，数字滚动，几乎不用弹跳。",
  spec: { durations: { enter_s: 0.4, formula_term_s: 0.5, number_roll_s: 0.8 }, easing: "cubic-bezier(0.22,1,0.36,1)", stagger_ms: 80, principles: ["画面跟旁白走，一句一个变化", "新出现的东西用 highlight 标一次，随后回到 ink", "3D 镜头慢，2D 元素快"] },
});
put({
  type: "style.grade", slug: "sim-explainer-grade", at: [5, 64, 146],
  title: "仿真讲解调色", summary: "3D 场景明亮自然；黑板场景高对比低饱和；论文段暖纸色；暗场段纯黑强光。",
  spec: { targets: [{ scene: "写实 3D", contrast: "中", saturation: "自然", temperature: "中性偏暖" }, { scene: "黑板", contrast: "高", saturation: "低（只有语义色饱和）" }, { scene: "论文", look: "暖黄纸 + 轻微暗角" }], grain: 0.0, vignette: 0.1 },
});

// ---------------------------------------------------------------- 结构
put({
  type: "structure.narrative", slug: "conclusion-first-reversal", at: [1, 69, 108, 146],
  title: "结论先行 · 反转 · 理论 · 佐证", summary: "硬核讲解骨架：先给结论吊胃口，再建模、给出保守方案，加一个条件后反转，最后用理论和历史证明。",
  spec: { sections: [
    { name: "钩子", ratio: 0.045, purpose: "结论先行，制造反差" }, { name: "设定", ratio: 0.065, purpose: "交代实验对象（可无旁白）" },
    { name: "问题", ratio: 0.05, purpose: "具体数字描述困境" }, { name: "建模", ratio: 0.19, purpose: "把直觉翻译成可计算的问题" },
    { name: "方案一", ratio: 0.055, purpose: "合理但保守" }, { name: "反转", ratio: 0.185, purpose: "加一项条件，做法彻底改变" },
    { name: "蒙太奇", ratio: 0.04, purpose: "与现实连接，情绪推高" }, { name: "理论", ratio: 0.22, purpose: "为什么是这个结构" },
    { name: "佐证", ratio: 0.08, purpose: "历史与权威" }, { name: "彩蛋", ratio: 0.07, purpose: "开源 / 互动" },
  ] },
});
for (const [slug, title, at, beats] of [
  ["hook-conclusion-first", "结论先行钩子（约 7 秒）", [1, 5, 7], ["展示'做了很多次'的证据画面", "抛出反直觉结论", "一个大字点题"]],
  ["plan-reversal", "方案一 → 加一项代价 → 方案二反转", [64, 72, 85, 92.5], ["展示合理但保守的方案", "公式里加一项", "新方案做法截然不同", "量化对比（×2）"]],
  ["theory-back-to-sim", "理论推导后回到仿真验证", [139, 141], ["推出结构性结论", "画中画回放仿真", "理论曲线与仿真曲线重合"]],
  ["evidence-chain", "人物 + 论文 + 年份 + 原话的证据链", [110, 146, 151, 155, 158], ["提出者与年份", "论文原图描线", "年份滚动跨越", "现代人物引用", "原话金句"]],
] as const) put({ type: "structure.segment", slug, title, at: [...at], summary: beats.join(" → "), spec: { beats: beats.map((b) => ({ beat: b })) } });
put({
  type: "structure.rhythm", slug: "hoverslam-rhythm", at: [101, 102],
  title: "硬核讲解节奏（实测）", summary: "段时长中位约 2.2 秒；蒙太奇每镜约 0.43 秒；约 41% 硬切落在旁白停顿里；语速约 335 字/分钟。",
  spec: { metrics: { segment_median_s: 2.2, montage_cut_s: 0.43, cuts_in_pause_share: 0.41, chars_per_min_speaking: 335 }, rules: ["画面变化跟短语走", "无旁白段落用于设定交代和情绪推高"] },
});
put({
  type: "structure.edit", slug: "montage-fast-cut", at: [101, 103],
  title: "快剪蒙太奇", summary: "无旁白、配乐推高，0.4 秒左右一镜，把理论和现实连接起来。",
  spec: { definition: "连续短镜头快速切换", constraints: { cut_s: [0.3, 0.6], requires: ["配乐推高", "无旁白"] } },
});

// ---------------------------------------------------------------- 效果（E01–E25）
const fx: Array<[string, string, string, number[], string, Record<string, unknown>]> = [
  ["effect.render3d", "ghost-trajectories", "多次仿真残影叠加 + 计数器", [1, 2], "上百次仿真的车辆以低不透明度叠加，左上计数器滚动，表达'模拟了几百次'。", { runtime: "three", params: { runs: 320, opacity: 0.08 }, slots: { model: "content.model3d", data: "data.simulation" } }],
  ["effect.text-motion", "big-word-slam", "结论大字砸入", [7], "黑底上一个大字快速放大到位，点题。", { runtime: "mg", params: { scale_from: 1.4, dur_s: 0.25 } }],
  ["effect.render3d", "photo-to-pointcloud", "照片 → 点云 → 模型", [10, 11, 12], "多角度照片飞入，点云聚合，再实体化成模型。", { runtime: "three", params: { points: 9000 } }],
  ["effect.render3d", "exploded-view", "爆炸图拆解", [15], "部件沿各自方向分离，展示内部结构。", { runtime: "three", params: { spread: 1.5 }, slots: { model: "content.model3d（需部件拆分）" } }],
  ["effect.render3d", "xray-shell", "X 光透视", [14, 16], "外壳变为青色半透明，露出内部气罐与管路。", { runtime: "three", params: { color: "xray", opacity: 0.25 } }],
  ["effect.camera", "nozzle-flythrough", "镜头穿过喷管", [16], "高速推镜穿过喷管内部。", { runtime: "three", params: { dur_s: 0.5 } }],
  ["effect.element-motion", "readout-overlay", "读数与计时器叠加", [19, 25], "速度、时间读数随仿真实时变化，等宽数字滚动。", { runtime: "svg", params: { decimals: 2 } }],
  ["effect.overlay", "height-marker", "高度标注竖线", [22, 23], "3D 场景里从桥面到地面的标注线 + 数值。", { runtime: "three+svg", params: { label: "9.2 m" } }],
  ["effect.dataviz", "valve-heatmap-update", "阀门开度矩阵更新", [31, 32, 33], "10 个阀门 × 时间的开度热力图随时间点亮。", { runtime: "svg", data_slots: ["valves[10]"], params: { cell: "rounded" } }],
  ["effect.transition", "real-to-diagram", "3D 实景转黑底示意图", [35, 37, 39], "实景里的车变成半透明，背景淡出为黑板，车落成 2D 示意。", { runtime: "three+svg", duration: [1.0, 2.0] }],
  ["effect.text-motion", "formula-term-append", "公式逐项追加 + 项下注释", [40, 41, 42, 46], "公式一项一项出现，新项高亮，中文注释写在项下。", { runtime: "svg+katex", params: { term_s: 0.5 } }],
  ["effect.dataviz", "curve-area-draw", "曲线描画 + 面积填充", [47, 48], "曲线从左到右画出，超阈值部分面积填充为 warn。", { runtime: "svg", data_slots: ["v(t)"] }],
  ["effect.dataviz", "trajectory-family", "轨迹族展开 + 最优解高亮", [55, 56, 58], "一族候选轨迹同时展开，超标的标红，最优的标黄。", { runtime: "svg", data_slots: ["trajectories[]", "cost[]"] }],
  ["effect.overlay", "telemetry-hud", "实景仿真 + 侧边遥测 HUD", [64, 67, 83], "实景仿真画面右侧叠加半透明面板：气罐液位、阀门曲线、下落速度。", { runtime: "svg-over-3d", slots: { panel: "content.ui/telemetry-side-panel" }, data_slots: ["gas_used", "valve_bottom", "v_down"] }],
  ["effect.dataviz", "plan-compare", "两方案曲线与气罐对比", [90, 91, 92.5], "两条控制曲线叠加，两个气罐液位对比，出现 ×2。", { runtime: "svg", data_slots: ["plan1", "plan2"] }],
  ["effect.text-motion", "countdown-number", "关键数字大字（0.7 秒）", [84, 85], "大号数字叠在画面左上，带单位。", { runtime: "mg" }],
  ["effect.overlay", "picture-in-picture", "画中画回放仿真", [139, 140], "推导画面里嵌入一个小窗回放仿真，与曲线同步。", { runtime: "compose" }],
  ["effect.overlay", "paper-figure-trace", "论文配图描线", [146, 147], "在论文原图上用 highlight 描出答案曲线。", { runtime: "svg-over-image" }],
  ["effect.element-motion", "year-ruler-roll", "年份刻度尺滚动", [150.5, 151], "年份数字滚动，下面刻度尺平移。", { runtime: "mg", params: { from: 1964, to: 2016 } }],
  ["effect.element-motion", "lower-third-in", "人名条入场", [153, 154], "名字与头衔分两行滑入。", { runtime: "mg" }],
  ["effect.camera", "article-push-highlight", "文章截图推镜 + 高亮", [155, 156], "截图缓慢推近，引用句出现荧光笔高亮。", { runtime: "mg" }],
  ["effect.text-motion", "quote-typewriter", "金句逐字打出 + 关键词变色", [157, 158, 159], "中文逐字打出，关键词变 warn，下方英文原句淡入。", { runtime: "mg" }],
  ["effect.element-motion", "github-card-stars", "GitHub 卡片 + 星标滚动", [161, 166, 169], "仓库卡片出现，星标数快速滚动增长。", { runtime: "mg" }],
  ["effect.particle", "cold-gas-jet", "冷气喷射白雾", [41.5, 82], "喷口喷出的白色气流。", { runtime: "three", params: { seeded: true } }],
  ["effect.text-motion", "subtitle-keyword", "字幕关键词标黄", [1, 29], "底部字幕中的关键词使用 highlight 色。", { runtime: "mg" }],
];
for (const [type, slug, title, at, summary, spec] of fx) put({ type, slug, title, at, summary, styles: [STYLE], spec });

// ---------------------------------------------------------------- 画面内容
const content: Array<[string, string, string, number[], string, Record<string, unknown>]> = [
  ["content.model3d", "minicar-teal", "薄荷色微型车", [12, 13], "写实微型电动车，内部气罐、阀门、喷口需可拆分。", { format: "glb", units: "m", parts: ["body", "tank_1..4", "valve_1..10", "nozzle_bottom", "nozzle_side_*"], materials: ["写实", "X 光"] }],
  ["content.scene3d", "city-overpass-day", "白天城市高架", [17, 22, 64], "城市楼群、高架、斑马线、锥桶，天空光。", { placements: ["高架", "道路", "楼群", "锥桶"], lighting: "天空光 + 太阳投影", cameras: ["高架侧面俯拍", "桥下仰拍", "车尾跟拍"] }],
  ["content.model3d", "lunar-module", "登月舱", [148], "登月舱模型（泛化外观）。", { format: "glb", units: "m" }],
  ["content.model3d", "reusable-rocket", "可回收火箭", [96, 105], "可回收火箭一级（泛化外观，不做成特定品牌）。", { format: "glb", units: "m" }],
  ["content.material", "xray-shell", "X 光青色半透明材质", [14], "边缘高光的青色半透明材质。", { kind: "shader", resolution: "n/a" }],
  ["content.vector", "vehicle-side-diagram", "车辆侧视示意图", [39, 128], "扁平半透明车辆侧视图，配受力与速度箭头。", { kind: "diagram", layers: ["body", "arrows", "labels"] }],
  ["content.vector", "gas-tank-gauge", "气罐液位图标", [49, 64, 92.5], "液位可变的气罐图标，满 / 半 / 空 / 超标四种状态。", { kind: "icon", layers: ["body", "liquid", "label"], params: { level: [0, 1] } }],
  ["content.vector", "valve-markers", "阀门编号点", [30, 31], "车身上的阀门位置编号圆点。", { kind: "icon", layers: ["dot", "number"] }],
  ["content.chart", "valve-heatmap", "阀门开度热力图", [32, 50], "阀门 × 时间的开度矩阵。", { chart_type: "heatmap", bindings: { x: "time", y: "valve", color: "opening" } }],
  ["content.chart", "curve-with-area", "曲线 + 面积填充", [47, 48], "带阈值线和超标面积的曲线图。", { chart_type: "line-area", bindings: { x: "t", y: "value" } }],
  ["content.chart", "trajectory-family", "轨迹族坐标图", [56], "高度-时间坐标中的一族轨迹。", { chart_type: "multi-line", bindings: { x: "t", y: "height", series: "run" } }],
  ["content.ui", "telemetry-side-panel", "侧边遥测面板", [64, 83], "半透明面板：气罐液位、阀门曲线、下落速度读数。", { kind: "hud", fields: ["gas_used_kg", "valve_bottom", "v_down"] }],
  ["content.ui", "github-repo-card", "GitHub 仓库卡片", [161, 166], "仓库名 + 星标数的卡片。", { kind: "card", fields: ["repo", "stars"] }],
  ["content.typography", "chapter-label", "章节标签", [15, 61], "左上角白色粗黑体。", { kind: "label", fonts: ["思源黑体 Heavy"] }],
  ["content.typography", "big-word", "大字", [7, 108], "居中超大字，可带问号强调色。", { kind: "big-word", fonts: ["思源黑体 Heavy"] }],
  ["content.typography", "subtitle-highlight", "底部字幕 + 关键词", [1, 29], "底部居中字幕，关键词 highlight。", { kind: "subtitle", fonts: ["思源黑体 Medium"] }],
  ["content.typography", "lower-third", "人名条", [154], "名字 + 头衔两行，深色底。", { kind: "lower-third", fonts: ["Inter Bold", "思源黑体"] }],
  ["content.typography", "quote-card-bilingual", "中英双语金句卡", [159], "中文大字金句 + 英文原句衬线斜体。", { kind: "quote-card", fonts: ["思源黑体 Heavy", "Times Italic"] }],
  ["content.typography", "latex-formula", "LaTeX 公式样式", [44, 128], "白色衬线公式，强调项 highlight，项下中文注释。", { kind: "formula", fonts: ["KaTeX"] }],
  ["content.typography", "year-number", "年份大字", [110, 151], "黄色大号年份数字。", { kind: "big-word", fonts: ["Inter Black"] }],
  ["content.image", "paper-page-1964", "1964 年论文页面（自排版）", [146], "论文版面与配图，按原文重新排版，不直接使用扫描件。", { kind: "typeset", dimensions: "2480x3508" }],
  ["content.image", "rocket-landing-dusk", "火箭着陆写实画面（待生成）", [105, 106], "替代实拍蒙太奇：可回收火箭着陆扬尘，泛化外观。", { kind: "generated", dimensions: "1920x1080" }],
  ["content.footage", "sim-render-plan2", "方案二仿真渲染片段", [82, 86], "方案二的仿真渲染输出（由 data.simulation 驱动）。", { kind: "render", duration: 8, fps: 30 }],
];
for (const [type, slug, title, at, summary, spec] of content) put({ type, slug, title, at, summary, styles: [STYLE], spec });

// ---------------------------------------------------------------- 数据
put({
  type: "data.simulation", slug: "car-hoverslam-mpc", at: [56, 64, 92.5],
  title: "汽车冷气软着陆仿真（MPC）", summary: "800 kg 小车 80 km/h 冲出 9.2 m 高架，10 个冷气阀门，两种代价下的最优控制。",
  spec: {
    params: { mass_kg: 800, speed_kmh: 80, drop_m: 9.2, valves: 10, tank_kg: 145.7, pressure_mpa: 35 },
    channels: [{ name: "t", unit: "s" }, { name: "height", unit: "m" }, { name: "v_down", unit: "m/s" }, { name: "tilt", unit: "deg" }, { name: "valve_1..10", unit: "0-1" }, { name: "gas_used", unit: "kg" }],
    checks: ["方案一用气约 88 kg", "方案二用气约 44 kg", "方案二满推力约在落地前 0.7 s 开始"],
  },
});
put({ type: "data.formula", slug: "cost-function-j", at: [44, 49], title: "代价函数 J（含约束）", summary: "终端代价 + 过程代价 + 用气量，受气罐容量约束。", spec: { latex: "\\min_{u(t)} J=\\Phi(v_T,\\theta_T)+\\int_0^T \\ell(v)\\,dt + w\\int_0^T \\dot m\\,dt \;\; s.t.\; \\int_0^T \\dot m\\,dt\\le m_{tank},\; u_i(t)\\in[0,1]", variables: { v_T: "触地下落速度", theta_T: "触地倾角", "ℓ(v)": "过程中超速代价", "ṁ": "耗气率", u_i: "第 i 个阀门开度" } } });
put({ type: "data.formula", slug: "hamiltonian-switching", at: [128, 139], title: "哈密顿量与开关函数", summary: "H 对 u 线性 → 最小值在端点 → bang-bang。", spec: { latex: "H = S(t)\\,u + H_0,\\quad u^*=\\begin{cases}0 & S>0\\\\1 & S<0\\end{cases}", variables: { "S(t)": "开关函数", H0: "与 u 无关的项" } } });

// ---------------------------------------------------------------- 知识
put({ type: "knowledge.source", slug: "meditch-1964", title: "Meditch 1964 · 登月软着陆最省燃料问题", at: [147], summary: "On the Problem of Optimal Thrust Programming for a Lunar Soft Landing（IEEE TAC, 1964）。", spec: { kind: "paper", title: "On the Problem of Optimal Thrust Programming for a Lunar Soft Landing", authors: ["J. S. Meditch"], year: 1964, reliability: "高（期刊论文）" } });
put({ type: "knowledge.source", slug: "blackmore-2016", title: "Blackmore 2016 · Autonomous Precision Landing of Space Rockets", at: [155], summary: "The Bridge（美国国家工程院）2016 冬季刊文章。", spec: { kind: "article", title: "Autonomous Precision Landing of Space Rockets", authors: ["Lars Blackmore"], year: 2016, reliability: "高" } });
put({ type: "knowledge.person-org", slug: "pontryagin", title: "庞特里亚金", at: [110], summary: "苏联数学家，提出极小值原理。", spec: { name: "Lev Pontryagin", role: "数学家", dates: "1908–1988", image_rights: "肖像需使用公有领域或授权照片" }, restrictions: ["real-person", "internal-reference"] });
put({ type: "knowledge.person-org", slug: "lars-blackmore", title: "Lars Blackmore", at: [154], summary: "时任 SpaceX 首席火箭着陆工程师。", spec: { name: "Lars Blackmore", role: "火箭着陆工程师", image_rights: "不使用肖像，只用人名条" }, restrictions: ["real-person", "internal-reference"] });
put({ type: "knowledge.fact", slug: "plan2-gas-44kg", title: "方案二用气约 44 公斤，方案一约 88 公斤", at: [90, 92.5], summary: "加入用气量代价后，用气减半。", spec: { claim: "方案二整趟用气约 44 kg，方案一约 88 kg", value: [44, 88], unit: "kg", sources: ["data.simulation/car-hoverslam-mpc"], confidence: "仿真结果（待复现）" } });
put({ type: "knowledge.fact", slug: "last-0-7s", title: "落地前最后 0.7 秒才满推力", at: [85], summary: "方案二的 bang-bang 结构。", spec: { claim: "底部喷口在落地前约 0.7 s 开到最大", value: 0.7, unit: "s", sources: ["data.simulation/car-hoverslam-mpc"], confidence: "仿真结果（待复现）" } });
put({ type: "knowledge.quote", slug: "hovering-wastes-propellant", title: "“每悬停一秒，都是在浪费推进剂”", at: [158], summary: "Lars Blackmore 文章中的话。", spec: { text: "every second spent hovering is wasted propellant", translation: "每悬停一秒，都是在浪费推进剂", speaker: "Lars Blackmore", source: "knowledge.source/blackmore-2016" } });
put({ type: "knowledge.concept", slug: "switching-function", title: "开关函数与 bang-bang 控制", at: [139], summary: "哈密顿量对控制量线性时，最优控制只取端点。", spec: { term: "开关函数 S(t)", explanation: "H = S·u + H₀，S>0 时 u=0，S<0 时 u=1；S 单调则最多切换一次。", analogies: ["能省就省，最后一刻踩死刹车"], visual_ideas: ["S(t) 直线过零点，下方同步画出 u 从 0 跳到 1"] } });
put({ type: "knowledge.event", slug: "pontryagin-principle", title: "极小值原理提出", at: [110], summary: "庞特里亚金等人提出极小值原理（片中写 1956 年）。", spec: { date: "1956", title: "庞特里亚金极小值原理", sources: ["待补充"] } });

// ---------------------------------------------------------------- 声音
put({ type: "sound.voice", slug: "explainer-male-zh", title: "中文讲解男声", at: [], summary: "理性、偏快（约 335 字/分钟），结论句加重。", kind: "made", spec: { provider: "elevenlabs", voice_id: "待选", model: "eleven_multilingual_v2", pace_cpm: 335, sample: null } });
put({ type: "sound.music", slug: "tech-bed-low", title: "低电平科技铺底", at: [8, 30], summary: "全程铺底，电平压低，不抢人声。", spec: { mood: "理性、悬念", bpm: null, sections: ["铺底"], generator: "代码作曲（待实现）" } });
put({ type: "sound.music", slug: "montage-swell", title: "蒙太奇推高段", at: [101, 104], summary: "无旁白段落推高，约 -14 dB。", spec: { mood: "推进、宏大", bpm: null, sections: ["上扬", "高点", "回落"] } });
for (const [slug, title, at, cat] of [["car-impact", "车辆撞击", 25, "impact"], ["cold-gas-hiss", "冷气喷射", 41.5, "air"], ["readout-tick", "读数跳动", 64, "ui"]] as const) {
  put({ type: "sound.sfx", slug, title, at: [at], summary: `${title}音效（待分轨确认）`, spec: { category: cat, onset_ms: null } });
}

lib.invalidate();
writeIndex(lib);
console.log(`✓ ${lib.entries().length} 条 · 素材库 ${root}${video ? "（含关键帧预览）" : "（未提供 --video，没有预览）"}`);
