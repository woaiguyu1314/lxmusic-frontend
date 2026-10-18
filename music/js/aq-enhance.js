/* =============================================================================
 * aq-enhance.js —— 参考网页缺失效果补齐（增量增强，不破坏现有功能）
 * -----------------------------------------------------------------------------
 * · mini 播放条歌词滚动（网页版：当前行 + 下一行渐显，左淡出/右侧滑入/跑马灯）
 * · Dock 收合/展开（网页版滚动触发折叠，未播放时永远展开）
 * · 播放页工具行补齐（播放速度 / 定时关闭 / 切源）
 * · 自动播放（听歌雷达 / 为你推荐 / 随机歌单 / 随机榜单）
 * · 定时关闭（倒计时 / 播完本首）
 * 全部数据仍走本服务后端（app.js），不修改后端。
 * ========================================================================== */
(function () {
    'use strict';

    /* ------------------------------- 状态 ------------------------------- */

    var ENH = {
        resume: false,
        autoSrc: 'off',           /* off | guess | rec | playlist | rank */
        sleepUntil: 0,
        sleepAfterTrack: false,
        npOpen: false,
        lastLyricIdx: -1,
        miniLyBusy: false,
        _sleepTimer: null
    };

    function ls(k, d) { try { var v = localStorage.getItem(k); return v == null ? d : v; } catch (e) { return d; } }

    function $(sel, root) { return (root || document).querySelector(sel); }
    function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

    /* ---------------------------- 播放信息读取 ---------------------------- */

    function audio() { return document.getElementById('audio-player'); }

    function isPlaying() {
        var a = audio();
        return !!(a && !a.paused && !a.ended && a.currentTime >= 0 && a.src);
    }

    function lyricLines() {
        /* 洛雪 currentLyricLines: {time:毫秒, text}；归一化成 {t:秒, text}（与参考页一致） */
        try {
            var ls = window.currentLyricLines || [];
            return ls.map(function (l) {
                var t = (l.t != null) ? l.t : ((l.time != null) ? l.time / 1000 : 0);
                return { t: t, text: l.text || '' };
            });
        } catch (e) { return []; }
    }
    function lyricIdx() {
        try { return (typeof window.currentLyricIndex === 'number') ? window.currentLyricIndex : -1; } catch (e) { return -1; }
    }

    function songHasCover() {
        var img = document.getElementById('detail-cover');
        var src = img ? (img.currentSrc || img.src || '') : '';
        return !!(src && src.indexOf('/music/assets/logo.svg') < 0 && src.indexOf('data:') !== 0);
    }

    /* ------------------------- 1. mini 歌词滚动 ------------------------- */

    function ensureMiniLyricDom() {
        var sub = $('#aqMiniSub');
        if (!sub || $('#aqMiniLyTrack')) return;
        sub.classList.add('aq-mini-lyric');
        sub.innerHTML = '' +
            '<div class="aq-mini-ly-track" id="aqMiniLyTrack" aria-hidden="true">' +
            '  <div class="aq-mini-ly-line is-cur" id="aqMiniLyCur"></div>' +
            '  <div class="aq-mini-ly-line is-next" id="aqMiniLyNext"></div>' +
            '</div>' +
            '<div class="aq-mini-artist" id="aqMiniArtist">—</div>';
    }

    var _mqTimer = null;

    function stopMarquee(el) {
        if (_mqTimer) { try { clearTimeout(_mqTimer); } catch (e) {} _mqTimer = null; }
        if (!el || !el.classList) return;
        el.classList.remove('is-marquee');
        el.style.removeProperty('--mq-dx');
        el.style.removeProperty('--mq-dur');
        el.style.transform = '';
    }

    function startMarquee(el) {
        /* 与参考页 startMiniMarquee 一致：先按截断态测量，过长才单次跑马灯 */
        stopMarquee(el);
        if (!el || !el.isConnected) return;
        el.classList.remove('is-marquee');
        el.style.transform = 'translateX(0)';
        try { void el.offsetWidth; } catch (e) {}
        var track = el.parentElement;
        var trackW = (track && track.clientWidth) || el.clientWidth || 0;
        var textW = el.scrollWidth || 0;
        if (!trackW || textW <= trackW + 4) return;
        var dx = -(textW - trackW + 6);
        var dur = Math.max(2.2, Math.min(8, Math.abs(dx) / 40));
        el.style.setProperty('--mq-dx', dx + 'px');
        el.style.setProperty('--mq-dur', dur + 's');
        _mqTimer = setTimeout(function () {
            _mqTimer = null;
            if (!el.isConnected) return;
            el.classList.add('is-marquee');
        }, 40);
    }

    function clearMiniLyric() {
        var track = $('#aqMiniLyTrack');
        var artist = $('#aqMiniArtist');
        var cur = $('#aqMiniLyCur');
        var next = $('#aqMiniLyNext');
        if (cur) { stopMarquee(cur); cur.textContent = ''; cur.className = 'aq-mini-ly-line is-cur'; }
        if (next) { next.textContent = ''; next.className = 'aq-mini-ly-line is-next'; }
        if (artist) artist.textContent = '—';
        if (track) track.style.display = 'none';
        ENH.miniLyBusy = false;
    }

    function setMiniLyricByIndex(idx, force) {
        var sub = $('#aqMiniSub');
        var cur = $('#aqMiniLyCur');
        var track = $('#aqMiniLyTrack');
        if (!sub || !cur || !track) return;
        var lines = lyricLines();
        if (!lines.length) { clearMiniLyric(); return; }
        idx = Math.max(0, Math.min(idx, lines.length - 1));
        var curText = ((lines[idx] && lines[idx].text) || '').trim();
        if (!curText) { clearMiniLyric(); return; }
        track.style.display = '';

        if (force || !cur.textContent || ENH.miniLyBusy) {
            stopMarquee(cur);
            cur.className = 'aq-mini-ly-line is-cur';
            cur.textContent = curText;
            ENH.miniLyBusy = false;
            requestAnimationFrame(function () { startMarquee(cur); });
            return;
        }
        if (cur.textContent === curText) return;

        /* 换句：旧句左淡出，新句从右侧滑入 */
        ENH.miniLyBusy = true;
        stopMarquee(cur);
        cur.classList.add('is-out');
        setTimeout(function () {
            cur.textContent = curText;
            cur.className = 'aq-mini-ly-line is-cur is-from-right';
            try { void cur.offsetWidth; } catch (e) {}
            cur.classList.add('is-enter');
            setTimeout(function () {
                cur.className = 'aq-mini-ly-line is-cur';
                ENH.miniLyBusy = false;
                startMarquee(cur);
            }, 320);
        }, 180);
    }

    function updateMiniLyric(t, force) {
        var lines = lyricLines();
        if (!lines.length) { clearMiniLyric(); return; }
        var idx = 0;
        for (var i = 0; i < lines.length; i++) {
            if (lines[i].t <= t + 0.15) idx = i;
            else break;
        }
        if (idx !== ENH.lastLyricIdx || force) {
            ENH.lastLyricIdx = idx;
            setMiniLyricByIndex(idx, !!force);
            /* 播放页歌词高亮跟随（参考页 .ly.on/.ly.near）：只加类，不碰 app.js 滚动 */
            paintNpLyricNear(idx);
        }
        /* 下一行 */
        var next = $('#aqMiniLyNext');
        if (next && lines[idx + 1] && lines[idx + 1].text) {
            var nt = lines[idx + 1].text.trim();
            if (next.textContent !== nt) next.textContent = nt;
        } else if (next) {
            next.textContent = '';
        }
        /* 歌手 */
        var artist = $('#aqMiniArtist');
        if (artist) {
            var a = document.getElementById('player-artist');
            var at = a ? (a.innerText || '').trim() : '';
            if (at && at !== '—') artist.textContent = at;
            else artist.textContent = '—';
        }
    }

    /* 播放页歌词高亮跟随：只加 .near 类，不碰 app.js 自己的 .active/滚动 */
    function paintNpLyricNear(idx) {
        try {
            var box = document.getElementById('lyric-content');
            if (!box || !box.children || !box.children.length) return;
            var nodes = box.children;
            var i;
            for (i = 0; i < nodes.length; i++) {
                var n = nodes[i];
                if (!n.classList || !n.classList.contains('lyric-line')) continue;
                n.classList.toggle('near', Math.abs(i - idx) === 1);
            }
        } catch (e) {}
    }

    /* --------------------- 2. 沉浸式播放页（2026-09-25：已删除） ---------------------
     * 之前 applyImmersive()/ensureAmbLayer()/computeNpColors()/watchNpCover() 会新建
     * .aq-amb 氛围层并给播放页加 .aq-immersive 类，盖掉原版背景三态
     * （封面虚化/纯色/黑色）。删掉后背景完全由原版 applyPlayerBackground 控制。 */

    /* ------------------------- 3. Dock 收合 / 展开 -------------------------
     * 对齐参考页 #dock：下滑收合 / 上滑展开，两侧出现圆形侧钮。
     * 未在播放（无有效音轨）时永远展开，跟参考页 hasActiveTrack() 一致。 */

    /* =====================================================================
     * 3. Dock 引擎 v78 —— MeloX-Android 完整移植（动效 + 震动）
     * ---------------------------------------------------------------------
     * 动效（对齐 MeloX / MeloXMotion.kt / PublicDampedDragAnimation.kt）：
     *  · 收合/展开：展开 spring(ζ0.755=bounce0.245, k250) / 收合 spring(ζ0.70,k250)；
     *    sprungFrac ±9% 带符号限幅；smoothStep 分层（标签 0-0.32 / 展开层 0.43-0.72
     *    / 收合层 0.52-0.82 / 高度 drop 0.78-1.00）
     *  · 水珠指示器：位置 spring(1.0,1000) 临界阻尼；从搜索返回 spring(0.6,380) Q 弹；
     *    按压 spring(1.0,1000) -> 1.393×(78/56)；缩放 spring(0.6,250)x / spring(0.7,250)y；
     *    速度 spring(0.5,300) 形变（scaleX/=1-v*0.75、scaleY*=1-v*0.25，±0.2 限幅）
     *  · 面板 recoil：拖动时反向偏移 ±4px·EaseOut(|frac|)，松手 spring(1,300) 回零
     *  · 按压辉光：press spring(0.5,300)，位置跟手（毛玻璃态径向白光近似）
     *  · L2 图标按压 1.2× 呼吸；选中色 spring(0.84,480)；迷你 spring(0.34→ζ0.66,300)；
     *    指示器 alpha spring(180,0.7)：选搜索/收合时淡出
     * 震动（对齐 MeloXHaptics.kt）：点击 LongPress(40ms) / 收合双拍 Confirm(15ms)+450ms
     * +LongPress(40ms) / 触顶触底 SegmentTick(8ms) / 总开关 localStorage aq_haptic_enabled
     * 玻璃：毛玻璃（blur/saturate + 渐变叠层），非液态折射 —— 材质保持不变
     * ===================================================================== */

    /* ---------- 3.0 触感（HapticFeedbackType 近似映射：tick/confirm/longpress） ---------- */
    function hv(type) {
        if (ls('aq_haptic_enabled', '1') !== '1') return;
        var ms = { tick: 8, confirm: 15, longpress: 40 }[type] || 15;
        aqVibrate(ms);
    }

    /* 统一震动出口：Android WebView 不实现 navigator.vibrate（静默无效），
       优先走原生桥 LXHaptic（Vibrator/VibrationEffect），再回退 Vibration API。 */
    function aqVibrate(ms) {
        try {
            if (window.LXHaptic && typeof window.LXHaptic.vibrate === 'function') {
                window.LXHaptic.vibrate(ms);
                return;
            }
        } catch (e) {}
        try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) {}
    }
    window.aqVibrate = aqVibrate;

    /* ---------- 3.1 收合/展开（Dock 双弹簧，MeloX MeloXMotion.kt 口径） ---------- */
    var dockCollapsed = false;
    var dockLastY = 0;
    var dockAcc = 0;
    var dockBeatTimer = null;

    function hasActiveTrack() {
        var a = audio();
        return !!(a && a.src && a.currentTime >= 0);
    }

    var dockSpring = { x: 0, v: 0, target: 0, raf: 0, running: false };   /* x: 0=展开 -> 1=收合 */
    var SPRING_K = 250;
    var SPRING_ZETA_COLLAPSE = 0.70;   /* bounce 0.30：四周空出，放开弹 */
    var SPRING_ZETA_EXPAND = 0.755;    /* bounce 0.245：朝邻居长大，收敛着弹 */
    var SPRING_OVER_LIMIT = 0.09;      /* sprungFrac ±9% 带符号限幅 */
    var dockReducedMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

    function springZetaFor(target) { return target >= 1 ? SPRING_ZETA_EXPAND : SPRING_ZETA_COLLAPSE; }

    function smoothStep(a, b, t) {
        var x = Math.max(0, Math.min(1, (t - a) / (b - a)));
        return x * x * (3 - 2 * x);
    }

    var homePressScale = 1;   /* 主页钮按压叠加（meloXLiquidButton） */

    function applyDockSpring(x) {
        /* MeloX 分层映射（progress: 0=展开 -> 1=收合） */
        var labelStage = smoothStep(0.00, 0.32, x);
        var dropStage = smoothStep(0.78, 1.00, x);
        var expandedAlpha = 1 - smoothStep(0.43, 0.72, x);
        var compactAlpha = smoothStep(0.52, 0.82, x);
        var t = document.getElementById('aq-tabbar');
        if (t) {
            t.style.opacity = String(expandedAlpha);
            t.style.transform = 'translateY(' + ((1 - x) * 6).toFixed(2) + 'px) scale(' + (1 - 0.08 * dropStage).toFixed(4) + ')';
            t.style.visibility = expandedAlpha > 0.02 ? 'visible' : 'hidden';
            t.style.pointerEvents = expandedAlpha > 0.02 ? 'auto' : 'none';
        }
        /* [v80b] 搜索 dock 与主页 dock 面板同步 drop 位移：始终同一行同一高度 */
        var se = document.getElementById('aqDockSearch');
        if (se) se.style.transform = 'translateY(' + ((1 - x) * 6).toFixed(2) + 'px)';
        /* 收合层单图标（主页钮）：compactAlpha 驱动出现/缩放（MeloX 收合单图标淡入 0.52-0.82） */
        var sides = document.querySelectorAll('.aq-dock-side:not(#aqDockSearch)');
        for (var i = 0; i < sides.length; i++) {
            var sd = sides[i];
            var base = 0.72 + 0.28 * compactAlpha;
            sd.style.opacity = String(compactAlpha);
            sd.style.transform = 'scale(' + (base * homePressScale).toFixed(4) + ')';
            sd.style.visibility = compactAlpha > 0.02 ? 'visible' : 'hidden';
            sd.style.pointerEvents = compactAlpha > 0.02 ? 'auto' : 'none';
        }
    }

    function tickDockSpring() {
        var s = dockSpring;
        var zeta = springZetaFor(s.target);
        var c = 2 * zeta * Math.sqrt(SPRING_K);
        var a = SPRING_K * (s.target - s.x) - c * s.v;
        s.v += a * 0.016;
        s.x += s.v * 0.016;
        /* 带符号限幅：允许过冲穿过目标 [-0.09, 1.09]，只 clamp 位置不动 v */
        if (s.x > 1 + SPRING_OVER_LIMIT) s.x = 1 + SPRING_OVER_LIMIT;
        if (s.x < -SPRING_OVER_LIMIT) s.x = -SPRING_OVER_LIMIT;
        if (Math.abs(s.v) < 0.001 && Math.abs(s.target - s.x) < 0.004) {
            s.x = s.target; s.v = 0; s.running = false;
            applyDockSpring(s.x);
            var tb = document.getElementById('aq-tabbar');
            if (tb) tb.style.display = s.target >= 1 ? 'none' : '';
            return;
        }
        applyDockSpring(s.x);
        s.raf = requestAnimationFrame(tickDockSpring);
    }

    function startDockSpring(target) {
        var s = dockSpring;
        s.target = target;
        var tb = document.getElementById('aq-tabbar');
        if (tb) tb.style.display = '';
        if (dockReducedMotion) {
            s.x = target; s.v = 0; s.running = false; applyDockSpring(target);
            if (tb) tb.style.display = target >= 1 ? 'none' : '';
            return;
        }
        if (s.running) { s.target = target; return; }   /* 弹簧运行中：只改目标，自然跟手 */
        s.running = true;
        s.raf = requestAnimationFrame(tickDockSpring);
    }

    function setDockCollapsed(on) {
        var dock = $('#aqDock');
        if (!dock) return;
        if (on && !hasActiveTrack()) on = false;
        var changed = dockCollapsed !== !!on;
        dockCollapsed = !!on;
        dock.classList.toggle('collapsed', dockCollapsed);
        document.body.classList.toggle('aq-dock-collapsed', dockCollapsed);
        syncDockSideHighlight();
        if (changed) {
            /* [v78] 双拍节奏（MeloX L1576-1582）：拍1 Confirm「啪」激活 -> 450ms 后拍2 LongPress「咚」落定 */
            hv('confirm');
            if (dockBeatTimer) clearTimeout(dockBeatTimer);
            dockBeatTimer = setTimeout(function () { hv('longpress'); }, 450);
        }
        startDockSpring(dockCollapsed ? 1 : 0);
        ensureDropletRaf();   /* [v84] 收合/展开切换时驱动 droplet 弹簧（alpha 淡出/淡入） */
    }

    /* MeloX compactGlyph 映射：收合胶囊显示当前选中 tab 图标，选搜索回落房子 */
    var AQ_HOME_GLYPHS = {
        home: '<svg viewBox="0 0 24 24" fill="currentColor" style="width:25px;height:25px"><path d="M12 3.2L4 10v10h5v-6h6v6h5V10l-8-6.8z"/></svg>',
        lib: '<svg viewBox="0 0 24 24" fill="currentColor" style="width:25px;height:25px"><path d="M4 5h16v2H4V5zm0 6h16v2H4v-2zm0 6h10v2H4v-2z"/></svg>',
        settings: '<svg viewBox="0 0 24 24" fill="currentColor" style="width:25px;height:25px"><path d="M19.1 12.9a7.4 7.4 0 0 0 0-1.8l2-1.6a.5.5 0 0 0 .1-.6l-1.9-3.3a.5.5 0 0 0-.6-.2l-2.4 1a7 7 0 0 0-1.6-1l-.4-2.5a.5.5 0 0 0-.5-.4h-3.8a.5.5 0 0 0-.5.4l-.4 2.5a7 7 0 0 0-1.6 1l-2.4-1a.5.5 0 0 0-.6.2L2.7 8.9a.5.5 0 0 0 .1.6l2 1.6a7.4 7.4 0 0 0 0 1.8l-2 1.6a.5.5 0 0 0-.1.6l1.9 3.3a.5.5 0 0 0 .6.2l2.4-1a7 7 0 0 0 1.6 1l.4 2.5a.5.5 0 0 0 .5.4h3.8a.5.5 0 0 0 .5-.4l.4-2.5a7 7 0 0 0 1.6-1l2.4 1a.5.5 0 0 0 .6-.2l1.9-3.3a.5.5 0 0 0-.1-.6l-2-1.6zM12 15.5A3.5 3.5 0 1 1 12 8.5a3.5 3.5 0 0 1 0 7z"/></svg>'
    };

    function syncDockSideHighlight() {
        var sv = document.getElementById('view-search');
        var onSearch = !!(sv && !sv.classList.contains('hidden'));
        var hb = $('#aqDockHome'), sb = $('#aqDockSearch');
        if (sb) sb.classList.toggle('on', onSearch);
        if (hb) {
            var pg = currentViewPage();
            if (!pg || pg === 'search') pg = 'home';   /* MeloX compactGlyph：选搜索回落房子 */
            var glyph = AQ_HOME_GLYPHS[pg] || AQ_HOME_GLYPHS.home;
            if (hb.getAttribute('data-glyph') !== pg) {
                hb.setAttribute('data-glyph', pg);
                hb.innerHTML = glyph;
            }
            hb.classList.toggle('on', !onSearch);
        }
    }

    /* ---------- 3.2 水珠指示器（对齐 PublicDampedDragAnimation） ---------- */
    var droplet = {
        value: 0, v: 0, target: 0, bouncy: false,
        press: 0, pv: 0, pressTarget: 0,
        sx: 1, svx: 0, sxTarget: 1,
        sy: 1, svy: 0, syTarget: 1,
        vel: 0, vv: 0, velRaw: 0,
        glow: 0, gv: 0, glowTarget: 0, gx: 50,
        alpha: 1, av: 0, alphaTarget: 1,
        panelFrac: 0, panelV: 0,
        running: false, raf: 0,
        dragging: false
    };
    var PRESSED_SCALE = 78 / 56;          /* 1.392857 */
    var PANEL_RECOIL_PX = 4;              /* px */
    var lastSelIdx = -1;
    var lastViewPage = null;
    var dropletRetry = 0;

    function isSearchView() {
        var sv = document.getElementById('view-search');
        return !!(sv && !sv.classList.contains('hidden'));
    }

    function currentViewPage() {
        var map = [['view-home', 'home'], ['view-lib', 'lib'], ['view-settings', 'settings'], ['view-search', 'search']];
        for (var i = 0; i < map.length; i++) {
            var v = document.getElementById(map[i][0]);
            if (v && !v.classList.contains('hidden')) return map[i][1];
        }
        return lastViewPage;
    }

    function dropletTabs() {
        var inner = document.querySelector('#aq-tabbar .aq-tabbar-inner');
        if (!inner) return [];
        var out = [];
        for (var i = 0; i < inner.children.length; i++) {
            var el = inner.children[i];
            if (el.classList && el.classList.contains('aq-tab')) out.push(el);
        }
        return out;
    }

    function dropletMetrics() {
        var tabs = dropletTabs();
        var inner = tabs.length ? tabs[0].parentNode : null;
        var cw = inner ? inner.clientWidth : 0;
        if (!cw || !isFinite(cw) || !tabs.length) return null;
        var w = (cw - 20) / tabs.length;   /* MeloX L1775：tabWidth = (maxWidth - 20dp) / tabCount（两侧 10dp 边距） */
        var iw = Math.min(w * 1.15 + 2, w + 12);   /* MeloX L1803-1805：dropletWidth = tabWidth*1.15+2，cap tabWidth+12 */
        return { w: w, iw: iw, inner: inner, tabs: tabs, left: 10 };
    }

    function panelRecoilPx() {
        var f = droplet.panelFrac;
        if (!f) return 0;
        var ease = 1 - Math.pow(1 - Math.min(1, Math.abs(f)), 3);
        return -PANEL_RECOIL_PX * (f >= 0 ? 1 : -1) * ease;
    }

    function applyDroplet() {
        var ind = document.getElementById('aqTabIndicator');
        if (!ind) return;
        /* [v85] alpha 独立于 dropletMetrics 更新：收合态 tabbar display:none -> clientWidth=0
         *   -> dropletMetrics 返回 null，若不提前写 opacity，水珠永远不会淡出 */
        ind.style.opacity = String(Math.max(0, Math.min(1, droplet.alpha)));
        var m = dropletMetrics();
        if (!m) return;
        var glow = ind.querySelector('.aq-droplet-glow');
        var xpx = m.left + (droplet.value + 0.5) * m.w - m.iw / 2 + panelRecoilPx();
        var velN = droplet.vel / 10;
        var stX = Math.max(-0.2, Math.min(0.2, velN * 0.75));
        var stY = Math.max(-0.2, Math.min(0.2, velN * 0.25));
        var sx = droplet.sx / (1 - stX);
        var sy = droplet.sy * (1 - stY);
        ind.style.width = m.iw.toFixed(1) + 'px';
        ind.style.transform = 'translateX(' + xpx.toFixed(2) + 'px) translateY(-50%) scale(' + sx.toFixed(4) + ',' + sy.toFixed(4) + ')';
        ind.style.opacity = String(Math.max(0, Math.min(1, droplet.alpha)));
        if (glow) {
            glow.style.opacity = String(Math.max(0, Math.min(1, droplet.glow)));
            glow.style.setProperty('--gx', droplet.gx.toFixed(1) + '%');
        }
        if (m.inner) m.inner.style.transform = 'translateY(' + panelRecoilPx().toFixed(2) + 'px)';
        m.inner.classList.toggle('aq-droplet-press', droplet.press > 0.15);
    }

    function tickDroplet() {
        var d = droplet;
        var dt = 0.016;
        /* 指示器 alpha 目标：dock 展开(x>0.44) 且非搜索视图 -> 1，否则 0 */
        var want = (dockSpring.x < 0.56 && !isSearchView()) ? 1 : 0;   /* MeloX L1808：dockExpanded = progress < 0.56 */
        if (want !== d.alphaTarget) { d.alphaTarget = want; }
        /* 位置弹簧：临界 spring(1.0,1000) / 从搜索返回 Q 弹 spring(0.6,380) */
        var k = d.bouncy ? 380 : 1000;
        var z = d.bouncy ? 0.6 : 1.0;
        var c = 2 * z * Math.sqrt(k);
        var a = k * (d.target - d.value) - c * d.v;
        d.v += a * dt; d.value += d.v * dt;
        /* 按压 spring(1.0,1000) */
        var pc = 2 * 1.0 * Math.sqrt(1000);
        var pa = 1000 * (d.pressTarget - d.press) - pc * d.pv;
        d.pv += pa * dt; d.press += d.pv * dt;
        d.press = Math.max(0, Math.min(1, d.press));
        /* 缩放 spring(0.6,250)x / spring(0.7,250)y，目标=按压态 1.393× */
        var sxc = 2 * 0.6 * Math.sqrt(250);
        var sxa = 250 * (d.sxTarget - d.sx) - sxc * d.svx;
        d.svx += sxa * dt; d.sx += d.svx * dt;
        var syc = 2 * 0.7 * Math.sqrt(250);
        var sya = 250 * (d.syTarget - d.sy) - syc * d.svy;
        d.svy += sya * dt; d.sy += d.svy * dt;
        /* 速度 spring(0.5,300)：拖动跟手实测，松手归零 */
        var vc = 2 * 0.5 * Math.sqrt(300);
        var va = 300 * (d.velRaw - d.vel) - vc * d.vv;
        d.vv += va * dt; d.vel += d.vv * dt;
        /* 辉光 press spring(0.5,300) */
        var gc = 2 * 0.5 * Math.sqrt(300);
        var ga = 300 * (d.glowTarget - d.glow) - gc * d.gv;
        d.gv += ga * dt; d.glow += d.gv * dt;
        d.glow = Math.max(0, Math.min(1, d.glow));
        /* 指示器 alpha spring(180,0.7) */
        var ac = 2 * 0.7 * Math.sqrt(180);
        var aa = 180 * (d.alphaTarget - d.alpha) - ac * d.av;
        d.av += aa * dt; d.alpha += d.av * dt;
        d.alpha = Math.max(0, Math.min(1, d.alpha));
        /* 面板 recoil 回零 spring(1,300) */
        if (!d.dragging && d.panelFrac !== 0) {
            var pfc = 2 * 1.0 * Math.sqrt(300);
            var pfa = 300 * (0 - d.panelFrac) - pfc * d.panelV;
            d.panelV += pfa * dt; d.panelFrac += d.panelV * dt;
            if (Math.abs(d.panelV) < 0.002 && Math.abs(d.panelFrac) < 0.005) { d.panelFrac = 0; d.panelV = 0; }
        }
        applyDroplet();
        /* 落定判定（按压膨胀完成后释放） */
        var settled = !d.dragging && Math.abs(d.v) < 0.004 && Math.abs(d.target - d.value) < 0.02;
        if (settled && d.pressTarget > 0.5) {
            d.pressTarget = 0; d.sxTarget = 1; d.syTarget = 1;
            settled = false;
        }
        if (settled) {
            d.value = d.target; d.v = 0; d.bouncy = false;
        }
        var busy = !settled || d.dragging || d.press > 0.02 || d.glow > 0.02 ||
                   Math.abs(d.alpha - d.alphaTarget) > 0.02 || Math.abs(d.panelFrac) > 0.005;
        if (!busy) { d.running = false; return; }
        d.raf = requestAnimationFrame(tickDroplet);
    }

    function ensureDropletRaf() {
        if (!droplet.running) { droplet.running = true; droplet.raf = requestAnimationFrame(tickDroplet); }
    }

    /* 选中 tab 定位（兼容旧调用；内含真实切换判定 -> 震动/Q弹/按压膨胀） */
    function positionIndicator(snap) {
        var d = droplet;
        var tabs = dropletTabs();
        var ind = document.getElementById('aqTabIndicator');
        var inner = document.querySelector('#aq-tabbar .aq-tabbar-inner');
        var on = document.querySelector('#aq-tabbar .aq-tab.on');
        if (!inner || !on || !ind || !tabs.length) {
            if (!snap) { if (dropletRetry) clearTimeout(dropletRetry); dropletRetry = setTimeout(function () { positionIndicator(snap); }, 60); }
            return;
        }
        var idx = -1;
        for (var i = 0; i < tabs.length; i++) if (tabs[i] === on) { idx = i; break; }
        if (idx < 0) return;
        var cw = inner.clientWidth;
        if (!cw || !isFinite(cw)) {
            if (!snap) { if (dropletRetry) clearTimeout(dropletRetry); dropletRetry = setTimeout(function () { positionIndicator(snap); }, 60); }
            return;
        }
        if (lastViewPage === null) lastViewPage = currentViewPage();
        var pg = currentViewPage();
        var fromSearch = lastViewPage === 'search' && pg !== 'search';
        var realSwitch = lastViewPage !== pg;
        lastViewPage = pg;
        if (!snap) {
            if (realSwitch) {
                /* [v78] tab 真实切换：LongPress（最重档，MeloX tabHaptic） */
                hv('longpress');
                /* [v78] 从搜索返回：Q 弹落格（MeloX animateToValueBouncy） */
                d.bouncy = fromSearch;
            }
            if (lastSelIdx === idx && d.target === idx && Math.abs(d.value - idx) < 0.02) {
                syncTabColors();
                return;   /* 重复触发/无变化：不再重复动画与震动 */
            }
            lastSelIdx = idx;
            d.target = idx;
            d.pressTarget = 1; d.sxTarget = PRESSED_SCALE; d.syTarget = PRESSED_SCALE;
            ensureDropletRaf();
        } else {
            lastSelIdx = idx;
            d.value = idx; d.v = 0; d.target = idx; d.bouncy = false;
            d.press = 0; d.pv = 0; d.pressTarget = 0; d.sx = 1; d.sy = 1;
            d.svx = 0; d.svy = 0; d.sxTarget = 1; d.syTarget = 1;
            d.alpha = 1; d.av = 0; d.alphaTarget = 1;
            d.panelFrac = 0; d.panelV = 0;
            applyDroplet();
            syncTabColors(true);   /* 初次定位颜色直接到位 */
            return;
        }
        syncTabColors(false);
    }

    /* 选中色弹簧（MeloX animateColorAsState spring(0.84,480)） */
    var tabCols = [];
    var tabColorRaf = 0;
    var PINK = [250, 45, 72], GRAY = [140, 140, 148];

    function syncTabColors(instant) {
        var tabs = dropletTabs();
        for (var i = 0; i < tabs.length; i++) {
            var c = tabCols[i] || (tabCols[i] = { r: GRAY[0], g: GRAY[1], b: GRAY[2], vr: 0, vg: 0, vb: 0, tr: GRAY[0], tg: GRAY[1], tb: GRAY[2], active: false });
            var tgt = tabs[i].classList.contains('on') ? PINK : GRAY;
            if (instant) {
                c.r = tgt[0]; c.g = tgt[1]; c.b = tgt[2]; c.active = false;
                c.vr = c.vg = c.vb = 0;
                tabs[i].style.color = 'rgb(' + tgt[0] + ',' + tgt[1] + ',' + tgt[2] + ')';
                continue;
            }
            if (tgt[0] !== c.tr || tgt[1] !== c.tg || tgt[2] !== c.tb) {
                c.tr = tgt[0]; c.tg = tgt[1]; c.tb = tgt[2]; c.active = true;
                ensureTabColorRaf();
            }
        }
    }

    function tickTabColors() {
        var k = 480, z = 0.84, c = 2 * z * Math.sqrt(k), dt = 0.016, any = false;
        var tabs = dropletTabs();
        for (var i = 0; i < tabs.length; i++) {
            var s = tabCols[i];
            if (!s || !s.active) continue;
            var ar = k * (s.tr - s.r) - c * s.vr; s.vr += ar * dt; s.r += s.vr * dt;
            var ag = k * (s.tg - s.g) - c * s.vg; s.vg += ag * dt; s.g += s.vg * dt;
            var ab = k * (s.tb - s.b) - c * s.vb; s.vb += ab * dt; s.b += s.vb * dt;
            if (Math.abs(s.vr) < 0.05 && Math.abs(s.vg) < 0.05 && Math.abs(s.vb) < 0.05 &&
                Math.abs(s.tr - s.r) < 0.5 && Math.abs(s.tg - s.g) < 0.5 && Math.abs(s.tb - s.b) < 0.5) {
                s.r = s.tr; s.g = s.tg; s.b = s.tb; s.vr = s.vg = s.vb = 0; s.active = false;
            } else any = true;
            tabs[i].style.color = 'rgb(' + Math.round(s.r) + ',' + Math.round(s.g) + ',' + Math.round(s.b) + ')';
        }
        tabColorRaf = any ? requestAnimationFrame(tickTabColors) : 0;
    }

    function ensureTabColorRaf() { if (!tabColorRaf) tabColorRaf = requestAnimationFrame(tickTabColors); }

    /* ---------- 3.3 水珠拖拽（MeloX Draggable：位置跟手/速度形变/面板 recoil/辉光跟手） ---------- */
    var dragStart = null;

    function bindDropletDrag() {
        var inner = document.querySelector('#aq-tabbar .aq-tabbar-inner');
        if (!inner || inner.__aqDragBound) return;
        inner.__aqDragBound = true;
        /* 注入辉光层 */
        var ind = document.getElementById('aqTabIndicator');
        if (ind && !ind.querySelector('.aq-droplet-glow')) {
            var glow = document.createElement('div');
            glow.className = 'aq-droplet-glow';
            ind.appendChild(glow);
        }
        inner.addEventListener('pointerdown', function (e) {
            var b = e.target.closest ? e.target.closest('.aq-tab') : null;
            if (b && b.parentNode !== inner) return;
            /* 触屏 pointer 自带隐式捕获；鼠标拖出 inner 时由 window 兜底 */
            dragStart = { x: e.clientX, y: e.clientY, val: droplet.value, t: Date.now() };
            inner.__aqSearchBefore = isSearchView();
            droplet.pressTarget = 1; droplet.sxTarget = PRESSED_SCALE; droplet.syTarget = PRESSED_SCALE;
            droplet.glowTarget = 1;
            ensureDropletRaf();
        });
        inner.addEventListener('pointermove', function (e) {
            if (!dragStart) return;
            var m = dropletMetrics();
            if (!m) return;
            var dx = e.clientX - dragStart.x;
            var dy = e.clientY - dragStart.y;
            if (Math.abs(dx) > 6 || Math.abs(dy) > 6) inner.__aqDragging = true;
            if (!inner.__aqDragging) return;
            e.preventDefault();
            droplet.dragging = true;
            var units = dx / m.w;
            droplet.value = Math.max(0, Math.min(m.tabs.length - 1, dragStart.val + units));
            droplet.target = droplet.value;
            var now = Date.now();
            var dtMs = Math.max(8, now - dragStart.t);
            droplet.velRaw = (units / (dtMs / 1000)) / 10;
            dragStart.t = now; dragStart.x = e.clientX;
            droplet.panelFrac = dx / m.inner.clientWidth;
            var rect = document.getElementById('aqTabIndicator');
            if (rect) {
                var r = rect.getBoundingClientRect();
                droplet.gx = ((e.clientX - r.left) / Math.max(1, r.width)) * 100;
            }
            ensureDropletRaf();
        }, { passive: false });
        function endDrag() {
            if (!dragStart) return;
            var wasDrag = !!inner.__aqDragging;
            var t = droplet.value;
            dragStart = null;
            droplet.dragging = false;
            droplet.pressTarget = 0; droplet.sxTarget = 1; droplet.syTarget = 1;
            droplet.glowTarget = 0;
            droplet.velRaw = 0;
            var m = dropletMetrics();
            if (m) {
                var nearest = Math.max(0, Math.min(m.tabs.length - 1, Math.round(t)));
                if (wasDrag) {
                    var oldPg = currentViewPage();
                    var page = m.tabs[nearest].getAttribute('data-page');
                    try { if (typeof window.switchTab === 'function') window.switchTab(page); } catch (err) {}
                    for (var i2 = 0; i2 < m.tabs.length; i2++) {
                        if (m.tabs[i2] !== m.tabs[nearest]) m.tabs[i2].classList.remove('on');
                    }
                    m.tabs[nearest].classList.add('on');
                    lastViewPage = oldPg;   /* 让 positionIndicator 识别这次真实切换 */
                    setTimeout(function () { positionIndicator(false); }, 20);
                    inner.__aqConsumeClick = true;   /* 抑制拖动结束后的自然 click，防止双重路由 */
                    setTimeout(function () { inner.__aqConsumeClick = false; }, 150);   /* 无自然 click 时安全复位 */
                } else {
                    droplet.target = nearest;
                    ensureDropletRaf();
                }
            }
            /* 保留 __aqDragging 供 click 抑制器消费 */
        }
        inner.addEventListener('pointerup', endDrag);
        inner.addEventListener('pointercancel', function () {
            if (dragStart) endDrag();
            else { inner.__aqDragging = false; inner.__aqConsumeClick = false; }
        });
        /* 鼠标拖出 inner 的兜底 */
        window.addEventListener('pointerup', function () { if (dragStart) endDrag(); });
        /* 拖动结束后的自然 click 抑制（防止双重路由） */
        inner.addEventListener('click', function (e) {
            if (inner.__aqDragging || inner.__aqConsumeClick) {
                e.preventDefault(); e.stopPropagation();
                inner.__aqDragging = false; inner.__aqConsumeClick = false;
                setTimeout(function () { inner.__aqConsumeClick = false; }, 60);
            }
        }, true);
    }

    /* ---------- 3.4a Dock 按钮按压（meloXLiquidButton：4dp/h 轻微放大） ---------- */
    function bindDockButtonPress() {
        $$('#aqDockSearch, #aqDockHome').forEach(function (btn) {
            if (btn.__aqPressBound) return;
            btn.__aqPressBound = true;
            var p = { v: 0, t: 0, raf: 0 };
            function apply() {
                if (btn.id === 'aqDockHome') { homePressScale = 1 + p.v * 0.077; return; }
                btn.style.transform = 'scale(' + (1 + p.v * 0.077).toFixed(4) + ')';
            }
            function tick() {
                var c = 2 * 0.7 * Math.sqrt(250);
                var a = 250 * (p.t - p.v) - c * p.v;
                p.v += a * 0.016;
                p.v = Math.max(0, Math.min(1, p.v));
                apply();
                if (Math.abs(p.v) < 0.004 && Math.abs(p.t - p.v) < 0.01) { p.v = p.t; p.raf = 0; apply(); return; }
                p.raf = requestAnimationFrame(tick);
            }
            btn.addEventListener('pointerdown', function () { p.t = 1; if (!p.raf) p.raf = requestAnimationFrame(tick); });
            btn.addEventListener('pointerup', function () { p.t = 0; });
            btn.addEventListener('pointercancel', function () { p.t = 0; });
        });
    }

    /* 侧钮跳页：复用 tabbar 的路由入口（switchTab 不可见时回退到 tab.click） */
    function goDockPage(page) {
        var prevPg = currentViewPage();
        try { if (typeof window.switchTab === 'function') window.switchTab(page); } catch (e) {}
        var on = document.querySelector('#aq-tabbar .aq-tab[data-page="' + page + '"]');
        if (on) on.click();
        var sb = $('#aqDockSearch');
        if (sb) sb.classList.toggle('on', page === 'search');
        setDockCollapsed(false);
        lastViewPage = prevPg;
        setTimeout(function () { positionIndicator(false); }, 20);
        ensureDropletRaf();
    }

    /* ---------- 3.4b 迷你播放条 reveal（MeloX mediaReveal spring(0.34→ζ0.66,300)） ---------- */
    var miniReveal = { x: 0, v: 0, target: 0, running: false };

    function syncMiniReveal() {
        var mini = document.getElementById('aqMini');
        if (!mini) return;
        miniReveal.target = mini.classList.contains('show') ? 1 : 0;
        if (!miniReveal.running) { miniReveal.running = true; requestAnimationFrame(tickMiniReveal); }
    }

    function tickMiniReveal() {
        var s = miniReveal;
        var z = 0.34, k = 300;
        var c = 2 * z * Math.sqrt(k);
        var a = k * (s.target - s.x) - c * s.v;
        s.v += a * 0.016; s.x += s.v * 0.016;
        var mini = document.getElementById('aqMini');
        if (mini) {
            var x = Math.max(0, Math.min(1, s.x));
            mini.style.opacity = String(x);
            mini.style.transform = 'translateY(' + ((1 - x) * 14).toFixed(2) + 'px)';
        }
        if (Math.abs(s.v) < 0.002 && Math.abs(s.target - s.x) < 0.01) {
            s.x = s.target; s.v = 0; s.running = false;
        } else s.raf = requestAnimationFrame(tickMiniReveal);
    }

    /* ---------- 3.6 滚动触发收合 + 触顶/触底橡胶回弹触感 ---------- */
    function bindEdgeHaptic(el) {
        if (el.__aqEdgeHaptic) return;
        el.__aqEdgeHaptic = true;
        var last = 0, dir = 0;
        function fire() {
            var now = Date.now();
            if (now - last < 90) return;   /* meloXEdgeOverscrollHaptic：90ms 去重 */
            last = now;
            hv('tick');                    /* SegmentTick（最轻） */
        }
        el.addEventListener('touchstart', function () { dir = 0; el.__aqTy = 0; }, { passive: true });
        el.addEventListener('touchmove', function (e) {
            var y = el.scrollTop;
            var max = el.scrollHeight - el.clientHeight;
            if (max <= 0 || !e.touches || !e.touches.length) return;
            var d = e.touches[0].clientY;
            if (!el.__aqTy) { el.__aqTy = d; return; }
            var dy = d - el.__aqTy;
            el.__aqTy = d;
            if (y <= 0 && dy > 0 && dir !== 1) { dir = 1; fire(); }
            else if (y >= max && dy < 0 && dir !== -1) { dir = -1; fire(); }
        }, { passive: true });
        el.addEventListener('touchend', function () { el.__aqTy = 0; }, { passive: true });
        el.addEventListener('wheel', function (e) {
            var y = el.scrollTop;
            var max = el.scrollHeight - el.clientHeight;
            if (max <= 0) return;
            if (y <= 0 && e.deltaY > 0 && dir !== 1) { dir = 1; fire(); }
            else if (y >= max && e.deltaY < 0 && dir !== -1) { dir = -1; fire(); }
        }, { passive: true });
    }

    function bindPageScroll() {
        /* [v78] MeloX 口径：纯累加 ±18px（无衰减、无间隔锁，方向反转跟手）；
         * 顶部 48px 内始终展开；未在播放永远展开 */
        $$('[id^="view-"], .aq-search').forEach(function (pageEl) {
            if (!pageEl || pageEl._aqDockBound) return;
            pageEl._aqDockBound = true;
            pageEl.addEventListener('scroll', function () {
                if (!hasActiveTrack()) {
                    if (dockCollapsed) setDockCollapsed(false);
                    dockAcc = 0;
                    return;
                }
                var y = pageEl.scrollTop || 0;
                var dy = y - dockLastY;
                dockLastY = y;
                if (y < 48) {
                    dockAcc = 0;
                    if (dockCollapsed) setDockCollapsed(false);
                    return;
                }
                if (Math.abs(dy) < 2) return;
                dockAcc += dy;
                if (dockAcc > 18) {
                    dockAcc = 0;
                    if (!dockCollapsed) setDockCollapsed(true);
                } else if (dockAcc < -18) {
                    dockAcc = 0;
                    if (dockCollapsed) setDockCollapsed(false);
                }
            }, { passive: true });
            bindEdgeHaptic(pageEl);
        });
    }

    /* [v78] ensureDock：创建 Dock 壳 + 收编（播放器 mini 在上、tabbar 在下）+ 移除搜索 tab + 注入水珠 + 独立搜索 dock */
    function ensureDock() {
        var dock = document.getElementById('aqDock');
        if (!dock) {
            dock = document.createElement('div');
            dock.id = 'aqDock';
            dock.className = 'aq-dock';
            document.body.appendChild(dock);
        }
        /* 播放器 dock 在底部主页 dock 之上：先收编 mini 再收编 tabbar */
        var mini = document.getElementById('aqMini');
        var tabbar = document.getElementById('aq-tabbar');
        if (mini && mini.parentNode !== dock) dock.appendChild(mini);
        if (tabbar && tabbar.parentNode !== dock) dock.appendChild(tabbar);

        /* 移除 tabbar 内 search tab（搜索已独立成 dock） */
        var stabs = tabbar ? tabbar.querySelectorAll('.aq-tab[data-page="search"]') : [];
        for (var si = 0; si < stabs.length; si++) if (stabs[si].parentNode) stabs[si].parentNode.removeChild(stabs[si]);

        /* [v86] 毛玻璃模式不渲染水珠指示器（MeloXApp.kt L2082：
         *   `if (indicatorAlpha > 0.001f && !frostedGlass)` —— 毛玻璃下 L3 水珠整段不挂，
         *   选中红由 L1 tab 图标直接上色（selectedTint）） */
        var inner = tabbar ? tabbar.querySelector('.aq-tabbar-inner') : null;
        if (inner && !inner.__aqTabClickBound) {
            inner.__aqTabClickBound = true;
            inner.addEventListener('click', function (e) {
                var b = e.target.closest ? e.target.closest('.aq-tab') : null;
                if (b && b.parentNode === inner) setTimeout(function () { positionIndicator(false); }, 20);
            });
        }

        /* 搜索独立毛玻璃 dock（常驻，与主 dock 分离） */
        if (!document.getElementById('aqDockSearch')) {
            var search = document.createElement('button');
            search.type = 'button';
            search.id = 'aqDockSearch';
            search.className = 'aq-dock-side aq-dock-search';
            search.title = '搜索';
            search.setAttribute('aria-label', '搜索');
            search.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:28px;height:28px"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>';
            dock.appendChild(search);
            search.addEventListener('click', function () { goDockPage('search'); });
        }

        /* [v81] 收合态主页水珠钮（MeloX 收合 = 主页单钮液态玻璃 dock；点击展开回主页） */
        if (!document.getElementById('aqDockHome')) {
            var home = document.createElement('button');
            home.type = 'button';
            home.id = 'aqDockHome';
            home.className = 'aq-dock-side aq-dock-home';
            home.title = '主页';
            home.setAttribute('aria-label', '主页');
            home.setAttribute('data-glyph', 'home');
            home.innerHTML = AQ_HOME_GLYPHS.home;
            if (dock.firstChild) dock.insertBefore(home, dock.firstChild);
            else dock.appendChild(home);
            /* MeloX 收缩态胶囊点击 = 展开（onSelect(selectedTab) → tabBarMinimized=false），不切页 */
            home.addEventListener('click', function () {
                setDockCollapsed(false);
            });
        }

        /* [v83] view 页面 hidden 切换 -> 同步收合胶囊图标/选中态（覆盖 tab 点击/拖拽/侧钮/搜索全部路径） */
        var __aqViewRoot = document.getElementById('view-home');
        __aqViewRoot = __aqViewRoot ? __aqViewRoot.parentNode : document.body;
        if (!__aqViewRoot.__aqSideObs) {
            __aqViewRoot.__aqSideObs = true;
            try {
                new MutationObserver(function () { syncDockSideHighlight(); })
                    .observe(__aqViewRoot, { subtree: true, attributes: true, attributeFilter: ['class'] });
            } catch (e) {}
        }

        bindDropletDrag();
        bindDockButtonPress();
        var m2 = document.getElementById('aqMini');
        if (m2 && !m2.__aqRevealBound) {
            m2.__aqRevealBound = true;
            syncMiniReveal();
            try {
                new MutationObserver(function () { syncMiniReveal(); })
                    .observe(m2, { attributes: true, attributeFilter: ['class'] });
            } catch (e) {}
        }
        setDockCollapsed(false);
        setTimeout(function () { positionIndicator(true); }, 60);
    }

    /* ------------------ 3.5 进度粒子（对齐参考页 mini-particles） ------------------ */

    var particleLast = 0;

    function spawnMiniParticles() {
        var host = $('#aqMiniParticles');
        var fill = $('#aqMiniFill');
        var mini = $('#aqMini');
        var a = audio();
        if (!host || !fill || !mini || !a || a.paused) return;
        if (!mini.classList.contains('show')) return;
        var now = Date.now();
        if (now - particleLast < 90) return;
        particleLast = now;
        var miniW = mini.clientWidth || 280;
        var fillW = fill.clientWidth || 0;
        var edge = fillW;
        var unplayed = Math.max(20, miniW - fillW);
        var n = 2 + Math.floor(Math.random() * 2);
        for (var i = 0; i < n; i++) {
            var el = document.createElement('span');
            el.className = 'aq-mini-particle';
            var startX = edge + unplayed * (0.2 + Math.random() * 0.8);
            var into = Math.min(edge * 0.55, 56 + Math.random() * 40);
            var endX = Math.max(8, edge - into - Math.random() * 16);
            var y0 = 10 + Math.random() * Math.max(24, mini.clientHeight - 20);
            var dy = (Math.random() - 0.5) * 36;
            var dur = 2.0 + Math.random() * 1.3;
            var s0 = 0.7 + Math.random() * 0.6;
            el.style.left = startX.toFixed(1) + 'px';
            el.style.top = y0.toFixed(1) + 'px';
            el.style.setProperty('--sx', '0px');
            el.style.setProperty('--dx', (endX - startX).toFixed(1) + 'px');
            el.style.setProperty('--dy', dy.toFixed(1) + 'px');
            el.style.setProperty('--y0', '0px');
            el.style.setProperty('--dur', dur.toFixed(2) + 's');
            el.style.setProperty('--s0', s0.toFixed(2));
            host.appendChild(el);
            (function (node, life) {
                setTimeout(function () { if (node && node.parentNode) node.parentNode.removeChild(node); }, life);
            })(el, Math.ceil(dur * 1000) + 80);
        }
        while (host.childNodes.length > 28) host.removeChild(host.firstChild);
    }

    function clearMiniParticles() {
        try {
            var host = $('#aqMiniParticles');
            if (host) host.innerHTML = '';
        } catch (e) {}
    }

    function burstParticles(n) {
        var box = $('#aqMiniParticles');
        if (!box) return;
        n = n || 6;
        for (var i = 0; i < n; i++) {
            (function () {
                var p = document.createElement('span');
                p.className = 'aq-mini-particle';
                var sx = (Math.random() * 30 - 15).toFixed(0) + 'px';
                var dx = (Math.random() * -80 - 20).toFixed(0) + 'px';
                var dy = (Math.random() * -16 - 2).toFixed(0) + 'px';
                p.style.setProperty('--sx', sx);
                p.style.setProperty('--dx', dx);
                p.style.setProperty('--dy', dy);
                p.style.setProperty('--dur', (1.1 + Math.random() * 0.6).toFixed(2) + 's');
                p.style.setProperty('--s0', (0.8 + Math.random() * 0.5).toFixed(2));
                box.appendChild(p);
                setTimeout(function () { if (p && p.parentNode) p.parentNode.removeChild(p); }, 1800);
            })();
        }
    }

    /* ------------------------- 4. 播放页工具行 -------------------------
     * 注意：速度/定时/切源按钮已并入 buildNpControls 的 .aq-np-secondary 胶囊，
     * 这里只负责绑定它们的点击（逐速循环 / 定时弹层 / 切源弹层）。 */

    function ensureNpTools() {
        var detail = $('#view-player-detail');
        if (!detail) return;
        var npControls = $('.aq-np-controls', detail);
        if (!npControls) return;
        /* 兼容旧版：如果页面是老结构（tools 行还在外面），直接迁移绑定即可 */
        var speed = $('#aqNpSpeed');
        if (speed && !speed.__aqBound) {
            speed.__aqBound = true;
            /* 速度：弹层选择 6 档（Apple 风格），当前档高亮 */
            speed.addEventListener('click', function () { openSpeedSheet(); });
        }
        var sleep = $('#aqNpSleep');
        if (sleep && !sleep.__aqBound) {
            sleep.__aqBound = true;
            sleep.addEventListener('click', function () { openSleepSheet(); });
        }
        var sw = $('#aqNpSwitch');
        if (sw && !sw.__aqBound) {
            sw.__aqBound = true;
            sw.addEventListener('click', function () { openSwitchSheet(); });
        }
        paintNpSpeed();
        paintNpTools();
    }

    function paintNpSpeed() {
        var btn = $('#aqNpSpeed');
        if (!btn) return;
        var a = audio();
        var sp = a ? a.playbackRate : 1;
        var span = btn.querySelector('span');
        if (span) span.textContent = (Math.round(sp * 100) / 100) + 'x';
    }

    function paintNpTools() {
        syncSleepBtn();
    }

    /* ------------------------- 定时关闭 ------------------------- */

    function clearSleepTimer() {
        if (ENH._sleepTimer) { clearTimeout(ENH._sleepTimer); ENH._sleepTimer = null; }
        ENH.sleepUntil = 0;
        ENH.sleepAfterTrack = false;
    }

    function armSleepMinutes(mins) {
        clearSleepTimer();
        if (!mins || mins <= 0) {
            syncSleepBtn();
            toast('已取消定时');
            return;
        }
        ENH.sleepUntil = Date.now() + mins * 60 * 1000;
        ENH.sleepAfterTrack = false;
        ENH._sleepTimer = setTimeout(function () {
            ENH._sleepTimer = null;
            ENH.sleepUntil = 0;
            try { var a = audio(); if (a) a.pause(); } catch (e) {}
            syncSleepBtn();
            toast('定时关闭：已停止播放');
        }, mins * 60 * 1000);
        syncSleepBtn();
        toast('定时 ' + mins + ' 分钟后关闭');
    }

    function armSleepAfterTrack() {
        clearSleepTimer();
        ENH.sleepAfterTrack = true;
        ENH.sleepUntil = 0;
        syncSleepBtn();
        toast('播完本首后关闭');
    }

    function syncSleepBtn() {
        var btn = $('#aqNpSleep');
        var lab = btn ? btn.querySelector('span') : null;
        var on = !!(ENH.sleepAfterTrack || (ENH.sleepUntil && ENH.sleepUntil > Date.now()));
        if (btn) btn.classList.toggle('on', on);
        if (!lab) return;
        if (ENH.sleepAfterTrack) { lab.textContent = '本首后'; return; }
        if (ENH.sleepUntil && ENH.sleepUntil > Date.now()) {
            var left = Math.max(1, Math.ceil((ENH.sleepUntil - Date.now()) / 60000));
            lab.textContent = left + '分';
            return;
        }
        lab.textContent = '定时';
    }

    /* 切换音源：走播放页自己的弹层（#aqQPop，z-index 8001）。
     * 原来直接点顶栏的 #aqPlatBtn，但那个菜单的父节点 .aq-plat-wrap 在 DOM 很靠前，
     * 而 #view-player-detail 是 z-index:80 的全屏层，会把菜单整个盖住 ——
     * 表现就是「点了没反应，关掉播放页才看见」。改走同层的弹层就不再有层级问题。 */
    function openSpeedSheet() {
        var rates = [0.5, 0.75, 1, 1.25, 1.5, 2];
        var a = audio();
        var cur = a && isFinite(a.playbackRate) ? a.playbackRate : 1;
        var items = rates.map(function (r) {
            return {
                value: String(r),
                label: r + 'x',
                active: Math.abs((cur || 1) - r) < 0.001
            };
        });
        openSheet('播放速度', items, function (v) {
            var rate = parseFloat(v);
            if (typeof window.setPlaybackRate === 'function') window.setPlaybackRate(rate);
            var a2 = audio();
            if (a2) a2.playbackRate = rate;
            paintNpSpeed();
        });
    }

    function openSwitchSheet() {
        var btn = $('#aqPlatBtn');
        var wrap = $('#aqPlatWrap');
        if (!btn || !wrap) return;
        var cur = (document.getElementById('aqPlatName') || {}).textContent || '';
        var items = Array.prototype.slice.call(wrap.querySelectorAll('#aqPlatMenu button'));
        if (!items.length) {
            /* 菜单还没渲染：退回点击顶栏按钮，至少保证功能可用 */
            btn.click();
            return;
        }
        var opts = items.map(function (b) {
            return {
                value: b.dataset.id,
                label: b.textContent.trim(),
                active: b.classList.contains('on') || (b.textContent.trim() === cur)
            };
        });
        openSheet('切换音源', opts, function (v) {
            /* 优先走全局接口；没有就模拟点击顶栏那个按钮（它被播放页盖着，点了也看不见） */
            if (window.AqUI && typeof window.AqUI.setSource === 'function') {
                window.AqUI.setSource(v);
                return;
            }
            for (var i = 0; i < items.length; i++) {
                if (items[i].dataset.id === v) { items[i].click(); break; }
            }
        });
    }

    function openSleepSheet() {
        var opts = [
            { id: 'off', label: '关闭定时', sub: '取消倒计时' },
            { id: '15', label: '15 分钟', sub: '' },
            { id: '30', label: '30 分钟', sub: '' },
            { id: '45', label: '45 分钟', sub: '' },
            { id: '60', label: '60 分钟', sub: '' },
            { id: 'track', label: '播完本首', sub: '本曲结束后停止' }
        ];
        var items = opts.map(function (o) {
            var active = false;
            if (o.id === 'off') active = !ENH.sleepAfterTrack && !(ENH.sleepUntil && ENH.sleepUntil > Date.now());
            else if (o.id === 'track') active = !!ENH.sleepAfterTrack;
            else if (ENH.sleepUntil && ENH.sleepUntil > Date.now() && !ENH.sleepAfterTrack) {
                var leftM = Math.ceil((ENH.sleepUntil - Date.now()) / 60000);
                active = leftM <= parseInt(o.id, 10) && leftM > (parseInt(o.id, 10) - 15);
            }
            return {
                value: o.id,
                label: o.label + (o.sub ? ' · ' + o.sub : ''),
                active: active
            };
        });
        openSheet('定时关闭', items, function (v) {
            if (v === 'off') armSleepMinutes(0);
            else if (v === 'track') armSleepAfterTrack();
            else armSleepMinutes(parseInt(v, 10));
        });
    }

    /* ------------------------- 通用弹层（借用网页版样式） ------------------------- */

    function ensureQPop() {
        if ($('#aqQPop')) return;
        var mask = document.createElement('div');
        mask.id = 'aqQPopMask';
        mask.className = 'aq-qpop-mask';
        mask.addEventListener('click', closeQPop);
        document.body.appendChild(mask);
        var pop = document.createElement('div');
        pop.id = 'aqQPop';
        pop.className = 'aq-qpop';
        pop.innerHTML = '<div class="aq-qpop-title" id="aqQPopTitle"></div><div class="aq-qpop-body" id="aqQPopBody"></div>';
        document.body.appendChild(pop);
    }

    function openSheet(title, items, onPick) {
        ensureQPop();
        var pop = $('#aqQPop');
        $('#aqQPopMask').classList.add('open');
        pop.classList.add('open');
        $('#aqQPopTitle').textContent = title;
        var body = $('#aqQPopBody');
        body.innerHTML = items.map(function (it) {
            return '<button type="button" class="aq-qpop-item' + (it.active ? ' on' : '') + '" data-value="' + it.value + '">' +
                '<span class="aq-qpop-label">' + it.label + '</span>' +
                (it.active ? '<i class="fas fa-check"></i>' : '') +
                '</button>';
        }).join('');
        $$('.aq-qpop-item', body).forEach(function (b) {
            b.addEventListener('click', function () {
                onPick(b.dataset.value);
                closeQPop();
            });
        });
    }

    function closeQPop() {
        var m = $('#aqQPopMask'), p = $('#aqQPop');
        if (m) m.classList.remove('open');
        if (p) p.classList.remove('open');
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

    /* ------------------------- 5. 自动播放 ------------------------- */

    function autoPlayFrom(src) {
        try {
            var st = window.AqUI && window.AqUI.state;
            if (!st) return;
            var list = [];
            if (src === 'guess') list = st.home.guess;
            else if (src === 'rec') list = st.home.rec;
            else if (src === 'playlist') list = st.pl.list;
            else if (src === 'rank') list = st.boards.all;
            if (!list || !list.length) return;
            if (typeof window.updatePlaylist !== 'function') return;
            window.updatePlaylist(list.slice(), 0, 'network');
        } catch (e) { }
    }

    function maybeAutoPlay() {
        if (!ENH.resume || ENH.autoSrc === 'off') return;
        try {
            var st = window.AqUI && window.AqUI.state;
            if (!st) return;
            if (ENH.autoSrc === 'playlist' && st.pl.list.length) { autoPlayFrom('playlist'); return; }
            if (ENH.autoSrc === 'rank' && st.boards.all.length) { autoPlayFrom('rank'); return; }
            if (ENH.autoSrc === 'guess' || ENH.autoSrc === 'rec') {
                if ((ENH.autoSrc === 'guess' && st.home.guess.length) ||
                    (ENH.autoSrc === 'rec' && st.home.rec.length)) {
                    autoPlayFrom(ENH.autoSrc);
                }
            }
        } catch (e) { }
    }

    /* 定时：播放结束后（若设了播完本首）停止 */
    function onTrackEnd() {
        if (ENH.sleepAfterTrack) {
            clearSleepTimer();
            toast('定时关闭：已停止播放');
        }
    }

    /* ------------------------- 主循环 / 初始化 ------------------------- */

    /* Q2-A：播放页打开时隐藏整个 Dock；关闭时恢复进入前状态。
     * 不用 display:none 改节点（会丢状态），改用 body 状态类统一控制透明度/位移/指针。 */
    var dockStateBeforeNp = null;
    function setDockForPlayer(isOpen) {
        var body = document.body;
        if (isOpen) {
            if (!body.classList.contains('aq-np-open')) {
                dockStateBeforeNp = dockCollapsed;
                body.classList.add('aq-np-open');
            }
        } else if (body.classList.contains('aq-np-open')) {
            body.classList.remove('aq-np-open');
            setDockCollapsed(dockStateBeforeNp === true);
        }
    }

    /* 原版 toggleLyrics 会在 class 上连续切换 hidden/translate/opacity；监听 class 变化，
     * 不等 800ms 轮询就立即同步 Dock，避免播放页打开/关闭时底部栏闪一帧。 */
    function watchPlayerVisibility() {
        var detail = $('#view-player-detail');
        if (!detail || detail.__dockVisibilityBound) return;
        detail.__dockVisibilityBound = true;
        try {
            new MutationObserver(function () {
                var isOpen = !detail.classList.contains('hidden');
                if (isOpen !== ENH.npOpen) {
                    ENH.npOpen = isOpen;
                    if (isOpen) ensureNpTools();
                }
                setDockForPlayer(isOpen);
            }).observe(detail, { attributes: true, attributeFilter: ['class'] });
        } catch (e) { }
    }

    function tick() {
        ensureMiniLyricDom();
        var a = audio();
        var t = a ? a.currentTime : 0;
        var isNp = $('#view-player-detail') && !$('#view-player-detail').classList.contains('hidden');
        if (isNp !== ENH.npOpen) {
            ENH.npOpen = isNp;
            if (isNp) { ensureNpTools(); }
            setDockForPlayer(isNp);
        }
        updateMiniLyric(t);
        paintNpSpeed();
        syncSleepBtn();
    }

    function restoreSettings() {
        try { localStorage.removeItem('aq_np_style'); } catch (e) {}
        ENH.resume = ls('aq_resume', '0') === '1';
        ENH.autoSrc = ls('aq_auto_src', 'off');
    }

    function init() {
        try {
            restoreSettings();
            ensureMiniLyricDom();
            ensureDock();
            bindPageScroll();
            ensureNpTools();
            watchPlayerVisibility();

            var a = audio();
            if (a) {
                a.addEventListener('timeupdate', function () {
                    updateMiniLyric(a.currentTime);
                    /* 播放中持续生成进度粒子（对齐参考页，timeupdate 驱动 + 90ms 节流） */
                    if (!a.paused && a.currentTime > 0) spawnMiniParticles();
                });
                a.addEventListener('play', function () {
                    updateMiniLyric(a.currentTime, true);
                    if (window.currentPlayingSong) burstParticles(6);
                });
                a.addEventListener('pause', clearMiniParticles);
                a.addEventListener('ended', function () { clearMiniParticles(); onTrackEnd(); });
                a.addEventListener('seeked', clearMiniParticles);
                a.addEventListener('loadedmetadata', function () { paintNpSpeed(); });
            }

            /* 监听播放页挂载 */
            var tryNp = setInterval(function () {
                var detail = $('#view-player-detail');
                if (detail) {
                    clearInterval(tryNp);
                    ensureNpTools();
                }
            }, 800);

            setInterval(tick, 800);
            setTimeout(maybeAutoPlay, 2500);

            /* 暴露给其它脚本 */
            window.AqEnh = {
                armSleep: armSleepMinutes,
                state: ENH
            };
            console.log('[AQ-ENH] 增强模块已就绪');
        } catch (e) {
            console.warn('[AQ-ENH] init failed', e);
        }
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else setTimeout(init, 0);
})();