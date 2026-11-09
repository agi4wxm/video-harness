// 场景图：积木（kit）和本地镜头的 timeline(t) 返回它，runtime 只负责把它画出来，inspect 直接读它。
// 这样"画面里有什么、在哪、何时出现"在渲染之前就是确定的，评测真值和版面校验都不需要 OCR。
// 坐标单位：画布像素，左上角为原点；box 为元素外框（未缩放前），scale 以框中心为原点。

export type Color = string;
export type Paint = Color | { linear: [Color, Color]; angle?: number } | { radial: [Color, Color] };

export type Role = "title" | "kicker" | "label" | "number" | "body" | "caption" | "focal" | "decor" | "character";

export interface Base {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  opacity?: number;
  scale?: number;
  rotate?: number;
  z?: number;
  /** 0..1，辉光强度（颜色取元素主色或 glowColor） */
  glow?: number;
  glowColor?: Color;
  /** world：受虚拟相机影响；screen：固定在屏幕上（标题、标签层） */
  layer?: "world" | "screen";
  role?: Role;
  /** 元素所在背景色，用于对比度校验 */
  on?: Color;
}

export interface TextEl extends Base {
  type: "text";
  text: string;
  font: "display" | "sans" | "mono";
  size: number;
  weight: number;
  color: Color;
  align?: "left" | "center" | "right";
  /** 0..1，逐字显示进度 */
  reveal?: number;
}
export interface RectEl extends Base { type: "rect"; fill: Paint; radius?: number; stroke?: Color; strokeW?: number }
export interface EllipseEl extends Base { type: "ellipse"; fill: Paint; stroke?: Color; strokeW?: number }
export interface PathEl extends Base {
  type: "path";
  /** 路径坐标相对元素框左上角 */
  d: string;
  fill?: Paint;
  stroke?: Color;
  strokeW?: number;
  /** 0..1，描线进度（需要 length） */
  progress?: number;
  length?: number;
  cap?: "round" | "butt";
  dash?: [number, number];
  dashOffset?: number;
}
/** 小人图标（人群单位图） */
export interface FigureEl extends Base { type: "figure"; fill: Color }
/** 参数化角色：圆身大眼，待机呼吸 + 眨眼 + 表情 */
export interface CharacterEl extends Base {
  type: "character";
  body: Color;
  belly?: Color;
  expression: Expression;
  /** 0 睁眼 .. 1 闭眼 */
  blink: number;
  /** -1..1 呼吸相位 */
  breathe: number;
  /** -1..1 视线方向 */
  look: number;
}
export type Expression = "neutral" | "happy" | "sad" | "surprised" | "worried";

export type El = TextEl | RectEl | EllipseEl | PathEl | FigureEl | CharacterEl;

/** 虚拟相机：x/y 为屏幕中心对准的世界坐标 */
export interface Camera { x: number; y: number; zoom: number }

export interface SceneFrame {
  bg: Paint;
  camera?: Camera;
  els: El[];
  /** 0..1 */
  vignette?: number;
  /** 0..1 */
  grain?: number;
}

export interface ScreenBox { x: number; y: number; w: number; h: number }
