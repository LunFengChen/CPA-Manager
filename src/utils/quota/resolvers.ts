/**
 * Resolver functions for extracting data from auth files.
 */

import type { AuthFileItem } from '@/types';
import {
  normalizeStringValue,
  normalizePlanType,
  parseIdTokenPayload
} from './parsers';

const toRecord = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
};

const resolveNestedCodexAuthInfo = (value: unknown): Record<string, unknown> | null => {
  const payload = parseIdTokenPayload(value);
  if (!payload) return null;
  return toRecord(payload['https://api.openai.com/auth']) ?? payload;
};

const resolveAccountIdCandidate = (value: unknown): string | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  return normalizeStringValue(
    record.chatgpt_account_id ??
      record.chatgptAccountId ??
      record.account_id ??
      record.accountId
  );
};

export function extractCodexChatgptAccountId(value: unknown): string | null {
  const direct = resolveAccountIdCandidate(value);
  if (direct) return direct;

  const payload = parseIdTokenPayload(value);
  if (!payload) return null;
  return resolveAccountIdCandidate(payload) ?? resolveAccountIdCandidate(payload['https://api.openai.com/auth']);
}

export function resolveCodexChatgptAccountId(file: AuthFileItem): string | null {
  const metadata =
    file && typeof file.metadata === 'object' && file.metadata !== null
      ? (file.metadata as Record<string, unknown>)
      : null;
  const attributes =
    file && typeof file.attributes === 'object' && file.attributes !== null
      ? (file.attributes as Record<string, unknown>)
      : null;

  const candidates = [
    file.chatgpt_account_id,
    file.chatgptAccountId,
    file.account_id,
    file.accountId,
    metadata?.chatgpt_account_id,
    metadata?.chatgptAccountId,
    metadata?.account_id,
    metadata?.accountId,
    attributes?.chatgpt_account_id,
    attributes?.chatgptAccountId,
    attributes?.account_id,
    attributes?.accountId,
    file.id_token,
    file.access_token,
    metadata?.id_token,
    metadata?.access_token,
    attributes?.id_token,
    attributes?.access_token,
  ];

  for (const candidate of candidates) {
    const id = extractCodexChatgptAccountId(candidate);
    if (id) return id;
  }

  return null;
}

const normalizeDateLikeValue = (value: unknown): string | number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

const resolveSubscriptionActiveUntilCandidate = (value: unknown): string | number | null => {
  const record = toRecord(value);
  if (!record) return null;

  const subscription = toRecord(record.subscription);
  return normalizeDateLikeValue(
    record.chatgpt_subscription_active_until ??
      record.chatgptSubscriptionActiveUntil ??
      record.subscription_active_until ??
      record.subscriptionActiveUntil ??
      subscription?.active_until ??
      subscription?.activeUntil
  );
};

export function resolveCodexSubscriptionActiveUntil(file: AuthFileItem): string | number | null {
  const metadata = toRecord(file.metadata);
  const attributes = toRecord(file.attributes);
  const idToken = resolveNestedCodexAuthInfo(file.id_token);
  const accessToken = resolveNestedCodexAuthInfo(file.access_token);
  const metadataIdToken = resolveNestedCodexAuthInfo(metadata?.id_token);
  const metadataAccessToken = resolveNestedCodexAuthInfo(metadata?.access_token);
  const attributesIdToken = resolveNestedCodexAuthInfo(attributes?.id_token);
  const attributesAccessToken = resolveNestedCodexAuthInfo(attributes?.access_token);

  const candidates = [
    file,
    metadata,
    attributes,
    idToken,
    accessToken,
    metadataIdToken,
    metadataAccessToken,
    attributesIdToken,
    attributesAccessToken
  ];

  for (const candidate of candidates) {
    const activeUntil = resolveSubscriptionActiveUntilCandidate(candidate);
    if (activeUntil !== null) return activeUntil;
  }

  return null;
}

export function resolveCodexPlanType(file: AuthFileItem): string | null {
  const metadata =
    file && typeof file.metadata === 'object' && file.metadata !== null
      ? (file.metadata as Record<string, unknown>)
      : null;
  const attributes =
    file && typeof file.attributes === 'object' && file.attributes !== null
      ? (file.attributes as Record<string, unknown>)
      : null;
  const resolveIdTokenPlanCandidate = (value: unknown): string | null => {
    const payload = resolveNestedCodexAuthInfo(value);
    if (!payload) return null;
    return normalizePlanType(payload.plan_type ?? payload.planType);
  };
  const candidates = [
    file.plan_type,
    file.planType,
    file['plan_type'],
    file['planType'],
    resolveIdTokenPlanCandidate(file.id_token),
    resolveIdTokenPlanCandidate(file.access_token),
    metadata?.plan_type,
    metadata?.planType,
    resolveIdTokenPlanCandidate(metadata?.id_token),
    resolveIdTokenPlanCandidate(metadata?.access_token),
    attributes?.plan_type,
    attributes?.planType,
    resolveIdTokenPlanCandidate(attributes?.id_token),
    resolveIdTokenPlanCandidate(attributes?.access_token)
  ];

  for (const candidate of candidates) {
    const planType = normalizePlanType(candidate);
    if (planType) return planType;
  }

  return null;
}

export function extractGeminiCliProjectId(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const matches = Array.from(value.matchAll(/\(([^()]+)\)/g));
  if (matches.length === 0) return null;
  const candidate = matches[matches.length - 1]?.[1]?.trim();
  return candidate ? candidate : null;
}

export function resolveGeminiCliProjectId(file: AuthFileItem): string | null {
  const metadata =
    file && typeof file.metadata === 'object' && file.metadata !== null
      ? (file.metadata as Record<string, unknown>)
      : null;
  const attributes =
    file && typeof file.attributes === 'object' && file.attributes !== null
      ? (file.attributes as Record<string, unknown>)
      : null;

  const candidates = [
    file.account,
    file['account'],
    metadata?.account,
    attributes?.account
  ];

  for (const candidate of candidates) {
    const projectId = extractGeminiCliProjectId(candidate);
    if (projectId) return projectId;
  }

  return null;
}
