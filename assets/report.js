(async function () {
  'use strict';

  const app = await GymApp.init();
  if (!app) return;

  const issueText = document.getElementById('issue-text');
  const issueCount = document.getElementById('issue-count');
  const submitButton = document.getElementById('issue-submit-button');

  issueText.addEventListener('input', () => {
    issueCount.textContent = String(issueText.value.length);
  });

  submitButton.addEventListener('click', async () => {
    const description = issueText.value.trim();
    if (description.length < 5) {
      GymApp.setMessage('問題描述至少需要 5 個字元。', 'error');
      issueText.focus();
      return;
    }

    submitButton.disabled = true;
    issueText.disabled = true;
    GymApp.setMessage('正在儲存問題回報……');

    const { data: reportResult, error: reportError } = await app.client.rpc(
      'report_issue',
      { issue_text: description }
    );

    if (reportError) {
      GymApp.setMessage(`問題回報失敗：${reportError.message}`, 'error');
      submitButton.disabled = false;
      issueText.disabled = false;
      return;
    }

    const createdReport = Array.isArray(reportResult)
      ? reportResult[0]
      : reportResult;

    if (!createdReport?.id) {
      GymApp.setMessage(
        '問題回報已儲存，但無法取得回報編號，因此尚未寄出 Gmail 通知。',
        'error'
      );
      submitButton.disabled = false;
      issueText.disabled = false;
      return;
    }

    issueText.value = '';
    issueCount.textContent = '0';
    GymApp.setMessage('問題回報已儲存，正在寄送 Gmail 通知……');

    let emailResult = null;
    let emailError = null;
    try {
      const emailResponse = await GymApp.invokeUserFunction(
        'send-issue-email',
        { report_id: createdReport.id }
      );
      emailResult = emailResponse.data;
      emailError = emailResponse.error;
    } catch (error) {
      emailError = error;
    }

    if (emailError || !emailResult?.ok) {
      console.error('Gmail notification failed', emailError, emailResult);
      GymApp.setMessage(
        '問題回報已成功儲存，但 Gmail 通知寄送失敗。',
        'error'
      );
    } else {
      GymApp.setMessage('問題回報已儲存，Gmail 通知也已寄出。', 'success');
    }

    submitButton.disabled = false;
    issueText.disabled = false;
  });

  GymApp.setMessage('請填寫問題內容後送出。');
})();
