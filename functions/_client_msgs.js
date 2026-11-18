// Повідомлення клієнту 10 мовами сайту (uk, ru, en, es, zh, pl, de, fr, pt, ar) — CRM v2 (Михайло 18.11.2026):
//   kpText    — «Надіслати КП» з картки заявки (текст для Telegram / Viber / WhatsApp; надсилає менеджер зі свого месенджера);
//   remindText — нагадування «етап чекає вашого погодження» (Telegram-бот або вручну);
//   reviewText — прохання про відгук у Google після завершення проєкту (Telegram-бот або вручну).
// Факти — лише з CLAUDE.md: ціни «від» (ставки — functions/_rates.js), точна вартість — після заміру й ТЗ, консультація по телефону безкоштовна.
// Формат цін: тисячі — U+202F (uk, ru, es, pl, de, fr, pt, ar), en і zh — кома; «$30/м²» без пробілів.
export const LANGS = ['uk', 'ru', 'en', 'es', 'zh', 'pl', 'de', 'fr', 'pt', 'ar'];
export const GREVIEW = 'https://g.page/r/CbaVqfJBXWLQEAE/review';
export const SITE = 'https://cas-develop.com';
export const langOf = l => (LANGS.includes(String(l || '').slice(0, 2).toLowerCase()) ? String(l).slice(0, 2).toLowerCase() : 'uk');

export const usdL = (n, lang) => '$' + String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, lang === 'en' || lang === 'zh' ? ',' : ' ');

// назви послуг пропозиції (ключі — OFFER у functions/api/admin/crm.js)
const SVC = {
  dz: ['Дизайн-проєкт інтерʼєру', 'Дизайн-проект интерьера', 'Interior design project', 'Proyecto de diseño interior', '室内设计方案', 'Projekt wnętrza', 'Innenarchitektur-Projekt', 'Projet de design d’intérieur', 'Projeto de design de interiores', 'مشروع تصميم داخلي'],
  reno: ['Ремонт під ключ (роботи й чорнові матеріали)', 'Ремонт под ключ (работы и черновые материалы)', 'Turnkey renovation (works and rough materials)', 'Reforma llave en mano (obra y materiales base)', '交钥匙装修（施工及基础材料）', 'Remont pod klucz (prace i materiały stanu surowego)', 'Renovierung schlüsselfertig (Arbeiten und Rohbaumaterial)', 'Rénovation clé en main (travaux et matériaux de gros œuvre)', 'Remodelação chave na mão (obra e materiais base)', 'تجديد متكامل (الأعمال والمواد الأساسية)'],
  key: ['Будинок під ключ', 'Дом под ключ', 'Turnkey house', 'Casa llave en mano', '交钥匙住宅', 'Dom pod klucz', 'Haus schlüsselfertig', 'Maison clé en main', 'Casa chave na mão', 'منزل متكامل جاهز'],
  box: ['Будинок: коробка', 'Дом: коробка', 'House: shell and core', 'Casa: estructura y cerramientos', '住宅：主体结构', 'Dom: stan surowy', 'Haus: Rohbau', 'Maison : gros œuvre', 'Casa: estrutura e envolvente', 'منزل: الهيكل الأساسي'],
  office: ['Ремонт офісу (роботи й чорнові матеріали)', 'Ремонт офиса (работы и черновые материалы)', 'Office renovation (works and rough materials)', 'Reforma de oficina (obra y materiales base)', '办公室装修（施工及基础材料）', 'Remont biura (prace i materiały stanu surowego)', 'Büro-Renovierung (Arbeiten und Rohbaumaterial)', 'Rénovation de bureau (travaux et gros œuvre)', 'Remodelação de escritório (obra e materiais base)', 'تجديد مكتب (الأعمال والمواد الأساسية)'],
  plan: ['Дизайн: планувальний пакет', 'Дизайн: планировочный пакет', 'Design: space-planning package', 'Diseño: paquete de distribución', '设计：平面布局方案', 'Projekt: pakiet układu funkcjonalnego', 'Design: Grundriss-Paket', 'Design : forfait plan d’aménagement', 'Design: pacote de planta', 'التصميم: باقة المخطط'],
  full: ['Дизайн: повний пакет з авторським наглядом', 'Дизайн: полный пакет с авторским надзором', 'Design: full package with designer supervision', 'Diseño: paquete completo con supervisión de autor', '设计：含设计师监理的完整方案', 'Projekt: pełny pakiet z nadzorem autorskim', 'Design: Komplettpaket mit Bauüberwachung durch den Designer', 'Design : forfait complet avec suivi du designer', 'Design: pacote completo com acompanhamento do autor', 'التصميم: الباقة الكاملة مع إشراف المصمم'],
  arch: ['Архітектурний проєкт будинку', 'Архитектурный проект дома', 'Architectural design of a house', 'Proyecto arquitectónico de vivienda', '住宅建筑设计', 'Projekt architektoniczny domu', 'Architekturprojekt für ein Haus', 'Projet d’architecture de maison', 'Projeto de arquitetura de moradia', 'تصميم معماري للمنزل'],
  furn: ['Меблювання й комплектація', 'Меблировка и комплектация', 'Furnishing and fit-out', 'Amueblamiento y equipamiento', '家具与软装配置', 'Umeblowanie i wyposażenie', 'Möblierung und Ausstattung', 'Ameublement et équipement', 'Mobiliário e equipamento', 'التأثيث والتجهيز'],
  land: ['Ландшафтний дизайн', 'Ландшафтный дизайн', 'Landscape design', 'Diseño de paisajismo', '景观设计', 'Projekt ogrodu', 'Landschaftsgestaltung', 'Aménagement paysager', 'Paisagismo', 'تصميم المناظر الطبيعية'],
};
const M2 = ['м²', 'м²', 'm²', 'm²', 'm²', 'm²', 'm²', 'm²', 'm²', 'م²'];
const ARE = ['сотки', 'сотки', 'ares', 'áreas', '公亩', 'arów', 'Ar', 'ares', 'ares', 'آر'];
const ARE1 = ['сотку', 'сотку', 'are', 'área', '公亩', 'ar', 'Ar', 'are', 'are', 'آر'];

const T = {
  hi: ['Добрий день', 'Добрый день', 'Hello', 'Hola', '您好', 'Dzień dobry', 'Guten Tag', 'Bonjour', 'Olá', 'مرحبًا'],
  thanks: ['дякуємо за звернення в CAS Development.', 'спасибо за обращение в CAS Development.', 'thank you for contacting CAS Development.', 'gracias por contactar con CAS Development.', '感谢您联系 CAS Development。', 'dziękujemy za kontakt z CAS Development.', 'vielen Dank für Ihre Anfrage bei CAS Development.', 'merci d’avoir contacté CAS Development.', 'obrigado por contactar a CAS Development.', 'شكرًا لتواصلك مع CAS Development.'],
  pre: ['Попередній розрахунок', 'Предварительный расчёт', 'Preliminary estimate', 'Estimación preliminar', '初步估算', 'Wstępna wycena', 'Vorläufige Kalkulation', 'Estimation préliminaire', 'Estimativa preliminar', 'تقدير مبدئي'],
  from: ['від', 'от', 'from', 'desde', '起', 'od', 'ab', 'à partir de', 'desde', 'من'],
  est: ['за кошторисом', 'по смете', 'based on a detailed estimate', 'según presupuesto', '按预算核算', 'według kosztorysu', 'nach Kostenvoranschlag', 'sur devis', 'mediante orçamento', 'حسب التقدير التفصيلي'],
  min: ['мінімум', 'минимум', 'minimum', 'mínimo', '最低', 'minimum', 'Minimum', 'minimum', 'mínimo', 'الحد الأدنى'],
  exact: ['Точну вартість порахуємо після заміру й технічного завдання. Консультація по телефону — безкоштовна.', 'Точную стоимость рассчитаем после замера и технического задания. Консультация по телефону — бесплатная.',
    'We will calculate the exact cost after measurements and a design brief. Phone consultation is free.', 'Calcularemos el coste exacto tras la medición y el pliego técnico. La consulta telefónica es gratuita.',
    '精确费用将在测量和技术任务书之后计算。电话咨询免费。', 'Dokładny koszt policzymy po pomiarze i założeniach projektowych. Konsultacja telefoniczna jest bezpłatna.',
    'Die genauen Kosten berechnen wir nach dem Aufmaß und der Aufgabenstellung. Die telefonische Beratung ist kostenlos.', 'Nous calculerons le coût exact après le relevé et le cahier des charges. La consultation téléphonique est gratuite.',
    'Calcularemos o custo exato após a medição e o caderno de encargos. A consulta por telefone é gratuita.', 'سنحسب التكلفة الدقيقة بعد القياس والمواصفات الفنية. الاستشارة الهاتفية مجانية.'],
  remind: ['етап «{s}» проєкту «{p}» чекає вашого погодження. Погодити або написати правки можна в кабінеті:', 'этап «{s}» проекта «{p}» ждёт вашего согласования. Согласовать или написать правки можно в кабинете:',
    'the stage “{s}” of the project “{p}” is awaiting your approval. You can approve it or send revisions in your account:', 'la etapa «{s}» del proyecto «{p}» está pendiente de su aprobación. Puede aprobarla o enviar cambios en su cuenta:',
    '项目“{p}”的阶段“{s}”正在等待您的确认。您可以在个人账户中确认或提交修改意见：', 'etap „{s}” projektu „{p}” czeka na Twoją akceptację. Zatwierdzić go lub wysłać poprawki możesz w panelu:',
    'die Phase „{s}“ des Projekts „{p}“ wartet auf Ihre Freigabe. Freigeben oder Änderungen senden können Sie in Ihrem Konto:', 'l’étape « {s} » du projet « {p} » attend votre validation. Vous pouvez la valider ou envoyer des modifications dans votre espace :',
    'a etapa «{s}» do projeto «{p}» aguarda a sua aprovação. Pode aprová-la ou enviar alterações na sua área de cliente:', 'المرحلة «{s}» من المشروع «{p}» بانتظار موافقتك. يمكنك الموافقة أو إرسال التعديلات من حسابك:'],
  review: ['дякуємо, що обрали CAS Development! Проєкт «{p}» завершено. Будемо вдячні за відгук у Google — це займе хвилину:', 'спасибо, что выбрали CAS Development! Проект «{p}» завершён. Будем благодарны за отзыв в Google — это займёт минуту:',
    'thank you for choosing CAS Development! The project “{p}” is complete. We would be grateful for a Google review — it takes a minute:', '¡gracias por elegir CAS Development! El proyecto «{p}» está terminado. Le agradeceríamos una reseña en Google, solo lleva un minuto:',
    '感谢您选择 CAS Development！项目“{p}”已完成。如能在 Google 上留下评价，我们将不胜感激——只需一分钟：', 'dziękujemy za wybór CAS Development! Projekt „{p}” jest zakończony. Będziemy wdzięczni za opinię w Google — zajmie to minutę:',
    'danke, dass Sie sich für CAS Development entschieden haben! Das Projekt „{p}“ ist abgeschlossen. Über eine Google-Bewertung würden wir uns sehr freuen – es dauert nur eine Minute:', 'merci d’avoir choisi CAS Development ! Le projet « {p} » est terminé. Un avis sur Google nous aiderait beaucoup — cela prend une minute :',
    'obrigado por escolher a CAS Development! O projeto «{p}» está concluído. Ficaríamos gratos por uma avaliação no Google — demora um minuto:', 'شكرًا لاختيارك CAS Development! اكتمل المشروع «{p}». سنكون ممتنين لتقييمك على Google — لن يستغرق سوى دقيقة:'],
};
const t = (k, lang) => T[k][LANGS.indexOf(langOf(lang))];
const hi = (name, lang) => t('hi', lang) + (name ? ', ' + String(name).slice(0, 60) : '') + (langOf(lang) === 'zh' ? '，' : ', ');
const kab = (path, lang) => `${SITE}${path}${path.includes('?') ? '&' : '?'}lang=${langOf(lang)}`;

// КП: «Добрий день, Олено, дякуємо… Попередній розрахунок: Дизайн-проєкт інтерʼєру, 85 м² — від $2 550 ($30/м²). Точну вартість…»
export function kpText(f, lang, name) {
  const L = langOf(lang), i = LANGS.indexOf(L), land = f.unit === 'сотка';
  const svc = (SVC[f.key] || [])[i] || f.label;
  const unit = land ? ARE[i] : M2[i], unit1 = land ? ARE1[i] : M2[i];
  const area = String(f.area).replace('.', L === 'en' || L === 'zh' ? '.' : ',');
  const sum = f.from == null ? t('est', L)
    : `${t('from', L)} ${usdL(f.from, L)} (${usdL(f.rate, L)}/${unit1}${f.min && f.from === f.min && f.rate * f.area < f.min ? `, ${t('min', L)} ${usdL(f.min, L)}` : ''})`;
  return `${hi(name, L)}${t('thanks', L)}\n${t('pre', L)}: ${svc}, ${area} ${unit} — ${sum}.\n${t('exact', L)}\nCAS Development · cas-develop.com`;
}
export function remindText(stage, project, projectId, lang, name) {
  return `${hi(name, lang)}${t('remind', lang).replace('{s}', stage).replace('{p}', project)}\n${kab('/kabinet/obiekt?p=' + projectId, lang)}`;
}
export function reviewText(project, lang, name) {
  return `${hi(name, lang)}${t('review', lang).replace('{p}', project)}\n${GREVIEW}`;
}
