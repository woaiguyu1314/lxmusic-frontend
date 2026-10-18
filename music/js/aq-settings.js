// =============================================================================
// aq-settings.js —— 设置页 iOS 皮肤辅助
// 只做「视觉分组」，不新增/删除功能，不动事件与 id。
// 把散落的裸开关行（网络设置 / 自动更新 等）合并成一张 iOS 卡片。
// 可重复执行（幂等）：先拆回原样再重新分组，适配异步渲染的 settings UI。
// =============================================================================
(function () {
  'use strict';

  function apply() {
    var view = document.getElementById('view-settings');
    if (!view) return;
    var wrap = view.firstElementChild; // 原大白卡，已透明化，不算卡片

    function isBareRow(el) {
      if (!el || el.nodeType !== 1) return false;
      var cls = el.className || '';
      if (!/flex/.test(cls)) return false;
      if (!/items-center/.test(cls)) return false;
      if (!/justify-between/.test(cls)) return false;
      // 已经在卡片 / 网格里的行不处理（外层大白卡 wrap 除外）
      var ca = el.closest('.t-bg-panel, .grid, .aq-set-group');
      if (ca && ca !== wrap) return false;
      return true;
    }

    function groupBareRows() {
      // 1) 拆回上一轮已分的组（幂等）
      Array.prototype.forEach.call(view.querySelectorAll('.aq-set-group'), function (g) {
        var parent = g.parentNode;
        if (!parent) return;
        while (g.firstChild) {
          var node = g.firstChild;
          if (node.nodeType === 1 && node.classList) node.classList.remove('aq-set-row');
          parent.insertBefore(node, g);
        }
        parent.removeChild(g);
      });

      // 2) 重新把裸行按「段容器」分组（日志面板是整屏 flex 布局，跳过）
      var containers = view.querySelectorAll('[class*="space-y"]');
      Array.prototype.forEach.call(containers, function (c) {
        if (c.closest && c.closest('#settings-panel-logs')) return;
        var rows = [];
        var children = Array.prototype.slice.call(c.children);
        for (var i = 0; i < children.length; i++) {
          if (isBareRow(children[i])) rows.push(children[i]);
        }
        if (rows.length === 0) return;

        var group = document.createElement('div');
        group.className = 'aq-set-group';
        // 先占位：把空 group 插到第一行原来的位置，再把行移进去
        c.insertBefore(group, rows[0]);
        rows.forEach(function (r) {
          r.classList.add('aq-set-row');
          group.appendChild(r);
        });
      });
    }

    groupBareRows();
  }

  function run() {
    apply();
    setTimeout(apply, 400);
    setTimeout(apply, 1500);
    setTimeout(apply, 3000);
  }

  document.addEventListener('DOMContentLoaded', run);

  // 切到设置页时再刷一次（有些项要等 auth/config 拉取后才显隐）
  document.addEventListener('click', function (e) {
    var t = e.target;
    while (t && t !== document) {
      if (t.id === 'aq-tab' || (t.id && t.id.indexOf('settings-tab') === 0)) {
        setTimeout(apply, 300);
        break;
      }
      if (t && t.getAttribute && t.getAttribute('data-page') === 'settings') {
        setTimeout(apply, 300);
        break;
      }
      t = t.parentNode;
    }
  });
})();
