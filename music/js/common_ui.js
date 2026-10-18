/**
 * Common UI & Initialization Helpers
 */

(function () {
    // --- Setting Tooltips Mobile Support ---

    /**
     * 把提示气泡固定到视口内的安全区域。
     * [适配修复] 原来气泡用 position:absolute + left:50% 居中，再靠 marginLeft 补救：
     *   1) 桌面端 hover 根本不调用钳制函数，问号一靠边就被裁掉半截；
     *   2) marginLeft 叠加在 translateX(-50%) 上会累积偏移。
     * 现在改为 position:fixed，由 JS 直接算出 left/top 并夹在视口内，
     * 桌面 hover 与移动端点击都走同一条逻辑。
     */
    function clampTooltipPosition(trigger) {
        const tooltip = trigger.querySelector('.setting-tooltip-content');
        if (!tooltip) return;

        tooltip.style.left = '';
        tooltip.style.top = '';

        // 先让气泡按 CSS 默认位置渲染一帧，拿到真实尺寸
        requestAnimationFrame(() => {
            const padding = 8;
            const vw = window.innerWidth;
            const vh = window.innerHeight;
            const tRect = trigger.getBoundingClientRect();
            const rect = tooltip.getBoundingClientRect();

            // 水平：默认气泡中心对齐问号，再夹进视口
            let left = tRect.left + tRect.width / 2 - rect.width / 2;
            left = Math.max(padding, Math.min(left, vw - rect.width - padding));

            // 垂直：优先放在问号上方；上方空间不够就翻到下方
            const gap = 8;
            let top = tRect.top - rect.height - gap;
            if (top < padding) {
                top = tRect.bottom + gap;
            }
            // 上下都放不下（说明气泡太高）→ 允许内部滚动，钉在视口内
            if (top + rect.height > vh - padding) {
                top = Math.max(padding, Math.min(top, vh - rect.height - padding));
            }

            tooltip.style.left = Math.round(left) + 'px';
            tooltip.style.top = Math.round(top) + 'px';
            // 箭头跟着问号走
            const notch = tooltip.querySelector('::after');
            if (notch) { /* 伪元素无法直接设样式，改用 CSS 变量 */ }
            tooltip.style.setProperty('--aq-notch-x',
                Math.round(Math.max(12, Math.min(rect.width - 12, tRect.left + tRect.width / 2 - left))) + 'px');
        });
    }

    // 桌面端 hover 也要走钳制：原先只在移动端点击时定位，靠边的问题号会被裁掉半截
    document.querySelectorAll('.setting-tooltip-trigger').forEach(function (trigger) {
        trigger.addEventListener('mouseenter', function () {
            if (window.matchMedia('(hover: none)').matches) return;
            clampTooltipPosition(trigger);
        });
    });

    document.addEventListener('click', function (e) {
        const trigger = e.target.closest('.setting-tooltip-trigger');

        // Close all other tooltips
        document.querySelectorAll('.setting-tooltip-trigger.is-active').forEach(activeTrigger => {
            if (activeTrigger !== trigger) {
                activeTrigger.classList.remove('is-active');
                const t = activeTrigger.querySelector('.setting-tooltip-content');
                if (t) { t.style.left = ''; t.style.top = ''; }
            }
        });

        if (trigger) {
            // If it's a mobile device (or doesn't support hover)
            if (window.matchMedia('(hover: none)').matches) {
                trigger.classList.toggle('is-active');
                if (trigger.classList.contains('is-active')) {
                    clampTooltipPosition(trigger);
                } else {
                    const t = trigger.querySelector('.setting-tooltip-content');
                    if (t) { t.style.left = ''; t.style.top = ''; }
                }
                e.stopPropagation();
            }
        }
    });

    // Close tooltip when clicking outside
    document.addEventListener('touchstart', function (e) {
        if (!e.target.closest('.setting-tooltip-trigger')) {
            document.querySelectorAll('.setting-tooltip-trigger.is-active').forEach(trigger => {
                trigger.classList.remove('is-active');
                const t = trigger.querySelector('.setting-tooltip-content');
                if (t) { t.style.left = ''; t.style.top = ''; }
            });
        }
    }, { passive: true });
})();


/**
 * 跳转至管理后台
 */
function goToAdmin() {
    var adminPath = (window.CONFIG && window.CONFIG['admin.path']) || '/music';
    location.href = adminPath;
}

/**
 * --- Project Agreement Modal Logic ---
 */

/**
 * 检查是否已接受协议，若未接受则展示弹窗
 */
function checkProjectAgreement() {
    console.log('[Agreement] Checking project agreement status...');
    const isAccepted = localStorage.getItem('lx_agreement_accepted');
    const modal = document.getElementById('project-agreement-modal');

    if (isAccepted === 'true') {
        console.log('[Agreement] Status: Already accepted.');
        return;
    }

    if (modal) {
        console.log('[Agreement] Status: Not accepted. Showing modal.');
        // 将 modal 移到 body 直接子元素，防止被祖先 transform/hidden 容器破坏布局
        document.body.appendChild(modal);
        modal.classList.remove('hidden');
        document.body.style.overflow = 'hidden';
    } else {
        console.warn('[Agreement] Modal element not found!');
    }
}

/**
 * 接受协议并关闭弹窗
 */
function acceptProjectAgreement() {
    localStorage.setItem('lx_agreement_accepted', 'true');
    const modal = document.getElementById('project-agreement-modal');
    if (modal) {
        modal.classList.add('opacity-0');
        setTimeout(() => {
            modal.classList.add('hidden');
            document.body.style.overflow = '';
            // 接受后自动跳转到关于界面展示详细协议
            readAgreementInAbout();
        }, 300);
    }
}

/**
 * 在“关于”页面查看详细协议并自动滚动
 */
function readAgreementInAbout() {
    if (typeof switchTab === 'function') {
        switchTab('about');
        setTimeout(() => {
            const aboutContainer = document.getElementById('view-about');
            if (aboutContainer) {
                const agreementHeader = Array.from(aboutContainer.querySelectorAll('h2')).find(h => h.innerText.includes('项目协议'));
                if (agreementHeader) {
                    agreementHeader.scrollIntoView({ behavior: 'smooth' });
                } else {
                    aboutContainer.scrollTo({ top: aboutContainer.scrollHeight, behavior: 'smooth' });
                }
            }
        }, 500);
    }

    // 手机端自动收起侧边栏
    if (window.innerWidth <= 1024 && typeof toggleSidebar === 'function') {
        const sidebar = document.getElementById('main-sidebar');
        if (sidebar && !sidebar.classList.contains('-translate-x-full')) {
            toggleSidebar();
        }
    }
}

// 自动初始化
document.addEventListener('DOMContentLoaded', () => {
    checkProjectAgreement();
});
