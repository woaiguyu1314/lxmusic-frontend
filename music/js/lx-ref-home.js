// ============================================================
// lx-ref-home.js — 参考页风格首页(现在就听)数据桥
// 数据源: 洛雪后端 /api,样式: ref-ui.css(参考页原样)
// 定稿: 第1-4轮(grill-me)——双卡/推荐/热门/歌单横滑/榜单横滑/站源切换
// ============================================================
(function () {
  'use strict';

  var API = '/api/music';
  var PLAT_MAP = { qq: 'tx', netease: 'wy', kuwo: 'kw', kugou: 'kg', migu: 'mg' }; // 参考页id -> 洛雪source
  var PLAT_BACK = { tx: 'qq', wy: 'netease', kw: 'kuwo', kg: 'kugou', mg: 'migu' }; // 洛雪source -> 参考页id
  var PLAT_NAME = { tx: 'QQ', wy: '网易', kw: '酷我', kg: '酷狗', mg: '咪咕' };
  var PLAT_ACCENT = { qq: '#31c27c', netease: '#ec4141', kuwo: '#ff6a00', kugou: '#2ca2f9', migu: '#ed4141' };

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
      // 跟随洛雪搜索源选择,回退默认
      var el = document.getElementById('search-source');
      if (el && el.value && PLAT_BACK[el.value]) return el.value;
      var s = localStorage.getItem('search-source');
      if (s && PLAT_BACK[s]) return s;
    } catch (e) {}
    return 'wy';
  }
  function refPlat() { return PLAT_BACK[curSource()] || 'netease'; }
  function coverOf(song) {
    try {
      if (typeof getImgUrl === 'function') {
        var u = getImgUrl(song);
        if (u) return u;
      }
    } catch (e) {}
    return (song && (song.img || (song.meta && song.meta.picUrl))) || '/music/assets/logo.svg';
  }
  function artistOf(song) {
    return (song && (song.singer || song.artistName || song.artist)) || '未知';
  }
  // 一人最多2首去重混排
  function dedupMix(lists, max) {
    var seen = {}, aCnt = {}, out = [];
    (lists || []).forEach(function (arr) {
      (arr || []).forEach(function (s) {
        if (!s || out.length >= (max || 40)) return;
        var id = String(s.id || s.songmid || '');
        if (!id || seen[id]) return;
        var a = String(artistOf(s)).split(/[\/、,&|｜]/)[0].trim().toLowerCase();
        if (a && (aCnt[a] || 0) >= 2) return;
        seen[id] = 1;
        if (a) aCnt[a] = (aCnt[a] || 0) + 1;
        out.push(s);
      });
    });
    // 洗牌
    for (var i = out.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = out[i]; out[i] = out[j]; out[j] = t;
    }
    return out;
  }

  async function apiSearch(kw, source, type) {
    try {
      var res = await fetch(API + '/search?name=' + encodeURIComponent(kw) + '&source=' + source + '&page=1&type=' + (type || 'song'), { headers: authHeaders() });
      var data = await res.json();
      if (!data || data.error) return [];
      var list = Array.isArray(data) ? data : (data.list || []);
      // 补 source
      list.forEach(function (s) { if (!s.source) s.source = source; });
      return list;
    } catch (e) { return []; }
  }
  async function apiBoards(source) {
    try {
      var res = await fetch(API + '/leaderboard/boards?source=' + source, { headers: authHeaders() });
      var data = await res.json();
      if (!data || data.error) return [];
      return data.list || [];
    } catch (e) { return []; }
  }
  async function apiBoardSongs(source, bangid) {
    try {
      var res = await fetch(API + '/leaderboard/list?source=' + source + '&bangid=' + encodeURIComponent(bangid) + '&page=1', { headers: authHeaders() });
      var data = await res.json();
      if (!data || data.error) return [];
      return data.list || [];
    } catch (e) { return []; }
  }
  async function apiSongLists(source, tagId, sortId) {
    try {
      var url = API + '/songList/list?source=' + source + '&tagId=' + encodeURIComponent(tagId || '') + '&sortId=' + encodeURIComponent(sortId || '') + '&page=1';
      var res = await fetch(url, { headers: authHeaders() });
      var data = await res.json();
      if (!data || data.error) return [];
      return data.list || [];
    } catch (e) { return []; }
  }
  async function apiHotTags(source) {
    try {
      var res = await fetch(API + '/songList/tags?source=' + source, { headers: authHeaders() });
      var data = await res.json();
      if (!data || data.error) return { hotTags: [], sortList: [] };
      return data;
    } catch (e) { return { hotTags: [], sortList: [] }; }
  }

  // ---------------- 双卡 ----------------
  var duoState = { guess: [], radar: [], gi: 0, ri: 0, timer: null };
  var DUO_KWS = ['流行', '华语热歌', '民谣', '摇滚', '情歌', '经典老歌', '新歌', '轻音乐', '说唱', '电子'];

  function paintDuo(kind, song, fade) {
    var isG = kind === 'guess';
    var title = $(isG ? '#lx-guessTitle' : '#lx-radarTitle');
    var sub = $(isG ? '#lx-guessSub' : '#lx-radarSub');
    var imgA = $(isG ? '#lx-guessImg' : '#lx-radarImg');
    var imgB = $(isG ? '#lx-guessImgB' : '#lx-radarImgB');
    if (!title) return;
    if (!song) {
      title.textContent = '暂无推荐';
      if (sub) sub.textContent = '';
      if (imgA) { imgA.src = '/music/assets/logo.svg'; imgA.classList.add('on'); }
      if (imgB) imgB.classList.remove('on');
      return;
    }
    title.textContent = song.name || '—';
    if (sub) sub.textContent = artistOf(song);
    var card = $('#lx-guessCard');
    if (card && isG) card.setAttribute('data-plat', refPlat());
    var cover = coverOf(song);
    if (fade && imgA && imgB) {
      var front = duoState[isG ? 'gFlip' : 'rFlip'] ? imgB : imgA;
      var back = duoState[isG ? 'gFlip' : 'rFlip'] ? imgA : imgB;
      back.onerror = function () { this.onerror = null; this.src = '/music/assets/logo.svg'; };
      back.src = cover;
      try { void back.offsetWidth; } catch (e) {}
      back.classList.add('on');
      if (front) front.classList.remove('on');
      duoState[isG ? 'gFlip' : 'rFlip'] = !duoState[isG ? 'gFlip' : 'rFlip'];
    } else if (imgA) {
      imgA.onerror = function () { this.onerror = null; this.src = '/music/assets/logo.svg'; };
      imgA.src = cover;
      imgA.classList.add('on');
      if (imgB) { imgB.classList.remove('on'); imgB.removeAttribute('src'); }
    }
  }

  async function loadDuo() {
    var src = curSource();
    paintDuo('guess', null); paintDuo('radar', null);
    var gt = $('#lx-guessTitle'), rt = $('#lx-radarTitle');
    if (gt) gt.textContent = '加载中…';
    if (rt) rt.textContent = '加载中…';
    // 历史/收藏优先
    var hist = [];
    try {
      if (window.currentListData) {
        hist = hist.concat(window.currentListData.loveList || []).concat(window.currentListData.defaultList || []);
      }
    } catch (e) {}
    var kws = DUO_KWS.slice();
    for (var i = kws.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = kws[i]; kws[i] = kws[j]; kws[j] = t;
    }
    var packs = await Promise.all(kws.slice(0, 5).map(function (k) { return apiSearch(k, src); }));
    var pool = dedupMix([hist].concat(packs), 40);
    if (!pool.length) { paintDuo('guess', null); paintDuo('radar', null); return; }
    // 两卡互斥
    var gi = Math.floor(Math.random() * pool.length), g = pool[gi];
    var rest = pool.filter(function (s) { return String(s.id || s.songmid) !== String(g.id || g.songmid); });
    var r = rest.length ? rest[Math.floor(Math.random() * rest.length)] : g;
    duoState.guess = pool; duoState.radar = rest.length ? rest : pool;
    paintDuo('guess', g); paintDuo('radar', r);
    // 8s 轮播
    if (duoState.timer) clearInterval(duoState.timer);
    duoState.timer = setInterval(function () {
      if (document.hidden || !duoState.guess.length) return;
      var ng = duoState.guess[Math.floor(Math.random() * duoState.guess.length)];
      var nr = duoState.radar[Math.floor(Math.random() * duoState.radar.length)];
      // 当前卡展示歌存起来供点击播放
      duoState.curGuess = ng; duoState.curRadar = nr;
      paintDuo('guess', ng, true); paintDuo('radar', nr, true);
    }, 8000);
    duoState.curGuess = g; duoState.curRadar = r;
  }

  function bindDuoClick() {
    var gc = $('#lx-guessCard'), rc = $('#lx-radarCard');
    if (gc) gc.addEventListener('click', function () {
      var s = duoState.curGuess;
      if (s) { if (typeof window.playSongFromList === 'function') window.playSongFromList(s, duoState.guess); else if (typeof playSong === 'function') playSong(s, Math.max(0, duoState.guess.indexOf(s))); }
    });
    if (rc) rc.addEventListener('click', function () {
      var s = duoState.curRadar;
      if (s) { if (typeof window.playSongFromList === 'function') window.playSongFromList(s, duoState.radar); else if (typeof playSong === 'function') playSong(s, Math.max(0, duoState.radar.indexOf(s))); }
    });
  }

  // ---------------- 为你推荐 ----------------
  var recPool = [];
  function albumCard(song, list) {
    var el = document.createElement('div');
    el.className = 'album';
    el.innerHTML = '<img class="album-art" alt=""/><div class="album-name"></div><div class="album-artist"></div>';
    var img = el.querySelector('.album-art');
    img.onerror = function () { this.onerror = null; this.src = '/music/assets/logo.svg'; };
    img.src = coverOf(song);
    img.loading = 'lazy';
    el.querySelector('.album-name').textContent = song.name || '未知';
    el.querySelector('.album-artist').textContent = artistOf(song);
    el.addEventListener('click', function () {
      if (typeof window.playSongFromList === 'function') window.playSongFromList(song, list); else if (typeof playSong === 'function') playSong(song, Math.max(0, (list || []).indexOf(song)));
    });
    return el;
  }
  async function loadRec() {
    var row = $('#lx-recRow');
    var src = curSource();
    if (row) row.innerHTML = '<div class="empty" style="padding:16px;font-size:13px">加载推荐…</div>';
    // 取飙升/热歌榜混排
    var boards = await apiBoards(src);
    var songs = [];
    for (var i = 0; i < Math.min(3, boards.length); i++) {
      var l = await apiBoardSongs(src, boards[i].bangid);
      songs = songs.concat(l || []);
    }
    recPool = dedupMix([songs], 60);
    var show = recPool.slice(0, 24);
    if (row) {
      row.innerHTML = '';
      if (!show.length) row.innerHTML = '<div class="empty" style="padding:16px;font-size:13px">暂无推荐</div>';
      show.forEach(function (s) { row.appendChild(albumCard(s, show)); });
    }
  }
  function bindRecRefresh() {
    var btn = $('#lx-btnRecRefresh');
    if (btn) btn.addEventListener('click', function () {
      var row = $('#lx-recRow');
      if (!recPool.length || !row) return;
      var show = recPool.slice().sort(function () { return Math.random() - 0.5; }).slice(0, 24);
      row.innerHTML = '';
      show.forEach(function (s) { row.appendChild(albumCard(s, show)); });
      if (typeof showToast === 'function') showToast('已换一批 · ' + show.length + ' 首');
      else if (window.showToast) window.showToast('info', '已换一批');
    });
  }

  // ---------------- 热门歌曲 ----------------
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
      if (e.target.closest('.song-more')) { openSongSheet(song, list); return; }
      if (typeof window.playSongFromList === 'function') window.playSongFromList(song, list); else if (typeof playSong === 'function') playSong(song, Math.max(0, (list || []).indexOf(song)));
    });
    return el;
  }
  // ··· bottom sheet: 播放/下载/喜欢
  function openSongSheet(song, list) {
    var mask = $('#lx-sheetMask'), body = $('#lx-sheetBody'), title = $('#lx-sheetTitle');
    if (!mask || !body) return;
    if (title) title.textContent = (song.name || '') + ' — ' + artistOf(song);
    body.innerHTML = '';
    var items = [
      { t: '播放', fn: function () { if (typeof window.playSongFromList === 'function') window.playSongFromList(song, list); else if (typeof playSong === 'function') playSong(song, Math.max(0, (list || []).indexOf(song))); } },
      { t: '下载', fn: function () { if (typeof window.downloadSong === 'function') window.downloadSong(song); } },
      { t: '喜欢♥', fn: function () { toggleLoveSong(song); } }
    ];
    items.forEach(function (it) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'lx-sheet-item'; b.textContent = it.t;
      b.addEventListener('click', function () { closeSongSheet(); it.fn(); });
      body.appendChild(b);
    });
    mask.classList.add('open');
  }
  function closeSongSheet() {
    var mask = $('#lx-sheetMask');
    if (mask) mask.classList.remove('open');
  }
  function bindSheet() {
    var mask = $('#lx-sheetMask');
    if (mask) mask.addEventListener('click', function (e) { if (e.target === mask) closeSongSheet(); });
  }
  // 按行歌曲收藏进 loveList(我的喜爱)
  async function toggleLoveSong(song) {
    try {
      var isLogin = (typeof isUserLoggedIn === 'function') ? isUserLoggedIn() : false;
      var data = isLogin ? (window.myPersonalListData || window.currentListData) : window.currentListData;
      if (!data || !data.loveList) { if (window.showToast) window.showToast('info', '收藏列表未就绪'); return; }
      var fid = null;
      try {
        if (typeof formatSongToLxMusicStandard === 'function') {
          var f = formatSongToLxMusicStandard(song);
          if (f) { song = f; fid = f.id; }
        }
      } catch (e) {}
      var targetId = fid || song.id || song.songmid;
      var idx = data.loveList.findIndex(function (s) { return String(s.id) === String(targetId) || String(s.id) === String(song.id); });
      if (idx >= 0) {
        data.loveList.splice(idx, 1);
        if (window.showToast) window.showToast('success', '已取消喜欢');
      } else {
        if (typeof addMusicByConfiguredLocation === 'function') addMusicByConfiguredLocation(data.loveList, song);
        else data.loveList.unshift(song);
        if (window.showToast) window.showToast('success', '已加入喜欢的音乐');
      }
      if (typeof pushDataChange === 'function') await pushDataChange(data);
      if (typeof updatePlayerInfo === 'function' && window.currentPlayingSong) updatePlayerInfo(window.currentPlayingSong);
    } catch (e) { console.warn('[lx-ref] toggleLoveSong', e); }
  }

  async function loadHot() {
    var box = $('#lx-hotList');
    var src = curSource();
    if (box) box.innerHTML = '<div class="empty" style="padding:16px;font-size:13px">加载热门…</div>';
    var boards = await apiBoards(src);
    var songs = [];
    if (boards.length) {
      // 第一个榜(通常飙升/热歌)前12
      var l = await apiBoardSongs(src, boards[0].bangid);
      songs = (l || []).slice(0, 12);
    }
    if (box) {
      box.innerHTML = '';
      if (!songs.length) box.innerHTML = '<div class="empty" style="padding:16px;font-size:13px">暂无热门</div>';
      songs.forEach(function (s) { box.appendChild(songRow(s, songs)); });
    }
  }

  // ---------------- 歌单区 ----------------
  var homePlCache = [];
  async function loadHomeTags() {
    var wrap = $('#lx-plTags');
    var src = curSource();
    if (!wrap) return '';
    var info = await apiHotTags(src);
    var tags = info.hotTags || [];
    var sortId = (info.sortList && info.sortList[0] && info.sortList[0].id) || '';
    wrap.innerHTML = '';
    tags.slice(0, 8).forEach(function (tag, i) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'lx-tag' + (i === 0 ? ' on' : '');
      b.textContent = tag.name;
      b.dataset.tagId = tag.id;
      b.dataset.sortId = sortId;
      b.addEventListener('click', function () {
        $all('.lx-tag', wrap).forEach(function (x) { x.classList.remove('on'); });
        b.classList.add('on');
        loadHomePlaylists(tag.id, sortId);
      });
      wrap.appendChild(b);
    });
    return tags.length ? String(tags[0].id) : '';
  }
  function plCard(pl) {
    var el = document.createElement('div');
    el.className = 'pl-card lx-hcard';
    el.innerHTML = '<img class="pl-card-cover" alt=""/><div class="pl-card-name"></div><div class="pl-card-src"></div>';
    var img = el.querySelector('img');
    img.referrerPolicy = 'no-referrer';
    img.onerror = function () { this.onerror = null; this.src = '/music/assets/logo.svg'; };
    img.src = pl.img || pl.cover || '/music/assets/logo.svg';
    img.loading = 'lazy';
    el.querySelector('.pl-card-name').textContent = pl.name || '歌单';
    var cnt = pl.play_count || pl.playCount || '';
    el.querySelector('.pl-card-src').textContent = (PLAT_NAME[pl.source] || pl.source || '') + (cnt ? ' · ' + cnt : '');
    el.addEventListener('click', function () {
      if (window.SongListManager && window.SongListManager.openDetail) {
        window.SongListManager.openDetail(pl.id, pl.source || curSource());
      }
    });
    return el;
  }
  async function loadHomePlaylists(tagId, sortId) {
    var box = $('#lx-homePlGrid');
    var src = curSource();
    if (box) box.innerHTML = '<div class="empty" style="padding:20px;font-size:13px">加载歌单…</div>';
    var list = await apiSongLists(src, tagId || '', sortId || '');
    homePlCache = list || [];
    if (box) {
      box.innerHTML = '';
      if (!homePlCache.length) box.innerHTML = '<div class="empty" style="padding:20px;font-size:13px">暂无歌单</div>';
      homePlCache.forEach(function (pl) { box.appendChild(plCard(pl)); });
    }
  }

  // ---------------- 精品榜单 ----------------
  function rankCard(board) {
    var el = document.createElement('div');
    el.className = 'rank-card lx-hcard';
    el.innerHTML = '<div class="rank-cover"><img alt=""/><div class="rank-on-cover"></div></div><div class="rank-name"></div>';
    var img = el.querySelector('img');
    img.onerror = function () { this.onerror = null; this.src = '/music/assets/logo.svg'; };
    img.loading = 'lazy';
    img.dataset.bangid = board.bangid;
    img.dataset.source = board.source || curSource();
    img.src = '/music/assets/logo.svg';
    // 懒加载封面: 可见即取第一首歌封面
    try {
      if ('IntersectionObserver' in window) {
        var ob = new IntersectionObserver(function (es) {
          es.forEach(function (en) {
            if (en.isIntersecting) {
              ob.disconnect();
              apiBoardSongs(img.dataset.source, img.dataset.bangid).then(function (l) {
                if (l && l[0]) { var c = coverOf(l[0]); if (c && c.indexOf('logo.svg') < 0) img.src = c; }
              });
            }
          });
        });
        ob.observe(el);
      } else {
        apiBoardSongs(board.source || curSource(), board.bangid).then(function (l) {
          if (l && l[0]) { var c = coverOf(l[0]); if (c && c.indexOf('logo.svg') < 0) img.src = c; }
        });
      }
    } catch (e) {}
    el.querySelector('.rank-on-cover').textContent = board.name || '榜单';
    el.querySelector('.rank-name').textContent = board.name || '榜单';
    el.addEventListener('click', function () { openRankDetail(board); });
    return el;
  }
  async function loadHomeRanks() {
    var box = $('#lx-homeRankGrid');
    var src = curSource();
    if (box) box.innerHTML = '<div class="empty" style="padding:16px;font-size:13px">加载' + (PLAT_NAME[src] || '') + '榜单…</div>';
    var boards = await apiBoards(src);
    boards.forEach(function (b) { if (!b.source) b.source = src; });
    if (box) {
      box.innerHTML = '';
      if (!boards.length) box.innerHTML = '<div class="empty" style="padding:16px;font-size:13px">榜单暂不可用</div>';
      boards.forEach(function (b) { box.appendChild(rankCard(b)); });
    }
  }

  // ---------------- 沉浸榜单详情 ----------------
  function openRankDetail(board) {
    var dp = $('#lx-rankDetail');
    if (!dp) return;
    var src = board.source || curSource();
    $('#lx-rankTitle').textContent = board.name || '榜单';
    $('#lx-rankTopTitle').textContent = board.name || '榜单';
    $('#lx-rankSub').textContent = (PLAT_NAME[src] || '') + ' · 加载中…';
    $('#lx-rankDesc').textContent = '';
    $('#lx-rankHeroImg').removeAttribute('src');
    $('#lx-rankSongList').innerHTML = '<div class="detail-load-tip" style="padding:36px 12px">加载歌曲…</div>';
    dp.classList.add('open');
    dp.setAttribute('aria-hidden', 'false');
    try { document.documentElement.classList.add('lx-rank-open'); } catch (e) {}
    apiBoardSongs(src, board.bangid).then(function (songs) {
      songs = songs || [];
      $('#lx-rankSub').textContent = (PLAT_NAME[src] || '') + ' · 共 ' + songs.length + ' 首';
      if (songs[0]) {
        var c = coverOf(songs[0]);
        if (c && c.indexOf('logo.svg') < 0) {
          $('#lx-rankHeroImg').src = c;
          $('#lx-rankWallAmb').style.backgroundImage = 'url("' + c + '")';
          $('#lx-rankWallAmb').classList.add('on');
        }
      }
      var box = $('#lx-rankSongList');
      box.innerHTML = '';
      if (!songs.length) box.innerHTML = '<div class="detail-load-tip" style="padding:40px 12px">暂无歌曲</div>';
      songs.forEach(function (s, i) {
        var row = document.createElement('div');
        row.className = 'detail-song-row';
        row.innerHTML = '<div class="detail-song-idx">' + (i + 1) + '</div>' +
          '<img class="detail-song-art" alt=""/>' +
          '<div class="detail-song-meta"><div class="detail-song-name"></div><div class="detail-song-sub"></div></div>';
        var art = row.querySelector('img');
        art.onerror = function () { this.onerror = null; this.src = '/music/assets/logo.svg'; };
        art.src = coverOf(s);
        art.loading = 'lazy';
        row.querySelector('.detail-song-name').textContent = s.name || '未知';
        row.querySelector('.detail-song-sub').textContent = artistOf(s);
        row.addEventListener('click', function () {
          if (typeof window.playSongFromList === 'function') window.playSongFromList(s, songs); else if (typeof playSong === 'function') playSong(s, Math.max(0, songs.indexOf(s)));
        });
        box.appendChild(row);
      });
      // 播放全部/随机/♥
      var pa = $('#lx-rankPlayAll');
      if (pa) pa.onclick = function () { if (songs.length) { if (typeof window.playSongFromList === 'function') window.playSongFromList(songs[0], songs); else if (typeof playSong === 'function') playSong(songs[0], 0); } };
      var sh = $('#lx-rankShuffle');
      if (sh) sh.onclick = function () {
        if (!songs.length) return;
        var i = Math.floor(Math.random() * songs.length);
        if (typeof window.playSongFromList === 'function') window.playSongFromList(songs[i], songs); else if (typeof playSong === 'function') playSong(songs[i], i);
      };
      var fav = $('#lx-rankFav');
      if (fav) fav.onclick = function () {
        (songs || []).forEach(function (s) { toggleLoveSongSilent(s); });
        if (window.showToast) window.showToast('success', '已收藏整榜 ' + songs.length + ' 首');
      };
    });
  }
  async function toggleLoveSongSilent(song) {
    try {
      var data = window.currentListData;
      if (!data || !data.loveList) return;
      var f = song;
      try { if (typeof formatSongToLxMusicStandard === 'function') { var t = formatSongToLxMusicStandard(song); if (t) f = t; } } catch (e) {}
      var tid = f.id || song.id || song.songmid;
      var idx = data.loveList.findIndex(function (s) { return String(s.id) === String(tid); });
      if (idx < 0) {
        if (typeof addMusicByConfiguredLocation === 'function') addMusicByConfiguredLocation(data.loveList, f);
        else data.loveList.unshift(f);
      }
      if (typeof pushDataChange === 'function') await pushDataChange(data);
    } catch (e) {}
  }
  function bindRankDetail() {
    var back = $('#lx-rankBackBtn');
    if (back) back.addEventListener('click', function () {
      var dp = $('#lx-rankDetail');
      if (dp) { dp.classList.remove('open'); dp.setAttribute('aria-hidden', 'true'); }
      try { document.documentElement.classList.remove('lx-rank-open'); } catch (e) {}
    });
  }

  // ---------------- 站源切换 ----------------
  var PLATS = [
    { id: 'qq', name: 'QQ', src: 'tx' },
    { id: 'netease', name: '网易', src: 'wy' },
    { id: 'kuwo', name: '酷我', src: 'kw' },
    { id: 'kugou', name: '酷狗', src: 'kg' },
    { id: 'migu', name: '咪咕', src: 'mg' }
  ];
  function syncPlatBtn() {
    var rp = refPlat();
    var name = $('#lx-platName'), btn = $('#lx-btnPlat');
    var p = PLATS.filter(function (x) { return x.id === rp; })[0];
    if (name) name.textContent = (p && p.name) || 'QQ';
    if (btn) {
      btn.setAttribute('data-plat', rp);
      btn.style.setProperty('--plat-accent', PLAT_ACCENT[rp] || '#8e8e93');
      var caret = btn.querySelector('.plat-caret');
      if (caret) caret.style.color = PLAT_ACCENT[rp] || '#8e8e93';
    }
    var gc = $('#lx-guessCard');
    if (gc) gc.setAttribute('data-plat', rp);
  }
  function renderPlatMenu() {
    var menu = $('#lx-platMenu');
    if (!menu) return;
    menu.innerHTML = '';
    PLATS.forEach(function (p) {
      var b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('data-plat', p.id);
      if (refPlat() === p.id) b.className = 'on';
      b.innerHTML = '<span>' + p.name + '</span>';
      b.addEventListener('click', function (e) {
        e.stopPropagation();
        // 写回洛雪源
        try {
          var sel = document.getElementById('search-source');
          if (sel) sel.value = p.src;
          localStorage.setItem('search-source', p.src);
          // 榜单/歌单源选择器若存在也同步
          var lb = document.getElementById('lb-source-select');
          if (lb) { lb.value = p.src; if (typeof changeLeaderboardSource === 'function') changeLeaderboardSource(); }
          var sl = document.getElementById('songlist-source');
          if (sl) { sl.value = p.src; if (window.SongListManager && window.SongListManager.changeSource) window.SongListManager.changeSource(p.src); }
        } catch (e2) {}
        syncPlatBtn(); renderPlatMenu(); closePlatMenu();
        refreshAll();
      });
      menu.appendChild(b);
    });
  }
  function closePlatMenu() {
    var menu = $('#lx-platMenu');
    if (menu) menu.classList.remove('open');
  }
  function bindPlat() {
    var btn = $('#lx-btnPlat');
    if (btn) btn.addEventListener('click', function (e) {
      e.stopPropagation();
      var menu = $('#lx-platMenu');
      if (menu) menu.classList.toggle('open');
    });
    document.addEventListener('click', function () { closePlatMenu(); });
  }

  // ---------------- 总刷新 ----------------
  async function refreshAll() {
    syncPlatBtn();
    try { await loadDuo(); } catch (e) {}
    try { await loadRec(); } catch (e) {}
    try { await loadHot(); } catch (e) {}
    try {
      var firstTag = await loadHomeTags();
      var wrap = $('#lx-plTags');
      var sortId = '';
      try { var on = wrap ? wrap.querySelector('.lx-tag.on') : null; sortId = on ? on.dataset.sortId : ''; } catch (e2) {}
      await loadHomePlaylists(firstTag, sortId);
    } catch (e) {}
    try { await loadHomeRanks(); } catch (e) {}
  }

  window.LxRefHome = {
    refreshAll: refreshAll,
    syncPlatBtn: syncPlatBtn,
    renderPlatMenu: renderPlatMenu,
    openRankDetail: openRankDetail,
    openSongSheet: openSongSheet,
    toggleLoveSong: toggleLoveSong
  };

  document.addEventListener('DOMContentLoaded', function () {
    bindDuoClick(); bindRecRefresh(); bindSheet(); bindRankDetail(); bindPlat();
    renderPlatMenu(); syncPlatBtn();
    // 延迟加载,等洛雪主逻辑就绪
    setTimeout(function () { refreshAll(); }, 800);
  });
})();
