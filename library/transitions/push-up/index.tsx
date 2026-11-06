// 转场：自下推入。参考集中滑入方向以"从下进入"最多（35%）。
import type React from "react";

export default function pushUp(p: number): React.CSSProperties {
  return { transform: `translateY(${(1 - p) * 100}%)` };
}
