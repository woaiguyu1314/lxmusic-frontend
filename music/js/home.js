/* =============================================================================
 * home.js —— 参考页风格前端（第一步：主页 / 资料库 / 弹层 / 底部标签栏）
 * -----------------------------------------------------------------------------
 * 设计要点：
 *   · 界面与交互参照参考页；数据全部走本服务后端接口（/api/music/*）。
 *   · 不修改后端，也不破坏原有功能：播放、设置、本地音乐等仍由 app.js 提供。
 *   · 只有“当前源”相关的板块会按所选平台取数（与仓库后端平台一致）。
 * ========================================================================== */
(function () {
    'use strict';

    var API = '/api/music';
    var PLACEHOLDER = '/music/assets/logo.svg';
    var SOURCE_KEY = 'aq_source';

    var PLATFORMS = [
        { id: 'tx', name: 'QQ音乐', short: 'QQ' },
        { id: 'wy', name: '网易云', short: '网易' },
        { id: 'kg', name: '酷狗', short: '酷狗' },
        { id: 'kw', name: '酷我', short: '酷我' },
        { id: 'mg', name: '咪咕', short: '咪咕' }
    ];

    /* 主频道池：与参考页一致，点击后按关键词在当前源搜索 */
    var THEME_CHANNELS_ALL = [
        { name: '热歌', mark: '热歌', kw: '热歌榜', g1: '#FF5C8A', g2: '#E8356A' },
        { name: '网络流行', mark: '流行', kw: '网络流行', g1: '#7B5CFF', g2: '#B14DFF' },
        { name: '情歌', mark: '情歌', kw: '情歌', g1: '#FF6B9D', g2: '#E8457A' },
        { name: 'KTV必点', mark: 'KTV', kw: 'KTV必点', g1: '#5B7CFF', g2: '#3D5BDB' },
        { name: '经典', mark: '经典', kw: '经典老歌', g1: '#2C3E6B', g2: '#1A1F3A' },
        { name: '摇滚', mark: '摇滚', kw: '摇滚', g1: '#E85A4A', g2: '#B83020' },
        { name: '古风', mark: '古风', kw: '古风', g1: '#C4A46A', g2: '#8A7040' },
        { name: '官方', mark: '官方', kw: '官方歌单', g1: '#31C27C', g2: '#1A9E5C' },
        { name: '民谣', mark: '民谣', kw: '民谣', g1: '#E8A838', g2: '#C47A18' },
        { name: '电子', mark: '电子', kw: '电子音乐', g1: '#00C2C7', g2: '#008A9A' },
        { name: '说唱', mark: '说唱', kw: '华语说唱', g1: '#FF8A3D', g2: '#E05A10' },
        { name: '轻音乐', mark: '轻音', kw: '轻音乐', g1: '#6BCB77', g2: '#3A9B5A' },
        { name: '粤语', mark: '粤语', kw: '粤语金曲', g1: '#F7B731', g2: '#D4920A' },
        { name: '日语', mark: '日语', kw: '日语流行', g1: '#FF6B81', g2: '#D63A55' },
        { name: '韩语', mark: '韩语', kw: '韩语流行', g1: '#A55EEA', g2: '#7B2CBF' },
        { name: '欧美', mark: '欧美', kw: '欧美流行', g1: '#4B7BEC', g2: '#2F5AD0' },
        { name: '爵士', mark: '爵士', kw: '爵士', g1: '#778CA3', g2: '#4B6584' },
        { name: 'ACG', mark: 'ACG', kw: '动漫歌曲', g1: '#FD79A8', g2: '#E84393' },
        { name: '影视', mark: '影视', kw: '影视原声', g1: '#636E72', g2: '#2D3436' },
        { name: '儿歌', mark: '儿歌', kw: '儿歌', g1: '#55EFC4', g2: '#00B894' },
        { name: '蓝调', mark: '蓝调', kw: '蓝调', g1: '#0984E3', g2: '#0652DD' },
        { name: '乡村', mark: '乡村', kw: '乡村音乐', g1: '#E17055', g2: '#D63031' },
        { name: '拉丁', mark: '拉丁', kw: '拉丁音乐', g1: '#E84393', g2: '#C0392B' },
        { name: '金属', mark: '金属', kw: '金属', g1: '#2D3436', g2: '#000000' }
    ];

    var REC_KW = ['情感歌手', '情歌', '治愈情歌', '伤感情歌', '温柔女声', '热歌', '热门华语', '流行热歌', '华语热歌'];
    var HOT_KW = ['热歌', '抖音', '飙升', '流行', '网络红歌', 'KTV热歌', '励志', '校园'];
    var GUESS_KW = ['热歌', '流行', '华语', '情歌', '经典老歌', '新歌', '轻音乐', '粤语'];
    var RADAR_KW = ['欧美流行', '日语流行', '韩语流行', '电音', '说唱', '民谣', '摇滚', '爵士'];

    // 注：原 OFFICIAL_LIMIT（官方主榜 9 个）与 rankView 双视图已随排行榜统一横滑改造移除
    var S = {
        source: localStorage.getItem(SOURCE_KEY) || 'tx',
        view: 'home',
        chView: 'channel',
        // rankView 已移除（不再有 榜单/排行榜 切换）
        home: { rec: [], hot: [], guess: [], radar: [] },
        pl: { tags: null, tagId: '', list: [], page: 1, loading: false },
        boards: { all: [], loading: false },
        loaded: false
    };

    /* ------------------------------- 小工具 ------------------------------- */

    function $(sel, root) { return (root || document).querySelector(sel); }
    function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }
    function shuffle(arr) {
        var a = (arr || []).slice();
        for (var i = a.length - 1; i > 0; i--) {
            var j = Math.floor(Math.random() * (i + 1));
            var t = a[i]; a[i] = a[j]; a[j] = t;
        }
        return a;
    }
    function uniqSongs(list) {
        var seen = {}, out = [];
        (list || []).forEach(function (s) {
            if (!s) return;
            var k = (s.source || '') + '|' + (s.songmid || s.id || s.name);
            if (seen[k]) return;
            seen[k] = 1;
            out.push(s);
        });
        return out;
    }
    function platName(code) {
        for (var i = 0; i < PLATFORMS.length; i++) if (PLATFORMS[i].id === code) return PLATFORMS[i];
        return { id: code, name: code, short: code };
    }
    function songCover(song) {
        if (!song) return PLACEHOLDER;
        return song.img || song.pic || song.picUrl || (song.meta && song.meta.picUrl) || PLACEHOLDER;
    }
    function playList(list, index) {
        list = uniqSongs(list || []);
        if (!list.length) { toast('没有可播放的歌曲'); return; }
        if (typeof window.updatePlaylist !== 'function') { toast('播放器未就绪'); return; }
        try {
            window.updatePlaylist(list, index || 0, 'network');
        } catch (e) {
            toast('播放失败：' + e.message);
        }
    }
    function toast(msg) {
        var el = $('#aq-toast');
        if (!el) {
            el = document.createElement('div');
            el.id = 'aq-toast';
            el.className = 'aq-toast';
            document.body.appendChild(el);
        }
        el.textContent = msg;
        el.classList.add('show');
        clearTimeout(el._t);
        el._t = setTimeout(function () { el.classList.remove('show'); }, 1800);
    }
    function imgTag(attrs) {
        return '<img ' + attrs + ' loading="lazy" referrerpolicy="no-referrer" ' +
            'onerror="this.onerror=null;this.src=\'' + PLACEHOLDER + '\'">';
    }

    /* ------------------------------- 接口访问 ------------------------------- */

    function apiGet(path) {
        return fetch(API + path, { headers: { 'Accept': 'application/json' } }).then(function (res) {
            if (!res.ok) throw new Error('HTTP ' + res.status);
            return res.json();
        });
    }

    function apiSearch(source, kw, page) {
        return apiGet('/search?name=' + encodeURIComponent(kw) + '&source=' + source +
            '&type=song&page=' + (page || 1) + '&limit=20').then(function (data) {
                return (data && data.list) ? data.list : (data || []);
            });
    }

    function apiHotSearch(source) {
        return apiGet('/hotSearch?source=' + source).then(function (data) {
            return (data && data.list) ? data.list : [];
        });
    }

    function apiTags(source) {
        return apiGet('/songList/tags?source=' + source).then(function (data) {
            return data || {};
        });
    }

    function apiSongList(source, tagId, sortId, page) {
        return apiGet('/songList/list?source=' + source + '&tagId=' + encodeURIComponent(tagId || '') +
            '&sortId=' + (sortId || 'hot') + '&page=' + (page || 1)).then(function (data) {
                return data || {};
            });
    }

    function apiSongListDetail(source, id, page) {
        return apiGet('/songList/detail?source=' + source + '&id=' + encodeURIComponent(id) +
            '&page=' + (page || 1));
    }

    function apiBoards(source) {
        return apiGet('/leaderboard/boards?source=' + source).then(function (data) {
            return (data && data.list) ? data.list : [];
        });
    }

    function apiBoardSongs(source, bangid, page) {
        return apiGet('/leaderboard/list?source=' + source + '&bangid=' + encodeURIComponent(bangid) +
            '&page=' + (page || 1)).then(function (data) {
                return data || {};
            });
    }

    /* --------------------------- 通用卡片 / 行渲染 --------------------------- */

    function songRowHtml(song, index, listKey) {
        return '' +
            '<div class="song" data-idx="' + index + '" data-list="' + esc(listKey) + '">' +
            imgTag('class="song-art" src="' + esc(songCover(song)) + '" alt=""') +
            '<div class="song-meta">' +
            '<div class="song-name">' + esc(song.name) + '</div>' +
            '<div class="song-sub"><span class="song-src">' + esc(platName(song.source).short) + '</span>' +
            '<span class="song-sub-text">' + esc(song.singer || song.artist || '未知') + '</span></div>' +
            '</div>' +
            '<button class="song-more" aria-label="播放">▶</button>' +
            '</div>';
    }

    function albumCardHtml(song) {
        return '' +
            '<div class="album">' +
            imgTag('class="album-art" src="' + esc(songCover(song)) + '" alt=""') +
            '<div class="album-name">' + esc(song.name) + '</div>' +
            '<div class="album-artist">' + esc(song.singer || song.artist || '未知') + '</div>' +
            '</div>';
    }

    function plCardHtml(pl) {
        var sub = '歌单';
        if (pl.play_count) sub = pl.play_count;
        else if (pl.total) sub = pl.total + ' 首';
        return '' +
            '<div class="pl-card" data-id="' + esc(pl.id) + '">' +
            imgTag('class="pl-card-cover" src="' + esc(pl.img || PLACEHOLDER) + '" alt=""') +
            '<div class="pl-card-name">' + esc(pl.name) + '</div>' +
            '<div class="pl-card-src">' + esc(sub) + '</div>' +
            '</div>';
    }

    function rankCardHtml(board) {
        var name = board.name || '榜单';
        /* 后端榜单接口只返回 id/名称，没有封面：无封面时用彩色方块（参考页同款观感） */
        var cover = board.cover || board.img || '';
        var hue = 0;
        for (var i = 0; i < name.length; i++) hue = (hue * 31 + name.charCodeAt(i)) % 360;
        var inner;
        if (cover) {
            inner = imgTag('alt="" src="' + esc(cover) + '"') +
                '<div class="rank-on-cover" style="position:absolute;left:0;right:0;bottom:0;padding:6px 8px;' +
                'font-size:11px;font-weight:700;color:#fff;text-shadow:0 1px 6px rgba(0,0,0,.6);' +
                'background:linear-gradient(transparent,rgba(0,0,0,.55))">' + esc(name) + '</div>';
        } else {
            inner = '<div style="position:absolute;inset:0;display:flex;flex-direction:column;' +
                'align-items:center;justify-content:center;gap:6px;' +
                'background:linear-gradient(145deg,hsl(' + hue + ',72%,58%) 0%,hsl(' + ((hue + 28) % 360) + ',68%,42%) 100%)">' +
                '<div style="font-size:20px;font-weight:800;color:#fff;letter-spacing:-0.02em;' +
                'text-shadow:0 2px 12px rgba(0,0,0,.25);padding:0 6px;text-align:center;line-height:1.2">' +
                esc(name) + '</div>' +
                '<div style="font-size:9px;font-weight:600;letter-spacing:.12em;color:rgba(255,255,255,.72)">CHART</div>' +
                '</div>';
        }
        return '' +
            '<div class="rank-card" data-id="' + esc(board.bangid || board.id) + '">' +
            '<div class="rank-cover">' + inner + '</div>' +
            '<div class="rank-name">' + esc(name) + '</div>' +
            '</div>';
    }

    function channelCardHtml(ch) {
        return '' +
            '<div class="ch-item" data-name="' + esc(ch.name) + '">' +
            '<div class="ch-cover" style="background:linear-gradient(145deg,' + ch.g1 + ' 0%,' + ch.g2 + ' 100%)">' +
            '<div class="ch-art-ring2"></div><div class="ch-art-ring"></div>' +
            '<div class="ch-art-mark">' + esc(ch.mark) + '</div>' +
            '<div class="ch-art-sub">CHANNEL</div>' +
            '</div><div class="ch-name">' + esc(ch.name) + '</div>' +
            '</div>';
    }

    function paintDuoCard(kind, song) {
        var el = $('#duo' + kind);
        if (!el) return;
        var cover = el.querySelector('.duo-cover img');
        var title = el.querySelector('.duo-title');
        var sub = el.querySelector('.duo-sub');
        if (!song) {
            title.textContent = '加载中…';
            sub.textContent = srcName();
            return;
        }
        if (cover) {
            cover.onerror = function () { this.onerror = null; this.src = PLACEHOLDER; };
            cover.src = songCover(song);
        }
        title.textContent = song.name + ' · ' + (song.singer || song.artist || '');
        sub.textContent = srcName() + ' · 点击播放整批';
    }

    function srcName() {
        return platName(S.source).name;
    }

    /* ------------------------------- 主页数据 ------------------------------- */

    /* 用关键词池在当前源拉歌（与参考页同思路，只是改走本服务接口） */
    function fetchPool(pool, count, pickCount) {
        var picks = shuffle(pool).slice(0, pickCount || 3);
        return Promise.all(picks.map(function (kw) {
            return apiSearch(S.source, kw, 1).catch(function () { return []; });
        })).then(function (arrs) {
            var merged = [];
            arrs.forEach(function (a) { merged = merged.concat(a || []); });
            return shuffle(uniqSongs(merged)).slice(0, count || 20);
        });
    }

    function loadRecommend() {
        return fetchPool(REC_KW, 16, 4).then(function (list) {
            S.home.rec = list;
            var row = $('#homeRecRow');
            if (!row) return;
            row.innerHTML = list.length
                ? list.map(albumCardHtml).join('')
                : '<div class="empty" style="padding:16px">暂无推荐</div>';
            wireAlbumRow(row, list);
        });
    }

    function loadGuessRadar() {
        var guessP = fetchPool(GUESS_KW, 24, 3).then(function (list) {
            S.home.guess = list;
            paintDuoCard('Guess', list[0]);
        }).catch(function () { paintDuoCard('Guess', null); });

        var radarP = fetchPool(RADAR_KW, 24, 3).then(function (list) {
            S.home.radar = list;
            paintDuoCard('Radar', list[0]);
        }).catch(function () { paintDuoCard('Radar', null); });

        return Promise.all([guessP, radarP]);
    }

    /* 热门歌曲：直接取榜单排行榜。
     * 原来先打 /hotSearch 拿热搜词、再用 6 个词各搜一次拼盘（每次 6 个请求），
     * 随机性大、部分音源热搜为空还常常掉进兜底，数据既不稳又慢。
     * 现在直接走榜单：优先"热歌/飙升"类榜单，没有就用第一个榜。 */
    function loadHotSongs() {
        return apiBoards(S.source).then(function (boards) {
            if (!boards || !boards.length) { paintHot([]); return []; }
            var first = boards.filter(function (b) { return /热歌|飙升|热门/.test(b.name || ''); })[0] || boards[0];
            return apiBoardSongs(S.source, first.bangid, 1).then(function (data) {
                var list = (data.list || []).slice(0, 18);
                paintHot(list);
                return list;
            });
        }).catch(function () { paintHot([]); return []; });
    }

    function paintHot(list) {
        S.home.hot = list;
        var box = $('#homeHotList');
        if (!box) return;
        if (!list.length) {
            box.innerHTML = '<div class="empty" style="padding:16px">暂无热门歌曲</div>';
            return;
        }
        box.innerHTML = list.map(function (s, i) { return songRowHtml(s, i, 'hot'); }).join('');
        box.classList.add('aq-songlist');
        $$('.song', box).forEach(function (row) {
            row.addEventListener('click', function () {
                playList(S.home.hot, parseInt(row.dataset.idx, 10) || 0);
            });
        });
    }

    function loadBoards() {
        return apiBoards(S.source).then(function (list) {
            S.boards.all = list || [];
            var grid = $('#homeRankGrid');
            if (grid) {
                grid.innerHTML = S.boards.all.length
                    ? S.boards.all.map(rankCardHtml).join('')
                    : '<div class="empty" style="grid-column:1/-1;padding:16px">该源暂无排行榜</div>';
                wireRankCards(grid, S.boards.all);
            }
        }).catch(function () {
            var grid = $('#homeRankGrid');
            if (grid) grid.innerHTML = '<div class="empty" style="grid-column:1/-1;padding:16px">排行榜暂不可用</div>';
        });
    }

    /* ---------------------------- 频道 / 歌单 ---------------------------- */

    function renderChannels() {
        var grid = $('#chGrid');
        if (!grid) return;
        var list = shuffle(THEME_CHANNELS_ALL).slice(0, 9);
        grid.innerHTML = list.map(channelCardHtml).join('');
        $$('.ch-item', grid).forEach(function (el, i) {
            el.addEventListener('click', function () {
                var ch = list[i];
                toast('加载「' + ch.name + '」…');
                fetchPool([ch.kw, ch.name], 30, 2).then(function (songs) {
                    if (!songs.length) { toast('暂无歌曲'); return; }
                    playList(songs, 0);
                    openSheet();
                });
            });
        });
    }

    function loadPlaylists(tagId) {
        var grid = $('#homePlGrid');
        if (grid && !S.pl.list.length) {
            grid.innerHTML = '<div class="empty" style="grid-column:1/-1;padding:20px">加载歌单…</div>';
        }
        S.pl.loading = true;
        var tag = (tagId != null) ? tagId : S.pl.tagId;
        return apiSongList(S.source, tag, 'hot', 1).then(function (data) {
            S.pl.tagId = tag;
            S.pl.list = (data && data.list) || [];
            S.pl.loading = false;
            if (!grid) return;
            grid.innerHTML = S.pl.list.length
                ? S.pl.list.map(plCardHtml).join('')
                : '<div class="empty" style="grid-column:1/-1;padding:20px">该分类暂无歌单</div>';
            $$('.pl-card', grid).forEach(function (el) {
                var pl = S.pl.list.filter(function (p) { return String(p.id) === el.dataset.id; })[0];
                el.addEventListener('click', function () { if (pl) openPlaylist(pl); });
            });
        }).catch(function () {
            S.pl.loading = false;
            if (grid) grid.innerHTML = '<div class="empty" style="grid-column:1/-1;padding:20px">歌单暂不可用</div>';
        });
    }

    function loadTags() {
        var row = $('#homeTagRow');
        if (!row) return Promise.resolve();
        return apiTags(S.source).then(function (data) {
            var flat = [];
            var groups = (data && data.tags) || [];
            if (Array.isArray(groups)) {
                groups.forEach(function (g) {
                    if (g && Array.isArray(g.list)) {
                        g.list.slice(0, 8).forEach(function (t) { flat.push({ id: t.id, name: t.name }); });
                    }
                });
            }
            if (!flat.length && data && Array.isArray(data.hotTag)) {
                flat = data.hotTag.slice(0, 12).map(function (t) { return { id: t.id, name: t.name }; });
            }
            S.pl.tags = flat;
            row.innerHTML = ['<button class="aq-tag on" data-id="">全部</button>']
                .concat(flat.slice(0, 14).map(function (t) {
                    return '<button class="aq-tag" data-id="' + esc(t.id) + '">' + esc(t.name) + '</button>';
                })).join('');
            $$('.aq-tag', row).forEach(function (btn) {
                btn.addEventListener('click', function () {
                    $$('.aq-tag', row).forEach(function (b) { b.classList.remove('on'); });
                    btn.classList.add('on');
                    loadPlaylists(btn.dataset.id);
                });
            });
        }).catch(function () { /* 某些源没有分类，忽略 */ });
    }

    /* ------------------------------ 弹层视图 ------------------------------ */

    var sheetState = { list: [], page: 1, source: '', bangid: '', kind: '', id: '' };

    function ensureSheet() {
        var mask = $('#aqSheetMask');
        if (!mask) {
            mask = document.createElement('div');
            mask.id = 'aqSheetMask';
            mask.className = 'aq-sheet-mask';
            mask.onclick = closeSheet;
            document.body.appendChild(mask);
        }
        var sheet = $('#aqSheet');
        if (!sheet) {
            sheet = document.createElement('div');
            sheet.id = 'aqSheet';
            sheet.className = 'aq-sheet';
            sheet.innerHTML = '' +
                '<div class="aq-sheet-head">' +
                '<div class="grip"></div>' +
                '<img class="aq-sheet-cover" id="aqSheetCover" alt="">' +
                '<div class="aq-sheet-title" id="aqSheetTitle"></div>' +
                '<div class="aq-sheet-sub" id="aqSheetSub"></div>' +
                '<div class="aq-sheet-actions">' +
                '<button class="aq-btn" id="aqSheetPlayAll">播放全部</button>' +
                '<button class="aq-btn ghost" id="aqSheetMore" style="display:none">加载更多</button>' +
                '</div>' +
                '<button class="aq-sheet-close" id="aqSheetClose">✕</button>' +
                '</div>' +
                '<div class="aq-sheet-body" id="aqSheetBody"></div>';
            document.body.appendChild(sheet);
            $('#aqSheetClose').onclick = closeSheet;
        }
        return sheet;
    }

    function openSheet() {
        ensureSheet();
        $('#aqSheetMask').classList.add('open');
        $('#aqSheet').classList.add('open');
    }

    function closeSheet() {
        var mask = $('#aqSheetMask'), sheet = $('#aqSheet');
        if (mask) mask.classList.remove('open');
        if (sheet) sheet.classList.remove('open');
    }

    function paintSheetSongs(list) {
        var body = $('#aqSheetBody');
        if (!body) return;
        if (!list.length) {
            body.innerHTML = '<div class="empty" style="padding:24px">暂无歌曲</div>';
            return;
        }
        body.classList.add('aq-songlist');
        body.innerHTML = list.map(function (s, i) { return songRowHtml(s, i, 'sheet'); }).join('');
        $$('.song', body).forEach(function (row) {
            row.addEventListener('click', function () {
                playList(sheetState.list, parseInt(row.dataset.idx, 10) || 0);
            });
        });
    }

    function openBoard(board) {
        sheetState = { list: [], page: 1, source: S.source, bangid: board.bangid, kind: 'board', id: '' };
        ensureSheet();
        $('#aqSheetCover').src = board.cover || PLACEHOLDER;
        $('#aqSheetTitle').textContent = board.name;
        $('#aqSheetSub').textContent = srcName() + ' · 榜单';
        $('#aqSheetBody').innerHTML = '<div class="aq-loading">加载中…</div>';
        $('#aqSheetMore').style.display = 'none';
        openSheet();
        apiBoardSongs(S.source, board.bangid, 1).then(function (data) {
            var list = (data && data.list) || [];
            sheetState.list = list;
            sheetState.page = 1;
            $('#aqSheetSub').textContent = srcName() + ' · 共 ' + (data.total || list.length) + ' 首';
            paintSheetSongs(list);
            if ((data.total || 0) > list.length) $('#aqSheetMore').style.display = '';
        }).catch(function (e) {
            $('#aqSheetBody').innerHTML = '<div class="empty" style="padding:24px">加载失败：' + esc(e.message) + '</div>';
        });
    }

    function openPlaylist(pl) {
        sheetState = { list: [], page: 1, source: S.source, bangid: '', kind: 'playlist', id: pl.id };
        ensureSheet();
        $('#aqSheetCover').src = pl.img || PLACEHOLDER;
        $('#aqSheetTitle').textContent = pl.name;
        $('#aqSheetSub').textContent = srcName() + ' · 歌单';
        $('#aqSheetBody').innerHTML = '<div class="aq-loading">加载中…</div>';
        $('#aqSheetMore').style.display = 'none';
        openSheet();
        apiSongListDetail(S.source, pl.id, 1).then(function (data) {
            var list = (data && data.list) || [];
            sheetState.list = list;
            if (!list.length) throw new Error('该歌单暂无歌曲');
            $('#aqSheetSub').textContent = srcName() + ' · 共 ' + (data.total || list.length) + ' 首';
            paintSheetSongs(list);
            if ((data.total || 0) > list.length) $('#aqSheetMore').style.display = '';
        }).catch(function () {
            /* QQ 等源的后端歌单详情暂不可用时：按歌单名搜索，保证仍能看到内容 */
            apiSearch(S.source, pl.name, 1).then(function (list) {
                sheetState.list = list.slice(0, 30);
                paintSheetSongs(sheetState.list);
                $('#aqSheetSub').textContent = '该源歌单详情暂不可用，已按歌单名搜索';
                if (!sheetState.list.length) {
                    $('#aqSheetBody').innerHTML = '<div class="empty" style="padding:24px">歌单详情暂不可用</div>';
                }
            }).catch(function () {
                $('#aqSheetBody').innerHTML = '<div class="empty" style="padding:24px">歌单详情暂不可用</div>';
            });
        });
    }

    function wireSheetButtons() {
        var playAll = $('#aqSheetPlayAll');
        var more = $('#aqSheetMore');
        if (playAll) playAll.onclick = function () { playList(sheetState.list, 0); };
        if (more) more.onclick = function () {
            sheetState.page += 1;
            var p = sheetState.page;
            var req = sheetState.kind === 'board'
                ? apiBoardSongs(sheetState.source, sheetState.bangid, p).then(function (d) { return (d && d.list) || []; })
                : apiSongListDetail(sheetState.source, sheetState.id, p).then(function (d) { return (d && d.list) || []; });
            more.textContent = '加载中…';
            req.then(function (list) {
                if (!list.length) { more.style.display = 'none'; toast('没有更多了'); return; }
                sheetState.list = sheetState.list.concat(list);
                paintSheetSongs(sheetState.list);
                more.textContent = '加载更多';
            }).catch(function () {
                more.textContent = '加载更多';
                toast('加载失败');
            });
        };
    }

    /* ------------------------------ 资料库页 ------------------------------ */

    function recentSongs() {
        try {
            var arr = JSON.parse(localStorage.getItem('play_history') || '[]');
            if (!Array.isArray(arr)) return [];
            /* Q4/Q8-A：最近播放按歌曲名去重，play_history 为新→旧排列，所以首条即最新。
             * 不回写 localStorage，不改喜欢列表/缓存列表/原始播放历史。 */
            var seen = Object.create(null);
            var out = [];
            for (var i = 0; i < arr.length && out.length < 100; i++) {
                var song = arr[i] || {};
                var raw = String(song.name == null ? '' : song.name).trim();
                if (!raw) { out.push(song); continue; }
                var key = raw.toLocaleLowerCase();
                if (seen[key]) continue;
                seen[key] = true;
                out.push(song);
            }
            return out;
        } catch (e) { return []; }
    }

    /* ---------------------------- 最近播放：左滑删除 ---------------------------- */

    /* 资料库 → 最近播放：歌曲行向左滑出「删除」按钮，点确认后从播放历史里移除。
     * 最近播放是按歌名去重后展示的，所以删除时把同名的记录一起清掉。 */
    function removeRecentSong(song) {
        try {
            var arr = JSON.parse(localStorage.getItem('play_history') || '[]');
            if (!Array.isArray(arr)) return false;
            var name = String(song && song.name != null ? song.name : '').trim().toLowerCase();
            var singer = String(song && (song.singer || song.artist) || '').trim().toLowerCase();
            var kept = arr.filter(function (item) {
                var n = String(item && item.name != null ? item.name : '').trim().toLowerCase();
                if (n !== name) return true;
                if (!name) return false;
                var s2 = String(item && (item.singer || item.artist) || '').trim().toLowerCase();
                return s2 !== singer;
            });
            if (kept.length === arr.length) return false;
            localStorage.setItem('play_history', JSON.stringify(kept));
            return true;
        } catch (e) { return false; }
    }

    var SWIPE_W = 76;

    function ensureSwipeStyle() {
        if (document.getElementById('aqSwipeStyle')) return;
        var st = document.createElement('style');
        st.id = 'aqSwipeStyle';
        st.textContent = [
            '.aq-swipe{position:relative;overflow:hidden;touch-action:pan-y;}',
            '.aq-swipe-del{position:absolute;top:0;right:0;bottom:0;width:' + SWIPE_W + 'px;',
            'display:flex;align-items:center;justify-content:center;',
            'background:linear-gradient(135deg,#ff5a72 0%,#e01e3c 100%);color:#fff;',
            'font-size:14px;font-weight:700;letter-spacing:.04em;}',
            '.aq-swipe-body{position:relative;z-index:2;background:var(--bg);will-change:transform;touch-action:pan-y;}',
            '.aq-confirm-mask{position:fixed;inset:0;z-index:200;display:flex;align-items:center;',
            'justify-content:center;background:rgba(0,0,0,.45);padding:24px;}',
            '.aq-confirm-box{width:100%;max-width:300px;background:var(--bg-pure,var(--bg));',
            'border-radius:16px;padding:20px 18px 14px;box-shadow:0 18px 50px rgba(0,0,0,.35);}',
            '.aq-confirm-text{font-size:15px;line-height:1.5;text-align:center;margin-bottom:18px;}',
            '.aq-confirm-btns{display:flex;gap:10px;}',
            '.aq-confirm-btns button{flex:1;padding:11px 0;border:none;border-radius:12px;',
            'font-size:15px;font-weight:600;cursor:pointer;}',
            '.aq-confirm-cancel{background:rgba(127,127,127,.16);color:var(--label-1,inherit);}',
            '.aq-confirm-ok{background:linear-gradient(135deg,#ff5a72,#e01e3c);color:#fff;}'
        ].join('');
        (document.head || document.documentElement).appendChild(st);
    }

    function aqConfirm(text, onOk) {
        ensureSwipeStyle();
        var old = document.getElementById('aqConfirmMask');
        if (old) old.parentNode.removeChild(old);
        var mask = document.createElement('div');
        mask.id = 'aqConfirmMask';
        mask.className = 'aq-confirm-mask';
        mask.innerHTML = '<div class="aq-confirm-box"><div class="aq-confirm-text"></div>' +
            '<div class="aq-confirm-btns"><button type="button" class="aq-confirm-cancel">取消</button>' +
            '<button type="button" class="aq-confirm-ok">删除</button></div></div>';
        $('.aq-confirm-text', mask).textContent = text;
        function close() { if (mask.parentNode) mask.parentNode.removeChild(mask); }
        $('.aq-confirm-cancel', mask).addEventListener('click', close);
        $('.aq-confirm-ok', mask).addEventListener('click', function () { close(); onOk(); });
        mask.addEventListener('click', function (e) { if (e.target === mask) close(); });
        document.body.appendChild(mask);
    }

    /* 给容器里的每一行套上左滑删除；list 为渲染时的数据快照 */
    function bindSwipeDelete(root, list, onRemoved) {
        ensureSwipeStyle();
        var wraps = $$('.aq-swipe', root);
        function closeAll(except) {
            wraps.forEach(function (w) {
                if (w === except) return;
                w.classList.remove('open');
                var b = $('.aq-swipe-body', w);
                if (b) { b.style.transition = 'transform .2s ease'; b.style.transform = 'translateX(0)'; }
            });
        }
        wraps.forEach(function (wrap) {
            var body = $('.aq-swipe-body', wrap);
            var del = $('.aq-swipe-del', wrap);
            if (!body || !del) return;
            var sx = 0, sy = 0, dx = 0, tracking = false, decided = false, opened = false;

            function setX(x) { body.style.transform = 'translateX(' + x + 'px)'; }
            function close() {
                opened = false;
                body.style.transition = 'transform .2s ease';
                setX(0);
                wrap.classList.remove('open');
            }
            function open() {
                opened = true;
                closeAll(wrap);
                body.style.transition = 'transform .2s ease';
                setX(-SWIPE_W);
                wrap.classList.add('open');
            }

            /* 已展开时点行身：只收起，不触发播放 */
            body.addEventListener('click', function (e) {
                if (!opened) return;
                e.preventDefault();
                e.stopPropagation();
                close();
            }, true);

            function down(x, y) {
                sx = x; sy = y; dx = 0;
                tracking = true; decided = false;
                body.style.transition = 'none';
            }

            function move(x, y, ev) {
                if (!tracking) return;
                var mx = x - sx;
                var my = y - sy;
                if (!decided) {
                    if (Math.abs(mx) < 8 && Math.abs(my) < 8) return;
                    decided = true;
                    if (mx > 0) { tracking = false; close(); return; }   // 向右滑：收起
                    if (ev && ev.cancelable) ev.preventDefault();        // 判定为横向手势，别让页面跟着滚
                }
                dx = mx;
                if (dx > 0) dx = dx * 0.2;                                  // 只允许左滑
                if (dx < -SWIPE_W) dx = -SWIPE_W + (dx + SWIPE_W) * 0.25;    // 阻尼
                setX(dx);
            }

            function up() {
                if (!tracking) return;
                tracking = false;
                if (dx <= -SWIPE_W * 0.45) open(); else close();
            }

            /* Android WebView 对 touchmove 偶尔会直接吞掉横向手势，
             * 所以优先用 Pointer 事件（可捕获），老 WebView 才回退 Touch。 */
            if (typeof window.PointerEvent !== 'undefined') {
                wrap.addEventListener('pointerdown', function (e) {
                    if (e.pointerType === 'mouse' && e.button !== 0) return;
                    try { wrap.setPointerCapture(e.pointerId); } catch (err) { }
                    down(e.clientX, e.clientY);
                });
                wrap.addEventListener('pointermove', function (e) { move(e.clientX, e.clientY, e); });
                wrap.addEventListener('pointerup', up);
                wrap.addEventListener('pointercancel', function () { if (tracking) { tracking = false; close(); } });
            } else {
                wrap.addEventListener('touchstart', function (e) {
                    if (e.touches.length !== 1) return;
                    down(e.touches[0].clientX, e.touches[0].clientY);
                }, { passive: true });
                wrap.addEventListener('touchmove', function (e) {
                    if (e.touches.length !== 1) return;
                    move(e.touches[0].clientX, e.touches[0].clientY, e);
                }, { passive: false });
                wrap.addEventListener('touchend', up);
                wrap.addEventListener('touchcancel', function () { if (tracking) { tracking = false; close(); } });
            }

            del.addEventListener('click', function (e) {
                e.preventDefault();
                e.stopPropagation();
                var idx = parseInt(wrap.dataset.idx, 10) || 0;
                var song = list[idx];
                if (!song) return;
                aqConfirm('从最近播放中删除「' + (song.name || '这首') + '」？', function () {
                    if (removeRecentSong(song)) {
                        toast('已从最近播放删除');
                        if (typeof onRemoved === 'function') onRemoved();
                    } else {
                        toast('删除失败');
                    }
                });
            });
        });
        root.addEventListener('click', function (e) {
            if (e.target && e.target.closest && e.target.closest('.aq-swipe')) return;
            closeAll(null);
        });
    }

    function favoriteCount() {
        try {
            var data = window.currentListData;
            if (data && data.loveList) return data.loveList.length;
        } catch (e) { }
        return null;
    }

    /* 资料库（参考页结构：喜欢的音乐 / 最近播放 / 已下载，均可点开就地展开歌曲） */

    var LIB_ICONS = {
        fav: '<svg viewBox="0 0 24 24" fill="var(--pink)" stroke="none"><path d="M12 21l-1.5-1.3C5.4 15.2 2 12.2 2 8.5 2 5.4 4.4 3 7.5 3c1.7 0 3.4.8 4.5 2.1C13.1 3.8 14.8 3 16.5 3 19.6 3 22 5.4 22 8.5c0 3.7-3.4 6.7-8.5 11.2L12 21z"/></svg>',
        recent: '<svg viewBox="0 0 24 24" fill="none" stroke="var(--pink)" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
        dl: '<svg viewBox="0 0 24 24" fill="none" stroke="var(--pink)" stroke-width="2"><path d="M12 3v12"/><path d="M7 10l5 5 5-5"/><path d="M5 21h14"/></svg>',
        lists: '<svg viewBox="0 0 24 24" fill="none" stroke="var(--pink)" stroke-width="2"><path d="M4 6h16M4 12h16M4 18h10"/></svg>'
    };

    function libBlockHtml(kind, label, count) {
        return '' +
            '<div class="lib-block" data-lib="' + kind + '">' +
            '  <div class="lib-item">' +
            '    <div class="lib-icon">' + (LIB_ICONS[kind] || '') + '</div>' +
            '    <span class="lib-label">' + esc(label) + '</span>' +
            '    <span class="lib-count">' + (count == null ? '' : count) + '</span>' +
            '    <span class="lib-chevron">›</span>' +
            '  </div>' +
            '  <div class="lib-panel" data-panel="' + kind + '"></div>' +
            '</div>';
    }

    function libAuthHeaders() {
        try {
            if (typeof window.getUserAuthHeaders === 'function') return window.getUserAuthHeaders();
        } catch (e) { }
        return {};
    }

    function libLoggedIn() {
        try {
            return typeof window.isUserLoggedIn === 'function' ? !!window.isUserLoggedIn() : false;
        } catch (e) { return false; }
    }

    function fetchUserLists() {
        if (!libLoggedIn()) return Promise.resolve(null);
        return fetch('/api/user/list', { headers: libAuthHeaders() })
            .then(function (r) { return r.ok ? r.json() : null; })
            .catch(function () { return null; });
    }

    function renderPanelSongs(panel, list, opts) {
        if (!panel) return;
        opts = opts || {};
        if (!list || !list.length) {
            panel.innerHTML = '<div class="empty" style="padding:14px 0;font-size:13px">还没有歌曲</div>';
            return;
        }
        panel.classList.add('aq-songlist');
        var swipe = !!opts.swipe;
        panel.innerHTML = list.map(function (s, i) {
            var row = songRowHtml(s, i, 'lib');
            if (!swipe) return row;
            return '<div class="aq-swipe" data-idx="' + i + '">' +
                '<div class="aq-swipe-del">删除</div>' +
                '<div class="aq-swipe-body">' + row + '</div></div>';
        }).join('');
        $$('.song', panel).forEach(function (row) {
            row.addEventListener('click', function () {
                var idx = parseInt(row.dataset.idx, 10) || 0;
                if (typeof window.updatePlaylist === 'function') {
                    window.updatePlaylist(list.slice(), idx, 'local_list');
                }
            });
        });
        if (swipe) bindSwipeDelete(panel, list, opts.onRemoved);
    }

    /* 画「最近播放」面板：带左滑删除，删除后重画并更新标题上的数量 */
    function renderRecentPanel() {
        var block = $('.lib-block[data-lib="recent"]');
        if (!block) return;
        var panel = $('.lib-panel', block);
        var list = recentSongs();
        var cnt = $('.lib-count', block);
        if (cnt) cnt.textContent = list.length;
        renderPanelSongs(panel, list, {
            swipe: true,
            onRemoved: function () {
                renderRecentPanel();
                if (typeof window.aqRefreshRecentSheet === 'function') window.aqRefreshRecentSheet();
            }
        });
    }

    function openLibPanel(kind) {
        var block = $('.lib-block[data-lib="' + kind + '"]');
        if (!block) return;
        var panel = $('.lib-panel', block);
        var willOpen = !block.classList.contains('open');
        block.classList.toggle('open', willOpen);
        if (!willOpen) return;

        if (kind === 'fav') {
            if (!libLoggedIn()) {
                panel.innerHTML = '<div class="empty" style="padding:14px 0;font-size:13px">登录后可查看喜欢的音乐</div>' +
                    '<div style="text-align:center;padding-bottom:12px"><button type="button" class="aq-btn ghost" id="aqLibLogin">去登录</button></div>';
                var btn = $('#aqLibLogin');
                if (btn) btn.addEventListener('click', function () { go('settings'); });
                return;
            }
            panel.innerHTML = '<div class="aq-loading">加载中…</div>';
            fetchUserLists().then(function (data) {
                var list = (data && data.loveList) || [];
                var cnt = $('.lib-count', block);
                if (cnt) cnt.textContent = list.length;
                renderPanelSongs(panel, list);
            });
            return;
        }

        if (kind === 'recent') {
            renderRecentPanel();
            return;
        }

        if (kind === 'ulists') {
            loadUserLists();
            return;
        }

        /* 已下载：直接进入本地音乐页（原页面负责缓存/下载文件的播放与管理） */
        switchTab('localmusic');
        syncTabbar('lib');
    }

    /* ------------------------- 我的歌单（新建 / 导入的歌单） -------------------------
     * 资料库页原来只有「喜欢的音乐 / 最近播放 / 已下载」，新建和导入的歌单存在
     * 服务端 userList 里，页面上却一个入口都没有，看起来就像没保存成功。 */
    function userListsData() {
        var d = window.currentListData;
        if (d && Array.isArray(d.userList)) return Promise.resolve(d);
        if (typeof window.ensurePlaylistDataAvailable === 'function') {
            return Promise.resolve(window.ensurePlaylistDataAvailable())
                .then(function (x) { return x || null; })
                .catch(function () { return null; });
        }
        if (!libLoggedIn()) return Promise.resolve(null);
        return fetch('/api/user/list', { headers: libAuthHeaders() })
            .then(function (r) { return r.ok ? r.json() : null; })
            .catch(function () { return null; });
    }

    function openUserListById(id) {
        if (typeof window.handleListClick !== 'function') {
            if (window.showToast) window.showToast('\u64ad\u653e\u5668\u672a\u5c31\u7eea\uff0c\u8bf7\u957f\u6309\u9875\u9762\u5237\u65b0\u540e\u91cd\u8bd5');
            return;
        }
        try { window.handleListClick(id); } catch (e) { console.warn('[AQ] \u6253\u5f00\u6b4c\u5355\u5931\u8d25', e); }
        syncTabbar('search');
    }

    /* 两级结构：
       资料库 -> 「我的歌单」(lib-block ulists) -> 展开后是歌单列表 ->
       再点某个歌单 -> 就地展开该歌单的歌曲。 */
    function userListItemHtml(l) {
        var id = esc(String(l && l.id != null ? l.id : ''));
        var name = esc((l && l.name) || '未命名歌单');
        var n = (l && Array.isArray(l.list)) ? l.list.length : 0;
        return '<div class="lib-block" data-ulist-id="' + id + '">' +
            '<div class="lib-item">' +
            '  <div class="lib-icon">' + (LIB_ICONS.lists) + '</div>' +
            '  <span class="lib-label">' + name + '</span>' +
            '  <span class="lib-count">' + n + '</span><span class="lib-chevron">›</span>' +
            '</div>' +
            '<div class="lib-panel"></div>' +
            '</div>';
    }

    function renderUserLists(panel, data) {
        if (!panel) return;
        var lists = (data && Array.isArray(data.userList)) ? data.userList : [];
        var head = $('.lib-block[data-lib="ulists"]');
        if (head) {
            var cnt = $('.lib-count', head);
            if (cnt) cnt.textContent = lists.length;
        }
        if (!lists.length) {
            panel.innerHTML = '<div class="empty" style="padding:14px 0;font-size:13px">还没有歌单</div>' +
                '<div style="text-align:center;padding-bottom:12px"><button type="button" class="aq-btn ghost" id="aqLibNewList">新建歌单</button>' +
                '<button type="button" class="aq-btn ghost" id="aqLibImportList">导入歌单</button></div>';
            var nb = $('#aqLibNewList', panel);
            if (nb) nb.addEventListener('click', function () {
                if (typeof window.handleCreateList === 'function') window.handleCreateList();
                else window.showToast && window.showToast('新建入口未就绪');
            });
            var ib = $('#aqLibImportList', panel);
            if (ib) ib.addEventListener('click', function () { libAction('import'); });
            return;
        }

        panel.innerHTML = lists.map(userListItemHtml).join('');
        $$('.lib-block[data-ulist-id]', panel).forEach(function (block) {
            var head2 = $('.lib-item', block);
            if (!head2) return;
            head2.addEventListener('click', function () {
                var willOpen = !block.classList.contains('open');
                block.classList.toggle('open', willOpen);
                if (!willOpen) return;
                var sub = $('.lib-panel', block);
                if (!sub || sub.dataset.loaded === '1') return;
                sub.dataset.loaded = '1';
                var id = block.dataset.ulistId;
                var found = null;
                for (var i = 0; i < lists.length; i++) {
                    if (String(lists[i].id) === String(id)) { found = lists[i]; break; }
                }
                renderPanelSongs(sub, (found && found.list) || []);
            });
        });
    }

    function loadUserLists() {
        var panel = $('.lib-panel[data-panel="ulists"]');
        if (!panel) return;
        userListsData().then(function (data) { renderUserLists(panel, data); });
    }

    /* 新建 / 导入 / 同步歌单后自动刷新资料库，不用退出页面重进。 */
    function watchUserListChanges() {
        if (window._aqUserListWatched) return;
        window._aqUserListWatched = true;
        var timer = null;
        function refresh() {
            if (!$('#aqLibUserLists')) return;
            clearTimeout(timer);
            timer = setTimeout(loadUserLists, 250);
        }
        ['handleCreateList', 'renderMyLists', 'refreshUserListData'].forEach(function (name) {
            var orig = window[name];
            if (typeof orig !== 'function') return;
            window[name] = function () {
                var r = orig.apply(this, arguments);
                refresh();
                return r;
            };
        });
        document.addEventListener('visibilitychange', function () { if (!document.hidden) refresh(); });
    }

    function renderLib() {
        var box = $('#aqLibList');
        if (!box) return;
        box.innerHTML = '' +
            '<div class="lib-list">' +
            libBlockHtml('fav', '喜欢的音乐', favoriteCount()) +
            libBlockHtml('recent', '最近播放', recentSongs().length) +
            libBlockHtml('dl', '已下载', '') +
            '</div>' +
            '<div class="lib-list" style="margin-top:24px">' +
            libBlockHtml('ulists', '我的歌单', '') +
            '</div>' +
            '<div class="lib-list" style="margin-top:24px">' +
            '  <div class="lib-block" data-act="dislike"><div class="lib-item">' +
            '    <div class="lib-icon"><i class="fas fa-ban" style="color:var(--pink);font-size:16px"></i></div>' +
            '    <span class="lib-label">不喜欢</span><span class="lib-chevron">›</span></div></div>' +
            '  <div class="lib-block" data-act="import"><div class="lib-item">' +
            '    <div class="lib-icon"><i class="fas fa-file-import" style="color:var(--pink);font-size:16px"></i></div>' +
            '    <span class="lib-label">导入歌单</span><span class="lib-chevron">›</span></div></div>' +
            '  <div class="lib-block" data-act="about"><div class="lib-item">' +
            '    <div class="lib-icon"><i class="fas fa-info-circle" style="color:var(--pink);font-size:16px"></i></div>' +
            '    <span class="lib-label">关于</span><span class="lib-chevron">›</span></div></div>' +
            '  <div class="lib-block" data-act="admin"><div class="lib-item">' +
            '    <div class="lib-icon"><i class="fas fa-server" style="color:var(--pink);font-size:16px"></i></div>' +
            '    <span class="lib-label">后台管理</span><span class="lib-chevron">›</span></div></div>' +
            '</div>';

        $$('.lib-block[data-lib]', box).forEach(function (block) {
            var head = $('.lib-item', block);
            if (head) head.addEventListener('click', function () { openLibPanel(block.dataset.lib); });
        });
        $$('.lib-block[data-act]', box).forEach(function (block) {
            var head = $('.lib-item', block);
            if (head) head.addEventListener('click', function () { libAction(block.dataset.act); });
        });

        /* 已下载数量（服务器缓存文件数），失败就留空 */
        if (libLoggedIn()) {
            /* 喜欢的音乐数量 */
            fetchUserLists().then(function (data) {
                var list = (data && data.loveList) || [];
                var cnt = $('.lib-block[data-lib="fav"] .lib-count');
                if (cnt) cnt.textContent = list.length;
            });
            fetch('/api/music/cache/list', { headers: libAuthHeaders() })
                .then(function (r) { return r.ok ? r.json() : null; })
                .then(function (data) {
                    var list = (data && (data.list || data.files)) || [];
                    var cnt = $('.lib-block[data-lib="dl"] .lib-count');
                    if (cnt && Array.isArray(list) && list.length) cnt.textContent = list.length;
                })
                .catch(function () { });
        }
        loadUserLists();
        watchUserListChanges();
    }

    function libAction(act) {
        if (act === 'dislike') {
            go('settings');
        } else if (act === 'import') {
            if (window.PlaylistImporter && typeof window.PlaylistImporter.open === 'function') {
                window.PlaylistImporter.open();
            } else {
                window.showToast && window.showToast('导入器未就绪，请长按页面刷新后重试');
            }
        } else if (act === 'about') {
            switchTab('about');
            syncTabbar('lib');
        } else if (act === 'admin') {
            if (typeof window.goToAdmin === 'function') window.goToAdmin();
        }
    }

    /* （2026-09-25 已删除：往设置页追加“退出登录”按钮。
     * 原版顶栏 header-user-info 已恢复显示，登录/退出走原版逻辑，不再向设置页注入按钮。） */

    function showRecentSheet() {
        var list = recentSongs();
        sheetState = { list: list, page: 1, source: '', bangid: '', kind: 'recent', id: '' };
        ensureSheet();
        $('#aqSheetCover').src = list.length ? songCover(list[0]) : PLACEHOLDER;
        $('#aqSheetTitle').textContent = '最近播放';
        $('#aqSheetSub').textContent = list.length ? ('共 ' + list.length + ' 首') : '还没有播放记录';
        $('#aqSheetMore').style.display = 'none';
        paintSheetSongs(list);
        openSheet();
    }

    /* 通用歌曲弹层：给搜索页的歌手/专辑结果复用 */
    function openSongsSheet(title, sub, cover, list) {
        sheetState = { list: list || [], page: 1, source: S.source, bangid: '', kind: 'custom', id: '' };
        ensureSheet();
        $('#aqSheetCover').src = cover || PLACEHOLDER;
        $('#aqSheetTitle').textContent = title || '';
        $('#aqSheetSub').textContent = sub || ((list || []).length + ' 首');
        $('#aqSheetMore').style.display = 'none';
        paintSheetSongs(sheetState.list);
        openSheet();
    }

    /* --------------------------- 底部标签栏与路由 --------------------------- */

    var TAB_MAP = {
        home: { title: '现在就听', action: function () { switchTab('home'); } },
        search: { title: '搜索', action: function () { switchTab('search'); } },
        lib: { title: '资料库', action: function () { switchTab('lib'); } },
        settings: { title: '设置', action: function () { switchTab('settings'); } }
    };

    function syncTabbar(page) {
        S.view = page;
        $$('#aq-tabbar .aq-tab').forEach(function (b) {
            b.classList.toggle('on', b.dataset.page === page);
        });
        var t = TAB_MAP[page];
        var titleEl = document.getElementById('page-title');
        if (titleEl && t) titleEl.innerText = t.title;
    }

    /* 原播放器会在切换歌单/列表时改写顶栏标题，这里把它锁回当前页面名 */
    function watchPageTitle() {
        var el = document.getElementById('page-title');
        if (!el || el.__aqWatched) return;
        el.__aqWatched = true;
        var enforce = function () {
            var t = TAB_MAP[S.view];
            if (t && el.innerText !== t.title) el.innerText = t.title;
        };
        try {
            new MutationObserver(enforce).observe(el, { childList: true, characterData: true, subtree: true });
        } catch (e) { }
        setInterval(enforce, 3000);
    }

    function go(page) {
        var t = TAB_MAP[page];
        if (!t) return;
        navGuard.internal = true;
        try { t.action(); } catch (e) { console.warn('[AQ] switch failed', e); }
        finally { navGuard.internal = false; }
        syncTabbar(page);
        if (page === 'home') ensureHomeLoaded();
        if (page === 'lib') { renderLib(); try { loadUserLists(); } catch (e) { } }
    }

    /* 未登录时，原播放器在接口 401 之后会自动跳到「设置」页引导登录，
       这会把新主页顶掉。这里只拦截“非用户点击触发”的设置页跳转，
       用户自己点登录/设置仍然正常进入。 */
    var navGuard = { internal: false, lastUserEvent: 0 };

    /* 播放解析过程中的提示（命中缓存 / 预读成功 / 正在加载 …）在新界面里会浮在
       内容上方挡视线，这里统一改为静默后台加载：只写控制台，不弹提示。
       注意：只屏蔽这些“过程性”提示，播放失败等错误提示照常显示。 */
    var AQ_TOAST_MUTE = [
        '命中浏览器链接缓存',
        '命中服务器本地缓存',
        '命中本地文件',
        '命中缓存链接',
        '[预读]',
        '正在加载: ',
        '链接过期或失效，正在为您重新在线解析',
        '正在自动尝试换源匹配',
        '解析成功'
    ];

    function shouldMuteToast(message) {
        if (typeof message !== 'string') return false;
        for (var i = 0; i < AQ_TOAST_MUTE.length; i++) {
            if (message.indexOf(AQ_TOAST_MUTE[i]) >= 0) return true;
        }
        return false;
    }

    function installToastFilter() {
        if (typeof window.showToast !== 'function' || window.showToast.__aqFiltered) return;
        var original = window.showToast;
        var wrapped = function (type, message, duration) {
            if (shouldMuteToast(message)) {
                console.log('[AQ] 静默提示(不弹窗): ' + message);
                return;
            }
            return original.apply(this, arguments);
        };
        wrapped.__aqFiltered = true;
        window.showToast = wrapped;
    }

    /* （2026-09-25 已删除 installNavGuard/trackUserEvents/navGuard：
     * 之前会拦截原版 switchTab('settings')（未登录 401 跳转、登录引导、退出后回跳等），
     * 导致设置页“该跳不跳”、登录流程与原版不一致。删掉后设置页跳转完全走原版逻辑。） */
    var navGuard = { internal: true, lastUserEvent: 0 };

    function loadHome() {
        if (S.loaded) return;
        S.loaded = true;
        renderChannels();
        loadGuessRadar();
        loadRecommend();
        loadHotSongs();
        loadBoards();
        loadTags().then(function () { loadPlaylists(''); });
    }

    function ensureHomeLoaded() {
        if (!S.loaded) loadHome();
    }

    function wireHomeInteractions() {
        var duoGuess = $('#duoGuess');
        var duoRadar = $('#duoRadar');
        if (duoGuess) duoGuess.addEventListener('click', function () { playList(S.home.guess, 0); });
        if (duoRadar) duoRadar.addEventListener('click', function () { playList(S.home.radar, 0); });

        var btnRec = $('#btnRecRefresh');
        if (btnRec) btnRec.addEventListener('click', function () {
            btnRec.textContent = '换一批…';
            loadRecommend().then(function () {
                btnRec.textContent = '换一批';
                toast('已换一批推荐');
            });
        });

        var btnCh = $('#btnChRefresh');
        if (btnCh) btnCh.addEventListener('click', function () {
            if (S.chView === 'channel') {
                renderChannels();
                toast('已换一批频道');
            } else {
                loadPlaylists(S.pl.tagId);
                toast('正在换歌单…');
            }
        });

        $$('#chTabs .aq-seg-btn').forEach(function (btn) {
            btn.addEventListener('click', function () {
                S.chView = btn.dataset.view;
                $$('#chTabs .aq-seg-btn').forEach(function (b) { b.classList.toggle('on', b === btn); });
                var ch = $('#chGrid'), pl = $('#homePlGrid'), tags = $('#homeTagRow');
                if (ch) ch.classList.toggle('hide', S.chView !== 'channel');
                if (pl) pl.classList.toggle('hide', S.chView !== 'playlist');
                if (tags) tags.classList.toggle('hide', S.chView !== 'playlist');
                if (S.chView === 'playlist' && !S.pl.list.length) loadPlaylists(S.pl.tagId);
            });
        });

        $$('#aq-tabbar .aq-tab').forEach(function (btn) {
            btn.addEventListener('click', function () { go(btn.dataset.page); });
        });

        var platBtn = $('#aqPlatBtn');
        if (platBtn) {
            platBtn.addEventListener('click', function (e) {
                e.stopPropagation();
                $('#aqPlatWrap').classList.toggle('open');
            });
            document.addEventListener('click', function () {
                var w = $('#aqPlatWrap');
                if (w) w.classList.remove('open');
            });
        }
        renderPlatMenu();
        wireSheetButtons();
    }

    function renderPlatMenu() {
        var menu = $('#aqPlatMenu');
        var label = $('#aqPlatName');
        if (label) label.textContent = platName(S.source).short;
        if (!menu) return;
        menu.innerHTML = PLATFORMS.map(function (p) {
            return '<button data-id="' + p.id + '" class="' + (p.id === S.source ? 'on' : '') + '">' +
                esc(p.name) + '</button>';
        }).join('');
        $$('button', menu).forEach(function (b) {
            b.addEventListener('click', function (e) {
                e.stopPropagation();
                setSource(b.dataset.id);
            });
        });
    }

    function setSource(id) {
        if (!id || id === S.source) {
            var w = $('#aqPlatWrap');
            if (w) w.classList.remove('open');
            return;
        }
        S.source = id;
        localStorage.setItem(SOURCE_KEY, id);
        var w2 = $('#aqPlatWrap');
        if (w2) w2.classList.remove('open');
        renderPlatMenu();
        /* 源变了：清缓存并重载当前源的板块内容 */
        S.home = { rec: [], hot: [], guess: [], radar: [] };
        S.pl = { tags: null, tagId: '', list: [], page: 1, loading: false };
        S.boards = { all: [], loading: false };
        var grid = $('#homePlGrid');
        if (grid) grid.innerHTML = '<div class="empty" style="grid-column:1/-1;padding:20px">切换源…</div>';
        paintHot([]);
        toast('已切换到 ' + platName(id).name);
        S.loaded = true;
        renderChannels();
        loadGuessRadar();
        loadRecommend();
        loadHotSongs();
        loadBoards();
        loadTags().then(function () { loadPlaylists(''); });
    }

    function wireAlbumRow(row, list) {
        $$('.album', row).forEach(function (el, i) {
            el.addEventListener('click', function () { playList(list, i); });
        });
    }

    function wireRankCards(root, list) {
        $$('.rank-card', root).forEach(function (el) {
            el.addEventListener('click', function () {
                var id = el.dataset.id;
                var board = (list || []).filter(function (b) {
                    return String(b.bangid || b.id) === String(id);
                })[0];
                if (board) openBoard(board);
            });
        });
    }

    /* ------------------------------- 初始化 ------------------------------- */

    function init() {
        try {
            installToastFilter();
            wireHomeInteractions();
            watchPageTitle();
            syncTabbar('home');
            go('home');
        } catch (e) {
            console.warn('[AQ] init failed', e);
        }
    }

    window.AqUI = {
        go: go,
        setSource: setSource,
        reload: function () { S.loaded = false; loadHome(); },
        state: S,
        source: function () { return S.source; },
        openPlaylist: openPlaylist,
        openSongs: openSongsSheet,
        toast: toast
    };

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else setTimeout(init, 0);
})();
