/* CAS Development — квіз-калькулятор «4 кроки → телефон»: ядро (кроки, розрахунок, надсилання). UI-kit /styleguide/#quiz.
   Вантажить його /assets/quiz.v1.js (легкий завантажувач: секція з заголовком — на DOMContentLoaded), коли блок квізу ближче ~1.5 екрана
   (18.11.2026: раніше весь квіз вантажився й виконувався одразу, хоч стоїть унизу сторінки). Кроки будує window.casQuiz(root) — після quiz.v1.css.
   Орієнтир «від» — лише за ставками з CLAUDE.md (rates-блок нижче, tools/site/rates.py), перемикач «Україна / Європа» як у калькуляторі
   (Михайло 17.11.2026): типово uk/ru — Україна, інші мови — Європа (data-reg="0|1" на заготовці — примусово). Україна: дизайн $30/м²
   (мін. $2 500), ремонт $550/м², офіс $350/м², меблювання $250/м², будівництво $600/м², під ключ $1 100/м²; Європа: дизайн $45/м²
   (мін. $4 000), ремонт $850/м², меблювання $400/м², будівництво $900/м², під ключ $1 700/м², офіс — за кошторисом.
   Комерційний ремонт — індивідуально (окремої ставки немає). Регіон іде в заявку (data-service і #oMsg).
   Надсилання — ЛИШЕ через спільну форму form#of і /assets/lead-form.v1.js (одна заявка на сторінку): квіз кладе телефон у #oPhone,
   площу в #oArea, відповіді — у #oMsg (українською, для менеджера), data-form="quiz", і викликає form.requestSubmit().
   Успіх — лише після події cas:lead (lead-form шле її після 2xx), помилку дзеркалимо з #oErr. Clarity: quiz_step; lead_submit — lead-form.
   data-demo — режим для /styleguide/: нічого не надсилає. */
(function () {
  /*rates*/ /* ЗГЕНЕРОВАНО tools/site/rates.py — ставки CLAUDE.md [Україна, Європа], null — за кошторисом; руками не правити */
var CAS_RATES = {"reno":[550,850],"office":[350,null],"box":[600,900],"key":[1100,1700],"arch":[12,18],"land":[50,null],"furn":[250,400],"plan":[6,null],"dz":[30,45],"full":[45,null]}, CAS_DMIN = [2500, 4000], CAS_DZ = ["plan", "dz", "full"],
  CAS_HT = {"brick":{"box":[450,700],"key":[1100,1700]},"frame":{"box":[350,550],"key":[950,1500]},"lstk":{"box":[450,700],"key":[1150,1800]},"sip":{"box":[300,450],"key":[750,1200]},"sandwich":{"box":[250,400],"key":[450,700]},"modular":{"box":[300,450],"key":[750,1200]},"timber":{"box":[250,400],"key":[550,850]}}; /* типи будинку: свої ставки коробки / під ключ */
/* ставка регіону: тип будинку t (CAS_HT) замінює ставки коробки / під ключ своїми — і null теж; без типу чи з невідомим — CAS_RATES */
function casRate(k, R, t) { var h = t && Object.prototype.hasOwnProperty.call(CAS_HT, t) ? CAS_HT[t] : null, r = h && Object.prototype.hasOwnProperty.call(h, k) ? h[k] : CAS_RATES[k], v = r ? r[R ? 1 : 0] : null; return typeof v === 'number' ? v : null; }
/* сума рядка: ставка × площа (дизайн — не менше мінімуму), округлена; null — ставки немає (за кошторисом) або площа ≤ 0; t — тип будинку */
function casCost(k, R, a, t) { var i = R ? 1 : 0, v = casRate(k, R, t); if (v == null || !(a > 0) || !isFinite(a)) return null; var s = v * a; if (CAS_DZ.indexOf(k) >= 0) s = Math.max(s, CAS_DMIN[i]); return Math.round(s); }
/* число з поля вводу: кома або крапка, пробіли між тисячами; NaN — не число */
function casParseNum(s) { s = String(s == null ? '' : s).replace(/[\s\u00a0\u202f]/g, '').replace(',', '.'); return /^[-+]?(\d+\.?\d*|\.\d+)$/.test(s) ? +s : NaN; }
/*/rates*/
  var d = document, lang = (d.documentElement.lang || 'uk').slice(0, 2).toLowerCase();
  var L = {
    uk: { reg: 'Де обʼєкт', rg: ['Україна', 'Європа'], ne: 'Європа: ставки приблизно на 50% вищі за київські.',
      step: 'Крок {n} з {t}', next: 'Далі', back: 'Назад', again: 'Змінити відповіді',
      q: ['Що за обʼєкт?', 'Яка послуга потрібна?', 'Яка площа?', 'Коли плануєте почати?'],
      obj: { kv: 'Квартира', dim: 'Будинок', kom: 'Комерція', of: 'Офіс' },
      svc: { dyz: 'Дизайн-проєкт', rem: 'Ремонт', bud: 'Будівництво', meb: 'Меблювання', kl: 'Під ключ' },
      when: { now: 'Якнайшвидше', m3: 'Протягом 1–3 місяців', m6: 'Через 3–6 місяців', calc: 'Поки рахую бюджет' },
      area: 'Площа, м²', m2: 'м²', est: 'Орієнтовно', from: 'від', ind: 'Розрахуємо індивідуально',
      line: { dyz: 'дизайн-проєкт', rem: 'ремонт', of: 'ремонт офісу', bud: 'будівництво', meb: 'меблювання', kl: 'будинок під ключ' },
      min: 'мін. {m}',
      note: { rem: 'Ремонт від {r}/м² — роботи й чорнові матеріали; чистові матеріали, меблі й техніка — окремо, за кошторисом.',
        of: 'Офіс від {r}/м² — роботи й чорнові матеріали.', kom: 'Для комерційних приміщень окремої ставки немає — рахуємо за кошторисом.' },
      disc: 'Це орієнтир за базовими ставками студії. Точну суму фіксуємо в кошторисі після заміру.',
      phone: 'Телефон для розрахунку *', ph: '+380 97 123 45 67', send: 'Отримати розрахунок', sending: 'Надсилаємо…',
      tip: 'Перетелефонуємо найближчим часом. Консультація по телефону — безкоштовна.',
      empty: 'Вкажіть номер телефону — ми передзвонимо.', bad: 'Перевірте номер: потрібно щонайменше 9 цифр, напр. 097 123 45 67.',
      fail: 'Не вдалося надіслати. Подзвоніть або напишіть: +380 97 866 77 55.', ok: 'Дякуємо. Перетелефонуємо найближчим часом і уточнимо розрахунок.',
      demo: 'Демо: заявку не надіслано.' },
    ru: { reg: 'Где объект', rg: ['Украина', 'Европа'], ne: 'Европа: ставки примерно на 50% выше киевских.',
      step: 'Шаг {n} из {t}', next: 'Далее', back: 'Назад', again: 'Изменить ответы',
      q: ['Какой объект?', 'Какая услуга нужна?', 'Какая площадь?', 'Когда планируете начать?'],
      obj: { kv: 'Квартира', dim: 'Дом', kom: 'Коммерция', of: 'Офис' },
      svc: { dyz: 'Дизайн-проект', rem: 'Ремонт', bud: 'Строительство', meb: 'Меблировка', kl: 'Под ключ' },
      when: { now: 'Как можно скорее', m3: 'В течение 1–3 месяцев', m6: 'Через 3–6 месяцев', calc: 'Пока считаю бюджет' },
      area: 'Площадь, м²', m2: 'м²', est: 'Ориентировочно', from: 'от', ind: 'Рассчитаем индивидуально',
      line: { dyz: 'дизайн-проект', rem: 'ремонт', of: 'ремонт офиса', bud: 'строительство', meb: 'меблировка', kl: 'дом под ключ' },
      min: 'мин. {m}',
      note: { rem: 'Ремонт от {r}/м² — работы и черновые материалы; чистовые материалы, мебель и техника — отдельно, по смете.',
        of: 'Офис от {r}/м² — работы и черновые материалы.', kom: 'Для коммерческих помещений отдельной ставки нет — считаем по смете.' },
      disc: 'Это ориентир по базовым ставкам студии. Точную сумму фиксируем в смете после замера.',
      phone: 'Телефон для расчёта *', ph: '+380 97 123 45 67', send: 'Получить расчёт', sending: 'Отправляем…',
      tip: 'Перезвоним в ближайшее время. Консультация по телефону — бесплатная.',
      empty: 'Укажите номер телефона — мы перезвоним.', bad: 'Проверьте номер: нужно не меньше 9 цифр, напр. 097 123 45 67.',
      fail: 'Не удалось отправить. Позвоните или напишите: +380 97 866 77 55.', ok: 'Спасибо. Перезвоним в ближайшее время и уточним расчёт.',
      demo: 'Демо: заявка не отправлена.' },
    en: { reg: 'Project location', rg: ['Ukraine', 'Europe'], ne: 'Europe: rates are about 50% higher than in Kyiv.',
      step: 'Step {n} of {t}', next: 'Next', back: 'Back', again: 'Change answers',
      q: ['What is the property?', 'Which service do you need?', 'What is the area?', 'When do you plan to start?'],
      obj: { kv: 'Apartment', dim: 'House', kom: 'Commercial', of: 'Office' },
      svc: { dyz: 'Design project', rem: 'Renovation', bud: 'Construction', meb: 'Furnishing', kl: 'Turnkey' },
      when: { now: 'As soon as possible', m3: 'Within 1–3 months', m6: 'In 3–6 months', calc: 'Still planning the budget' },
      area: 'Area, m²', m2: 'm²', est: 'Estimate', from: 'from', ind: 'We will price it individually',
      line: { dyz: 'design project', rem: 'renovation', of: 'office renovation', bud: 'construction', meb: 'furnishing', kl: 'turnkey house' },
      min: 'min. {m}',
      note: { rem: 'Renovation from {r}/m² covers labour and rough materials; finishing materials, furniture and appliances are extra, per estimate.',
        of: 'Office from {r}/m² covers labour and rough materials.', kom: 'There is no flat rate for commercial premises — we price them per estimate.' },
      disc: 'This is a guide based on the studio’s base rates. The exact sum is fixed in the estimate after the site survey.',
      phone: 'Phone for the estimate *', ph: '+44 7700 900123', send: 'Get my estimate', sending: 'Sending…',
      tip: 'We will call you back shortly. Phone consultation is free.',
      empty: 'Please enter your phone number — we will call you back.', bad: 'Please check the number: at least 9 digits, with country code.',
      fail: 'We could not send it. Please call or message +380 97 866 77 55.', ok: 'Thank you. We will call you back shortly to refine the estimate.',
      demo: 'Demo: nothing was sent.' },
    es: { reg: 'Ubicación', rg: ['Ucrania', 'Europa'], ne: 'Europa: tarifas aproximadamente un 50% más altas que en Kiev.',
      step: 'Paso {n} de {t}', next: 'Siguiente', back: 'Atrás', again: 'Cambiar respuestas',
      q: ['¿Qué tipo de inmueble?', '¿Qué servicio necesita?', '¿Qué superficie?', '¿Cuándo quiere empezar?'],
      obj: { kv: 'Piso', dim: 'Casa', kom: 'Local comercial', of: 'Oficina' },
      svc: { dyz: 'Proyecto de diseño', rem: 'Reforma', bud: 'Construcción', meb: 'Amueblamiento', kl: 'Llave en mano' },
      when: { now: 'Lo antes posible', m3: 'En 1–3 meses', m6: 'Dentro de 3–6 meses', calc: 'Aún calculo el presupuesto' },
      area: 'Superficie, m²', m2: 'm²', est: 'Orientativo', from: 'desde', ind: 'Lo calculamos de forma individual',
      line: { dyz: 'proyecto de diseño', rem: 'reforma', of: 'reforma de oficina', bud: 'construcción', meb: 'amueblamiento', kl: 'casa llave en mano' },
      min: 'mín. {m}',
      note: { rem: 'Reforma desde {r}/m²: mano de obra y materiales de obra gruesa; los acabados, muebles y electrodomésticos aparte, según presupuesto.',
        of: 'Oficina desde {r}/m²: mano de obra y materiales de obra gruesa.', kom: 'Para locales comerciales no hay tarifa fija: lo calculamos con presupuesto.' },
      disc: 'Es una referencia según las tarifas base del estudio. El importe exacto se fija en el presupuesto tras la medición.',
      phone: 'Teléfono para el cálculo *', ph: '+34 600 123 456', send: 'Recibir el cálculo', sending: 'Enviando…',
      tip: 'Le llamamos en breve. La consulta telefónica es gratuita.',
      empty: 'Indique su número de teléfono y le llamamos.', bad: 'Revise el número: al menos 9 cifras, con prefijo internacional.',
      fail: 'No se pudo enviar. Llame o escriba al +380 97 866 77 55.', ok: 'Gracias. Le llamamos en breve para afinar el cálculo.',
      demo: 'Demo: no se ha enviado nada.' },
    zh: { reg: '项目所在地', rg: ['乌克兰', '欧洲'], ne: '欧洲：单价约比基辅高 50%。',
      step: '第 {n} 步，共 {t} 步', next: '下一步', back: '返回', again: '修改答案',
      q: ['什么类型的物业？', '需要什么服务？', '面积多大？', '计划何时开始？'],
      obj: { kv: '公寓', dim: '住宅', kom: '商业空间', of: '办公室' },
      svc: { dyz: '设计方案', rem: '装修', bud: '建造', meb: '家具配置', kl: '交钥匙' },
      when: { now: '尽快', m3: '1–3 个月内', m6: '3–6 个月后', calc: '仍在规划预算' },
      area: '面积，m²', m2: 'm²', est: '参考价', from: '起', ind: '单独核算',
      line: { dyz: '设计方案', rem: '装修', of: '办公室装修', bud: '建造', meb: '家具配置', kl: '住宅交钥匙' },
      min: '最低 {m}',
      note: { rem: '装修 {r}/m² 起：含人工和基础材料；饰面材料、家具和电器另计，按预算。',
        of: '办公室 {r}/m² 起：含人工和基础材料。', kom: '商业空间没有统一单价，按预算核算。' },
      disc: '这是按工作室基础单价的参考。确切金额在现场测量后的预算中确定。',
      phone: '用于估算的电话 *', ph: '+86 138 0013 8000', send: '获取估算', sending: '发送中…',
      tip: '我们会尽快回电。电话咨询免费。',
      empty: '请填写电话号码，我们会回电。', bad: '请检查号码：至少 9 位数字，含国家区号。',
      fail: '发送失败。请致电或发消息至 +380 97 866 77 55。', ok: '谢谢。我们会尽快回电并细化估算。',
      demo: '演示：未发送任何内容。' },
    pl: { reg: 'Lokalizacja', rg: ['Ukraina', 'Europa'], ne: 'Europa: stawki ok. 50% wyższe niż w Kijowie.',
      step: 'Krok {n} z {t}', next: 'Dalej', back: 'Wstecz', again: 'Zmień odpowiedzi',
      q: ['Jaki to obiekt?', 'Jakiej usługi potrzebujesz?', 'Jaka powierzchnia?', 'Kiedy planujesz start?'],
      obj: { kv: 'Mieszkanie', dim: 'Dom', kom: 'Lokal usługowy', of: 'Biuro' },
      svc: { dyz: 'Projekt wnętrza', rem: 'Remont', bud: 'Budowa', meb: 'Umeblowanie', kl: 'Pod klucz' },
      when: { now: 'Jak najszybciej', m3: 'W ciągu 1–3 miesięcy', m6: 'Za 3–6 miesięcy', calc: 'Na razie liczę budżet' },
      area: 'Powierzchnia, m²', m2: 'm²', est: 'Orientacyjnie', from: 'od', ind: 'Wycenimy indywidualnie',
      line: { dyz: 'projekt wnętrza', rem: 'remont', of: 'remont biura', bud: 'budowa', meb: 'umeblowanie', kl: 'dom pod klucz' },
      min: 'min. {m}',
      note: { rem: 'Remont od {r}/m² — robocizna i materiały budowlane; materiały wykończeniowe, meble i AGD osobno, według kosztorysu.',
        of: 'Biuro od {r}/m² — robocizna i materiały budowlane.', kom: 'Dla lokali usługowych nie ma stałej stawki — liczymy według kosztorysu.' },
      disc: 'To orientacja według stawek bazowych studia. Dokładną kwotę ustalamy w kosztorysie po pomiarze.',
      phone: 'Telefon do wyceny *', ph: '+48 512 345 678', send: 'Otrzymaj wycenę', sending: 'Wysyłamy…',
      tip: 'Oddzwonimy wkrótce. Konsultacja telefoniczna jest bezpłatna.',
      empty: 'Podaj numer telefonu — oddzwonimy.', bad: 'Sprawdź numer: co najmniej 9 cyfr, z numerem kierunkowym kraju.',
      fail: 'Nie udało się wysłać. Zadzwoń lub napisz: +380 97 866 77 55.', ok: 'Dziękujemy. Oddzwonimy wkrótce i doprecyzujemy wycenę.',
      demo: 'Demo: nic nie wysłano.' },
    de: { reg: 'Standort', rg: ['Ukraine', 'Europa'], ne: 'Europa: Sätze rund 50 % über Kyjiw.',
      step: 'Schritt {n} von {t}', next: 'Weiter', back: 'Zurück', again: 'Antworten ändern',
      q: ['Um welches Objekt geht es?', 'Welche Leistung brauchen Sie?', 'Wie groß ist die Fläche?', 'Wann möchten Sie starten?'],
      obj: { kv: 'Wohnung', dim: 'Haus', kom: 'Gewerbe', of: 'Büro' },
      svc: { dyz: 'Designprojekt', rem: 'Sanierung', bud: 'Bau', meb: 'Einrichtung', kl: 'Schlüsselfertig' },
      when: { now: 'So bald wie möglich', m3: 'In 1–3 Monaten', m6: 'In 3–6 Monaten', calc: 'Ich plane noch das Budget' },
      area: 'Fläche, m²', m2: 'm²', est: 'Richtwert', from: 'ab', ind: 'Wir kalkulieren individuell',
      line: { dyz: 'Designprojekt', rem: 'Sanierung', of: 'Büroumbau', bud: 'Bau', meb: 'Einrichtung', kl: 'Haus schlüsselfertig' },
      min: 'mind. {m}',
      note: { rem: 'Sanierung ab {r}/m² — Arbeit und Rohbaumaterial; Ausbaumaterialien, Möbel und Geräte separat, nach Kostenvoranschlag.',
        of: 'Büro ab {r}/m² — Arbeit und Rohbaumaterial.', kom: 'Für Gewerbeflächen gibt es keinen Pauschalsatz — wir kalkulieren nach Kostenvoranschlag.' },
      disc: 'Das ist ein Richtwert nach den Basissätzen des Studios. Die genaue Summe steht im Kostenvoranschlag nach dem Aufmaß.',
      phone: 'Telefon für die Kalkulation *', ph: '+49 151 23456789', send: 'Kalkulation erhalten', sending: 'Wird gesendet…',
      tip: 'Wir rufen Sie in Kürze zurück. Die telefonische Beratung ist kostenlos.',
      empty: 'Bitte geben Sie Ihre Telefonnummer an — wir rufen zurück.', bad: 'Bitte prüfen Sie die Nummer: mindestens 9 Ziffern, mit Ländervorwahl.',
      fail: 'Senden fehlgeschlagen. Rufen Sie an oder schreiben Sie: +380 97 866 77 55.', ok: 'Danke. Wir rufen Sie in Kürze zurück und präzisieren die Kalkulation.',
      demo: 'Demo: nichts gesendet.' },
    fr: { reg: 'Localisation', rg: ['Ukraine', 'Europe'], ne: 'Europe : tarifs environ 50 % plus élevés qu’à Kyiv.',
      step: 'Étape {n} sur {t}', next: 'Suivant', back: 'Retour', again: 'Modifier les réponses',
      q: ['Quel type de bien ?', 'De quel service avez-vous besoin ?', 'Quelle surface ?', 'Quand souhaitez-vous commencer ?'],
      obj: { kv: 'Appartement', dim: 'Maison', kom: 'Local commercial', of: 'Bureau' },
      svc: { dyz: 'Projet de design', rem: 'Rénovation', bud: 'Construction', meb: 'Ameublement', kl: 'Clé en main' },
      when: { now: 'Dès que possible', m3: 'D’ici 1 à 3 mois', m6: 'Dans 3 à 6 mois', calc: 'Je calcule encore le budget' },
      area: 'Surface, m²', m2: 'm²', est: 'Estimation', from: 'à partir de', ind: 'Chiffrage sur mesure',
      line: { dyz: 'projet de design', rem: 'rénovation', of: 'rénovation de bureaux', bud: 'construction', meb: 'ameublement', kl: 'maison clé en main' },
      min: 'min. {m}',
      note: { rem: 'Rénovation à partir de {r}/m² : main-d’œuvre et matériaux de gros œuvre ; finitions, mobilier et électroménager en sus, sur devis.',
        of: 'Bureau à partir de {r}/m² : main-d’œuvre et matériaux de gros œuvre.', kom: 'Pas de tarif forfaitaire pour les locaux commerciaux : chiffrage sur devis.' },
      disc: 'C’est un repère selon les tarifs de base du studio. Le montant exact est fixé dans le devis après le relevé.',
      phone: 'Téléphone pour le chiffrage *', ph: '+33 6 12 34 56 78', send: 'Recevoir le chiffrage', sending: 'Envoi…',
      tip: 'Nous vous rappelons rapidement. La consultation téléphonique est gratuite.',
      empty: 'Indiquez votre numéro de téléphone : nous vous rappelons.', bad: 'Vérifiez le numéro : au moins 9 chiffres, avec l’indicatif du pays.',
      fail: 'Envoi impossible. Appelez ou écrivez au +380 97 866 77 55.', ok: 'Merci. Nous vous rappelons rapidement pour affiner le chiffrage.',
      demo: 'Démo : rien n’a été envoyé.' },
    pt: { reg: 'Localização', rg: ['Ucrânia', 'Europa'], ne: 'Europa: tarifas cerca de 50% mais altas do que em Kyiv.',
      step: 'Passo {n} de {t}', next: 'Seguinte', back: 'Voltar', again: 'Alterar respostas',
      q: ['Que tipo de imóvel?', 'De que serviço precisa?', 'Qual é a área?', 'Quando quer começar?'],
      obj: { kv: 'Apartamento', dim: 'Moradia', kom: 'Espaço comercial', of: 'Escritório' },
      svc: { dyz: 'Projeto de design', rem: 'Remodelação', bud: 'Construção', meb: 'Mobiliário', kl: 'Chave na mão' },
      when: { now: 'O mais depressa possível', m3: 'Dentro de 1–3 meses', m6: 'Daqui a 3–6 meses', calc: 'Ainda estou a calcular o orçamento' },
      area: 'Área, m²', m2: 'm²', est: 'Indicativo', from: 'a partir de', ind: 'Calculamos caso a caso',
      line: { dyz: 'projeto de design', rem: 'remodelação', of: 'remodelação de escritório', bud: 'construção', meb: 'mobiliário', kl: 'moradia chave na mão' },
      min: 'mín. {m}',
      note: { rem: 'Remodelação a partir de {r}/m²: mão de obra e materiais de obra bruta; acabamentos, móveis e eletrodomésticos à parte, segundo orçamento.',
        of: 'Escritório a partir de {r}/m²: mão de obra e materiais de obra bruta.', kom: 'Para espaços comerciais não há tarifa fixa: calculamos com orçamento.' },
      disc: 'É uma referência segundo as tarifas base do estúdio. O valor exato é fixado no orçamento após a medição.',
      phone: 'Telefone para o cálculo *', ph: '+351 912 345 678', send: 'Receber o cálculo', sending: 'A enviar…',
      tip: 'Ligamos-lhe em breve. A consulta por telefone é gratuita.',
      empty: 'Indique o seu número de telefone: ligamos-lhe.', bad: 'Verifique o número: pelo menos 9 dígitos, com o indicativo do país.',
      fail: 'Não foi possível enviar. Ligue ou escreva para +380 97 866 77 55.', ok: 'Obrigado. Ligamos-lhe em breve para afinar o cálculo.',
      demo: 'Demo: nada foi enviado.' },
    ar: { reg: 'موقع المشروع', rg: ['أوكرانيا', 'أوروبا'], ne: 'أوروبا: الأسعار أعلى بنحو 50% من كييف.',
      step: 'الخطوة {n} من {t}', next: 'التالي', back: 'رجوع', again: 'تعديل الإجابات',
      q: ['ما نوع العقار؟', 'ما الخدمة المطلوبة؟', 'ما المساحة؟', 'متى تخطط للبدء؟'],
      obj: { kv: 'شقة', dim: 'منزل', kom: 'محل تجاري', of: 'مكتب' },
      svc: { dyz: 'مشروع تصميم', rem: 'تجديد', bud: 'بناء', meb: 'تأثيث', kl: 'تسليم مفتاح' },
      when: { now: 'في أقرب وقت', m3: 'خلال 1–3 أشهر', m6: 'بعد 3–6 أشهر', calc: 'ما زلت أحسب الميزانية' },
      area: 'المساحة، م²', m2: 'م²', est: 'تقديريًا', from: 'من', ind: 'نحسبها بشكل فردي',
      line: { dyz: 'مشروع تصميم', rem: 'تجديد', of: 'تجديد مكتب', bud: 'بناء', meb: 'تأثيث', kl: 'منزل تسليم مفتاح' },
      min: 'حد أدنى {m}',
      note: { rem: 'التجديد من {r}/م²: الأعمال والمواد الأساسية؛ ومواد التشطيب والأثاث والأجهزة منفصلة وفق المقايسة.',
        of: 'المكتب من {r}/م²: الأعمال والمواد الأساسية.', kom: 'لا يوجد سعر ثابت للمحلات التجارية: نحسبها وفق المقايسة.' },
      disc: 'هذا مؤشر وفق الأسعار الأساسية للاستوديو. يُحدَّد المبلغ الدقيق في المقايسة بعد القياس.',
      phone: 'الهاتف للحساب *', ph: '+971 50 123 4567', send: 'احصل على الحساب', sending: 'جارٍ الإرسال…',
      tip: 'سنتصل بك قريبًا. الاستشارة الهاتفية مجانية.',
      empty: 'أدخل رقم هاتفك وسنتصل بك.', bad: 'تحقق من الرقم: 9 أرقام على الأقل مع رمز الدولة.',
      fail: 'تعذّر الإرسال. اتصل أو راسلنا: ‎+380 97 866 77 55.', ok: 'شكرًا. سنتصل بك قريبًا لتدقيق الحساب.',
      demo: 'عرض تجريبي: لم يُرسل شيء.' }
  };
  var t = L[lang] || L.uk, U = L.uk;
  var UA = lang === 'uk' || lang === 'ru';
  /* ставки — CAS_RATES/casCost з rates-блоку вгорі (tools/site/rates.py); регіон R: 0 — Україна, 1 — Європа (типово за мовою) */
  var RATE = { dyz: 'dz', rem: 'reno', of: 'office', meb: 'furn', bud: 'box', kl: 'key' };
  var SVC = ['dyz', 'rem', 'bud', 'meb', 'kl'], OBJ = ['kv', 'dim', 'kom', 'of'], WHEN = ['now', 'm3', 'm6', 'calc'];
  var DEF_AREA = { kv: 70, dim: 150, kom: 120, of: 150 };
  var DEF_REG = UA ? 0 : 1; // Михайло 17.11.2026: uk/ru — Україна, en/es/pl/de/fr/pt/zh/ar — Європа

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
  function estimate(o, s, a, R) {
    var lines = [], notes = [], i = R ? 1 : 0;
    var rt = function (k) { return money(CAS_RATES[k][i]) + '/' + t.m2; };
    // рядок за ключем ставки; немає ставки в регіоні — «індивідуально» (v: null)
    var ln = function (k, rk, x) { return CAS_RATES[rk][i] == null ? { k: k, v: null } : { k: k, v: casCost(rk, i, a), r: rt(rk) + (x || '') }; };
    var dz = function () { lines.push(ln('dyz', RATE.dyz, ', ' + t.min.replace('{m}', money(CAS_DMIN[i])))); };
    var rm = function () {
      if (o === 'kom') { lines.push({ k: 'rem', v: null }); notes.push(t.note.kom); }
      else if (o === 'of') { var l = ln('of', RATE.of); lines.push(l); if (l.r) notes.push(t.note.of.replace('{r}', money(CAS_RATES[RATE.of][i]))); }
      else { lines.push(ln('rem', RATE.rem)); notes.push(t.note.rem.replace('{r}', money(CAS_RATES[RATE.rem][i]))); }
    };
    var mb = function () { lines.push(ln('meb', RATE.meb)); };
    if (s === 'dyz') dz();
    else if (s === 'rem') rm();
    else if (s === 'meb') mb();
    else if (s === 'bud') lines.push(o === 'dim' ? ln('bud', RATE.bud) : { k: 'bud', v: null });
    else if (s === 'kl') {
      if (o === 'dim') lines.push(ln('kl', RATE.kl));
      else { dz(); rm(); mb(); }
    }
    if (R) notes.push(t.ne);
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
      area: 0, when: '', reg: root.dataset.reg === '0' || root.dataset.reg === '1' ? +root.dataset.reg : DEF_REG };
    var TOTAL = 4, cur = 0, first = true, areaSet = false;
    root.textContent = '';
    var head = el('div', 'qz-hd'), prog = el('p', 'qz-pg'), bar = el('div', 'qz-bar'), fill = el('i');
    prog.id = id + 'pg'; prog.setAttribute('aria-live', 'polite');
    bar.setAttribute('aria-hidden', 'true'); bar.appendChild(fill);
    // регіон «Україна / Європа» — на виду на всіх кроках (як у калькуляторі); нативні радіо: стрілки, Tab, підпис групи
    var rgw = el('div', 'qz-rg'), rgl = el('span', 'qz-rl', t.reg); rgl.id = id + 'rl';
    rgw.setAttribute('role', 'radiogroup'); rgw.setAttribute('aria-labelledby', rgl.id);
    [0, 1].forEach(function (r) {
      var lb = el('label', 'qz-ro'), inp = el('input'); inp.type = 'radio'; inp.name = id + 'r'; inp.value = String(r); inp.checked = st.reg === r;
      inp.addEventListener('change', function () { if (!inp.checked) return; st.reg = r; root.dataset.region = r ? 'eu' : 'ua'; if (cur === TOTAL) render(); clarity('quiz_region', r ? 'eu' : 'ua'); });
      lb.appendChild(inp); lb.appendChild(el('span', '', t.rg[r])); rgw.appendChild(lb);
    });
    root.dataset.region = st.reg ? 'eu' : 'ua';
    var hr = el('div', 'qz-hr'), rgb = el('div', 'qz-rb'); rgb.appendChild(rgl); rgb.appendChild(rgw);
    hr.appendChild(prog); hr.appendChild(rgb); head.appendChild(hr); head.appendChild(bar); root.appendChild(head);
    var steps = [], body = el('div', 'qz-bd'); root.appendChild(body);

    function radios(i, name, keys, labels, key) {
      var fs = el('fieldset', 'qz-st'), lg = el('legend', 'qz-q', t.q[i]); lg.tabIndex = -1; fs.appendChild(lg);
      var grid = el('div', 'qz-os');
      keys.forEach(function (k) {
        var lb = el('label', 'qz-o'), inp = el('input'); inp.type = 'radio'; inp.name = id + name; inp.value = k;
        if (st[key] === k) inp.checked = true;
        inp.addEventListener('change', function () { st[key] = k; if (key === 'obj') syncSvc(); navState(); });
        // мишею/дотиком — одразу далі; клавіатурою (стрілки) — лише вибір, далі кнопкою
        // Safari: клік, який мітка передає в радіо, має detail 0 (Chrome — 1) — тож ловимо сам клік по мітці/радіо (detail > 0), один раз
        var tm = 0;
        lb.addEventListener('click', function (e) { if (e.detail > 0 && !tm) tm = setTimeout(function () { tm = 0; if (inp.checked) go(i + 1); }, 160); });
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
    nb.type = 'text'; nb.inputMode = 'decimal'; nb.autocomplete = 'off'; nb.setAttribute('pattern', '[0-9 .,]*'); nb.id = id + 'a'; nl.htmlFor = nb.id;
    function setArea(v, from) {
      v = casParseNum(v); v = isFinite(v) ? Math.min(20000, Math.max(0, Math.round(v))) : 0; st.area = v; if (from) areaSet = true;
      if (from !== rg) rg.value = Math.min(1000, Math.max(10, v));
      var pv = casParseNum(nb.value); if (from !== nb || pv > 20000 || pv < 0) nb.value = v;
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
      var e = estimate(st.obj, st.svc, st.area, st.reg);
      rh.textContent = t.est + ': ' + (e.sum != null ? t.from + ' ' + money(e.sum) + (window.casFx ? window.casFx(e.sum, lang) : '') : t.ind); /* ≈ €/₴ — fx.py */
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
      var parts = ['Квіз: ' + U.obj[st.obj], U.svc[st.svc], st.area + ' м²', 'регіон: ' + U.rg[st.reg], 'старт: ' + U.when[st.when]];
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
      var keep = { form: f.dataset.form, service: f.dataset.service, source: f.dataset.source, area: oA ? oA.value : '', msg: oM ? oM.value : '', phone: oP.value };
      var e = estimate(st.obj, st.svc, st.area, st.reg), done = false, mo;
      sb.disabled = true; sb.textContent = t.sending;
      function restore() {
        if (mo) mo.disconnect(); d.removeEventListener('cas:lead', onLead);
        f.dataset.form = keep.form || 'landing'; f.dataset.service = keep.service || ''; if (keep.source != null) f.dataset.source = keep.source;
        if (oA) oA.value = keep.area; if (oM) oM.value = keep.msg; oP.value = keep.phone;
      }
      function onLead(ev) {
        if (done || !ev.detail || ev.detail.form !== 'quiz') return; done = true; restore();
        steps.forEach(function (s) { s.hidden = true; }); nav.hidden = true; head.hidden = true; root.classList.add('qz-done');
        if (window.casLeadAfter) window.casLeadAfter(ok); // години відповіді + Telegram (lead-form.v1.js)
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
      f.dataset.form = 'quiz'; f.dataset.source = (keep.source || location.host + location.pathname).replace(/#.*$/, '') + '#quiz';
      f.dataset.service = U.svc[st.svc] + ' · ' + U.obj[st.obj] + ' · ' + U.rg[st.reg] + (keep.service ? ' (' + keep.service + ')' : '');
      f.requestSubmit();
    }
    sb.addEventListener('click', send);
    syncSvc();
    go(0);
  }
  window.casQuiz = build;
})();
