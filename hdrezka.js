class HdrezkaPlugin {
    constructor() {
        this.name = 'HDrezka Video Extended';
        this.version = '2.0';
        this.interceptor = null;
        this.userAgent = 'Mozilla/5.0 (Linux; Android 10; Pixel 3) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Mobile Safari/537.36';
    }

    init() {
        this.interceptor = lampa.Player.addInterceptor(this.handle.bind(this));
    }

    async handle(url, options) {
        if (!this.isHdrezka(url)) return null;

        try {
            let finalUrl = url;
            const html = await this.fetchHtml(url);
            
            // Парсинг сезонов и эпизодов
            if (this.isSeries(html)) {
                const { seasons, episodes } = this.parseSeasons(html);
                const season = await this.showMenu('Выберите сезон', seasons);
                const episode = await this.showMenu('Выберите серию', episodes[season.value]);
                finalUrl = this.buildEpisodeUrl(url, season.value, episode.value);
            }

            // Парсинг видео и качества
            const { sources, headers } = await this.parseVideo(finalUrl);
            const quality = await this.showQuality(sources);
            
            return {
                url: quality.url,
                options: {
                    headers: {
                        ...headers,
                        'User-Agent': this.userAgent,
                        Referer: finalUrl
                    }
                }
            };
        } catch (e) {
            lampa.Noty.show('Ошибка загрузки: ' + e.message, 3000, 'error');
            return null;
        }
    }

    async fetchHtml(url) {
        const res = await lampa.Utils.fetch(url, {
            headers: { 'User-Agent': this.userAgent }
        });
        return await res.text();
    }

    isHdrezka(url) {
        return /hdrezka\.me\/(series|film)\//.test(url);
    }

    isSeries(html) {
        return html.includes('id="season_id"');
    }

    parseSeasons(html) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        
        // Парсинг сезонов
        const seasons = Array.from(doc.querySelectorAll('#season_id option'))
            .map(opt => ({ title: opt.textContent.trim(), value: opt.value }));

        // Парсинг эпизодов
        const episodes = {};
        doc.querySelectorAll('[data-season]').forEach(season => {
            episodes[season.dataset.season] = Array.from(season.querySelectorAll('a'))
                .map(a => ({ title: a.textContent.trim(), value: a.href }));
        });

        return { seasons, episodes };
    }

    async parseVideo(url) {
        const html = await this.fetchHtml(url);
        const match = html.match(/player\.setup\(({.*?})\);/s);
        if (!match) throw new Error('Видео не найдено');

        const config = JSON.parse(match[1].replace(/'/g, '"').replace(/,\s*}/, '}'));
        return {
            sources: config.sources.map(s => ({ url: s.file, quality: s.label || 'HD' })),
            headers: config.headers || {}
        };
    }

    buildEpisodeUrl(baseUrl, season, episode) {
        const url = new URL(baseUrl);
        url.searchParams.set('season', season);
        url.searchParams.set('episode', episode);
        return url.toString();
    }

    async showMenu(title, items) {
        return new Promise(resolve => {
            lampa.Menu.show({
                title,
                items: items.map(i => ({ title: i.title, value: i.value })),
                onSelect: resolve
            });
        });
    }

    async showQuality(sources) {
        if (sources.length === 1) return sources[0];
        return this.showMenu('Выберите качество', sources.map(s => ({
            title: s.quality,
            value: s
        })));
    }
}

lampa.Plugins.register(new HdrezkaPlugin());
