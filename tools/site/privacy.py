"""Розділ «Cookies та аналітика» в політиці конфіденційності 10 мов (Михайло 22.11.2026: «роби покращення» після SEO-розбору).

Сторінки політики — ручні HTML (шапку/футер ставить chrome.py); цей скрипт лише вставляє/оновлює блок <!--ck-->…<!--/ck-->
перед третім <h2> («Навіщо» й відповідники) і дату «Оновлено …». Ідемпотентно. Якір #cookies — посилання «Cookies» у футері
(chrome.footer) без JS і «Детальніше» на плашці згоди (site-chrome.v1.js).
Факти — за кодом (22.11.2026): cookies cas_s / cas_pl (functions/_lib.js), cas_lang (kabinet-i18n.v1.js); localStorage cas_ck,
casScHint, обране й налаштування кабінету; sessionStorage cas_rh (lead-form.v1.js / site-chrome.v1.js);
чат на сайті (23.11.2026, assets/chat.v1.js): localStorage cas_chat — sid і токен розмови, sessionStorage cas_chat — режим перевірки ?chat=1
(речення про сховище в абзаці localStorage і окремий абзац «Чат на сайті» 10 мовами — 23.11.2026, з чернетки tools/chat/privacy-draft.md, звірено з functions/_chat.js: повідомлення, файли, мова, сторінка, ref_host, хеш IP, 30/14 діб, без cookie); Clarity — chrome.CLARITY (для всіх після першої дії; відмова — «Відхилити» / «Cookies», Михайло 22.11.2026).
Запуск: python3 tools/site/privacy.py (у build-all перед terms.py), --check — код 1, якщо щось змінилося б.
"""
import os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

PAGES = {
    'uk': 'konfidentsiinist.html', 'ru': 'ru/konfidentsialnost.html', 'en': 'en/privacy-policy.html', 'es': 'es/privacidad.html',
    'pl': 'pl/polityka-prywatnosci.html', 'de': 'de/datenschutz.html', 'fr': 'fr/confidentialite.html', 'pt': 'pt/privacidade.html',
    'zh': 'zh/privacy.html', 'ar': 'ar/privacy.html',
}

C = lambda x: f'<code>{x}</code>'  # noqa: E731
CK = {
    'uk': ('Оновлено 23 листопада 2026 року', 'Cookies та аналітика', [
        f'Рекламних cookies сайт не ставить. Необхідні cookies — лише в особистому кабінеті: сесія входу ({C("cas_s")}), тимчасовий {C("cas_pl")} під час входу за номером телефону й мова кабінету ({C("cas_lang")}).',
        f'У сховищі браузера (localStorage, sessionStorage) сайт тримає ваш вибір щодо аналітики ({C("cas_ck")}), позначку, що підказку сцени вже показано, обране й налаштування кабінету, а на час відвідування — домен сайту, з якого ви прийшли ({C("cas_rh")}). Якщо ви пишете в чат на сайті, браузер зберігає ідентифікатор і ключ розмови ({C("cas_chat")}), щоб її можна було продовжити після перезавантаження сторінки; cookies чат не ставить.',
        'Аналітика — Microsoft Clarity: записує, як користуються сторінками (кліки, прокрутку, переходи), ставить власні cookies; дані обробляє Microsoft. Clarity вмикається після першої дії на сайті. Відмовитися можна кнопкою «Відхилити» в повідомленні про cookies (його бачать відвідувачі поза Україною — визначаємо за часовим поясом пристрою) або посиланням «Cookies» унизу сторінки: тоді Clarity більше не завантажується, а його cookies видаляються.',
        'Із форми заявки зберігаємо те, що ви надіслали, адресу сторінки, з якої її надіслано, і домен сайту, з якого ви прийшли (наприклад, google.com — без адреси сторінки). Ці дані не продаємо й не передаємо третім особам, крім обробників, названих нижче.',

        '<strong>Чат на сайті.</strong> У чаті вам відповідає AI-помічник студії, за потреби — менеджер. Ми зберігаємо повідомлення, файли й голосові, які ви надіслали, мову й сторінку, з якої ви почали розмову, і домен сайту, з якого ви прийшли; їх бачать працівники студії, які ведуть розмови. Імʼя й номер телефону — лише якщо ви самі їх залишили: тоді розмова стає заявкою й зберігається разом із нею. IP-адресу не зберігаємо, лише її хеш для захисту від спаму. Розмову без заявки видаляємо через 30 днів після останнього повідомлення, файли без заявки — через 14 днів. Файли розмови із заявкою — через 180 днів. Якщо ви надіслали голосове, помічник може відповісти голосом: для цього текст відповіді обробляє сторонній сервіс синтезу мовлення (Google). Розрахунок у чаті попередній; точна вартість — після заміру й кошторису.',
    ]),
    'ru': ('Обновлено 23 ноября 2026 года', 'Cookies и аналитика', [
        f'Рекламных cookies сайт не ставит. Необходимые cookies — только в личном кабинете: сессия входа ({C("cas_s")}), временный {C("cas_pl")} во время входа по номеру телефона и язык кабинета ({C("cas_lang")}).',
        f'В хранилище браузера (localStorage, sessionStorage) сайт держит ваш выбор по аналитике ({C("cas_ck")}), отметку, что подсказка сцены уже показана, избранное и настройки кабинета, а на время посещения — домен сайта, с которого вы пришли ({C("cas_rh")}). Если вы пишете в чат на сайте, браузер хранит идентификатор и ключ разговора ({C("cas_chat")}), чтобы его можно было продолжить после перезагрузки страницы; cookies чат не ставит.',
        'Аналитика — Microsoft Clarity: записывает, как пользуются страницами (клики, прокрутку, переходы), ставит собственные cookies; данные обрабатывает Microsoft. Clarity включается после первого действия на сайте. Отказаться можно кнопкой «Отклонить» в уведомлении о cookies (его видят посетители за пределами Украины — определяем по часовому поясу устройства) или ссылкой «Cookies» внизу страницы: тогда Clarity больше не загружается, а его cookies удаляются.',
        'Из формы заявки сохраняем то, что вы отправили, адрес страницы, с которой её отправили, и домен сайта, с которого вы пришли (например, google.com — без адреса страницы). Эти данные не продаём и не передаём третьим лицам, кроме обработчиков, названных ниже.',

        '<strong>Чат на сайте.</strong> В чате вам отвечает AI-помощник студии, при необходимости — менеджер. Мы храним сообщения, файлы и голосовые, которые вы отправили, язык и страницу, с которой вы начали разговор, и домен сайта, с которого вы пришли; их видят сотрудники студии, которые ведут разговоры. Имя и номер телефона — только если вы сами их оставили: тогда разговор становится заявкой и хранится вместе с ней. IP-адрес не храним, только его хеш для защиты от спама. Разговор без заявки удаляем через 30 дней после последнего сообщения, файлы без заявки — через 14 дней. Файлы разговора с заявкой — через 180 дней. Если вы отправили голосовое, помощник может ответить голосом: для этого текст ответа обрабатывает сторонний сервис синтеза речи (Google). Расчёт в чате предварительный; точная стоимость — после замера и сметы.',
    ]),
    'en': ('Updated 23 November 2026', 'Cookies and analytics', [
        f'The site sets no advertising cookies. Necessary cookies are used only in the client account: the sign-in session ({C("cas_s")}), a temporary {C("cas_pl")} while you sign in with a phone number, and the account language ({C("cas_lang")}).',
        f'In browser storage (localStorage, sessionStorage) the site keeps your analytics choice ({C("cas_ck")}), a note that a scene hint has already been shown, account favourites and settings, and, for the duration of the visit, the domain of the site you came from ({C("cas_rh")}). If you write in the website chat, your browser keeps the conversation identifier and key ({C("cas_chat")}) so that you can continue it after reloading the page; the chat sets no cookies.',
        'Analytics is Microsoft Clarity: it records how pages are used (clicks, scrolling, navigation) and sets its own cookies; the data is processed by Microsoft. Clarity starts after your first action on the site. You can opt out with the “Decline” button in the cookie notice (shown to visitors outside Ukraine, as told by the device’s time zone) or with the “Cookies” link at the bottom of the page: Clarity is then no longer loaded and its cookies are deleted.',
        'From the request form we keep what you sent, the address of the page it was sent from, and the domain of the site you came from (for example google.com, without the page address). We do not sell this data or pass it to third parties other than the processors listed below.',

        '<strong>Website chat.</strong> In the chat you are answered by the studio’s AI assistant and, when needed, by a manager. We store the messages, files and voice messages you send, the language and the page where you started, and the domain of the site you came from; they are seen by the studio staff who handle conversations. Your name and phone number are stored only if you leave them yourself: the conversation then becomes an enquiry and is kept with it. We do not store your IP address, only its hash to protect against spam. A conversation without an enquiry is deleted 30 days after the last message, files without an enquiry after 14 days. Files of a conversation with an enquiry are deleted after 180 days. If you send a voice message, the assistant may reply by voice: to do so, the text of the reply is processed by a third-party speech synthesis service (Google). Estimates in the chat are preliminary; the exact price comes after measurements and a detailed quote.',
    ]),
    'es': ('Actualizado el 23 de noviembre de 2026', 'Cookies y analítica', [
        f'El sitio no instala cookies publicitarias. Las cookies necesarias solo se usan en el área de cliente: la sesión de acceso ({C("cas_s")}), una cookie temporal {C("cas_pl")} mientras accede con su número de teléfono y el idioma del área ({C("cas_lang")}).',
        f'En el almacenamiento del navegador (localStorage, sessionStorage) el sitio guarda su elección sobre la analítica ({C("cas_ck")}), una marca de que ya se mostró la pista de la escena, los favoritos y ajustes del área de cliente y, durante la visita, el dominio del sitio del que llegó ({C("cas_rh")}). Si escribe en el chat del sitio, el navegador guarda el identificador y la clave de la conversación ({C("cas_chat")}) para que pueda continuarla tras recargar la página; el chat no instala cookies.',
        'La analítica es Microsoft Clarity: registra cómo se usan las páginas (clics, desplazamiento, navegación) e instala sus propias cookies; los datos los trata Microsoft. Clarity se activa tras su primera acción en el sitio. Puede rechazarla con el botón «Rechazar» del aviso de cookies (lo ven los visitantes de fuera de Ucrania, según la zona horaria del dispositivo) o con el enlace «Cookies» al pie de la página: Clarity deja de cargarse y sus cookies se eliminan.',
        'Del formulario de solicitud guardamos lo que envió, la dirección de la página desde la que lo envió y el dominio del sitio del que llegó (por ejemplo, google.com, sin la dirección de la página). No vendemos estos datos ni los comunicamos a terceros, salvo a los encargados indicados más abajo.',

        '<strong>Chat del sitio.</strong> En el chat le responde el asistente de IA del estudio y, si hace falta, un gestor. Guardamos los mensajes, archivos y mensajes de voz que envía, el idioma y la página donde empezó, y el dominio del sitio del que llegó; los ven los empleados del estudio que atienden las conversaciones. El nombre y el teléfono, solo si usted mismo los deja: entonces la conversación pasa a ser una solicitud y se guarda con ella. No guardamos su dirección IP, solo su hash para protegernos del spam. Una conversación sin solicitud se borra 30 días después del último mensaje; los archivos sin solicitud, a los 14 días. Los archivos de una conversación con solicitud, a los 180 días. Si envía un mensaje de voz, el asistente puede responder con voz: para ello, el texto de la respuesta lo procesa un servicio externo de síntesis de voz (Google). El cálculo del chat es orientativo; el precio exacto, tras la medición y el presupuesto.',
    ]),
    'pl': ('Aktualizacja: 23 listopada 2026 r.', 'Cookies i analityka', [
        f'Strona nie ustawia reklamowych plików cookies. Niezbędne cookies działają tylko w panelu klienta: sesja logowania ({C("cas_s")}), tymczasowy {C("cas_pl")} podczas logowania numerem telefonu i język panelu ({C("cas_lang")}).',
        f'W pamięci przeglądarki (localStorage, sessionStorage) strona przechowuje Twój wybór dotyczący analityki ({C("cas_ck")}), znacznik, że podpowiedź sceny została już pokazana, ulubione i ustawienia panelu, a na czas wizyty — domenę strony, z której przyszedłeś ({C("cas_rh")}). Jeśli piszesz na czacie strony, przeglądarka przechowuje identyfikator i klucz rozmowy ({C("cas_chat")}), aby można ją było kontynuować po odświeżeniu strony; czat nie ustawia plików cookies.',
        'Analityka to Microsoft Clarity: zapisuje, jak korzysta się ze stron (kliknięcia, przewijanie, przejścia), i ustawia własne pliki cookies; dane przetwarza Microsoft. Clarity włącza się po pierwszej czynności na stronie. Możesz z niej zrezygnować przyciskiem „Odrzucam” w komunikacie o cookies (widzą go odwiedzający spoza Ukrainy — ustalamy to po strefie czasowej urządzenia) lub linkiem „Cookies” na dole strony: Clarity przestaje się wtedy ładować, a jego pliki cookies są usuwane.',
        'Z formularza zapytania zapisujemy to, co wysłałeś, adres strony, z której je wysłano, i domenę strony, z której przyszedłeś (np. google.com — bez adresu podstrony). Tych danych nie sprzedajemy ani nie przekazujemy osobom trzecim poza podmiotami przetwarzającymi wymienionymi niżej.',

        '<strong>Czat na stronie.</strong> Na czacie odpowiada asystent AI studia, a w razie potrzeby menedżer. Przechowujemy wysłane wiadomości, pliki i nagrania głosowe, język i stronę, na której zaczęła się rozmowa, oraz domenę strony, z której przyszedłeś; widzą je pracownicy studia, którzy prowadzą rozmowy. Imię i numer telefonu — tylko jeśli sam je zostawisz: wtedy rozmowa staje się zgłoszeniem i jest przechowywana razem z nim. Nie przechowujemy adresu IP, tylko jego skrót do ochrony przed spamem. Rozmowę bez zgłoszenia usuwamy 30 dni po ostatniej wiadomości, pliki bez zgłoszenia — po 14 dniach. Pliki rozmowy ze zgłoszeniem — po 180 dniach. Jeśli wyślesz wiadomość głosową, asystent może odpowiedzieć głosem: w tym celu tekst odpowiedzi przetwarza zewnętrzna usługa syntezy mowy (Google). Wycena na czacie jest wstępna; dokładna — po pomiarze i kosztorysie.',
    ]),
    'de': ('Aktualisiert am 23. November 2026', 'Cookies und Analyse', [
        f'Die Website setzt keine Werbe-Cookies. Notwendige Cookies gibt es nur im Kundenbereich: die Anmeldesitzung ({C("cas_s")}), ein temporäres {C("cas_pl")} während der Anmeldung mit Telefonnummer und die Sprache des Kundenbereichs ({C("cas_lang")}).',
        f'Im Browserspeicher (localStorage, sessionStorage) speichert die Website Ihre Entscheidung zur Analyse ({C("cas_ck")}), einen Vermerk, dass ein Szenen-Hinweis bereits angezeigt wurde, Favoriten und Einstellungen des Kundenbereichs sowie für die Dauer des Besuchs die Domain der Website, von der Sie kamen ({C("cas_rh")}). Wenn Sie im Website-Chat schreiben, speichert Ihr Browser Kennung und Schlüssel des Gesprächs ({C("cas_chat")}), damit Sie es nach dem Neuladen der Seite fortsetzen können; der Chat setzt keine Cookies.',
        'Zur Analyse nutzen wir Microsoft Clarity: Es zeichnet auf, wie Seiten genutzt werden (Klicks, Scrollen, Seitenwechsel), und setzt eigene Cookies; die Daten verarbeitet Microsoft. Clarity startet nach Ihrer ersten Aktion auf der Website. Widersprechen können Sie mit der Schaltfläche „Ablehnen“ im Cookie-Hinweis (er erscheint für Besucher außerhalb der Ukraine, erkannt an der Zeitzone des Geräts) oder über den Link „Cookies“ unten auf der Seite: Clarity wird dann nicht mehr geladen, seine Cookies werden gelöscht.',
        'Aus dem Anfrageformular speichern wir, was Sie gesendet haben, die Adresse der Seite, von der es gesendet wurde, und die Domain der Website, von der Sie kamen (z. B. google.com, ohne Seitenadresse). Wir verkaufen diese Daten nicht und geben sie nicht an Dritte weiter, außer an die unten genannten Auftragsverarbeiter.',

        '<strong>Website-Chat.</strong> Im Chat antwortet Ihnen der KI-Assistent des Studios, bei Bedarf ein Manager. Wir speichern die Nachrichten, Dateien und Sprachnachrichten, die Sie senden, die Sprache und die Seite, auf der Sie begonnen haben, sowie die Domain der Website, von der Sie kamen; sie sehen die Mitarbeiter des Studios, die die Gespräche betreuen. Name und Telefonnummer nur, wenn Sie sie selbst hinterlassen: Dann wird das Gespräch zu einer Anfrage und mit ihr gespeichert. Ihre IP-Adresse speichern wir nicht, nur einen Hash zum Schutz vor Spam. Ein Gespräch ohne Anfrage löschen wir 30 Tage nach der letzten Nachricht, Dateien ohne Anfrage nach 14 Tagen. Dateien eines Gesprächs mit Anfrage nach 180 Tagen. Wenn Sie eine Sprachnachricht senden, kann der Assistent per Sprache antworten: Dafür verarbeitet ein externer Sprachsynthese-Dienst (Google) den Text der Antwort. Die Kalkulation im Chat ist vorläufig; den genauen Preis gibt es nach Aufmaß und Kostenvoranschlag.',
    ]),
    'fr': ('Mis à jour le 23 novembre 2026', 'Cookies et mesure d’audience', [
        f'Le site ne dépose aucun cookie publicitaire. Les cookies nécessaires ne servent que dans l’espace client : la session de connexion ({C("cas_s")}), un cookie temporaire {C("cas_pl")} pendant la connexion par numéro de téléphone et la langue de l’espace ({C("cas_lang")}).',
        f'Dans le stockage du navigateur (localStorage, sessionStorage), le site conserve votre choix concernant la mesure d’audience ({C("cas_ck")}), une marque indiquant que l’astuce de la scène a déjà été affichée, les favoris et réglages de l’espace client et, le temps de la visite, le domaine du site d’où vous venez ({C("cas_rh")}). Si vous écrivez dans le chat du site, votre navigateur conserve l’identifiant et la clé de la conversation ({C("cas_chat")}) afin que vous puissiez la reprendre après avoir rechargé la page ; le chat ne dépose aucun cookie.',
        'La mesure d’audience repose sur Microsoft Clarity : il enregistre l’utilisation des pages (clics, défilement, navigation) et dépose ses propres cookies ; les données sont traitées par Microsoft. Clarity démarre après votre première action sur le site. Vous pouvez vous y opposer avec le bouton « Refuser » du bandeau cookies (affiché aux visiteurs hors d’Ukraine, d’après le fuseau horaire de l’appareil) ou avec le lien « Cookies » en bas de page : Clarity n’est alors plus chargé et ses cookies sont supprimés.',
        'Du formulaire de demande, nous conservons ce que vous avez envoyé, l’adresse de la page d’envoi et le domaine du site d’où vous venez (par exemple google.com, sans l’adresse de la page). Nous ne vendons pas ces données et ne les transmettons à aucun tiers, hormis les sous-traitants cités ci-dessous.',

        '<strong>Chat du site.</strong> Dans le chat, c’est l’assistant IA du studio qui vous répond et, si besoin, un responsable. Nous conservons les messages, fichiers et messages vocaux que vous envoyez, la langue et la page où vous avez commencé, ainsi que le domaine du site d’où vous venez ; ils sont consultés par les membres du studio qui gèrent les conversations. Votre nom et votre numéro de téléphone uniquement si vous les laissez vous-même : la conversation devient alors une demande et est conservée avec elle. Nous ne conservons pas votre adresse IP, seulement son empreinte pour lutter contre le spam. Une conversation sans demande est supprimée 30 jours après le dernier message, les fichiers sans demande après 14 jours. Les fichiers d’une conversation avec demande, après 180 jours. Si vous envoyez un message vocal, l’assistant peut répondre à voix haute : pour cela, le texte de la réponse est traité par un service tiers de synthèse vocale (Google). Le calcul dans le chat est indicatif ; le prix exact vient après le relevé et le devis.',
    ]),
    'pt': ('Atualizado a 23 de novembro de 2026', 'Cookies e análise', [
        f'O site não instala cookies de publicidade. Os cookies necessários existem apenas na área de cliente: a sessão de início de sessão ({C("cas_s")}), um cookie temporário {C("cas_pl")} enquanto entra com o número de telefone e o idioma da área ({C("cas_lang")}).',
        f'No armazenamento do navegador (localStorage, sessionStorage), o site guarda a sua escolha sobre a análise ({C("cas_ck")}), uma marca de que a dica da cena já foi mostrada, os favoritos e definições da área de cliente e, durante a visita, o domínio do site de onde veio ({C("cas_rh")}). Se escrever no chat do site, o navegador guarda o identificador e a chave da conversa ({C("cas_chat")}) para que a possa continuar depois de recarregar a página; o chat não instala cookies.',
        'A análise é feita com o Microsoft Clarity: regista a forma como as páginas são usadas (cliques, deslocamento, navegação) e instala os seus próprios cookies; os dados são tratados pela Microsoft. O Clarity é ativado após a sua primeira ação no site. Pode recusar no botão «Recusar» do aviso de cookies (mostrado a visitantes fora da Ucrânia, segundo o fuso horário do dispositivo) ou na ligação «Cookies» no fundo da página: o Clarity deixa de ser carregado e os seus cookies são apagados.',
        'Do formulário de pedido guardamos o que enviou, o endereço da página a partir da qual foi enviado e o domínio do site de onde veio (por exemplo, google.com, sem o endereço da página). Não vendemos estes dados nem os comunicamos a terceiros, além dos subcontratantes indicados abaixo.',

        '<strong>Chat do site.</strong> No chat responde-lhe o assistente de IA do estúdio e, se necessário, um gestor. Guardamos as mensagens, ficheiros e mensagens de voz que envia, o idioma e a página onde começou e o domínio do site de onde veio; são vistos pelos colaboradores do estúdio que acompanham as conversas. O nome e o número de telefone apenas se os deixar: nesse caso, a conversa passa a ser um pedido e é guardada com ele. Não guardamos o seu endereço IP, apenas o respetivo hash para proteção contra spam. Uma conversa sem pedido é apagada 30 dias após a última mensagem; os ficheiros sem pedido, ao fim de 14 dias. Os ficheiros de uma conversa com pedido, ao fim de 180 dias. Se enviar uma mensagem de voz, o assistente pode responder por voz: para isso, o texto da resposta é tratado por um serviço externo de síntese de voz (Google). O cálculo no chat é indicativo; o preço exato surge após a medição e o orçamento.',
    ]),
    'zh': ('更新于 2026 年 11 月 23 日', 'Cookies 与访问分析', [
        f'本网站不设置任何广告 cookies。必要的 cookies 仅用于客户账户：登录会话（{C("cas_s")}）、用手机号登录期间的临时 {C("cas_pl")}，以及账户语言（{C("cas_lang")}）。',
        f'网站在浏览器存储（localStorage、sessionStorage）中保存：您对访问分析的选择（{C("cas_ck")}）、场景提示已显示过的标记、账户收藏与设置，以及在本次访问期间您来源网站的域名（{C("cas_rh")}）。如果您在网站聊天中发送消息，浏览器会保存对话的标识和密钥（{C("cas_chat")}），以便刷新页面后继续对话；聊天不设置 cookies。',
        '访问分析使用 Microsoft Clarity：记录页面的使用方式（点击、滚动、跳转），并设置其自己的 cookies；数据由 Microsoft 处理。Clarity 在您于网站上首次操作后启用。您可以通过 cookies 提示条中的“拒绝”按钮（向乌克兰境外的访客显示，依据设备时区判断）或页面底部的“Cookies”链接拒绝：此后不再加载 Clarity，并删除其 cookies。',
        '对于咨询表单，我们保存您提交的内容、提交所在页面的地址，以及您来源网站的域名（例如 google.com，不含页面地址）。我们不出售这些数据，也不向下文所列处理方以外的第三方提供。',

        '<strong>网站聊天。</strong>在聊天中由工作室的 AI 助手回答，必要时由经理回答。我们保存您发送的消息、文件和语音、开始对话时的语言和页面，以及您来源网站的域名；负责对话的工作室员工可以查看这些内容。姓名和电话号码仅在您主动留下时保存：此时对话成为咨询申请，并随申请一起保存。我们不保存您的 IP 地址，仅保存其哈希值用于防范垃圾信息。没有申请的对话在最后一条消息 30 天后删除，没有申请的文件在 14 天后删除。有申请的对话中的文件在 180 天后删除。如果您发送语音，助手可能以语音回复：为此，回复文本由第三方语音合成服务（Google）处理。聊天中的计算为初步估算，准确价格以测量和预算为准。',
    ]),
    'ar': ('آخر تحديث: 23 نوفمبر 2026', 'ملفات تعريف الارتباط (Cookies) والتحليلات', [
        f'لا يضع الموقع أي ملفات تعريف ارتباط إعلانية. الملفات الضرورية تُستخدم في حساب العميل فقط: جلسة تسجيل الدخول (<bdi>{C("cas_s")}</bdi>)، وملف مؤقت <bdi>{C("cas_pl")}</bdi> أثناء تسجيل الدخول برقم الهاتف، ولغة الحساب (<bdi>{C("cas_lang")}</bdi>).',
        f'يحفظ الموقع في تخزين المتصفح (localStorage وsessionStorage) اختيارك بشأن التحليلات (<bdi>{C("cas_ck")}</bdi>)، وعلامة بأن تلميح المشهد قد عُرض، والمفضلة وإعدادات الحساب، وطوال مدة الزيارة — نطاق الموقع الذي أتيت منه (<bdi>{C("cas_rh")}</bdi>). إذا كتبت في محادثة الموقع، يحفظ المتصفح معرّف المحادثة ومفتاحها (<bdi>{C("cas_chat")}</bdi>) لتتمكن من متابعتها بعد إعادة تحميل الصفحة، ولا تضع المحادثة ملفات تعريف ارتباط.',
        'التحليلات عبر Microsoft Clarity: يسجّل طريقة استخدام الصفحات (النقرات والتمرير والتنقل) ويضع ملفات تعريف الارتباط الخاصة به، وتعالج Microsoft البيانات. يبدأ Clarity بعد أول إجراء تقوم به على الموقع. يمكنك الرفض بزر «رفض» في إشعار ملفات تعريف الارتباط (يظهر للزوار من خارج أوكرانيا، بحسب المنطقة الزمنية للجهاز) أو برابط «Cookies» أسفل الصفحة: عندها لا يُحمَّل Clarity بعد ذلك وتُحذف ملفات تعريف الارتباط الخاصة به.',
        'من نموذج الطلب نحفظ ما أرسلته، وعنوان الصفحة التي أُرسل منها، ونطاق الموقع الذي أتيت منه (مثل google.com، دون عنوان الصفحة). لا نبيع هذه البيانات ولا ننقلها إلى أطراف ثالثة غير جهات المعالجة المذكورة أدناه.',

        '<strong>محادثة الموقع.</strong> يجيبك في المحادثة مساعد الاستوديو بالذكاء الاصطناعي، وعند الحاجة المدير. نحفظ الرسائل والملفات والرسائل الصوتية التي ترسلها، واللغة والصفحة التي بدأت منها، ونطاق الموقع الذي أتيت منه، ويطّلع عليها موظفو الاستوديو الذين يتولّون المحادثات. الاسم ورقم الهاتف فقط إذا تركتهما بنفسك: عندها تصبح المحادثة طلبًا وتُحفظ معه. لا نحفظ عنوان IP، بل بصمته فقط للحماية من الرسائل المزعجة. نحذف المحادثة التي لا طلب لها بعد 30 يومًا من آخر رسالة، والملفات التي لا طلب لها بعد 14 يومًا. وملفات المحادثة التي لها طلب بعد 180 يومًا. إذا أرسلت رسالة صوتية، فقد يرد المساعد بالصوت: ولهذا تعالج نصَّ الرد خدمةُ تحويل نص إلى كلام تابعة لجهة خارجية (Google). الحساب في المحادثة تقريبي، والسعر الدقيق بعد القياس وإعداد التقدير.',
    ]),
}

BLOCK = re.compile(r'<!--ck-->.*?<!--/ck-->', re.S)
H2 = re.compile(r'<h2[\s>]')


def block(lang):
    _, h, ps = CK[lang]
    return '<!--ck--><h2 id="cookies">' + h + '</h2>' + ''.join(f'<p>{p}</p>' for p in ps) + '<!--/ck-->'


def apply(s, lang):
    date = CK[lang][0]
    norm = lambda x: x.replace('\u00a0', ' ').replace('\u202f', ' ')  # noqa: E731 — нерозривні пробіли ставить chrome.apply()
    cur = BLOCK.search(s)
    if cur and norm(cur.group(0)) == norm(block(lang)):
        return re.sub(r'(<p class="date">)[^<]*(</p>)', lambda m: m.group(1) + date + m.group(2), s, count=1)
    s = BLOCK.sub('', s)
    i = s.find('<main')
    hs = [m.start() for m in H2.finditer(s, i)]
    if len(hs) < 3:
        raise SystemExit(f'privacy.py: {lang}: менше трьох <h2> у <main>')
    s = s[:hs[2]] + block(lang) + s[hs[2]:]
    return re.sub(r'(<p class="date">)[^<]*(</p>)', lambda m: m.group(1) + date + m.group(2), s, count=1)


def main():
    check = '--check' in sys.argv
    bad = []
    for lang, rel in PAGES.items():
        p = os.path.join(ROOT, rel)
        s = open(p, encoding='utf-8').read()
        n = apply(s, lang)
        if n != s:
            bad.append(rel)
            if not check:
                open(p, 'w', encoding='utf-8').write(n)
    print(('Політика (cookies): змінилося б — ' + ', '.join(bad)) if check and bad else f'Політика (cookies): оновлено {len(bad)} з {len(PAGES)}')
    sys.exit(1 if check and bad else 0)


if __name__ == '__main__':
    main()
