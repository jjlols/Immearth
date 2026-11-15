"""Serve the site and transcribe voice commands on this computer.

Chrome's speech service is not used. Audio is recognized by the English
speech engine already installed with Windows.

Run from the repository root:

    py voice_server.py

Then open http://127.0.0.1:8765/site/
"""
from __future__ import annotations

import json
import subprocess
import tempfile
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent
LOOP = ROOT / "scripts" / "recognize_loop.ps1"
HOST = "127.0.0.1"
PORT = 8765
MAX_AUDIO_BYTES = 1_500_000

_process: subprocess.Popen[str] | None = None
_ready = False
_error = ""
_lock = threading.Lock()
_started = threading.Event()


def _start_process() -> None:
    global _process, _ready, _error
    try:
        _launch_process()
    finally:
        _started.set()


def _launch_process() -> None:
    global _process, _ready, _error
    _process = subprocess.Popen(
        ["powershell", "-NoProfile", "-NonInteractive", "-File", str(LOOP)],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        encoding="utf-8",
        errors="replace",
        bufsize=1,
    )
    assert _process.stdout is not None
    line = _process.stdout.readline().strip().lstrip("\ufeff")
    if line == "READY":
        _ready = True
        _error = ""
        return
    _ready = False
    detail = ""
    if _process.poll() is not None and _process.stderr is not None:
        detail = _process.stderr.read().strip()
    _error = detail or line or "The speech engine did not start."


def transcribe(audio: bytes) -> str:
    global _ready, _error
    if not _started.wait(90):
        raise RuntimeError("The speech engine took too long to start.")
    with _lock:
        if _process is None or _process.poll() is not None:
            _launch_process()
        if not _ready or _process is None or _process.stdin is None or _process.stdout is None:
            raise RuntimeError(_error or "The speech engine is not ready.")
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as handle:
            handle.write(audio)
            path = handle.name
        try:
            _process.stdin.write(path + "\n")
            _process.stdin.flush()
            line = _process.stdout.readline().strip()
        finally:
            Path(path).unlink(missing_ok=True)
    if line.startswith("OK"):
        return line[2:].strip()
    if line.startswith("ERR"):
        raise RuntimeError(line[3:].strip() or "Recognition failed.")
    raise RuntimeError(line or "The speech engine returned nothing.")


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def end_headers(self) -> None:
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def do_GET(self) -> None:
        if self.path.split("?", 1)[0] == "/api/health":
            body = json.dumps({"ready": _ready, "error": _error}).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        super().do_GET()

    def do_POST(self) -> None:
        if self.path.split("?", 1)[0] != "/api/transcribe":
            self.send_error(404)
            return
        length = int(self.headers.get("Content-Length", "0"))
        if length <= 44 or length > MAX_AUDIO_BYTES:
            self._json(413, {"error": "That recording was empty or too long."})
            return
        audio = self.rfile.read(length)
        try:
            text = transcribe(audio)
        except Exception as error:
            self._json(500, {"error": str(error)})
            return
        self._json(200, {"text": text})

    def _json(self, status: int, payload: dict) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, format: str, *args) -> None:
        if args and str(args[0]).startswith("GET /site"):
            return
        super().log_message(format, *args)


def main() -> None:
    threading.Thread(target=_start_process, name="speech-engine", daemon=True).start()
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    print(f"Earth Jukebox is at http://{HOST}:{PORT}/site/", flush=True)
    print("Speech recognition is starting in the background. The first voice command may wait for it.", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print()
    finally:
        if _process is not None and _process.poll() is None and _process.stdin is not None:
            try:
                _process.stdin.write("EXIT\n")
                _process.stdin.flush()
            except OSError:
                _process.kill()
        server.server_close()


if __name__ == "__main__":
    main()
