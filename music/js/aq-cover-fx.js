/* =============================================================================
   aq-cover-fx.js —— 播放详情页封面特效（移植自 q-16a 参考页）
   ----------------------------------------------------------------------------
   挂载：#view-player-detail #mobile-player-cover-container > #lxCoverArt
   样式：9 种 data-style（vinyl/spectrum/pulse/square/wave/ring/portal/orbit/holo）
   设置：settings.enableCoverFx（总开关）/ playerCoverStyle（当前样式）/
         enableCoverStyleCycle（单击封面轮询切换），全部走现有 updateSetting 持久化
   音频联动：优先用 soundEffects 的 Analyser 真频谱，拿不到就用时间函数模拟，
   rAF 只在详情页打开 + FX 开启 + 吃能量的样式时跑。
   ========================================================================== */
(function () {
    'use strict';

    var ART_ID = 'lxCoverArt';
    var VINYL_ID = 'lxCoverVinyl';
    var IMG_ID = 'lxCoverImg';
    var SPEC_ID = 'lxSpectrum';
    var GLOW_ID = 'lxSpectrumGlow';
    var WAVE_ID = 'lxWave';
    var PORTAL_ID = 'lxPortal';
    var ORBIT_ID = 'lxOrbit';
    var HOLO_ID = 'lxHolo';
    var CONT_ID = 'mobile-player-cover-container';
    var VIEW_ID = 'view-player-detail';
    var SRC_IMG_ID = 'detail-cover';

    var STYLES = [
        { id: 'vinyl', name: '黑胶' },
        { id: 'spectrum', name: '频谱' },
        { id: 'pulse', name: '脉冲' },
        { id: 'square', name: '方封' },
        { id: 'wave', name: '粒子扩散' },
        { id: 'ring', name: '光环' },
        { id: 'portal', name: '虫洞' },
        { id: 'orbit', name: '轨道' },
        { id: 'holo', name: '全息' }
    ];
    var NEED_VIZ = { spectrum: 1, wave: 1, pulse: 1, ring: 1 };

    var _vizRaf = null;
    var _vizAvgSmooth = 0.18;
    var _vizFakeState = null;
    var _simFreq = null;
    var _waveSpawnAcc = 0;
    var _clickTimer = null;

    function $(id) { return document.getElementById(id); }
    function audioEl() { return document.getElementById('audio-player'); }
    function getSettings() { return window.settings || {}; }
    function getAnalyser() {
        try {
            if (window.soundEffects && typeof window.soundEffects.getAnalyser === 'function') {
                return window.soundEffects.getAnalyser() || null;
            }
        } catch (e) {}
        return null;
    }
    function toastName(name) {
        try {
            if (window.AqUI && typeof window.AqUI.toast === 'function') { window.AqUI.toast(name); return; }
            if (typeof window.showInfo === 'function') { window.showInfo('封面特效：' + name); return; }
            if (typeof showInfo === 'function') { showInfo('封面特效：' + name); }
        } catch (e) {}
    }
    function detailVisible() {
        var v = $(VIEW_ID);
        return !!(v && !v.classList.contains('hidden') && v.isConnected);
    }

    /* ---------------- 装饰层懒创建：频谱 80 条 + 粒子 140 池 ---------------- */
    function ensureDecor() {
        var art = $(ART_ID);
        var stage = art && art.querySelector('.fp-art-stage');
        var spec = $(SPEC_ID);
        var radius = 100;
        if (stage && stage.offsetWidth) radius = Math.round(stage.offsetWidth * 0.46);
        if (spec && !spec.childNodes.length) {
            var n = 80, html = '';
            for (var i = 0; i < n; i++) {
                var rot = (i / n) * 360;
                html += '<i style="--tr:rotate(' + rot + 'deg) translateY(-' + radius + 'px);transform:var(--tr) scaleY(.3)"></i>';
            }
            spec.innerHTML = html;
        }
        var wave = $(WAVE_ID);
        if (wave && !wave._particlePool) {
            wave.innerHTML = '';
            var pool = [];
            for (var pi = 0; pi < 140; pi++) {
                var el = document.createElement('i');
                el.className = 'fp-particle';
                wave.appendChild(el);
                pool.push({ el: el, active: false, ang: 0, r: 0, vr: 0, life: 0, maxLife: 1, size: 1 });
            }
            wave._particlePool = pool;
        }
    }

    /* ---------------- 应用一套样式（先全关再按需开） ---------------- */
    function applyStyle(id) {
        var art = $(ART_ID);
        if (!art) return;
        var st = STYLES[0];
        for (var i = 0; i < STYLES.length; i++) {
            if (STYLES[i].id === id) { st = STYLES[i]; break; }
        }
        ensureDecor();
        art.setAttribute('data-style', st.id);

        var groove = art.querySelector('.fp-groove');
        var spec = $(SPEC_ID);
        var wave = $(WAVE_ID);
        var rings = art.querySelectorAll('.fp-pulse-ring');
        var ringSpin = art.querySelector('.fp-ring-spin');
        var vinyl = $(VINYL_ID);
        var img = $(IMG_ID);
        var stage = art.querySelector('.fp-art-stage');

        if (groove) groove.style.display = 'none';
        if (spec) spec.style.display = 'none';
        var glowReset = $(GLOW_ID);
        if (glowReset) { glowReset.style.display = 'none'; glowReset.style.transform = ''; glowReset.style.opacity = ''; }
        if (wave) {
            wave.style.display = 'none';
            wave.style.left = ''; wave.style.right = ''; wave.style.bottom = '';
            wave.style.height = ''; wave.style.width = '';
        }
        for (var r = 0; r < rings.length; r++) rings[r].style.display = 'none';
        if (ringSpin) ringSpin.style.display = 'none';
        var portalEl = $(PORTAL_ID) || art.querySelector('.fp-portal');
        var orbitEl = $(ORBIT_ID) || art.querySelector('.fp-orbit');
        var holoEl = $(HOLO_ID) || art.querySelector('.fp-holo');
        if (portalEl) portalEl.style.display = 'none';
        if (orbitEl) orbitEl.style.display = 'none';
        if (holoEl) holoEl.style.display = 'none';
        if (vinyl) {
            vinyl.classList.remove('paused');
            vinyl.style.cssText = '';
            vinyl.className = 'fp-vinyl spin';
        }
        if (img) { img.style.width = ''; img.style.height = ''; img.style.borderRadius = ''; img.style.border = ''; }
        if (stage) { stage.style.marginBottom = ''; stage.style.overflow = ''; }

        if (st.id === 'vinyl') {
            if (groove) groove.style.display = 'block';
        } else if (st.id === 'spectrum') {
            ensureDecor();
            if (spec) spec.style.display = 'block';
            var glowEl = $(GLOW_ID);
            if (glowEl) glowEl.style.display = 'block';
            if (vinyl) { vinyl.style.background = 'transparent'; vinyl.style.boxShadow = '0 12px 36px rgba(0,0,0,.4)'; }
            if (img) { img.style.width = '82%'; img.style.height = '82%'; img.style.border = 'none'; img.style.borderRadius = '50%'; }
        } else if (st.id === 'pulse') {
            for (var r2 = 0; r2 < rings.length; r2++) rings[r2].style.display = 'block';
            if (vinyl) { vinyl.style.background = 'transparent'; vinyl.style.boxShadow = ''; }
            if (img) { img.style.width = '88%'; img.style.height = '88%'; img.style.border = 'none'; }
        } else if (st.id === 'square') {
            if (vinyl) {
                vinyl.style.borderRadius = '18px'; vinyl.style.background = 'transparent';
                vinyl.style.boxShadow = '0 18px 40px rgba(0,0,0,.45)'; vinyl.style.overflow = 'hidden';
            }
            if (img) { img.style.width = '100%'; img.style.height = '100%'; img.style.borderRadius = '18px'; img.style.border = 'none'; }
        } else if (st.id === 'wave') {
            ensureDecor();
            if (vinyl) {
                vinyl.style.background = 'transparent';
                vinyl.style.boxShadow = '0 12px 36px rgba(0,0,0,.28),0 0 0 1px rgba(255,255,255,.06)';
                vinyl.style.borderRadius = '50%'; vinyl.style.overflow = 'hidden';
            }
            if (img) { img.style.width = '100%'; img.style.height = '100%'; img.style.borderRadius = '50%'; img.style.border = 'none'; }
            if (wave) {
                wave.style.cssText = 'display:block;position:absolute;left:50%;top:50%;width:240%;height:240%;margin-left:-120%;margin-top:-120%;overflow:visible;pointer-events:none;z-index:4;';
                wave._particlePool = null;
                ensureDecor();
                try {
                    var stage0 = art.querySelector('.fp-art-stage');
                    var half0 = stage0 && stage0.offsetWidth ? stage0.offsetWidth / 2 : 130;
                    var edge0 = half0 * 1.02;
                    var pool0 = wave._particlePool || [];
                    for (var si = 0; si < Math.min(48, pool0.length); si++) {
                        var sp = pool0[si];
                        sp.active = true;
                        sp.ang = (si / 48) * Math.PI * 2 + Math.random() * 0.08;
                        sp.r = edge0 * (1.0 + Math.random() * 0.08);
                        sp.vr = 0.2 + Math.random() * 0.5;
                        sp.life = Math.floor(Math.random() * 10);
                        sp.maxLife = 40 + Math.random() * 40;
                        sp.size = 0.9 + Math.random() * 1.1;
                        var sx = Math.cos(sp.ang) * sp.r;
                        var sy = Math.sin(sp.ang) * sp.r;
                        sp.el.style.opacity = '0.85';
                        sp.el.style.transform = 'translate(' + sx.toFixed(1) + 'px,' + sy.toFixed(1) + 'px) scale(' + sp.size.toFixed(2) + ')';
                    }
                    _waveSpawnAcc = 6;
                } catch (eSeed) {}
            }
            if (stage) { stage.style.overflow = 'visible'; stage.style.marginBottom = ''; }
            try { startVizLoop(); updateViz(); } catch (eV) {}
        } else if (st.id === 'ring') {
            if (ringSpin) { ringSpin.style.display = 'block'; ringSpin.style.opacity = ''; ringSpin.style.transform = ''; ringSpin.style.boxShadow = ''; }
            if (vinyl) {
                vinyl.style.background = 'transparent';
                vinyl.style.boxShadow = '0 12px 36px rgba(0,0,0,.12), 0 0 0 1px rgba(0,0,0,.04)';
                vinyl.style.borderRadius = '50%'; vinyl.style.overflow = 'hidden';
            }
            if (img) { img.style.width = '100%'; img.style.height = '100%'; img.style.border = 'none'; img.style.borderRadius = '50%'; }
        } else if (st.id === 'portal') {
            if (portalEl) portalEl.style.display = 'block';
            if (stage) stage.style.overflow = 'visible';
            if (vinyl) {
                vinyl.style.background = 'transparent'; vinyl.style.boxShadow = '';
                vinyl.style.borderRadius = '50%'; vinyl.style.overflow = 'hidden';
            }
            if (img) { img.style.width = '100%'; img.style.height = '100%'; img.style.border = 'none'; img.style.borderRadius = '50%'; }
        } else if (st.id === 'orbit') {
            if (orbitEl) {
                orbitEl.style.display = 'block';
                try {
                    var stgW = stage && stage.offsetWidth ? stage.offsetWidth : 280;
                    orbitEl.style.setProperty('--orbit-r', Math.round(stgW / 2 + 6) + 'px');
                } catch (eOr) {}
            }
            if (stage) stage.style.overflow = 'visible';
            if (vinyl) {
                vinyl.style.background = ''; vinyl.style.boxShadow = '';
                vinyl.style.borderRadius = '50%'; vinyl.style.overflow = 'hidden';
            }
            if (img) { img.style.width = '78%'; img.style.height = '78%'; img.style.border = 'none'; img.style.borderRadius = '50%'; }
        } else if (st.id === 'holo') {
            if (holoEl) holoEl.style.display = 'block';
            if (stage) stage.style.overflow = 'visible';
            if (vinyl) {
                vinyl.style.background = ''; vinyl.style.boxShadow = '';
                vinyl.style.borderRadius = '50%'; vinyl.style.overflow = 'hidden';
            }
            if (img) { img.style.width = '86%'; img.style.height = '86%'; img.style.border = 'none'; img.style.borderRadius = '50%'; }
        }

        syncSpin();
        try { startVizLoop(); updateViz(); } catch (e2) {}
        return st;
    }

    function cycleStyle() {
        var art = $(ART_ID);
        if (!art) return;
        var cur = art.getAttribute('data-style') || 'vinyl';
        var idx = 0;
        for (var i = 0; i < STYLES.length; i++) {
            if (STYLES[i].id === cur) { idx = i; break; }
        }
        var next = STYLES[(idx + 1) % STYLES.length];
        applyStyle(next.id);
        toastName(next.name);
        try {
            if (typeof window.updateSetting === 'function') window.updateSetting('playerCoverStyle', next.id);
            else if (typeof updateSetting === 'function') updateSetting('playerCoverStyle', next.id);
        } catch (e) {}
    }

    /* ---------------- 播放/暂停同步（停转保留角度） ---------------- */
    function syncSpin() {
        var art = $(ART_ID);
        if (!art) return;
        var a = audioEl();
        var paused = !a || !!a.paused;
        art.classList.toggle('is-paused', paused);
    }

    /* ---------------- 模拟频谱（无 Analyser 时兜底） ---------------- */
    function fillSimulatedFreq(out, t, playing) {
        if (!out || !out.length) return 0;
        var n = out.length;
        if (!playing) {
            for (var z = 0; z < n; z++) out[z] = Math.max(0, (out[z] || 0) * 0.82);
            return 0;
        }
        var kick = Math.pow(Math.max(0, Math.sin(t * Math.PI * 2.15)), 10);
        var hat = Math.pow(Math.max(0, Math.sin(t * Math.PI * 8.4 + 0.4)), 4);
        var sum = 0;
        for (var i = 0; i < n; i++) {
            var band = i / n;
            var bass = 0.55 + 0.45 * Math.sin(t * 3.7 + band * 1.8);
            var mid = 0.5 + 0.5 * Math.sin(t * 6.9 + band * 4.6 + 1.2);
            var high = 0.45 + 0.55 * Math.sin(t * 12.5 + band * 9.1 + 0.6);
            var flutter = 0.5 + 0.5 * Math.sin(t * 21 + i * 0.73);
            var energy = (1 - band * 0.62) * (0.22 + bass * 0.42 + mid * 0.28 + high * 0.14);
            energy += kick * (1 - band) * 0.55;
            energy += hat * band * 0.22;
            energy *= 0.75 + flutter * 0.35;
            energy = Math.max(0.04, Math.min(1, energy));
            var v = (energy * 255) | 0;
            out[i] = v;
            sum += v;
        }
        return sum / (n * 255);
    }

    var _freqData = null;

    /* ---------------- rAF 可视化驱动 ---------------- */
    function updateViz() {
        var art = $(ART_ID);
        if (!art || !art.isConnected) return;
        var style = art.getAttribute('data-style') || 'vinyl';
        if (!NEED_VIZ[style]) return;

        var a = audioEl();
        var playing = !!(a && !a.paused);
        var analyser = playing ? getAnalyser() : null;
        var live = false;
        var avg = 0.18;
        var data = null;
        var len = 0;

        if (analyser && playing) {
            try {
                if (!_freqData || _freqData.length !== analyser.frequencyBinCount) {
                    _freqData = new Uint8Array(analyser.frequencyBinCount);
                }
                analyser.getByteFrequencyData(_freqData);
                var sum = 0, nn = _freqData.length, nonZero = 0;
                for (var i = 0; i < nn; i++) {
                    sum += _freqData[i];
                    if (_freqData[i] > 2) nonZero++;
                }
                avg = sum / (nn * 255);
                if (nonZero > 4 && avg > 0.01) {
                    live = true; data = _freqData; len = nn;
                }
            } catch (e) { live = false; }
        }

        if (!live) {
            if (!_simFreq) _simFreq = new Uint8Array(128);
            var t = 0;
            try { t = a && isFinite(a.currentTime) ? a.currentTime : (Date.now() / 1000); }
            catch (eT) { t = Date.now() / 1000; }
            avg = fillSimulatedFreq(_simFreq, t, playing);
            data = _simFreq;
            len = _simFreq.length;
        }

        _vizAvgSmooth = _vizAvgSmooth * 0.82 + avg * 0.18;
        avg = _vizAvgSmooth;
        if (_vizFakeState !== !live) {
            _vizFakeState = !live;
            art.classList.toggle('is-fake', !live);
        }
        if (!data || !len) return;

        if (style === 'spectrum') {
            var bars = art.querySelectorAll('#' + SPEC_ID + ' i');
            var bn = bars.length;
            if (!bn) return;
            var levels = [];
            var half = Math.max(1, Math.floor(bn / 2));
            for (var j = 0; j < bn; j++) {
                var idx = Math.min(len - 1, Math.floor((j % half) / half * len * 0.55) + 1);
                levels[j] = data[idx] / 255;
            }
            for (var p = 0; p < 2; p++) {
                var next = levels.slice();
                for (var j2 = 0; j2 < bn; j2++) {
                    var b0 = levels[(j2 - 1 + bn) % bn], b1 = levels[j2], c0 = levels[(j2 + 1) % bn];
                    next[j2] = b0 * 0.2 + b1 * 0.6 + c0 * 0.2;
                }
                levels = next;
            }
            var peak = 0;
            for (var j3 = 0; j3 < bn; j3++) {
                var v = levels[j3];
                if (v > peak) peak = v;
                var scale = playing ? (0.22 + v * 1.65) : 0.12;
                bars[j3].style.transform = 'var(--tr) scaleY(' + scale.toFixed(3) + ')';
                bars[j3].style.opacity = String(playing ? (0.35 + v * 0.65) : 0.2);
            }
            var glow = $(GLOW_ID);
            if (glow) {
                var g = 1 + peak * 0.08;
                glow.style.transform = 'scale(' + g.toFixed(3) + ')';
                glow.style.opacity = String(playing ? (0.35 + peak * 0.5) : 0.15);
            }
        } else if (style === 'wave') {
            ensureDecor();
            var waveEl = $(WAVE_ID);
            var pool = waveEl && waveEl._particlePool;
            if (!pool) return;
            var stageEl = art.querySelector('.fp-art-stage');
            var halfW = stageEl && stageEl.offsetWidth ? stageEl.offsetWidth / 2 : 130;
            var edgeR = halfW * 1.02;
            if (playing) {
                _waveSpawnAcc += 4.5 + avg * 10;
                var burst = Math.min(16, Math.floor(_waveSpawnAcc));
                _waveSpawnAcc -= burst;
                for (var bi = 0; bi < burst; bi++) {
                    for (var pi = 0; pi < pool.length; pi++) {
                        if (pool[pi].active) continue;
                        var pp = pool[pi];
                        pp.active = true;
                        pp.ang = Math.random() * Math.PI * 2;
                        var near = Math.random() < 0.65;
                        pp.r = edgeR * (near ? (1.0 + Math.random() * 0.04) : (1.06 + Math.random() * 0.12));
                        if (near) {
                            pp.vr = 0.25 + avg * 0.9 + Math.random() * 0.5;
                            pp.maxLife = 36 + Math.random() * 44;
                            pp.size = 0.9 + Math.random() * 1.1 + avg * 0.5;
                        } else {
                            pp.vr = 0.7 + avg * 2.2 + Math.random() * 1.2;
                            pp.maxLife = 28 + Math.random() * 36 + avg * 14;
                            pp.size = 0.7 + Math.random() * 0.9 + avg * 0.4;
                        }
                        pp.life = 0;
                        break;
                    }
                }
            } else {
                _waveSpawnAcc += 0.8;
                if (_waveSpawnAcc >= 1) {
                    _waveSpawnAcc -= 1;
                    for (var pi2 = 0; pi2 < pool.length; pi2++) {
                        if (pool[pi2].active) continue;
                        var p2 = pool[pi2];
                        p2.active = true;
                        p2.ang = Math.random() * Math.PI * 2;
                        p2.r = edgeR * (1.0 + Math.random() * 0.05);
                        p2.vr = 0.15 + Math.random() * 0.25;
                        p2.maxLife = 45 + Math.random() * 40;
                        p2.size = 0.8 + Math.random() * 1.0;
                        p2.life = 0;
                        break;
                    }
                }
            }
            for (var wi = 0; wi < pool.length; wi++) {
                var wp = pool[wi];
                if (!wp.active) {
                    if (wp.el.style.opacity !== '0') wp.el.style.opacity = '0';
                    continue;
                }
                wp.life++;
                wp.r += wp.vr;
                wp.vr *= 0.99;
                var wt = wp.life / wp.maxLife;
                if (wt >= 1 || wp.r > halfW * 1.55) {
                    wp.active = false;
                    wp.el.style.opacity = '0';
                    continue;
                }
                var radial = 1 - Math.max(0, (wp.r - edgeR) / (halfW * 0.6));
                var wop = (wt < 0.08 ? (wt / 0.08) : (1 - (wt - 0.08) / 0.92));
                wop *= (0.5 + radial * 0.5) * (playing ? (0.7 + avg * 0.3) : 0.45);
                var wx = Math.cos(wp.ang) * wp.r;
                var wy = Math.sin(wp.ang) * wp.r;
                var wsc = wp.size * (1 - wt * 0.35);
                wp.el.style.opacity = String(Math.max(0, Math.min(1, wop)).toFixed(3));
                wp.el.style.transform = 'translate(' + wx.toFixed(1) + 'px,' + wy.toFixed(1) + 'px) scale(' + Math.max(0.25, wsc).toFixed(2) + ')';
            }
        } else if (style === 'pulse') {
            var rings = art.querySelectorAll('.fp-pulse-ring');
            var sc = 0.92 + avg * 0.22;
            for (var rr = 0; rr < rings.length; rr++) {
                rings[rr].style.transform = 'scale(' + (sc + rr * 0.04).toFixed(3) + ')';
                rings[rr].style.opacity = String(Math.max(0.12, (playing ? 0.55 : 0.2) - avg * 0.2 - rr * 0.1));
            }
        }
    }

    function startVizLoop() {
        if (_vizRaf) return;
        function tick() {
            _vizRaf = requestAnimationFrame(tick);
            try {
                /* 详情页不可见时直接跳过：之前这里不判可见性，循环每秒空转 60 帧，
                   切歌 / 切页时和主线程抢 CPU，是「切换卡顿」的主要来源。
                   detailVisible() 本来就写好了却一直没被调用。 */
                if (!detailVisible()) return;
                var art = $(ART_ID);
                if (!art || !art.isConnected) return;
                var s = getSettings();
                if (s.enableCoverFx === false) return;
                if (document.hidden) return;
                if (!NEED_VIZ[art.getAttribute('data-style') || 'vinyl']) return;
                updateViz();
            } catch (e) {}
        }
        _vizRaf = requestAnimationFrame(tick);
    }

    function stopVizLoop() {
        if (_vizRaf) { try { cancelAnimationFrame(_vizRaf); } catch (e) {} _vizRaf = null; }
    }

    /* ---------------- 封面图同步（跟着 detail-cover 走） ---------------- */
    function syncCoverImg() {
        var src = $(SRC_IMG_ID);
        var dst = $(IMG_ID);
        if (!src || !dst) return;
        var url = src.currentSrc || src.src || '';
        if (url && dst.getAttribute('src') !== url) {
            dst.src = url;
            dst.classList.remove('is-placeholder');
        }
    }

    /* ---------------- 主题色同步到 --accent-rgb ---------------- */
    function syncAccent() {
        try {
            var v = $(VIEW_ID);
            if (!v) return;
            /* [v60+] 优先跟随封面主色（applyCoverAmbient 注入），无封面时回退主题色 */
            var coverRgb = v.style.getPropertyValue('--cover-accent-rgb').trim();
            if (coverRgb) {
                v.style.setProperty('--accent-rgb', coverRgb);
                return;
            }
            var c = getComputedStyle(document.documentElement).getPropertyValue('--c-500').trim();
            var m = /^#([0-9a-f]{6})$/i.exec(c || '');
            if (m) {
                var n = parseInt(m[1], 16);
                v.style.setProperty('--accent-rgb', ((n >> 16) & 255) + ', ' + ((n >> 8) & 255) + ', ' + (n & 255));
            }
        } catch (e) {}
    }

    /* ---------------- 总入口：供设置 action 调用 ---------------- */
    function applyCoverFx() {
        var s = getSettings();
        var on = s.enableCoverFx !== false;
        var cont = $(CONT_ID);
        var art = $(ART_ID);
        if (!cont || !art) return;
        cont.classList.toggle('lx-fx-on', !!on);
        if (on) {
            applyStyle(s.playerCoverStyle || 'vinyl');
            syncCoverImg();
            syncSpin();
            startVizLoop();
        } else {
            stopVizLoop();
        }
        syncAccent();
    }

    /* ---------------- 初始化：绑定点击/双击/音频/主题 ---------------- */
    var _inited = false;
    function init() {
        if (_inited) return;
        _inited = true;
        var cont = $(CONT_ID);
        if (cont && !cont._lxFxBound) {
            cont._lxFxBound = true;
            cont.addEventListener('click', function (e) {
                try {
                    var s = getSettings();
                    if (s.enableCoverFx === false || s.enableCoverStyleCycle === false) return;
                    if (e && e.target && e.target.closest && e.target.closest('button')) return;
                    if (_clickTimer) clearTimeout(_clickTimer);
                    _clickTimer = setTimeout(function () { _clickTimer = null; cycleStyle(); }, 260);
                } catch (err) {}
            });
            /* 双击走原隐藏封面逻辑：取消待触发的切换 */
            cont.addEventListener('dblclick', function () {
                if (_clickTimer) { clearTimeout(_clickTimer); _clickTimer = null; }
            });
        }
        /* 封面 src 变化 → 同步到特效图 */
        try {
            var srcImg = $(SRC_IMG_ID);
            if (srcImg && window.MutationObserver) {
                new MutationObserver(function () { syncCoverImg(); }).observe(srcImg, { attributes: true, attributeFilter: ['src'] });
            }
        } catch (e) {}
        /* 音频状态 → 停转/续转 */
        try {
            var a = audioEl();
            if (a) {
                a.addEventListener('play', syncSpin);
                a.addEventListener('pause', syncSpin);
                a.addEventListener('playing', syncSpin);
            }
        } catch (e2) {}
        /* 主题切换 → 重算 accent */
        try {
            if (window.MutationObserver) {
                new MutationObserver(function () { syncAccent(); }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
            }
        } catch (e3) {}
        /* [v60+] 封面主色变化（applyCoverAmbient 注入变量）→ 重算 accent */
        try {
            var vd = $(VIEW_ID);
            if (vd && window.MutationObserver) {
                new MutationObserver(function () { syncAccent(); }).observe(vd, { attributes: true, attributeFilter: ['style'] });
            }
        } catch (e4) {}
        applyCoverFx();
    }

    window.applyCoverFx = applyCoverFx;
    window.LxCoverFx = {
        apply: applyCoverFx,
        cycle: cycleStyle,
        syncSpin: syncSpin,
        update: updateViz
    };
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () { setTimeout(init, 300); });
    } else {
        setTimeout(init, 300);
    }
})();
