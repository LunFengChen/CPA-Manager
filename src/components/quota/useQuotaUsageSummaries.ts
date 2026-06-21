import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  isUsageServiceId,
  normalizeUsageServiceBase,
  usageServiceApi,
} from '@/services/api/usageService';
import { useAuthStore, useUsageServiceStore } from '@/stores';
import type { AuthFileItem } from '@/types';
import { detectApiBaseFromLocation } from '@/utils/connection';
import { calculateCost } from '@/utils/usage';
import type { ModelPrice } from '@/utils/usage';
import type { AuthFileUsageSummary } from './QuotaCard';

const USAGE_PAGE_SIZE = 500;

type UsageAccountModel = {
  model?: unknown;
  resolved_model?: unknown;
  resolvedModel?: unknown;
  input_tokens?: unknown;
  inputTokens?: unknown;
  output_tokens?: unknown;
  outputTokens?: unknown;
  cached_tokens?: unknown;
  cachedTokens?: unknown;
  cache_tokens?: unknown;
  cacheTokens?: unknown;
  total_tokens?: unknown;
  totalTokens?: unknown;
};

type UsageAccountItem = {
  id?: unknown;
  key?: unknown;
  account?: unknown;
  account_label?: unknown;
  accountLabel?: unknown;
  auth_labels?: unknown;
  authLabels?: unknown;
  auth_indices?: unknown;
  authIndices?: unknown;
  total_requests?: unknown;
  totalRequests?: unknown;
  total_tokens?: unknown;
  totalTokens?: unknown;
  models?: unknown;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const readString = (value: unknown): string =>
  typeof value === 'string'
    ? value.trim()
    : value === null || value === undefined
      ? ''
      : String(value).trim();

const readNumber = (value: unknown): number => {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const normalizeIdentity = (value: unknown): string => readString(value).toLowerCase();

const normalizeIdentityList = (values: unknown[]): string[] =>
  Array.from(new Set(values.map(normalizeIdentity).filter(Boolean)));

const readRecordField = (value: unknown, key: string): unknown =>
  isRecord(value) ? value[key] : undefined;

const readArrayStrings = (value: unknown): string[] =>
  Array.isArray(value) ? value.map(readString).filter(Boolean) : [];

const collectAuthFileIdentityCandidates = (file: AuthFileItem): string[] => {
  const idToken = file.id_token;
  const authIndex = file.authIndex ?? file['auth_index'];
  const strongIdentities = normalizeIdentityList([
    file.account,
    file.email,
    file.account_id,
    file.accountId,
    file.chatgpt_account_id,
    file.chatgptAccountId,
    readRecordField(idToken, 'email'),
    readRecordField(idToken, 'account_id'),
    readRecordField(idToken, 'accountId'),
    readRecordField(idToken, 'chatgpt_account_id'),
    readRecordField(idToken, 'chatgptAccountId'),
  ]);

  if (strongIdentities.length > 0) {
    return normalizeIdentityList([...strongIdentities, authIndex]);
  }

  return normalizeIdentityList([file.label, file.name, authIndex]);
};

const collectUsageItemIdentityCandidates = (item: UsageAccountItem): string[] =>
  normalizeIdentityList([
    item.id,
    item.key,
    item.account,
    item.account_label,
    item.accountLabel,
    ...readArrayStrings(item.auth_labels ?? item.authLabels),
    ...readArrayStrings(item.auth_indices ?? item.authIndices),
  ]);

const usageItemId = (item: UsageAccountItem, index: number): string =>
  readString(item.id) ||
  readString(item.key) ||
  readString(item.account) ||
  `usage-account-${index}`;

const usageModelCost = (
  model: UsageAccountModel,
  modelPrices: Record<string, ModelPrice>
): number =>
  calculateCost(
    {
      __modelName: readString(model.model) || '-',
      __resolvedModel: readString(model.resolved_model ?? model.resolvedModel),
      tokens: {
        input_tokens: readNumber(model.input_tokens ?? model.inputTokens),
        output_tokens: readNumber(model.output_tokens ?? model.outputTokens),
        cached_tokens: readNumber(model.cached_tokens ?? model.cachedTokens),
        cache_tokens: readNumber(model.cache_tokens ?? model.cacheTokens),
        total_tokens: readNumber(model.total_tokens ?? model.totalTokens),
      },
    },
    modelPrices
  );

const buildUsageSummary = (
  item: UsageAccountItem,
  modelPrices: Record<string, ModelPrice>,
  hasCostEstimate: boolean
): AuthFileUsageSummary => {
  const models = Array.isArray(item.models) ? item.models.filter(isRecord) : [];
  const totalCost = hasCostEstimate
    ? models.reduce(
        (sum, model) => sum + usageModelCost(model as UsageAccountModel, modelPrices),
        0
      )
    : null;

  return {
    requestCount: readNumber(item.total_requests ?? item.totalRequests),
    totalTokens: readNumber(item.total_tokens ?? item.totalTokens),
    totalCost,
    hasCostEstimate,
  };
};

const addUsageSummary = (target: AuthFileUsageSummary, next: AuthFileUsageSummary) => {
  target.requestCount += next.requestCount;
  target.totalTokens += next.totalTokens;
  target.hasCostEstimate = target.hasCostEstimate || next.hasCostEstimate;
  if (next.totalCost !== null) {
    target.totalCost = (target.totalCost ?? 0) + next.totalCost;
  }
};

const buildSummariesByFileName = (
  files: AuthFileItem[],
  usageItems: UsageAccountItem[],
  modelPrices: Record<string, ModelPrice>
): Record<string, AuthFileUsageSummary> => {
  const hasCostEstimate = Object.keys(modelPrices).length > 0;
  const indexedUsageItems = usageItems.map((item, index) => ({
    id: usageItemId(item, index),
    item,
    identities: new Set(collectUsageItemIdentityCandidates(item)),
  }));

  const result: Record<string, AuthFileUsageSummary> = {};
  files.forEach((file) => {
    const fileIdentities = collectAuthFileIdentityCandidates(file);
    if (fileIdentities.length === 0) return;

    const matched = indexedUsageItems.filter(({ identities }) =>
      fileIdentities.some((identity) => identities.has(identity))
    );
    if (matched.length === 0) return;

    const summary: AuthFileUsageSummary = {
      requestCount: 0,
      totalTokens: 0,
      totalCost: null,
      hasCostEstimate,
    };
    const seen = new Set<string>();
    matched.forEach(({ id, item }) => {
      if (seen.has(id)) return;
      seen.add(id);
      addUsageSummary(summary, buildUsageSummary(item, modelPrices, hasCostEstimate));
    });

    if (summary.requestCount > 0 || summary.totalTokens > 0 || (summary.totalCost ?? 0) > 0) {
      result[file.name] = summary;
    }
  });

  return result;
};

export const useQuotaUsageSummaries = (files: AuthFileItem[]) => {
  const apiBase = useAuthStore((state) => state.apiBase);
  const managementKey = useAuthStore((state) => state.managementKey);
  const usageServiceEnabled = useUsageServiceStore((state) => state.enabled);
  const usageServiceBase = useUsageServiceStore((state) => state.serviceBase);
  const usageServiceRevision = useUsageServiceStore((state) => state.revision);
  const [usageItems, setUsageItems] = useState<UsageAccountItem[]>([]);
  const [modelPrices, setModelPrices] = useState<Record<string, ModelPrice>>({});

  const resolveUsageServiceBase = useCallback(async (): Promise<string> => {
    if (usageServiceEnabled && usageServiceBase) return usageServiceBase;

    const candidates = Array.from(
      new Set(
        [apiBase, detectApiBaseFromLocation()]
          .map((value) => normalizeUsageServiceBase(value || ''))
          .filter(Boolean)
      )
    );

    for (const candidate of candidates) {
      try {
        const info = await usageServiceApi.getInfo(candidate);
        if (isUsageServiceId(info.service)) return candidate;
      } catch {
        // Regular CPA management endpoints do not expose usage-service metadata.
      }
    }

    return '';
  }, [apiBase, usageServiceBase, usageServiceEnabled]);

  const refresh = useCallback(async () => {
    if (!managementKey) {
      setUsageItems([]);
      setModelPrices({});
      return;
    }

    const serviceBase = await resolveUsageServiceBase();
    if (!serviceBase) {
      setUsageItems([]);
      setModelPrices({});
      return;
    }

    try {
      const [pricesResponse, firstPage] = await Promise.all([
        usageServiceApi.getModelPrices(serviceBase, managementKey).catch(() => ({ prices: {} })),
        usageServiceApi.getUsagePage(serviceBase, managementKey, 'accounts', undefined, {
          page: 1,
          pageSize: USAGE_PAGE_SIZE,
          sortKey: 'lastSeenAt',
          sortDirection: 'desc',
        }),
      ]);

      const pageSize = Math.max(1, Math.trunc(Number(firstPage.page_size) || USAGE_PAGE_SIZE));
      const totalItems = Math.max(0, Math.trunc(Number(firstPage.total_items) || 0));
      const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
      const restPages = await Promise.all(
        Array.from({ length: Math.max(0, totalPages - 1) }, (_, index) =>
          usageServiceApi.getUsagePage(serviceBase, managementKey, 'accounts', undefined, {
            page: index + 2,
            pageSize,
            sortKey: 'lastSeenAt',
            sortDirection: 'desc',
          })
        )
      );

      setModelPrices(pricesResponse.prices ?? {});
      setUsageItems(
        [firstPage, ...restPages].flatMap((page) =>
          Array.isArray(page.items) ? (page.items.filter(isRecord) as UsageAccountItem[]) : []
        )
      );
    } catch {
      setUsageItems([]);
      setModelPrices({});
    }
  }, [managementKey, resolveUsageServiceBase]);

  useEffect(() => {
    queueMicrotask(() => {
      void refresh();
    });
  }, [refresh, usageServiceRevision]);

  const summaries = useMemo(
    () => buildSummariesByFileName(files, usageItems, modelPrices),
    [files, modelPrices, usageItems]
  );

  return { summaries, refresh };
};
