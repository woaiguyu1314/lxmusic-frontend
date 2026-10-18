// ============================================================
// lx-ref-lib.js — 参考页风格"我的"页数据桥(第6轮定稿)
// 手风琴4块:喜欢的音乐(loveList)/喜欢的歌单(userList)/最近播放(play_history)/已下载(cache/list)
// + 更多段:本地音乐/文件管理/同步/用户入口
// ============================================================
(function () {
  'use strict';
  var SRC_BADGE = { tx: ['QQ', 'qq'], wy: ['网易', 'netease'], kw: ['酷我', 'kuwo'], kg: ['酷狗', 'kugou'], mg: ['咪咕', 'migu'] };

  function $(s, r) { return (r || document).querySelector(s); }
  function $all(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function curSource() {
    try {
      var el = document.getElementById('search-source');
      if (el && el.value) return el.value;
    } catch (e) {}
    return 'wy';
  }
  function coverOf(song) {
    try {
      if (typeof getImgUrl === 'function') { var u = getImgUrl(song); if (u) return u; }
    } catch (e) {}
    return (song && (song.img || (song.meta && song.meta.picUrl) || song.picUrl)) || '/music/assets/logo.svg';
  }
  function artistOf(song) { return (song && (song.singer || song.artistName || song.artist)) || '未知'; }

  function songRow(song, list) {
    var el = document.createElement('div');
    el.className = 'song';
    el.innerHTML = '<img class="song-art" alt=""/>' +
      '<div class="song-meta"><div class="song-name"></div>' +
      '<div class="song-sub"><span class="song-src"></span><span class="song-sub-text"></span></div></div>' +
      '<button class="song-more" aria-label="更多">···</button>';
    var img = el.querySelector('.song-art');
    img.onerror = function () { this.onerror = null; this.src = '/music/assets/logo.svg'; };
    img.src = coverOf(song);
    img.loading = 'lazy';
    el.querySelector('.song-name').textContent = song.name || '未知';
    var badge = SRC_BADGE[song.source] || SRC_BADGE[curSource()] || ['--', 'qq'];
    var srcEl = el.querySelector('.song-src');
    srcEl.textContent = badge[0];
    srcEl.setAttribute('data-plat', badge[1]);
    el.querySelector('.song-sub-text').textContent = artistOf(song);
    el.addEventListener('click', function (e) {
      if (e.target.closest('.song-more')) {
        if (window.LxRefHome && window.LxRefHome.openSongSheet) window.LxRefHome.openSongSheet(song, list);
        return;
      }
      if (typeof window.playSongFromList === 'function') window.playSongFromList(song, list); else if (typeof playSong === 'function') playSong(song, Math.max(0, (list || []).indexOf(song)));
    });
    return el;
  }

  // 数据源
  function getFavSongs() {
    try {
      var d = window.currentListData;
      if (d && d.loveList) return d.loveList;
    } catch (e) {}
    return [];
  }
  function getUserPlaylists() {
    try {
      var d = window.currentListData;
      if (d && d.userList) return d.userList;
    } catch (e) {}
    return [];
  }
  function getRecent() {
    try {
      var h = JSON.parse(localStorage.getItem('play_history') || '[]');
      return Array.isArray(h) ? h.slice(0, 80) : [];
    } catch (e) { return []; }
  }
  async function getCacheList() {
    try {
      var headers = (typeof getUserAuthHeaders === 'function') ? getUserAuthHeaders() : {};
      var res = await fetch('/api/music/cache/list', { headers: headers });
      var data = await res.json();
      if (data && data.success && Array.isArray(data.data)) {
        var username = (window.currentListData && window.currentListData.username) || localStorage.getItem('lx_sync_user') || '';
        var authToken = ((typeof getUserAuthHeaders === 'function') ? getUserAuthHeaders()['x-user-token'] : null) || localStorage.getItem('lx_user_token') || '';
        return data.data.map(function (item) {
          return {
            name: item.filename ? String(item.filename).replace(/\.[^.]+$/, '') : (item.name || '缓存歌曲'),
            singer: artistOf(item),
            source: item.source || curSource(),
            img: item.hasCover ? ('/api/music/cache/cover?filename=' + encodeURIComponent(item.filename) + '&user=' + encodeURIComponent(username) + (authToken ? '&token=' + encodeURIComponent(authToken) : '')) : '/music/assets/logo.svg',
            _cacheFile: item
          };
        });
      }
    } catch (e) {}
    return [];
  }

  function paintCounts() {
    var fav = getFavSongs(), pls = getUserPlaylists(), rec = getRecent();
    var c1 = $('#lx-cntFav'), c2 = $('#lx-cntFavPl'), c3 = $('#lx-cntRecent'), c4 = $('#lx-cntDl');
    if (c1) c1.textContent = fav.length;
    if (c2) c2.textContent = pls.length;
    if (c3) c3.textContent = rec.length;
    if (c4) c4.textContent = c4.textContent || '0'; // 缓存数异步补
  }

  function fillPanel(type) {
    var panel = $('#lx-libPanel-' + type);
    if (!panel) return;
    if (type === 'fav') {
      var list = getFavSongs();
      panel.innerHTML = '';
      if (!list.length) { panel.innerHTML = '<div class="empty" style="padding:16px 0">空空如也</div>'; return; }
      list.slice(0, 80).forEach(function (s) { panel.appendChild(songRow(s, list)); });
    } else if (type === 'favPl') {
      var pls = getUserPlaylists();
      panel.innerHTML = '';
      if (!pls.length) { panel.innerHTML = '<div class="empty" style="padding:16px;font-size:13px">还没有自建歌单</div>'; return; }
      pls.forEach(function (pl) {
        var row = document.createElement('div');
        row.className = 'song';
        row.innerHTML = '<img class="song-art" alt=""/><div class="song-meta"><div class="song-name"></div><div class="song-sub"></div></div>';
        var img = row.querySelector('img');
        img.onerror = function () { this.onerror = null; this.src = '/music/assets/logo.svg'; };
        img.src = (pl.cover || pl.img) || '/music/assets/logo.svg';
        row.querySelector('.song-name').textContent = pl.name || '歌单';
        row.querySelector('.song-sub').textContent = '歌单 · ' + ((pl.list && pl.list.length) || 0) + ' 首';
        row.addEventListener('click', function () {
          // 进收藏页对应列表:用现有渲染
          if (typeof switchTab === 'function') switchTab('favorites');
        });
        panel.appendChild(row);
      });
    } else if (type === 'recent') {
      var rec = getRecent();
      panel.innerHTML = '';
      if (!rec.length) { panel.innerHTML = '<div class="empty" style="padding:16px 0">空空如也</div>'; return; }
      rec.forEach(function (s) { panel.appendChild(songRow(s, rec)); });
    } else if (type === 'dl') {
      panel.innerHTML = '<div class="empty" style="padding:16px;font-size:13px">加载缓存…</div>';
      getCacheList().then(function (list) {
        panel.innerHTML = '';
        var c4 = $('#lx-cntDl');
        if (c4) c4.textContent = list.length;
        if (!list.length) { panel.innerHTML = '<div class="empty" style="padding:16px 0">空空如也</div>'; return; }
        list.slice(0, 80).forEach(function (s) { panel.appendChild(songRow(s, list)); });
      });
    }
  }

  function toggleLib(type) {
    var block = document.querySelector('.lib-block[data-lib="' + type + '"]');
    if (!block) return;
    var willOpen = !block.classList.contains('open');
    $all('.lib-block').forEach(function (b) { if (b !== block) b.classList.remove('open'); });
    if (willOpen) { fillPanel(type); block.classList.add('open'); }
    else block.classList.remove('open');
  }

  function bindLib() {
    $all('#lx-libList .lib-block .lib-item').forEach(function (head) {
      head.addEventListener('click', function () {
        var block = head.closest('.lib-block');
        if (block) toggleLib(block.dataset.lib);
      });
    });
    // 更多段入口
    $all('#lx-libMore .lib-item').forEach(function (head) {
      head.addEventListener('click', function () {
        var go = head.dataset.go;
        if (!go || typeof switchTab !== 'function') return;
        switchTab(go);
      });
    });
  }

  function refreshLib() {
    paintCounts();
    // 默认展开最近播放
    var block = document.querySelector('.lib-block[data-lib="recent"]');
    if (block && !block.classList.contains('open')) {
      $all('.lib-block').forEach(function (b) { if (b !== block) b.classList.remove('open'); });
      fillPanel('recent');
      block.classList.add('open');
    } else if (block) {
      fillPanel('recent');
    }
  }

  window._lxLibVer = '20251005-perf';
  window.LxRefLib = { refresh: refreshLib, toggle: toggleLib, fill: fillPanel, counts: paintCounts,
    hookState: function () { return { favHooked: !!window._lxLibFavHooked, tabHooked: !!window._lxLibHooked, hasHfc: typeof window.handleFavoritesClick, hasSt: typeof window.switchTab }; } };
  function hookFav() {
    try {
      var _hfc = window.handleFavoritesClick;
      if (typeof _hfc === 'function' && !window._lxLibFavHooked) {
        window._lxLibFavHooked = true;
        var _origHfc = _hfc;
        window.handleFavoritesClick = function () {
          // 我的页:直接显示view-favorites,不走侧边折叠
          try { exitListSecondaryModes(); } catch (e) {}
          try {
            document.querySelectorAll('[id^="view-"]').forEach(function (el) {
              el.classList.add('hidden'); el.classList.remove('opacity-100'); el.classList.add('opacity-0');
            });
            var v = document.getElementById('view-favorites');
            if (v) {
              v.classList.remove('hidden');
              v.classList.add('flex');
              setTimeout(function () { v.classList.remove('opacity-0'); v.classList.add('opacity-100'); }, 10);
            }
            document.querySelectorAll('[id^="tab-"]').forEach(function (el) {
              el.classList.remove('active-tab', 'text-emerald-600'); el.classList.add('t-text-muted');
            });
            var ft = document.getElementById('tab-favorites');
            if (ft) { ft.classList.add('active-tab'); ft.classList.remove('t-text-muted'); }
          } catch (e2) {}
          try { refreshLib(); } catch (e3) {}
        };
      }
      var _st = window.switchTab;
      if (typeof _st === 'function' && !window._lxLibHooked) {
        window._lxLibHooked = true;
        window.switchTab = function (tab) {
          if (tab === 'favorites') { try { window.handleFavoritesClick(); } catch (e) {} return; }
          var r = _st.apply(this, arguments);
          if (tab === 'home') {
            try { setTimeout(refreshLib, 300); } catch (e2) {}
          }
          return r;
        };
      }
      if (window._lxLibFavHooked && window._lxLibHooked) return true;
      return false;
    } catch (e) { return false; }
  }
  var _hookTries = 0;
  var _hookTimer = setInterval(function () {
    try {
      if (hookFav() || (++_hookTries > 30)) clearInterval(_hookTimer);
    } catch (e) {}
  }, 1200);
  document.addEventListener('DOMContentLoaded', function () {
    bindLib();
    setTimeout(refreshLib, 1200);
  });
})();
