<script>
    (function() {
        // ========== DOM-элементы ==========
        const searchCenter = document.getElementById('searchCenter');
        const searchInput = document.getElementById('searchInput');
        const searchBtn = document.getElementById('searchBtn');
        const resultsContainer = document.getElementById('resultsContainer');
        const resultsScroll = document.getElementById('resultsScroll');
        const statusBar = document.getElementById('statusBar');
        const statusDot = document.getElementById('statusDot');
        const statusText = document.getElementById('statusText');
        const footer = document.getElementById('footer');
        const readerOverlay = document.getElementById('readerOverlay');
        const readerContent = document.getElementById('readerContent');
        const readerClose = document.getElementById('readerClose');
        const hintSpans = document.querySelectorAll('.search-hint span[data-query]');

        let currentResults = [];
        let isSearching = false;
        let hasSearched = false;

        // ========== Фон: частицы ==========
        const particlesEl = document.getElementById('particles');
        for (let i = 0; i < 30; i++) {
            const p = document.createElement('div');
            p.classList.add('particle');
            p.style.left = Math.random() * 100 + '%';
            p.style.animationDelay = Math.random() * 10 + 's';
            p.style.animationDuration = (7 + Math.random() * 8) + 's';
            particlesEl.appendChild(p);
        }

        // ========== Статус-бар ==========
        function setStatus(text, searching = false) {
            statusText.textContent = text;
            statusBar.classList.add('visible');
            statusDot.classList.toggle('searching', searching);
        }

        // ========== Перемещение поиска наверх ==========
        function moveSearchTop() {
            if (!hasSearched) {
                hasSearched = true;
                searchCenter.classList.add('top');
                resultsScroll.classList.add('active');
                footer.classList.add('active');
            }
        }

        // ========== Кнопка поиска (loading) ==========
        function setSearching(state) {
            isSearching = state;
            if (state) {
                searchBtn.classList.add('loading');
                searchBtn.disabled = true;
            } else {
                searchBtn.classList.remove('loading');
                searchBtn.disabled = false;
            }
        }

        // ========== Главная функция поиска ==========
        async function doSearch(query) {
            if (isSearching) return;
            if (!query || query.trim().length === 0) return;

            query = query.trim();
            searchInput.value = query;
            moveSearchTop();
            setSearching(true);
            resultsContainer.innerHTML = '';
            currentResults = [];
            setStatus(`Ищем: "${query}"`, true);

            try {
                const results = await searchMultipleSources(query);
                currentResults = results;
                renderResults(results);
                if (results.length === 0) {
                    setStatus('Ничего не найдено');
                } else {
                    setStatus(`Найдено: ${results.length}`);
                }
                resultsScroll.scrollTop = 0;
            } catch (err) {
                console.error('Ошибка поиска:', err);
                setStatus('Ошибка поиска');
                resultsContainer.innerHTML = `
                    <div class="empty-state">
                        <div class="empty-icon">⚠️</div>
                        <div class="empty-title">Не удалось выполнить поиск</div>
                        <div class="empty-sub">Проверьте соединение или попробуйте другой запрос</div>
                    </div>`;
            }
            setSearching(false);
        }

        // ========== Обработчики событий поиска ==========
        searchBtn.addEventListener('click', () => {
            const q = searchInput.value.trim();
            if (q) doSearch(q);
        });

        searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                const q = searchInput.value.trim();
                if (q) doSearch(q);
            }
        });

        hintSpans.forEach(span => {
            span.addEventListener('click', () => {
                const q = span.getAttribute('data-query');
                if (q) doSearch(q);
            });
        });

        // ========== Поиск по источникам (РФ) ==========
        async function searchMultipleSources(query) {
            const allResults = [];

            // --- DuckDuckGo API ---
            try {
                const ddgUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1&t=getcool`;
                const ddgResp = await fetch(ddgUrl, { signal: AbortSignal.timeout(5000) });
                if (ddgResp.ok) {
                    const ddgData = await ddgResp.json();
                    if (ddgData.AbstractURL && ddgData.AbstractText && ddgData.AbstractText.length > 20) {
                        allResults.push({
                            url: ddgData.AbstractURL,
                            title: ddgData.Heading || query,
                            snippet: ddgData.AbstractText,
                            source: 'ddg',
                            canClean: true,
                        });
                    }
                    if (ddgData.RelatedTopics && Array.isArray(ddgData.RelatedTopics)) {
                        for (const topic of ddgData.RelatedTopics) {
                            if (topic.FirstURL && topic.Text && !allResults.find(ex => ex.url === topic.FirstURL)) {
                                allResults.push({
                                    url: topic.FirstURL,
                                    title: topic.Text.split(' - ')[0] || topic.Text,
                                    snippet: topic.Text,
                                    source: 'ddg',
                                    canClean: true,
                                });
                            }
                            if (allResults.length >= 15) break;
                        }
                    }
                    if (ddgData.Results && Array.isArray(ddgData.Results)) {
                        for (const r of ddgData.Results) {
                            if (r.FirstURL && r.Text && !allResults.find(ex => ex.url === r.FirstURL)) {
                                allResults.push({
                                    url: r.FirstURL,
                                    title: r.Text.split(' - ')[0] || r.Text,
                                    snippet: r.Text,
                                    source: 'ddg',
                                    canClean: true,
                                });
                            }
                            if (allResults.length >= 20) break;
                        }
                    }
                }
            } catch (e) {
                console.warn('DuckDuckGo API недоступен:', e.message);
            }

            // --- Wikipedia API ---
            if (allResults.length < 15) {
                try {
                    const wikiUrl = `https://ru.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&origin=*&srlimit=15`;
                    const wikiResp = await fetch(wikiUrl, { signal: AbortSignal.timeout(5000) });
                    if (wikiResp.ok) {
                        const wikiData = await wikiResp.json();
                        if (wikiData.query && wikiData.query.search) {
                            for (const page of wikiData.query.search) {
                                const pageUrl = `https://ru.wikipedia.org/wiki/${encodeURIComponent(page.title.replace(/ /g, '_'))}`;
                                if (!allResults.find(ex => ex.url === pageUrl)) {
                                    allResults.push({
                                        url: pageUrl,
                                        title: page.title + ' — Википедия',
                                        snippet: page.snippet ? page.snippet.replace(/<\/?[^>]+(>|$)/g, '') : '',
                                        source: 'wiki',
                                        canClean: true,
                                    });
                                }
                            }
                        }
                    }
                } catch (e) {
                    console.warn('Wikipedia API недоступен:', e.message);
                }
            }

            // --- Google CSE ---
            if (allResults.length < 10) {
                try {
                    const googleUrl = `https://www.googleapis.com/customsearch/v1?key=AIzaSyCJxYq5Vw0P2mPm0h6Kq8V3h0n0qO1hK9w&cx=017576662512468239146:omuauf_lfve&q=${encodeURIComponent(query)}&num=10`;
                    const googleResp = await fetch(googleUrl, { signal: AbortSignal.timeout(5000) });
                    if (googleResp.ok) {
                        const googleData = await googleResp.json();
                        if (googleData.items && Array.isArray(googleData.items)) {
                            for (const item of googleData.items) {
                                if (item.link && item.title && !allResults.find(ex => ex.url === item.link)) {
                                    allResults.push({
                                        url: item.link,
                                        title: item.title,
                                        snippet: item.snippet || '',
                                        source: 'google',
                                        canClean: true,
                                    });
                                }
                                if (allResults.length >= 25) break;
                            }
                        }
                    }
                } catch (e) {
                    console.warn('Google CSE недоступен:', e.message);
                }
            }

            // --- SearXNG ---
            if (allResults.length < 10) {
                const searxInstances = [
                    'https://searx.be/search?format=json&q=',
                    'https://search.bus-hit.me/search?format=json&q=',
                    'https://searx.si/search?format=json&q=',
                    'https://searx.ro/search?format=json&q=',
                    'https://searx.fmac.xyz/search?format=json&q=',
                ];
                const shuffled = searxInstances.sort(() => Math.random() - 0.5).slice(0, 2);
                for (const baseUrl of shuffled) {
                    try {
                        const url = baseUrl + encodeURIComponent(query);
                        const resp = await fetch(url, { signal: AbortSignal.timeout(4000) });
                        if (!resp.ok) continue;
                        const data = await resp.json();
                        if (data.results && Array.isArray(data.results)) {
                            for (const r of data.results) {
                                if (r.url && r.title && !allResults.find(ex => ex.url === r.url)) {
                                    allResults.push({
                                        url: r.url,
                                        title: r.title || 'Без названия',
                                        snippet: r.content || r.snippet || '',
                                        source: 'web',
                                        canClean: true,
                                    });
                                }
                            }
                        }
                        if (allResults.length >= 20) break;
                    } catch (e) {
                        console.warn('SearXNG недоступен:', baseUrl);
                    }
                }
            }

            // Убираем дубликаты
            const unique = [];
            const seen = new Set();
            for (const r of allResults) {
                if (!seen.has(r.url) && r.url.startsWith('http')) {
                    seen.add(r.url);
                    unique.push(r);
                }
            }
            return unique.slice(0, 25);
        }

        // ========== Рендер результатов ==========
        function renderResults(results) {
            resultsContainer.innerHTML = '';
            if (results.length === 0) {
                resultsContainer.innerHTML = `
                    <div class="empty-state">
                        <div class="empty-icon">🔍</div>
                        <div class="empty-title">Ничего не найдено</div>
                        <div class="empty-sub">Попробуйте изменить запрос</div>
                    </div>`;
                return;
            }
            results.forEach(r => {
                const card = document.createElement('div');
                card.classList.add('result-card');
                card.innerHTML = `
                    <span class="result-badge">Чисто</span>
                    <div class="result-url">${escapeHTML(truncateUrl(r.url))}</div>
                    <div class="result-title">${escapeHTML(r.title)}</div>
                    <div class="result-snippet">${escapeHTML(r.snippet || 'Описание недоступно')}</div>`;
                card.addEventListener('click', () => openReader(r.url, r.title));
                resultsContainer.appendChild(card);
            });
        }

        // ========== Ридер (очистка страницы) ==========
        async function openReader(url, fallbackTitle) {
            readerOverlay.classList.add('open');
            readerContent.innerHTML = `
                <div class="reader-loading">
                    <div class="reader-spinner"></div>
                    Загружаем чистую версию...
                </div>`;

            try {
                const proxyUrl = 'https://api.allorigins.win/raw?url=' + encodeURIComponent(url);
                const resp = await fetch(proxyUrl, { signal: AbortSignal.timeout(8000) });
                if (!resp.ok) throw new Error('Недоступно');
                const html = await resp.text();

                const parser = new DOMParser();
                const doc = parser.parseFromString(html, 'text/html');
                doc.querySelectorAll('script, style, iframe, noscript, [class*="ad"], [id*="ad"], [class*="banner"], [id*="banner"], .popup, .modal')
                    .forEach(el => el.remove());

                const title = doc.querySelector('h1')?.textContent ||
                    doc.querySelector('title')?.textContent ||
                    fallbackTitle;
                const article = doc.querySelector('article') || doc.querySelector('main') || doc.body;
                const paragraphs = article.querySelectorAll('p, h2, h3, li');
                let contentHTML = `<h1>${escapeHTML(title.trim())}</h1>`;

                if (paragraphs.length > 0) {
                    paragraphs.forEach(el => {
                        const tag = el.tagName.toLowerCase();
                        const text = el.textContent.trim();
                        if (text.length > 15) {
                            if (tag === 'h2') contentHTML += `<h2 style="font-size:18px;margin-top:18px;">${escapeHTML(text)}</h2>`;
                            else if (tag === 'h3') contentHTML += `<h3 style="font-size:15px;margin-top:14px;">${escapeHTML(text)}</h3>`;
                            else if (tag === 'li') contentHTML += `<li style="margin-left:18px;">${escapeHTML(text)}</li>`;
                            else contentHTML += `<p>${escapeHTML(text)}</p>`;
                        }
                    });
                } else {
                    const bodyText = article.textContent.replace(/\s+/g, ' ').trim();
                    contentHTML += `<p>${escapeHTML(bodyText.substring(0, 4000))}</p>`;
                }

                contentHTML += `<p style="margin-top:20px;font-size:11px;color:#94a3b8;">Источник: <a href="${escapeHTML(url)}" target="_blank" rel="noopener" style="color:#60a5fa;">${escapeHTML(truncateUrl(url))}</a></p>`;
                readerContent.innerHTML = contentHTML;
            } catch (err) {
                console.error('Ошибка ридера
