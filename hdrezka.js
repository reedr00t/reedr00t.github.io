// hdrezka.lampa.plugin.js
(function() {
    'use strict';

    const CORS_PROXY = 'https://cors.convert2.net/'; // Альтернативный прокси
    const HDREZKA_DOMAIN = 'https://hdrezka.ag';
    const USER_AGENT = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36';

    // Регистрация плагина
    Lampa.Plugin.add({
        name: 'hdrezka_online',
        title: 'HDRezka',
        description: 'Онлайн-просмотр с HDRezka.ag',
        version: '1.0',
        component: 'HdRezkaComponent',
        icon: 'https://i.imgur.com/5ZJQZ9Q.png',
        onLaunch: function(item) {
            Lampa.Activity.push({
                component: 'HdRezkaComponent',
                url: item.url,
                title: item.title,
                movie: item
            });
        }
    });

    // Компонент плеера
    Lampa.Component.add('HdRezkaComponent', {
        init() {
            this.state = {
                loading: true,
                seasons: [],
                current: {
                    season: null,
                    episode: null,
                    sources: []
                }
            };
        },

        template: `
            <div class="hdrezka-container">
                <div class="hdrezka-loader" v-if="state.loading"></div>
                
                <div class="hdrezka-content" v-if="!state.loading">
                    <div class="hdrezka-season-selector">
                        <div class="season-item" 
                            v-for="season in state.seasons" 
                            @click="selectSeason(season)"
                            :class="{active: season.id === current.season?.id}">
                            {{ season.title }}
                        </div>
                    </div>

                    <div class="hdrezka-episode-list" v-if="current.season">
                        <div class="episode-item"
                            v-for="episode in current.season.episodes"
                            @click="loadEpisode(episode)"
                            :class="{active: episode.id === current.episode?.id}">
                            {{ episode.title }}
                        </div>
                    </div>

                    <div class="hdrezka-quality-selector" v-if="current.sources.length">
                        <div class="quality-item"
                            v-for="source in current.sources"
                            @click="playVideo(source)">
                            {{ source.quality }} ({{ source.translator }})
                        </div>
                    </div>
                </div>
            </div>
        `,

        async mounted() {
            try {
                const html = await this.fetchData(this.$props.url);
                this.state.seasons = this.parseSeasons(html);
                this.state.loading = false;
            } 
            catch (e) {
                Lampa.Noty.show('Ошибка загрузки данных');
                console.error(e);
            }
        },

        methods: {
            async fetchData(url) {
                try {
                    const response = await fetch(CORS_PROXY + url, {
                        headers: {'User-Agent': USER_AGENT}
                    });
                    return await response.text();
                } 
                catch (e) {
                    throw new Error('Ошибка сети');
                }
            },

            parseSeasons(html) {
                const parser = new DOMParser();
                const doc = parser.parseFromString(html, 'text/html');
                
                return Array.from(doc.querySelectorAll('.b-simple_season__item')).map(season => ({
                    id: season.dataset.tab_id,
                    title: season.textContent.trim(),
                    episodes: Array.from(season.querySelectorAll('.b-simple_episode__item')).map(episode => ({
                        id: episode.dataset.episode_id,
                        title: episode.textContent.trim(),
                        url: HDREZKA_DOMAIN + episode.querySelector('a').getAttribute('href')
                    }))
                }));
            },

            async loadEpisode(episode) {
                try {
                    const html = await this.fetchData(episode.url);
                    const sources = this.parseSources(html);
                    
                    this.current.episode = episode;
                    this.current.sources = sources;
                } 
                catch (e) {
                    Lampa.Noty.show('Ошибка загрузки эпизода');
                }
            },

            parseSources(html) {
                const match = html.match(/\[(\{.*?\})\]/);
                try {
                    return JSON.parse(match[0])
                        .filter(s => s.url.match(/\.(m3u8|mp4)/))
                        .map(s => ({
                            url: s.url,
                            quality: s.quality || 'HD',
                            translator: s.translator || 'Оригинал'
                        }));
                } 
                catch (e) {
                    return [];
                }
            },

            playVideo(source) {
                Lampa.Player.play({
                    url: source.url,
                    title: this.$props.title,
                    params: {
                        quality: source.quality,
                        translator: source.translator,
                        season: this.current.season?.title,
                        episode: this.current.episode?.title
                    }
                });
            }
        }
    });

    // Интеграция с поиском
    Lampa.Search.addSource({
        title: 'HDRezka',
        params: { lazy: true },

        async search({ query }) {
            try {
                const html = await fetch(CORS_PROXY + HDREZKA_SEARCH + encodeURIComponent(query), {
                    headers: { 'User-Agent': USER_AGENT }
                });
                const parser = new DOMParser();
                const doc = parser.parseFromString(html, 'text/html');

                return Array.from(doc.querySelectorAll('.b-content__inline_item')).map(item => ({
                    title: item.querySelector('.title').textContent,
                    year: item.querySelector('.year').textContent,
                    url: HDREZKA_DOMAIN + item.querySelector('a').href,
                    poster: item.querySelector('img').src,
                    type: item.querySelector('.info').textContent.includes('Сериал') ? 'tv' : 'movie'
                }));
            } 
            catch (e) {
                return [];
            }
        }
    });

    // Стили
    const styles = `
        .hdrezka-container {
            padding: 20px;
            color: #fff;
        }
        
        .hdrezka-season-selector,
        .hdrezka-episode-list {
            display: grid;
            gap: 10px;
            margin-bottom: 20px;
        }
        
        .season-item,
        .episode-item {
            padding: 12px;
            background: rgba(255,255,255,0.1);
            border-radius: 8px;
            cursor: pointer;
            transition: 0.3s;
        }
        
        .season-item:hover,
        .episode-item:hover {
            background: rgba(255,255,255,0.2);
        }
        
        .quality-item {
            padding: 8px 12px;
            background: #2196F3;
            border-radius: 4px;
            margin: 5px;
            cursor: pointer;
        }
    `;

    document.head.insertAdjacentHTML('beforeend', `<style>${styles}</style>`);

    console.log('[HDRezka Plugin] Инициализирован');
})();
