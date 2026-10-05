export const NAV_ITEMS = [
    { key: 'home', href: 'index.html', icon: '✓', label: '簽到／簽退' },
    {
      key: 'borrowing',
      icon: '▤',
      label: '借用狀態',
      children: [
        { key: 'overview', href: 'overview.html', icon: '▥', label: '總覽圖表' },
        { key: 'present', href: 'present.html', icon: '●', label: '目前在場' },
        { key: 'calendar', href: 'calendar.html', icon: '▦', label: '預約月曆' },
        { key: 'history', href: 'history.html', icon: '≡', label: '簽到紀錄' }
      ]
    },
    { key: 'assist', href: 'assist.html', icon: '↪', label: '協助簽退' },
    {
      key: 'footprints', icon: '✦', label: '我的健身足跡',
      children: [
        { key: 'stampbook', href: 'footprints.html?view=in', icon: '✓', label: '個人健身集章卡' },
        { key: 'checkoutcards', href: 'footprints.html?view=out', icon: '★', label: '簽退成果小卡' }
      ]
    },
    { key: 'training', href: 'training.html', icon: '◷', label: '訓練助手' },
    { key: 'progress', href: 'progress.html', icon: '↗', label: '訓練進步圖表' },
    { key: 'bodyweight', href: 'bodyweight.html', icon: '◇', label: '體重紀錄' },
    { key: 'monthly', href: 'monthly.html', icon: '▣', label: '月度成果集卡' },
    { key: 'foodwheel', href: 'foodwheel.html', icon: '◉', label: '美食轉盤' },
    { key: 'report', href: 'report.html', icon: '!', label: '問題回報' },
    { key: 'guide', href: 'guide.html', icon: '?', label: '系統使用說明' },
    {
      key: 'admin',
      href: 'admin.html',
      icon: '⚙',
      label: '問題回報處理'
    }
  ];
