"""Розділ «Cookies та аналітика» в політиці конфіденційності 10 мов (Михайло 22.11.2026: «роби покращення» після SEO-розбору).

Сторінки політики — ручні HTML (шапку/футер ставить chrome.py); цей скрипт лише вставляє/оновлює блок <!--ck-->…<!--/ck-->
перед третім <h2> («Навіщо» й відповідники) і дату «Оновлено …». Ідемпотентно. Якір #cookies — посилання «Cookies» у футері
(chrome.footer) без JS і «Детальніше» на плашці згоди (site-chrome.v1.js).
Факти — за кодом (22.11.2026): cookies cas_s / cas_pl (functions/_lib.js), cas_lang (kabinet-i18n.v1.js); localStorage cas_ck,
casScHint, обране й налаштування кабінету; sessionStorage cas_rh (lead-form.v1.js / site-chrome.v1.js); Clarity — chrome.CLARITY.
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
        'Аналітика — Microsoft Clarity: записує, як користуються сторінками (кліки, прокрутку, переходи), ставить власні cookies; дані обробляє Microsoft. За межами України Clarity вмикається лише після вашої згоди («Прийняти» на плашці), в Україні — після першої дії на сторінці. Регіон визначаємо за часовим поясом пристрою, без запиту до сервера. Змінити вибір або вимкнути аналітику можна будь-коли кнопкою «Cookies» унизу сторінки.',
        'Із форми заявки зберігаємо те, що ви надіслали, адресу сторінки, з якої її надіслано, і домен сайту, з якого ви прийшли (наприклад, google.com — без адреси сторінки). Ці дані не продаємо й не передаємо третім особам, крім обробників, названих нижче.',
    ]),
    'ru': ('Обновлено 22 ноября 2026 года', 'Cookies и аналитика', [
        f'Рекламных cookies сайт не ставит. Необходимые cookies — только в личном кабинете: сессия входа ({C("cas_s")}), временный {C("cas_pl")} во время входа по номеру телефона и язык кабинета ({C("cas_lang")}).',
        f'В хранилище браузера (localStorage, sessionStorage) сайт держит ваш выбор по аналитике ({C("cas_ck")}), отметку, что подсказка сцены уже показана, избранное и настройки кабинета, а на время посещения — домен сайта, с которого вы пришли ({C("cas_rh")}).',
        'Аналитика — Microsoft Clarity: записывает, как пользуются страницами (клики, прокрутку, переходы), ставит собственные cookies; данные обрабатывает Microsoft. За пределами Украины Clarity включается только после вашего согласия («Принять» на плашке), в Украине — после первого действия на странице. Регион определяем по часовому поясу устройства, без запроса к серверу. Изменить выбор или выключить аналитику можно в любой момент кнопкой «Cookies» внизу страницы.',
        'Из формы заявки сохраняем то, что вы отправили, адрес страницы, с которой её отправили, и домен сайта, с которого вы пришли (например, google.com — без адреса страницы). Эти данные не продаём и не передаём третьим лицам, кроме обработчиков, названных ниже.',
    ]),
    'en': ('Updated 22 November 2026', 'Cookies and analytics', [
        f'The site sets no advertising cookies. Necessary cookies are used only in the client account: the sign-in session ({C("cas_s")}), a temporary {C("cas_pl")} while you sign in with a phone number, and the account language ({C("cas_lang")}).',
        f'In browser storage (localStorage, sessionStorage) the site keeps your analytics choice ({C("cas_ck")}), a note that a scene hint has already been shown, account favourites and settings, and, for the duration of the visit, the domain of the site you came from ({C("cas_rh")}).',
        'Analytics is Microsoft Clarity: it records how pages are used (clicks, scrolling, navigation) and sets its own cookies; the data is processed by Microsoft. Outside Ukraine, Clarity is switched on only after your consent (“Accept” on the notice); in Ukraine, after your first action on the page. We tell the region from your device’s time zone, without asking a server. You can change your choice or turn analytics off at any time with the “Cookies” button at the bottom of the page.',
        'From the request form we keep what you sent, the address of the page it was sent from, and the domain of the site you came from (for example google.com, without the page address). We do not sell this data or pass it to third parties other than the processors listed below.',
    ]),
    'es': ('Actualizado el 22 de noviembre de 2026', 'Cookies y analítica', [
        f'El sitio no instala cookies publicitarias. Las cookies necesarias solo se usan en el área de cliente: la sesión de acceso ({C("cas_s")}), una cookie temporal {C("cas_pl")} mientras accede con su número de teléfono y el idioma del área ({C("cas_lang")}).',
        f'En el almacenamiento del navegador (localStorage, sessionStorage) el sitio guarda su elección sobre la analítica ({C("cas_ck")}), una marca de que ya se mostró la pista de la escena, los favoritos y ajustes del área de cliente y, durante la visita, el dominio del sitio del que llegó ({C("cas_rh")}).',
        'La analítica es Microsoft Clarity: registra cómo se usan las páginas (clics, desplazamiento, navegación) e instala sus propias cookies; los datos los trata Microsoft. Fuera de Ucrania, Clarity solo se activa tras su consentimiento («Aceptar» en el aviso); en Ucrania, tras su primera acción en la página. Determinamos la región por la zona horaria del dispositivo, sin consultar ningún servidor. Puede cambiar su elección o desactivar la analítica en cualquier momento con el botón «Cookies» al pie de la página.',
        'Del formulario de solicitud guardamos lo que envió, la dirección de la página desde la que lo envió y el dominio del sitio del que llegó (por ejemplo, google.com, sin la dirección de la página). No vendemos estos datos ni los comunicamos a terceros, salvo a los encargados indicados más abajo.',
    ]),
    'pl': ('Aktualizacja: 22 listopada 2026 r.', 'Cookies i analityka', [
        f'Strona nie ustawia reklamowych plików cookies. Niezbędne cookies działają tylko w panelu klienta: sesja logowania ({C("cas_s")}), tymczasowy {C("cas_pl")} podczas logowania numerem telefonu i język panelu ({C("cas_lang")}).',
        f'W pamięci przeglądarki (localStorage, sessionStorage) strona przechowuje Twój wybór dotyczący analityki ({C("cas_ck")}), znacznik, że podpowiedź sceny została już pokazana, ulubione i ustawienia panelu, a na czas wizyty — domenę strony, z której przyszedłeś ({C("cas_rh")}).',
        'Analityka to Microsoft Clarity: zapisuje, jak korzysta się ze stron (kliknięcia, przewijanie, przejścia), i ustawia własne pliki cookies; dane przetwarza Microsoft. Poza Ukrainą Clarity włącza się dopiero po Twojej zgodzie („Akceptuję” na komunikacie), w Ukrainie — po pierwszej czynności na stronie. Region ustalamy na podstawie strefy czasowej urządzenia, bez zapytania do serwera. Wybór możesz zmienić lub wyłączyć analitykę w każdej chwili przyciskiem „Cookies” na dole strony.',
        'Z formularza zapytania zapisujemy to, co wysłałeś, adres strony, z której je wysłano, i domenę strony, z której przyszedłeś (np. google.com — bez adresu podstrony). Tych danych nie sprzedajemy ani nie przekazujemy osobom trzecim poza podmiotami przetwarzającymi wymienionymi niżej.',
    ]),
    'de': ('Aktualisiert am 22. November 2026', 'Cookies und Analyse', [
        f'Die Website setzt keine Werbe-Cookies. Notwendige Cookies gibt es nur im Kundenbereich: die Anmeldesitzung ({C("cas_s")}), ein temporäres {C("cas_pl")} während der Anmeldung mit Telefonnummer und die Sprache des Kundenbereichs ({C("cas_lang")}).',
        f'Im Browserspeicher (localStorage, sessionStorage) speichert die Website Ihre Entscheidung zur Analyse ({C("cas_ck")}), einen Vermerk, dass ein Szenen-Hinweis bereits angezeigt wurde, Favoriten und Einstellungen des Kundenbereichs sowie für die Dauer des Besuchs die Domain der Website, von der Sie kamen ({C("cas_rh")}).',
        'Zur Analyse nutzen wir Microsoft Clarity: Es zeichnet auf, wie Seiten genutzt werden (Klicks, Scrollen, Seitenwechsel), und setzt eigene Cookies; die Daten verarbeitet Microsoft. Außerhalb der Ukraine wird Clarity erst nach Ihrer Einwilligung aktiviert („Akzeptieren“ im Hinweis), in der Ukraine nach Ihrer ersten Aktion auf der Seite. Die Region erkennen wir an der Zeitzone Ihres Geräts, ohne Serveranfrage. Ihre Entscheidung ändern oder die Analyse abschalten können Sie jederzeit über die Schaltfläche „Cookies“ unten auf der Seite.',
        'Aus dem Anfrageformular speichern wir, was Sie gesendet haben, die Adresse der Seite, von der es gesendet wurde, und die Domain der Website, von der Sie kamen (z. B. google.com, ohne Seitenadresse). Wir verkaufen diese Daten nicht und geben sie nicht an Dritte weiter, außer an die unten genannten Auftragsverarbeiter.',
    ]),
    'fr': ('Mis à jour le 22 novembre 2026', 'Cookies et mesure d’audience', [
        f'Le site ne dépose aucun cookie publicitaire. Les cookies nécessaires ne servent que dans l’espace client : la session de connexion ({C("cas_s")}), un cookie temporaire {C("cas_pl")} pendant la connexion par numéro de téléphone et la langue de l’espace ({C("cas_lang")}).',
        f'Dans le stockage du navigateur (localStorage, sessionStorage), le site conserve votre choix concernant la mesure d’audience ({C("cas_ck")}), une marque indiquant que l’astuce de la scène a déjà été affichée, les favoris et réglages de l’espace client et, le temps de la visite, le domaine du site d’où vous venez ({C("cas_rh")}).',
        'La mesure d’audience repose sur Microsoft Clarity : il enregistre l’utilisation des pages (clics, défilement, navigation) et dépose ses propres cookies ; les données sont traitées par Microsoft. Hors d’Ukraine, Clarity ne s’active qu’après votre consentement (« Accepter » dans le bandeau) ; en Ukraine, après votre première action sur la page. Nous déduisons la région du fuseau horaire de votre appareil, sans interroger de serveur. Vous pouvez modifier votre choix ou désactiver la mesure d’audience à tout moment avec le bouton « Cookies » en bas de page.',
        'Du formulaire de demande, nous conservons ce que vous avez envoyé, l’adresse de la page d’envoi et le domaine du site d’où vous venez (par exemple google.com, sans l’adresse de la page). Nous ne vendons pas ces données et ne les transmettons à aucun tiers, hormis les sous-traitants cités ci-dessous.',
    ]),
    'pt': ('Atualizado a 22 de novembro de 2026', 'Cookies e análise', [
        f'O site não instala cookies de publicidade. Os cookies necessários existem apenas na área de cliente: a sessão de início de sessão ({C("cas_s")}), um cookie temporário {C("cas_pl")} enquanto entra com o número de telefone e o idioma da área ({C("cas_lang")}).',
        f'No armazenamento do navegador (localStorage, sessionStorage), o site guarda a sua escolha sobre a análise ({C("cas_ck")}), uma marca de que a dica da cena já foi mostrada, os favoritos e definições da área de cliente e, durante a visita, o domínio do site de onde veio ({C("cas_rh")}).',
        'A análise é feita com o Microsoft Clarity: regista a forma como as páginas são usadas (cliques, deslocamento, navegação) e instala os seus próprios cookies; os dados são tratados pela Microsoft. Fora da Ucrânia, o Clarity só é ativado depois do seu consentimento («Aceitar» no aviso); na Ucrânia, depois da sua primeira ação na página. Determinamos a região pelo fuso horário do dispositivo, sem consultar nenhum servidor. Pode alterar a sua escolha ou desativar a análise a qualquer momento no botão «Cookies» no fundo da página.',
        'Do formulário de pedido guardamos o que enviou, o endereço da página a partir da qual foi enviado e o domínio do site de onde veio (por exemplo, google.com, sem o endereço da página). Não vendemos estes dados nem os comunicamos a terceiros, além dos subcontratantes indicados abaixo.',
    ]),
    'zh': ('更新于 2026 年 11 月 22 日', 'Cookies 与访问分析', [
        f'本网站不设置任何广告 cookies。必要的 cookies 仅用于客户账户：登录会话（{C("cas_s")}）、用手机号登录期间的临时 {C("cas_pl")}，以及账户语言（{C("cas_lang")}）。',
        f'网站在浏览器存储（localStorage、sessionStorage）中保存：您对访问分析的选择（{C("cas_ck")}）、场景提示已显示过的标记、账户收藏与设置，以及在本次访问期间您来源网站的域名（{C("cas_rh")}）。',
        '访问分析使用 Microsoft Clarity：记录页面的使用方式（点击、滚动、跳转），并设置其自己的 cookies；数据由 Microsoft 处理。在乌克兰境外，只有在您同意后（在提示条上点击“接受”）才会启用 Clarity；在乌克兰境内，则在您于页面上首次操作后启用。我们根据设备的时区判断地区，不向服务器发送请求。您可随时通过页面底部的“Cookies”按钮更改选择或关闭访问分析。',
        '对于咨询表单，我们保存您提交的内容、提交所在页面的地址，以及您来源网站的域名（例如 google.com，不含页面地址）。我们不出售这些数据，也不向下文所列处理方以外的第三方提供。',
    ]),
    'ar': ('آخر تحديث: 22 نوفمبر 2026', 'ملفات تعريف الارتباط (Cookies) والتحليلات', [
        f'لا يضع الموقع أي ملفات تعريف ارتباط إعلانية. الملفات الضرورية تُستخدم في حساب العميل فقط: جلسة تسجيل الدخول (<bdi>{C("cas_s")}</bdi>)، وملف مؤقت <bdi>{C("cas_pl")}</bdi> أثناء تسجيل الدخول برقم الهاتف، ولغة الحساب (<bdi>{C("cas_lang")}</bdi>).',
        f'يحفظ الموقع في تخزين المتصفح (localStorage وsessionStorage) اختيارك بشأن التحليلات (<bdi>{C("cas_ck")}</bdi>)، وعلامة بأن تلميح المشهد قد عُرض، والمفضلة وإعدادات الحساب، وطوال مدة الزيارة — نطاق الموقع الذي أتيت منه (<bdi>{C("cas_rh")}</bdi>).',
        'التحليلات عبر Microsoft Clarity: يسجّل طريقة استخدام الصفحات (النقرات والتمرير والتنقل) ويضع ملفات تعريف الارتباط الخاصة به، وتعالج Microsoft البيانات. خارج أوكرانيا لا يعمل Clarity إلا بعد موافقتك («قبول» في الإشعار)، وفي أوكرانيا — بعد أول إجراء تقوم به على الصفحة. نحدد المنطقة من المنطقة الزمنية لجهازك دون أي طلب إلى الخادم. يمكنك تغيير اختيارك أو إيقاف التحليلات في أي وقت بزر «Cookies» أسفل الصفحة.',
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
