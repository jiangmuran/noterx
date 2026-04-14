# -*- coding: utf-8 -*-
"""
Deploy backend to BaoTa server + upload frontend dist.
Usage: python deploy_backend.py
"""
import os, sys, tarfile, io, time
import paramiko

HOST = "38.175.195.71"
USER = "root"
PASS = "lFjTQo8NXHN7TfCI"
REMOTE_DIR = "/opt/noterx"
FRONTEND_DIR = "/www/wwwroot/noterx.muran.tech"

# -- helper --
def run(ssh, cmd, check=True):
    print(f"   $ {cmd[:120]}")
    stdin, stdout, stderr = ssh.exec_command(cmd, timeout=300)
    out = stdout.read().decode("utf-8", errors="replace")
    err = stderr.read().decode("utf-8", errors="replace")
    code = stdout.channel.recv_exit_status()
    if check and code != 0:
        print(f"   FAIL (exit {code}): {err[:300]}")
        sys.exit(1)
    if out.strip():
        for line in out.strip().split("\n")[:5]:
            print(f"     {line}")
    return out, err, code

# ============ 1. Connect ============
print(f"[1/6] Connecting to {HOST}...")
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username=USER, password=PASS, timeout=15)
sftp = ssh.open_sftp()
print("  OK")

# ============ 2. Pack ============
print("[2/6] Packing project...")
buf = io.BytesIO()
root = os.path.dirname(os.path.abspath(__file__))
with tarfile.open(fileobj=buf, mode="w:gz") as tar:
    for folder in ["backend", "scripts", "docs"]:
        p = os.path.join(root, folder)
        if os.path.isdir(p):
            # skip venv, __pycache__, .env (we upload .env separately)
            tar.add(p, arcname=folder,
                    filter=lambda info: None if "__pycache__" in info.name or "venv" in info.name or info.name.endswith(".pyc") else info)
    # frontend dist
    dist = os.path.join(root, "frontend", "dist")
    if os.path.isdir(dist):
        tar.add(dist, arcname="frontend_dist")
buf.seek(0)
print(f"  Packed {len(buf.getvalue())/1024:.0f} KB")

# ============ 3. Upload ============
remote_tar = "/tmp/noterx_deploy.tar.gz"
print("[3/6] Uploading...")
sftp.putfo(buf, remote_tar)
print("  OK")

# ============ 4. Extract + Frontend ============
print("[4/6] Extracting...")
run(ssh, f"mkdir -p {REMOTE_DIR}")
run(ssh, f"cd {REMOTE_DIR} && tar xzf {remote_tar}")
run(ssh, f"rm -f {remote_tar}")

# Copy frontend dist to BaoTa site
print("  Copying frontend dist to BaoTa site...")
run(ssh, f"mkdir -p {FRONTEND_DIR}")
run(ssh, f"rm -rf {FRONTEND_DIR}/*")
run(ssh, f"cp -r {REMOTE_DIR}/frontend_dist/* {FRONTEND_DIR}/")
run(ssh, f"rm -rf {REMOTE_DIR}/frontend_dist")
print("  Frontend OK")

# ============ 5. Backend deps ============
print("[5/6] Installing backend dependencies (may take a while)...")
py3 = "python3"
out, _, _ = run(ssh, f"{py3} --version", check=False)
has_py3 = "Python 3" in out
PY = py3 if has_py3 else "python"

# Install python3-venv if missing (Debian/Ubuntu)
run(ssh, "apt-get install -y python3-venv python3-pip", check=False)

run(ssh, f"rm -rf {REMOTE_DIR}/backend/venv")
run(ssh, f"{PY} -m venv {REMOTE_DIR}/backend/venv")
run(ssh, f"{REMOTE_DIR}/backend/venv/bin/pip install --upgrade pip -q")
run(ssh, f"{REMOTE_DIR}/backend/venv/bin/pip install -r {REMOTE_DIR}/backend/requirements.txt")

# Init DB
print("  Initializing database...")
run(ssh, f"cd {REMOTE_DIR} && {REMOTE_DIR}/backend/venv/bin/python scripts/init_db.py", check=False)
run(ssh, f"cd {REMOTE_DIR} && {REMOTE_DIR}/backend/venv/bin/python scripts/seed_data.py", check=False)
run(ssh, f"cd {REMOTE_DIR} && {REMOTE_DIR}/backend/venv/bin/python scripts/compute_baseline.py", check=False)

# Upload .env
print("  Uploading .env...")
local_env = os.path.join(root, "backend", ".env")
if os.path.isfile(local_env):
    sftp.put(local_env, f"{REMOTE_DIR}/backend/.env")
    print("  .env uploaded")

# ============ 6. Systemd service ============
print("[6/6] Setting up systemd service...")
SERVICE = """[Unit]
Description=NoteRx Backend
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/noterx/backend
ExecStart=/opt/noterx/backend/venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000
Restart=always
RestartSec=5
Environment=PYTHONUNBUFFERED=1

[Install]
WantedBy=multi-user.target
"""
with sftp.open("/etc/systemd/system/noterx.service", "w") as f:
    f.write(SERVICE)

run(ssh, "systemctl daemon-reload")
run(ssh, "systemctl enable noterx")
run(ssh, "systemctl restart noterx")
time.sleep(3)
run(ssh, "systemctl status noterx --no-pager -l", check=False)

# Health check
out, _, _ = run(ssh, "curl -s http://127.0.0.1:8000/api/health", check=False)
print("")
print("=" * 50)
print("DEPLOY DONE!")
print(f"  Backend API: http://127.0.0.1:8000 (Nginx proxy)")
print(f"  Frontend:    {FRONTEND_DIR}")
print(f"  Admin:       https://noterx.muran.tech/admin")
print(f"  Password:    pageone")
print("")
print("Nginx config needed (see below):")
print("""
  location /api/ {
      proxy_pass http://127.0.0.1:8000;
      proxy_set_header Host $host;
      proxy_set_header X-Real-IP $remote_addr;
      proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  }
  location /admin {
      proxy_pass http://127.0.0.1:8000;
      proxy_set_header Host $host;
      proxy_set_header X-Real-IP $remote_addr;
      proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  }
  location /terms {
      proxy_pass http://127.0.0.1:8000;
  }
  location /privacy {
      proxy_pass http://127.0.0.1:8000;
  }
""")
print("=" * 50)

sftp.close()
ssh.close()
