"""Serve the site and spot voice-command keywords on this computer.

Chrome's speech service is not used. Audio stays on this machine and is
matched by sherpa-onnx keyword spotting (Apache 2.0,
https://github.com/k2-fsa/sherpa-onnx) against the phrases the page
already understands. The English model downloads into models/ on first start.

Run from the repository root:

    py voice_server.py

Then open http://127.0.0.1:8765/site/
"""
from __future__ import annotations

import io
import tarfile
import threading
import urllib.request
import wave
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent
HOST = "127.0.0.1"
PORT = 8765
MAX_AUDIO_BYTES = 1_500_000
MODEL_NAME = "sherpa-onnx-kws-zipformer-gigaspeech-3.3M-2024-01-01"
MODEL_URL = (
    "https://github.com/k2-fsa/sherpa-onnx/releases/download/kws-models/"
    f"{MODEL_NAME}.tar.bz2"
)
MODEL_DIR = ROOT / "models" / MODEL_NAME

# These are the phrases site/site.js already matches. The label after @ is
# the phrase with spaces turned into underscores, which get turned back
# into spaces before the page sees the result.
PHRASES = (
    "overview",
    "maps",
    "the maps",
    "go to the maps",
    "precipitation",
    "rain",
    "fires",
    "fire",
    "active fires",
    "carbon monoxide",
    "nitrogen oxides",
    "nox",
    "temperature",
    "heat",
    "immersive listening",
    "photo",
    "photos",
    "picture",
    "pictures",
    "photo of the day",
    "space photo",
    "image of the day",
    "go to the photo",
    "move",
    "movement",
    "moving around",
    "next",
    "next section",
    "previous",
    "previous section",
    "back",
    "accessibility",
    "page overview",
    "read the overview",
    "read overview",
    "play overview",
    "turn left",
    "turn to the left",
    "look left",
    "face left",
    "turn right",
    "turn to the right",
    "look right",
    "face right",
    "recenter",
    "face forward",
    "look forward",
    "center",
    "centre",
    "test tones",
    "play test tones",
    "play the test tones",
    "play tones",
    "stop test tones",
    "stop the test tones",
    "stop tones",
    "stop listening",
    "voice off",
    "stop speaking",
    "be quiet",
    "stop",
)

_spotters = None
_ready = False
_error = ""
_lock = threading.Lock()
_started = threading.Event()


def _boost(phrase: str) -> tuple[float, float]:
    words = phrase.split()
    # One-word commands such as "next" only spot when the threshold is low.
    # Longer phrases are checked first, so a short word cannot hide them.
    if len(words) >= 3:
        return 2.2, 0.16
    if len(words) == 2:
        return 1.8, 0.18
    return 1.5, 0.02


def _encode_keywords(model_dir: Path) -> tuple[Path, Path]:
    from sherpa_onnx import text2token

    tokens = model_dir / "tokens.txt"
    bpe = model_dir / "bpe.model"
    long_lines = []
    short_lines = []
    for phrase in PHRASES:
        encoded = text2token(
            [phrase.upper()],
            tokens=str(tokens),
            tokens_type="bpe",
            bpe_model=str(bpe),
        )
        if len(encoded) != 1 or not encoded[0]:
            raise RuntimeError(f"Could not encode the command “{phrase}”.")
        score, threshold = _boost(phrase)
        label = phrase.replace(" ", "_")
        line = f"{' '.join(encoded[0])} :{score} #{threshold} @{label}"
        if len(phrase.split()) >= 2:
            long_lines.append(line)
        else:
            short_lines.append(line)
    models = ROOT / "models"
    long_path = models / "jukebox-keywords-long.txt"
    short_path = models / "jukebox-keywords-short.txt"
    long_path.write_text("\n".join(long_lines) + "\n", encoding="utf-8")
    short_path.write_text("\n".join(short_lines) + "\n", encoding="utf-8")
    return long_path, short_path


def _extract_model(archive: Path, dest: Path) -> None:
    dest.mkdir(parents=True, exist_ok=True)
    root = dest.resolve()
    with tarfile.open(archive, "r:bz2") as tar:
        for member in tar.getmembers():
            target = (dest / member.name).resolve()
            if target != root and root not in target.parents:
                raise RuntimeError("The model archive had an unexpected path.")
        tar.extractall(dest)


def _download_model() -> Path:
    encoder = MODEL_DIR / "encoder-epoch-12-avg-2-chunk-16-left-64.int8.onnx"
    if encoder.is_file() and (MODEL_DIR / "tokens.txt").is_file() and (MODEL_DIR / "bpe.model").is_file():
        return MODEL_DIR
    models = ROOT / "models"
    models.mkdir(parents=True, exist_ok=True)
    archive = models / f"{MODEL_NAME}.tar.bz2"
    print(f"Downloading the sherpa-onnx keyword model to {archive}", flush=True)
    request = urllib.request.Request(MODEL_URL, headers={"User-Agent": "earth-jukebox"})
    with urllib.request.urlopen(request, timeout=120) as response, archive.open("wb") as handle:
        while True:
            chunk = response.read(1024 * 256)
            if not chunk:
                break
            handle.write(chunk)
    _extract_model(archive, models)
    archive.unlink(missing_ok=True)
    if not encoder.is_file():
        raise RuntimeError("The keyword model download did not contain the expected files.")
    return MODEL_DIR


def _make_spotter(model_dir: Path, keywords: Path, trailing_blanks: int):
    import sherpa_onnx

    return sherpa_onnx.KeywordSpotter(
        tokens=str(model_dir / "tokens.txt"),
        encoder=str(model_dir / "encoder-epoch-12-avg-2-chunk-16-left-64.int8.onnx"),
        decoder=str(model_dir / "decoder-epoch-12-avg-2-chunk-16-left-64.int8.onnx"),
        joiner=str(model_dir / "joiner-epoch-12-avg-2-chunk-16-left-64.int8.onnx"),
        keywords_file=str(keywords),
        num_threads=2,
        keywords_score=1.0,
        keywords_threshold=0.02,
        num_trailing_blanks=trailing_blanks,
        provider="cpu",
    )


def _load_spotter():
    model_dir = _download_model()
    long_keywords, short_keywords = _encode_keywords(model_dir)
    return (
        _make_spotter(model_dir, long_keywords, trailing_blanks=1),
        _make_spotter(model_dir, short_keywords, trailing_blanks=0),
    )


def _start_engine() -> None:
    global _spotters, _ready, _error
    try:
        _spotters = _load_spotter()
        _ready = True
        _error = ""
        print("Keyword spotting is ready.", flush=True)
    except Exception as error:
        _spotters = None
        _ready = False
        _error = str(error) or "The keyword spotter did not start."
        print(_error, flush=True)
    finally:
        _started.set()


def _samples_from_wav(audio: bytes) -> tuple[np.ndarray, int]:
    with wave.open(io.BytesIO(audio), "rb") as handle:
        channels = handle.getnchannels()
        width = handle.getsampwidth()
        rate = handle.getframerate()
        frames = handle.readframes(handle.getnframes())
    if width != 2:
        raise RuntimeError("Voice audio must be 16-bit PCM.")
    pcm = np.frombuffer(frames, dtype=np.int16).astype(np.float32) / 32768.0
    if channels > 1:
        pcm = pcm.reshape(-1, channels).mean(axis=1)
    return np.ascontiguousarray(pcm, dtype=np.float32), rate


def _phrase(keyword: str) -> str:
    return keyword.replace("_", " ").strip().lower()


def _hear(spotter, samples: np.ndarray, rate: int, lead_seconds: float) -> str:
    lead = np.zeros(int(lead_seconds * rate), dtype=np.float32)
    tail = np.zeros(int(0.8 * rate), dtype=np.float32)
    stream = spotter.create_stream()
    stream.accept_waveform(rate, lead)
    stream.accept_waveform(rate, samples)
    stream.accept_waveform(rate, tail)
    stream.input_finished()
    heard: list[str] = []
    while spotter.is_ready(stream):
        spotter.decode_stream(stream)
        keyword = spotter.get_result(stream)
        if keyword:
            heard.append(_phrase(keyword))
            spotter.reset_stream(stream)
    if not heard:
        return ""
    return max(heard, key=lambda phrase: (len(phrase.split()), len(phrase)))


def transcribe(audio: bytes) -> str:
    if not _started.wait(180):
        raise RuntimeError("The keyword spotter took too long to start.")
    with _lock:
        if not _ready or not _spotters:
            raise RuntimeError(_error or "The keyword spotter is not ready.")
        samples, rate = _samples_from_wav(audio)
        long_spotter, short_spotter = _spotters
        return _hear(long_spotter, samples, rate, 0.0) or _hear(short_spotter, samples, rate, 0.35)


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def end_headers(self) -> None:
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def do_GET(self) -> None:
        if self.path.split("?", 1)[0] == "/api/health":
            body = (
                '{"ready": %s, "error": %s, "engine": "sherpa-onnx"}'
                % ("true" if _ready else "false", _json_string(_error))
            ).encode("utf-8")
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
        import json

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


def _json_string(value: str) -> str:
    import json

    return json.dumps(value)


def main() -> None:
    threading.Thread(target=_start_engine, name="keyword-spotter", daemon=True).start()
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    print(f"Earth Jukebox is at http://{HOST}:{PORT}/site/", flush=True)
    print("Keyword spotting is starting in the background. The first voice command may wait for the model.", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print()
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
