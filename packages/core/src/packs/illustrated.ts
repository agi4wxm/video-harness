// 内置设计包：插画世界。修改后跑 pnpm --filter @video-harness/core test（含对比度校验）。
export default {
  "id": "illustrated",
  "title": "插画世界（明亮底色 · 高彩度 · 语义色 · 辉光）",
  "notes": "扁平矢量、无描边、圆角几何；质感来自渐变与辉光，不来自纹理。按章节换整套调色板。原则借鉴自参考分析（taste/explainer-illustrated.md），不复刻任何频道的角色与视觉标识。",
  "fonts": {
    "display": "'Fredoka', 'Noto Sans SC', sans-serif",
    "sans": "'Inter', 'Noto Sans SC', sans-serif",
    "mono": "'JetBrains Mono', monospace"
  },
  "type": {
    "kicker": 0.028,
    "label": 0.032,
    "caption": 0.036,
    "body": 0.04,
    "title": 0.085,
    "display": 0.12,
    "number": 0.17
  },
  "palette": {
    "bg": "#F3EDD7",
    "bgDeep": "#E3D7AE",
    "surface": "#FFF9EA",
    "ink": "#2B2140",
    "inkMuted": "#6E6487",
    "accent": "#D94A70",
    "accent2": "#4C6FD8",
    "positive": "#178F5C",
    "negative": "#CF4A25",
    "glow": "#FFD86B"
  },
  "chapters": {
    "day": {},
    "night": {
      "palette": {
        "bg": "#1E1546",
        "bgDeep": "#0E0A2B",
        "surface": "#2E2160",
        "ink": "#F6F0FF",
        "inkMuted": "#A99CD6",
        "accent": "#FF5FA2",
        "accent2": "#6E8BFF",
        "positive": "#52E3A0",
        "negative": "#FF7A59",
        "glow": "#B58CFF"
      }
    },
    "sepia": {
      "palette": {
        "bg": "#E9D9B8",
        "bgDeep": "#CDB58A",
        "surface": "#F6EAD0",
        "ink": "#3A2A1A",
        "inkMuted": "#7A6447",
        "accent": "#B5542E",
        "accent2": "#4F6C7A",
        "positive": "#5C7A2C",
        "negative": "#A8322B",
        "glow": "#F3CE7A"
      },
      "texture": {
        "grain": 0.28,
        "vignette": 0.55
      }
    }
  },
  "motion": {
    "enterS": 0.55,
    "staggerS": 0.07,
    "ease": {
      "out": [
        0.22,
        1,
        0.36,
        1
      ],
      "inOut": [
        0.65,
        0,
        0.35,
        1
      ],
      "in": [
        0.55,
        0,
        1,
        0.45
      ]
    },
    "spring": {
      "pop": {
        "stiffness": 170,
        "damping": 14,
        "mass": 1
      },
      "soft": {
        "stiffness": 120,
        "damping": 20,
        "mass": 1
      }
    },
    "breatheHz": 0.32,
    "blinkEveryS": 3.4
  },
  "safe": {
    "x": 0.05,
    "y": 0.06
  },
  "glow": 0.55,
  "texture": {
    "grain": 0.05,
    "vignette": 0.22
  }
} as const;
