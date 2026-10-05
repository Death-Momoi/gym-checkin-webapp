import { notifyReport } from './repository.js';
import { ReportRepository } from './repository.js';
import { init as appInit } from '../auth/index.js';
import { setMessage as appSetMessage } from '../../shared/ui/messages.js';
export async function mount(){
const app = await appInit();
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
      appSetMessage('問題描述至少需要 5 個字元。', 'error');
      issueText.focus();
      return;
    }

    submitButton.disabled = true;
    issueText.disabled = true;
    appSetMessage('正在儲存問題回報……');

    const { data: reportResult, error: reportError } = await ReportRepository.create(
      { issue_text: description }
    );

    if (reportError) {
      appSetMessage(`問題回報失敗：${reportError.message}`, 'error');
      submitButton.disabled = false;
      issueText.disabled = false;
      return;
    }

    const createdReport = Array.isArray(reportResult)
      ? reportResult[0]
      : reportResult;

    if (!createdReport?.id) {
      appSetMessage(
        '問題回報已儲存，但無法取得回報編號，因此尚未寄出 Gmail 通知。',
        'error'
      );
      submitButton.disabled = false;
      issueText.disabled = false;
      return;
    }

    issueText.value = '';
    issueCount.textContent = '0';
    appSetMessage('問題回報已儲存，正在寄送 Gmail 通知……');

    let emailResult = null;
    let emailError = null;
    try {
      const emailResponse = await notifyReport(
        { report_id: createdReport.id }
      );
      emailResult = emailResponse.data;
      emailError = emailResponse.error;
    } catch (error) {
      emailError = error;
    }

    if (emailError || !emailResult?.ok) {
      console.error('Gmail notification failed', emailError, emailResult);
      appSetMessage(
        '問題回報已成功儲存，但 Gmail 通知寄送失敗。',
        'error'
      );
    } else {
      appSetMessage('問題回報已儲存，Gmail 通知也已寄出。', 'success');
    }

    submitButton.disabled = false;
    issueText.disabled = false;
  });

  appSetMessage('請填寫問題內容後送出。');
}
