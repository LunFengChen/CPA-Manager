import type { AxiosRequestConfig } from 'axios';
import type { CodexUsagePayload } from '@/types';
import {
  CODEX_RATE_LIMIT_RESET_CREDITS_CONSUME_URL,
  CODEX_REQUEST_HEADERS,
  CODEX_USAGE_URL,
  parseCodexUsagePayload
} from '@/utils/quota';
import { apiCallApi, getApiCallErrorMessage, type ApiCallResult } from './apiCall';

export type CodexUsageRequestParams = {
  authIndex: string;
  accountId?: string | null;
  userAgent?: string;
  requestConfig?: AxiosRequestConfig;
};

export type CodexUsageRawResult = {
  result: ApiCallResult;
  payload: CodexUsagePayload | null;
};

export type CodexResetCreditRequestParams = CodexUsageRequestParams & {
  redeemRequestId?: string;
};

export const buildCodexUsageRequestHeaders = (
  accountId?: string | null,
  options: { userAgent?: string } = {}
): Record<string, string> => {
  const headers: Record<string, string> = {
    ...CODEX_REQUEST_HEADERS,
  };

  const trimmedAccountId = String(accountId ?? '').trim();
  if (trimmedAccountId) {
    headers['Chatgpt-Account-Id'] = trimmedAccountId;
  }

  const userAgent = String(options.userAgent ?? '').trim();
  if (userAgent) {
    headers['User-Agent'] = userAgent;
  }

  return headers;
};

export const requestCodexUsageRaw = async ({
  authIndex,
  accountId,
  userAgent,
  requestConfig,
}: CodexUsageRequestParams): Promise<CodexUsageRawResult> => {
  const result = await apiCallApi.request(
    {
      authIndex,
      method: 'GET',
      url: CODEX_USAGE_URL,
      header: buildCodexUsageRequestHeaders(accountId, { userAgent }),
    },
    requestConfig
  );

  return {
    result,
    payload: parseCodexUsagePayload(result.body ?? result.bodyText),
  };
};

export const requestCodexUsagePayload = async (
  params: CodexUsageRequestParams,
  options: { emptyMessage?: string } = {}
): Promise<CodexUsagePayload> => {
  const { result, payload } = await requestCodexUsageRaw(params);
  if (result.statusCode < 200 || result.statusCode >= 300) {
    throw new Error(getApiCallErrorMessage(result));
  }
  if (!payload) {
    throw new Error(options.emptyMessage || 'No Codex quota data available');
  }
  return payload;
};

const createRedeemRequestId = (): string => {
  const randomUUID = globalThis.crypto?.randomUUID;
  if (typeof randomUUID === 'function') {
    return randomUUID.call(globalThis.crypto);
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
};

export const requestCodexResetCreditRaw = async ({
  authIndex,
  accountId,
  userAgent,
  requestConfig,
  redeemRequestId,
}: CodexResetCreditRequestParams): Promise<ApiCallResult> =>
  apiCallApi.request(
    {
      authIndex,
      method: 'POST',
      url: CODEX_RATE_LIMIT_RESET_CREDITS_CONSUME_URL,
      header: buildCodexUsageRequestHeaders(accountId, { userAgent }),
      data: JSON.stringify({
        redeem_request_id: redeemRequestId || createRedeemRequestId(),
      }),
    },
    requestConfig
  );
