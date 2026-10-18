(function () {
  'use strict';

  /* ==========================================================================
   * 导入歌单
   * 从手机里选一个文本/CSV 歌单文件（每行「歌手 - 歌名」，也支持 JSON），
   * 逐首去当前音源搜索匹配，弹一个可删改的预览清单，确认后存进歌单
   *（可以选已有歌单，也可以点「新建歌单」）。
   * ========================================================================== */

  var MATCH_MIN = 0.25;   // 低于这个相似度算「未找到」
  var MATCH_HIGH = 0.72;  // 高于此显示为「已匹配」
  var CONCURRENCY = 3;

  var state = null;       // 当前导入会话
  var els = {};           // 注入的 DOM

  /* ----------------------------- 工具函数 ----------------------------- */

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  function toast(msg) {
    try {
      if (typeof window.showToast === 'function') { window.showToast(msg); return; }
    } catch (e) { /* ignore */ }
    try {
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
      el._t = setTimeout(function () { el.classList.remove('show'); }, 2200);
    } catch (e) { /* ignore */ }
  }

  /* 归一化：全角转半角、去标点空格、转小写，方便比对 */
  function norm(s) {
    return String(s == null ? '' : s)
      .replace(/[\u3000]/g, ' ')
      .replace(/[\uff01-\uff5e]/g, function (c) {
        return String.fromCharCode(c.charCodeAt(0) - 0xfee0);
      })
      .replace(/[\s\-_·・.,，。、;；:：'"'"“”‘’()（）\[\]【】<>《》\/\\|!！?？*#~～+＋&＆]+/g, '')
      .toLowerCase();
  }

  /* 顺序无关的字符命中率：对付「繁/简」这类对不上的情况比较宽容 */
  function charOverlap(a, b) {
    if (!a || !b) return 0;
    var set = Object.create(null), i;
    for (i = 0; i < b.length; i++) set[b[i]] = 1;
    var hit = 0;
    for (i = 0; i < a.length; i++) if (set[a[i]]) hit++;
    return hit / a.length;
  }

  /* bigram 命中率：顺序敏感，相同歌名基本能到 1 */
  function bigramOverlap(a, b) {
    if (!a || !b) return 0;
    if (a === b) return 1;
    if (a.length < 2 || b.length < 2) return a === b ? 1 : 0;
    var set = Object.create(null), i;
    for (i = 0; i < b.length - 1; i++) set[b.slice(i, i + 2)] = 1;
    var hit = 0;
    for (i = 0; i < a.length - 1; i++) if (set[a.slice(i, i + 2)]) hit++;
    return hit / (a.length - 1);
  }

  function similarity(a, b) {
    if (!a || !b) return 0;
    if (a.indexOf(b) >= 0 || b.indexOf(a) >= 0) return 0.95;
    return Math.max(bigramOverlap(a, b), charOverlap(a, b) * 0.9);
  }

  function singerText(song) {
    var s = song && (song.singer || song.artist || song.singerName || song.artistName);
    if (Array.isArray(s)) s = s.join('/');
    return String(s == null ? '' : s);
  }

  function currentSource() {
    try {
      if (typeof window.AqHome && typeof window.AqHome.source === 'function') return window.AqHome.source();
    } catch (e) { /* ignore */ }
    try { return localStorage.getItem('aq_source') || 'kw'; } catch (e) { /* ignore */ }
    return 'kw';
  }

  /* ----------------------------- 解析文件 ----------------------------- */

  function pushEntry(out, seen, artist, name) {
    name = String(name == null ? '' : name).trim();
    artist = String(artist == null ? '' : artist).trim();
    if (!name) return;
    var key = norm(artist) + '|' + norm(name);
    if (seen[key]) return;
    seen[key] = 1;
    out.push({ artist: artist, name: name });
  }

  function parseJson(text) {
    var data = JSON.parse(text);
    var arr = Array.isArray(data) ? data : (Array.isArray(data && data.list) ? data.list : null);
    if (!arr) throw new Error('JSON 里没找到歌曲数组');
    var out = [], seen = Object.create(null);
    arr.forEach(function (item) {
      if (typeof item === 'string') { pushEntry(out, seen, '', item); return; }
      if (!item || typeof item !== 'object') return;
      var name = item.name || item.title || item.songName || '';
      var artist = item.singer || item.artist || item.singerName || item.artistName || '';
      if (Array.isArray(artist)) artist = artist.join('/');
      pushEntry(out, seen, artist, name);
    });
    return out;
  }

  function parseText(text) {
    var out = [], seen = Object.create(null);
    var lines = String(text || '').replace(/^\uFEFF/, '').split(/\r\n|\r|\n/);
    lines.forEach(function (raw) {
      var line = String(raw || '').trim();
      if (!line) return;
      if (/^[\s\-=_*#·|]+$/.test(line)) return;                 // 分隔线/空行
      if (/^(歌名|歌曲|歌曲名称|标题|title|name|song|artist|歌手|序号|index)$/i.test(line)) return; // 表头
      var artist = '', name = line;
      var m = line.match(/^(.{1,48}?)\s*[-–—－~～]\s*(.+)$/);
      if (m) { artist = m[1].trim(); name = m[2].trim(); }
      if (/^\d+\s*[.、)]\s*/.test(name)) name = name.replace(/^\d+\s*[.、)]\s*/, '');
      name = name.replace(/^["'“”‘’]+|["'“”‘’]+$/g, '').trim();
      pushEntry(out, seen, artist, name);
    });
    return out;
  }

  function parseContent(text) {
    var t = String(text || '').replace(/^\uFEFF/, '').trim();
    if (!t) throw new Error('文件是空的');
    if (t.charAt(0) === '[' || t.charAt(0) === '{') {
      try { return parseJson(t); } catch (e) { /* 当普通文本再试一次 */ }
    }
    return parseText(t);
  }

  /* ----------------------------- 搜索匹配 ----------------------------- */

  function searchOne(source, kw) {
    var url = '/api/music/search?type=song&page=1&limit=20&source=' + encodeURIComponent(source) +
      '&name=' + encodeURIComponent(kw);
    return fetch(url, { headers: { Accept: 'application/json' } })
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (data) {
        if (!data) return [];
        return Array.isArray(data.list) ? data.list : (Array.isArray(data) ? data : []);
      })
      .catch(function () { return []; });
  }

  function pickBest(results, entry) {
    var qName = norm(entry.name);
    var qArtist = norm(entry.artist);
    var best = null, bestScore = 0;
    results.forEach(function (song) {
      if (!song || !song.name) return;
      var ns = similarity(qName, norm(song.name));
      var as = qArtist ? similarity(qArtist, norm(singerText(song))) : 0;
      var score = qArtist ? (ns * 0.65 + as * 0.35) : ns;
      if (score > bestScore) { bestScore = score; best = song; }
    });
    if (!best || bestScore < MATCH_MIN) return null;
    return { song: best, score: bestScore, high: bestScore >= MATCH_HIGH };
  }

  function runQueue(entries, source, onProgress) {
    var results = new Array(entries.length);
    var cursor = 0, done = 0, stopped = false;
    function worker() {
      if (stopped) return Promise.resolve();
      if (cursor >= entries.length) return Promise.resolve();
      var idx = cursor++;
      var entry = entries[idx];
      var kw = entry.artist ? (entry.artist + ' ' + entry.name) : entry.name;
      return searchOne(source, kw).then(function (list) {
        results[idx] = { entry: entry, match: pickBest(list, entry) };
        done++;
        onProgress(done, entries.length);
      }).catch(function () {
        results[idx] = { entry: entry, match: null };
        done++;
        onProgress(done, entries.length);
      }).then(worker);
    }
    var workers = [];
    for (var i = 0; i < CONCURRENCY; i++) workers.push(worker());
    return Promise.all(workers).then(function () {
      return { results: results, stopped: stopped };
    });
  }

  /* ------------------------------ UI 注入 ------------------------------ */

  function ensureStyle() {
    if (document.getElementById('aqImportStyle')) return;
    var st = document.createElement('style');
    st.id = 'aqImportStyle';
    st.textContent = [
      '.aq-imp-mask{position:fixed;inset:0;z-index:210;display:flex;align-items:center;',
      'justify-content:center;background:rgba(0,0,0,.5);padding:18px;}',
      '.aq-imp-box{width:100%;max-width:420px;max-height:82vh;display:flex;flex-direction:column;',
      'background:var(--bg-pure,var(--bg));border-radius:18px;overflow:hidden;',
      'box-shadow:0 20px 60px rgba(0,0,0,.4);}',
      '.aq-imp-head{padding:16px 18px 10px;}',
      '.aq-imp-title{font-size:16px;font-weight:700;}',
      '.aq-imp-sub{font-size:12px;color:var(--label-3);margin-top:5px;line-height:1.5;}',
      '.aq-imp-bar{height:4px;border-radius:99px;background:rgba(127,127,127,.22);margin-top:10px;overflow:hidden;}',
      '.aq-imp-bar i{display:block;height:100%;width:0;background:var(--pink);transition:width .2s ease;}',
      '.aq-imp-list{flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;padding:4px 10px 8px;}',
      '.aq-imp-row{display:flex;align-items:center;gap:10px;padding:9px 8px;border-radius:12px;}',
      '.aq-imp-row .aq-imp-art{width:42px;height:42px;border-radius:8px;object-fit:cover;',
      'background:var(--surface,#222);flex-shrink:0;}',
      '.aq-imp-meta{flex:1;min-width:0;}',
      '.aq-imp-name{font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
      '.aq-imp-sub2{font-size:11px;color:var(--label-3);margin-top:3px;white-space:nowrap;',
      'overflow:hidden;text-overflow:ellipsis;}',
      '.aq-imp-tag{flex-shrink:0;font-size:10px;padding:2px 7px;border-radius:6px;font-weight:700;}',
      '.aq-imp-tag.ok{background:rgba(31,194,124,.16);color:#1fc27c;}',
      '.aq-imp-tag.low{background:rgba(250,45,72,.16);color:var(--pink);}',
      '.aq-imp-del{flex-shrink:0;width:30px;height:30px;border:none;border-radius:50%;',
      'background:rgba(127,127,127,.16);color:var(--label-2);font-size:16px;line-height:1;}',
      '.aq-imp-foot{display:flex;gap:10px;padding:12px 16px 16px;border-top:.5px solid var(--separator);}',
      '.aq-imp-foot button{flex:1;padding:12px 0;border:none;border-radius:13px;font-size:15px;',
      'font-weight:600;cursor:pointer;}',
      '.aq-imp-cancel{background:rgba(127,127,127,.16);color:inherit;}',
      '.aq-imp-ok{background:linear-gradient(135deg,var(--pink,#fa2d48),#e01e3c);color:#fff;}',
      '.aq-imp-ok[disabled]{opacity:.45;}'
    ].join('');
    (document.head || document.documentElement).appendChild(st);
  }

  function placeholderCover() {
    return (window.PLACEHOLDER || '') ||
      'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80">' +
        '<rect width="80" height="80" fill="#2a2e38"/></svg>');
  }

  function coverOf(song) {
    var meta = (song && song.meta) || {};
    return meta.picUrl || song.picUrl || song.albumCover ||
      (song.album && (song.album.picUrl || song.album.cover)) || placeholderCover();
  }

  function showBox(html) {
    ensureStyle();
    closeBox();
    var mask = document.createElement('div');
    mask.className = 'aq-imp-mask';
    mask.id = 'aqImportMask';
    mask.innerHTML = '<div class="aq-imp-box">' + html + '</div>';
    document.body.appendChild(mask);
    els.mask = mask;
    els.box = $('.aq-imp-box', mask);
    return mask;
  }

  function closeBox() {
    if (els.mask && els.mask.parentNode) els.mask.parentNode.removeChild(els.mask);
    els = {};
  }

  /* --------------------------- 选择本地文件 --------------------------- */

  function pickFile() {
    return new Promise(function (resolve) {
      var input = document.createElement('input');
      input.type = 'file';
      input.accept = '.txt,.csv,.json,.md,text/plain,text/csv,application/json';
      input.style.position = 'fixed';
      input.style.left = '-9999px';
      document.body.appendChild(input);
      var settled = false;
      function done(file) {
        if (settled) return;
        settled = true;
        try { input.parentNode && input.parentNode.removeChild(input); } catch (e) { /* ignore */ }
        resolve(file || null);
      }
      input.addEventListener('change', function () { done(input.files && input.files[0]); });
      // 一部分机型退回时只会触发 focus 而不触发 change，这里作为兜底补一下。
      // 注意：文件管理器还没选完就会回焦点，所以必须等到真的选到文件，
      // 不能因为一次 focus 就当作取消。
      var guard = 0;
      function watchFocus() {
        window.addEventListener('focus', function () {
          if (settled || guard > 60) return;          // 约 60 次后自动放弃清理
          guard++;
          setTimeout(function () {
            var f = input.files && input.files[0];
            if (f) { done(f); return; }               // 选好了
            watchFocus();                            // 还在选，继续等
          }, 1000);
        });
      }
      watchFocus();
      input.click();
    });
  }

  function readFile(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () { resolve(String(reader.result || '')); };
      reader.onerror = function () { reject(new Error('读取文件失败')); };
      reader.readAsText(file, 'utf-8');
    });
  }

  /* ------------------------------ 主流程 ------------------------------ */

  function open() {
    if (state && state.busy) { toast('正在导入，请先等当前任务完成'); return; }
    var file = null;
    pickFile().then(function (f) {
      file = f;
      if (!file) return null;
      return readFile(file);
    }).then(function (text) {
      if (text == null) return null;
      var entries;
      try {
        entries = parseContent(text);
      } catch (e) {
        toast('解析失败：' + (e && e.message ? e.message : e));
        return null;
      }
      if (!entries.length) { toast('文件里没解析出歌曲'); return null; }
      var baseName = (file && file.name || '导入歌单').replace(/\.[^.]+$/, '');
      return runImport(entries, baseName);
    }).catch(function (e) {
      toast('导入失败：' + (e && e.message ? e.message : e));
    });
  }

  function runImport(entries, baseName) {
    var source = currentSource();
    state = { busy: true };
    var html =
      '<div class="aq-imp-head">' +
      '<div class="aq-imp-title">正在匹配歌曲</div>' +
      '<div class="aq-imp-sub" id="aqImpSub">共 ' + entries.length + ' 首 · 音源 ' + source + ' · 找到匹配的会自动留下，没找到的会跳过</div>' +
      '<div class="aq-imp-bar"><i id="aqImpBar"></i></div>' +
      '</div>' +
      '<div class="aq-imp-list" id="aqImpList"></div>' +
      '<div class="aq-imp-foot">' +
      '<button type="button" class="aq-imp-cancel" id="aqImpCancel">取消</button>' +
      '</div>';
    showBox(html);

    var cancelled = false;
    $('#aqImpCancel', els.box).addEventListener('click', function () {
      cancelled = true;
      state.busy = false;
      closeBox();
    });

    return runQueue(entries, source, function (done, total) {
      var bar = $('#aqImpBar', els.box);
      if (bar) bar.style.width = Math.round(done / total * 100) + '%';
      var sub = $('#aqImpSub', els.box);
      if (sub) sub.textContent = '正在匹配 ' + done + ' / ' + total + ' …';
    }).then(function (out) {
      if (cancelled) return null;
      state.busy = false;
      var matched = [], lowCount = 0, missCount = 0;
      var seenId = Object.create(null);
      out.results.forEach(function (row) {
        if (!row || !row.match) { missCount++; return; }
        var song = row.match.song;
        var key = String(song.source || source) + '_' + (song.id || song.name);
        if (seenId[key]) return;
        seenId[key] = 1;
        matched.push({ song: song, high: row.match.high, q: row.entry });
        if (!row.match.high) lowCount++;
      });
      if (!matched.length) {
        closeBox();
        toast('一首歌都没匹配上，试试在设置里切换音源');
        return null;
      }
      showReview(matched, { low: lowCount, miss: missCount, source: source }, baseName);
    });
  }

  function showReview(items, stat, baseName) {
    var html =
      '<div class="aq-imp-head">' +
      '<div class="aq-imp-title">确认要导入的歌曲</div>' +
      '<div class="aq-imp-sub">匹配 ' + items.length + ' 首' +
      (stat.low ? '（其中 ' + stat.low + ' 首疑似，可删）' : '') +
      (stat.miss ? ' · 未找到 ' + stat.miss + ' 首已跳过' : '') +
      '<br>歌单名称默认取文件名，点下面按钮可以改；删除按钮可以逐首剔除。</div>' +
      '</div>' +
      '<div class="aq-imp-list" id="aqImpList"></div>' +
      '<div class="aq-imp-foot">' +
      '<button type="button" class="aq-imp-cancel" id="aqImpCancel">取消</button>' +
      '<button type="button" class="aq-imp-ok" id="aqImpOk">选择歌单</button>' +
      '</div>';
    showBox(html);
    var listBox = $('#aqImpList', els.box);

    function paint() {
      listBox.innerHTML = items.map(function (it, i) {
        var s = it.song;
        return '<div class="aq-imp-row" data-i="' + i + '">' +
          '<img class="aq-imp-art" src="' + escAttr(coverOf(s)) + '" alt="">' +
          '<div class="aq-imp-meta">' +
          '<div class="aq-imp-name">' + escText(s.name || '') + '</div>' +
          '<div class="aq-imp-sub2">' + escText(singerText(s)) + '</div>' +
          '</div>' +
          '<span class="aq-imp-tag ' + (it.high ? 'ok' : 'low') + '">' + (it.high ? '已匹配' : '疑似') + '</span>' +
          '<button type="button" class="aq-imp-del" title="删除">×</button>' +
          '</div>';
      }).join('');
      $$('.aq-imp-del', listBox).forEach(function (btn) {
        btn.addEventListener('click', function () {
          var row = btn.closest('.aq-imp-row');
          var i = parseInt(row.dataset.i, 10);
          items.splice(i, 1);
          if (!items.length) { closeBox(); return; }
          paint();
        });
      });
      var ok = $('#aqImpOk', els.box);
      if (ok) ok.textContent = '导入 ' + items.length + ' 首';
    }
    paint();

    $('#aqImpCancel', els.box).addEventListener('click', closeBox);
    $('#aqImpOk', els.box).addEventListener('click', function () {
      if (!items.length) { closeBox(); return; }
      var songs = items.map(function (it) { return it.song; });
      closeBox();
      if (typeof window.openPlaylistAddModal !== 'function') {
        toast('播放器未就绪，请长按页面刷新后再试');
        return;
      }
      // 复用原有「添加到歌单」弹窗：可以选已有歌单，也可以点「新建歌单」
      window.openPlaylistAddModal(songs);
      toast('已匹配 ' + songs.length + ' 首，选一个歌单保存');
    });

    void baseName;
  }

  function escText(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function escAttr(s) { return escText(s).replace(/'/g, '%27'); }

  window.PlaylistImporter = { open: open };
})();
