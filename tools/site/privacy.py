"""Розділ «Cookies та аналітика» в політиці конфіденційності 10 мов (Михайло 22.11.2026: «роби покращення» після SEO-розбору).

Сторінки політики — ручні HTML (шапку/футер ставить chrome.py); цей скрипт лише вставляє/оновлює блок <!--ck-->…<!--/ck-->
перед третім <h2> («Навіщо» й відповідники) і дату «Оновлено …». Ідемпотентно. Якір #cookies — посилання «Cookies» у футері
(chrome.footer) без JS і «Детальніше» на плашці згоди (site-chrome.v1.js).
Факти — за кодом (22.11.2026): cookies cas_s / cas_pl (functions/_lib.js), cas_lang (kabinet-i18n.v1.js); localStorage cas_ck,
casScHint, обране й налаштування кабінету; sessionStorage cas_rh (lead-form.v1.js / site-chrome.v1.js); Clarity — chrome.CLARITY (для всіх після першої дії; відмова — «Відхилити» / «Cookies», Михайло 22.11.2026).
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
    'uk': ('Оновлено 22 листопада 2026 року', 'Cookies та аналітика', [
        f'Рекламних cookies сайт не ставить. Необхідні cookies — лише в особистому кабінеті: сесія входу ({C("cas_s")}), тимчасовий {C("cas_pl")} під час входу за номером телефону й мова кабінету ({C("cas_lang")}).',
        f'У сховищі браузера (localStorage, sessionStorage) сайт тримає ваш вибір щодо аналітики ({C("cas_ck")}), позначку, що підказку сцени вже показано, обране й налаштування кабінету, а на час відвідування — домен сайту, з якого ви прийшли ({C("cas_rh")}).',
        'Аналітика — Microsoft Clarity: записує, як користуються сторінками (кліки, прокрутку, переходи), ставить власні cookies; дані обробляє Microsoft. Clarity вмикається після першої дії на сайті. Відмовитися можна кнопкою «Відхилити» в повідомленні про cookies (його бачать відвідувачі поза Україною — визначаємо за часовим поясом пристрою) або посиланням «Cookies» унизу сторінки: тоді Clarity більше не завантажується, а його cookies видаляються.',
        'Із форми заявки зберігаємо те, що ви надіслали, адресу сторінки, з якої її надіслано, і домен сайту, з якого ви прийшли (наприклад, google.com — без адреси сторінки). Ці дані не продаємо й не передаємо третім особам, крім обробників, названих нижче.',
    ]),
    'ru': ('Обновлено 22 ноября 2026 года', 'Cookies и аналитика', [
        f'Рекламных cookies сайт не ставит. Необходимые cookies — только в личном кабинете: сессия входа ({C("cas_s")}), временный {C("cas_pl")} во время входа по номеру телефона и язык кабинета ({C("cas_lang")}).',
        f'В хранилище браузера (localStorage, sessionStorage) сайт держит ваш выбор по аналитике ({C("cas_ck")}), отметку, что подсказка сцены уже показана, избранное и настройки кабинета, а на время посещения — домен сайта, с которого вы пришли ({C("cas_rh")}).',
        'Аналитика — Microsoft Clarity: записывает, как пользуются страницами (клики, прокрутку, переходы), ставит собственные cookies; данные обрабатывает Microsoft. Clarity включается после первого действия на сайте. Отказаться можно кнопкой «Отклонить» в уведомлении о cookies (его видят посетители за пределами Украины — определяем по часовому поясу устройства) или ссылкой «Cookies» внизу страницы: тогда Clarity больше не загружается, а его cookies удаляются.',
        'Из формы заявки сохраняем то, что вы отправили, адрес страницы, с которой её отправили, и домен сайта, с которого вы пришли (например, google.com — без адреса страницы). Эти данные не продаём и не передаём третьим лицам, кроме обработчиков, названных ниже.',
    ]),
    'en': ('Updated 22 November 2026', 'Cookies and analytics', [
        f'The site sets no advertising cookies. Necessary cookies are used only in the client account: the sign-in session ({C("cas_s")}), a temporary {C("cas_pl")} while you sign in with a phone number, and the account language ({C("cas_lang")}).',
        f'In browser storage (localStorage, sessionStorage) the site keeps your analytics choice ({C("cas_ck")}), a note that a scene hint has already been shown, account favourites and settings, and, for the duration of the visit, the domain of the site you came from ({C("cas_rh")}).',
        'Analytics is Microsoft Clarity: it records how pages are used (clicks, scrolling, navigation) and sets its own cookies; the data is processed by Microsoft. Clarity starts after your first action on the site. You can opt out with the “Decline” button in the cookie notice (shown to visitors outside Ukraine, as told by the device’s time zone) or with the “Cookies” link at the bottom of the page: Clarity is then no longer loaded and its cookies are deleted.',
        'From the request form we keep what you sent, the address of the page it was sent from, and the domain of the site you came from (for example google.com, without the page address). We do not sell this data or pass it to third parties other than the processors listed below.',
    ]),
    'es': ('Actualizado el 22 de noviembre de 2026', 'Cookies y analítica', [
        f'El sitio no instala cookies publicitarias. Las cookies necesarias solo se usan en el área de cliente: la sesión de acceso ({C("cas_s")}), una cookie temporal {C("cas_pl")} mientras accede con su número de teléfono y el idioma del área ({C("cas_lang")}).',
        f'En el almacenamiento del navegador (localStorage, sessionStorage) el sitio guarda su elección sobre la analítica ({C("cas_ck")}), una marca de que ya se mostró la pista de la escena, los favoritos y ajustes del área de cliente y, durante la visita, el dominio del sitio del que llegó ({C("cas_rh")}).',
        'La analítica es Microsoft Clarity: registra cómo se usan las páginas (clics, desplazamiento, navegación) e instala sus propias cookies; los datos los trata Microsoft. Clarity se activa tras su primera acción en el sitio. Puede rechazarla con el botón «Rechazar» del aviso de cookies (lo ven los visitantes de fuera de Ucrania, según la zona horaria del dispositivo) o con el enlace «Cookies» al pie de la página: Clarity deja de cargarse y sus cookies se eliminan.',
        'Del formulario de solicitud guardamos lo que envió, la dirección de la página desde la que lo envió y el dominio del sitio del que llegó (por ejemplo, google.com, sin la dirección de la página). No vendemos estos datos ni los comunicamos a terceros, salvo a los encargados indicados más abajo.',
    ]),
    'pl': ('Aktualizacja: 22 listopada 2026 r.', 'Cookies i analityka', [
        f'Strona nie ustawia reklamowych plików cookies. Niezbędne cookies działają tylko w panelu klienta: sesja logowania ({C("cas_s")}), tymczasowy {C("cas_pl")} podczas logowania numerem telefonu i język panelu ({C("cas_lang")}).',
        f'W pamięci przeglądarki (localStorage, sessionStorage) strona przechowuje Twój wybór dotyczący analityki ({C("cas_ck")}), znacznik, że podpowiedź sceny została już pokazana, ulubione i ustawienia panelu, a na czas wizyty — domenę strony, z której przyszedłeś ({C("cas_rh")}).',
        'Analityka to Microsoft Clarity: zapisuje, jak korzysta się ze stron (kliknięcia, przewijanie, przejścia), i ustawia własne pliki cookies; dane przetwarza Microsoft. Clarity włącza się po pierwszej czynności na stronie. Możesz z niej zrezygnować przyciskiem „Odrzucam” w komunikacie o cookies (widzą go odwiedzający spoza Ukrainy — ustalamy to po strefie czasowej urządzenia) lub linkiem „Cookies” na dole strony: Clarity przestaje się wtedy ładować, a jego pliki cookies są usuwane.',
        'Z formularza zapytania zapisujemy to, co wysłałeś, adres strony, z której je wysłano, i domenę strony, z której przyszedłeś (np. google.com — bez adresu podstrony). Tych danych nie sprzedajemy ani nie przekazujemy osobom trzecim poza podmiotami przetwarzającymi wymienionymi niżej.',
    ]),
    'de': ('Aktualisiert am 22. November 2026', 'Cookies und Analyse', [
        f'Die Website setzt keine Werbe-Cookies. Notwendige Cookies gibt es nur im Kundenbereich: die Anmeldesitzung ({C("cas_s")}), ein temporäres {C("cas_pl")} während der Anmeldung mit Telefonnummer und die Sprache des Kundenbereichs ({C("cas_lang")}).',
        f'Im Browserspeicher (localStorage, sessionStorage) speichert die Website Ihre Entscheidung zur Analyse ({C("cas_ck")}), einen Vermerk, dass ein Szenen-Hinweis bereits angezeigt wurde, Favoriten und Einstellungen des Kundenbereichs sowie für die Dauer des Besuchs die Domain der Website, von der Sie kamen ({C("cas_rh")}).',
        'Zur Analyse nutzen wir Microsoft Clarity: Es zeichnet auf, wie Seiten genutzt werden (Klicks, Scrollen, Seitenwechsel), und setzt eigene Cookies; die Daten verarbeitet Microsoft. Clarity startet nach Ihrer ersten Aktion auf der Website. Widersprechen können Sie mit der Schaltfläche „Ablehnen“ im Cookie-Hinweis (er erscheint für Besucher außerhalb der Ukraine, erkannt an der Zeitzone des Geräts) oder über den Link „Cookies“ unten auf der Seite: Clarity wird dann nicht mehr geladen, seine Cookies werden gelöscht.',
        'Aus dem Anfrageformular speichern wir, was Sie gesendet haben, die Adresse der Seite, von der es gesendet wurde, und die Domain der Website, von der Sie kamen (z. B. google.com, ohne Seitenadresse). Wir verkaufen diese Daten nicht und geben sie nicht an Dritte weiter, außer an die unten genannten Auftragsverarbeiter.',
    ]),
    'fr': ('Mis à jour le 22 novembre 2026', 'Cookies et mesure d’audience', [
        f'Le site ne dépose aucun cookie publicitaire. Les cookies nécessaires ne servent que dans l’espace client : la session de connexion ({C("cas_s")}), un cookie temporaire {C("cas_pl")} pendant la connexion par numéro de téléphone et la langue de l’espace ({C("cas_lang")}).',
        f'Dans le stockage du navigateur (localStorage, sessionStorage), le site conserve votre choix concernant la mesure d’audience ({C("cas_ck")}), une marque indiquant que l’astuce de la scène a déjà été affichée, les favoris et réglages de l’espace client et, le temps de la visite, le domaine du site d’où vous venez ({C("cas_rh")}).',
        'La mesure d’audience repose sur Microsoft Clarity : il enregistre l’utilisation des pages (clics, défilement, navigation) et dépose ses propres cookies ; les données sont traitées par Microsoft. Clarity démarre après votre première action sur le site. Vous pouvez vous y opposer avec le bouton « Refuser » du bandeau cookies (affiché aux visiteurs hors d’Ukraine, d’après le fuseau horaire de l’appareil) ou avec le lien « Cookies » en bas de page : Clarity n’est alors plus chargé et ses cookies sont supprimés.',
        'Du formulaire de demande, nous conservons ce que vous avez envoyé, l’adresse de la page d’envoi et le domaine du site d’où vous venez (par exemple google.com, sans l’adresse de la page). Nous ne vendons pas ces données et ne les transmettons à aucun tiers, hormis les sous-traitants cités ci-dessous.',
    ]),
    'pt': ('Atualizado a 22 de novembro de 2026', 'Cookies e análise', [
        f'O site não instala cookies de publicidade. Os cookies necessários existem apenas na área de cliente: a sessão de início de sessão ({C("cas_s")}), um cookie temporário {C("cas_pl")} enquanto entra com o número de telefone e o idioma da área ({C("cas_lang")}).',
        f'No armazenamento do navegador (localStorage, sessionStorage), o site guarda a sua escolha sobre a análise ({C("cas_ck")}), uma marca de que a dica da cena já foi mostrada, os favoritos e definições da área de cliente e, durante a visita, o domínio do site de onde veio ({C("cas_rh")}).',
        'A análise é feita com o Microsoft Clarity: regista a forma como as páginas são usadas (cliques, deslocamento, navegação) e instala os seus próprios cookies; os dados são tratados pela Microsoft. O Clarity é ativado após a sua primeira ação no site. Pode recusar no botão «Recusar» do aviso de cookies (mostrado a visitantes fora da Ucrânia, segundo o fuso horário do dispositivo) ou na ligação «Cookies» no fundo da página: o Clarity deixa de ser carregado e os seus cookies são apagados.',
        'Do formulário de pedido guardamos o que enviou, o endereço da página a partir da qual foi enviado e o domínio do site de onde veio (por exemplo, google.com, sem o endereço da página). Não vendemos estes dados nem os comunicamos a terceiros, além dos subcontratantes indicados abaixo.',
    ]),
    'zh': ('更新于 2026 年 11 月 22 日', 'Cookies 与访问分析', [
        f'本网站不设置任何广告 cookies。必要的 cookies 仅用于客户账户：登录会话（{C("cas_s")}）、用手机号登录期间的临时 {C("cas_pl")}，以及账户语言（{C("cas_lang")}）。',
        f'网站在浏览器存储（localStorage、sessionStorage）中保存：您对访问分析的选择（{C("cas_ck")}）、场景提示已显示过的标记、账户收藏与设置，以及在本次访问期间您来源网站的域名（{C("cas_rh")}）。',
        '访问分析使用 Microsoft Clarity：记录页面的使用方式（点击、滚动、跳转），并设置其自己的 cookies；数据由 Microsoft 处理。Clarity 在您于网站上首次操作后启用。您可以通过 cookies 提示条中的“拒绝”按钮（向乌克兰境外的访客显示，依据设备时区判断）或页面底部的“Cookies”链接拒绝：此后不再加载 Clarity，并删除其 cookies。',
        '对于咨询表单，我们保存您提交的内容、提交所在页面的地址，以及您来源网站的域名（例如 google.com，不含页面地址）。我们不出售这些数据，也不向下文所列处理方以外的第三方提供。',
    ]),
    'ar': ('آخر تحديث: 22 نوفمبر 2026', 'ملفات تعريف الارتباط (Cookies) والتحليلات', [
        f'لا يضع الموقع أي ملفات تعريف ارتباط إعلانية. الملفات الضرورية تُستخدم في حساب العميل فقط: جلسة تسجيل الدخول (<bdi>{C("cas_s")}</bdi>)، وملف مؤقت <bdi>{C("cas_pl")}</bdi> أثناء تسجيل الدخول برقم الهاتف، ولغة الحساب (<bdi>{C("cas_lang")}</bdi>).',
        f'يحفظ الموقع في تخزين المتصفح (localStorage وsessionStorage) اختيارك بشأن التحليلات (<bdi>{C("cas_ck")}</bdi>)، وعلامة بأن تلميح المشهد قد عُرض، والمفضلة وإعدادات الحساب، وطوال مدة الزيارة — نطاق الموقع الذي أتيت منه (<bdi>{C("cas_rh")}</bdi>).',
        'التحليلات عبر Microsoft Clarity: يسجّل طريقة استخدام الصفحات (النقرات والتمرير والتنقل) ويضع ملفات تعريف الارتباط الخاصة به، وتعالج Microsoft البيانات. يبدأ Clarity بعد أول إجراء تقوم به على الموقع. يمكنك الرفض بزر «رفض» في إشعار ملفات تعريف الارتباط (يظهر للزوار من خارج أوكرانيا، بحسب المنطقة الزمنية للجهاز) أو برابط «Cookies» أسفل الصفحة: عندها لا يُحمَّل Clarity بعد ذلك وتُحذف ملفات تعريف الارتباط الخاصة به.',
        'من نموذج الطلب نحفظ ما أرسلته، وعنوان الصفحة التي أُرسل منها، ونطاق الموقع الذي أتيت منه (مثل google.com، دون عنوان الصفحة). لا نبيع هذه البيانات ولا ننقلها إلى أطراف ثالثة غير جهات المعالجة المذكورة أدناه.',
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
