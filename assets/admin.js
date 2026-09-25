(async function () {
  'use strict';

  const app = await GymApp.init();
  if (!app) return;

  const denied = document.getElementById('admin-denied');
  const content = document.getElementById('admin-content');
  const filter = document.getElementById('issue-status-filter');
  const refreshButton = document.getElementById('issue-refresh-button');
  const status = document.getElementById('issue-admin-status');
  const list = document.getElementById('issue-admin-list');
  const isAdmin = app.profile?.app_role === 'admin' &&
    app.profile?.status === 'active';

  if (!isAdmin) {
    denied.classList.remove('hidden');
    GymApp.setMessage('你的帳號沒有管理員權限。', 'error');
    return;
  }

  content.classList.remove('hidden');

  function setStatus(text, type = '') {
    status.textContent = text;
    status.className = `section-status${type ? ` ${type}` : ''}`;
  }

  function setBusy(isBusy) {
    filter.disabled = isBusy;
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
      const notification = document.createElement('span');
      const resolution = document.createElement('span');
      const actions = document.createElement('div');
      const actionButton = document.createElement('button');

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
      notification.className = report.notification_status === 'failed'
        ? 'notification-state error'
        : 'notification-state';
      resolution.className = 'resolution-detail';
      actions.className = 'admin-issue-actions';
      actionButton.className = report.status === 'open'
        ? 'primary-button issue-status-button'
        : 'secondary-button issue-status-button';
      actionButton.type = 'button';

      reporterName.textContent = reporter?.display_name || '未知使用者';
      createdTime.textContent = `回報時間：${GymApp.formatDateTime(report.created_at)}`;
      reportStatus.textContent = report.status === 'open' ? '待處理' : '已解決';
      description.textContent = report.description;
      notification.textContent = notificationLabel(report);

      if (report.notification_status === 'failed' && report.notification_error) {
        notification.title = report.notification_error;
        notification.textContent += `：${report.notification_error}`;
      }

      if (report.status === 'resolved' && report.resolved_at) {
        resolution.textContent =
          `解決時間：${GymApp.formatDateTime(report.resolved_at)}` +
          `｜處理者：${resolver?.display_name || '未知管理員'}`;
      } else {
        resolution.textContent = '尚未標記為已解決';
      }

      actionButton.textContent = report.status === 'open'
        ? '標記為已解決'
        : '重新開啟';
      actionButton.addEventListener('click', () => {
        changeIssueStatus(report, actionButton);
      });

      reporterBlock.append(reporterName, createdTime);
      header.append(reporterBlock, reportStatus);
      meta.append(notification, resolution);
      actions.append(actionButton);
      row.append(header, description, meta, actions);
      list.appendChild(row);
    }
  }

  async function loadReports({ keepMessage = false } = {}) {
    setBusy(true);
    setStatus('正在讀取問題回報……');

    try {
      let query = app.client
        .from('issue_reports')
        .select(
          'id, reporter_id, description, status, notification_status, ' +
          'notified_at, notification_error, created_at, resolved_at, resolved_by'
        )
        .order('created_at', { ascending: false })
        .limit(200);

      if (filter.value !== 'all') {
        query = query.eq('status', filter.value);
      }

      const { data: reports, error } = await query;
      if (error) throw error;

      const profileIds = (reports || []).flatMap(report => [
        report.reporter_id,
        report.resolved_by
      ]);
      const profileMap = await GymApp.loadProfiles(profileIds);

      renderReports(reports || [], profileMap);
      setStatus(
        reports?.length
          ? `已讀取 ${reports.length} 筆問題回報。`
          : '目前沒有符合條件的問題回報。',
        reports?.length ? 'success' : ''
      );

      if (!keepMessage) GymApp.hideMessage();
    } catch (error) {
      list.replaceChildren();
      console.error('Issue reports loading failed', error);
      setStatus(`讀取失敗：${error.message}`, 'error');
      GymApp.setMessage(
        '無法讀取管理資料，請確認帳號權限與資料庫 migration。',
        'error'
      );
    } finally {
      setBusy(false);
    }
  }

  refreshButton.addEventListener('click', () => loadReports());
  filter.addEventListener('change', () => loadReports());
  await loadReports();
})();
