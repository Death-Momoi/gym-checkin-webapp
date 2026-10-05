import { client } from '../core/client.js';
import { currentAccessToken } from '../features/auth/index.js';
export function isUnauthorizedFunctionResult(result) {
    const responseStatus = Number(result?.error?.context?.status || 0);
    const errorText = [
      result?.error?.message,
      result?.data?.error
    ].filter(Boolean).join(' ');
    return responseStatus === 401 ||
      /\b401\b|JWT|\u767b\u5165\u72c0\u614b\u7121\u6548|\u8acb\u5148\u767b\u5165/i.test(errorText);
  }

export async function invokeUserFunction(functionName, body) {
    let accessToken = await currentAccessToken(false);
    let result = await client.functions.invoke(functionName, {
      body,
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    if (isUnauthorizedFunctionResult(result)) {
      accessToken = await currentAccessToken(true);
      result = await client.functions.invoke(functionName, {
        body,
        headers: { Authorization: `Bearer ${accessToken}` }
      });
    }

    return result;
  }

export async function functionErrorMessage(error, fallbackMessage) {
    const response = error?.context;
    if (response && typeof response.clone === 'function') {
      try {
        const payload = await response.clone().json();
        if (typeof payload?.error === 'string' && payload.error) {
          return payload.error;
        }
      } catch {
        // 使用一般錯誤訊息。
      }
    }
    return error?.message || fallbackMessage;
  }
