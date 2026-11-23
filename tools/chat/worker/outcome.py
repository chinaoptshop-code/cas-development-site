"""Результат обробки розмови: що надіслати на сайт (POST /api/bot/chat)."""
from dataclasses import dataclass, field


@dataclass
class Outcome:
    text: str = ""
    audio: dict = None          # {"mime", "data" (base64), "dur"}
    estimate: dict = None       # схема API.md
    handoff: str = None         # asks_human | big_project | complaint | complex | other
    reason: str = None          # ≤ 200, для менеджера (Telegram)
    renotify: bool = False      # повторне сповіщення, коли розмова вже waiting (обраний час дзвінка)
    notes: list = field(default_factory=list)   # службове: що спрацювало (у журнал, без особистих даних)

    def public(self):
        return {"text": self.text, "estimate": self.estimate, "handoff": self.handoff, "reason": self.reason,
                "audio": bool(self.audio), "renotify": self.renotify}
