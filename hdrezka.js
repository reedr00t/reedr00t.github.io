(function () {
    'use strict';

    // ВНИМАНИЕ: Этот плагин пытается делать прямые запросы к HDRezka.
    // Его работоспособность на Smart TV без CORS-прокси полностью зависит от того,
    // как приложение Lampa на вашем устройстве обрабатывает сетевые запросы плагинов
    // и позволяет ли оно обходить стандартные ограничения CORS браузера/WebView.
    // Также, установка User-Agent из JS может быть ненадежной.

    const HDREZKA_BASE_URL = 'https://hdrezka.me'; // Или актуальный домен HDRezka

    // Заголовки для "маскировки" под Chrome на Windows 11
    const FAKE_CHROME_WIN11_HEADERS = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36', // Пример User-Agent
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
        'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7',
        // HDRezka может проверять и другие заголовки из семейства sec-ch-ua-*
        'sec-ch-ua': '"Not/A)Brand";v="99", "Google Chrome";v="115", "Chromium";v="115"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"Windows"',
        'Sec-Fetch-Dest': 'document', // или 'empty' для AJAX
        'Sec-Fetch-Mode': 'navigate', // или 'cors' для AJAX
        'Sec-Fetch-Site': 'same-origin', // или 'none' / 'cross-site' в зависимости от контекста
        'Sec-Fetch-User': '?1',
        'Upgrade-Insecure-Requests': '1'
    };

    // Вспомогательная функция для GET-запросов
    // Используем Lampa.Network. এবারে, надеясь, что оно может корректно работать на Smart TV
    function fetchData(url, options = {}, referer) {
        const requestOptions = {
            ...options,
            method: 'GET', // Явно указываем, хотя для Lampa.Network. এবারে это может быть по умолчанию
            headers: { // Передаем заголовки в опциях, если Lampa.Network. এবারে их поддерживает
                ...FAKE_CHROME_WIN11_HEADERS,
                'Referer': referer || HDREZKA_BASE_URL + '/',
                ...(options.headers || {})
            },
            timeout: 15000 // Таймаут на всякий случай
        };
        
        // Lampa.Network. এবারে должна возвращать Promise
        // ВАЖНО: Если Lampa на SmartTV не обходит CORS, этот запрос будет заблокирован.
        return Lampa.Network. এবারে(url, requestOptions).catch(err => {
            console.error(`HDRezka Plugin: Ошибка GET ${url}:`, (err.message || err));
            Lampa.Noty.show(`Ошибка сети при запросе к HDRezka (возможно, CORS). Проверьте консоль.`);
            throw err; // Перебрасываем ошибку дальше
        });
    }

    // Вспомогательная функция для POST-запросов
    // Используем Lampa.Network.post
    function fetchDataPost(url, formData, referer, parseAsJson = true) {
        const postHeaders = {
            ...FAKE_CHROME_WIN11_HEADERS, // Копируем основные заголовки
            'Accept': 'application/json, text/javascript, */*; q=0.01', // Типичный Accept для AJAX POST
            'X-Requested-With': 'XMLHttpRequest', // Часто используется для AJAX
            'Origin': HDREZKA_BASE_URL, // Браузер, скорее всего, не даст это подделать, но Lampa может
            'Referer': referer || url,
            'Sec-Fetch-Dest': 'empty',
            'Sec-Fetch-Mode': 'cors',
            'Sec-Fetch-Site': 'same-origin', // HDRezka API вызывается с её же страниц
        };
        // Удаляем некоторые заголовки, которые могут быть неуместны для AJAX POST или могут быть установлены автоматически
        delete postHeaders['Upgrade-Insecure-Requests'];
        delete postHeaders['Sec-Fetch-User'];
        // Content-Type для FormData обычно устанавливается браузером/HTTP-клиентом автоматически, включая boundary.
        // Если Lampa.Network.post требует явного Content-Type, это нужно будет учесть.

        return new Promise((resolve, reject) => {
            Lampa.Network.post(
                url,
                formData,
                (responseBody, status, xhr) => { // responseBody может быть уже распарсенным JSON или текстом
                    if (parseAsJson && typeof responseBody === 'string') {
                        try {
                            resolve(JSON.parse(responseBody));
                        } catch (e) {
                            console.error("HDRezka Plugin: Ошибка парсинга JSON из POST ответа:", e, responseBody);
                            reject(new Error("Ошибка парсинга JSON"));
                        }
                    } else {
                        resolve(responseBody);
                    }
                },
                (xhr, status, error) => {
                    const errMessage = `HDRezka Plugin: Ошибка POST ${url}: ${status} ${error}`;
                    console.error(errMessage, xhr);
                    Lampa.Noty.show(`Ошибка сети при POST-запросе к HDRezka (возможно, CORS).`);
                    reject(new Error(errMessage));
                },
                false, // parseJson: false - мы сами парсим, если нужно, для большей гибкости
                       // или true, если Lampa.Network.post всегда отдает распарсенный JSON и это удобно
                { headers: postHeaders, timeout: 15000 } // Передаем заголовки и таймаут
            );
        });
    }

    // --- Начало HdRezkaMainComponent ---
    // Компонент остается практически таким же, как в предыдущем "прямом" примере.
    // Основное отличие - использование fetchData и fetchDataPost, которые теперь
    // пытаются установить все нужные заголовки.
    function HdRezkaMainComponent() {
        let scroll, results_list;
        let current_search_query = '';
        let current_page = 1;

        this.build = function (data) {
            Lampa.Template.add('hdrezka_main_template_tv', `
                <div class="hdrezka-main">
                    <div class="hdrezka-main__search head--search">
                        <input type="text" class="search__input focusable" placeholder="Поиск на HDRezka (Smart TV)..." value="${Lampa.Utils.escape(current_search_query)}">
                        <div style="font-size:0.7em; opacity:0.6; padding: 3px;">Примечание: Работа зависит от возможностей Lampa на вашем ТВ.</div>
                    </div>
                    <div class="hdrezka-main__results">
                        <div class="hdrezka-main__list layer--wheight"></div>
                    </div>
                    <div class="hdrezka-main__empty empty">Пока ничего нет</div>
                </div>
            `);

            let html = Lampa.Template.get('hdrezka_main_template_tv', {});
            this.html = html; 

            results_list = html.find('.hdrezka_main__list');
            let search_input = html.find('.hdrezka-main__search input');

            search_input.on('input', (e) => {
                current_search_query = e.target.value;
            }).on('search', () => { 
                current_page = 1;
                this.search(current_search_query);
            });
            
            Lampa.Controller.collectionSet(html);
            Lampa.Controller.collectionFocus(search_input[0], html);
        };

        this.search = function (query) {
            if (!query.trim()) return;
            Lampa.Loading.start();
            this.showEmpty(false);
            results_list.empty();

            // Для HDRezka URL для поиска может быть:
            // https://hdrezka.me/index.php?do=search&subaction=search&q=QUERY (старый вариант)
            // или ajax-запрос POST на /ajax/search_result_search_page/ (новый вариант)
            // Попробуем вариант с GET для простоты, если он еще работает.
            // Если нет, нужно будет переделать на POST.
            // Актуальный поиск на HDRezka чаще всего делается через POST AJAX:
            // URL: HDREZKA_BASE_URL + /ajax/search_result_search_page/
            // METHOD: POST
            // FormData: q=QUERY, page=PAGE_NUMBER
            // Referer: страница поиска или главная
            
            // Для примера оставим GET-запрос на /search/, но его нужно проверить
            const searchUrl = `${HDREZKA_BASE_URL}/search/?q=${encodeURIComponent(query)}&page=${current_page}`;
            const referer = HDREZKA_BASE_URL + '/';

            fetchData(searchUrl, {}, referer)
                .then(this.parseSearchResults.bind(this))
                .catch(error => {
                    Lampa.Loading.stop();
                    this.showEmpty(true);
                    Lampa.Noty.show('Ошибка поиска на HDRezka.');
                });
        };

        this.parseSearchResults = function (htmlContent) {
            Lampa.Loading.stop();
            const parser = new DOMParser();
            const doc = parser.parseFromString(htmlContent, "text/html");

            // Селектор для карточек результатов. АКТУАЛИЗИРУЙТЕ ЕГО!
            // Пример: '.b-content__inline_item'
            const items = doc.querySelectorAll('.b-content__inline_item'); 
            let results = [];

            if (!items.length) {
                this.showEmpty(true);
                if (htmlContent.includes("captcha") || htmlContent.includes("Cloudflare")) {
                    Lampa.Noty.show('HDRezka требует капчу или заблокировала запрос (Cloudflare).');
                } else {
                    Lampa.Noty.show('Ничего не найдено или запрос заблокирован.');
                }
                return;
            }

            items.forEach(item => {
                const titleElement = item.querySelector('.b-content__inline_item-link a');
                const infoElement = item.querySelector('.b-content__inline_item-link div'); 
                const posterElement = item.querySelector('.b-content__inline_item-cover img');

                if (titleElement && titleElement.href) {
                    let title = titleElement.innerText.trim();
                    let url = titleElement.href; 
                    if (url.startsWith('/')) url = HDREZKA_BASE_URL + url;
                    else if (!url.startsWith('http')) url = HDREZKA_BASE_URL + '/' + url; // На всякий случай

                    let poster = posterElement ? (posterElement.dataset.src || posterElement.src) : ''; // Учитываем data-src для lazy load
                    if (poster && poster.startsWith('/')) poster = HDREZKA_BASE_URL + poster;
                    // Для постеров с других доменов (если они не на HDRezka) проблем с CORS обычно нет,
                    // но если они на том же домене и Lampa их грузит через JS, могут быть нюансы.

                    let year = '';
                    let quality = '';
                    if (infoElement) {
                        const infoText = infoElement.innerText.trim();
                        const yearMatch = infoText.match(/\d{4}/);
                        if (yearMatch) year = yearMatch[0];
                        // Качество может быть в другом месте или отсутствовать
                    }

                    results.push({
                        title: title,
                        url: url, 
                        poster: poster, // Lampa должна уметь отображать внешние постеры
                        year: year,
                        quality: quality,
                        card_events: { // Используем card_events для более гибкой обработки нажатий
                            onEnter: () => {
                                this.loadMediaPage(url, title, poster, searchUrl); // Передаем URL поиска как Referer
                            },
                            onSelect: () => { // Можно добавить кастомное меню Lampa.Select при фокусе
                                Lampa.Select.show({
                                    title: 'Действие',
                                    items: [
                                        {
                                            title: 'Смотреть',
                                            action: () => this.loadMediaPage(url, title, poster, searchUrl)
                                        },
                                        // Можно добавить другие пункты
                                    ]
                                });
                            }
                        }
                    });
                }
            });
            this.renderResults(results);
        };
        
        this.renderResults = function(itemsData) {
            itemsData.forEach(itemData => {
                let card_data = {
                    title: itemData.title,
                    poster: itemData.poster,
                    // Lampa кубики могут поддерживать дополнительные поля типа ' Voit' (год) или ' translate' (качество/озвучка)
                    // Например: Voit: itemData.year
                };
                let card = Lampa.Template.get('cub', card_data, true); // true - для более глубокого копирования, если нужно
                
                // Привязываем события напрямую к элементу карточки
                Lampa.Utils.bind(card, ' Předběžná', itemData.card_events.onSelect); // Фокус
                Lampa.Utils.bind(card, ' Přihlásit se', itemData.card_events.onEnter); // Нажатие

                results_list.append(card);
            });
            Lampa.Controller.enable({ // Обновляем навигацию в Lampa
                toggle: ()=>{ Lampa.Controller.collectionFocus(results_list. první(). anaky()[0], results_list) },
                update: ()=>{},
                left: ()=>{ Lampa.Controller.prev(); },
                right: ()=>{ Lampa.Controller.next(); },
                up: ()=>{ Lampa.Controller.up(); },
                down: ()=>{ Lampa.Controller.down(); },
                gone: ()=>{},
                enter: true, // Lampa сама обработает 'enter' по событию, привязанному выше
                playpause: true,
                rewind: true,
                select: true, // Lampa сама обработает 'select' (долгое нажатие/меню)
                back: ()=>{ Lampa.Activity.back() }
            });
            Lampa.Controller.collectionSet(results_list);
            if (itemsData.length) {
                Lampa.Controller.collectionFocus(itemsData.length ? results_list.find('.cub').first()[0] : false, results_list);
            } else {
                this.showEmpty(true);
            }
        };
        
        this.showEmpty = function(show) {
            // results_list.empty(); // Не нужно, если вызывается перед renderResults
            let empty_msg = this.html.find('.hdrezka-main__empty');
            if(empty_msg.length) empty_msg.toggleClass('hide', !show);
        }

        this.loadMediaPage = function (mediaPageUrl, title, poster, referer) {
            Lampa.Loading.start();
            fetchData(mediaPageUrl, {}, referer)
                .then(htmlContent => {
                    Lampa.Loading.stop();
                    console.log("HDRezka Plugin: Media page content for:", mediaPageUrl);

                    const parser = new DOMParser();
                    const doc = parser.parseFromString(htmlContent, "text/html");
                    
                    // Извлечение ID фильма/сериала и ID озвучки. ЭТО КЛЮЧEVOY МОМЕНТ И ЧАСТО МЕНЯЕТСЯ!
                    // Нужно анализировать JS на странице HDRezka, который инициализирует плеер.
                    // Ищем что-то вроде:
                    // initCDNMovies(ID, TRANSLATOR_ID, ...)
                    // initCDNSeries(ID, TRANSLATOR_ID, ...)
                    // Или внутри <script> с глобальными переменными или объектом настроек плеера.
                    // sofHDO.init('#cdnplayer', {id: ID, translator_id: TRANSLATOR_ID, ...})
                    let movieId, translatorId, isSerial = false; // Для сериалов нужна доп. логика
                    
                    // Пример поиска (нужно адаптировать под актуальную структуру HDRezka):
                    const scripts = doc.querySelectorAll('script');
                    for (let script of scripts) {
                        const scriptContent = script.textContent;
                        let matchInit = scriptContent.match(/initCDN(?:Movies|Series)\s*\(\s*(\d+)\s*,\s*(\d+)/);
                        if (matchInit) {
                            movieId = matchInit[1];
                            translatorId = matchInit[2];
                            isSerial = scriptContent.includes("initCDNSeries");
                            break;
                        }
                        let matchSofHDO = scriptContent.match(/sofHDO\.init\s*\([^,]+,\s*\{\s*id:\s*(\d+)\s*,\s*translator_id:\s*(\d+)/);
                        if (matchSofHDO) {
                            movieId = matchSofHDO[1];
                            translatorId = matchSofHDO[2];
                            // Определение, сериал это или фильм, может потребовать доп. анализа
                            // Например, по наличию выбора сезонов/серий на странице
                            if (doc.querySelector('.b-simple_season__list')) isSerial = true;
                            break;
                        }
                    }

                    if (movieId && translatorId) {
                        Lampa.Noty.show(`ID: ${movieId}, Translator: ${translatorId}. Получение потоков...`);
                        // Для сериалов тут нужно будет получить список сезонов/серий и дать пользователю выбор,
                        // либо брать первую серию первого сезона по умолчанию.
                        // Пока упрощенно вызываем getStreamLinks.
                        this.getStreamLinks(movieId, translatorId, title, poster, mediaPageUrl, isSerial);
                    } else {
                        if (htmlContent.includes("captcha") || htmlContent.includes("Cloudflare")) {
                             Lampa.Noty.show('HDRezka требует капчу или заблокировала запрос (Cloudflare).');
                        } else {
                             Lampa.Noty.show('Не удалось извлечь ID/Translator ID. Структура сайта могла измениться.');
                        }
                        console.error("HDRezka Plugin: Could not parse movie/translator ID from", mediaPageUrl);
                    }
                })
                .catch(error => {
                    Lampa.Loading.stop();
                    Lampa.Noty.show('Ошибка загрузки страницы медиа.');
                });
        };

        this.getStreamLinks = function(movieId, translatorId, mediaTitle, mediaPoster, originalMediaPageUrl, isSerial = false) {
            Lampa.Loading.start();
            
            let postData = new FormData();
            postData.append('id', movieId);
            postData.append('translator_id', translatorId);
            // postData.append('favs', '...'); // favs может быть нужен, его надо искать на странице

            // Для сериалов нужно добавить season и episode. Пока для примера берем 1 сезон, 1 серию.
            // Также 'action' может отличаться для фильмов ('get_movie') и сериалов ('get_stream' или 'get_episodes').
            // Эту логику нужно будет усложнять.
            if (isSerial) {
                postData.append('season', '1'); 
                postData.append('episode', '1');
                postData.append('action', 'get_stream'); // или 'get_episodes' для списка всех серий
            } else {
                postData.append('action', 'get_movie');
            }
            
            // URL для получения ссылок (может меняться!)
            const streamApiUrl = `${HDREZKA_BASE_URL}/ajax/get_cdn_series/`; // Или другой эндпоинт

            fetchDataPost(streamApiUrl, postData, originalMediaPageUrl, true) // true - ожидаем JSON
            .then((response) => { 
                Lampa.Loading.stop();
                console.log("HDRezka Plugin: Stream API Response:", response);

                if (response && response.success && response.url) {
                    let streams_str = response.url;
                    
                    // ДЕОБФУСКАЦИЯ ССЫЛОК - САМАЯ СЛОЖНАЯ И НЕСТАБИЛЬНАЯ ЧАСТЬ
                    // HDRezka использует JS-обфускацию. Примерный принцип:
                    // 1. Удалить мусор типа "//_//", "#NCS#", "@PQS@" и т.д.
                    // 2. Base64-декодирование, но перед этим могут быть замены символов.
                    //    Например, `streams_str = streams_str.replace(/@/g, '+').replace(/\$/g, '/').replace(/!/g, '=');`
                    //    Нужно анализировать актуальный JS-декодер на сайте HDRezka.
                    // Этот код - ЗАГЛУШКА, он, скорее всего, НЕ будет работать с текущей обфускацией HDRezka.
                    try {
                        if (streams_str.includes("#") || streams_str.includes("@") || streams_str.includes("!")) {
                             // Пример грубой попытки деобфускации (НУЖНО ИССЛЕДОВАТЬ АКТУАЛЬНЫЙ МЕТОД HDREZKA)
                             let cleaned_str = streams_str.replace(/\/\/\_\/\//g, ''); // Убрать типовой мусор
                             // Здесь могут быть кастомные замены перед atob, например:
                             // cleaned_str = cleaned_str.replace(/#/g, 'A').replace(/@/g, 'B'); // это просто пример!
                             // Нужно посмотреть в JS HDRezka, как они расшифровывают строку "Zb Z(function(p,a,c,k,e,d){..." или похожие
                             // Часто используется packed JS, который нужно выполнить или распарсить.
                             // Или замены символов в base64 строке.
                             // Например, один из старых методов:
                             // cleaned_str = cleaned_str.replace(/@/g, "+").replace(/\$/g, "/").replace(/!/g, "=");
                             streams_str = atob(cleaned_str);
                        } else if (streams_str.startsWith('//_//')) { // Более старый вариант
                           streams_str = atob(streams_str.substring(5));
                        }
                        // Если строка уже похожа на JSON или список URL, можно пропустить atob
                    } catch (e) {
                        Lampa.Noty.show("Ошибка деобфускации ссылок. Формат изменился.");
                        console.error("HDRezka Plugin: Base64/deobfuscation error", e, response.url);
                        return;
                    }

                    console.log("HDRezka Plugin: Decoded streams string (needs verification):", streams_str);
                    
                    // Парсинг ссылок. Формат: "[качество]URL,[качество]URL" или JSON
                    let qualities = [];
                    if (streams_str.startsWith('{') && streams_str.endsWith('}')) { // Похоже на JSON
                        try {
                            const streams_json = JSON.parse(streams_str);
                            for (const q_key in streams_json) {
                                qualities.push({
                                    title: q_key,
                                    url: streams_json[q_key],
                                    main: q_key.includes('720') || q_key.includes('1080')
                                });
                            }
                        } catch (e) { console.error("Error parsing JSON streams", e); }
                    } else { // Старый формат "[качеств]URL"
                        streams_str.split(',').forEach(streamPart => {
                            let match = streamPart.match(/\[([^\]]+)\](https?:\/\/[^\s]+)/);
                            if (match) {
                                qualities.push({
                                    title: match[1], 
                                    url: match[2],   
                                    main: match[1].includes('720') || match[1].includes('1080') 
                                });
                            }
                        });
                    }
                    
                    // Сортируем качества (просто для примера, можно улучшить)
                    qualities.sort((a,b) => {
                        const qA = parseInt(a.title);
                        const qB = parseInt(b.title);
                        if (qA && qB) return qB - qA; // 1080p, 720p, ...
                        return 0;
                    });


                    if (qualities.length > 0) {
                        // Даем пользователю выбор качества или выбираем лучшее
                        // Для Lampa лучше всего подготовить массив объектов для Lampa.Select
                        if (qualities.length > 1) {
                            Lampa.Select.show({
                                title: 'Выберите качество',
                                items: qualities.map(q => ({
                                    title: q.title,
                                    url: q.url // Сохраняем URL для действия
                                })),
                                onSelect: (selectedItem) => {
                                    Lampa.Player.play({
                                        title: mediaTitle,
                                        url: selectedItem.url, 
                                        poster: mediaPoster,
                                    });
                                    // Lampa.Player.playlist([]); // Если это фильм, плейлист не нужен
                                },
                                onBack: () => { Lampa.Controller.toggle() } // Возврат к списку
                            });
                        } else {
                            // Одно качество, играем сразу
                            Lampa.Player.play({
                                title: mediaTitle,
                                url: qualities[0].url, 
                                poster: mediaPoster,
                            });
                        }
                        
                    } else {
                        Lampa.Noty.show('Не удалось извлечь ссылки на видеопотоки из ответа.');
                        console.log('HDRezka Plugin: Failed to parse stream URLs from:', streams_str);
                    }

                } else {
                    let errorMsg = 'Ошибка получения ссылок от HDRezka.';
                    if (response && response.message) errorMsg += ` (${response.message})`;
                    else if (response && !response.success) errorMsg += ' (API вернуло ошибку)';
                    Lampa.Noty.show(errorMsg);
                    console.log('HDRezka Plugin: Stream API error response:', response);
                }

            })
            .catch(error => {
                Lampa.Loading.stop();
                Lampa.Noty.show('Сетевая ошибка при получении ссылок на видео.');
            });
        };

        this.start = function (data) { this.showEmpty(true); };
        this.pause = function () {};
        this.resume = function () {};
        this.render = function () { return this.html; };
        this.empty = function (){ if(this.html) this.html.remove(); this.html = null; }
        this.destroy = function () {
            if (this.html) this.html.remove();
            results_list = scroll = this.html = null;
        };
    }
    // --- Конец HdRezkaMainComponent ---

    // Регистрация плагина и компонента
    function HdRezkaPluginLoader() {
        this.create = function () {
            Lampa.Listener.follow('app', (e) => {
                if (e.type == 'ready') {
                    let card = {
                        title: 'HDRezka (SmartTV)', // Название на карточке
                        name: 'HDRezkaSmartTV',      // Уникальное имя для компонента Lampa
                        component: 'hdrezka_main_tv_cmp', // Имя зарегистрированного компонента
                        icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="white"><path d="M21 3H3c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h5v2h8v-2h5c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 14H3V5h18v12zM8 10.5l6 3.5-6 3.5v-7z"/><path d="M0 0h24v24H0z" fill="none"/></svg>', // Пример SVG иконки (замените на свою)
                        card_events: { // События для карточки на главном экране Lampa
                            onEnter: () => {
                                Lampa.Activity.push({
                                    url: '', // Можно оставить пустым или указать начальную точку
                                    title: 'HDRezka (SmartTV)', // Заголовок Activity
                                    component: 'hdrezka_main_tv_cmp', // Запускаем наш главный компонент
                                    page: 1
                                });
                            }
                        }
                    };
                    // Добавляем карточку. Выберите категорию, куда ее добавить.
                    // Lampa.Component.add('category_full', card); // В категорию "Все"
                    Lampa.Component.add('plugins', card); // Или в специальную категорию плагинов, если есть
                    // Если такой категории нет, Lampa может создать ее или нужно использовать существующую
                }
            });
            // Регистрируем главный компонент плагина
            Lampa.Component.register('hdrezka_main_tv_cmp', new HdRezkaMainComponent());
        };
        this.destroy = function () {
            // Тут можно очистить ресурсы, если нужно
            Lampa.Component.remove('hdrezka_main_tv_cmp');
        };
    }

    // Запускаем плагин
    if (window.Lampa) {
        let plugin = new HdRezkaPluginLoader();
        plugin.create();
    } else {
        // Если Lampa еще не загружена, можно подождать события 'lampa:ready'
        // (хотя обычно плагины Lampa загружаются после инициализации Lampa)
        document.addEventListener('lampa:ready', function() {
            let plugin = new HdRezkaPluginLoader();
            plugin.create();
        });
    }

})();
