#!/usr/bin/env python3
"""Import SQL chunks to Neon PostgreSQL, one statement at a time via temp files."""
import subprocess, sys, os, time, tempfile

DSN = "postgresql://neondb_owner:npg_Pa0i2HMWVSzc@ep-lucky-voice-amv52sps.c-5.us-east-1.aws.neon.tech/neondb?sslmode=require"
LOG = "/tmp/pg_import.log"

def log(msg):
    ts = time.strftime("%H:%M:%S")
    line = f"[{ts}] {msg}\n"
    sys.stdout.write(line); sys.stdout.flush()
    with open(LOG, 'a') as f:
        f.write(line)

def run_sql_file(path):
    env = os.environ.copy()
    env["PGPASSWORD"] = "npg_Pa0i2HMWVSzc"
    result = subprocess.run(
        ["psql", DSN, "-v", "ON_ERROR_STOP=1", "-f", path],
        capture_output=True, text=True, env=env, timeout=600
    )
    return result.returncode == 0, (result.stderr or result.stdout or "").strip()

def iter_statements_from_file(path):
    buf, in_single = [], False
    with open(path, encoding='utf-8') as f:
        for raw_line in f:
            stripped = raw_line.rstrip()
            if not buf and (not stripped or stripped.startswith('--')):
                yield raw_line.rstrip('\n'), True  # is_comment=True
                continue
            for ch in raw_line:
                if ch == "'":
                    in_single = not in_single
            buf.append(raw_line.rstrip('\n'))
            if not in_single and (stripped.endswith(';') or stripped.endswith('DO NOTHING;')):
                yield '\n'.join(buf), False
                buf = []
    if buf:
        yield '\n'.join(buf), False

def import_file(path):
    log(f"Starting {path}")
    ok = skip = err = 0
    for i, (stmt, is_comment) in enumerate(iter_statements_from_file(path)):
        stripped = stmt.strip()
        if is_comment or not stripped:
            skip += 1
            continue
        # Write to temp file to avoid ARG_MAX limits for large statements
        with tempfile.NamedTemporaryFile(mode='w', suffix='.sql', delete=False, encoding='utf-8') as tf:
            tf.write(stripped + '\n')
            tf_path = tf.name
        try:
            success, errmsg = run_sql_file(tf_path)
            if success:
                ok += 1
            else:
                err += 1
                log(f"  ERROR stmt {i} ({len(stmt)} chars): {errmsg[:200]}")
        finally:
            os.unlink(tf_path)
        if (ok + err) % 5 == 0 and ok + err > 0:
            log(f"  progress: {ok} ok, {err} errors, {skip} skipped")
    log(f"Done {path}: {ok} ok, {err} errors, {skip} skipped")
    return err == 0

if __name__ == "__main__":
    files = sys.argv[1:]
    all_ok = True
    for f in files:
        if not import_file(f):
            all_ok = False
    log("ALL DONE")
    sys.exit(0 if all_ok else 1)
