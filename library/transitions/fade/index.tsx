// 转场：淡入。返回入场方镜头在转场进度 p（0→1）下的样式。
import type React from "react";

export default function fade(p: number): React.CSSProperties {
  return { opacity: p };
}
