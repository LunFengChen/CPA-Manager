/**
 * Codex provider quota fetch + parse helper. Shared between the quota
 * management page and request-monitoring account quota panel.
 */

import type { TFunction } from 'i18next';
import type { AuthFileItem, CodexQuotaWindow } from '@/types';
import { requestCodexResetCreditRaw, requestCodexUsageRaw, getApiCallErrorMessage } from '@/services/api';
import { normalizeAuthIndex, normalizeNumberValue } from '../parsers';
import { createStatusError } from '../formatters';
import { buildCodexQuotaWindowInfos } from '../codexQuota';
import { normalizePlanType } from '../parsers';
import {
  resolveCodexChatgptAccountId,
  resolveCodexPlanType,
  resolveCodexSubscriptionActiveUntil
} from '../resolvers';

export type CodexQuotaResult = {
  planType: string | null;
  subscriptionActiveUntil: string | number | null;
  rateLimitResetCreditsAvailableCount: number | null;
  windows: CodexQuotaWindow[];
};

const buildCodexQuotaWindows = (
  payload: Parameters<typeof buildCodexQuotaWindowInfos>[0],
  t: TFunction
): CodexQuotaWindow[] =>
  buildCodexQuotaWindowInfos(payload).map((window) => ({
    id: window.id,
    label: t(window.labelKey, window.labelParams),
    labelKey: window.labelKey,
    labelParams: window.labelParams,
    usedPercent: window.usedPercent,
    resetLabel: window.resetLabel,
  }));

export const fetchCodexQuota = async (
  file: AuthFileItem,
  t: TFunction
): Promise<CodexQuotaResult> => {
  const rawAuthIndex = file['auth_index'] ?? file.authIndex;
  const authIndex = normalizeAuthIndex(rawAuthIndex);
  if (!authIndex) {
    throw new Error(t('codex_quota.missing_auth_index'));
  }

  const planTypeFromFile = resolveCodexPlanType(file);
  const accountId = resolveCodexChatgptAccountId(file);
  const { result, payload } = await requestCodexUsageRaw({ authIndex, accountId });

  if (result.statusCode < 200 || result.statusCode >= 300) {
    throw createStatusError(getApiCallErrorMessage(result), result.statusCode);
  }

  if (!payload) {
    throw new Error(t('codex_quota.empty_windows'));
  }

  const planTypeFromUsage = normalizePlanType(payload.plan_type ?? payload.planType);
  const resetCredits = payload.rate_limit_reset_credits ?? payload.rateLimitResetCredits ?? null;
  const rateLimitResetCreditsAvailableCount = normalizeNumberValue(
    resetCredits?.available_count ?? resetCredits?.availableCount
  );
  const windows = buildCodexQuotaWindows(payload, t);
  return {
    planType: planTypeFromUsage ?? planTypeFromFile,
    subscriptionActiveUntil: resolveCodexSubscriptionActiveUntil(file),
    rateLimitResetCreditsAvailableCount,
    windows
  };
};

export const resetCodexQuota = async (
  file: AuthFileItem,
  t: TFunction
): Promise<CodexQuotaResult> => {
  const rawAuthIndex = file['auth_index'] ?? file.authIndex;
  const authIndex = normalizeAuthIndex(rawAuthIndex);
  if (!authIndex) {
    throw new Error(t('codex_quota.missing_auth_index'));
  }

  const accountId = resolveCodexChatgptAccountId(file);
  const result = await requestCodexResetCreditRaw({ authIndex, accountId });
  if (result.statusCode < 200 || result.statusCode >= 300) {
    throw createStatusError(getApiCallErrorMessage(result), result.statusCode);
  }

  return fetchCodexQuota(file, t);
};
