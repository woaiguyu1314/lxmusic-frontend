// ============================================================
// lx-ref-search.js — 参考页风格搜索页数据桥
// 定稿第5轮:歌曲/歌手/歌单三tab + 真热搜词+悄悄换词 + .song行 + 全局站源
// ============================================================
(function () {
  'use strict';
  var API = '/api/music';
  var PLAT_NAME = { tx: 'QQ', wy: '网易', kw: '酷我', kg: '酷狗', mg: '咪咕' };
  var FALLBACK_CHIPS = ['晴天', '海阔天空', '演员', '起风了', '光年之外', '孤勇者', '稻香', '消愁', '夜曲', '七里香', '告白气球', '青花瓷', '成都', '小幸运', '体面', '后来', '传奇', '十年', '富士山下', '红豆'];
  var state = { tab: 'song', kw: '', song: [], singer: [], album: [], chipTimer: null };

  function $(s, r) { return (r || document).querySelector(s); }
  function $all(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function authHeaders() {
    var h = {};
    try {
      if (typeof authToken !== 'undefined' && authToken) h['x-user-token'] = authToken;
      if (typeof getUserAuthHeaders === 'function') Object.assign(h, getUserAuthHeaders());
    } catch (e) {}
    return h;
  }
  function curSource() {
    try {
      var el = document.getElementById('search-source');
      if (el && el.value) return el.value;
      var s = localStorage.getItem('search-source');
      if (s) return s;
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

  // ---------- chips: 真热搜 + 悄悄换词 ----------
  async function fetchChipsWords() {
    try {
      var src = curSource();
      var res = await fetch(API + '/hotSearch?source=' + src, { headers: authHeaders() });
      var data = await res.json();
      if (data && data.list && data.list.length) return data.list.slice(0, 20);
    } catch (e) {}
    return FALLBACK_CHIPS.slice();
  }
  var chipPool = [];
  function chipCount() {
    try { return window.innerWidth >= 700 ? 10 : 8; } catch (e) { return 8; }
  }
  function bindChip(c, w) {
    c.onclick = function () {
      var inp = $('#lx-qInput');
      if (inp) inp.value = w;
      doRefSearch();
    };
  }
  async function renderChipBatch() {
    var host = $('#lx-chips');
    if (!host) return;
    if (!chipPool.length) chipPool = await fetchChipsWords();
    var pool = chipPool.slice();
    for (var i = pool.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = pool[i]; pool[i] = pool[j]; pool[j] = t;
    }
    host.innerHTML = '';
    pool.slice(0, chipCount()).forEach(function (w) {
      var c = document.createElement('button');
      c.type = 'button'; c.className = 'chip'; c.textContent = w;
      bindChip(c, w);
      host.appendChild(c);
    });
  }
  function twinkleChips() {
    var host = $('#lx-chips');
    if (!host || document.hidden) return;
    var chips = host.querySelectorAll('.chip');
    if (!chips.length) return;
    var n = Math.min(chips.length, 2 + Math.floor(Math.random() * 2));
    var idx = [];
    while (idx.length < n) {
      var k = Math.floor(Math.random() * chips.length);
      if (idx.indexOf(k) < 0) idx.push(k);
    }
    var shown = {};
    for (var s = 0; s < chips.length; s++) shown[chips[s].textContent] = true;
    idx.forEach(function (ix) {
      var el = chips[ix];
      if (!el) return;
      var cands = chipPool.filter(function (w) { return !shown[w]; });
      if (!cands.length) cands = chipPool.slice();
      if (!cands.length) return;
      var w = cands[Math.floor(Math.random() * cands.length)];
      shown[el.textContent] = false; shown[w] = true;
      el.textContent = w;
      bindChip(el, w);
    });
  }
  function startChips() {
    renderChipBatch();
    if (state.chipTimer) clearInterval(state.chipTimer);
    state.chipTimer = setInterval(twinkleChips, 3200);
  }

  // ---------- 搜索 ----------
  function syncTabs() {
    $all('#lx-searchTabs .search-tab').forEach(function (t) {
      t.classList.toggle('on', t.dataset.tab === state.tab);
    });
  }
  async function searchSongs(kw, src) {
    try {
      var res = await fetch(API + '/search?name=' + encodeURIComponent(kw) + '&source=' + src + '&page=1&type=song', { headers: authHeaders() });
      var data = await res.json();
      if (!Array.isArray(data)) return [];
      data.forEach(function (s) { if (!s.source) s.source = src; });
      return data;
    } catch (e) { return []; }
  }
  async function searchSingers(kw, src) {
    try {
      var res = await fetch(API + '/search?name=' + encodeURIComponent(kw) + '&source=' + src + '&page=1&type=singer', { headers: authHeaders() });
      var data = await res.json();
      if (!Array.isArray(data)) return [];
      return data;
    } catch (e) { return []; }
  }
  async function searchAlbums(kw, src) {
    // 专辑搜索仅wy/tx支持,kw/kg/mg回退wy
    var eff = (src === 'wy' || src === 'tx') ? src : 'wy';
    try {
      var res = await fetch(API + '/search?name=' + encodeURIComponent(kw) + '&source=' + eff + '&page=1&type=album', { headers: authHeaders() });
      var data = await res.json();
      if (!Array.isArray(data)) return { list: [], eff: eff };
      data.forEach(function (a) { if (!a.source) a.source = eff; });
      return { list: data, eff: eff };
    } catch (e) { return { list: [], eff: eff }; }
  }
  async function fetchAlbumSongs(id, src) {
    try {
      var res = await fetch(API + '/albumSongs?id=' + encodeURIComponent(id) + '&source=' + src, { headers: authHeaders() });
      var data = await res.json();
      if (data && data.error) return [];
      var list = data.list || (Array.isArray(data) ? data : []);
      list.forEach(function (s) { if (!s.source) s.source = src; });
      return list;
    } catch (e) { return []; }
  }

  var seq = 0;
  async function doRefSearch() {
    var inp = $('#lx-qInput'), out = $('#lx-searchOut');
    var kw = inp ? inp.value.trim() : '';
    state.kw = kw;
    if (!out) return;
    if (!kw) {
      state.song = []; state.singer = []; state.album = [];
      out.innerHTML = '<div class="empty">搜索' + (PLAT_NAME[curSource()] || '') + '曲库 · 歌曲、歌手、专辑</div>';
      return;
    }
    var my = ++seq;
    var src = curSource();
    out.innerHTML = '<div class="empty">正在' + (PLAT_NAME[src] || '') + '搜索中…</div>';
    var pSong = searchSongs(kw, src);
    var pSinger = searchSingers(kw, src);
    var pAl = searchAlbums(kw, src);
    var songs = await pSong;
    if (my !== seq) return;
    state.song = songs || [];
    renderTab();
    var singers = await pSinger;
    if (my !== seq) return;
    // 单曲抽歌手兜底
    if ((!singers || !singers.length) && state.song.length) {
      var seen = {}, extra = [];
      state.song.forEach(function (s) {
        String(artistOf(s)).split(/[\/、,&｜|]/).forEach(function (part) {
          var nm = String(part || '').trim();
          if (!nm || nm === '未知' || seen[nm]) return;
          seen[nm] = 1;
          extra.push({ name: nm, picUrl: coverOf(s), source: s.source || src });
        });
      });
      if (extra.length) singers = extra;
    }
    state.singer = singers || [];
    if (state.tab === 'singer') renderTab();
    var alr = await pAl;
    if (my !== seq) return;
    state.album = (alr && alr.list) || [];
    if (alr && alr.eff && alr.eff !== src && state.album.length && window.showToast) {
      try { window.showToast('info', '当前站源不支持专辑搜索，已用' + (PLAT_NAME[alr.eff] || alr.eff) + '搜索'); } catch (eT) {}
    }
    if (state.tab === 'album') renderTab();
  }

  var SRC_BADGE = { tx: ['QQ', 'qq'], wy: ['网易', 'netease'], kw: ['酷我', 'kuwo'], kg: ['酷狗', 'kugou'], mg: ['咪咕', 'migu'] };
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
  function singerRow(sg) {
    var el = document.createElement('div');
    el.className = 'singer-row';
    el.innerHTML = '<img class="singer-av" alt=""/><div class="singer-meta"><div class="singer-name"></div><div class="singer-sub"></div></div><span class="singer-arrow">›</span>';
    var img = el.querySelector('img');
    img.onerror = function () { this.onerror = null; this.src = '/music/assets/logo.svg'; };
    img.src = sg.picUrl || sg.cover || '/music/assets/logo.svg';
    el.querySelector('.singer-name').textContent = sg.name || '歌手';
    var sub = [];
    if (sg.albumSize) sub.push(sg.albumSize + ' 专辑');
    el.querySelector('.singer-sub').textContent = sub.join(' · ') || '歌手';
    el.addEventListener('click', function () {
      // 歌手页内展开:按歌手名搜歌,切到歌曲tab(不依赖旧容器)
      var nm = sg.name || '';
      searchSongs(nm, sg.source || curSource()).then(function (l) {
        state.tab = 'song'; state.song = l || []; state.kw = nm;
        var inp = $('#lx-qInput');
        if (inp) inp.value = nm;
        syncTabs(); renderTab();
      });
    });
    return el;
  }
  function albumRow(al) {
    var wrap = document.createElement('div');
    wrap.className = 'lx-album-wrap';
    var el = document.createElement('div');
    el.className = 'pl-row';
    el.innerHTML = '<img class="pl-cover" alt=""/><div class="pl-meta"><div class="pl-name"></div><div class="pl-sub"></div></div><span class="singer-arrow">›</span>';
    var img = el.querySelector('img');
    img.onerror = function () { this.onerror = null; this.src = '/music/assets/logo.svg'; };
    img.src = al.picUrl || al.cover || '/music/assets/logo.svg';
    img.loading = 'lazy';
    el.querySelector('.pl-name').textContent = al.name || '专辑';
    var sub = al.artistName || '未知歌手';
    if (al.size) sub += ' · ' + al.size + ' 首';
    el.querySelector('.pl-sub').textContent = sub;
    var opened = false, listBox = null;
    el.addEventListener('click', function () {
      opened = !opened;
      el.querySelector('.singer-arrow').textContent = opened ? '‹' : '›';
      if (!opened) { if (listBox) listBox.style.display = 'none'; return; }
      if (!listBox) {
        listBox = document.createElement('div');
        listBox.className = 'lx-album-songs';
        listBox.innerHTML = '<div class="empty" style="padding:12px">加载专辑歌曲…</div>';
        wrap.appendChild(listBox);
        var src = al.source || curSource();
        fetchAlbumSongs(al.id, src).then(function (songs) {
          listBox.innerHTML = '';
          if (!songs.length) listBox.innerHTML = '<div class="empty" style="padding:12px">暂无歌曲</div>';
          songs.forEach(function (s) { listBox.appendChild(songRow(s, songs)); });
        });
      } else {
        listBox.style.display = '';
      }
    });
    wrap.appendChild(el);
    return wrap;
  }

  function renderTab() {
    var out = $('#lx-searchOut');
    if (!out) return;
    out.innerHTML = '';
    var kw = state.kw;
    if (!kw) {
      out.innerHTML = '<div class="empty">搜索' + (PLAT_NAME[curSource()] || '') + '曲库 · 歌曲、歌手、歌单</div>';
      return;
    }
    if (state.tab === 'song') {
      if (!state.song.length) { out.innerHTML = '<div class="empty">在' + (PLAT_NAME[curSource()] || '') + '没有找到相关歌曲</div>'; return; }
      var c1 = document.createElement('div');
      c1.className = 'search-count';
      c1.textContent = (PLAT_NAME[curSource()] || '') + ' · 找到 ' + state.song.length + ' 首歌曲';
      out.appendChild(c1);
      state.song.forEach(function (s) { out.appendChild(songRow(s, state.song)); });
    } else if (state.tab === 'singer') {
      if (!state.singer.length) { out.innerHTML = '<div class="empty">在' + (PLAT_NAME[curSource()] || '') + '没有找到相关歌手</div>'; return; }
      var c2 = document.createElement('div');
      c2.className = 'search-count';
      c2.textContent = (PLAT_NAME[curSource()] || '') + ' · 找到 ' + state.singer.length + ' 位歌手';
      out.appendChild(c2);
      state.singer.forEach(function (s) { out.appendChild(singerRow(s)); });
    } else {
      if (!state.album.length) { out.innerHTML = '<div class="empty">在' + (PLAT_NAME[curSource()] || '') + '没有找到相关专辑</div>'; return; }
      var c3 = document.createElement('div');
      c3.className = 'search-count';
      c3.textContent = (PLAT_NAME[curSource()] || '') + ' · 找到 ' + state.album.length + ' 张专辑';
      out.appendChild(c3);
      state.album.forEach(function (a) { out.appendChild(albumRow(a)); });
    }
  }

  var SRC_CHIPS = [
    { id: 'tx', name: 'QQ' },
    { id: 'wy', name: '网易' },
    { id: 'kw', name: '酷我' },
    { id: 'kg', name: '酷狗' },
    { id: 'mg', name: '咪咕' }
  ];
  function renderSrcChips() {
    var wrap = $('#lx-srcChips');
    if (!wrap) return;
    var cur = curSource();
    wrap.innerHTML = '';
    SRC_CHIPS.forEach(function (p) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'lx-tag' + (p.id === cur ? ' on' : '');
      b.textContent = p.name;
      b.addEventListener('click', function () {
        try {
          var sel = document.getElementById('search-source');
          if (sel) sel.value = p.id;
          localStorage.setItem('search-source', p.id);
        } catch (e) {}
        renderSrcChips();
        chipPool = []; renderChipBatch();
        if (window.LxRefHome) {
          try { window.LxRefHome.syncPlatBtn(); window.LxRefHome.renderPlatMenu(); } catch (e2) {}
        }
        if (state.kw) doRefSearch();
        else renderTab();
      });
      wrap.appendChild(b);
    });
  }
  function hideLegacySearchUI() {
    // 藏原搜索输入行 + 原结果区/分页(保留DOM供逻辑读值,ref块自带输入+结果)
    try {
      var scope = document.querySelector('#view-search .ref-search-scope');
      if (!scope) return;
      var kids = scope.children;
      // 第一个flex-col块=原输入行
      for (var i = 0; i < kids.length; i++) {
        var k = kids[i];
        if (k.classList && k.classList.contains('flex-col') && !k.classList.contains('ref-search-extra')) {
          k.style.display = 'none';
        }
      }
      var legacy = document.getElementById('search-results');
      if (legacy) legacy.style.display = 'none';
      var pag = document.getElementById('search-pagination-bar');
      if (pag) pag.style.display = 'none';
      var head = document.getElementById('search-results-header');
      if (head) head.style.display = 'none';
      var batch = document.getElementById('batch-toolbar');
      if (batch) batch.style.display = 'none';
    } catch (e) {}
  }
  function bindAll() {
    var inp = $('#lx-qInput');
    if (inp) inp.addEventListener('keypress', function (e) { if (e.key === 'Enter') doRefSearch(); });
    var btn = $('#lx-searchBtn');
    if (btn) btn.addEventListener('click', doRefSearch);
    $all('#lx-searchTabs .search-tab').forEach(function (t) {
      t.addEventListener('click', function () {
        state.tab = t.dataset.tab || 'song';
        syncTabs(); renderTab();
      });
    });
  }

  window.LxRefSearch = {
    doSearch: doRefSearch,
    renderTab: renderTab,
    refreshChips: function () { chipPool = []; renderChipBatch(); },
    setTab: function (t) { state.tab = t; syncTabs(); renderTab(); }
  };

  document.addEventListener('DOMContentLoaded', function () {
    bindAll(); syncTabs(); renderSrcChips(); hideLegacySearchUI(); startChips();
  });
})();
