#!/usr/bin/env python3
"""
VPS SSH helper — TEMPLATE (copy to vps_ssh.py and configure, OR use env vars).

This file is committed to the repo as documentation. The ACTUAL helper used
by deploy-vps.sh is `.zscripts/vps_ssh.py` (gitignored) — copy this template
there and configure credentials via env vars or a `.vps-creds` file.

Usage:
    python3 vps_ssh.py "command1" "command2" ...
    python3 vps_ssh.py --file local_path :remote_path   # scp upload

Required env vars (no hardcoded fallback — fails fast if missing):
    VPS_HOST  — VPS hostname or IP
    VPS_PORT  — SSH port (default 22)
    VPS_USER  — SSH username
    VPS_PASS  — SSH password

For convenience, you can also place these in .zscripts/.vps-creds
(shell-style KEY=VALUE, one per line) and this script will source it automatically.

Setup (one-time):
    cp .zscripts/vps_ssh.example.py .zscripts/vps_ssh.py
    cat > .zscripts/.vps-creds <<EOF
    VPS_HOST=your.vps.ip
    VPS_PORT=22
    VPS_USER=your_user
    VPS_PASS=your_password
    EOF
    chmod 600 .zscripts/.vps-creds
    pip install paramiko

Then:
    python3 .zscripts/vps_ssh.py "uptime"
"""
import sys
import os
import paramiko

# ─── Load .vps-creds if present (local, gitignored) ──────────────────────────
CREDS_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".vps-creds")
if os.path.isfile(CREDS_FILE):
    for line in open(CREDS_FILE):
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, _, v = line.partition("=")
        os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))

VPS_HOST = os.environ.get("VPS_HOST")
VPS_PORT = int(os.environ.get("VPS_PORT", "22"))
VPS_USER = os.environ.get("VPS_USER")
VPS_PASS = os.environ.get("VPS_PASS")


def _fail_missing_env(var: str):
    sys.stderr.write(
        f"❌ {var} env var not set. Set it inline (VPS_PASS=... python3 vps_ssh.py ...) "
        f"or create {CREDS_FILE} with KEY=VALUE lines.\n"
    )
    sys.exit(2)


def get_client():
    if not VPS_HOST:
        _fail_missing_env("VPS_HOST")
    if not VPS_USER:
        _fail_missing_env("VPS_USER")
    if not VPS_PASS:
        _fail_missing_env("VPS_PASS")
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(
        hostname=VPS_HOST,
        port=VPS_PORT,
        username=VPS_USER,
        password=VPS_PASS,
        timeout=20,
        banner_timeout=20,
        auth_timeout=20,
        look_for_keys=False,
        allow_agent=False,
    )
    return client


def run(cmd: str):
    client = get_client()
    try:
        # 900s (15 min) timeout — handles long-running commands like
        # `docker compose up --build` which can take 8+ minutes with no
        # output until the build completes.
        stdin, stdout, stderr = client.exec_command(cmd, timeout=900, get_pty=False)
        out = stdout.read().decode("utf-8", errors="replace")
        err = stderr.read().decode("utf-8", errors="replace")
        rc = stdout.channel.recv_exit_status()
        sys.stdout.write(out)
        if err:
            sys.stderr.write(err)
        sys.stdout.flush()
        sys.stderr.flush()
        return rc
    finally:
        client.close()


def upload(local: str, remote: str):
    client = get_client()
    try:
        sftp = client.open_sftp()
        try:
            sftp.put(local, remote)
            print(f"✓ uploaded {local} -> {remote}")
        finally:
            sftp.close()
    finally:
        client.close()


def main():
    args = sys.argv[1:]
    if not args:
        print(__doc__)
        return 2

    if args[0] == "--file":
        local = args[1]
        remote = args[2].lstrip(":")
        upload(local, remote)
        return 0

    cmd = " ".join(args)
    return run(cmd)


if __name__ == "__main__":
    sys.exit(main())
