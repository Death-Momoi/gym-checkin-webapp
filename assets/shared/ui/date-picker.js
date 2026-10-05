export function createRecordDatePicker({
    input,
    initialDate,
    loadActiveDates,
    onChange,
    clickOpens = true
  }) {
    if (!input) return null;

    if (typeof window.flatpickr !== 'function') {
      input.type = 'date';
      if (initialDate) input.value = initialDate;
      return null;
    }

    const monthCache = new Map();
    let activeDates = new Set();
    let loadSequence = 0;

    function localDateString(date) {
      return [
        date.getFullYear(),
        String(date.getMonth() + 1).padStart(2, '0'),
        String(date.getDate()).padStart(2, '0')
      ].join('-');
    }

    function monthRange(year, monthIndex) {
      const start = new Date(Date.UTC(year, monthIndex, 1))
        .toISOString()
        .slice(0, 10);
      const end = new Date(Date.UTC(year, monthIndex + 1, 1))
        .toISOString()
        .slice(0, 10);
      return { start, end, month: start.slice(0, 7) };
    }

    async function refreshMonth(instance) {
      const range = monthRange(instance.currentYear, instance.currentMonth);
      const currentLoad = ++loadSequence;

      try {
        let dates = monthCache.get(range.month);
        if (!dates) {
          dates = await loadActiveDates(range);
          dates = Array.isArray(dates) ? dates : [];
          monthCache.set(range.month, dates);
        }
        if (currentLoad !== loadSequence) return;
        activeDates = new Set(dates);
        instance.redraw();
      } catch (error) {
        if (currentLoad !== loadSequence) return;
        activeDates = new Set();
        console.warn('Active date markers could not be loaded', error);
        instance.redraw();
      }
    }

    const locale = {
      firstDayOfWeek: 1,
      weekdays: {
        shorthand: ['日', '一', '二', '三', '四', '五', '六'],
        longhand: [
          '星期日', '星期一', '星期二', '星期三',
          '星期四', '星期五', '星期六'
        ]
      },
      months: {
        shorthand: [
          '1月', '2月', '3月', '4月', '5月', '6月',
          '7月', '8月', '9月', '10月', '11月', '12月'
        ],
        longhand: [
          '1月', '2月', '3月', '4月', '5月', '6月',
          '7月', '8月', '9月', '10月', '11月', '12月'
        ]
      }
    };

    const options = {
      allowInput: false,
      clickOpens,
      dateFormat: 'Y-m-d',
      disableMobile: true,
      locale,
      onReady: (_dates, _dateText, instance) => refreshMonth(instance),
      onMonthChange: (_dates, _dateText, instance) => refreshMonth(instance),
      onYearChange: (_dates, _dateText, instance) => refreshMonth(instance),
      onChange: (_dates, dateText) => {
        if (dateText && typeof onChange === 'function') onChange(dateText);
      },
      onDayCreate: (_dates, _dateText, _instance, dayElement) => {
        const dateText = localDateString(dayElement.dateObj);
        if (!activeDates.has(dateText)) return;
        dayElement.classList.add('has-records');
        dayElement.title = `${dateText}（有紀錄）`;
      }
    };

    if (initialDate) options.defaultDate = initialDate;
    return window.flatpickr(input, options);
  }
