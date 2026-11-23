-- Черга чату для воркера (23.11.2026): індекс лише по розмовах, що ЧЕКАЮТЬ відповіді.
-- Воркер опитує чергу кожні 3–5 с (≈ 20 тис. запитів на добу). Старий індекс chat_sessions_queue (state, …) змушував читати всі розмови
-- у стані bot / waiting — тобто майже всі за 30 діб — на кожне опитування; D1 рахує кожен прочитаний рядок (безкоштовно 5 млн на добу).
-- Частковий індекс містить тільки розмови з повідомленням без відповіді: зазвичай 0–3 рядки. Умова індексу має дослівно збігатися з
-- умовою запитів у functions/api/bot/chat/index.js (GET) і ping.js — інакше SQLite його не візьме (тест «черга читає лише тих, хто чекає»).
DROP INDEX IF EXISTS chat_sessions_queue;
CREATE INDEX IF NOT EXISTS chat_sessions_pending ON chat_sessions (last_user_at, id)
  WHERE last_user_id > answered_upto AND state IN ('bot', 'waiting');
