# Сценарій: документ у PDF

Будь-який текст (тези, конспект, план, комерційна пропозиція, звіт тижня) → PDF.

1. Написати Markdown у тимчасовий файл: `$HOME/.assistant/tmp/<назва>.md`. Перший рядок `# Заголовок`. Далі заголовки `##`, списки, таблиці. Без HTML.
2. `tools/assistant/bin/md2pdf.sh $HOME/.assistant/tmp/<назва>.md` → шлях до PDF (кирилиця, A4, стиль `tools/assistant/pdf.css`).
3. Надіслати: `tools/assistant/bin/tg-out.sh file <шлях.pdf> "Підпис"`.
4. Копію зберегти в Drive-папку «Асистент Михайла/Документи» (`create_file` з `base64Content`, `contentMimeType: application/pdf`, `disableConversionToGoogleType: true`), якщо документ вартий зберігання (конспект, пропозиція, звіт).

Назви файлів: `YYYY-MM-DD_тема.pdf`, латиницею або кирилицею, без пробілів.
