/* CAS Development — квіз-калькулятор «4 кроки → телефон» (UI-kit /styleguide/#quiz; розмітку-заготовку ставить tools/site/quiz.py).
   Заготовка: <div class="qz" data-quiz data-obj="kv" data-svc="rem" data-css="/assets/quiz.v1.css?v=…"></div>.
   Ліниво: CSS і кроки будуються, коли блок наближається до екрана (IntersectionObserver).
   Орієнтир «від» — лише за ставками з CLAUDE.md: дизайн $30/м² (мін. $2 500), ремонт $550/м², офіс $350/м², меблювання $250/м²,
   будівництво $600/м², будинок під ключ $1 100/м²; комерційний ремонт — індивідуально (окремої ставки немає).
   Надсилання — ЛИШЕ через спільну форму form#of і /assets/lead-form.v1.js (одна заявка на сторінку): квіз кладе телефон у #oPhone,
   площу в #oArea, відповіді — у #oMsg (українською, для менеджера), data-form="quiz", і викликає form.requestSubmit().
   Успіх — лише після події cas:lead (lead-form шле її після 2xx), помилку дзеркалимо з #oErr. Clarity: quiz_step; lead_submit — lead-form.
   data-demo — режим для /styleguide/: нічого не надсилає. */
(function () {
  var d = document, lang = (d.documentElement.lang || 'uk').slice(0, 2).toLowerCase();
  var L = {
    uk: { h: 'Порахуйте орієнтовну вартість', p: '4 короткі питання — і ви побачите орієнтир «від» за базовими ставками студії. Наприкінці залиште телефон: передзвонимо й уточнимо розрахунок.',
      step: 'Крок {n} з {t}', next: 'Далі', back: 'Назад', again: 'Змінити відповіді',
      q: ['Що за обʼєкт?', 'Яка послуга потрібна?', 'Яка площа?', 'Коли плануєте почати?'],
      obj: { kv: 'Квартира', dim: 'Будинок', kom: 'Комерція', of: 'Офіс' },
      svc: { dyz: 'Дизайн-проєкт', rem: 'Ремонт', bud: 'Будівництво', meb: 'Меблювання', kl: 'Під ключ' },
      when: { now: 'Якнайшвидше', m3: 'Протягом 1–3 місяців', m6: 'Через 3–6 місяців', calc: 'Поки рахую бюджет' },
      area: 'Площа, м²', m2: 'м²', est: 'Орієнтовно', from: 'від', ind: 'Розрахуємо індивідуально',
      line: { dyz: 'дизайн-проєкт', rem: 'ремонт', of: 'ремонт офісу', bud: 'будівництво', meb: 'меблювання', kl: 'будинок під ключ' },
      min: 'мін. $2 500',
      note: { rem: 'Ремонт від $550/м² — роботи й чорнові матеріали; чистові матеріали, меблі й техніка — окремо, за кошторисом.',
        of: 'Офіс від $350/м² — роботи й чорнові матеріали.', kom: 'Для комерційних приміщень окремої ставки немає — рахуємо за кошторисом.' },
      disc: 'Це орієнтир за базовими ставками студії. Точну суму фіксуємо в кошторисі після заміру.',
      phone: 'Телефон для розрахунку *', ph: '+380 97 123 45 67', send: 'Отримати розрахунок', sending: 'Надсилаємо…',
      tip: 'Перетелефонуємо найближчим часом. Консультація по телефону — безкоштовна.',
      empty: 'Вкажіть номер телефону — ми передзвонимо.', bad: 'Перевірте номер: потрібно щонайменше 9 цифр, напр. 097 123 45 67.',
      fail: 'Не вдалося надіслати. Подзвоніть або напишіть: +380 97 866 77 55.', ok: 'Дякуємо. Перетелефонуємо найближчим часом і уточнимо розрахунок.',
      demo: 'Демо: заявку не надіслано.' },
    ru: { h: 'Рассчитайте ориентировочную стоимость', p: '4 коротких вопроса — и вы увидите ориентир «от» по базовым ставкам студии. В конце оставьте телефон: перезвоним и уточним расчёт.',
      step: 'Шаг {n} из {t}', next: 'Далее', back: 'Назад', again: 'Изменить ответы',
      q: ['Какой объект?', 'Какая услуга нужна?', 'Какая площадь?', 'Когда планируете начать?'],
      obj: { kv: 'Квартира', dim: 'Дом', kom: 'Коммерция', of: 'Офис' },
      svc: { dyz: 'Дизайн-проект', rem: 'Ремонт', bud: 'Строительство', meb: 'Меблировка', kl: 'Под ключ' },
      when: { now: 'Как можно скорее', m3: 'В течение 1–3 месяцев', m6: 'Через 3–6 месяцев', calc: 'Пока считаю бюджет' },
      area: 'Площадь, м²', m2: 'м²', est: 'Ориентировочно', from: 'от', ind: 'Рассчитаем индивидуально',
      line: { dyz: 'дизайн-проект', rem: 'ремонт', of: 'ремонт офиса', bud: 'строительство', meb: 'меблировка', kl: 'дом под ключ' },
      min: 'мин. $2 500',
      note: { rem: 'Ремонт от $550/м² — работы и черновые материалы; чистовые материалы, мебель и техника — отдельно, по смете.',
        of: 'Офис от $350/м² — работы и черновые материалы.', kom: 'Для коммерческих помещений отдельной ставки нет — считаем по смете.' },
      disc: 'Это ориентир по базовым ставкам студии. Точную сумму фиксируем в смете после замера.',
      phone: 'Телефон для расчёта *', ph: '+380 97 123 45 67', send: 'Получить расчёт', sending: 'Отправляем…',
      tip: 'Перезвоним в ближайшее время. Консультация по телефону — бесплатная.',
      empty: 'Укажите номер телефона — мы перезвоним.', bad: 'Проверьте номер: нужно не меньше 9 цифр, напр. 097 123 45 67.',
      fail: 'Не удалось отправить. Позвоните или напишите: +380 97 866 77 55.', ok: 'Спасибо. Перезвоним в ближайшее время и уточним расчёт.',
      demo: 'Демо: заявка не отправлена.' },
    en: { h: 'Get a quick cost estimate', p: 'Four short questions and you will see a “from” figure based on the studio’s base rates. Leave your phone number at the end and we will call you to refine it.',
      step: 'Step {n} of {t}', next: 'Next', back: 'Back', again: 'Change answers',
      q: ['What is the property?', 'Which service do you need?', 'What is the area?', 'When do you plan to start?'],
      obj: { kv: 'Apartment', dim: 'House', kom: 'Commercial', of: 'Office' },
      svc: { dyz: 'Design project', rem: 'Renovation', bud: 'Construction', meb: 'Furnishing', kl: 'Turnkey' },
      when: { now: 'As soon as possible', m3: 'Within 1–3 months', m6: 'In 3–6 months', calc: 'Still planning the budget' },
      area: 'Area, m²', m2: 'm²', est: 'Estimate', from: 'from', ind: 'We will price it individually',
      line: { dyz: 'design project', rem: 'renovation', of: 'office renovation', bud: 'construction', meb: 'furnishing', kl: 'turnkey house' },
      min: 'min. $2,500',
      note: { rem: 'Renovation from $550/m² covers labour and rough materials; finishing materials, furniture and appliances are extra, per estimate.',
        of: 'Office from $350/m² covers labour and rough materials.', kom: 'There is no flat rate for commercial premises — we price them per estimate.' },
      disc: 'This is a guide based on the studio’s base rates. The exact sum is fixed in the estimate after the site survey.',
      phone: 'Phone for the estimate *', ph: '+44 7700 900123', send: 'Get my estimate', sending: 'Sending…',
      tip: 'We will call you back shortly. Phone consultation is free.',
      empty: 'Please enter your phone number — we will call you back.', bad: 'Please check the number: at least 9 digits, with country code.',
      fail: 'We could not send it. Please call or message +380 97 866 77 55.', ok: 'Thank you. We will call you back shortly to refine the estimate.',
      demo: 'Demo: nothing was sent.' },
    es: { h: 'Calcule un presupuesto orientativo', p: 'Cuatro preguntas breves y verá una cifra «desde» según las tarifas base del estudio. Al final deje su teléfono: le llamamos para afinar el cálculo.',
      step: 'Paso {n} de {t}', next: 'Siguiente', back: 'Atrás', again: 'Cambiar respuestas',
      q: ['¿Qué tipo de inmueble?', '¿Qué servicio necesita?', '¿Qué superficie?', '¿Cuándo quiere empezar?'],
      obj: { kv: 'Piso', dim: 'Casa', kom: 'Local comercial', of: 'Oficina' },
      svc: { dyz: 'Proyecto de diseño', rem: 'Reforma', bud: 'Construcción', meb: 'Amueblamiento', kl: 'Llave en mano' },
      when: { now: 'Lo antes posible', m3: 'En 1–3 meses', m6: 'Dentro de 3–6 meses', calc: 'Aún calculo el presupuesto' },
      area: 'Superficie, m²', m2: 'm²', est: 'Orientativo', from: 'desde', ind: 'Lo calculamos de forma individual',
      line: { dyz: 'proyecto de diseño', rem: 'reforma', of: 'reforma de oficina', bud: 'construcción', meb: 'amueblamiento', kl: 'casa llave en mano' },
      min: 'mín. $2 500',
      note: { rem: 'Reforma desde $550/m²: mano de obra y materiales de obra gruesa; los acabados, muebles y electrodomésticos aparte, según presupuesto.',
        of: 'Oficina desde $350/m²: mano de obra y materiales de obra gruesa.', kom: 'Para locales comerciales no hay tarifa fija: lo calculamos con presupuesto.' },
      disc: 'Es una referencia según las tarifas base del estudio. El importe exacto se fija en el presupuesto tras la medición.',
      phone: 'Teléfono para el cálculo *', ph: '+34 600 123 456', send: 'Recibir el cálculo', sending: 'Enviando…',
      tip: 'Le llamamos en breve. La consulta telefónica es gratuita.',
      empty: 'Indique su número de teléfono y le llamamos.', bad: 'Revise el número: al menos 9 cifras, con prefijo internacional.',
      fail: 'No se pudo enviar. Llame o escriba al +380 97 866 77 55.', ok: 'Gracias. Le llamamos en breve para afinar el cálculo.',
      demo: 'Demo: no se ha enviado nada.' },
    zh: { h: '估算参考费用', p: '回答 4 个简单问题，即可看到按工作室基础单价计算的“起价”。最后留下电话，我们回电细化估算。',
      step: '第 {n} 步，共 {t} 步', next: '下一步', back: '返回', again: '修改答案',
      q: ['什么类型的物业？', '需要什么服务？', '面积多大？', '计划何时开始？'],
      obj: { kv: '公寓', dim: '住宅', kom: '商业空间', of: '办公室' },
      svc: { dyz: '设计方案', rem: '装修', bud: '建造', meb: '家具配置', kl: '交钥匙' },
      when: { now: '尽快', m3: '1–3 个月内', m6: '3–6 个月后', calc: '仍在规划预算' },
      area: '面积，m²', m2: 'm²', est: '参考价', from: '起', ind: '单独核算',
      line: { dyz: '设计方案', rem: '装修', of: '办公室装修', bud: '建造', meb: '家具配置', kl: '住宅交钥匙' },
      min: '最低 $2,500',
      note: { rem: '装修 $550/m² 起：含人工和基础材料；饰面材料、家具和电器另计，按预算。',
        of: '办公室 $350/m² 起：含人工和基础材料。', kom: '商业空间没有统一单价，按预算核算。' },
      disc: '这是按工作室基础单价的参考。确切金额在现场测量后的预算中确定。',
      phone: '用于估算的电话 *', ph: '+86 138 0013 8000', send: '获取估算', sending: '发送中…',
      tip: '我们会尽快回电。电话咨询免费。',
      empty: '请填写电话号码，我们会回电。', bad: '请检查号码：至少 9 位数字，含国家区号。',
      fail: '发送失败。请致电或发消息至 +380 97 866 77 55。', ok: '谢谢。我们会尽快回电并细化估算。',
      demo: '演示：未发送任何内容。' },
    pl: { h: 'Oblicz orientacyjny koszt', p: 'Cztery krótkie pytania i zobaczysz kwotę „od” według stawek bazowych studia. Na końcu zostaw telefon: oddzwonimy i doprecyzujemy wycenę.',
      step: 'Krok {n} z {t}', next: 'Dalej', back: 'Wstecz', again: 'Zmień odpowiedzi',
      q: ['Jaki to obiekt?', 'Jakiej usługi potrzebujesz?', 'Jaka powierzchnia?', 'Kiedy planujesz start?'],
      obj: { kv: 'Mieszkanie', dim: 'Dom', kom: 'Lokal usługowy', of: 'Biuro' },
      svc: { dyz: 'Projekt wnętrza', rem: 'Remont', bud: 'Budowa', meb: 'Umeblowanie', kl: 'Pod klucz' },
      when: { now: 'Jak najszybciej', m3: 'W ciągu 1–3 miesięcy', m6: 'Za 3–6 miesięcy', calc: 'Na razie liczę budżet' },
      area: 'Powierzchnia, m²', m2: 'm²', est: 'Orientacyjnie', from: 'od', ind: 'Wycenimy indywidualnie',
      line: { dyz: 'projekt wnętrza', rem: 'remont', of: 'remont biura', bud: 'budowa', meb: 'umeblowanie', kl: 'dom pod klucz' },
      min: 'min. $2 500',
      note: { rem: 'Remont od $550/m² — robocizna i materiały budowlane; materiały wykończeniowe, meble i AGD osobno, według kosztorysu.',
        of: 'Biuro od $350/m² — robocizna i materiały budowlane.', kom: 'Dla lokali usługowych nie ma stałej stawki — liczymy według kosztorysu.' },
      disc: 'To orientacja według stawek bazowych studia. Dokładną kwotę ustalamy w kosztorysie po pomiarze.',
      phone: 'Telefon do wyceny *', ph: '+48 512 345 678', send: 'Otrzymaj wycenę', sending: 'Wysyłamy…',
      tip: 'Oddzwonimy wkrótce. Konsultacja telefoniczna jest bezpłatna.',
      empty: 'Podaj numer telefonu — oddzwonimy.', bad: 'Sprawdź numer: co najmniej 9 cyfr, z numerem kierunkowym kraju.',
      fail: 'Nie udało się wysłać. Zadzwoń lub napisz: +380 97 866 77 55.', ok: 'Dziękujemy. Oddzwonimy wkrótce i doprecyzujemy wycenę.',
      demo: 'Demo: nic nie wysłano.' },
    de: { h: 'Richtpreis berechnen', p: 'Vier kurze Fragen, und Sie sehen einen „ab“-Wert nach den Basissätzen des Studios. Hinterlassen Sie am Ende Ihre Telefonnummer: Wir rufen zurück und präzisieren die Kalkulation.',
      step: 'Schritt {n} von {t}', next: 'Weiter', back: 'Zurück', again: 'Antworten ändern',
      q: ['Um welches Objekt geht es?', 'Welche Leistung brauchen Sie?', 'Wie groß ist die Fläche?', 'Wann möchten Sie starten?'],
      obj: { kv: 'Wohnung', dim: 'Haus', kom: 'Gewerbe', of: 'Büro' },
      svc: { dyz: 'Designprojekt', rem: 'Sanierung', bud: 'Bau', meb: 'Einrichtung', kl: 'Schlüsselfertig' },
      when: { now: 'So bald wie möglich', m3: 'In 1–3 Monaten', m6: 'In 3–6 Monaten', calc: 'Ich plane noch das Budget' },
      area: 'Fläche, m²', m2: 'm²', est: 'Richtwert', from: 'ab', ind: 'Wir kalkulieren individuell',
      line: { dyz: 'Designprojekt', rem: 'Sanierung', of: 'Büroumbau', bud: 'Bau', meb: 'Einrichtung', kl: 'Haus schlüsselfertig' },
      min: 'mind. $2 500',
      note: { rem: 'Sanierung ab $550/m² — Arbeit und Rohbaumaterial; Ausbaumaterialien, Möbel und Geräte separat, nach Kostenvoranschlag.',
        of: 'Büro ab $350/m² — Arbeit und Rohbaumaterial.', kom: 'Für Gewerbeflächen gibt es keinen Pauschalsatz — wir kalkulieren nach Kostenvoranschlag.' },
      disc: 'Das ist ein Richtwert nach den Basissätzen des Studios. Die genaue Summe steht im Kostenvoranschlag nach dem Aufmaß.',
      phone: 'Telefon für die Kalkulation *', ph: '+49 151 23456789', send: 'Kalkulation erhalten', sending: 'Wird gesendet…',
      tip: 'Wir rufen Sie in Kürze zurück. Die telefonische Beratung ist kostenlos.',
      empty: 'Bitte geben Sie Ihre Telefonnummer an — wir rufen zurück.', bad: 'Bitte prüfen Sie die Nummer: mindestens 9 Ziffern, mit Ländervorwahl.',
      fail: 'Senden fehlgeschlagen. Rufen Sie an oder schreiben Sie: +380 97 866 77 55.', ok: 'Danke. Wir rufen Sie in Kürze zurück und präzisieren die Kalkulation.',
      demo: 'Demo: nichts gesendet.' },
    fr: { h: 'Estimez le coût indicatif', p: 'Quatre questions courtes et vous verrez un montant « à partir de » selon les tarifs de base du studio. Laissez votre téléphone à la fin : nous vous rappelons pour affiner le chiffrage.',
      step: 'Étape {n} sur {t}', next: 'Suivant', back: 'Retour', again: 'Modifier les réponses',
      q: ['Quel type de bien ?', 'De quel service avez-vous besoin ?', 'Quelle surface ?', 'Quand souhaitez-vous commencer ?'],
      obj: { kv: 'Appartement', dim: 'Maison', kom: 'Local commercial', of: 'Bureau' },
      svc: { dyz: 'Projet de design', rem: 'Rénovation', bud: 'Construction', meb: 'Ameublement', kl: 'Clé en main' },
      when: { now: 'Dès que possible', m3: 'D’ici 1 à 3 mois', m6: 'Dans 3 à 6 mois', calc: 'Je calcule encore le budget' },
      area: 'Surface, m²', m2: 'm²', est: 'Estimation', from: 'à partir de', ind: 'Chiffrage sur mesure',
      line: { dyz: 'projet de design', rem: 'rénovation', of: 'rénovation de bureaux', bud: 'construction', meb: 'ameublement', kl: 'maison clé en main' },
      min: 'min. 2 500 $',
      note: { rem: 'Rénovation à partir de 550 $/m² : main-d’œuvre et matériaux de gros œuvre ; finitions, mobilier et électroménager en sus, sur devis.',
        of: 'Bureau à partir de 350 $/m² : main-d’œuvre et matériaux de gros œuvre.', kom: 'Pas de tarif forfaitaire pour les locaux commerciaux : chiffrage sur devis.' },
      disc: 'C’est un repère selon les tarifs de base du studio. Le montant exact est fixé dans le devis après le relevé.',
      phone: 'Téléphone pour le chiffrage *', ph: '+33 6 12 34 56 78', send: 'Recevoir le chiffrage', sending: 'Envoi…',
      tip: 'Nous vous rappelons rapidement. La consultation téléphonique est gratuite.',
      empty: 'Indiquez votre numéro de téléphone : nous vous rappelons.', bad: 'Vérifiez le numéro : au moins 9 chiffres, avec l’indicatif du pays.',
      fail: 'Envoi impossible. Appelez ou écrivez au +380 97 866 77 55.', ok: 'Merci. Nous vous rappelons rapidement pour affiner le chiffrage.',
      demo: 'Démo : rien n’a été envoyé.' },
    ar: { h: 'احسب التكلفة التقديرية', p: 'أربعة أسئلة قصيرة وسترى مبلغًا «يبدأ من» وفق الأسعار الأساسية للاستوديو. اترك رقم هاتفك في النهاية: سنتصل بك لتدقيق الحساب.',
      step: 'الخطوة {n} من {t}', next: 'التالي', back: 'رجوع', again: 'تعديل الإجابات',
      q: ['ما نوع العقار؟', 'ما الخدمة المطلوبة؟', 'ما المساحة؟', 'متى تخطط للبدء؟'],
      obj: { kv: 'شقة', dim: 'منزل', kom: 'محل تجاري', of: 'مكتب' },
      svc: { dyz: 'مشروع تصميم', rem: 'تجديد', bud: 'بناء', meb: 'تأثيث', kl: 'تسليم مفتاح' },
      when: { now: 'في أقرب وقت', m3: 'خلال 1–3 أشهر', m6: 'بعد 3–6 أشهر', calc: 'ما زلت أحسب الميزانية' },
      area: 'المساحة، م²', m2: 'م²', est: 'تقديريًا', from: 'من', ind: 'نحسبها بشكل فردي',
      line: { dyz: 'مشروع تصميم', rem: 'تجديد', of: 'تجديد مكتب', bud: 'بناء', meb: 'تأثيث', kl: 'منزل تسليم مفتاح' },
      min: 'حد أدنى $2,500',
      note: { rem: 'التجديد من $550/م²: الأعمال والمواد الأساسية؛ ومواد التشطيب والأثاث والأجهزة منفصلة وفق المقايسة.',
        of: 'المكتب من $350/م²: الأعمال والمواد الأساسية.', kom: 'لا يوجد سعر ثابت للمحلات التجارية: نحسبها وفق المقايسة.' },
      disc: 'هذا مؤشر وفق الأسعار الأساسية للاستوديو. يُحدَّد المبلغ الدقيق في المقايسة بعد القياس.',
      phone: 'الهاتف للحساب *', ph: '+971 50 123 4567', send: 'احصل على الحساب', sending: 'جارٍ الإرسال…',
      tip: 'سنتصل بك قريبًا. الاستشارة الهاتفية مجانية.',
      empty: 'أدخل رقم هاتفك وسنتصل بك.', bad: 'تحقق من الرقم: 9 أرقام على الأقل مع رمز الدولة.',
      fail: 'تعذّر الإرسال. اتصل أو راسلنا: ‎+380 97 866 77 55.', ok: 'شكرًا. سنتصل بك قريبًا لتدقيق الحساب.',
      demo: 'عرض تجريبي: لم يُرسل شيء.' }
  };
  var t = L[lang] || L.uk, U = L.uk;
  var UA = lang === 'uk' || lang === 'ru';
  var RATE = { dyz: 30, rem: 550, of: 350, meb: 250, bud: 600, kl: 1100 }, DMIN = 2500;
  var SVC = ['dyz', 'rem', 'bud', 'meb', 'kl'], OBJ = ['kv', 'dim', 'kom', 'of'], WHEN = ['now', 'm3', 'm6', 'calc'];
  var DEF_AREA = { kv: 70, dim: 150, kom: 120, of: 150 };

  function clarity(k, v) { try { if (window.clarity) { window.clarity('set', k, String(v)); window.clarity('event', k); } } catch (x) {} }
  function money(n) { return window.casUsd(n, lang); } // формат мови — site-chrome.v1.js ($2 500; en — $2,500)
  // той самий розбір номера, що й у lead-form.v1.js (щоб невірний номер не «стрибав» до основної форми)
  function normPhone(v) {
    var x = String(v || '').replace(/\D/g, '');
    if (/^0\d{9}$/.test(x)) x = '38' + x;
    else if (/^80\d{9}$/.test(x)) x = '3' + x;
    else if (/^3800\d{9}$/.test(x)) x = '380' + x.slice(4);
    else if (UA && /^[1-9]\d{8}$/.test(x)) x = '380' + x;
    if (/^380/.test(x) && x.length !== 12) return null;
    return x.length >= 9 && x.length <= 15 ? x : null;
  }

  /* Розрахунок: [{k: рядок, v: сума|null, r: ставка}], нотатки. Лише ставки CLAUDE.md. */
  function estimate(o, s, a) {
    var lines = [], notes = [];
    var rt = function (n) { return money(n) + '/' + t.m2; };
    var dz = function () { lines.push({ k: 'dyz', v: Math.max(a * RATE.dyz, DMIN), r: rt(30) + ', ' + t.min }); };
    var rm = function () {
      if (o === 'kom') { lines.push({ k: 'rem', v: null }); notes.push(t.note.kom); }
      else if (o === 'of') { lines.push({ k: 'of', v: a * RATE.of, r: rt(350) }); notes.push(t.note.of); }
      else { lines.push({ k: 'rem', v: a * RATE.rem, r: rt(550) }); notes.push(t.note.rem); }
    };
    var mb = function () { lines.push({ k: 'meb', v: a * RATE.meb, r: rt(250) }); };
    if (s === 'dyz') dz();
    else if (s === 'rem') rm();
    else if (s === 'meb') mb();
    else if (s === 'bud') lines.push(o === 'dim' ? { k: 'bud', v: a * RATE.bud, r: rt(600) } : { k: 'bud', v: null });
    else if (s === 'kl') {
      if (o === 'dim') lines.push({ k: 'kl', v: a * RATE.kl, r: rt(1100) });
      else { dz(); rm(); mb(); }
    }
    var sum = 0, known = 0, unknown = 0;
    lines.forEach(function (l) { if (l.v == null) unknown++; else { sum += l.v; known++; } });
    return { lines: lines, notes: notes, sum: known ? sum : null, partial: !!unknown };
  }

  function el(tag, cls, txt) { var e = d.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }

  var uid = 0;
  function build(root) {
    if (root.dataset.ready) return; root.dataset.ready = '1';
    var id = 'qz' + (++uid), demo = root.hasAttribute('data-demo');
    var st = { obj: OBJ.indexOf(root.dataset.obj) >= 0 ? root.dataset.obj : '', svc: SVC.indexOf(root.dataset.svc) >= 0 ? root.dataset.svc : '',
      area: 0, when: '' };
    var TOTAL = 4, cur = 0, first = true, areaSet = false;
    root.textContent = '';
    var head = el('div', 'qz-hd'), prog = el('p', 'qz-pg'), bar = el('div', 'qz-bar'), fill = el('i');
    prog.id = id + 'pg'; prog.setAttribute('aria-live', 'polite');
    bar.setAttribute('aria-hidden', 'true'); bar.appendChild(fill); head.appendChild(prog); head.appendChild(bar); root.appendChild(head);
    var steps = [], body = el('div', 'qz-bd'); root.appendChild(body);

    function radios(i, name, keys, labels, key) {
      var fs = el('fieldset', 'qz-st'), lg = el('legend', 'qz-q', t.q[i]); lg.tabIndex = -1; fs.appendChild(lg);
      var grid = el('div', 'qz-os');
      keys.forEach(function (k) {
        var lb = el('label', 'qz-o'), inp = el('input'); inp.type = 'radio'; inp.name = id + name; inp.value = k;
        if (st[key] === k) inp.checked = true;
        inp.addEventListener('change', function () { st[key] = k; if (key === 'obj') syncSvc(); navState(); });
        // мишею/дотиком — одразу далі; клавіатурою (стрілки) — лише вибір, далі кнопкою
        lb.addEventListener('click', function (e) { if (e.detail > 0 && e.target === inp) setTimeout(function () { go(i + 1); }, 160); });
        lb.appendChild(inp); lb.appendChild(el('span', '', labels[k])); grid.appendChild(lb);
      });
      fs.appendChild(grid); return fs;
    }
    steps.push(radios(0, 'o', OBJ, t.obj, 'obj'));
    var svcStep = radios(1, 's', SVC, t.svc, 'svc'); steps.push(svcStep);
    function syncSvc() { // «Будівництво» — лише для будинку
      var b = svcStep.querySelector('input[value="bud"]'), on = st.obj === 'dim';
      b.closest('label').hidden = !on; b.disabled = !on;
      if (!on && st.svc === 'bud') { st.svc = ''; b.checked = false; }
    }
    // площа: повзунок + число
    var fa = el('fieldset', 'qz-st'), la = el('legend', 'qz-q', t.q[2]); la.tabIndex = -1; fa.appendChild(la);
    var row = el('div', 'qz-ar'), rg = el('input'), nb = el('input'), nl = el('label', 'qz-al', t.area);
    rg.type = 'range'; rg.min = 10; rg.max = 1000; rg.step = 5; rg.setAttribute('aria-label', t.area);
    nb.type = 'number'; nb.min = 10; nb.max = 20000; nb.step = 1; nb.inputMode = 'numeric'; nb.id = id + 'a'; nl.htmlFor = nb.id;
    function setArea(v, from) {
      v = Math.round(+v || 0); st.area = v; if (from) areaSet = true;
      if (from !== rg) rg.value = Math.min(1000, Math.max(10, v));
      if (from !== nb) nb.value = v;
      rg.setAttribute('aria-valuetext', v + ' ' + t.m2); navState();
    }
    rg.addEventListener('input', function () { setArea(rg.value, rg); });
    nb.addEventListener('input', function () { setArea(nb.value, nb); });
    var nw = el('div', 'qz-an'); nw.appendChild(nl); nw.appendChild(nb);
    row.appendChild(rg); row.appendChild(nw); fa.appendChild(row); steps.push(fa);
    steps.push(radios(3, 'w', WHEN, t.when, 'when'));
    // результат + телефон
    var res = el('div', 'qz-st qz-res'), rh = el('p', 'qz-q'); rh.tabIndex = -1; res.appendChild(rh);
    var ul = el('ul', 'qz-ls'), nt = el('p', 'qz-nt'), ds = el('p', 'qz-nt', t.disc);
    res.appendChild(ul); res.appendChild(nt); res.appendChild(ds);
    var pl = el('label', 'qz-pl', t.phone), pr = el('div', 'qz-pr'), ph = el('input'), sb = el('button', 'qz-b qz-send', t.send), er = el('div', 'qz-er'), tip = el('p', 'qz-nt', t.tip);
    ph.type = 'tel'; ph.inputMode = 'tel'; ph.autocomplete = 'tel'; ph.placeholder = t.ph; ph.id = id + 'p'; pl.htmlFor = ph.id;
    er.id = id + 'e'; er.setAttribute('role', 'alert'); ph.setAttribute('aria-describedby', er.id); ph.setAttribute('aria-required', 'true');
    sb.type = 'button';
    pr.appendChild(ph); pr.appendChild(sb); res.appendChild(pl); res.appendChild(pr); res.appendChild(er); res.appendChild(tip);
    steps.push(res);
    var ok = el('div', 'qz-ok', t.ok); ok.setAttribute('role', 'status'); ok.tabIndex = -1; ok.hidden = true;
    steps.forEach(function (s) { s.hidden = true; body.appendChild(s); });
    root.appendChild(ok);
    var nav = el('div', 'qz-nv'), bb = el('button', 'qz-b qz-bk', t.back), nx = el('button', 'qz-b qz-nx', t.next);
    bb.type = nx.type = 'button'; nav.appendChild(bb); nav.appendChild(nx); root.appendChild(nav);

    function valid(i) { return i === 0 ? !!st.obj : i === 1 ? !!st.svc : i === 2 ? st.area >= 10 : i === 3 ? !!st.when : true; }
    function navState() { nx.disabled = !valid(cur); }
    function render() {
      var e = estimate(st.obj, st.svc, st.area);
      rh.textContent = t.est + ': ' + (e.sum != null ? t.from + ' ' + money(e.sum) : t.ind);
      ul.textContent = '';
      e.lines.forEach(function (l) {
        var li = el('li'); li.appendChild(d.createTextNode((t.line[l.k] || l.k) + (l.r ? ' · ' + st.area + ' ' + t.m2 + ' × ' + l.r : '') + ' — '));
        li.appendChild(el('b', '', l.v != null ? t.from + ' ' + money(l.v) : t.ind)); ul.appendChild(li);
      });
      nt.textContent = e.notes.join(' '); nt.hidden = !e.notes.length;
      return e;
    }
    function go(i) {
      if (i > cur && !valid(cur)) { navState(); return; }
      i = Math.max(0, Math.min(TOTAL, i));
      if (i === 2 && !areaSet) setArea(DEF_AREA[st.obj] || 70);
      cur = i;
      steps.forEach(function (s, k) { s.hidden = k !== i; });
      if (i === TOTAL) render();
      prog.textContent = t.step.replace('{n}', Math.min(i + 1, TOTAL)).replace('{t}', TOTAL);
      fill.style.width = Math.round((i + (i < TOTAL ? 0 : 1)) / TOTAL * 100) + '%';
      bb.hidden = i === 0; nx.hidden = i === TOTAL; bb.textContent = i === TOTAL ? t.again : t.back;
      navState();
      var f = steps[i].querySelector('.qz-q'); if (f && !first) { try { f.focus({ preventScroll: true }); } catch (x) { f.focus(); } }
      first = false;
      clarity('quiz_step', i + 1);
    }
    bb.addEventListener('click', function () { go(cur === TOTAL ? 0 : cur - 1); });
    nx.addEventListener('click', function () { go(cur + 1); });
    root.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' || e.target.tagName === 'BUTTON') return;
      e.preventDefault();
      if (cur === TOTAL) send(); else go(cur + 1);
    });

    function summary(e) { // для менеджера — завжди українською
      var parts = ['Квіз: ' + U.obj[st.obj], U.svc[st.svc], st.area + ' м²', 'старт: ' + U.when[st.when]];
      parts.push('орієнтир: ' + (e.sum != null ? 'від $' + Math.round(e.sum) + (e.partial ? ' + кошторис' : '') : 'індивідуально'));
      return parts.join(' · ');
    }
    function fail(msg) { sb.disabled = false; sb.textContent = t.send; er.textContent = msg; }
    function send() {
      var raw = ph.value.trim(), n = normPhone(raw);
      if (!n) { er.textContent = raw ? t.bad : t.empty; ph.setAttribute('aria-invalid', 'true'); ph.focus(); return; }
      ph.removeAttribute('aria-invalid'); er.textContent = '';
      if (demo) { er.textContent = t.demo; return; }
      var f = d.getElementById('of'), oP = d.getElementById('oPhone');
      if (!f || !oP || typeof f.requestSubmit !== 'function') { fail(t.fail); return; }
      var oA = d.getElementById('oArea'), oM = d.getElementById('oMsg'), oE = d.getElementById('oErr');
      var keep = { form: f.dataset.form, service: f.dataset.service, area: oA ? oA.value : '', msg: oM ? oM.value : '', phone: oP.value };
      var e = estimate(st.obj, st.svc, st.area), done = false, mo;
      sb.disabled = true; sb.textContent = t.sending;
      function restore() {
        if (mo) mo.disconnect(); d.removeEventListener('cas:lead', onLead);
        f.dataset.form = keep.form || 'landing'; f.dataset.service = keep.service || '';
        if (oA) oA.value = keep.area; if (oM) oM.value = keep.msg; oP.value = keep.phone;
      }
      function onLead(ev) {
        if (done || !ev.detail || ev.detail.form !== 'quiz') return; done = true; restore();
        steps.forEach(function (s) { s.hidden = true; }); nav.hidden = true; head.hidden = true; root.classList.add('qz-done');
        ok.hidden = false; try { ok.focus({ preventScroll: true }); } catch (x) { ok.focus(); }
      }
      d.addEventListener('cas:lead', onLead);
      if (oE && window.MutationObserver) {
        oE.textContent = '';
        mo = new MutationObserver(function () { if (!done && oE.textContent.trim()) { done = true; restore(); oE.textContent = ''; fail(t.fail); } });
        mo.observe(oE, { childList: true, characterData: true, subtree: true });
      }
      oP.value = '+' + n;
      if (oA) oA.value = String(st.area);
      if (oM) oM.value = summary(e) + (keep.msg ? '\n' + keep.msg : '');
      f.dataset.form = 'quiz';
      f.dataset.service = U.svc[st.svc] + ' · ' + U.obj[st.obj] + (keep.service ? ' (' + keep.service + ')' : '');
      f.requestSubmit();
    }
    sb.addEventListener('click', send);
    syncSvc();
    go(0);
  }

  var me = d.currentScript, CSS = me && me.src ? me.src.replace(/quiz\.v1\.js(\?v=(\w+))?.*$/, 'quiz.v1.css') : '';
  /* <script src="/assets/quiz.v1.js" data-quiz-obj="kv" data-quiz-svc="rem" defer> (tools/site/quiz.py) — секція квізу перед самим тегом:
     заголовок і заготовку будує JS (бюджет HTML лендингу 64 КБ), кроки — ліниво. */
  function mount() {
    if (!me || !me.hasAttribute('data-quiz-obj') || !me.parentNode) return;
    var sec = el('section', 'qz-s'), w = el('div', 'w qz-w'), h = el('h2', 'qz-h', t.h), box = el('div', 'qz');
    sec.id = 'kalkulyator'; h.id = 'qzH'; sec.setAttribute('aria-labelledby', 'qzH');
    box.setAttribute('data-quiz', ''); box.dataset.obj = me.getAttribute('data-quiz-obj'); box.dataset.svc = me.getAttribute('data-quiz-svc') || ''; if (me.getAttribute('data-css')) box.dataset.css = me.getAttribute('data-css');
    w.appendChild(h); w.appendChild(el('p', 'qz-lead', t.p)); w.appendChild(box); sec.appendChild(w);
    me.parentNode.insertBefore(sec, me);
  }
  /* кроки будуємо лише після quiz.v1.css (CLS: без стилів кроки вищі за резерв .qz 360 px у site-chrome.v1.css і стрибають) */
  function css(root, done) {
    var href = root.dataset.css || CSS, l = d.querySelector('link[data-qz]');
    if (!href) return done();
    if (l) { if (l.sheet || l.dataset.ok) done(); else { l.addEventListener('load', done); l.addEventListener('error', done); } return; }
    l = d.createElement('link'); l.rel = 'stylesheet'; l.href = href; l.setAttribute('data-qz', '');
    var fin = function () { l.dataset.ok = '1'; done(); }; l.onload = fin; l.onerror = fin; d.head.appendChild(l);
  }
  function init() {
    mount();
    var left = [].slice.call(d.querySelectorAll('[data-quiz]')); if (!left.length) return;
    var start = function (r) { if (r.dataset.qzw) return; r.dataset.qzw = '1'; css(r, function () { build(r); }); };
    // ліниво: коли блок ближче ніж 600 px до екрана (IntersectionObserver + запасна перевірка на scroll/resize)
    var near = function (r) { var b = r.getBoundingClientRect(); return b.bottom > -600 && b.top < (window.innerHeight || 800) + 600; };
    var io = 'IntersectionObserver' in window ? new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) check(); });
    }, { rootMargin: '600px 0px' }) : null;
    function check() {
      left = left.filter(function (r) { if (r.dataset.ready) return false; if (near(r)) { if (io) io.unobserve(r); start(r); return false; } return true; });
      if (!left.length) { removeEventListener('scroll', check); removeEventListener('resize', check); }
    }
    if (io) left.forEach(function (r) { io.observe(r); });
    addEventListener('scroll', check, { passive: true }); addEventListener('resize', check, { passive: true });
    check();
  }
  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', init); else init();
})();
