// 归类：决策树（互斥且穷尽）+ 关键词建议。任何构成要素都能落到唯一的 <大类>.<小类>。
import { CONTENT_BY_MEDIUM, DECISION_TREE, subtypeOf, type CategoryId } from "./taxonomy.ts";

/** 按决策树走：answers[nodeId] = true/false；第一个 true 决定大类，再在 choose 里选小类 */
export function classifyByAnswers(answers: Record<string, boolean>, pick: string): string {
  for (const n of DECISION_TREE) {
    if (answers[n.id]) {
      const ok = n.yes.choose?.some((c) => c.subtype === pick);
      if (!ok) throw new Error(`「${n.question}」为是时，小类只能是：${n.yes.choose?.map((c) => c.subtype).join(" / ")}`);
      return `${n.yes.category}.${pick}`;
    }
  }
  if (!CONTENT_BY_MEDIUM.some((c) => c.subtype === pick)) throw new Error(`画面内容的小类只能是：${CONTENT_BY_MEDIUM.map((c) => c.subtype).join(" / ")}`);
  return `content.${pick}`;
}

// 关键词建议：用于快速归类和拆解时的批量预分类（最终以决策树为准）
const RULES: Array<[RegExp, string]> = [
  [/拆解记录|参考视频拆解/, "reference.video"],
  [/论文|出处|文献|报道|网页|访谈记录|书籍/, "knowledge.source"],
  [/原话|引语|名言|台词/, "knowledge.quote"],
  [/事实|数据点|结论是|公斤|米每秒|统计显示/, "knowledge.fact"],
  [/概念|类比|定义/, "knowledge.concept"],
  [/人物|科学家|工程师|公司|机构/, "knowledge.person-org"],
  [/事件|年份|时间线|历史上/, "knowledge.event"],
  [/旁白|配音|对白|人声|解说/, "sound.voice"],
  [/配乐|音乐|bgm|旋律|鼓点/i, "sound.music"],
  [/环境声|底噪|车流声|风声/, "sound.ambience"],
  [/音效|撞击声|嗖|提示音|滴答|喷气声/, "sound.sfx"],
  [/叙事|三幕|段落顺序|整体结构/, "structure.narrative"],
  [/钩子|开头|证据链|对比段/, "structure.segment"],
  [/节奏|切点密度|段时长/, "structure.rhythm"],
  [/剪辑|跳切|j-cut|l-cut|匹配剪辑|蒙太奇|快剪/i, "structure.edit"],
  [/风格包|整体风格/, "style.pack"],
  [/色板|配色|颜色含义/, "style.palette"],
  [/字体规范|字号|排版规范/, "style.type-system"],
  [/版式|构图|安全区|分区/, "style.layout"],
  [/动效语言|缓动规范|运动规则/, "style.motion-language"],
  [/调色风格|质感|色调/, "style.grade"],
  [/仿真|模拟输出|轨迹数据/, "data.simulation"],
  [/数据集|统计表|表格数据/, "data.dataset"],
  [/公式本身|方程|推导/, "data.formula"],
  [/geojson|经纬度|地理数据/i, "data.geo"],
  [/逐字|打字机|关键词变色|公式逐项/, "effect.text-motion"],
  [/轨迹族|曲线描画|热力图更新|数据动画/, "effect.dataviz"],
  [/推镜|拉镜|摇镜|环绕|穿越|跟拍|运镜/, "effect.camera"],
  [/转场|擦除|闪白/, "effect.transition"],
  [/画中画|分屏|标注线|叠加|遮罩/, "effect.overlay"],
  [/x 光|x光|爆炸图|残影|点云|线框|剖面/i, "effect.render3d"],
  [/粒子|烟雾|火焰|扬尘|火花|喷雾/, "effect.particle"],
  [/颗粒|暗角|景深|动态模糊|辉光|lut|色差/i, "effect.post"],
  [/入场|弹出|计数|脉冲|描线|强调动作/, "effect.element-motion"],
  [/3d 场景|三维场景|城市场景|场景装配/i, "content.scene3d"],
  [/3d 模型|三维模型|glb|模型/i, "content.model3d"],
  [/材质|贴图|hdri|纹理/i, "content.material"],
  [/图表|坐标轴|曲线图|柱状|仪表/, "content.chart"],
  [/hud|面板|卡片|界面|窗口/i, "content.ui"],
  [/大字|标题|字幕|人名条|金句卡|标签|公式排版/, "content.typography"],
  [/字体文件|字族/, "content.font"],
  [/logo|商标|水印|标志/i, "content.brand"],
  [/lottie|序列帧|gif|预制动画/i, "content.animation"],
  [/图标|示意图|插画|矢量|svg/i, "content.vector"],
  [/实拍|视频片段|录屏|空镜|素材片段/, "content.footage"],
  [/照片|截图|生成图|图片|扫描/, "content.image"],
];

export function suggest(text: string): Array<{ type: string; name: string; category: CategoryId }> {
  const seen = new Set<string>();
  const out: Array<{ type: string; name: string; category: CategoryId }> = [];
  for (const [re, t] of RULES) if (re.test(text) && !seen.has(t)) {
    seen.add(t);
    const st = subtypeOf(t)!;
    out.push({ type: t, name: `${st.category.name} · ${st.subtype.name}`, category: st.category.id });
  }
  return out;
}
