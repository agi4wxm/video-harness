"""命令行：结果 JSON 打到 stdout，日志走 stderr，便于 vh / MCP 以子进程调用。

  python -m vh_analyze run <video> --out <dir> [--asr none|openai|local|file:voice.json] [--lang en] [--rea] [--no-sheets]
  python -m vh_analyze profile <analysis.json...> --out profile.json
  python -m vh_analyze rea-merge <analysis.json> <breakdown.json>
  python -m vh_analyze eval-synth <dir>
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from .util import NpEncoder, write_json


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(prog="vh_analyze")
    sub = ap.add_subparsers(dest="cmd", required=True)
    r = sub.add_parser("run")
    r.add_argument("video")
    r.add_argument("--out", required=True)
    r.add_argument("--asr", default="none")
    r.add_argument("--lang", default="en")
    r.add_argument("--rea", action="store_true", help="同时调用 rea-video decompose 并合并")
    r.add_argument("--no-sheets", action="store_true")
    p = sub.add_parser("profile")
    p.add_argument("analyses", nargs="+")
    p.add_argument("--out", required=True)
    m = sub.add_parser("rea-merge")
    m.add_argument("analysis")
    m.add_argument("breakdown")
    e = sub.add_parser("eval-synth")
    e.add_argument("dir")
    a = ap.parse_args(argv)

    if a.cmd == "run":
        from .analyze import run
        res = run(a.video, a.out, a.asr, a.lang, sheets=not a.no_sheets)
        if a.rea:
            from .rea import decompose, merge
            bd = decompose(a.video, str(Path(a.out) / "rea"), a.lang)
            if bd:
                res["rea"] = merge(res, str(bd))
                write_json(Path(a.out) / "analysis.json", res)
        out = {k: res[k] for k in ("rhythm", "narration", "design") if res.get(k) is not None}
        out["rhythm"] = {k: v for k, v in out["rhythm"].items() if k not in ("segments", "cuts", "beats")}
        print(json.dumps({"analysis": str(Path(a.out) / "analysis.json"), **out}, ensure_ascii=False, indent=2, cls=NpEncoder))
    elif a.cmd == "profile":
        from .profile import build
        print(json.dumps(build(a.analyses, a.out), ensure_ascii=False, indent=2, cls=NpEncoder))
    elif a.cmd == "rea-merge":
        from .rea import merge
        ana = json.loads(Path(a.analysis).read_text())
        ana["rea"] = merge(ana, a.breakdown)
        write_json(Path(a.analysis), ana)
        print(json.dumps(ana["rea"], ensure_ascii=False, indent=2))
    elif a.cmd == "eval-synth":
        from .evalsynth import score_dir
        print(json.dumps(score_dir(a.dir), ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
