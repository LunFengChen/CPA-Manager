import { apiClient } from './client';

export interface ProxyEntry {
  id: string;
  url: string;
  group?: string;
  label?: string;
  disabled?: boolean;
  available?: boolean;
  check_error?: string;
  last_checked?: string;
  ip?: string;
  country?: string;
  region?: string;
  city?: string;
  assigned_to?: string[];
}

export interface ProxyUpsertPayload {
  url: string;
  group?: string;
  label?: string;
  disabled?: boolean;
}

export interface ProxyAssignResult {
  status?: string;
  proxy_url?: string;
  updated?: string[];
  not_found?: string[];
  skipped?: string[];
  proxy_count?: number;
}

export interface SessionImportError {
  index: number;
  message: string;
}

export interface SessionImportResult {
  total: number;
  created: number;
  failed: number;
  proxy_url?: string;
  files?: string[];
  errors?: SessionImportError[];
}

export const proxiesApi = {
  list: () => apiClient.get<ProxyEntry[]>('/proxies'),

  create: (payload: ProxyUpsertPayload) => apiClient.post<ProxyEntry>('/proxies', payload),

  update: (id: string, payload: ProxyUpsertPayload) =>
    apiClient.put<ProxyEntry>(`/proxies/${encodeURIComponent(id)}`, payload),

  delete: (id: string) => apiClient.delete(`/proxies/${encodeURIComponent(id)}`),

  assign: (id: string, authIds: string[]) =>
    apiClient.post<ProxyAssignResult>(`/proxies/${encodeURIComponent(id)}/assign`, {
      auth_ids: authIds
    }),

  autoAssign: () => apiClient.post<ProxyAssignResult>('/proxies/auto-assign', {}),

  importSessionText: (payload: { content: string; proxy_url?: string; name?: string }) =>
    apiClient.post<SessionImportResult>('/auth-files/import-session-text', payload)
};
