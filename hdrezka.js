(function($) {
    'use strict';

    // Удаляем весь код, связанный с snowfall и внешними API
    $.fn.hdrezkaPlayer = function(options) {
        const settings = $.extend({
            containerClass: 'hdrezka-player',
            apiUrl: 'https://hdrezka.ag/ajax/',
            defaultQuality: '720p',
            autoplay: false
        }, options);

        // Инициализация плеера
        this.each(function() {
            const container = $(this);
            let playerInstance = null;

            // Создаем базовую структуру плеера
            const initPlayer = () => {
                container.html(`
                    <div class="${settings.containerClass}">
                        <video controls class="video-element" style="width:100%"></video>
                        <div class="playlist-container"></div>
                    </div>
                `);

                playerInstance = {
                    video: container.find('.video-element')[0],
                    playlist: container.find('.playlist-container'),
                    currentSource: null,
                    loadVideo: function(url) {
                        this.video.src = url;
                        if (settings.autoplay) this.video.play();
                    }
                };
            };

            // Метод для поиска контента
            const searchContent = async (query) => {
                try {
                    const response = await $.ajax({
                        url: settings.apiUrl + 'search',
                        method: 'POST',
                        data: { q: query }
                    });
                    return response.results;
                } catch (error) {
                    console.error('Search error:', error);
                }
            };

            // Метод для получения видео-потока
            const getVideoStream = async (id) => {
                try {
                    const response = await $.ajax({
                        url: settings.apiUrl + 'get_movie',
                        method: 'POST',
                        data: { id: id, quality: settings.defaultQuality }
                    });
                    return response.stream_url;
                } catch (error) {
                    console.error('Stream error:', error);
                }
            };

            // Инициализация
            initPlayer();

            // Публичные методы
            container.data('hdrezkaPlayer', {
                search: searchContent,
                play: (id) => {
                    getVideoStream(id).then(url => {
                        playerInstance.loadVideo(url);
                    });
                },
                destroy: () => {
                    container.empty();
                    playerInstance = null;
                }
            });
        });

        return this;
    };

})(jQuery);

// Пример использования:
// $('#player').hdrezkaPlayer({autoplay: true});
// $('#player').data('hdrezkaPlayer').search('Matrix').then(results => {...});
