// 素材分类体系：8 大类 · 46 小类。
//
// 完备性：任何视频里的任何构成要素，都能用下面的 7 个问题依次判断归类（见 DECISION_TREE）。
// 问题是互斥且穷尽的：一个要素要么是视频之外的知识，要么是声音，要么是组织时间的结构，
// 要么是一组规则，要么是数据，要么是"变化 / 处理"，否则它就是画面里出现的"东西"；
// "东西"再按媒介形态（3D / 矢量 / 位图 / 视频 / 预制动画 / 文字 / 字体 / 界面 / 图表 / 标识）细分，形态本身是穷尽的。
// reference 不是要素，而是"一整条参考视频的拆解记录"，把拆出来的要素串在一起。

export type CategoryId = "knowledge" | "style" | "content" | "data" | "effect" | "sound" | "structure" | "reference";

export type PreviewKind = "image" | "video" | "audio" | "palette" | "text" | "model" | "data" | "doc";

export interface Subtype {
  id: string;
  name: string;
  en: string;
  description: string;
  /** 典型例子（跨题材：讲解、广告、vlog、电影、MG、游戏、音乐视频……），也用于完备性测试 */
  examples: string[];
  /** 这类素材入库时要存的东西（文件 / 档案字段） */
  stores: string[];
  /** 提交审查前必须填写的 spec 字段 */
  requiredForReview: string[];
  preview: PreviewKind;
  /** 推荐的制作路线 */
  routes: string[];
}

export interface Category {
  id: CategoryId;
  name: string;
  en: string;
  description: string;
  /** 界面主色（OKLCH 友好的 hex） */
  color: string;
  icon: string;
  subtypes: Subtype[];
}

const S = (
  id: string, name: string, en: string, description: string, examples: string[], stores: string[],
  requiredForReview: string[], preview: PreviewKind, routes: string[],
): Subtype => ({ id, name, en, description, examples, stores, requiredForReview, preview, routes });

export const CATEGORIES: Category[] = [
  {
    id: "knowledge", name: "知识素材", en: "Knowledge", color: "#5B8DEF", icon: "book",
    description: "视频之外的信息：资料来源、事实与数据点、引语、概念与类比、人物与机构、事件。是脚本的原料。",
    subtypes: [
      S("source", "资料来源", "Source", "论文、书籍、报道、网页、访谈、官方文件等可被引用的出处。",
        ["1964 年 Meditch 登月软着陆论文", "SpaceX 工程师撰写的技术文章", "百科词条", "专家访谈录音"],
        ["kind（paper/book/article/web/interview/document/video）", "标题、作者、年份", "链接或 DOI", "可靠性评级", "本地存档（PDF / 网页快照）"],
        ["kind", "title", "reliability"], "doc", ["检索", "人工整理"]),
      S("fact", "事实与数据点", "Fact", "一条可核查的结论或数字，必须附出处。",
        ["小车重 800 公斤", "方案二用气约 44 公斤", "蓝光散射强度约为红光 5.5 倍"],
        ["结论原文", "数值与单位", "出处（source 引用）", "可信度", "核查人与核查日期"],
        ["claim", "sources", "confidence"], "text", ["检索", "计算", "仿真复现"]),
      S("quote", "引语", "Quote", "某人说过或写过的原话，含原文与译文。",
        ["“每悬停一秒，都是在浪费推进剂”", "电影台词", "采访金句"],
        ["原文", "译文", "说话人", "出处与日期"], ["text", "speaker", "source"], "text", ["检索"]),
      S("concept", "概念与类比", "Concept", "需要被讲清楚的概念，以及解释它的类比和可视化想法。",
        ["哈密顿量 = 此刻代价率 + 协态 × 状态变化率", "开关函数", "瑞利散射"],
        ["术语", "通俗解释", "类比", "可视化想法（画面构思）", "前置概念"], ["term", "explanation"], "text", ["检索", "写作"]),
      S("person-org", "人物与机构", "Person / Org", "出现在视频里的真实人物、团队、公司、机构。",
        ["庞特里亚金（1908–1988）", "Lars Blackmore · SpaceX", "NASA"],
        ["名称", "身份与头衔", "生卒或成立年份", "可用肖像 / 标识的授权情况"], ["name", "role", "image_rights"], "text", ["检索"]),
      S("event", "事件与时间线", "Event", "有日期的事件，用于时间线、历史佐证。",
        ["1956 年极小值原理提出", "2016 年首次海上回收", "阿波罗登月"],
        ["日期", "标题", "描述", "出处"], ["date", "title", "sources"], "text", ["检索"]),
    ],
  },
  {
    id: "style", name: "风格", en: "Style", color: "#C46BE8", icon: "palette",
    description: "规定素材\"长什么样、怎么动\"的规则与参数，不是具体可见的东西。",
    subtypes: [
      S("pack", "风格包", "Style Pack", "一套完整风格：引用色板、字体规范、版式、动效语言、调色，附风格帧与禁用清单。",
        ["仿真讲解 · 深色数学黑板 + 写实 3D", "插画科普 · 明亮奶油底", "赛博朋克广告"],
        ["引用的 palette / type-system / layout / motion-language / grade", "场景基调", "材质语言", "禁用清单", "风格帧（图）", "参考关键帧"],
        ["palette", "frames", "banned"], "image", ["拆解参考视频", "设计"]),
      S("palette", "色板", "Palette", "颜色 token、语义与章节色板。",
        ["黄=最优 / 关注，浅蓝=对照，橙红=超标", "品牌色板", "电影调色板"],
        ["颜色列表（token、hex、含义）", "章节变体", "对比度检查结果"], ["colors"], "palette", ["拆解取色", "设计"]),
      S("type-system", "字体排版规范", "Type System", "各类文字用什么字体、字重、字号、行距、强调方式。",
        ["粗黑体章节标签 + LaTeX 公式 + 等宽数字", "杂志风衬线标题"],
        ["角色 → 字体（引用 content.font）", "字号阶梯（占画面高度比例）", "强调规则"], ["roles", "scale"], "image", ["拆解", "设计"]),
      S("layout", "版式与构图", "Layout", "画面分区、网格、安全区，以及各元素的固定位置。",
        ["左上章节标签 + 右侧 HUD + 底部字幕", "竖屏窗口版式", "三分法构图规则"],
        ["画布尺寸与比例", "安全区", "分区（名称 + 位置）", "示意图"], ["canvas", "zones"], "image", ["拆解", "设计"]),
      S("motion-language", "动效语言", "Motion Language", "全片统一的运动规则：时长、缓动、间隔、强调方式、运动原则。",
        ["入场 0.4s 缓出、逐项间隔 80ms", "弹性 UI 动效规范", "迪士尼动画原则子集"],
        ["时长", "缓动曲线", "逐个间隔", "强调规则", "禁用动作"], ["durations", "easing"], "video", ["拆解测量", "设计"]),
      S("grade", "调色与质感", "Grade & Texture", "整体色调、对比、饱和度、颗粒、暗角等质感规则（实现见 effect.post）。",
        ["暗场高对比 + 冷色", "胶片暖调 + 颗粒", "明亮低对比插画质感"],
        ["对比度 / 饱和度 / 色温目标", "颗粒与暗角强度", "LUT 引用", "前后对比图"], ["targets"], "image", ["拆解测量", "设计"]),
    ],
  },
  {
    id: "content", name: "画面内容", en: "Content", color: "#2FB98A", icon: "shapes",
    description: "画面里出现的\"东西\"，按媒介形态分：3D、矢量、位图、视频、预制动画、文字、字体、界面、图表、标识。",
    subtypes: [
      S("model3d", "3D 模型", "3D Model", "物体、角色、道具、载具、建筑等单个 3D 资产。",
        ["可拆开气罐与阀门的微型车", "登月舱", "可回收火箭", "游戏角色", "产品模型"],
        ["模型文件（glb）", "源文件（可选）", "部件清单（命名节点 + 可动方式）", "材质变体（写实 / X 光 / 线稿）", "单位、朝向、原点、面数", "骨骼与动画片段", "转台预览"],
        ["format", "units", "parts"], "model", ["授权模型改造", "程序化建模", "Three.js"]),
      S("scene3d", "3D 场景", "3D Scene", "由多个模型、环境、灯光、机位组成的场景装配。",
        ["白天城市高架 + 斑马线", "太空背景", "产品摄影棚"],
        ["摆放清单（引用 model3d@版本 + 位姿）", "环境贴图", "灯光预设", "机位预设", "场景预览"], ["placements", "lighting"], "image", ["Three.js 装配"]),
      S("material", "材质与贴图", "Material & Texture", "PBR 材质、贴图、环境贴图（HDRI）、matcap。",
        ["沥青路面 PBR", "城市天空 HDRI", "X 光青色半透明材质", "纸张纹理"],
        ["类型", "各通道贴图（basecolor/normal/roughness…）", "分辨率", "无缝与否", "预览球"], ["kind", "resolution"], "image", ["授权素材", "程序化生成", "图像生成"]),
      S("vector", "矢量图形", "Vector Graphic", "图标、插画、示意图、2D 角色、地图、图案等矢量资产。",
        ["车辆侧视示意图", "气罐液位图标", "阀门编号点", "扁平插画角色", "地图轮廓", "流程示意图"],
        ["分层命名的 SVG", "可调参数（如液位）", "状态变体", "对齐 / 连接点", "多尺寸预览"], ["kind", "layers"], "image", ["手写 SVG", "矢量化"]),
      S("chart", "图表组件", "Chart", "绑定数据的参数化图形：曲线、柱状、热力图、坐标轴、仪表。",
        ["阀门开度热力图", "用气曲线 + 面积填充", "轨迹族坐标图", "股价 K 线"],
        ["图表类型", "数据绑定（通道 → 视觉通道）", "坐标轴与刻度规则", "样式 token", "示例数据预览"], ["chart_type", "bindings"], "image", ["SVG + 数据"]),
      S("ui", "界面与面板", "UI & Panel", "HUD、信息卡片、窗口、屏幕界面、按钮等界面类组合元素。",
        ["右侧半透明遥测 HUD", "GitHub 仓库卡片", "手机 App 界面", "游戏 UI"],
        ["组件结构（子元素引用）", "可变字段", "状态", "尺寸与锚点", "预览"], ["kind", "fields"], "image", ["SVG / HTML 组件"]),
      S("image", "位图图像", "Image", "照片、生成图、截图、扫描件等位图。",
        ["火箭着陆写实画面（生成）", "多角度拍车照片", "论文页面", "人物肖像（授权）", "产品摄影"],
        ["原图", "生成记录（模型、提示词、参数）或拍摄 / 授权信息", "分层或深度图（用于视差）", "安全裁切区", "是否涉及真实人物 / 品牌"], ["kind", "dimensions"], "image", ["OpenAI 图像生成", "授权图库", "自行排版"]),
      S("footage", "视频片段", "Footage", "实拍、生成、录屏、渲染出来的视频片段。",
        ["火箭着陆实拍", "仿真渲染片段", "软件操作录屏", "航拍空镜", "访谈画面"],
        ["视频文件", "时长、帧率、分辨率", "有无音轨", "来源与授权", "可用区间（入点 / 出点）", "关键帧拼图"], ["kind", "duration", "fps"], "video", ["渲染输出", "授权素材", "录屏"]),
      S("animation", "预制动画", "Pre-made Animation", "自带时间轴的动画资产：Lottie、Rive、序列帧、GIF。",
        ["加载动画 Lottie", "角色挥手序列帧", "图标动效"],
        ["动画文件", "时长、帧率、是否循环", "可控参数", "确定性检查（能否按帧定位）"], ["format", "duration"], "video", ["Lottie / 序列帧"]),
      S("typography", "文字元素", "Typography", "画面中的文字设计：标题、大字、字幕样式、人名条、金句卡、公式样式、标签、标注。",
        ["大字「数学」", "章节标签", "底部字幕 + 黄色关键词", "人名条", "中英双语金句卡", "LaTeX 公式排版", "年份大字"],
        ["模板代码", "参数（文字、高亮词、语言）", "使用的字体（引用 content.font）", "多尺寸预览"], ["kind", "fonts"], "image", ["SVG / MG 模板", "KaTeX"]),
      S("font", "字体", "Font", "字体文件及其授权。",
        ["思源黑体", "Inter", "JetBrains Mono", "KaTeX 数学字体"],
        ["字体文件", "字族与字重", "支持的文字（中 / 英 / 数学）", "授权"], ["family", "license"], "image", ["开源字体", "授权字体"]),
      S("brand", "标识", "Brand Mark", "logo、商标、水印、吉祥物等身份类素材，必须登记权利。",
        ["频道 logo", "GitHub 标志", "合作方商标", "节目水印"],
        ["文件（矢量优先）", "所有者", "使用授权与限制", "最小尺寸与留白规则"], ["owner", "rights"], "image", ["用户提供", "官方素材包"]),
    ],
  },
  {
    id: "data", name: "数据", en: "Data", color: "#E0A030", icon: "chart",
    description: "驱动画面的数据与公式：仿真、数据集、公式、地理数据。画面、读数、曲线都从这里取值，保证一致。",
    subtypes: [
      S("simulation", "仿真", "Simulation", "可运行、确定性的模型及其输出（轨迹、控制量、状态量）。",
        ["汽车软着陆 MPC 仿真", "几百次随机初值的轨迹", "种群演化模拟", "流体模拟"],
        ["仿真代码（带种子）", "参数", "每次运行的输出数据", "数据字典（通道、单位、频率）", "合理性校验", "曲线 / 轨迹预览"], ["params", "channels"], "data", ["Python / JS 仿真"]),
      S("dataset", "数据集", "Dataset", "外部或整理出来的表格 / 时间序列数据。",
        ["历年火箭回收次数", "城市人口统计", "实验测量数据"],
        ["数据文件", "列定义与单位", "来源与授权", "更新日期", "预览图"], ["columns", "source"], "data", ["下载", "整理"]),
      S("formula", "公式", "Formula", "公式本身（内容），含变量含义与推导步骤；排版样式见 content.typography。",
        ["J = Φ(v_T, θ_T) + ∫ ℓ(v) dt", "H = S(t)·u + H₀", "伯努利方程"],
        ["LaTeX", "变量含义", "推导步骤（逐项追加顺序）", "出处"], ["latex", "variables"], "text", ["整理", "推导"]),
      S("geo", "地理数据", "Geo Data", "地图边界、路线、坐标点等地理数据。",
        ["发射场坐标", "国家边界 GeoJSON", "航线"],
        ["GeoJSON / TopoJSON", "投影", "来源与授权"], ["format", "source"], "data", ["开放数据"]),
    ],
  },
  {
    id: "effect", name: "呈现效果", en: "Effect", color: "#F0644B", icon: "sparkles",
    description: "\"变化与处理\"：东西怎么出现、怎么动，镜头怎么动，画面怎么转场、叠加、渲染和后期。每个效果都是可调参数的代码 + 样片。",
    subtypes: [
      S("element-motion", "元素动效", "Element Motion", "单个元素的入场、退场、强调、变形、计数等动作。",
        ["弹出入场", "数字滚动计数", "关键项脉冲强调", "图形变形", "描线绘制"],
        ["实现代码（运行环境）", "参数与默认值", "插槽（需要的素材）", "节奏（入场 / 停留 / 退场）", "样片"], ["runtime", "params"], "video", ["MG / SVG / Three.js"]),
      S("text-motion", "文字动效", "Text Motion", "文字特有的动画：逐字打出、打字机、关键词变色、公式逐项追加。",
        ["金句逐字打出 + 关键词变色", "公式逐项追加并在项下注释", "大字砸入", "卡拉 OK 字幕"],
        ["实现代码", "参数", "插槽（文字元素）", "样片"], ["runtime", "params"], "video", ["MG / SVG"]),
      S("dataviz", "数据可视化动效", "Data Viz Motion", "数据驱动的动画：曲线描画、轨迹族展开、热力图更新、对比。",
        ["一族轨迹展开 + 最优解高亮 + 超标标红", "阀门开度矩阵随时间更新", "两方案曲线叠加对比"],
        ["实现代码", "数据插槽（通道）", "参数", "样片"], ["runtime", "data_slots"], "video", ["SVG + 数据"]),
      S("camera", "镜头运动", "Camera Move", "虚拟或实拍的机位运动：推拉摇移、环绕、穿越、跟拍、手持晃动。",
        ["高速穿过喷管", "环绕重建模型", "跟拍坠落", "缓慢推镜", "尺度穿越"],
        ["运动曲线（关键帧 / 参数）", "适用场景（3D / 2.5D / 平面）", "样片"], ["runtime", "params"], "video", ["Three.js", "2.5D 视差"]),
      S("transition", "转场", "Transition", "两个镜头之间的过渡方式（视觉层面；剪辑逻辑见 structure.edit）。",
        ["3D 实景转黑底 2D 示意", "遮罩擦除", "缩放穿越", "闪白", "形状转场"],
        ["实现代码", "时长范围", "适用条件", "样片"], ["runtime", "duration"], "video", ["MG / Three.js"]),
      S("overlay", "叠加与合成", "Overlay & Composite", "多个画面层的组合方式：HUD 叠加、标注线、画中画、分屏、遮罩、跟踪贴图。",
        ["实景仿真 + 侧边遥测 HUD", "高度标注竖线 9.2 m", "画中画回放仿真", "计时器叠加", "三分屏"],
        ["实现代码", "层结构与插槽", "跟踪 / 锚定方式", "样片"], ["runtime", "slots"], "video", ["合成"]),
      S("render3d", "3D 表现手法", "3D Rendering Technique", "3D 特有的表现：X 光透视、残影叠加、爆炸图、点云、线框、剖面、描边。",
        ["多次仿真残影叠加", "爆炸图拆解", "X 光透视", "照片 → 点云 → 模型", "卡通描边"],
        ["实现代码（着色器 / 场景操作）", "参数", "适用模型要求（部件拆分等）", "样片"], ["runtime", "params"], "video", ["Three.js"]),
      S("particle", "粒子与模拟特效", "Particle & FX", "烟、火、尘土、水、火花、喷气等粒子或程序化特效。",
        ["冷气喷口白雾", "着陆扬尘", "火花", "雨雪"],
        ["实现代码", "确定性（种子）", "参数", "样片"], ["runtime", "params"], "video", ["Three.js / Canvas"]),
      S("post", "后期处理", "Post Processing", "整体画面处理：调色 / LUT、颗粒、暗角、景深、动态模糊、辉光、色差、镜头光晕。",
        ["暗场高对比调色", "胶片颗粒", "景深模糊", "辉光", "运动模糊"],
        ["实现代码或 LUT 文件", "参数", "前后对比"], ["runtime", "params"], "image", ["着色器", "ffmpeg 滤镜"]),
    ],
  },
  {
    id: "sound", name: "声音", en: "Sound", color: "#14B8C4", icon: "wave",
    description: "听到的一切：配音、配乐、音效、环境声。",
    subtypes: [
      S("voice", "配音", "Voice", "配音预设或录音：音色、语速、停顿、发音。",
        ["ElevenLabs 讲解男声预设", "真人录音", "角色配音"],
        ["服务商与音色编号 / 录音文件", "模型与参数", "语速与停顿规则", "发音词典", "试听片段"], ["provider", "sample"], "audio", ["ElevenLabs", "录音"]),
      S("music", "配乐", "Music", "配乐：生成代码或音频，含情绪、BPM、调性、段落、分轨、节拍网格。",
        ["低电平科技铺底", "蒙太奇推高段", "片尾彩蛋轻快段"],
        ["生成代码与参数（代码作曲）或音频文件", "BPM、调性、情绪", "段落结构", "分轨", "节拍网格", "响度", "试听"], ["bpm", "mood", "sections"], "audio", ["代码生成", "授权曲库"]),
      S("sfx", "音效", "Sound Effect", "点状音效：撞击、喷气、提示音、嗖声、读数跳动。",
        ["撞击声", "冷气喷射", "读数跳动滴答", "转场嗖声", "UI 点击"],
        ["音频文件或合成代码", "起音点（毫秒）", "时长", "类别", "响度"], ["category", "onset_ms"], "audio", ["代码合成", "授权音效库"]),
      S("ambience", "环境声", "Ambience", "持续的环境底噪：城市、风、室内、太空嗡鸣。",
        ["城市车流", "风声", "机房嗡鸣"],
        ["循环音频或合成代码", "可循环点", "情绪", "响度"], ["loop", "mood"], "audio", ["代码合成", "授权素材"]),
    ],
  },
  {
    id: "structure", name: "结构", en: "Structure", color: "#8C93A8", icon: "timeline",
    description: "组织时间的东西：叙事骨架、段落模式、节奏、剪辑手法。跨越多个镜头存在。",
    subtypes: [
      S("narrative", "叙事骨架", "Narrative", "整片的段落顺序与每段作用、时长占比。",
        ["结论先行 → 设定 → 问题 → 建模 → 反转 → 理论 → 佐证 → 彩蛋", "三幕剧", "问题 → 方案 → 证明（广告）"],
        ["段落列表（名称、作用、时长占比、典型画面）", "适用题材", "参考片段映射"], ["sections"], "doc", ["拆解", "写作"]),
      S("segment", "段落模式", "Segment Pattern", "可复用的局部结构：开头钩子、方案对比、理论回到仿真验证、历史证据链。",
        ["结论先行钩子（7 秒）", "方案一 → 加一项代价 → 方案二反转", "人物 + 论文 + 年份 + 原话的证据链"],
        ["节拍列表", "每拍的画面与旁白要求", "时长", "参考片段"], ["beats"], "doc", ["拆解"]),
      S("rhythm", "节奏模板", "Rhythm", "剪辑节奏的数值规则：段时长分布、切点密度、蒙太奇节奏、与旁白和音乐的对齐方式。",
        ["段时长中位 2.2 秒", "蒙太奇每镜 0.43 秒", "41% 切点落在停顿里"],
        ["段时长分布", "每分钟视觉边界", "对齐规则（停顿 / 节拍）", "测量来源"], ["metrics"], "data", ["拆解测量"]),
      S("edit", "剪辑手法", "Edit Technique", "剪辑逻辑：J-cut、L-cut、匹配剪辑、跳切、快剪蒙太奇、硬切、留白。",
        ["火箭着陆快剪蒙太奇", "匹配剪辑", "J-cut 声音先入", "跳切"],
        ["定义", "使用条件与约束（可校验）", "示例片段"], ["definition", "constraints"], "doc", ["剪辑"]),
    ],
  },
  {
    id: "reference", name: "拆解记录", en: "Reference", color: "#9A7B5B", icon: "film",
    description: "一整条参考视频的拆解：元信息、逐段分析、关键帧，以及从它拆出来的全部素材条目。不存原视频。",
    subtypes: [
      S("video", "参考视频拆解", "Video Breakdown", "对一条参考视频的完整拆解记录。",
        ["《汽车飞出高架，怎样才能软着陆？》拆解"],
        ["元信息（标题、链接、作者、时长、规格）", "转写", "切点与节拍", "色彩与响度统计", "逐段拆解（结构 / 风格 / 效果 / 素材 / 声音）", "关键帧（低清，内部参照）", "派生条目清单"],
        ["meta", "segments"], "image", ["拆解"]),
    ],
  },
];

export const CATEGORY_BY_ID = Object.fromEntries(CATEGORIES.map((c) => [c.id, c])) as Record<CategoryId, Category>;

/** 完整类型名："content.model3d" */
export type TypeId = `${CategoryId}.${string}`;

export const ALL_TYPES: TypeId[] = CATEGORIES.flatMap((c) => c.subtypes.map((s) => `${c.id}.${s.id}` as TypeId));

export function subtypeOf(type: string): { category: Category; subtype: Subtype } | null {
  const [cid, sid] = type.split(".");
  const category = CATEGORY_BY_ID[cid as CategoryId];
  const subtype = category?.subtypes.find((s) => s.id === sid);
  return category && subtype ? { category, subtype } : null;
}

// ---------------------------------------------------------------- 归类决策树

export interface DecisionNode {
  id: string;
  question: string;
  hint: string;
  yes: { category: CategoryId; choose?: Array<{ subtype: string; when: string }> };
}

/**
 * 依次回答，第一个"是"决定大类；全部为"否"时是画面内容（content），再按媒介形态选小类。
 * 这 7 个问题互斥且穷尽，所以任何构成要素都有唯一归属。
 */
export const DECISION_TREE: DecisionNode[] = [
  {
    id: "reference", question: "它是对一整条参考视频的拆解记录吗？", hint: "不是视频里的某个要素，而是把一条视频拆开后的总记录。",
    yes: { category: "reference", choose: [{ subtype: "video", when: "一条参考视频" }] },
  },
  {
    id: "knowledge", question: "它是视频之外的知识或文字信息吗（事实、数字、出处、引语、概念、人物、事件）？",
    hint: "问：去掉画面和声音，它还作为'信息'存在吗？例如'800 公斤'这个数字本身。它在画面上的样子另归 content。",
    yes: {
      category: "knowledge", choose: [
        { subtype: "source", when: "可引用的出处" }, { subtype: "fact", when: "可核查的结论 / 数字" },
        { subtype: "quote", when: "某人的原话" }, { subtype: "concept", when: "要解释的概念与类比" },
        { subtype: "person-org", when: "真实人物或机构" }, { subtype: "event", when: "有日期的事件" },
      ],
    },
  },
  {
    id: "sound", question: "它是听到的吗？", hint: "人声、音乐、音效、环境声。字幕是看到的文字，不算声音。",
    yes: {
      category: "sound", choose: [
        { subtype: "voice", when: "人声（旁白、对白、配音）" }, { subtype: "music", when: "有旋律或节奏的音乐" },
        { subtype: "ambience", when: "持续的环境底噪" }, { subtype: "sfx", when: "其余点状声音" },
      ],
    },
  },
  {
    id: "structure", question: "它是组织时间的东西吗（跨越多个镜头：段落顺序、节奏、剪辑逻辑）？",
    hint: "单个镜头里看不出来，要看一段时间才能看出来。转场的'视觉样式'归 effect，'为什么在这里切'归 structure。",
    yes: {
      category: "structure", choose: [
        { subtype: "narrative", when: "整片段落顺序" }, { subtype: "segment", when: "可复用的局部结构" },
        { subtype: "rhythm", when: "节奏的数值规则" }, { subtype: "edit", when: "剪辑手法" },
      ],
    },
  },
  {
    id: "style", question: "它是一组规则或参数，而不是具体可见的东西吗（配色、字体规范、版式、动效语言、调色）？",
    hint: "它约束很多素材的样子，本身不出现在画面上。",
    yes: {
      category: "style", choose: [
        { subtype: "pack", when: "一整套风格" }, { subtype: "palette", when: "颜色" }, { subtype: "type-system", when: "文字规范" },
        { subtype: "layout", when: "构图与分区" }, { subtype: "motion-language", when: "运动规则" }, { subtype: "grade", when: "调色与质感" },
      ],
    },
  },
  {
    id: "data", question: "它是驱动画面的数据或公式本身吗（仿真输出、数据表、公式、地理数据）？",
    hint: "同一份数据可以被 3D、曲线、读数同时使用。数据画成的图形另归 content.chart。",
    yes: {
      category: "data", choose: [
        { subtype: "simulation", when: "可运行模型及其输出" }, { subtype: "dataset", when: "表格 / 时间序列" },
        { subtype: "formula", when: "公式与推导" }, { subtype: "geo", when: "地理数据" },
      ],
    },
  },
  {
    id: "effect", question: "它是一种'变化或处理'，而不是一个'东西'吗（怎么出现、怎么动、镜头怎么动、怎么转场、怎么叠加、怎么渲染、后期）？",
    hint: "可以把同一个效果套在不同的东西上。",
    yes: {
      category: "effect", choose: [
        { subtype: "element-motion", when: "单个元素的动作" }, { subtype: "text-motion", when: "文字的动作" },
        { subtype: "dataviz", when: "数据驱动的动画" }, { subtype: "camera", when: "机位运动" },
        { subtype: "transition", when: "镜头之间的过渡" }, { subtype: "overlay", when: "多层画面的组合方式" },
        { subtype: "render3d", when: "3D 特有的表现" }, { subtype: "particle", when: "粒子 / 程序化特效" },
        { subtype: "post", when: "整体画面处理" },
      ],
    },
  },
];

/** 以上全否：画面里出现的"东西"，按媒介形态选择（形态穷尽） */
export const CONTENT_BY_MEDIUM: Array<{ subtype: string; when: string }> = [
  { subtype: "model3d", when: "单个 3D 资产" }, { subtype: "scene3d", when: "多个 3D 资产 + 环境 + 灯光的装配" },
  { subtype: "material", when: "材质、贴图、环境贴图" }, { subtype: "chart", when: "绑定数据的图表" },
  { subtype: "ui", when: "界面、面板、卡片" }, { subtype: "typography", when: "文字设计" },
  { subtype: "font", when: "字体文件" }, { subtype: "brand", when: "logo、商标、水印" },
  { subtype: "animation", when: "自带时间轴的预制动画" }, { subtype: "vector", when: "其他矢量图形" },
  { subtype: "footage", when: "视频片段" }, { subtype: "image", when: "其他位图" },
];
