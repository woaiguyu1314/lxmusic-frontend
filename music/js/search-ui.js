/* =============================================================================
 * search-ui.js —— 参考页风格的搜索页（第三步）
 * -----------------------------------------------------------------------------
 * · 大搜索框 + 歌曲/歌手/专辑/歌单 四个分栏 + 热搜/联想词
 * · 数据全部走本服务后端接口；歌曲行、封面卡、弹层沿用参考页样式
 * · 原搜索页 DOM 仍然保留（仅隐藏），切换逻辑与原有功能不受影响
 * ========================================================================== */
(function () {
    'use strict';

    var API = '/api/music';
    var PLACEHOLDER = '/music/assets/logo.svg';
    var PAGE_SIZE = 20;

    var S = {
        tab: 'song',
        keyword: '',
        page: 1,
        loading: false,
        list: [],
        tips: [],
        hot: [],
        history: []
    };

    var root = null, input = null, body = null, tipsBox = null, clearBtn = null;

    function $(sel, r) { return (r || document).querySelector(sel); }
    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }
    function source() {
        return (window.AqUI && typeof window.AqUI.source === 'function') ? window.AqUI.source() : 'tx';
    }
    function platName(code) {
        return { tx: 'QQ', wy: '网易', kg: '酷狗', kw: '酷我', mg: '咪咕' }[code] || code;
    }
    function toast(msg) {
        if (window.AqUI && window.AqUI.toast) window.AqUI.toast(msg);
    }
    function img(attrs) {
        return '<img ' + attrs + ' loading="lazy" referrerpolicy="no-referrer" ' +
            'onerror="this.onerror=null;this.src=\'' + PLACEHOLDER + '\'">';
    }
    function apiGet(path) {
        return fetch(API + path, { headers: { 'Accept': 'application/json' } }).then(function (res) {
            return res.json().then(function (data) {
                if (!res.ok || (data && data.error)) {
                    var err = new Error((data && data.error) || ('HTTP ' + res.status));
                    err.payload = data;
                    throw err;
                }
                return data;
            });
        });
    }

    /* -------------------------------- 界面骨架 -------------------------------- */

    function build() {
        var view = document.getElementById('view-search');
        if (!view || document.getElementById('aqSearch')) return;
        root = document.createElement('div');
        root.id = 'aqSearch';
        root.className = 'aq-search';
        root.innerHTML = '' +
            /* 与参考页一致的搜索页结构：搜索框 + 热搜 + 歌曲/歌手/歌单 标签 + 结果 */
            '<div class="search-field">' +
            '  <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"></circle><path d="M21 21l-4.3-4.3"></path></svg>' +
            '  <input id="aqSearchInput" type="search" placeholder="歌曲、歌手、歌单" enterkeyhint="search" autocomplete="off">' +
            '  <button type="button" id="aqSearchClear" class="aq-search-clear hide" title="清空">✕</button>' +
            '</div>' +
            '<div class="aq-tipbox hide" id="aqSearchTips"></div>' +
            '<div class="chip-row" id="aqSearchChips" style="justify-content:flex-start"></div>' +
            '<div class="search-tabs" id="aqSearchTabs">' +
            '  <button type="button" class="search-tab on" data-tab="song">歌曲</button>' +
            '  <button type="button" class="search-tab" data-tab="singer">歌手</button>' +
            '  <button type="button" class="search-tab" data-tab="playlist">歌单</button>' +
            '</div>' +
            '<div id="aqSearchBody" class="aq-search-body"></div>';
        view.appendChild(root);

        input = $('#aqSearchInput');
        body = $('#aqSearchBody');
        tipsBox = $('#aqSearchTips');
        clearBtn = $('#aqSearchClear');

        input.addEventListener('input', onInput);
        input.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                clearTimeout(tipsTimer);
                hideTips();
                runSearch(1);
            }
        });
        clearBtn.addEventListener('click', function () {
            input.value = '';
            S.keyword = '';
            clearBtn.classList.add('hide');
            hideTips();
            renderEmpty();
        });
        root.querySelectorAll('#aqSearchTabs .search-tab').forEach(function (b) {
            b.addEventListener('click', function () {
                root.querySelectorAll('#aqSearchTabs .search-tab').forEach(function (x) {
                    x.classList.toggle('on', x === b);
                });
                S.tab = b.dataset.tab;
                if (S.keyword) runSearch(1);
                else renderEmpty();
            });
        });

        renderEmpty();
    }

    /* -------------------------------- 空态 / 热搜 -------------------------------- */

    function loadHistory() {
        try {
            var arr = JSON.parse(localStorage.getItem('aq_search_history') || '[]');
            return Array.isArray(arr) ? arr : [];
        } catch (e) { return []; }
    }

    function pushHistory(kw) {
        if (!kw) return;
        var arr = loadHistory().filter(function (x) { return x !== kw; });
        arr.unshift(kw);
        localStorage.setItem('aq_search_history', JSON.stringify(arr.slice(0, 12)));
    }

    function renderEmpty() {
        if (!body) return;
        S.history = loadHistory();
        var chips = $('#aqSearchChips');
        if (chips) {
            chips.classList.remove('hide');
            chips.innerHTML = '<div class="aq-loading" style="padding:12px 0">加载热搜…</div>';
        }
        body.innerHTML = '<div class="empty">搜索 ' + esc(platName(source())) + ' 曲库 · 歌曲、歌手、歌单</div>';

        apiGet('/hotSearch?source=' + source()).then(function (data) {
            S.hot = (data && data.list) || [];
            var box = $('#aqSearchChips');
            if (!box) return;
            box.innerHTML = S.hot.length
                ? S.hot.slice(0, 24).map(function (k) {
                    return '<button class="chip" data-kw="' + esc(k) + '">' + esc(k) + '</button>';
                }).join('')
                : '<div class="empty" style="padding:8px 0;font-size:13px">该源暂无热搜</div>';
            box.querySelectorAll('.chip[data-kw]').forEach(function (c) {
                c.addEventListener('click', function () { searchNow(c.dataset.kw); });
            });
        }).catch(function () {
            var box = $('#aqSearchChips');
            if (box) box.innerHTML = '<div class="empty" style="padding:8px 0;font-size:13px">热搜暂不可用</div>';
        });
    }

    function searchNow(kw) {
        if (!kw) return;
        clearTimeout(tipsTimer);
        hideTips();
        input.value = kw;
        S.keyword = kw;
        clearBtn.classList.remove('hide');
        runSearch(1);
    }

    /* --------------------------------- 联想词 --------------------------------- */

    var tipsTimer = null;

    function onInput() {
        var kw = input.value.trim();
        S.keyword = kw;
        clearBtn.classList.toggle('hide', !kw);
        var chips = $('#aqSearchChips');
        if (chips) chips.classList.toggle('hide', !!kw);
        clearTimeout(tipsTimer);
        if (!kw) { hideTips(); renderEmpty(); return; }
        tipsTimer = setTimeout(function () {
            /* 期间如果已经发起了搜索或关键词又变了，就不再弹联想词 */
            if (input.value.trim() !== kw || S.list.length) return;
            apiGet('/tipSearch?name=' + encodeURIComponent(kw) + '&source=' + source()).then(function (list) {
                if (input.value.trim() !== kw) return;
                S.tips = (list || []).slice(0, 8);
                if (!S.tips.length) { hideTips(); return; }
                tipsBox.innerHTML = S.tips.map(function (t) {
                    return '<div class="aq-tip" data-kw="' + esc(t) + '"><i class="fas fa-search"></i>' + esc(t) + '</div>';
                }).join('');
                tipsBox.classList.remove('hide');
                tipsBox.querySelectorAll('.aq-tip').forEach(function (el) {
                    el.addEventListener('click', function () { searchNow(el.dataset.kw); });
                });
            }).catch(function () { hideTips(); });
        }, 260);
    }

    function hideTips() {
        if (tipsBox) {
            tipsBox.classList.add('hide');
            tipsBox.innerHTML = '';
        }
    }

    /* ---------------------------------- 搜索 ---------------------------------- */

    function endpointFor(tab, kw, page) {
        if (tab === 'playlist') {
            return '/songList/search?source=' + source() + '&text=' + encodeURIComponent(kw) +
                '&page=' + page + '&limit=' + PAGE_SIZE;
        }
        if (tab === 'singer' || tab === 'album') {
            /* 后端对歌手/专辑搜索的条数有上限（传太大会返回空），这里固定 20 */
            return '/search?name=' + encodeURIComponent(kw) + '&source=' + source() +
                '&type=' + tab + '&page=' + page + '&limit=20';
        }
        return '/search?name=' + encodeURIComponent(kw) + '&source=' + source() +
            '&type=song&page=' + page + '&limit=' + PAGE_SIZE;
    }

    function runSearch(page) {
        if (!S.keyword) { renderEmpty(); return; }
        var tab = S.tab;
        S.loading = true;
        if (page === 1) {
            S.list = [];
            body.innerHTML = '<div class="aq-loading">搜索中…</div>';
        }
        var more = $('#aqMoreBtn');
        if (more) more.textContent = '加载中…';

        apiGet(endpointFor(tab, S.keyword, page)).then(function (data) {
            var list = (data && data.list) ? data.list : (data || []);
            if (!Array.isArray(list)) list = [];
            S.page = page;
            S.list = (page === 1) ? list : S.list.concat(list);
            S.loading = false;
            if (page === 1) pushHistory(S.keyword);
            paint();
        }).catch(function (err) {
            S.loading = false;
            var msg = err && err.message ? err.message : '搜索失败';
            var hint = '';
            if (/does not support/i.test(msg)) {
                hint = (tab === 'singer' ? '该音源不支持歌手搜索' : tab === 'album' ? '该音源不支持专辑搜索' : '该音源不支持该搜索类型') +
                    '，可在顶部切到 QQ 或网易再试。';
            }
            body.innerHTML = '<div class="empty" style="padding:26px">' + esc(hint || ('搜索失败：' + msg)) + '</div>' +
                (hint ? '' : '<div style="text-align:center"><button type="button" class="aq-btn ghost" id="aqRetryBtn">重试</button></div>');
            var retry = $('#aqRetryBtn');
            if (retry) retry.addEventListener('click', function () { runSearch(page); });
        });
    }

    function paint() {
        if (!body) return;
        if (!S.list.length) {
            body.innerHTML = '<div class="empty" style="padding:26px">在 ' + esc(platName(source())) +
                ' 没有找到「' + esc(S.keyword) + '」的相关结果</div>';
            return;
        }
        if (S.tab === 'song') paintSongs();
        else if (S.tab === 'singer') paintSingers();
        else paintPlaylists();
    }

    function paintSongs() {
        body.innerHTML = '<div class="aq-songlist" id="aqSongList">' +
            S.list.map(songRow).join('') + '</div>' + moreBtn();
        document.querySelectorAll('#aqSongList .song').forEach(function (row) {
            row.addEventListener('click', function () {
                var idx = parseInt(row.dataset.idx, 10) || 0;
                if (typeof window.updatePlaylist === 'function') {
                    window.updatePlaylist(S.list.slice(), idx, 'network');
                }
            });
        });
        wireMore();
    }

    function songRow(song, i) {
        return '' +
            '<div class="song" data-idx="' + i + '">' +
            img('class="song-art" src="' + esc(song.img || song.picUrl || PLACEHOLDER) + '" alt=""') +
            '<div class="song-meta">' +
            '<div class="song-name">' + esc(song.name) + '</div>' +
            '<div class="song-sub"><span class="song-src">' + esc(platName(song.source)) + '</span>' +
            '<span class="song-sub-text">' + esc(song.singer || song.artist || '未知') +
            (song.albumName ? ' · ' + esc(song.albumName) : '') + '</span></div>' +
            '</div>' +
            '<button class="song-more" aria-label="播放">▶</button>' +
            '</div>';
    }

    function paintSingers() {
        body.innerHTML = '<div class="aq-artist-grid">' +
            S.list.map(function (a, i) {
                return '<div class="aq-artist-item" data-idx="' + i + '">' +
                    img('src="' + esc(a.picUrl || a.img || PLACEHOLDER) + '" alt=""') +
                    '<div class="n">' + esc(a.name) + '</div></div>';
            }).join('') + '</div>' + moreBtn();
        body.querySelectorAll('.aq-artist-item').forEach(function (el) {
            el.addEventListener('click', function () {
                var a = S.list[parseInt(el.dataset.idx, 10)];
                if (a) openArtist(a);
            });
        });
        wireMore();
    }

    function paintAlbums() {
        body.innerHTML = '<div class="pl-grid" style="grid-template-columns:repeat(3,1fr)">' +
            S.list.map(function (a, i) {
                return '<div class="pl-card" data-idx="' + i + '">' +
                    img('class="pl-card-cover" src="' + esc(a.picUrl || a.img || PLACEHOLDER) + '" alt=""') +
                    '<div class="pl-card-name">' + esc(a.name) + '</div>' +
                    '<div class="pl-card-src">' + esc(a.artistName || a.singer || '') + '</div></div>';
            }).join('') + '</div>' + moreBtn();
        body.querySelectorAll('.pl-card').forEach(function (el) {
            el.addEventListener('click', function () {
                var a = S.list[parseInt(el.dataset.idx, 10)];
                if (a) openAlbum(a);
            });
        });
        wireMore();
    }

    function paintPlaylists() {
        body.innerHTML = '<div class="pl-grid" style="grid-template-columns:repeat(3,1fr)">' +
            S.list.map(function (p, i) {
                return '<div class="pl-card" data-idx="' + i + '">' +
                    img('class="pl-card-cover" src="' + esc(p.img || PLACEHOLDER) + '" alt=""') +
                    '<div class="pl-card-name">' + esc(p.name) + '</div>' +
                    '<div class="pl-card-src">' + esc(p.author || p.play_count || '') + '</div></div>';
            }).join('') + '</div>' + moreBtn();
        body.querySelectorAll('.pl-card').forEach(function (el) {
            el.addEventListener('click', function () {
                var p = S.list[parseInt(el.dataset.idx, 10)];
                if (p && window.AqUI && window.AqUI.openPlaylist) {
                    window.AqUI.openPlaylist({ id: p.id, name: p.name, img: p.img });
                }
            });
        });
        wireMore();
    }

    function moreBtn() {
        return '<div style="text-align:center;padding:14px 0 4px">' +
            '<button type="button" class="aq-btn ghost" id="aqMoreBtn">加载更多</button></div>';
    }

    function wireMore() {
        var btn = $('#aqMoreBtn');
        if (!btn) return;
        btn.addEventListener('click', function () { runSearch(S.page + 1); });
    }

    /* ------------------------------ 歌手 / 专辑详情 ------------------------------ */

    function openArtist(a) {
        toast('加载「' + a.name + '」…');
        apiGet('/artistSongs?id=' + encodeURIComponent(a.id) + '&source=' + source() + '&order=hot&page=1')
            .then(function (data) {
                var list = (data && data.list) ? data.list : (data || []);
                if (!Array.isArray(list)) list = [];
                list = list.slice(0, 100);
                if (!list.length) { toast('暂无歌曲'); return; }
                if (window.AqUI && window.AqUI.openSongs) {
                    window.AqUI.openSongs(a.name, platName(source()) + ' · 热门歌曲 ' + list.length + ' 首',
                        a.picUrl || a.img || PLACEHOLDER, list);
                }
            })
            .catch(function (e) { toast('加载失败：' + e.message); });
    }

    function openAlbum(a) {
        toast('加载「' + a.name + '」…');
        apiGet('/albumSongs?id=' + encodeURIComponent(a.id) + '&source=' + source() + '&page=1')
            .then(function (data) {
                var list = (data && data.list) ? data.list : (data || []);
                if (!Array.isArray(list)) list = [];
                if (!list.length) { toast('暂无歌曲'); return; }
                if (window.AqUI && window.AqUI.openSongs) {
                    window.AqUI.openSongs(a.name, (a.artistName ? a.artistName + ' · ' : '') + list.length + ' 首',
                        a.picUrl || a.img || PLACEHOLDER, list);
                }
            })
            .catch(function (e) { toast('加载失败：' + e.message); });
    }

    /* --------------------------------- 初始化 --------------------------------- */

    function init() {
        try {
            build();
            /* 音源变化时刷新热搜与已有关键词结果 */
            var lastSource = source();
            setInterval(function () {
                var cur = source();
                if (cur !== lastSource) {
                    lastSource = cur;
                    if (S.keyword) runSearch(1);
                    else renderEmpty();
                }
            }, 1000);
        } catch (e) {
            console.warn('[AQ] 搜索页初始化失败', e);
        }
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else setTimeout(init, 0);
})();
