(async function () {
  'use strict';

  const app = await GymApp.init();
  if (!app) return;

  const filter = document.getElementById('issue-status-filter');
  const dateInput = document.getElementById('issue-date-filter');
  const dateSearchButton = document.getElementById('issue-date-search-button');
  const dateClearButton = document.getElementById('issue-date-clear-button');
  const refreshButton = document.getElementById('issue-refresh-button');
  const permissionNote = document.getElementById('issue-permission-note');
  const status = document.getElementById('issue-admin-status');
  const list = document.getElementById('issue-admin-list');
  const isAdmin = app.profile?.app_role === 'admin' &&
    app.profile?.status === 'active';
  let datePicker = null;

  permissionNote.textContent = isAdmin
    ? '你目前是管理員，可查看全部回報並變更處理狀態。'
    : '你目前為檢視模式：可查看全部回報，但只有管理員能變更處理狀態。';
  permissionNote.classList.add(isAdmin ? 'admin-mode' : 'viewer-mode');

  function setStatus(text, type = '') {
    status.textContent = text;
    status.className = `section-status${type ? ` ${type}` : ''}`;
  }

  function setBusy(isBusy) {
    filter.disabled = isBusy;
    dateInput.disabled = isBusy;
    dateSearchButton.disabled = isBusy;
    dateClearButton.disabled = isBusy;
    refreshButton.disabled = isBusy;
    refreshButton.textContent = isBusy ? '讀取中……' : '重新整理';
  }

  function notificationLabel(report) {
    if (report.notification_status === 'sent') return 'Gmail 已寄出';
    if (report.notification_status === 'failed') return 'Gmail 寄送失敗';
    return 'Gmail 等待寄送';
  }

  async function changeIssueStatus(report, button) {
    const nextStatus = report.status === 'open' ? 'resolved' : 'open';
    const originalText = button.textContent;

    button.disabled = true;
    button.textContent = '更新中……';
    GymApp.setMessage(
      nextStatus === 'resolved'
        ? '正在將問題標記為已解決……'
        : '正在重新開啟問題……'
    );

    const { error } = await app.client.rpc('admin_set_issue_status', {
      target_report_id: report.id,
      target_status: nextStatus
    });

    if (error) {
      console.error('Issue status update failed', error);
      GymApp.setMessage(`更新失敗：${error.message}`, 'error');
      button.disabled = false;
      button.textContent = originalText;
      return;
    }

    GymApp.setMessage(
      nextStatus === 'resolved'
        ? '已將問題標記為已解決。'
        : '已重新開啟問題。',
      'success'
    );
    await loadReports({ keepMessage: true });
  }

  function renderReports(reports, profileMap) {
    list.replaceChildren();

    for (const report of reports) {
      const row = document.createElement('li');
      const header = document.createElement('div');
      const reporterBlock = document.createElement('div');
      const reporterName = document.createElement('strong');
      const createdTime = document.createElement('span');
      const reportStatus = document.createElement('span');
      const description = document.createElement('p');
      const meta = document.createElement('div');
      const resolution = document.createElement('span');
      const reporter = profileMap.get(report.reporter_id);
      const resolver = profileMap.get(report.resolved_by);

      row.className = report.status === 'resolved'
        ? 'admin-issue-row resolved'
        : 'admin-issue-row';
      header.className = 'admin-issue-header';
      reporterBlock.className = 'admin-issue-reporter';
      createdTime.className = 'admin-issue-time';
      reportStatus.className = report.status === 'open'
        ? 'status-badge warning'
        : 'status-badge success';
      description.className = 'admin-issue-description';
      meta.className = 'admin-issue-meta';
      resolution.className = 'resolution-detail';

      reporterName.textContent = reporter?.display_name || '未知使用者';
      createdTime.textContent = `回報時間：${GymApp.formatDateTime(report.created_at)}`;
      reportStatus.textContent = report.status === 'open' ? '待處理' : '已解決';
      description.textContent = report.description;

      if (report.status === 'resolved' && report.resolved_at) {
        resolution.textContent =
          `解決時間：${GymApp.formatDateTime(report.resolved_at)}` +
          `｜處理者：${resolver?.display_name || '未知管理員'}`;
      } else {
        resolution.textContent = '尚未標記為已解決';
      }

      reporterBlock.append(reporterName, createdTime);
      header.append(reporterBlock, reportStatus);
      meta.appendChild(resolution);

      if (isAdmin) {
        const notification = document.createElement('span');
        notification.className = report.notification_status === 'failed'
          ? 'notification-state error'
          : 'notification-state';
        notification.textContent = notificationLabel(report);
        if (report.notification_status === 'failed' && report.notification_error) {
          notification.title = report.notification_error;
          notification.textContent += `：${report.notification_error}`;
        }
        meta.prepend(notification);
      }

      row.append(header, description, meta);

      if (isAdmin) {
        const actions = document.createElement('div');
        const actionButton = document.createElement('button');
        actions.className = 'admin-issue-actions';
        actionButton.className = report.status === 'open'
          ? 'primary-button issue-status-button'
          : 'secondary-button issue-status-button';
        actionButton.type = 'button';
        actionButton.textContent = report.status === 'open'
          ? '標記為已解決'
          : '重新開啟';
        actionButton.addEventListener('click', () => {
          changeIssueStatus(report, actionButton);
        });
        actions.appendChild(actionButton);
        row.appendChild(actions);
      }

      list.appendChild(row);
    }
  }

  async function loadReports({ keepMessage = false } = {}) {
    const selectedDate = dateInput.value.trim();
    const nextDate = selectedDate ? GymApp.nextDateString(selectedDate) : null;
    if (selectedDate && !nextDate) {
      setStatus('請選擇有效的回報日期。', 'error');
      return;
    }

    setBusy(true);
    setStatus('正在讀取問題回報……');

    try {
      const columns = isAdmin
        ? 'id, reporter_id, description, status, notification_status, ' +
          'notified_at, notification_error, created_at, resolved_at, resolved_by'
        : 'id, reporter_id, description, status, created_at, resolved_at, resolved_by';
      let query = app.client
        .from('issue_reports')
        .select(columns)
        .order('created_at', { ascending: false })
        .limit(200);

      if (filter.value !== 'all') {
        query = query.eq('status', filter.value);
      }
      if (selectedDate) {
        query = query
          .gte('created_at', `${selectedDate}T00:00:00+08:00`)
          .lt('created_at', `${nextDate}T00:00:00+08:00`);
      }

      const { data: reports, error } = await query;
      if (error) throw error;

      const profileIds = (reports || []).flatMap(report => [
        report.reporter_id,
        report.resolved_by
      ]);
      const profileMap = await GymApp.loadProfiles(profileIds);

      renderReports(reports || [], profileMap);
      const rangeLabel = selectedDate ? `${selectedDate} ` : '';
      setStatus(
        reports?.length
          ? `已讀取 ${rangeLabel}${reports.length} 筆問題回報。`
          : `${rangeLabel}沒有符合條件的問題回報。`,
        reports?.length ? 'success' : ''
      );

      if (!keepMessage) GymApp.hideMessage();
    } catch (error) {
      list.replaceChildren();
      console.error('Issue reports loading failed', error);
      setStatus(`讀取失敗：${error.message}`, 'error');
      GymApp.setMessage(
        '無法讀取問題回報，請確認新版資料庫 migration 已完成。',
        'error'
      );
    } finally {
      setBusy(false);
    }
  }

  async function loadAttendanceDates({ start, end }) {
    return GymApp.loadAttendanceActiveDates(start, end);
  }

  datePicker = GymApp.createRecordDatePicker({
    input: dateInput,
    initialDate: null,
    loadActiveDates: loadAttendanceDates,
    onChange: null
  });

  dateSearchButton.addEventListener('click', () => {
    if (!dateInput.value) {
      setStatus('請先點擊日期欄位選擇回報日期。', 'error');
      return;
    }
    loadReports();
  });
  dateClearButton.addEventListener('click', () => {
    if (datePicker) datePicker.clear(false);
    else dateInput.value = '';
    loadReports();
  });
  refreshButton.addEventListener('click', () => loadReports());
  filter.addEventListener('change', () => loadReports());
  await loadReports();
})();
