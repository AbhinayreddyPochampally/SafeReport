#!/usr/bin/env python3
"""
One-shot script to migrate the 5 real Storage blobs from the old Supabase
project ("SafeReport - Piliot" / tymmrjjdpmtpvwxlmvaq) to the new one
("2nd Attempt" / iocwiwmyxlkuppjqlfjk).

Run from the project root:
    python3 scripts/migrate-blobs.py

Requires only Python 3 stdlib. Uses the old project's PUBLIC URLs for the
download side (no auth needed) and the new project's service-role key for the
upload side (passed via env var so we don't commit it).

Idempotent: uses `x-upsert: true` so re-running is safe.

Delete this script after the migration is confirmed — it contains no secrets
but it's also not useful after M9 passes.
"""

import os
import sys
import urllib.error
import urllib.request

OLD_PROJECT_URL = "https://tymmrjjdpmtpvwxlmvaq.supabase.co"
NEW_PROJECT_URL = "https://iocwiwmyxlkuppjqlfjk.supabase.co"

# The 5 real uploads enumerated from storage.objects on the old project.
BLOBS = [
    ("audio", "PNT-MUM-047/1776520539186-bynorv.webm", "audio/webm"),
    ("audio", "PNT-MUM-047/1776520756127-385ehi.webm", "audio/webm"),
    ("photos", "PNT-MUM-047/1776520539186-r9mlpp.jpg", "image/jpeg"),
    ("photos", "PNT-MUM-047/1776520756127-2n4e8r.jpg", "image/jpeg"),
    ("resolutions", "PNT-MUM-047/SR-000007/1776544385580-22ufmi.jpg", "image/jpeg"),
]


def main() -> int:
    key = os.environ.get("NEW_SERVICE_ROLE_KEY")
    if not key:
        print(
            "NEW_SERVICE_ROLE_KEY not set. Export the new project's service-role\n"
            "key first, e.g.:\n\n"
            "    export NEW_SERVICE_ROLE_KEY='eyJ...<paste>...'\n"
            "    python3 scripts/migrate-blobs.py\n",
            file=sys.stderr,
        )
        return 2

    ok, fail = 0, 0
    for bucket, path, mime in BLOBS:
        src = f"{OLD_PROJECT_URL}/storage/v1/object/public/{bucket}/{path}"
        dst = f"{NEW_PROJECT_URL}/storage/v1/object/{bucket}/{path}"
        try:
            with urllib.request.urlopen(src, timeout=30) as r:
                data = r.read()
            print(f"  downloaded {bucket}/{path}  ({len(data):,} bytes)")

            req = urllib.request.Request(dst, data=data, method="POST")
            req.add_header("Authorization", f"Bearer {key}")
            req.add_header("Content-Type", mime)
            # upsert so re-running doesn't explode on 'resource already exists'.
            req.add_header("x-upsert", "true")
            with urllib.request.urlopen(req, timeout=30) as r:
                body = r.read().decode("utf-8", "ignore")
            print(f"  uploaded   {bucket}/{path}  -> {body[:80]}")
            ok += 1
        except urllib.error.HTTPError as e:
            print(f"  FAIL {bucket}/{path}: HTTP {e.code} {e.reason}")
            try:
                err_body = e.read().decode("utf-8", "ignore")[:200]
                print(f"       body: {err_body}")
            except Exception:
                pass
            fail += 1
        except Exception as e:
            print(f"  FAIL {bucket}/{path}: {type(e).__name__} {e}")
            fail += 1

    print(f"\n{ok} ok, {fail} failed")
    return 0 if fail == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
