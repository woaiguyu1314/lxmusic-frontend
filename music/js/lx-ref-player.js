// ============================================================
// lx-ref-player.js — 参考页风格播放器+mini桥(第7轮定稿)
// DOM照参考页重建(#np全套/#mini),内核全桥洛雪:
// audio/playSong/歌词引擎/QualityManager/定时/切源/评论/歌词卡/下载
// ============================================================
(function () {
  'use strict';

  function $(s, r) { return (r || document).querySelector(s); }
  function $all(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function coverOf(song) {
    try {
      if (typeof getImgUrl === 'function') { var u = getImgUrl(song); if (u) return u; }
    } catch (e) {}
    return (song && (song.img || (song.meta && song.meta.picUrl) || song.picUrl)) || '/music/assets/logo.svg';
  }
  function artistOf(song) { return (song && (song.singer || song.artistName || song.artist)) || '未知'; }

  // ---------- 取色氛围(对齐参考页:封面主色→--np-c1/--np-c2→纯色底+自动对比字) ----------
  var _ambientCur = { r: 250, g: 45, b: 72 };
  var _ambientAnim = null;
  function lerp(a, b, t) { return a + (b - a) * t; }
  function getNpStyle() {
    try {
      var s = localStorage.getItem('aq_np_style');
      if (s === 'immersive' || s === 'classic') return s;
    } catch (e) {}
    var np = $('#np');
    return (np && np.classList.contains('immersive')) ? 'immersive' : 'classic';
  }
  function sampleCanvasColor(imgEl) {
    if (!imgEl || !(imgEl.naturalWidth || imgEl.width)) return null;
    try {
      var c = document.createElement('canvas');
      var w = 48, h = 48;
      c.width = w; c.height = h;
      var ctx = c.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(imgEl, 0, 0, w, h);
      var data = ctx.getImageData(0, 0, w, h).data;
      var buckets = {};
      var vivid = null, vividScore = -1;
      var validN = 0;
      for (var i = 0; i < data.length; i += 4) {
        if (data[i + 3] < 150) continue;
        var rr = data[i], gg = data[i + 1], bb = data[i + 2];
        var max = Math.max(rr, gg, bb);
        var min = Math.min(rr, gg, bb);
        var lum = 0.299 * rr + 0.587 * gg + 0.114 * bb;
        if (lum < 38) continue;
        if (lum > 242) continue;
        if (rr > 250 && gg > 250 && bb > 250) continue;
        var sat = max === 0 ? 0 : (max - min) / max;
        if (sat < 0.12) continue;
        validN++;
        var br = (rr >> 4), bg2 = (gg >> 4), bbk = (bb >> 4);
        var key = br + ',' + bg2 + ',' + bbk;
        if (!buckets[key]) buckets[key] = { n: 0, r: 0, g: 0, b: 0, sat: 0 };
        var bk = buckets[key];
        bk.n++; bk.r += rr; bk.g += gg; bk.b += bb; bk.sat += sat;
        if (sat >= 0.22) {
          var score = sat * 1.15 + ((max - min) / 255) * 0.55 + (lum / 255) * 0.35;
          if (score > vividScore) { vividScore = score; vivid = { r: rr, g: gg, b: bb, sat: sat }; }
        }
      }
      if (!validN) return null;
      var dom = null, domN = 0;
      for (var k in buckets) {
        if (!buckets.hasOwnProperty(k)) continue;
        var b = buckets[k];
        if (b.n > domN) {
          domN = b.n;
          dom = { r: Math.round(b.r / b.n), g: Math.round(b.g / b.n), b: Math.round(b.b / b.n), sat: b.sat / b.n, n: b.n };
        }
      }
      function clampC(x) { return Math.max(0, Math.min(255, Math.round(x))); }
      if (dom && vivid) {
        var domShare = dom.n / validN;
        var wVivid = 0.18 + Math.min(0.2, (vivid.sat - 0.22) * 0.45);
        if (domShare > 0.22 && dom.sat >= 0.18) wVivid = Math.min(wVivid, 0.22);
        if (domShare > 0.35) wVivid = Math.min(wVivid, 0.15);
        var wDom = 1 - wVivid;
        return { r: clampC(dom.r * wDom + vivid.r * wVivid), g: clampC(dom.g * wDom + vivid.g * wVivid), b: clampC(dom.b * wDom + vivid.b * wVivid) };
      }
      if (dom) return { r: dom.r, g: dom.g, b: dom.b };
      if (vivid) return { r: vivid.r, g: vivid.g, b: vivid.b };
      return null;
    } catch (e) { return null; }
  }
  function extractCoverColor(url) {
    return new Promise(function (resolve) {
      if (!url) return resolve(null);
      var raw = String(url).trim();
      if (!raw || raw.indexOf('logo.svg') >= 0 || raw.indexOf('data:') === 0) return resolve(null);
      var candidates = [
        'https://images.weserv.nl/?url=' + encodeURIComponent(raw.replace(/^https?:\/\//i, '')) + '&w=64&h=64&fit=cover&output=jpg',
        'https://wsrv.nl/?url=' + encodeURIComponent(raw) + '&w=64&h=64&fit=cover&output=jpg',
        'https://cdn.statically.io/img/' + raw.replace(/^https?:\/\//i, '') + '?w=64&h=64'
      ];
      candidates.unshift(raw);
      function tryOne(i) {
        if (i >= candidates.length) return resolve(null);
        var src = candidates[i];
        fetch(src, { mode: 'cors', credentials: 'omit', cache: 'force-cache' })
          .then(function (r) {
            if (!r.ok) throw new Error('bad status');
            return r.blob();
          })
          .then(function (blob) {
            if (!blob || blob.size < 80) throw new Error('empty');
            var obj = URL.createObjectURL(blob);
            var img = new Image();
            img.onload = function () {
              var c = sampleCanvasColor(img);
              URL.revokeObjectURL(obj);
              if (c) resolve(c);
              else tryOne(i + 1);
            };
            img.onerror = function () { URL.revokeObjectURL(obj); tryOne(i + 1); };
            img.src = obj;
          })
          .catch(function () {
            var img2 = new Image();
            img2.crossOrigin = 'anonymous';
            img2.onload = function () {
              var c = sampleCanvasColor(img2);
              if (c) resolve(c);
              else tryOne(i + 1);
            };
            img2.onerror = function () { tryOne(i + 1); };
            img2.src = src;
          });
      }
      tryOne(0);
    });
  }
  function rgbToAmbientPair(rgb) {
    if (!rgb) return { c1: { r: 250, g: 45, b: 72 }, c2: { r: 240, g: 200, b: 210 } };
    if (getNpStyle() === 'immersive') {
      var r = rgb.r, g = rgb.g, b = rgb.b;
      var max = Math.max(r, g, b);
      var min = Math.min(r, g, b);
      var mid = (max + min) / 2;
      if (max > min) {
        var k = 1.05;
        r = mid + (r - mid) * k; g = mid + (g - mid) * k; b = mid + (b - mid) * k;
      }
      r *= 0.88; g *= 0.88; b *= 0.88;
      var lum = 0.299 * r + 0.587 * g + 0.114 * b;
      if (lum < 48) { var lift = (48 - lum) * 0.7; r += lift; g += lift; b += lift; }
      if (lum > 175) { var cut = (lum - 175) * 0.55; r -= cut; g -= cut; b -= cut; }
      var v1 = { r: Math.max(0, Math.min(255, Math.round(r))), g: Math.max(0, Math.min(255, Math.round(g))), b: Math.max(0, Math.min(255, Math.round(b))) };
      return {
        c1: v1,
        c2: { r: Math.min(255, Math.round(v1.r * 0.75 + 20)), g: Math.min(255, Math.round(v1.g * 0.75 + 20)), b: Math.min(255, Math.round(v1.b * 0.75 + 20)) }
      };
    }
    function punch(v, lift2) { return Math.min(255, Math.round(v * 0.85 + lift2)); }
    return {
      c1: { r: punch(rgb.r, 70), g: punch(rgb.g, 40), b: punch(rgb.b, 50) },
      c2: { r: Math.min(255, Math.round(rgb.r * 0.5 + 120)), g: Math.min(255, Math.round(rgb.g * 0.5 + 110)), b: Math.min(255, Math.round(rgb.b * 0.5 + 120)) }
    };
  }
  function syncNpUiContrast(c1, c2) {
    var np = $('#np');
    if (!np) return;
    var isImm = np.classList.contains('immersive');
    var r = (c1 && c1.r) || 120, g = (c1 && c1.g) || 120, b = (c1 && c1.b) || 120;
    var r2 = (c2 && c2.r) || r, g2 = (c2 && c2.g) || g, b2 = (c2 && c2.b) || b;
    var lum1 = 0.299 * r + 0.587 * g + 0.114 * b;
    var lum2 = 0.299 * r2 + 0.587 * g2 + 0.114 * b2;
    var lum = lum1 * 0.65 + lum2 * 0.35;
    var needDarkUi = isImm ? (lum > 155) : (lum > 88);
    np.classList.toggle('np-ui-dark', !!needDarkUi);
    np.classList.toggle('np-ui-light', !needDarkUi);
  }
  function setAmbientVars(c1, c2) {
    var np = $('#np');
    if (!np) return;
    np.style.setProperty('--np-c1', c1.r + ', ' + c1.g + ', ' + c1.b);
    np.style.setProperty('--np-c2', c2.r + ', ' + c2.g + ', ' + c2.b);
    try { syncNpUiContrast(c1, c2); } catch (eUi) {}
  }
  function animateAmbientTo(rgb, instant) {
    var pair = rgbToAmbientPair(rgb);
    var from = _ambientCur;
    var to = pair.c1, to2 = pair.c2;
    if (_ambientAnim) cancelAnimationFrame(_ambientAnim);
    if (instant) {
      setAmbientVars(to, to2);
      _ambientCur = to; _ambientAnim = null;
      return;
    }
    var t0 = performance.now();
    var dur = 420;
    function frame(now) {
      var t = Math.min(1, (now - t0) / dur);
      var e = 1 - Math.pow(1 - t, 3);
      var c1 = { r: lerp(from.r, to.r, e), g: lerp(from.g, to.g, e), b: lerp(from.b, to.b, e) };
      var c2 = {
        r: lerp(Math.min(255, from.r + 80), to2.r, e),
        g: lerp(Math.min(255, from.g + 80), to2.g, e),
        b: lerp(Math.min(255, from.b + 80), to2.b, e)
      };
      setAmbientVars(c1, c2);
      if (t < 1) _ambientAnim = requestAnimationFrame(frame);
      else { _ambientCur = to; _ambientAnim = null; }
    }
    _ambientAnim = requestAnimationFrame(frame);
  }
  function computeNpAmbient(cover) {
    if (!cover || cover.indexOf('logo.svg') >= 0) { animateAmbientTo(null); return; }
    extractCoverColor(cover).then(function (rgb) { animateAmbientTo(rgb || null); });
  }
  function applyNpStyle(style, silent) {
    style = style === 'immersive' ? 'immersive' : 'classic';
    try { localStorage.setItem('aq_np_style', style); } catch (e) {}
    var np = $('#np');
    if (np) {
      var wasOpen = np.classList.contains('open');
      np.classList.toggle('immersive', style === 'immersive');
      if (!wasOpen) {
        np.classList.remove('open', 'closing', 'lyrics-full');
        np.style.transform = ''; np.style.opacity = ''; np.style.transition = '';
      }
    }
    try {
      $all('#lx-setNpStyleRow .seg button').forEach(function (b) {
        b.classList.toggle('on', b.dataset.np === style);
      });
    } catch (e2) {}
    try {
      var song = (typeof currentPlayingSong !== 'undefined' && currentPlayingSong) || window.currentPlayingSong || null;
      if (song) computeNpAmbient(coverOf(song));
    } catch (e3) {}
    if (!silent && window.showToast) {
      try { window.showToast('info', '播放页：' + (style === 'immersive' ? '沉浸' : '经典')); } catch (eT) {}
    }
  }

  // ---------- 同步歌曲信息 ----------
  function paintNpMeta(song) {
    if (!song) return;
    var t = $('#npTitle'), a = $('#npArtist');
    if (t) t.textContent = song.name || '—';
    if (a) a.textContent = artistOf(song);
    var cover = coverOf(song);
    var art = $('#npArt'), bg = $('#npBgImg');
    if (art) { art.onerror = function () { this.onerror = null; this.src = '/music/assets/logo.svg'; }; art.src = cover; }
    if (bg) { bg.onerror = function () { this.onerror = null; this.removeAttribute('src'); }; bg.src = cover; }
    // mini
    var mn = $('#miniName'), ma = $('#miniArtist'), mart = $('#miniArt');
    if (mn) mn.textContent = song.name || '未在播放';
    if (ma) ma.textContent = artistOf(song);
    if (mart) { mart.onerror = function () { this.onerror = null; this.src = '/music/assets/logo.svg'; }; mart.src = cover; }
    // mini封面旋转
    if (mart) mart.classList.add('spinning');
    // 封面取色→氛围底(420ms渐变,失败回退默认粉)
    try { computeNpAmbient(cover); } catch (eAmb) {}
  }

  // ---------- 播放状态 ----------
  function paintPlayState() {
    var audio = document.getElementById('audio-player');
    var playing = audio && !audio.paused && !audio.ended;
    var paths = {
      play: 'M8 5v14l11-7z',
      pause: 'M6 5h4v14H6zM14 5h4v14h-4z'
    };
    var npI = $('#npPlayIcon'), mnI = $('#miniPlayIcon');
    [npI, mnI].forEach(function (svg) {
      if (!svg) return;
      var p = svg.querySelector('path');
      if (p) p.setAttribute('d', playing ? paths.pause : paths.play);
    });
    // 均衡器/流光播放态
    ['npWave', 'npGlow'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.classList.toggle('is-playing', !!playing);
    });
    var mart = $('#miniArt');
    if (mart) mart.classList.toggle('spinning', !!playing);
  }

  // ---------- 进度 ----------
  function paintProgress() {
    var audio = document.getElementById('audio-player');
    if (!audio) return;
    var d = audio.duration || 0, c = audio.currentTime || 0;
    var p = d > 0 ? (c / d) : 0;
    var seek = $('#npSeek');
    if (seek && document.activeElement !== seek) {
      try { seek.value = Math.round(p * 1000); } catch (e) {}
    }
    var orbit = $('#npOrbitLit');
    if (orbit) { try { orbit.style.strokeDashoffset = String(100 - p * 100); } catch (e) {} }
    var glow = $('#npGlowFill');
    if (glow) { try { glow.style.width = (p * 100).toFixed(1) + '%'; } catch (e) {} }
    var mp = $('#miniProg');
    if (mp) { try { mp.style.width = (p * 100).toFixed(1) + '%'; } catch (e) {} }
    var mf = $('#miniFill');
    if (mf) { try { mf.style.transform = 'scaleX(' + p.toFixed(3) + ')'; } catch (e) {} }
    function fmt(t) {
      if (!isFinite(t) || t < 0) return '0:00';
      var m = Math.floor(t / 60), s = Math.floor(t % 60);
      return m + ':' + String(s).padStart(2, '0');
    }
    var cc = $('#npCur'), dd = $('#npDur');
    if (cc) cc.textContent = fmt(c);
    if (dd) dd.textContent = fmt(d);
  }

  // ---------- 歌词桥:读洛雪lyric-content行,按时间同步npLyrics ----------
  var lxLines = []; // {t, el}
  function rebuildNpLyrics() {
    var box = $('#npLyrics');
    if (!box) return;
    var src = document.getElementById('lyric-content');
    box.innerHTML = '';
    lxLines = [];
    if (!src) { box.innerHTML = '<div class="ly-empty">…</div>'; return; }
    var rows = src.querySelectorAll('[data-time], [data-t], .lyric-line, p');
    var idx = 0;
    rows.forEach(function (r) {
      var txt = (r.innerText || r.textContent || '').trim();
      if (!txt || /暂无歌词|正在加载/.test(txt)) return;
      var t = parseFloat(r.dataset.time || r.dataset.t || r.dataset.ltime || ('x' + idx));
      if (!isFinite(t)) t = idx * 3;
      var div = document.createElement('div');
      div.className = 'ly';
      div.textContent = txt;
      (function (d) {
        d.addEventListener('click', function () {
          var audio = document.getElementById('audio-player');
          if (audio && isFinite(lxLines[idx] && lxLines[idx].t)) {
            try { audio.currentTime = lxLines[idx].t; } catch (e) {}
          }
        });
      })(div);
      box.appendChild(div);
      lxLines.push({ t: t, el: div });
      idx++;
    });
    if (!lxLines.length) box.innerHTML = '<div class="ly-empty">…</div>';
    paintMiniLyric(true);
  }

  var lastLyIdx = -1;
  function syncNpLyrics(force) {
    var audio = document.getElementById('audio-player');
    if (!audio || !lxLines.length) return;
    var t = audio.currentTime || 0;
    var idx = 0;
    for (var i = 0; i < lxLines.length; i++) {
      if (lxLines[i].t <= t + 0.15) idx = i;
      else break;
    }
    if (idx !== lastLyIdx || force) {
      lastLyIdx = idx;
      lxLines.forEach(function (L, i) {
        L.el.classList.toggle('on', i === idx);
        L.el.classList.toggle('near', Math.abs(i - idx) === 1);
      });
      var cur = lxLines[idx] && lxLines[idx].el;
      if (cur) {
        try { cur.scrollIntoView({ block: 'center', behavior: force ? 'auto' : 'smooth' }); } catch (e) {}
      }
      paintMiniLyric(false, idx);
    }
  }

  // ---------- mini歌词:当前行+跑马灯 ----------
  var mqTimer = null;
  function startMarquee(el) {
    if (!el) return;
    try {
      el.classList.remove('is-marquee');
      el.style.transform = 'translateX(0)';
      void el.offsetWidth;
      var track = el.parentElement;
      var trackW = (track && track.clientWidth) || el.clientWidth || 0;
      var textW = el.scrollWidth || 0;
      if (!trackW || textW <= trackW + 4) return;
      var dx = -(textW - trackW + 6);
      var dur = Math.max(2.2, Math.min(8, Math.abs(dx) / 40));
      el.style.setProperty('--mq-dx', dx + 'px');
      el.style.setProperty('--mq-dur', dur + 's');
      mqTimer = setTimeout(function () {
        mqTimer = null;
        if (!el.isConnected) return;
        el.classList.add('is-marquee');
      }, 40);
    } catch (e) {}
  }
  function paintMiniLyric(force, idx) {
    var cur = $('#miniLyCur'), sub = $('#miniSub');
    if (!cur) return;
    if (!lxLines.length) {
      cur.textContent = '';
      if (sub) sub.classList.remove('show-lyric');
      return;
    }
    if (idx == null) idx = lastLyIdx < 0 ? 0 : lastLyIdx;
    var txt = ((lxLines[idx] && lxLines[idx].el.textContent) || '').trim();
    if (!txt) return;
    if (sub) sub.classList.add('show-lyric');
    if (force || cur.textContent !== txt) {
      if (mqTimer) { clearTimeout(mqTimer); mqTimer = null; }
      cur.className = 'mini-lyric-line is-cur';
      cur.textContent = txt;
      requestAnimationFrame(function () { startMarquee(cur); });
    }
  }

  // ---------- 粒子(对齐参考页:播放中timeupdate持续生成,暂停/切歌清空) ----------
  var _miniParticleLast = 0;
  function spawnMiniParticles() {
    var host = $('#miniParticles');
    var fill = $('#miniFill');
    var mini = $('#mini');
    var audio = document.getElementById('audio-player');
    if (!host || !fill || !mini || !audio || audio.paused) return;
    var now = Date.now();
    if (now - _miniParticleLast < 90) return;
    _miniParticleLast = now;
    var miniW = mini.clientWidth || 280;
    var fillW = fill.clientWidth || 0;
    var edge = fillW;
    var unplayed = Math.max(20, miniW - fillW);
    var n = 2 + Math.floor(Math.random() * 2);
    for (var i = 0; i < n; i++) {
      var el = document.createElement('span');
      el.className = 'mini-particle';
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
    try { var host = $('#miniParticles'); if (host) host.innerHTML = ''; } catch (e) {}
  }
  function burstParticles(n) {
    var box = $('#miniParticles');
    if (!box) return;
    n = n || 6;
    for (var i = 0; i < n; i++) {
      (function () {
        var p = document.createElement('i');
        var sx = (Math.random() * 30 - 15).toFixed(0) + 'px';
        var dx = (Math.random() * -80 - 20).toFixed(0) + 'px';
        var dy = (Math.random() * -16 - 2).toFixed(0) + 'px';
        p.style.setProperty('--sx', sx);
        p.style.setProperty('--dx', dx);
        p.style.setProperty('--dy', dy);
        p.style.setProperty('--dur', (1.6 + Math.random() * 1.2).toFixed(2) + 's');
        box.appendChild(p);
        setTimeout(function () { try { p.remove(); } catch (e) {} }, 3000);
      })();
    }
    // 上限保护
    while (box.children.length > 40) { try { box.firstChild.remove(); } catch (e) { break; } }
  }

  // ---------- 进度条样式(普通bar/心率heart/星轨orbit/光轨glow),默认心率 ----------
  function applySeekStyle(style, silent) {
    var allowed = { bar: 1, heart: 1, orbit: 1, glow: 1 };
    if (!allowed[style]) style = 'heart';
    var wrap = $('#npSeekWrap');
    if (wrap) {
      wrap.classList.remove('seek-bar', 'seek-heart', 'seek-orbit', 'seek-glow', 'wave-mode');
      if (style === 'heart') wrap.classList.add('seek-heart');
      else if (style === 'orbit') wrap.classList.add('seek-orbit');
      else if (style === 'glow') wrap.classList.add('seek-glow');
      else wrap.classList.add('seek-bar');
    }
    var playing = false;
    try { var au = document.getElementById('audio-player'); playing = !!(au && !au.paused); } catch (eP) {}
    try {
      var wave = document.getElementById('npWave');
      if (wave) wave.classList.toggle('is-playing', style === 'heart' && playing);
      var orb = document.getElementById('npOrbit');
      if (orb) orb.classList.toggle('is-playing', style === 'orbit' && playing);
      var gl = document.getElementById('npGlow');
      if (gl) gl.classList.toggle('is-playing', style === 'glow' && playing);
    } catch (e2) {}
    try { localStorage.setItem('lx_np_seek_style', style); } catch (e) {}
    if (!silent && window.showToast) {
      var lab = { bar: '普通', heart: '心率', orbit: '星轨', glow: '光轨' };
      try { window.showToast('info', '进度条：' + (lab[style] || style)); } catch (eT) {}
    }
  }

  // ---------- 打开/关闭 ----------
  function openNp() {
    var np = $('#np');
    if (!np) return;
    // 关queue/sheet残留
    try {
      var qd = document.getElementById('queue-drawer');
      if (qd) qd.classList.add('hidden');
    } catch (e) {}
    np.classList.remove('closing');
    np.style.transform = ''; np.style.opacity = '';
    np.classList.add('open');
    rebuildNpLyrics();
    syncNpLyrics(true);
  }
  function closeNp() {
    var np = $('#np');
    if (!np) return;
    if (!np.classList.contains('open')) return;
    np.classList.add('closing');
    np.classList.remove('open');
    np.style.transition = 'transform .36s cubic-bezier(0.32,0.72,0,1), opacity .3s ease';
    np.style.transform = 'translateY(100%)';
    np.style.opacity = '0';
    setTimeout(function () {
      np.classList.remove('closing');
      np.style.transform = ''; np.style.opacity = ''; np.style.transition = '';
    }, 380);
  }

  // ---------- 按钮桥 ----------
  function bindControls() {
    function on(id, fn) {
      var el = document.getElementById(id);
      if (el) el.addEventListener('click', function (e) { e.stopPropagation(); fn(); });
    }
    on('npPlay', function () { if (typeof togglePlay === 'function') togglePlay(); });
    on('miniPlay', function () { if (typeof togglePlay === 'function') togglePlay(); });
    on('npPrev', function () { if (typeof playPrev === 'function') playPrev(); });
    on('npNext', function () { if (typeof playNext === 'function') playNext(); });
    on('miniNext', function () { if (typeof playNext === 'function') playNext(); });
    on('npMode', function () {
      // 循环切模式:调用现有togglePlayModeMenu逻辑简化版
      if (typeof togglePlayModeMenu === 'function') togglePlayModeMenu(new Event('click'));
      else if (typeof setPlayMode === 'function') {
        var modes = ['list', 'single', 'random', 'order'];
        var cur = (window.settings && window.settings.playMode) || 'list';
        setPlayMode(modes[(modes.indexOf(cur) + 1) % modes.length]);
      }
    });
    on('npQueue', function () { if (typeof toggleQueueDrawer === 'function') toggleQueueDrawer(); });
    on('npFav', function () { if (typeof toggleLove === 'function') toggleLove(); });
    on('npSpeed', function () {
      var el = document.getElementById('playback-rate-btn');
      if (el) el.click();
      else if (typeof setPlaybackRate === 'function') {
        var audio = document.getElementById('audio-player');
        var cur = (audio && audio.playbackRate) || 1;
        var steps = [1, 1.25, 1.5, 2, 0.75, 0.5];
        setPlaybackRate(steps[(steps.indexOf(cur) + 1) % steps.length]);
      }
    });
    on('npQuality', function () {
      if (window.showToast) window.showToast('info', '在设置页切换首选音质，播放器自动匹配最高可用档');
      if (typeof switchTab === 'function') { closeNp(); switchTab('settings'); }
    });
    on('npSleep', function () {
      if (typeof openSleepTimerModal === 'function') openSleepTimerModal();
    });
    on('npMore', function () {
      // 切源:进设置? 直接打开站源菜单(首页那套)不可见时提示
      if (window.showToast) window.showToast('info', '切源请在首页右上站源钮切换，全站生效');
    });
    // 进度拖动
    var seek = $('#npSeek');
    if (seek) seek.addEventListener('input', function () {
      var audio = document.getElementById('audio-player');
      if (audio && audio.duration) {
        try { audio.currentTime = (seek.value / 1000) * audio.duration; } catch (e) {}
      }
    });
    // mini点进播放页
    var mini = $('#mini');
    if (mini) mini.addEventListener('click', function (e) {
      if (e.target.closest('#miniPlay, #miniNext')) return;
      openNp();
    });
    // npGrab下滑关闭
    var grab = $('#npGrab');
    if (grab) grab.addEventListener('click', closeNp);
    // 加挂:评论/分享/下载(洛雪独有,参考页没有) -> 长按标题? 这里放在np-tools第二行
    bindExtraTools();
  }

  function bindExtraTools() {
    var tools = document.querySelector('#np .np-tools');
    if (!tools || document.getElementById('npComment')) return;
    function mk(id, label, fn) {
      var b = document.createElement('button');
      b.id = id; b.type = 'button';
      b.textContent = label;
      b.addEventListener('click', function (e) { e.stopPropagation(); fn(); });
      return b;
    }
    tools.appendChild(mk('npComment', '评论', function () { if (typeof toggleCommentModal === 'function') toggleCommentModal(); }));
    tools.appendChild(mk('npShare', '分享', function () { if (window.lyricCard && window.lyricCard.open) window.lyricCard.open(); }));
    tools.appendChild(mk('npDl', '下载', function (e) { if (typeof handleDownloadClick === 'function') handleDownloadClick(e); }));
  }

  // ---------- 音质/倍速/定时标签 ----------
  function paintLabels() {
    try {
      var audio = document.getElementById('audio-player');
      var sl = $('#npSpeedLabel');
      if (sl && audio) sl.textContent = (audio.playbackRate || 1).toFixed(1) + 'x';
    } catch (e) {}
    try {
      var q = $('#npQ');
      if (q) {
        var cur = (typeof currentQuality !== 'undefined' && currentQuality) || (window.settings && window.settings.preferredQuality) || '—';
        var map = { '128k': '标准', '192k': '较高', '320k': '高品', flac: '无损', hires: 'Hi-Res', master: '母带' };
        q.textContent = map[cur] || cur || '—';
      }
    } catch (e) {}
  }

  // ---------- mini显隐:有播放队列即show ----------
  function paintMiniShow(song) {
    try {
      var mini = document.getElementById('mini');
      if (!mini) return;
      var has = false;
      try {
        if (song) has = true;
        else if (typeof currentPlayingSong !== 'undefined' && currentPlayingSong) has = true;
        else if (window.currentPlayingSong) has = true;
      } catch (e) {}
      mini.classList.toggle('show', !!has);
    } catch (e) {}
  }

  // ---------- 钩子:劫持洛雪播放链路 ----------
  function hookPlayer() {
    // updatePlayerInfo后补画np/mini
    try {
      if (typeof window.updatePlayerInfo === 'function' && !window._lxNpHooked) {
        window._lxNpHooked = true;
        var orig = window.updatePlayerInfo;
        window.updatePlayerInfo = function (song, q) {
          var r = orig.apply(this, arguments);
          try { paintNpMeta(song); paintLabels(); paintMiniShow(song); } catch (e) {}
          return r;
        };
      }
    } catch (e) {}
    // toggleLyrics改走np overlay
    try {
      if (typeof window.toggleLyrics === 'function' && !window._lxNpLyricsHooked) {
        window._lxNpLyricsHooked = true;
        var origT = window.toggleLyrics;
        window.toggleLyrics = function () {
          var np = $('#np');
          if (np && np.classList.contains('open')) { closeNp(); return; }
          openNp();
        };
        window._lxCloseNp = closeNp;
        window._lxOpenNp = openNp;
      }
    } catch (e) {}
    // audio事件
    var audio = document.getElementById('audio-player');
    if (audio && !audio._lxNpBound) {
      audio._lxNpBound = true;
      audio.addEventListener('play', paintPlayState);
      audio.addEventListener('playing', paintPlayState);
      audio.addEventListener('timeupdate', function () {
        paintProgress(); syncNpLyrics(false);
        try {
          var d = audio.duration || 0, c = audio.currentTime || 0;
          var p = d > 0 ? (c / d) : 0;
          if (!audio.paused && p > 0.001 && p < 0.999) spawnMiniParticles();
        } catch (eSp) {}
      });
      audio.addEventListener('pause', function () { paintPlayState(); clearMiniParticles(); });
      audio.addEventListener('ended', function () { paintPlayState(); clearMiniParticles(); });
      audio.addEventListener('loadedmetadata', function () { paintProgress(); paintLabels(); });
      audio.addEventListener('ratechange', paintLabels);
      audio.addEventListener('ended', paintPlayState);
    }
    // 歌词重绘钩子:renderLyric后重建np歌词
    try {
      if (typeof window.renderLyric === 'function' && !window._lxNpLyricHooked) {
        window._lxNpLyricHooked = true;
        var origR = window.renderLyric;
        window.renderLyric = function () {
          var r = origR.apply(this, arguments);
          try { rebuildNpLyrics(); syncNpLyrics(true); } catch (e) {}
          return r;
        };
      }
    } catch (e) {}
    // 切歌粒子
    try {
      if (typeof window.playSong === 'function' && !window._lxNpPlayHooked) {
        window._lxNpPlayHooked = true;
        var origP = window.playSong;
        window.playSong = function () {
          var r = origP.apply(this, arguments);
          try { clearMiniParticles(); burstParticles(6); } catch (e) {}
          return r;
        };
      }
    } catch (e) {}
  }
  var hookTries = 0;
  var hookTimer = setInterval(function () {
    try {
      hookPlayer();
      if ((window._lxNpHooked && window._lxNpLyricsHooked && window._lxNpLyricHooked) || (++hookTries > 120)) clearInterval(hookTimer);
    } catch (e) {}
  }, 300);

  window.LxRefPlayer = {
    open: openNp, close: closeNp,
    repaint: paintNpMeta, seekStyle: applySeekStyle,
    lyrics: rebuildNpLyrics,
    npStyle: applyNpStyle, ambient: computeNpAmbient,
    spawnParticles: spawnMiniParticles, clearParticles: clearMiniParticles
  };
  document.addEventListener('DOMContentLoaded', function () {
    bindControls();
    var st = 'heart';
    try { st = localStorage.getItem('lx_np_seek_style') || 'heart'; } catch (e) {}
    applySeekStyle(st, true);
    var nst = 'classic';
    try { nst = localStorage.getItem('aq_np_style') || 'classic'; } catch (e2) {}
    applyNpStyle(nst, true);
    setInterval(function () { try { paintLabels(); } catch (e) {} }, 2000);
  });
})();
