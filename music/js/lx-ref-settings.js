// ============================================================
// lx-ref-settings.js — 设置页换皮桥(第8轮定稿:只换皮,功能全不动)
// .set-row/.seg视觉 + 进度条样式项(普通/心率/星轨/光轨,联动播放器)
// ============================================================
(function () {
  'use strict';

  function $(s, r) { return (r || document).querySelector(s); }
  function $all(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }

  var SEEK_OPTS = [
    { id: 'bar', name: '普通' },
    { id: 'heart', name: '心率' },
    { id: 'orbit', name: '星轨' },
    { id: 'glow', name: '光轨' }
  ];
  var NP_OPTS = [
    { id: 'classic', name: '经典' },
    { id: 'immersive', name: '沉浸' }
  ];

  function curSeek() {
    try { return localStorage.getItem('lx_np_seek_style') || 'heart'; } catch (e) { return 'heart'; }
  }

  function renderSeekRow() {
    var host = $('#lx-setSeekRow');
    if (!host) return;
    var seg = host.querySelector('.seg');
    if (!seg) return;
    var cur = curSeek();
    seg.innerHTML = '';
    SEEK_OPTS.forEach(function (o) {
      var b = document.createElement('button');
      b.type = 'button';
      b.textContent = o.name;
      if (o.id === cur) b.className = 'on';
      b.addEventListener('click', function () {
        try {
          if (window.LxRefPlayer && window.LxRefPlayer.seekStyle) window.LxRefPlayer.seekStyle(o.id);
          else localStorage.setItem('lx_np_seek_style', o.id);
        } catch (e) {}
        $all('button', seg).forEach(function (x) { x.classList.remove('on'); });
        b.classList.add('on');
      });
      seg.appendChild(b);
    });
  }

  function curNp() {
    try { return localStorage.getItem('aq_np_style') || 'classic'; } catch (e) { return 'classic'; }
  }

  function renderNpRow() {
    var host = $('#lx-setNpStyleRow');
    if (!host) return;
    var seg = host.querySelector('.seg');
    if (!seg) return;
    var cur = curNp();
    seg.innerHTML = '';
    NP_OPTS.forEach(function (o) {
      var b = document.createElement('button');
      b.type = 'button';
      b.textContent = o.name;
      b.dataset.np = o.id;
      if (o.id === cur) b.className = 'on';
      b.addEventListener('click', function () {
        try {
          if (window.LxRefPlayer && window.LxRefPlayer.npStyle) window.LxRefPlayer.npStyle(o.id);
          else localStorage.setItem('aq_np_style', o.id);
        } catch (e) {}
        $all('button', seg).forEach(function (x) { x.classList.remove('on'); });
        b.classList.add('on');
      });
      seg.appendChild(b);
    });
  }

  function applySkin() {
    var v = document.getElementById('view-settings');
    if (!v) return;
    // 整个设置视图套 scope(只换皮,不动DOM/逻辑)
    if (!v.classList.contains('ref-set-scope')) v.classList.add('ref-set-scope');
    if (!v.classList.contains('ref-home-scope')) v.classList.add('ref-home-scope');
    // 播放器相关行插到显示面板顶部:最终顺序 播放页样式在上,进度条在下
    // (都插firstChild,所以先插进度条,再插样式行)
    var panel = document.getElementById('settings-panel-display');
    if (panel && !document.getElementById('lx-setSeekRow')) {
      var row = document.createElement('div');
      row.className = 'set-block';
      row.id = 'lx-setSeekBlock';
      row.innerHTML = '<div class="set-row" id="lx-setSeekRow">' +
        '<div><div class="set-label">进度条样式</div>' +
        '<div class="set-hint">普通 / 心率 / 星轨 / 光轨（播放页实时生效）</div></div>' +
        '<div class="seg"></div></div>';
      panel.insertBefore(row, panel.firstChild);
    }
    renderSeekRow();
    if (panel && !document.getElementById('lx-setNpStyleRow')) {
      var nrow = document.createElement('div');
      nrow.className = 'set-block';
      nrow.id = 'lx-setNpStyleBlock';
      nrow.innerHTML = '<div class="set-row" id="lx-setNpStyleRow">' +
        '<div><div class="set-label">播放页样式</div>' +
        '<div class="set-hint">经典卡片 / 沉浸海报（取色融合）</div></div>' +
        '<div class="seg"></div></div>';
      panel.insertBefore(nrow, panel.firstChild);
    }
    renderNpRow();
  }

  window.LxRefSettings = { apply: applySkin, renderSeek: renderSeekRow };
  document.addEventListener('DOMContentLoaded', function () {
    // 切到设置页时应用(等洛雪syncSettingsUI后)
    try {
      if (typeof window.switchTab === 'function' && !window._lxSetHooked) {
        window._lxSetHooked = true;
        var orig = window.switchTab;
        window.switchTab = function (tab) {
          var r = orig.apply(this, arguments);
          if (tab === 'settings') { try { setTimeout(applySkin, 200); } catch (e) {} }
          return r;
        };
      }
    } catch (e) {}
    setTimeout(applySkin, 1500);
  });
})();
