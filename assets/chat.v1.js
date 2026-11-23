/* CAS Development — чат на сайті (23.11.2026): панель розмови з AI-помічником студії (відповідає воркер на Mac mini через /api/bot/chat).
   Вантажить site-chrome.v1.js лише після тапу по іконці чату (a[data-chat]) — сама панель ніколи не відкривається. Без cookie й сторонніх запитів:
   розмова — sid + token у localStorage (cas_chat), API — /api/chat/* (tools/chat/API.md). Текст відвідувача, бота й імена файлів — лише textContent.
   Мова — <html lang>, ar — RTL. Розрахунок бота (estimate) — таблиця; суми рахує воркер, тут лише показ (формат цін — casUsd/casFx, ar — ізолят LTR).
   Голос: MediaRecorder (дозвіл — лише по кліку на мікрофон; немає API — немає кнопки), до 2 хв; відповідь голосом — плеєр без автозапуску. */
(function () {
  'use strict';
  var W = window, d = document;
  if (W.casChat) return;
  var LG = String(d.documentElement.lang || 'uk').slice(0, 2).toLowerCase();
  var T = {
    uk: { title: 'Помічник CAS', disc: 'Відповідає AI-помічник студії. Розрахунок попередній, точний — після заміру й кошторису.', hello: 'Вітаю! Я помічник студії CAS Development. Розкажіть про обʼєкт: що плануєте, площа, місто — порахую орієнтовну вартість. Можна надіслати фото, план, PDF чи голосове.',
      ph: 'Напишіть повідомлення…', send: 'Надіслати', attach: 'Прикріпити файли', mic: 'Записати голосове', stop: 'Зупинити й надіслати', cancel: 'Скасувати', close: 'Закрити чат', fresh: 'Нова розмова', freshQ: 'Почати нову розмову? Поточна лишиться в студії.',
      typing: 'Помічник друкує…', staff: 'Відповідає менеджер', waiting: 'Кличемо менеджера…', online: 'На звʼязку', offline: 'Зараз помічник офлайн — залиште номер, відповімо в робочий час Пн–Пт 10:00–20:00.',
      leave: 'Залишити номер', phone: 'Ваш телефон', phoneSend: 'Передзвоніть мені', phoneBad: 'Перевірте номер телефону', you: 'Ви', bot: 'Помічник', mgr: 'Менеджер',
      big: 'Файл завеликий для чату (до {max}). Надішліть його в Telegram або WhatsApp:', type: 'Такий тип файлу не приймаємо. Можна: фото, відео, аудіо, PDF, Excel, Word, DWG, DXF, 3DS, SKP, IFC, RVT, ZIP.', mismatch: 'Файл пошкоджений або не того типу.',
      many: 'Забагато повідомлень поспіль — зачекайте трохи.', net: 'Немає звʼязку. Спробуйте ще раз.', upl: 'Завантаження…', drop: 'Відпустіть, щоб прикріпити файли', remove: 'Прибрати файл',
      est: 'Попередній розрахунок', total: 'Разом', from: 'від', smeta: 'за кошторисом', voice: 'Голосова відповідь', play: 'Слухати', pause: 'Пауза', rec: 'Запис', micErr: 'Немає доступу до мікрофона.', file: 'Файл', eu: 'Європа' },
    ru: { title: 'Помощник CAS', disc: 'Отвечает AI-помощник студии. Расчёт предварительный, точный — после замера и сметы.', hello: 'Здравствуйте! Я помощник студии CAS Development. Расскажите об объекте: что планируете, площадь, город — посчитаю ориентировочную стоимость. Можно прислать фото, план, PDF или голосовое.',
      ph: 'Напишите сообщение…', send: 'Отправить', attach: 'Прикрепить файлы', mic: 'Записать голосовое', stop: 'Остановить и отправить', cancel: 'Отменить', close: 'Закрыть чат', fresh: 'Новый разговор', freshQ: 'Начать новый разговор? Текущий останется у студии.',
      typing: 'Помощник печатает…', staff: 'Отвечает менеджер', waiting: 'Зовём менеджера…', online: 'На связи', offline: 'Сейчас помощник офлайн — оставьте номер, ответим в рабочее время Пн–Пт 10:00–20:00.',
      leave: 'Оставить номер', phone: 'Ваш телефон', phoneSend: 'Перезвоните мне', phoneBad: 'Проверьте номер телефона', you: 'Вы', bot: 'Помощник', mgr: 'Менеджер',
      big: 'Файл слишком большой для чата (до {max}). Отправьте его в Telegram или WhatsApp:', type: 'Такой тип файла не принимаем. Можно: фото, видео, аудио, PDF, Excel, Word, DWG, DXF, 3DS, SKP, IFC, RVT, ZIP.', mismatch: 'Файл повреждён или не того типа.',
      many: 'Слишком много сообщений подряд — подождите немного.', net: 'Нет связи. Попробуйте ещё раз.', upl: 'Загрузка…', drop: 'Отпустите, чтобы прикрепить файлы', remove: 'Убрать файл',
      est: 'Предварительный расчёт', total: 'Итого', from: 'от', smeta: 'по смете', voice: 'Голосовой ответ', play: 'Слушать', pause: 'Пауза', rec: 'Запись', micErr: 'Нет доступа к микрофону.', file: 'Файл', eu: 'Европа' },
    en: { title: 'CAS assistant', disc: 'You are chatting with the studio’s AI assistant. Estimates are preliminary; the exact price comes after measurements and a detailed quote.', hello: 'Hello! I am the CAS Development studio assistant. Tell me about your project — what you plan, the area and the city — and I will give you an approximate cost. You can send photos, a floor plan, a PDF or a voice message.',
      ph: 'Type a message…', send: 'Send', attach: 'Attach files', mic: 'Record a voice message', stop: 'Stop and send', cancel: 'Cancel', close: 'Close chat', fresh: 'New conversation', freshQ: 'Start a new conversation? The current one stays with the studio.',
      typing: 'Assistant is typing…', staff: 'A manager is replying', waiting: 'Calling a manager…', online: 'Online', offline: 'The assistant is offline right now — leave your number and we will reply during working hours, Mon–Fri 10:00–20:00 (Kyiv time).',
      leave: 'Leave your number', phone: 'Your phone', phoneSend: 'Call me back', phoneBad: 'Please check the phone number', you: 'You', bot: 'Assistant', mgr: 'Manager',
      big: 'This file is too large for the chat (up to {max}). Please send it via Telegram or WhatsApp:', type: 'This file type is not accepted. Allowed: photos, video, audio, PDF, Excel, Word, DWG, DXF, 3DS, SKP, IFC, RVT, ZIP.', mismatch: 'The file is damaged or of the wrong type.',
      many: 'Too many messages in a row — please wait a moment.', net: 'No connection. Please try again.', upl: 'Uploading…', drop: 'Drop to attach files', remove: 'Remove file',
      est: 'Preliminary estimate', total: 'Total', from: 'from', smeta: 'on quote', voice: 'Voice reply', play: 'Play', pause: 'Pause', rec: 'Recording', micErr: 'No access to the microphone.', file: 'File', eu: 'Europe' },
    es: { title: 'Asistente CAS', disc: 'Responde el asistente de IA del estudio. El cálculo es orientativo; el exacto, tras la medición y el presupuesto.', hello: '¡Hola! Soy el asistente del estudio CAS Development. Cuénteme su proyecto: qué planea, la superficie y la ciudad, y le daré un coste orientativo. Puede enviar fotos, un plano, un PDF o un mensaje de voz.',
      ph: 'Escriba un mensaje…', send: 'Enviar', attach: 'Adjuntar archivos', mic: 'Grabar un mensaje de voz', stop: 'Detener y enviar', cancel: 'Cancelar', close: 'Cerrar el chat', fresh: 'Nueva conversación', freshQ: '¿Empezar una nueva conversación? La actual se queda en el estudio.',
      typing: 'El asistente está escribiendo…', staff: 'Responde un gestor', waiting: 'Llamando a un gestor…', online: 'En línea', offline: 'El asistente no está disponible ahora: deje su número y le responderemos en horario laboral, lun–vie 10:00–20:00 (hora de Kiev).',
      leave: 'Dejar mi número', phone: 'Su teléfono', phoneSend: 'Llámenme', phoneBad: 'Revise el número de teléfono', you: 'Usted', bot: 'Asistente', mgr: 'Gestor',
      big: 'El archivo es demasiado grande para el chat (hasta {max}). Envíelo por Telegram o WhatsApp:', type: 'No aceptamos este tipo de archivo. Se admiten: fotos, vídeo, audio, PDF, Excel, Word, DWG, DXF, 3DS, SKP, IFC, RVT, ZIP.', mismatch: 'El archivo está dañado o no es del tipo indicado.',
      many: 'Demasiados mensajes seguidos: espere un momento.', net: 'Sin conexión. Inténtelo de nuevo.', upl: 'Subiendo…', drop: 'Suelte para adjuntar', remove: 'Quitar archivo',
      est: 'Cálculo orientativo', total: 'Total', from: 'desde', smeta: 'según presupuesto', voice: 'Respuesta de voz', play: 'Escuchar', pause: 'Pausa', rec: 'Grabando', micErr: 'Sin acceso al micrófono.', file: 'Archivo', eu: 'Europa' },
    zh: { title: 'CAS 助手', disc: '由工作室的 AI 助手回答。计算为初步估算，准确价格以测量和预算为准。', hello: '您好！我是 CAS Development 工作室的助手。请介绍您的项目：计划做什么、面积和城市——我会给出大致费用。可以发送照片、平面图、PDF 或语音。',
      ph: '输入消息…', send: '发送', attach: '附加文件', mic: '录制语音', stop: '停止并发送', cancel: '取消', close: '关闭聊天', fresh: '新对话', freshQ: '开始新对话？当前对话会保留在工作室。',
      typing: '助手正在输入…', staff: '经理正在回复', waiting: '正在呼叫经理…', online: '在线', offline: '助手目前离线——请留下电话，我们将在工作时间回复：周一至周五 10:00–20:00（基辅时间）。',
      leave: '留下电话', phone: '您的电话', phoneSend: '请给我回电', phoneBad: '请检查电话号码', you: '您', bot: '助手', mgr: '经理',
      big: '文件太大，无法在聊天中发送（上限 {max}）。请通过 Telegram 或 WhatsApp 发送：', type: '不接受此类文件。可以发送：照片、视频、音频、PDF、Excel、Word、DWG、DXF、3DS、SKP、IFC、RVT、ZIP。', mismatch: '文件已损坏或类型不符。',
      many: '消息太频繁——请稍候。', net: '没有网络连接，请重试。', upl: '正在上传…', drop: '松开即可附加文件', remove: '移除文件',
      est: '初步估算', total: '合计', from: '起', smeta: '按预算', voice: '语音回复', play: '播放', pause: '暂停', rec: '录音中', micErr: '无法使用麦克风。', file: '文件', eu: '欧洲' },
    pl: { title: 'Asystent CAS', disc: 'Odpowiada asystent AI studia. Wycena jest wstępna, dokładna — po pomiarze i kosztorysie.', hello: 'Dzień dobry! Jestem asystentem studia CAS Development. Proszę opisać obiekt: co Pan/Pani planuje, metraż i miasto — policzę orientacyjny koszt. Można wysłać zdjęcia, plan, PDF lub wiadomość głosową.',
      ph: 'Napisz wiadomość…', send: 'Wyślij', attach: 'Dołącz pliki', mic: 'Nagraj wiadomość głosową', stop: 'Zatrzymaj i wyślij', cancel: 'Anuluj', close: 'Zamknij czat', fresh: 'Nowa rozmowa', freshQ: 'Rozpocząć nową rozmowę? Obecna zostanie w studiu.',
      typing: 'Asystent pisze…', staff: 'Odpowiada menedżer', waiting: 'Wzywamy menedżera…', online: 'Online', offline: 'Asystent jest teraz offline — proszę zostawić numer, odpowiemy w godzinach pracy: pn–pt 10:00–20:00 (czas kijowski).',
      leave: 'Zostaw numer', phone: 'Twój telefon', phoneSend: 'Proszę o telefon', phoneBad: 'Sprawdź numer telefonu', you: 'Ty', bot: 'Asystent', mgr: 'Menedżer',
      big: 'Plik jest za duży na czat (do {max}). Wyślij go przez Telegram lub WhatsApp:', type: 'Nie przyjmujemy takiego typu pliku. Można: zdjęcia, wideo, audio, PDF, Excel, Word, DWG, DXF, 3DS, SKP, IFC, RVT, ZIP.', mismatch: 'Plik jest uszkodzony lub innego typu.',
      many: 'Za dużo wiadomości naraz — chwilę poczekaj.', net: 'Brak połączenia. Spróbuj ponownie.', upl: 'Przesyłanie…', drop: 'Upuść, aby dołączyć pliki', remove: 'Usuń plik',
      est: 'Wstępna wycena', total: 'Razem', from: 'od', smeta: 'wg kosztorysu', voice: 'Odpowiedź głosowa', play: 'Odtwórz', pause: 'Pauza', rec: 'Nagrywanie', micErr: 'Brak dostępu do mikrofonu.', file: 'Plik', eu: 'Europa' },
    de: { title: 'CAS-Assistent', disc: 'Es antwortet der KI-Assistent des Studios. Die Kalkulation ist vorläufig; den genauen Preis gibt es nach Aufmaß und Kostenvoranschlag.', hello: 'Guten Tag! Ich bin der Assistent des Studios CAS Development. Erzählen Sie mir von Ihrem Objekt – Vorhaben, Fläche, Stadt –, und ich nenne Ihnen einen ungefähren Preis. Sie können Fotos, einen Grundriss, ein PDF oder eine Sprachnachricht senden.',
      ph: 'Nachricht schreiben…', send: 'Senden', attach: 'Dateien anhängen', mic: 'Sprachnachricht aufnehmen', stop: 'Stoppen und senden', cancel: 'Abbrechen', close: 'Chat schließen', fresh: 'Neues Gespräch', freshQ: 'Neues Gespräch beginnen? Das aktuelle bleibt beim Studio.',
      typing: 'Der Assistent schreibt…', staff: 'Ein Manager antwortet', waiting: 'Wir rufen einen Manager…', online: 'Online', offline: 'Der Assistent ist gerade offline – hinterlassen Sie Ihre Nummer, wir antworten zu den Geschäftszeiten: Mo–Fr 10:00–20:00 (Kyjiwer Zeit).',
      leave: 'Nummer hinterlassen', phone: 'Ihre Telefonnummer', phoneSend: 'Bitte zurückrufen', phoneBad: 'Bitte prüfen Sie die Telefonnummer', you: 'Sie', bot: 'Assistent', mgr: 'Manager',
      big: 'Die Datei ist für den Chat zu groß (bis {max}). Bitte senden Sie sie per Telegram oder WhatsApp:', type: 'Dieser Dateityp wird nicht angenommen. Möglich: Fotos, Video, Audio, PDF, Excel, Word, DWG, DXF, 3DS, SKP, IFC, RVT, ZIP.', mismatch: 'Die Datei ist beschädigt oder hat den falschen Typ.',
      many: 'Zu viele Nachrichten hintereinander – bitte kurz warten.', net: 'Keine Verbindung. Bitte erneut versuchen.', upl: 'Wird hochgeladen…', drop: 'Loslassen, um Dateien anzuhängen', remove: 'Datei entfernen',
      est: 'Vorläufige Kalkulation', total: 'Summe', from: 'ab', smeta: 'laut Kostenvoranschlag', voice: 'Sprachantwort', play: 'Abspielen', pause: 'Pause', rec: 'Aufnahme', micErr: 'Kein Zugriff auf das Mikrofon.', file: 'Datei', eu: 'Europa' },
    fr: { title: 'Assistant CAS', disc: 'C’est l’assistant IA du studio qui répond. Le calcul est indicatif ; le prix exact vient après le métré et le devis.', hello: 'Bonjour ! Je suis l’assistant du studio CAS Development. Parlez-moi de votre projet — ce que vous prévoyez, la surface, la ville — et je vous donnerai un coût indicatif. Vous pouvez envoyer des photos, un plan, un PDF ou un message vocal.',
      ph: 'Écrivez un message…', send: 'Envoyer', attach: 'Joindre des fichiers', mic: 'Enregistrer un message vocal', stop: 'Arrêter et envoyer', cancel: 'Annuler', close: 'Fermer le chat', fresh: 'Nouvelle conversation', freshQ: 'Commencer une nouvelle conversation ? L’actuelle reste au studio.',
      typing: 'L’assistant écrit…', staff: 'Un responsable répond', waiting: 'Nous appelons un responsable…', online: 'En ligne', offline: 'L’assistant est hors ligne pour le moment — laissez votre numéro, nous répondrons aux heures ouvrables : lun–ven 10:00–20:00 (heure de Kyiv).',
      leave: 'Laisser mon numéro', phone: 'Votre téléphone', phoneSend: 'Rappelez-moi', phoneBad: 'Vérifiez le numéro de téléphone', you: 'Vous', bot: 'Assistant', mgr: 'Responsable',
      big: 'Ce fichier est trop volumineux pour le chat (jusqu’à {max}). Envoyez-le via Telegram ou WhatsApp :', type: 'Ce type de fichier n’est pas accepté. Possibles : photos, vidéo, audio, PDF, Excel, Word, DWG, DXF, 3DS, SKP, IFC, RVT, ZIP.', mismatch: 'Le fichier est endommagé ou n’est pas du bon type.',
      many: 'Trop de messages d’affilée — patientez un instant.', net: 'Pas de connexion. Réessayez.', upl: 'Envoi…', drop: 'Déposez pour joindre', remove: 'Retirer le fichier',
      est: 'Calcul indicatif', total: 'Total', from: 'à partir de', smeta: 'sur devis', voice: 'Réponse vocale', play: 'Écouter', pause: 'Pause', rec: 'Enregistrement', micErr: 'Pas d’accès au micro.', file: 'Fichier', eu: 'Europe' },
    pt: { title: 'Assistente CAS', disc: 'Responde o assistente de IA do estúdio. O cálculo é indicativo; o exato, após a medição e o orçamento.', hello: 'Olá! Sou o assistente do estúdio CAS Development. Fale-me do seu projeto — o que planeia, a área e a cidade — e dou-lhe um custo indicativo. Pode enviar fotografias, uma planta, um PDF ou uma mensagem de voz.',
      ph: 'Escreva uma mensagem…', send: 'Enviar', attach: 'Anexar ficheiros', mic: 'Gravar mensagem de voz', stop: 'Parar e enviar', cancel: 'Cancelar', close: 'Fechar o chat', fresh: 'Nova conversa', freshQ: 'Começar uma nova conversa? A atual fica no estúdio.',
      typing: 'O assistente está a escrever…', staff: 'Responde um gestor', waiting: 'A chamar um gestor…', online: 'Online', offline: 'O assistente está offline neste momento — deixe o seu número e respondemos no horário de trabalho: seg–sex 10:00–20:00 (hora de Kyiv).',
      leave: 'Deixar o número', phone: 'O seu telefone', phoneSend: 'Liguem-me', phoneBad: 'Verifique o número de telefone', you: 'Você', bot: 'Assistente', mgr: 'Gestor',
      big: 'O ficheiro é demasiado grande para o chat (até {max}). Envie-o pelo Telegram ou WhatsApp:', type: 'Não aceitamos este tipo de ficheiro. Pode enviar: fotografias, vídeo, áudio, PDF, Excel, Word, DWG, DXF, 3DS, SKP, IFC, RVT, ZIP.', mismatch: 'O ficheiro está danificado ou não é do tipo indicado.',
      many: 'Demasiadas mensagens seguidas — aguarde um pouco.', net: 'Sem ligação. Tente novamente.', upl: 'A enviar…', drop: 'Largue para anexar', remove: 'Remover ficheiro',
      est: 'Cálculo indicativo', total: 'Total', from: 'desde', smeta: 'por orçamento', voice: 'Resposta de voz', play: 'Ouvir', pause: 'Pausa', rec: 'A gravar', micErr: 'Sem acesso ao microfone.', file: 'Ficheiro', eu: 'Europa' },
    ar: { title: 'مساعد CAS', disc: 'يجيبك مساعد الاستوديو بالذكاء الاصطناعي. الحساب تقريبي، والسعر الدقيق بعد القياس وإعداد التقدير.', hello: 'مرحبًا! أنا مساعد استوديو CAS Development. أخبرني عن مشروعك: ما الذي تخطط له والمساحة والمدينة، وسأعطيك تكلفة تقريبية. يمكنك إرسال صور أو مخطط أو ملف PDF أو رسالة صوتية.',
      ph: 'اكتب رسالة…', send: 'إرسال', attach: 'إرفاق ملفات', mic: 'تسجيل رسالة صوتية', stop: 'إيقاف وإرسال', cancel: 'إلغاء', close: 'إغلاق المحادثة', fresh: 'محادثة جديدة', freshQ: 'بدء محادثة جديدة؟ تبقى المحادثة الحالية لدى الاستوديو.',
      typing: 'المساعد يكتب…', staff: 'يرد عليك المدير', waiting: 'نستدعي المدير…', online: 'متصل', offline: 'المساعد غير متصل الآن — اترك رقمك وسنرد خلال ساعات العمل: الاثنين–الجمعة 10:00–20:00 (بتوقيت كييف).',
      leave: 'اترك رقمك', phone: 'رقم هاتفك', phoneSend: 'اتصلوا بي', phoneBad: 'تحقق من رقم الهاتف', you: 'أنت', bot: 'المساعد', mgr: 'المدير',
      big: 'الملف كبير جدًا للمحادثة (حتى {max}). أرسله عبر Telegram أو WhatsApp:', type: 'لا نقبل هذا النوع من الملفات. المسموح: صور، فيديو، صوت، PDF، Excel، Word، DWG، DXF، 3DS، SKP، IFC، RVT، ZIP.', mismatch: 'الملف تالف أو من نوع مختلف.',
      many: 'رسائل كثيرة متتالية — انتظر قليلًا.', net: 'لا يوجد اتصال. حاول مرة أخرى.', upl: 'جارٍ الرفع…', drop: 'أفلت لإرفاق الملفات', remove: 'إزالة الملف',
      est: 'حساب تقريبي', total: 'المجموع', from: 'من', smeta: 'حسب التقدير', voice: 'رد صوتي', play: 'استماع', pause: 'إيقاف مؤقت', rec: 'تسجيل', micErr: 'لا يمكن الوصول إلى الميكروفون.', file: 'ملف', eu: 'أوروبا' }
  };
  var t = T[LG] || T.en, RTL = LG === 'ar';
  var ACCEPT = '.jpg,.jpeg,.png,.webp,.heic,.heif,.mp4,.mov,.webm,.ogg,.oga,.opus,.mp3,.m4a,.aac,.wav,.pdf,.xlsx,.xls,.csv,.docx,.dwg,.dxf,.3ds,.skp,.ifc,.rvt,.zip';
  var ALT = { telegram: 'https://t.me/+380978667755', whatsapp: 'https://wa.me/380978667755' };
  var LIM = { file: 1.5 * 1048576 }, ONLINE = true;
  var reduced = W.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var KEY = 'cas_chat';
  var store = { get: function () { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { return null; } },
    set: function (v) { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch (e) { /* приватне вікно — розмова лише до перезавантаження */ } },
    del: function () { try { localStorage.removeItem(KEY); } catch (e) { /* noop */ } } };
  var S = store.get() || null; // {sid, token}
  var last = 0, state = 'bot', seen = {}, pending = [], timer = null, delay = 2000, opener = null, box, log, ta, stEl, typingEl, attEl, phRow, offEl, recBar, fileIn;

  // ===== утиліти =====
  function el(tag, cls, text) { var x = d.createElement(tag); if (cls) x.className = cls; if (text != null) x.textContent = text; return x; }
  function svg(path) { var s = d.createElementNS('http://www.w3.org/2000/svg', 'svg'); s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('aria-hidden', 'true'); s.innerHTML = path; return s; }
  // іконки — контури в стилі Lucide (ISC), лише сталі рядки
  var I = { clip: '<path d="m21.4 11.1-9.2 9.2a6 6 0 0 1-8.5-8.5l9.2-9.2a4 4 0 0 1 5.7 5.7l-9.2 9.2a2 2 0 0 1-2.8-2.8l8.5-8.5"/>',
    mic: '<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M19 10v1a7 7 0 0 1-14 0v-1M12 18v4"/>', send: '<path d="M22 2 11 13M22 2l-7 20-4-9-9-4z"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>', fresh: '<path d="M3 12a9 9 0 0 1 15.5-6.3L21 8M21 3v5h-5M21 12a9 9 0 0 1-15.5 6.3L3 16M3 21v-5h5"/>',
    play: '<path d="M7 4v16l13-8z"/>', pause: '<path d="M7 4h4v16H7zM14 4h4v16h-4z"/>', phone: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z"/>' };
  function ibtn(cls, label, icon) { var b = el('button', 'cht-ib ' + cls); b.type = 'button'; b.setAttribute('aria-label', label); b.title = label; b.appendChild(svg(I[icon])); return b; }
  var iso = function (s) { return RTL ? '⁦' + s + '⁩' : s; };
  var usd = function (n) { return iso(W.casUsd ? W.casUsd(n, LG) : '$' + Math.round(n)); };
  var size = function (n) { var mb = n / 1048576; return mb >= 1 ? (Math.round(mb * 10) / 10 + ' MB') : Math.max(1, Math.round(n / 1024)) + ' KB'; };
  var hhmm = function (s) { var x = new Date(String(s || '').replace(' ', 'T') + 'Z'); return isNaN(x) ? '' : x.toLocaleTimeString(LG === 'zh' ? 'zh-CN' : LG, { hour: '2-digit', minute: '2-digit' }); };
  function hdr() { var h = { 'content-type': 'application/json' }; if (S) { h['x-chat-sid'] = S.sid; h['x-chat-token'] = S.token; } return h; }
  function req(method, path, body) {
    return fetch(path, { method: method, headers: hdr(), body: body ? JSON.stringify(body) : undefined, credentials: 'omit', cache: 'no-store' }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok) { var e = new Error(j.error || r.status); e.status = r.status; e.data = j; throw e; } return j; });
    });
  }
  function errText(e) { return !e || !e.status ? t.net : e.status === 429 ? t.many : e.status === 415 ? (e.data && e.data.mismatch ? t.mismatch : t.type) : (e.data && e.data.error) || t.net; }
  function note(text, links) {
    var li = el('li', 'cht-m cht-sys cht-err'); li.setAttribute('role', 'status');
    li.appendChild(el('p', 'cht-t', text));
    if (links) { var p = el('p', 'cht-alt'); [['Telegram', ALT.telegram], ['WhatsApp', ALT.whatsapp]].forEach(function (x) { var a = el('a', 'cht-chip', x[0]); a.href = x[1]; a.target = '_blank'; a.rel = 'noopener'; p.appendChild(a); }); li.appendChild(p); }
    log.appendChild(li); down();
  }
  function down() { if (log) log.scrollTop = log.scrollHeight; }
  // розмова: створюємо лише коли людина щось надсилає (порожніх розмов у базі немає)
  function ensure() {
    if (S) return Promise.resolve(S);
    var rh = ''; try { rh = sessionStorage.getItem('cas_rh') || ''; } catch (e) { /* noop */ }
    return req('POST', '/api/chat/start', { lang: LG, page: location.pathname, ref_host: rh || undefined }).then(function (j) {
      S = { sid: j.sid, token: j.token }; store.set(S); LIM = j.limits || LIM; ONLINE = !!j.online; upd(); return S;
    });
  }

  // ===== повідомлення =====
  function fileBlob(id) {
    return fetch('/api/chat/file/' + encodeURIComponent(id), { headers: hdr(), credentials: 'omit' }).then(function (r) { if (!r.ok) throw new Error(r.status); return r.blob(); });
  }
  function player(id, label, dur) {
    var w = el('div', 'cht-pl'), b = el('button', 'cht-ib cht-play'), lab = el('span', 'cht-pll', label + (dur ? ' · ' + Math.floor(dur / 60) + ':' + ('0' + Math.round(dur % 60)).slice(-2) : '')), a = null;
    b.type = 'button'; b.setAttribute('aria-label', t.play + ': ' + label); b.appendChild(svg(I.play));
    var set = function (on) { b.innerHTML = ''; b.appendChild(svg(on ? I.pause : I.play)); b.setAttribute('aria-label', (on ? t.pause : t.play) + ': ' + label); b.setAttribute('aria-pressed', on ? 'true' : 'false'); };
    b.onclick = function () {
      if (a) { if (a.paused) a.play().catch(function () { /* noop */ }); else a.pause(); return; }
      b.disabled = true;
      fileBlob(id).then(function (bl) {
        a = new Audio(URL.createObjectURL(bl)); a.preload = 'auto';
        a.onplay = function () { set(true); }; a.onpause = a.onended = function () { set(false); };
        b.disabled = false; a.play().catch(function () { set(false); });
      }, function () { b.disabled = false; note(t.net); });
    };
    w.appendChild(b); w.appendChild(lab); return w;
  }
  function estimate(e) {
    var w = el('div', 'cht-est'), tb = el('table'), cap = el('caption', null, t.est + (e.region === 'eu' ? ' · ' + t.eu : ''));
    tb.appendChild(cap);
    var body = el('tbody');
    (e.lines || []).forEach(function (l) {
      var tr = el('tr'), th = el('th'), td1 = el('td', 'cht-q'), td2 = el('td', 'cht-s');
      th.scope = 'row'; th.appendChild(d.createTextNode(l.label || ''));
      if (l.note) th.appendChild(el('small', null, l.note));
      var parts = [];
      if (l.qty != null) parts.push(W.casNum ? W.casNum(l.qty, LG) + (l.unit ? ' ' + l.unit : '') : l.qty);
      if (l.rate != null) parts.push(usd(l.rate) + (l.unit ? '/' + l.unit : ''));
      td1.textContent = parts.join(' × ');
      td2.textContent = l.from != null ? t.from + ' ' + usd(l.from) : t.smeta;
      tr.appendChild(th); tr.appendChild(td1); tr.appendChild(td2); body.appendChild(tr);
    });
    tb.appendChild(body);
    if (e.total_from != null) {
      var tf = el('tfoot'), tr = el('tr'), th = el('th', null, t.total), td = el('td', 'cht-s');
      th.scope = 'row'; th.colSpan = 2; td.textContent = t.from + ' ' + usd(e.total_from) + (W.casFx ? W.casFx(e.total_from, LG) : '');
      tr.appendChild(th); tr.appendChild(td); tf.appendChild(tr); tb.appendChild(tf);
    }
    w.appendChild(tb);
    w.appendChild(el('p', 'cht-en', e.note || t.disc));
    return w;
  }
  function render(m) {
    if (seen[m.id]) return;
    seen[m.id] = 1;
    var li = el('li', 'cht-m cht-' + (m.role === 'user' ? 'me' : m.role === 'system' ? 'sys' : m.role)); li.dataset.id = m.id;
    if (m.role !== 'system') { var h = el('div', 'cht-h'); h.appendChild(el('b', null, m.role === 'user' ? t.you : m.role === 'staff' ? (m.author || t.mgr) : t.bot)); h.appendChild(el('time', null, hhmm(m.at))); li.appendChild(h); }
    // відповіді помічника й менеджера: тисячі в сумах — вузький нерозривний пробіл (U+202F, як chrome.price_fmt), щоб «$33 000» не рвалось на два рядки
    var nn = function (x) { return x.replace(/((?:^|[^\d\u202f])\d{1,3}|\u202f\d{3})[ \u00a0](?=\d{3}(?!\d))/g, '$1\u202f'); };
    var tx = m.role === 'user' ? m.text : nn(nn(String(m.text || '')));
    if (m.text) { var tp = el('p', 'cht-t', tx); tp.dir = 'auto'; li.appendChild(tp); }
    if (m.files && m.files.length) {
      var fw = el('div', 'cht-files');
      m.files.forEach(function (f) {
        if (f.kind === 'audio') { fw.appendChild(player(f.id, f.name)); return; }
        var c = el('span', 'cht-file'); c.appendChild(el('b', null, f.name)); c.appendChild(el('small', null, size(f.size))); fw.appendChild(c);
        if (f.kind === 'image' && /jpeg|png|webp/.test(f.mime)) {
          fileBlob(f.id).then(function (bl) { var im = el('img', 'cht-img'); im.alt = f.name; im.width = 240; im.height = 180; im.decoding = 'async'; im.src = URL.createObjectURL(bl); c.replaceWith(im); }, function () { /* лишаємо назву */ });
        }
      });
      li.appendChild(fw);
    }
    if (m.audio) li.appendChild(player(m.audio.id, t.voice, m.audio.dur));
    if (m.estimate) li.appendChild(estimate(m.estimate));
    log.appendChild(li);
  }

  // ===== опитування: 2 → 5 → 10 с без змін, пауза на прихованій вкладці; закрита панель — лише поки чекаємо відповіді =====
  function schedule(reset) {
    clearTimeout(timer);
    if (reset) delay = 2000;
    if (!S || d.hidden) return;
    var open = box && !box.hidden;
    if (!open && !waiting()) return;
    timer = setTimeout(poll, open ? delay : 10000);
  }
  function waiting() { var ms = log ? log.querySelectorAll('.cht-m[data-id]') : []; var l = ms[ms.length - 1]; return !!l && l.classList.contains('cht-me'); }
  function poll() {
    if (!S) return;
    req('GET', '/api/chat/poll?after=' + last).then(function (j) {
      var before = last;
      (j.messages || []).forEach(render);
      if (j.last_id) last = Math.max(last, j.last_id);
      state = j.state; ONLINE = !!j.online;
      typingEl.hidden = !j.typing;
      upd();
      if (last > before) { down(); delay = 2000; if (box.hidden) mark(true); }
      else delay = j.typing ? 2000 : delay < 5000 ? 5000 : 10000;
      schedule();
    }, function (e) {
      if (e.status === 404) { store.del(); S = null; return; } // розмову видалено за терміном — наступне повідомлення почне нову
      delay = 10000; schedule();
    });
  }
  function mark(on) { [].forEach.call(d.querySelectorAll('a[data-chat]'), function (a) { a.classList.toggle('cht-new', !!on); }); }
  function upd() {
    if (!stEl) return;
    stEl.textContent = state === 'staff' ? t.staff : state === 'waiting' ? t.waiting : ONLINE ? t.online : '';
    stEl.className = 'cht-st' + (state === 'bot' && ONLINE ? ' ok' : '');
    var off = !ONLINE && state === 'bot';
    offEl.hidden = !off;
    // офлайн — рядок номера відкритий сам; помічник повернувся — ховаємо, якщо людина його не відкривала й нічого не вписала
    if (off && phRow.querySelector('form').hidden) { phone(true); phRow.dataset.auto = '1'; }
    else if (!off && phRow.dataset.auto && !phRow.querySelector('input').value) { phone(false); delete phRow.dataset.auto; }
  }

  // ===== надсилання =====
  function submit() {
    var text = ta.value.trim(), ready = pending.filter(function (p) { return p.id; }), loading = pending.some(function (p) { return !p.id && !p.err; });
    if (loading) return;
    if (!text && !ready.length) { ta.focus(); return; }
    var sb = box.querySelector('.cht-send'); sb.disabled = true;
    ensure().then(function () { return req('POST', '/api/chat/send', { text: text || undefined, files: ready.map(function (p) { return p.id; }) }); }).then(function () {
      ta.value = ''; grow(); pending = []; drawAtt(); typingEl.hidden = !(ONLINE && state === 'bot'); poll();
    }, function (e) { note(errText(e)); }).then(function () { sb.disabled = false; });
  }
  function grow() { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 140) + 'px'; }

  // ===== файли =====
  function addFiles(list) {
    [].forEach.call(list || [], function (f) {
      var ext = (/\.([a-z0-9]{1,5})$/i.exec(f.name) || [])[1];
      if (!ext || ACCEPT.split(',').indexOf('.' + ext.toLowerCase()) < 0) { note(t.type); return; }
      if (f.size > LIM.file) { note(t.big.replace('{max}', size(LIM.file)), true); return; }
      var p = { f: f, name: f.name, size: f.size, pr: 0 };
      pending.push(p); drawAtt(); upload(p);
    });
  }
  function upload(p) {
    ensure().then(function () {
      var x = new XMLHttpRequest(); p.x = x;
      x.open('POST', '/api/chat/upload');
      x.setRequestHeader('x-chat-sid', S.sid); x.setRequestHeader('x-chat-token', S.token);
      x.setRequestHeader('x-file-name', encodeURIComponent(p.name));
      x.setRequestHeader('content-type', p.f.type || 'application/octet-stream');
      x.upload.onprogress = function (ev) { if (ev.lengthComputable) { p.pr = ev.loaded / ev.total; drawAtt(); } };
      x.onload = function () {
        var j = {}; try { j = JSON.parse(x.responseText); } catch (e) { /* noop */ }
        if (x.status >= 200 && x.status < 300) { p.id = j.file_id; p.pr = 1; if (p.voice) { submit(); } }
        else { p.err = true; pending.splice(pending.indexOf(p), 1); if (x.status === 413) note(t.big.replace('{max}', size((j && j.max) || LIM.file)), true); else note(errText({ status: x.status, data: j })); }
        drawAtt();
      };
      x.onerror = function () { p.err = true; pending.splice(pending.indexOf(p), 1); drawAtt(); note(t.net); };
      x.send(p.f);
    }, function (e) { pending.splice(pending.indexOf(p), 1); drawAtt(); note(errText(e)); });
  }
  function drawAtt() {
    attEl.innerHTML = '';
    attEl.hidden = !pending.length;
    pending.forEach(function (p) {
      var c = el('span', 'cht-att-i' + (p.id ? ' ok' : ''));
      c.appendChild(el('span', 'cht-an', p.name));
      c.appendChild(el('small', null, p.id ? size(p.size) : t.upl + ' ' + Math.round(p.pr * 100) + '%'));
      var bar = el('i', 'cht-pr'); bar.style.width = Math.round(p.pr * 100) + '%'; c.appendChild(bar);
      var x = ibtn('cht-rm', t.remove + ': ' + p.name, 'x');
      x.onclick = function () { if (p.x && !p.id) p.x.abort(); pending.splice(pending.indexOf(p), 1); drawAtt(); };
      c.appendChild(x); attEl.appendChild(c);
    });
  }

  // ===== голос =====
  var rec = null;
  function canRec() { return !!(W.MediaRecorder && navigator.mediaDevices && navigator.mediaDevices.getUserMedia); }
  function startRec() {
    navigator.mediaDevices.getUserMedia({ audio: true }).then(function (stream) {
      var types = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4', 'audio/webm'];
      var type = types.filter(function (x) { return MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(x); })[0] || '';
      var mr = new MediaRecorder(stream, type ? { mimeType: type } : undefined), chunks = [], t0 = Date.now(), cancel = false;
      rec = { mr: mr, stream: stream };
      mr.ondataavailable = function (e) { if (e.data && e.data.size) chunks.push(e.data); };
      mr.onstop = function () {
        stream.getTracks().forEach(function (x) { x.stop(); });
        clearInterval(rec.tick); recBar.hidden = true; box.querySelector('.cht-f').hidden = false; rec = null;
        if (cancel || !chunks.length) return;
        var mt = (mr.mimeType || type || 'audio/webm').split(';')[0], ext = /ogg/.test(mt) ? 'ogg' : /mp4|aac/.test(mt) ? 'm4a' : 'webm';
        var f = new File(chunks, 'voice-' + new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-') + '.' + ext, { type: mt });
        var p = { f: f, name: f.name, size: f.size, pr: 0, voice: true }; pending.push(p); drawAtt(); upload(p);
      };
      var tm = recBar.querySelector('.cht-rt');
      rec.tick = setInterval(function () { var s = Math.floor((Date.now() - t0) / 1000); tm.textContent = Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0') + ' / 2:00'; if (s >= 120) mr.stop(); }, 250);
      rec.cancel = function () { cancel = true; mr.stop(); };
      box.querySelector('.cht-f').hidden = true; recBar.hidden = false; tm.textContent = '0:00 / 2:00';
      mr.start(1000);
      recBar.querySelector('.cht-rs').focus();
    }, function () { note(t.micErr); });
  }

  // ===== «Залишити номер» — рядок у чаті =====
  function phone(open, focus) {
    var f = phRow.querySelector('form'), b = phRow.querySelector('.cht-lv');
    f.hidden = !open; b.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open && focus) f.querySelector('input').focus();
  }

  // ===== панель =====
  function build() {
    box = el('div', 'cht'); box.hidden = true;
    box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-labelledby', 'chtT'); box.dir = RTL ? 'rtl' : 'ltr'; box.lang = LG;
    var hd = el('div', 'cht-hd'), ttl = el('div', 'cht-ttl');
    var h = el('h2', null, t.title); h.id = 'chtT'; ttl.appendChild(h);
    stEl = el('span', 'cht-st'); ttl.appendChild(stEl); hd.appendChild(ttl);
    var nb = ibtn('cht-fresh', t.fresh, 'fresh'), xb = ibtn('cht-x', t.close, 'x');
    hd.appendChild(nb); hd.appendChild(xb); box.appendChild(hd);
    log = el('ol', 'cht-log'); log.setAttribute('aria-live', 'polite'); log.setAttribute('aria-relevant', 'additions'); log.tabIndex = 0; log.setAttribute('aria-label', t.title);
    var dsc = el('li', 'cht-disc', t.disc); log.appendChild(dsc);
    var hi = el('li', 'cht-m cht-bot cht-hello'); var hh = el('div', 'cht-h'); hh.appendChild(el('b', null, t.bot)); hi.appendChild(hh); hi.appendChild(el('p', 'cht-t', t.hello)); log.appendChild(hi);
    box.appendChild(log);
    typingEl = el('p', 'cht-typing', t.typing); typingEl.hidden = true; typingEl.setAttribute('aria-live', 'polite'); box.appendChild(typingEl);
    offEl = el('p', 'cht-off', t.offline); offEl.hidden = true; box.appendChild(offEl);
    // «Залишити номер»
    phRow = el('div', 'cht-ph');
    var lv = el('button', 'cht-lv'); lv.type = 'button'; lv.appendChild(svg(I.phone)); lv.appendChild(d.createTextNode(t.leave)); lv.setAttribute('aria-expanded', 'false'); lv.setAttribute('aria-controls', 'chtPh');
    var pf = el('form', 'cht-pf'); pf.id = 'chtPh'; pf.hidden = true; pf.noValidate = true;
    var pi = el('input'); pi.type = 'tel'; pi.name = 'phone'; pi.autocomplete = 'tel'; pi.inputMode = 'tel'; pi.placeholder = '+380…'; pi.setAttribute('aria-label', t.phone); pi.dir = 'ltr';
    var ps = el('button', 'btn main cht-ps', t.phoneSend); ps.type = 'submit';
    pf.appendChild(pi); pf.appendChild(ps);
    phRow.appendChild(lv); phRow.appendChild(pf); box.appendChild(phRow);
    lv.onclick = function () { delete phRow.dataset.auto; phone(pf.hidden, true); };
    pf.onsubmit = function (e) {
      e.preventDefault();
      var v = pi.value.trim();
      if (v.replace(/\D/g, '').length < 9) { note(t.phoneBad); pi.focus(); return; }
      ps.disabled = true;
      ensure().then(function () { return req('POST', '/api/chat/contact', { phone: v }); }).then(function () {
        pi.value = ''; pf.hidden = true; lv.setAttribute('aria-expanded', 'false'); poll();
      }, function (er) { note(er.status === 422 ? t.phoneBad : errText(er)); }).then(function () { ps.disabled = false; });
    };
    attEl = el('div', 'cht-att'); attEl.hidden = true; box.appendChild(attEl);
    // поле й кнопки
    var f = el('form', 'cht-f'); f.noValidate = true;
    fileIn = el('input'); fileIn.type = 'file'; fileIn.multiple = true; fileIn.accept = ACCEPT; fileIn.hidden = true; fileIn.tabIndex = -1;
    var ab = ibtn('cht-clip', t.attach, 'clip');
    ta = el('textarea', 'cht-in'); ta.rows = 1; ta.maxLength = 4000; ta.placeholder = t.ph; ta.setAttribute('aria-label', t.ph); ta.dir = 'auto';
    var sb = ibtn('cht-send', t.send, 'send'); sb.type = 'submit';
    f.appendChild(fileIn); f.appendChild(ab); f.appendChild(ta);
    if (canRec()) { var mb = ibtn('cht-mic', t.mic, 'mic'); f.appendChild(mb); mb.onclick = startRec; }
    f.appendChild(sb); box.appendChild(f);
    recBar = el('div', 'cht-rec'); recBar.hidden = true;
    var dot = el('span', 'cht-dot'); dot.setAttribute('aria-hidden', 'true');
    var rt = el('span', 'cht-rt', '0:00'); rt.setAttribute('role', 'timer'); rt.setAttribute('aria-label', t.rec);
    var rc = el('button', 'btn cht-rc', t.cancel); rc.type = 'button';
    var rs = el('button', 'btn main cht-rs', t.stop); rs.type = 'button';
    recBar.appendChild(dot); recBar.appendChild(rt); recBar.appendChild(rc); recBar.appendChild(rs); box.appendChild(recBar);
    rc.onclick = function () { if (rec) rec.cancel(); };
    rs.onclick = function () { if (rec) rec.mr.stop(); };
    var dz = el('div', 'cht-dz', t.drop); dz.setAttribute('aria-hidden', 'true'); box.appendChild(dz);
    // події
    ab.onclick = function () { fileIn.click(); };
    fileIn.onchange = function () { addFiles(fileIn.files); fileIn.value = ''; };
    f.onsubmit = function (e) { e.preventDefault(); submit(); };
    ta.addEventListener('input', grow);
    ta.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && !('ontouchstart' in W && matchMedia('(pointer:coarse)').matches)) { e.preventDefault(); submit(); } });
    ta.addEventListener('paste', function (e) { var fs = e.clipboardData && e.clipboardData.files; if (fs && fs.length) { e.preventDefault(); addFiles(fs); } });
    var dc = 0;
    box.addEventListener('dragenter', function (e) { if (e.dataTransfer && [].indexOf.call(e.dataTransfer.types || [], 'Files') >= 0) { dc++; box.classList.add('cht-drag'); } });
    box.addEventListener('dragleave', function () { if (--dc <= 0) { dc = 0; box.classList.remove('cht-drag'); } });
    box.addEventListener('dragover', function (e) { e.preventDefault(); });
    box.addEventListener('drop', function (e) { e.preventDefault(); dc = 0; box.classList.remove('cht-drag'); if (e.dataTransfer) addFiles(e.dataTransfer.files); });
    xb.onclick = close;
    nb.onclick = function () {
      if (!S || confirm(t.freshQ)) {
        store.del(); S = null; last = 0; seen = {}; state = 'bot'; pending = []; drawAtt();
        [].slice.call(log.querySelectorAll('.cht-m:not(.cht-hello)')).forEach(function (x) { x.remove(); });
        typingEl.hidden = true; upd(); ta.focus();
      }
    };
    box.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { if (rec) rec.cancel(); else close(); e.stopPropagation(); return; }
      if (e.key !== 'Tab') return;
      var fs = [].filter.call(box.querySelectorAll('button,input,textarea,a[href],[tabindex="0"]'), function (x) { return !x.disabled && x.offsetParent !== null && !x.closest('[hidden]'); });
      if (!fs.length) return;
      var a = fs[0], z = fs[fs.length - 1];
      if (e.shiftKey && d.activeElement === a) { e.preventDefault(); z.focus(); }
      else if (!e.shiftKey && d.activeElement === z) { e.preventDefault(); a.focus(); }
    });
    d.body.appendChild(box);
    // клавіатура телефона: висота панелі = видима частина вікна (visualViewport), поле вводу не ховається під клавіатурою
    var vv = W.visualViewport;
    if (vv) { var fit = function () { if (!box.hidden) box.style.setProperty('--chvh', vv.height + 'px'); }; vv.addEventListener('resize', fit); vv.addEventListener('scroll', fit); }
    d.addEventListener('visibilitychange', function () { if (!d.hidden) schedule(true); else clearTimeout(timer); });
  }
  function open(from) {
    if (!box) build();
    opener = from || d.activeElement;
    box.hidden = false;
    box.classList.toggle('cht-rm-anim', !!reduced);
    if (W.visualViewport) box.style.setProperty('--chvh', W.visualViewport.height + 'px');
    mark(false); upd();
    req('GET', '/api/chat/status').then(function (j) { LIM = j.limits || LIM; ONLINE = !!j.online; upd(); }, function () { /* noop */ });
    if (S) poll(); else schedule();
    down();
    setTimeout(function () { try { ta.focus({ preventScroll: true }); } catch (e) { ta.focus(); } }, 30);
  }
  function close() {
    if (!box || box.hidden) return;
    box.hidden = true;
    // іконка в закритому меню пігулки вже невидима — фокус на саму пігулку «Звʼязатися»
    var back = opener && opener.offsetParent !== null ? opener : opener && opener.closest && opener.closest('.mbar') ? opener.closest('.mbar').querySelector('.mb-tg') : opener;
    if (back && back.focus) try { back.focus({ preventScroll: true }); } catch (e) { back.focus(); }
    schedule();
  }
  W.casChat = { open: open, close: close, T: T };
})();
