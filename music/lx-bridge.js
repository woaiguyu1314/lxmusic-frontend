/* lx-bridge.js — 参考页数据桥：把直连第三方接口换成洛雪后端 /api
 * 平台映射：参考页 qq/netease/kuwo/kugou/migu(+bilibili隐藏) <-> 洛雪 tx/wy/kw/kg/mg
 * 收藏走后端 /api/user/list + /api/music/user/list/{add,remove}（id 用洛雪 source_songId 格式）
 * 播放走 POST /api/music/url；歌词走 /api/music/lyric；下载走 /api/music/download?url
 * 用法：在参考页主 <script> 之后引入：<script src="lx-bridge.js"></script>
 */
(function () {
  'use strict';

  /* ---------- 平台映射 ---------- */
  var REF2LX = { qq: 'tx', netease: 'wy', kuwo: 'kw', kugou: 'kg', migu: 'mg' };
  var LX2REF = { tx: 'qq', wy: 'netease', kw: 'kuwo', kg: 'kugou', mg: 'migu' };

  function refPlat() {
    try {
      var p = String((window.AQ && window.AQ.S && window.AQ.S.platform) || 'qq').toLowerCase();
      if (p === 'tx' || p === 'wy' || p === 'kw' || p === 'kg' || p === 'mg') return LX2REF[p];
      if (p === 'bilibili' || p === 'bili') return 'qq'; // B站隐藏后回退QQ
      return REF2LX[p] ? p : 'qq';
    } catch (e) { return 'qq'; }
  }
  function lxSource() { return REF2LX[refPlat()] || 'tx'; }

  function authHeaders(extra) {
    var h = Object.assign({}, extra || {});
    try {
      if (typeof getUserAuthHeaders === 'function') Object.assign(h, getUserAuthHeaders());
    } catch (e) {}
    try {
      if (typeof authToken !== 'undefined' && authToken && !h['x-user-token']) h['x-user-token'] = authToken;
    } catch (e2) {}
    try {
      var u = localStorage.getItem('lx_sync_user');
      var t = localStorage.getItem('lx_user_token');
      if (u && u !== '_open' && !h['x-user-name']) h['x-user-name'] = u;
      if (t && !h['x-user-token']) h['x-user-token'] = t;
    } catch (e3) {}
    return h;
  }

  async function getJSON(url, opts) {
    var res = await fetch(url, opts);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res.json();
  }

  /* ---------- 洛雪歌曲 -> 参考页歌曲 ----------
   * 洛雪收藏用 id=`source_songId`；播放/歌词要各平台原始字段，原样保留在 _lx */
  function mapSong(s, fallbackLX) {
    if (!s) return null;
    var srcLX = s.source || fallbackLX || 'tx';
    var srcRef = LX2REF[srcLX] || 'qq';
    var rawId = s.songmid || s.songId || s.hash || s.copyrightId || s.mid || s.mediaMid || s.id;
    if (rawId == null || rawId === '') return null;
    var name = s.name || s.title || s.songname;
    if (!name) return null;
    var rawStr = String(rawId);
    var cover = s.img || s.cover || s.picUrl || s.pic || s.albumPic ||
      (s.album && (s.album.picUrl || s.album.cover)) || '';
    var lx = {
      id: s.id || (srcLX + '_' + rawStr),
      name: name,
      singer: s.singer || s.artistName || s.artist || '未知',
      source: srcLX,
      interval: s.interval || 0,
      songmid: s.songmid || rawStr,
      songId: s.songId,
      hash: s.hash,
      copyrightId: s.copyrightId,
      strMediaMid: s.strMediaMid,
      albumMid: s.albumMid,
      albumId: s.albumId,
      lrcUrl: s.lrcUrl, mrcUrl: s.mrcUrl, trcUrl: s.trcUrl,
      img: cover,
      types: s.types, _types: s._types,
      meta: s.meta || undefined
    };
    return {
      name: name,
      artist: lx.singer,
      songmid: rawStr,
      id: rawStr,
      albummid: s.albumMid || s.albumId || s.albummid || '',
      album: s.albumName || (typeof s.album === 'string' ? s.album : '') || '',
      cover: cover || '',
      interval: s.interval || 0,
      source: srcRef,
      hash: s.hash || undefined,
      copyrightId: s.copyrightId || undefined,
      songId: s.songId || undefined,
      strMediaMid: s.strMediaMid || undefined,
      albumMid: s.albumMid || undefined,
      lrcUrl: s.lrcUrl || undefined,
      mrcUrl: s.mrcUrl || undefined,
      trcUrl: s.trcUrl || undefined,
      albumId: s.albumId || undefined,
      _lx: lx
    };
  }

  /* 参考页歌曲 -> 洛雪收藏 musicInfo（带 source_songId 的 id） */
  function toLxMusic(song) {
    if (song._lx) {
      var lx = Object.assign({}, song._lx);
      if (!lx.id) {
        var src = lx.source || REF2LX[song.source] || 'tx';
        var rid = lx.songmid || lx.songId || song.songmid || song.id;
        lx.id = src + '_' + rid;
        lx.source = src;
      }
      if (!lx.name) lx.name = song.name;
      if (!lx.singer) lx.singer = song.artist;
      if (!lx.img && song.cover) lx.img = song.cover;
      return lx;
    }
    var srcLX = REF2LX[song.source] || 'tx';
    var rid2 = song.songmid || song.id;
    return {
      id: srcLX + '_' + rid2,
      name: song.name, singer: song.artist, source: srcLX,
      interval: song.interval || 0, songmid: rid2,
      hash: song.hash, copyrightId: song.copyrightId, songId: song.songId,
      strMediaMid: song.strMediaMid, albumMid: song.albumMid, albumId: song.albumId,
      lrcUrl: song.lrcUrl, mrcUrl: song.mrcUrl, trcUrl: song.trcUrl,
      img: song.cover || ''
    };
  }

  /* ---------- 搜索 ---------- */
  async function lxSearchSongs(kw, page) {
    var out = await getJSON('/api/music/search?name=' + encodeURIComponent(kw) +
      '&source=' + lxSource() + '&type=song&page=' + (page || 1), { headers: authHeaders() });
    var list = Array.isArray(out) ? out : (out.list || []);
    return list.map(function (s) { return mapSong(s); }).filter(Boolean);
  }

  async function lxSearchSingers(kw) {
    var src = lxSource();
    if (src !== 'wy' && src !== 'tx') src = 'wy'; // 只有wy/tx支持歌手搜索
    var out = await getJSON('/api/music/search?name=' + encodeURIComponent(kw) +
      '&source=' + src + '&type=singer&page=1', { headers: authHeaders() });
    var list = Array.isArray(out) ? out : (out.list || []);
    var srcRef = LX2REF[src] || 'qq';
    return list.map(function (a) {
      if (!a || !a.name) return null;
      return {
        mid: a.mid || a.id || '', id: a.mid || a.id || '',
        name: a.name, cover: a.picUrl || '',
        songnum: a.albumSize || a.songnum || 0, albumnum: a.albumSize || a.albumnum || 0,
        type: 'singer', source: srcRef, _lx: a
      };
    }).filter(Boolean);
  }

  async function lxSingerSongs(sg, page) {
    // sg.mid 可能是 tx 的 singerMID；只有 wy/tx 有 artistSongs
    var src = (sg._lx && sg._lx.source) || (sg.source === 'netease' ? 'wy' : (REF2LX[sg.source] || lxSource()));
    if (src !== 'wy' && src !== 'tx') src = 'wy';
    var id = (sg._lx && (sg._lx.mid || sg._lx.id)) || sg.mid || sg.id || '';
    var out = await getJSON('/api/music/artistSongs?id=' + encodeURIComponent(id) +
      '&source=' + src + '&order=hot', { headers: authHeaders() });
    var list = Array.isArray(out) ? out : (out.list || []);
    return list.map(function (s) { return mapSong(s, src); }).filter(Boolean);
  }

  async function lxSearchPlaylists(kw) {
    var out = await getJSON('/api/music/songList/search?text=' + encodeURIComponent(kw) +
      '&source=' + lxSource() + '&page=1', { headers: authHeaders() });
    var list = (out && out.list) || [];
    var srcRef = LX2REF[lxSource()] || 'qq';
    return list.map(function (p) {
      if (!p || !p.id || !p.name) return null;
      return { id: String(p.id), name: p.name, cover: p.img || p.cover || '', source: srcRef, listen: p.play_count || 0, type: 'playlist', creator: p.author || '', _lx: p };
    }).filter(Boolean);
  }

  /* ---------- 榜单 ---------- */
  function lxBoards() {
    var src = lxSource();
    return getJSON('/api/music/leaderboard/boards?source=' + src, { headers: authHeaders() })
      .then(function (d) {
        var list = (d && d.list) || [];
        var srcRef = LX2REF[src] || 'qq';
        return list.map(function (b) {
          return {
            topId: b.bangid || b.id, id: b.bangid || b.id,
            name: b.name || '榜单', title: b.name || '榜单',
            intro: '', update: '', cover: '', // 无封面：卡片懒加载
            type: 'toplist', source: srcRef, bangid: b.bangid || b.id
          };
        });
      });
  }

  function lxBoardSongs(board) {
    var bangid = (typeof board === 'object') ? (board.bangid || board.topId || board.id) : board;
    var src = lxSource();
    return getJSON('/api/music/leaderboard/list?source=' + src +
      '&bangid=' + encodeURIComponent(bangid) + '&page=1', { headers: authHeaders() })
      .then(function (d) {
        var songs = ((d && d.list) || []).map(function (s) { return mapSong(s, src); }).filter(Boolean);
        return { info: { title: '', cover: (songs[0] && songs[0].cover) || '' }, songs: songs };
      });
  }

  // 榜单卡片封面懒加载：取榜内第一首歌封面
  var _coverCache = {};
  function lxBoardCover(board) {
    var key = lxSource() + ':' + (board.bangid || board.topId || board.id);
    if (_coverCache[key]) return Promise.resolve(_coverCache[key]);
    return lxBoardSongs(board).then(function (pack) {
      var c = (pack.songs[0] && pack.songs[0].cover) || '';
      _coverCache[key] = c;
      return c;
    }).catch(function () { return ''; });
  }

  /* ---------- 歌单 ---------- */
  function lxHomePlaylists() {
    // 首页歌单：按当前源搜3个关键词的歌单，混排取18
    var kws = ['流行', '热门', '华语'];
    return Promise.all(kws.map(function (k) { return lxSearchPlaylists(k).catch(function () { return []; }); }))
      .then(function (packs) {
        var seen = {}, out = [];
        packs.forEach(function (arr) {
          (arr || []).forEach(function (p) {
            var key = p.source + ':' + p.id;
            if (seen[key] || out.length >= 18) return;
            seen[key] = 1; out.push(p);
          });
        });
        return out;
      });
  }

  function lxPlaylistSongs(pl) {
    var id = (typeof pl === 'object') ? (pl.id || pl.dissid) : pl;
    var src = (pl && pl._lx && pl._lx.source) || lxSource();
    return getJSON('/api/music/songList/detail?source=' + src +
      '&id=' + encodeURIComponent(id) + '&page=1', { headers: authHeaders() })
      .then(function (d) {
        var list = (d && d.list) || [];
        return list.map(function (s) { return mapSong(s, src); }).filter(Boolean);
      });
  }

  /* ---------- 歌词 ---------- */
  function lxLyric(song) {
    var lx = toLxMusic(song);
    var srcLX = lx.source;
    var mid = lx.songmid || lx.songId;
    var q = '/api/music/lyric?source=' + srcLX + '&songmid=' + encodeURIComponent(mid) +
      '&name=' + encodeURIComponent(song.name || '') +
      '&singer=' + encodeURIComponent(song.artist || '');
    ['hash', 'interval', 'copyrightId', 'albumId', 'lrcUrl', 'mrcUrl', 'trcUrl', 'songId'].forEach(function (k) {
      if (lx[k] != null && lx[k] !== '') q += '&' + k + '=' + encodeURIComponent(lx[k]);
    });
    return getJSON(q, { headers: authHeaders() }).then(function (d) {
      return { lyric: (d && (d.lyric || d.lrc)) || '', trans: (d && (d.tlyric || d.trans)) || '' };
    });
  }

  /* ---------- 播放 ---------- */
  var QUALITYS = ['128k', '192k', '320k', 'flac', 'hires', 'master'];
  function lxPlayUrl(song, quality) {
    var lx = toLxMusic(song);
    return fetch('/api/music/url', {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ songInfo: lx, quality: quality || '128k' })
    }).then(function (res) { return res.json(); })
      .then(function (d) {
        if (!d || !d.url) throw new Error((d && d.error) || '无播放地址');
        return { url: d.url, quality: d.quality || quality || '128k' };
      });
  }

  /* ---------- 下载 ---------- */
  function lxDownloadUrl(url, filename) {
    return '/api/music/download?url=' + encodeURIComponent(url) +
      '&filename=' + encodeURIComponent(filename || 'download.mp3') + '&inline=1';
  }

  /* ---------- 收藏（后端） ---------- */
  function lxHeaders() { return authHeaders({ 'Content-Type': 'application/json' }); }

  function lxFavList() {
    return getJSON('/api/user/list', { headers: authHeaders() }).then(function (d) {
      return d; // {defaultList, loveList, userList}
    });
  }

  function lxFavAdd(listId, song) {
    return fetch('/api/music/user/list/add', {
      method: 'POST', headers: lxHeaders(),
      body: JSON.stringify({ listId: listId, musicInfos: [toLxMusic(song)] })
    }).then(function (r) { if (!r.ok) throw new Error('收藏失败'); });
  }

  function lxFavRemove(listId, songIds) {
    return fetch('/api/music/user/list/remove', {
      method: 'POST', headers: lxHeaders(),
      body: JSON.stringify({ listId: listId, songIds: songIds })
    }).then(function (r) { if (!r.ok) throw new Error('取消收藏失败'); });
  }

  /* ---------- 评论 ---------- */
  function lxComment(song, type, page) {
    return fetch('/api/music/comment', {
      method: 'POST', headers: lxHeaders(),
      body: JSON.stringify({ songInfo: toLxMusic(song), type: type || 'hot', page: page || 1, limit: 20 })
    }).then(function (r) { return r.json(); });
  }

  /* ---------- 热搜/提示 ---------- */
  function lxHotSearch() {
    return getJSON('/api/music/hotSearch?source=' + lxSource(), { headers: authHeaders() })
      .then(function (d) { return (d && d.list) || d || []; })
      .catch(function () { return []; });
  }

  function lxTipSearch(kw) {
    return getJSON('/api/music/tipSearch?name=' + encodeURIComponent(kw) +
      '&source=' + lxSource(), { headers: authHeaders() }).catch(function () { return []; });
  }

  window.LXBridge = {
    refPlat: refPlat, lxSource: lxSource, REF2LX: REF2LX, LX2REF: LX2REF,
    mapSong: mapSong, toLxMusic: toLxMusic,
    searchSongs: lxSearchSongs, searchSingers: lxSearchSingers, singerSongs: lxSingerSongs,
    searchPlaylists: lxSearchPlaylists, homePlaylists: lxHomePlaylists, playlistSongs: lxPlaylistSongs,
    boards: lxBoards, boardSongs: lxBoardSongs, boardCover: lxBoardCover,
    lyric: lxLyric, playUrl: lxPlayUrl, downloadUrl: lxDownloadUrl,
    favList: lxFavList, favAdd: lxFavAdd, favRemove: lxFavRemove,
    comment: lxComment, hotSearch: lxHotSearch, tipSearch: lxTipSearch,
    QUALITYS: QUALITYS
  };
})();
