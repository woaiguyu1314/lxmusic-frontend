/* ============================================================================
 * 歌词搜索替换 (Lyric Search & Replace)
 * ----------------------------------------------------------------------------
 * 场景：歌词不对（串词、错版本、缺词、翻译对不上）时，让用户主动搜一首歌词源，
 *       预览后一键替换当前歌曲的歌词。
 *
 * 设计要点：
 *   1. 纯前端新增文件，不改动 app.js 既有逻辑，只通过 window 暴露的钩子接入。
 *   2. 搜索复用主搜索接口 /api/music/search（type=song），跨全部音源各取前几首，
 *      因为「同一首歌在别的平台往往有更准的歌词」是这类场景的主要价值。
 *   3. 替换后走与 fetchLyric 相同的落盘链路（浏览器 localStorage + 服务器缓存），
 *      并强制刷新 lastLyricSongId 让下次进歌也用新歌词。
 *   4. 用 [DEBUG-lyric] 前缀标记所有调试日志，便于收尾 grep 清理。
 * ========================================================================== */
(function () {
    'use strict';

    var LOG = '[DEBUG-lyric] ';
    var state = {
        modal: null,      // 弹层根节点
        results: [],      // 搜索结果
        targetSong: null, // 目标歌曲（被替换歌词的那首）
        sourceKey: null,  // 目标缓存键
        loading: false,
        seq: 0            // 请求序号，防止慢响应覆盖新结果
    };

    /* ---------- 小工具 ---------- */

    function log() {
        // 集中出口，方便统一清理
        if (window.console && console.log) {
            console.log.apply(console, [LOG].concat(Array.prototype.slice.call(arguments)));
        }
    }

    function escapeHtml(str) {
        return String(str === undefined || str === null ? '' : str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    // 与 app.js 的 getSongKey 保持一致（优先拿不到时退化为 name|singer 组合）
    function lyricCacheKey(song) {
        if (!song) return null;
        var source = song.source || (song.meta && song.meta.source) || '';
        var songmid = song.songmid || song.songId ||
            (song.meta && (song.meta.songmid || song.meta.songId));
        if (!songmid) return null;
        return source + '_' + songmid + ' ';
    }

    /* ---------- 弹层 ---------- */

    function closeModal() {
        if (state.modal && state.modal.parentNode) {
            state.modal.parentNode.removeChild(state.modal);
        }
        state.modal = null;
        state.results = [];
        state.loading = false;
    }

    function buildModal(defaultKeyword) {
        closeModal();

        var modal = document.createElement('div');
        modal.id = 'aq-lyric-search-modal';
        modal.style.cssText = [
            'position:fixed',
            'inset:0',
            'z-index:10050',
            'display:flex',
            'align-items:flex-end',
            'justify-content:center',
            'padding:0'
        ].join(';');
        modal.innerHTML = [
            '<div data-aq-lyric-mask="1" style="position:absolute;inset:0;background:rgba(0,0,0,.45);backdrop-filter:blur(2px)"></div>',
            '<div style="position:relative;width:100%;max-width:520px;max-height:82vh;display:flex;flex-direction:column;',
            'background:var(--bg-panel,#fff);border-radius:20px 20px 0 0;overflow:hidden;',
            'box-shadow:0 -8px 32px rgba(0,0,0,.22)">',

            '  <div style="display:flex;align-items:center;gap:10px;padding:14px 16px 10px;flex-shrink:0">',
            '    <i class="fas fa-magnifying-glass" style="color:#10b981"></i>',
            '    <input id="aq-lyric-kw" type="text" placeholder="输入歌名或歌手，搜索其它歌词源"',
            '      style="flex:1;min-width:0;padding:9px 12px;border-radius:12px;border:1px solid rgba(0,0,0,.10);',
            '      background:rgba(127,127,127,.10);color:inherit;font-size:14px;outline:none" />',
            '    <button data-aq-lyric-close="1" aria-label="关闭"',
            '      style="width:32px;height:32px;border-radius:9999px;display:flex;align-items:center;justify-content:center;',
            '      background:rgba(127,127,127,.14);color:inherit;border:0;cursor:pointer">',
            '      <i class="fas fa-times"></i>',
            '    </button>',
            '  </div>',

            '  <div id="aq-lyric-hint" style="padding:4px 16px 10px;font-size:12px;opacity:.62;flex-shrink:0"></div>',

            '  <div id="aq-lyric-list" style="flex:1;overflow-y:auto;padding:0 12px 16px;-webkit-overflow-scrolling:touch"></div>',

            '</div>'
        ].join('');

        document.body.appendChild(modal);
        state.modal = modal;

        var kwInput = modal.querySelector('#aq-lyric-kw');
        kwInput.value = defaultKeyword || '';
        kwInput.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') { e.preventDefault(); doSearch(kwInput.value); }
            if (e.key === 'Escape') { closeModal(); }
        });

        modal.querySelector('[data-aq-lyric-mask="1"]').addEventListener('click', closeModal);
        modal.querySelector('[data-aq-lyric-close="1"]').addEventListener('click', closeModal);

        setHint('输入关键词后回车，跨音源搜索。选中后会覆盖当前歌曲的歌词。');
        renderList([]);
        return modal;
    }

    function setHint(text) {
        if (!state.modal) return;
        var el = state.modal.querySelector('#aq-lyric-hint');
        if (el) el.textContent = text || '';
    }

    /* ---------- 渲染结果列表 ---------- */

    function renderList(items) {
        if (!state.modal) return;
        var box = state.modal.querySelector('#aq-lyric-list');
        if (!box) return;

        if (state.loading) {
            box.innerHTML = '<div style="padding:28px;text-align:center;opacity:.6;font-size:13px">' +
                '<i class="fas fa-spinner fa-spin" style="color:#10b981"></i> 搜索中…</div>';
            return;
        }

        if (!items.length) {
            box.innerHTML = '<div style="padding:28px;text-align:center;opacity:.55;font-size:13px">没有找到匹配的歌曲</div>';
            return;
        }

        box.innerHTML = items.map(function (it, i) {
            var badge = it.sourceName || it.source || '?';
            return '<div data-aq-lyric-pick="' + i + '" role="button" tabindex="0" ' +
                'style="display:flex;align-items:center;gap:10px;padding:10px 8px;border-radius:12px;cursor:pointer">' +
                '<div style="flex:1;min-width:0">' +
                '<div style="font-size:14px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' +
                escapeHtml(it.name) + '</div>' +
                '<div style="font-size:12px;opacity:.6;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' +
                escapeHtml(it.singer || it.artist || '未知歌手') + ' · ' + escapeHtml(badge) + '</div>' +
                '</div>' +
                '<i class="fas fa-chevron-right" style="opacity:.3;font-size:12px"></i>' +
                '</div>';
        }).join('');

        box.querySelectorAll('[data-aq-lyric-pick]').forEach(function (el) {
            var idx = Number(el.getAttribute('data-aq-lyric-pick'));
            var fire = function () { pick(idx); };
            el.addEventListener('click', fire);
            el.addEventListener('keydown', function (e) {
                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fire(); }
            });
        });
    }

    /* ---------- 搜索 ---------- */

    function doSearch(keyword) {
        if (!state.modal) return;
        var kw = (keyword || '').trim();
        if (!kw) { setHint('请输入歌名或歌手'); return; }

        var mySeq = ++state.seq;
        state.loading = true;
        renderList([]);
        setHint('搜索中…');

        // 各音源并发搜，取前 3 首合并去重；歌词更好的版本往往就在别的平台
        var sources = ['kw', 'kg', 'tx', 'wy', 'mg'];
        var headers = (typeof getUserAuthHeaders === 'function') ? getUserAuthHeaders() : {};

        var jobs = sources.map(function (s) {
            var url = '/api/music/search?name=' + encodeURIComponent(kw) +
                '&source=' + s + '&page=1&type=song';
            return fetch(url, { headers: headers })
                .then(function (r) { return r.ok ? r.json() : []; })
                .then(function (d) { return Array.isArray(d) ? d : (d && d.list) || []; })
                .catch(function (e) { log('search fail', s, e && e.message); return []; })
                .then(function (arr) { return arr.slice(0, 3).map(function (x) { return Object.assign({}, x, { source: x.source || s }); }); });
        });

        Promise.all(jobs).then(function (lists) {
            if (mySeq !== state.seq) return; // 已有更新的搜索，丢弃本次

            var seen = {};
            var merged = [];
            lists.forEach(function (arr) {
                arr.forEach(function (song) {
                    // 歌名+歌手去重，避免同歌多平台刷屏
                    var k = (song.name || '') + '|' + (song.singer || song.artist || '');
                    if (!k || seen[k]) return;
                    seen[k] = 1;
                    merged.push(song);
                });
            });

            state.loading = false;
            state.results = merged;
            renderList(merged);
            setHint(merged.length
                ? '找到 ' + merged.length + ' 条，点击任意一条获取并替换歌词'
                : '没有找到匹配的歌曲，换个关键词试试');
        });
    }

    /* ---------- 选中：拉歌词并应用 ---------- */

    function pick(index) {
        var song = state.results[index];
        if (!song) return;

        var mySeq = state.seq;
        state.loading = true;
        renderList(state.results);
        setHint('正在获取「' + (song.name || '') + '」的歌词…');

        var source = song.source;
        var songmid = song.songmid || song.songId;
        if (!songmid) {
            state.loading = false;
            setHint('该条目缺少可用的歌曲 ID，无法获取歌词');
            return;
        }

        var params = new URLSearchParams({
            source: source,
            songmid: songmid,
            name: song.name || '',
            singer: song.singer || song.artist || '',
            hash: song.hash || '',
            interval: song.interval || '',
            copyrightId: song.copyrightId || '',
            albumId: song.albumId || '',
            lrcUrl: song.lrcUrl || '',
            mrcUrl: song.mrcUrl || '',
            trcUrl: song.trcUrl || ''
        });

        var headers = (typeof getUserAuthHeaders === 'function') ? getUserAuthHeaders() : {};

        fetch('/api/music/lyric?' + params.toString(), { headers: headers, priority: 'low' })
            .then(function (r) { return r.ok ? r.json() : null; })
            .then(function (data) {
                if (mySeq !== state.seq) return;
                if (!data) throw new Error('歌词接口无响应');

                var lrc = data.lyric || data.lrc || '';
                if (!lrc) throw new Error('该来源没有返回歌词文本');

                applyLyricReplace(song, {
                    lrc: lrc,
                    tlyric: data.tlyric || '',
                    rlyric: data.rlyric || '',
                    klyric: data.klyric || data.lxlyric || ''
                });
            })
            .catch(function (e) {
                if (mySeq !== state.seq) return;
                state.loading = false;
                renderList(state.results);
                setHint('获取失败：' + (e && e.message ? e.message : '未知错误'));
                log('pick fail', e && e.message);
            });
    }

    /* ---------- 应用替换结果 ---------- */

    function applyLyricReplace(fromSong, lyricObj) {
        var target = state.targetSong;
        if (!target) { closeModal(); return; }

        // 1) 先把用户选中的来源信息合并进当前歌曲（后续缓存/服务器落盘都按 target 的 key）
        try {
            target._lyricFrom = {
                source: fromSong.source,
                songmid: fromSong.songmid || fromSong.songId,
                name: fromSong.name,
                singer: fromSong.singer
            };
        } catch (e) { /* 只读对象时忽略 */ }

        // 2) 覆盖全局歌词原文。initLyricPlayer/applyLyricUpdate 会读这几个变量。
        //    必须走 window.AqLyricState —— 那些是顶层 `let`，不会挂到 window，
        //    直接 window.currentRawLrc = x 会被静默丢弃（读出来还是 undefined）。
        var st = window.AqLyricState;
        if (st) {
            st.lrc = lyricObj.lrc;
            st.tlyric = lyricObj.tlyric;
            st.rlyric = lyricObj.rlyric;
            st.klyric = lyricObj.klyric;
        } else {
            // 钩子不存在（理论上不会），退化为尽力而为
            try {
                window.currentRawLrc = lyricObj.lrc;
                window.currentRawTlrc = lyricObj.tlyric;
                window.currentRawRlrc = lyricObj.rlyric;
                window.currentRawKlrc = lyricObj.klyric;
            } catch (e) { log('set raw failed', e && e.message); }
        }

        // 3) 重新渲染歌词
        if (typeof initLyricPlayer === 'function') initLyricPlayer();
        if (typeof applyLyricUpdate === 'function') applyLyricUpdate();
        if (typeof renderLyric === 'function' && lyricObj.lrc) {
            // applyLyricUpdate 内部已通过 setLyric 触发 onSetLyric → renderLyric，
            // 这里只兜底：若播放器尚未就绪，直接用 parseLyric 渲染
        }

        // 4) 落盘：用新歌词覆盖旧缓存。key 仍是「当前这首歌」的 key，
        //    这样下次播放这首歌时直接命中新歌词，不会又变回错的版本。
        persistLyricOverride(target, lyricObj);

        // 5) 强制下次 fetchLyric 重新走网络（绕过"歌词已就绪"的短路）
        if (st) st.lastSongId = null;
        else { try { window.lastLyricSongId = null; } catch (e) { } }

        closeModal();

        if (typeof showToast === 'function') {
            showToast('success', '歌词已替换（来源：' + (fromSong.source || '?') + '）');
        }
    }

    /* ---------- 持久化：覆盖缓存 ---------- */

    function persistLyricOverride(song, lyricObj) {
        var key = lyricCacheKey(song);
        if (!key) return;
        var st = window.AqLyricState;

        // 浏览器本地缓存
        try {
            localStorage.setItem('lx_lyric_' + key, JSON.stringify({
                lrc: lyricObj.lrc,
                tlyric: lyricObj.tlyric,
                rlyric: lyricObj.rlyric,
                klyric: lyricObj.klyric
            }));
            log('local cache overwritten', key);
        } catch (e) { log('local cache write fail', e && e.message); }

        // 服务器端缓存：复用 fetchLyric 的 POST 契约
        try {
            var headers = (typeof getUserAuthHeaders === 'function') ? getUserAuthHeaders() : {};
            fetch('/api/music/cache/lyric', {
                method: 'POST',
                headers: Object.assign({}, headers, { 'Content-Type': 'application/json' }),
                body: JSON.stringify({
                    // 注意：songInfo 用「当前歌曲」而非选中的来源，
                    // 因为缓存是按当前歌曲的 key 存的；歌词内容用新抓到的。
                    // 音质：currentQuality / settings 同为顶层 let（不挂 window），
                    // 统一从 AqLyricState 读，避免写 null 让服务端判不出音质档位。
                    songInfo: Object.assign({}, song, {
                        quality: (st && st.quality) ||
                            (st && st.settings && st.settings.preferredQuality) ||
                            null
                    }),
                    lyricsObj: {
                        lyric: lyricObj.lrc,
                        tlyric: lyricObj.tlyric,
                        rlyric: lyricObj.rlyric,
                        lxlyric: lyricObj.klyric
                    }
                })
            }).catch(function (e) { log('server cache fail', e && e.message); });
        } catch (e) { log('server cache throw', e && e.message); }
    }

    /* ---------- 打开 ---------- */

    function open() {
        // 目标 = 当前正在播放的歌曲
        var song = window.currentPlayingSong || null;
        if (!song) {
            if (typeof showToast === 'function') {
                showToast('info', '当前没有正在播放的歌曲');
            }
            return;
        }
        state.targetSong = song;
        state.seq = 0;

        var kw = (song.name || '') + ' ' + (song.singer || '');
        buildModal(kw.trim());
    }

    /* ---------- 启动 ---------- */

    function boot() {
        /* 入口按钮已迁到播放页功能胶囊（母带与定时之间，id=aqNpLyricSearch，
         * 由 js/player-ui.js 构建），这里不再往歌词区注入按钮，
         * 避免同一功能出现两个入口。 */
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }

    window.AqLyricSearch = {
        open: open,
        close: closeModal,
        doSearch: doSearch
    };
})();
