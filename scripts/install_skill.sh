#!/usr/bin/env bash
# 安装 video-harness：Node 依赖、vh 命令、Python 分析环境，并把 skill 链接到常见 agent 目录。可重复运行。
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

need() { command -v "$1" >/dev/null 2>&1 || { echo "✗ 需要 $1：$2" >&2; exit 1; }; }
need node "Node >= 22（https://nodejs.org）"
need ffmpeg "ffmpeg（brew install ffmpeg / apt install ffmpeg）"
NODE_MAJOR=$(node -p 'process.versions.node.split(".")[0]')
[ "$NODE_MAJOR" -ge 22 ] || { echo "✗ Node 版本 $NODE_MAJOR < 22" >&2; exit 1; }
command -v pnpm >/dev/null 2>&1 || { echo "→ 安装 pnpm"; (corepack enable && corepack prepare pnpm@10.28.0 --activate) || npm i -g pnpm@10.28.0; }

echo "→ pnpm install"
pnpm install --frozen-lockfile 2>/dev/null || pnpm install

echo "→ 链接 vh 到 ~/.local/bin"
mkdir -p "$HOME/.local/bin"
ln -sf "$ROOT/packages/cli/bin/vh.mjs" "$HOME/.local/bin/vh"
case ":$PATH:" in *":$HOME/.local/bin:"*) ;; *) echo "  提示：把 ~/.local/bin 加到 PATH";; esac

PY=""
for c in python3.13 python3.12 python3.11 python3.10 python3; do
  if command -v "$c" >/dev/null 2>&1 && "$c" -c 'import sys; sys.exit(0 if sys.version_info >= (3,10) else 1)'; then PY="$c"; break; fi
done
if [ -n "$PY" ]; then
  echo "→ Python 分析环境（analyze/.venv，$PY）"
  [ -d analyze/.venv ] || "$PY" -m venv analyze/.venv
  analyze/.venv/bin/pip install -q -e "analyze[openai]"
else
  echo "! 没找到 Python >= 3.10：分析功能（vh_analyze / vh compare）不可用"
fi

for d in "$HOME/.claude/skills" "$HOME/.codex/skills" "$HOME/.agents/skills"; do
  [ -d "$(dirname "$d")" ] || continue
  mkdir -p "$d"
  if [ -e "$d/video-harness" ] && [ ! -L "$d/video-harness" ]; then echo "! $d/video-harness 是真实目录，跳过"; continue; fi
  ln -sfn "$ROOT/skills/video-harness" "$d/video-harness"
  echo "→ skill 链接到 $d/video-harness"
done

echo "✓ 完成：vh --help"
