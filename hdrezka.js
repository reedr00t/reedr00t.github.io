// hdrezka.lampa.plugin.js
(function() {
    'use strict';

    const CORS_PROXY = 'https://cors-anywhere.herokuapp.com/';
    const HDREZKA_SEARCH = 'https://hdrezka.ag/search/?q=';
    const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/98.0.4758.102 Safari/537.36';

    async function fetchHDRezka(url) {
        try {
            const response = await fetch(CORS_PROXY + url, {
                headers: { 'User-Agent': USER_AGENT }
            });
            return await response.text();
        } catch (e) {
            Lampa.Noty.show('Ошибка подключения к HDRezka');
            return null;
        }
    }

    function parseSeasons(html) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        return Array.from(doc.querySelectorAll('.b-simple_season__item')).map(season => ({
            id: season.dataset.tab_id,
            title: season.textContent.trim(),
            episodes: Array.from(season.querySelectorAll('.b-simple_episode__item')).map(episode => ({
                id: episode.dataset.episode_id,
                title: episode.textContent.trim(),
                url: episode.querySelector('a').href
            }))
        }));
    }

    async function getVideoSources(episodeUrl) {
        const html = await fetchHDRezka(episodeUrl);
        const match = html.match(/\[(\{.*?\})\]/);
        try {
            return JSON.parse(match[0]).filter(source => 
                source.url.match(/\.(m3u8|mp4|mkv)/i)
            );
        } catch (e) {
            return [];
        }
    }

    Lampa.Search.addSource({
        title: 'HDRezka',
        params: { lazy: true },
        
        search: async ({ query }) => {
            const html = await fetchHDRezka(HDREZKA_SEARCH + encodeURIComponent(query));
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            
            return Array.from(doc.querySelectorAll('.b-content__inline_item')).map(item => ({
                title: item.querySelector('.title').textContent,
                year: item.querySelector('.year').textContent,
                url: item.querySelector('a').href,
                poster: item.querySelector('img').src
            }));
        }
    });

    Lampa.Component.add('hdrezka', {
        init() {
            this.seasons = [];
            this.currentSource = null;
        },

        create() {
            return {
                html: `
                    <div class="hdrezka-container">
                        <div class="seasons-selector"></div>
                        <div class="episodes-list"></div>
                        <div class="quality-selector"></div>
                    </div>
                `,
                style: `
                    .hdrezka-container { padding: 20px; }
                    .season-item { padding: 10px; cursor: pointer; }
                    .episode-item { padding: 5px 15px; cursor: pointer; }
                    .quality-item { background: #2c2c2c; padding: 8px; margin: 5px; }
                `
            };
        },

        async load(url) {
            const html = await fetchHDRezka(url);
            this.seasons = parseSeasons(html);
            this.renderSeasons();
        },

        renderSeasons() {
            const html = this.seasons.map(season => `
                <div class="season-item" data-id="${season.id}">
                    ${season.title}
                    <div class="episodes-list" style="display:none;">
                        ${season.episodes.map(ep => `
                            <div class="episode-item" data-url="${ep.url}">${ep.title}</div>
                        `).join('')}
                    </div>
                </div>
            `).join('');

            this.container.querySelector('.seasons-selector').innerHTML = html;
            this.initEventListeners();
        },

        initEventListeners() {
            this.container.querySelectorAll('.season-item').forEach(el => {
                el.addEventListener('click', () => {
                    el.querySelector('.episodes-list').style.display = 'block';
                });
            });

            this.container.querySelectorAll('.episode-item').forEach(el => {
                el.addEventListener('click', async () => {
                    const sources = await getVideoSources(el.dataset.url);
                    this.renderQualitySelector(sources);
                });
            });
        },

        renderQualitySelector(sources) {
            const html = sources.map(source => `
                <div class="quality-item" 
                     data-url="${source.url}"
                     data-quality="${source.quality}"
                     data-translator="${source.translator}">
                    ${source.quality} (${source.translator})
                </div>
            `).join('');

            this.container.querySelector('.quality-selector').innerHTML = html;
            this.initQualityListeners();
        },

        initQualityListeners() {
            this.container.querySelectorAll('.quality-item').forEach(el => {
                el.addEventListener('click', () => {
                    this.playVideo({
                        url: el.dataset.url,
                        quality: el.dataset.quality,
                        translator: el.dataset.translator
                    });
                });
            });
        },

        playVideo(source) {
            Lampa.Player.play({
                url: source.url,
                title: `HDRezka - ${source.quality}`,
                params: {
                    quality: source.quality,
                    translator: source.translator
                }
            });
        }
    });

    Lampa.Manifest.addPlugin({
        name: 'HDRezka',
        description: 'Плагин для просмотра контента с HDRezka.ag',
        version: '1.0',
        component: 'hdrezka',
        onLaunch: (movie) => {
            Lampa.Activity.push({
                component: 'hdrezka',
                movie: movie,
                url: movie.url
            });
        }
    });

    console.log('HDRezka Plugin loaded');
})();
