"""Фейкова Ollama для тестів: /api/tags і /api/chat; відповідь — функція handler(body) → текст (або рядок)."""
import http.server
import json
import threading


class FakeOllama:
    def __init__(self, handler="Гаразд.", models=("qwen3:8b",)):
        self.handler, self.models, self.requests = handler, list(models), []
        outer = self

        class H(http.server.BaseHTTPRequestHandler):
            def log_message(self, *a):
                pass

            def _send(self, obj):
                b = json.dumps(obj).encode()
                self.send_response(200); self.send_header("Content-Type", "application/json"); self.send_header("Content-Length", str(len(b)))
                self.end_headers(); self.wfile.write(b)

            def do_GET(self):
                if self.path == "/api/tags":
                    return self._send({"models": [{"name": m} for m in outer.models]})
                self.send_response(404); self.end_headers()

            def do_POST(self):
                body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
                outer.requests.append(body)
                h = outer.handler
                text = h(body) if callable(h) else h
                self._send({"message": {"role": "assistant", "content": text}, "done": True})

        self.httpd = http.server.ThreadingHTTPServer(("127.0.0.1", 0), H)
        self.url = f"http://127.0.0.1:{self.httpd.server_address[1]}"
        threading.Thread(target=self.httpd.serve_forever, daemon=True).start()

    def close(self):
        self.httpd.shutdown(); self.httpd.server_close()
