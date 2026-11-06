"""命令行入口。供 MCP server 以子进程调用：结果 JSON 打印到 stdout，日志走 stderr。

  python -m measure analyze VIDEO... --out analysis/<set>/videos [--asr openai|local|none]
  python -m measure profile analysis/<set>/videos --out analysis/<set>/reference-profile.json
"""
from __future__ import annotations

import argparse
import json
import sys

from .util import NpEncoder


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(prog="measure")
    sub = ap.add_subparsers(dest="cmd", required=True)

    a = sub.add_parser("analyze", help="分析一个或多个视频")
    a.add_argument("videos", nargs="+")
    a.add_argument("--out", required=True)
    a.add_argument("--asr", default="auto", choices=["auto", "openai", "local", "none"])
    a.add_argument("--ocr-fps", type=float, default=2.0)
    a.add_argument("--no-sheets", action="store_true")

    p = sub.add_parser("profile", help="把多个视频的分析结果聚合成 reference-profile")
    p.add_argument("videos_dir")
    p.add_argument("--out", required=True)
    p.add_argument("--author", default=None)

    args = ap.parse_args(argv)
    if args.cmd == "analyze":
        from .analyze import analyze

        res = [analyze(v, args.out, args.asr, args.ocr_fps, not args.no_sheets) for v in args.videos]
        print(json.dumps(res, ensure_ascii=False, cls=NpEncoder))
    elif args.cmd == "profile":
        from .profile import build_profile

        res = build_profile(args.videos_dir, args.out, args.author)
        print(json.dumps(res, ensure_ascii=False, cls=NpEncoder))
    return 0


if __name__ == "__main__":
    sys.exit(main())
