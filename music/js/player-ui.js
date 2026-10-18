/* =============================================================================
 * player-ui.js —— 参考页风格的播放界面（第二步）
 * -----------------------------------------------------------------------------
 * · 底部胶囊播放条（取代原底栏的视觉，原底栏保留为功能载体）
 * · 全屏播放页（Now Playing）：进度、控制区、音质/播放模式切换
 * 播放、歌词、缓存、评论等能力全部复用原播放器，不重复实现。
 * ========================================================================== */
(function () {
    'use strict';

    var audio = null;
    var mini = null;
    var npControls = null;
    var loveList = [];
    var lastState = { name: '', artist: '', cover: '', playing: null, mode: '', quality: '' };

    function $(sel, root) { return (root || document).querySelector(sel); }

    function fmtTime(sec) {
        if (!isFinite(sec) || sec < 0) return '0:00';
        var m = Math.floor(sec / 60);
        var s = Math.floor(sec % 60);
        return m + ':' + (s < 10 ? '0' + s : s);
    }

    function setIcon(btn, iconClass) {
        if (!btn) return;
        var i = btn.querySelector('i');
        if (!i) return;
        if (i.className !== iconClass) i.className = iconClass;
    }

    /* ------------------------------- 迷你胶囊条 ------------------------------- */

    function buildMini() {
        mini = document.createElement('div');
        mini.id = 'aqMini';
        mini.className = 'aq-mini';
        mini.innerHTML = '' +
            '<div class="aq-mini-fill" id="aqMiniFill"></div>' +
            '<div class="aq-mini-particles" id="aqMiniParticles" aria-hidden="true"></div>' +
            '<div class="aq-mini-main" id="aqMiniMain">' +
            '  <div class="aq-mini-art" id="aqMiniArt">' +
            '    <img id="aqMiniCover" alt="" src="/music/assets/logo.svg">' +
            '  </div>' +
            '  <div class="aq-mini-meta">' +
            '    <div class="aq-mini-name" id="aqMiniName">暂无播放</div>' +
            '    <div class="aq-mini-sub" id="aqMiniSub">选择一首歌曲播放</div>' +
            '  </div>' +
            '</div>' +
            '<div class="aq-mini-btns">' +
            '  <button type="button" id="aqMiniPlay" title="播放/暂停" aria-label="播放"><i class="fas fa-play"></i></button>' +
            '  <button type="button" id="aqMiniNext" title="下一首" aria-label="下一首"><i class="fas fa-step-forward"></i></button>' +
            '</div>';
        document.body.appendChild(mini);

        $('#aqMiniMain').addEventListener('click', function () {
            if (typeof window.toggleLyrics === 'function') window.toggleLyrics();
        });
        $('#aqMiniPlay').addEventListener('click', function (e) {
            e.stopPropagation();
            if (typeof window.togglePlay === 'function') window.togglePlay();
        });
        $('#aqMiniNext').addEventListener('click', function (e) {
            e.stopPropagation();
            if (typeof window.playNext === 'function') window.playNext();
        });
    }

    /* ------------------------------ 全屏播放页控制 ------------------------------ */

    function buildNpControls() {
        var detail = $('#view-player-detail');
        if (!detail) return;
        /* init 只跑一次：重复 append 会叠出两个控件区 */
        if (detail.querySelector('.aq-np-controls')) return;
        npControls = document.createElement('div');
        npControls.className = 'aq-np-controls';
        npControls.innerHTML = '' +
            '<div class="aq-np-progress">' +
            '  <span id="aqNpCur">0:00</span>' +
            '  <div class="aq-np-track" id="aqNpTrack"><div class="aq-np-fill" id="aqNpFill"></div></div>' +
            '  <span id="aqNpTotal">0:00</span>' +
            '</div>' +
            '<div class="aq-np-row">' +
            '  <button type="button" class="side" id="aqNpMode" title="播放模式">' + SVG_MODE_LIST + '</button>' +
            '  <button type="button" class="side" id="aqNpPrev" title="上一首"><i class="fas fa-step-backward"></i></button>' +
            '  <button type="button" id="aqNpPlay" title="播放/暂停"><i class="fas fa-play"></i></button>' +
            '  <button type="button" class="side" id="aqNpNext" title="下一首"><i class="fas fa-step-forward"></i></button>' +
            '  <button type="button" class="side" id="aqNpQueue" title="播放队列"><svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M3 13h2v-2H3v2zm0 4h2v-2H3v2zm0-8h2V7H3v2zm4 4h14v-2H7v2zm0 4h14v-2H7v2zM7 7v2h14V7H7z"/></svg></button>' +
            '</div>' +
            '<div class="aq-np-secondary">' +
            '  <button type="button" id="aqNpFav"><svg viewBox="0 0 24 24"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z"/></svg><span>喜欢</span></button>' +
            '  <button type="button" id="aqNpSpeed" title="播放速度"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20a8 8 0 1 1 8-8"/><path d="M12 12l5-3"/><circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none"/></svg><span>1.0x</span></button>' +
            '  <button type="button" id="aqNpQuality" title="音质"><svg viewBox="5.5 3 13 18" fill="none" stroke="currentColor" stroke-width="2.35" stroke-linecap="round"><path d="M7 14.5v-5"/><path d="M10 17V7"/><path d="M13 19.5V4.5"/><path d="M16 16.5V7.5"/><path d="M19 13.5v-3"/></svg><span>音质</span></button>' +

            '  <button type="button" id="aqNpSleep" title="定时关闭"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 14.3A8.5 8.5 0 1 1 9.7 3 7 7 0 0 0 21 14.3z"/></svg><span>定时</span></button>' +
            '  <button type="button" id="aqNpSwitch" title="切换音源"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.15" stroke-linecap="round" stroke-linejoin="round"><path d="M7 7h8a3 3 0 0 1 0 6h-1"/><path d="M15 7l-2.5-2.5M15 7l-2.5 2.5"/><path d="M17 17H9a3 3 0 0 1 0-6h1"/><path d="M9 17l2.5 2.5M9 17l2.5-2.5"/></svg><span>切源</span></button>' +

            '</div>' +

        detail.appendChild(npControls);
        /* 保险：innerHTML 解析后如果尾巴多了杂散文本节点就清掉
         * （曾出现过 [object HTMLDivElement] 文本残留压住胶囊底部） */
        (function () {
            var last = npControls.lastChild;
            if (last && last.nodeType === 3) npControls.removeChild(last);
        })();

        $('#aqNpPlay').addEventListener('click', function () {
            if (typeof window.togglePlay === 'function') window.togglePlay();
        });
        $('#aqNpPrev').addEventListener('click', function () {
            if (typeof window.playPrev === 'function') window.playPrev();
        });
        $('#aqNpNext').addEventListener('click', function () {
            if (typeof window.playNext === 'function') window.playNext();
        });
        $('#aqNpMode').addEventListener('click', cycleMode);
        syncModeBtn();
        $('#aqNpQuality').addEventListener('click', openQualitySheet);


        /* 喜欢/收藏：复用原播放器的收藏弹层（可加入「喜欢的音乐」或自建歌单） */
        $('#aqNpFav').addEventListener('click', function () {
            var likeBtn = document.getElementById('player-like-btn');
            if (likeBtn) likeBtn.click();
            /* 收藏弹层里操作完成后刷新一次“喜欢”状态 */
            setTimeout(refreshLove, 2500);
        });
        $('#aqNpQueue').addEventListener('click', function () {
            if (typeof window.toggleQueueDrawer === 'function') window.toggleQueueDrawer();
        });


        var track = $('#aqNpTrack');
        function seekAt(clientX) {
            if (!audio || !audio.duration) return;
            var rect = track.getBoundingClientRect();
            var ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
            audio.currentTime = ratio * audio.duration;
            paintProgress();
        }
        track.addEventListener('pointerdown', function (e) {
            seekAt(e.clientX);
            var move = function (ev) { seekAt(ev.clientX); };
            var up = function () {
                document.removeEventListener('pointermove', move);
                document.removeEventListener('pointerup', up);
            };
            document.addEventListener('pointermove', move);
            document.addEventListener('pointerup', up);
        });
    }

    /* ------------------------------ 播放模式 / 音质 ------------------------------ */

    function ensureSheet() {
        var mask = $('#aqPSheetMask');
        if (mask) return;
        mask = document.createElement('div');
        mask.id = 'aqPSheetMask';
        mask.className = 'aq-sheet-mask';
        mask.addEventListener('click', closeSheet);
        document.body.appendChild(mask);

        var sheet = document.createElement('div');
        sheet.id = 'aqPSheet';
        sheet.className = 'aq-sheet';
        sheet.innerHTML = '' +
            '<div class="aq-sheet-head"><div class="grip"></div>' +
            '<div class="aq-sheet-title" id="aqPSheetTitle"></div></div>' +
            '<div class="aq-sheet-body" id="aqPSheetBody"></div>';
        document.body.appendChild(sheet);
    }

    function openSheet(title, items, current, onPick) {
        ensureSheet();
        $('#aqPSheetTitle').textContent = title;
        var body = $('#aqPSheetBody');
        body.innerHTML = items.map(function (it) {
            var on = String(it.value) === String(current);
            return '<div class="aq-lib-entry" data-value="' + String(it.value).replace(/"/g, '&quot;') + '">' +
                '<div class="label" style="' + (on ? 'color:var(--pink);font-weight:700' : '') + '">' +
                it.label + '</div>' +
                (on ? '<i class="fas fa-check" style="color:var(--pink)"></i>' : '') +
                '</div>';
        }).join('');
        body.querySelectorAll('.aq-lib-entry').forEach(function (el) {
            el.addEventListener('click', function () {
                onPick(el.dataset.value);
                closeSheet();
            });
        });
        $('#aqPSheetMask').classList.add('open');
        $('#aqPSheet').classList.add('open');
    }

    function closeSheet() {
        var m = $('#aqPSheetMask'), s = $('#aqPSheet');
        if (m) m.classList.remove('open');
        if (s) s.classList.remove('open');
    }

    function currentMode() {
        var i = $('#play-mode-btn i');
        if (!i) return 'list';
        if (i.classList.contains('fa-redo-alt')) return 'single';
        if (i.classList.contains('fa-random')) return 'random';
        if (i.classList.contains('fa-play')) return 'order';
        return 'list';
    }

    function modeText(mode) {
        return { list: '列表', single: '单曲', random: '随机', order: '顺序' }[mode] || '列表';
    }

    /* 播放模式顺序：列表循环 -> 单曲循环 -> 随机播放 -> 顺序播放 */
    var MODE_CYCLE = ['list', 'single', 'random', 'order'];
    /* 与原版播放模式按钮一致的 FontAwesome 图标 */
    /* [修改] 美化：对齐参考站影视壳播放页的 Material 实心图标 */
    var SVG_MODE_LIST = '<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z"/></svg>';
    var SVG_MODE_SINGLE = '<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z"/><text x="12" y="16" text-anchor="middle" font-size="8" font-weight="700" fill="currentColor">1</text></svg>';
    var SVG_MODE_RANDOM = '<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M10.59 9.17L5.41 4 4 5.41l5.17 5.17 1.42-1.41zM14.5 4l2.04 2.04L4 18.59 5.41 20 17.96 7.46 20 9.5V4h-5.5zm.33 9.41l-1.41 1.41 3.13 3.13L14.5 20H20v-5.5l-2.04 2.04-3.13-3.13z"/></svg>';
    var SVG_MODE_ORDER = '<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M3 10h11v2H3v-2zm0-4h11v2H3V6zm0 8h7v2H3v-2zm13-1v8l6-4-6-4z"/></svg>';
    var MODE_SVG = { 'list': SVG_MODE_LIST, 'single': SVG_MODE_SINGLE, 'random': SVG_MODE_RANDOM, 'order': SVG_MODE_ORDER };

    function cycleMode() {
        var cur = currentMode();
        var idx = MODE_CYCLE.indexOf(cur);
        var next = MODE_CYCLE[(idx + 1) % MODE_CYCLE.length];
        if (typeof window.setPlayModeSilent === 'function') {
            window.setPlayModeSilent(next);
        } else if (typeof window.setPlayMode === 'function') {
            window.setPlayMode(next);
        }
        var btn = $('#aqNpMode');
        if (btn) btn.innerHTML = MODE_SVG[next];
        modeFlash(modeText(next));
        console.log('[Mode] cycle to ' + next);
    }

    /* 同步列表按钮文本（初始进入播放页时读原版按钮图标判断当前模式） */
    function syncModeBtn() {
        var btn = $('#aqNpMode');
        if (!btn) return;
        var cur = currentMode();
        btn.innerHTML = MODE_SVG[cur];
    }

    /* 播放页内淡入模式名提示，1.2s 后淡出，只留控件 */
    function modeFlash(text) {
        var el = $('#aqModeFlash');
        if (!el) {
            el = document.createElement('div');
            el.id = 'aqModeFlash';
            document.body.appendChild(el);
        }
        el.textContent = text;
        /* 强制 reflow 后加 show，确保淡入动画触发 */
        void el.offsetWidth;
        el.classList.add('show');
        clearTimeout(el._t);
        el._t = setTimeout(function () {
            el.classList.remove('show');
        }, 1200);
    }

    function openModeSheet() {
        var cur = currentMode();
        openSheet('播放模式', [
            { value: 'list', label: '列表循环' },
            { value: 'single', label: '单曲循环' },
            { value: 'random', label: '随机播放' },
            { value: 'order', label: '顺序播放' }
        ], cur, function (v) {
            if (typeof window.setPlayMode === 'function') window.setPlayMode(v);
            setTimeout(paintMode, 120);
        });
    }

    function qualityItems() {
        var sel = $('#quality-select');
        if (!sel) return [];
        return Array.prototype.slice.call(sel.options).map(function (o) {
            return { value: o.value, label: o.textContent.trim() };
        });
    }

    function currentQualityValue() {
        var sel = $('#quality-select');
        return sel ? sel.value : '';
    }

    function openQualitySheet() {
        var items = qualityItems();
        if (!items.length) { return; }
        openSheet('默认音质', items, currentQualityValue(), function (v) {
            var sel = $('#quality-select');
            if (!sel) return;
            sel.value = v;
            sel.dispatchEvent(new Event('change', { bubbles: true }));
            setTimeout(paintQuality, 150);
        });
    }

    /* -------------------------------- 状态同步 -------------------------------- */

    function playing() {
        return !!(audio && !audio.paused && !audio.ended && audio.currentTime >= 0 && audio.src);
    }

    function paintProgress() {
        if (!audio) return;
        var ratio = (audio.duration && isFinite(audio.duration)) ? (audio.currentTime / audio.duration) : 0;
        var pct = Math.max(0, Math.min(100, ratio * 100)) + '%';
        var miniFill = $('#aqMiniFill');
        if (miniFill) miniFill.style.width = pct;
        var npFill = $('#aqNpFill');
        if (npFill) npFill.style.width = pct;
        var cur = $('#aqNpCur');
        if (cur) cur.textContent = fmtTime(audio.currentTime);
        var total = $('#aqNpTotal');
        if (total) total.textContent = fmtTime(audio.duration || 0);
    }

    function paintPlayButtons() {
        var isPlaying = playing();
        if (lastState.playing === isPlaying) return;
        lastState.playing = isPlaying;
        var icon = isPlaying ? 'fas fa-pause' : 'fas fa-play';
        setIcon($('#aqMiniPlay'), icon);
        setIcon($('#aqNpPlay'), icon);
        var art = $('#aqMiniArt');
        if (art) art.classList.toggle('spin', isPlaying);
    }

    function paintMode() {
        var el = $('#aqNpMode');
        if (!el) return;
        /* 图标按钮：按当前模式刷新 SVG 图标；_mode 标记避免每次 tick 重复重绘 */
        var cur = currentMode();
        if (el._mode === cur && el.querySelector('svg')) return;
        el.innerHTML = MODE_SVG[cur];
        el._mode = cur;
    }

    function paintFav() {
        var btn = $('#aqNpFav');
        if (!btn) return;
        /* 以“当前歌曲是否在喜欢的音乐里”为准，兜底用原按钮的状态色 */
        var liked = null;
        var song = window.currentPlayingSong || null;
        if (song && loveList.length) {
            var sid = song.id || '';
            var mid = song.songmid || '';
            liked = loveList.some(function (s) {
                return (sid && s.id === sid) || (mid && (s.songmid === mid || s.id === mid));
            });
        }
        if (liked === null) {
            var src = document.getElementById('player-like-btn');
            liked = !!(src && src.classList.contains('text-red-500'));
        }
        if (lastState.fav === liked) return;
        lastState.fav = liked;
        /* SVG 心：喜欢后加 fav-on 类，CSS 负责填成实心粉（参考页 .liked） */
        btn.classList.toggle('fav-on', !!liked);
        btn.classList.toggle('liked', !!liked);
        btn.style.color = '';
    }

    function paintQuality() {
        var el = $('#aqNpQuality');
        if (!el) return;
        var span = el.querySelector('span');
        var sel = $('#quality-select');
        var label = '音质';
        if (sel && sel.selectedIndex >= 0) {
            label = (sel.options[sel.selectedIndex].textContent || '').replace(/音质|无损|高解析度|空间音频|增强空间音频/g, function (m) {
                return { '音质': '', '无损': '无损', '高解析度': 'Hi-Res', '空间音频': 'Atmos', '增强空间音频': 'Atmos+' }[m];
            }).trim() || '音质';
        }
        var target = span || el;
        if (target.textContent !== label) target.textContent = label;
    }

    /* mini 歌词由 aq-enhance 接管（歌词滚动 + 跑马灯），此函数保留兼容 */
    function currentLyricText() {
        try {
            var lines = window.currentLyricLines;
            var idx = window.currentLyricIndex;
            if (lines && idx >= 0 && lines[idx] && lines[idx].text) return lines[idx].text;
        } catch (e) { }
        return '';
    }

    /* 读取仓库账号里「喜欢的音乐」，用于显示爱心状态 */
    function refreshLove() {
        var logged = false;
        try { logged = typeof window.isUserLoggedIn === 'function' && window.isUserLoggedIn(); } catch (e) { }
        if (!logged) { loveList = []; return; }
        var headers = {};
        try { if (typeof window.getUserAuthHeaders === 'function') headers = window.getUserAuthHeaders(); } catch (e) { }
        fetch('/api/user/list', { headers: headers }).then(function (r) {
            return r.ok ? r.json() : null;
        }).then(function (data) {
            loveList = (data && data.loveList) || [];
            lastState.fav = null;
        }).catch(function () { });
    }

    function paintMeta() {
        var titleEl = document.getElementById('player-title');
        var artistEl = document.getElementById('player-artist');
        var coverEl = document.getElementById('player-cover');
        var name = titleEl ? (titleEl.innerText || '').trim() : '';
        var artist = artistEl ? (artistEl.innerText || '').trim() : '';
        var hasSong = !!name && name !== '暂无播放';

        if (mini) mini.classList.toggle('show', hasSong);
        if (!hasSong) return;

        var nameEl = $('#aqMiniName');
        if (nameEl && lastState.name !== name) {
            nameEl.textContent = name;
            lastState.name = name;
        }
        /* mini 歌词由 aq-enhance 接管（歌词滚动 + 跑马灯）：这里只记歌手，不写 sub */
        var artistEl = document.getElementById('player-artist');
        var artist2 = artistEl ? (artistEl.innerText || '').trim() : '';
        if (lastState.artist !== artist2) lastState.artist = artist2;
        var cover = $('#aqMiniCover');
        var src = coverEl ? coverEl.currentSrc || coverEl.src : '';
        if (cover && src && lastState.cover !== src) {
            cover.src = src;
            lastState.cover = src;
        }
    }

    function npOpen() {
        var detail = $('#view-player-detail');
        return !!(detail && !detail.classList.contains('hidden'));
    }

    function tick() {
        if (!audio) audio = document.getElementById('audio-player');
        paintMeta();
        paintPlayButtons();
        paintProgress();
        paintMode();
        paintQuality();
        paintFav();
    }

    function init() {
        audio = document.getElementById('audio-player');
        buildMini();
        buildNpControls();
        if (audio) {
            ['play', 'pause', 'timeupdate', 'loadedmetadata', 'ended', 'error'].forEach(function (evt) {
                audio.addEventListener(evt, function () {
                    lastState.playing = null;
                    tick();
                });
            });
            /* [v61] 播放/暂停事件即时刷新按钮图标：原实现仅靠 600ms 轮询，
             * 暂停后图标最多延迟 600ms 才更新；事件驱动后点击立即响应 */
            audio.addEventListener('play', function () {
                lastState.playing = null;
                paintPlayButtons();
            });
            audio.addEventListener('pause', function () {
                lastState.playing = null;
                paintPlayButtons();
            });
        }
        setInterval(tick, 600);
        refreshLove();
        setInterval(refreshLove, 30000);
        tick();
        console.log('[AQ] 播放界面已就绪');
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else setTimeout(init, 0);
})();
