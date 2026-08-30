#!/usr/bin/env python3
"""Create a consistent online SQLite backup without exposing database rows."""

from __future__ import annotations

import argparse
import sqlite3
from pathlib import Path


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("destination", type=Path)
    args = parser.parse_args()

    if not args.source.is_file():
        parser.error(f"source database does not exist: {args.source}")
    args.destination.parent.mkdir(parents=True, exist_ok=True)
    if args.destination.exists():
        parser.error(f"refusing to overwrite backup: {args.destination}")

    with sqlite3.connect(args.source) as source:
        with sqlite3.connect(args.destination) as destination:
            source.backup(destination)
            result = destination.execute("PRAGMA integrity_check").fetchone()
    if result is None or result[0] != "ok":
        raise RuntimeError(f"backup integrity check failed: {result}")
    print(args.destination)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
