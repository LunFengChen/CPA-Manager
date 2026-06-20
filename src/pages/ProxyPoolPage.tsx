import { useCallback, useEffect, useMemo, useState, type ChangeEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { authFilesApi, proxiesApi, type ProxyEntry } from '@/services/api';
import { useNotificationStore } from '@/stores';
import type { AuthFileItem } from '@/types/authFile';
import { getErrorMessage } from '@/utils/helpers';
import styles from './ProxyPoolPage.module.scss';

type ProxyFormState = {
  id?: string;
  url: string;
  group: string;
  label: string;
  disabled: boolean;
};


const emptyProxyForm: ProxyFormState = {
  url: '',
  group: '',
  label: '',
  disabled: false
};

const getAuthFileId = (file: AuthFileItem): string => {
  const raw = file.id ?? file.name;
  return String(raw ?? '').trim();
};

const getAuthFileLabel = (file: AuthFileItem): string => {
  const id = getAuthFileId(file);
  return file.name ? `${file.name}${id && id !== file.name ? ` · ${id}` : ''}` : id;
};

const countryFlag = (country?: string): string => {
  const code = String(country ?? '').trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) return '';
  return Array.from(code)
    .map((char) => String.fromCodePoint(127397 + char.charCodeAt(0)))
    .join('');
};

export function ProxyPoolPage() {
  const { t } = useTranslation();
  const { showNotification } = useNotificationStore();
  const [proxies, setProxies] = useState<ProxyEntry[]>([]);
  const [authFiles, setAuthFiles] = useState<AuthFileItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingProxy, setSavingProxy] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [autoAssigning, setAutoAssigning] = useState(false);
  const [proxyForm, setProxyForm] = useState<ProxyFormState>(emptyProxyForm);
  const [selectedProxyId, setSelectedProxyId] = useState('');
  const [selectedAuthIds, setSelectedAuthIds] = useState<Set<string>>(() => new Set());

  const activeProxyCount = useMemo(
    () => proxies.filter((proxy) => proxy.url.trim() && !proxy.disabled && proxy.available !== false).length,
    [proxies]
  );
  const unassignedAuthCount = useMemo(
    () =>
      authFiles.filter((file) => {
        const proxyURL = file.proxy_url ?? file.proxyUrl;
        return typeof proxyURL !== 'string' || proxyURL.trim() === '';
      }).length,
    [authFiles]
  );

  const selectedProxy = useMemo(
    () => proxies.find((proxy) => proxy.id === selectedProxyId),
    [proxies, selectedProxyId]
  );

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [nextProxies, authResponse] = await Promise.all([proxiesApi.list(), authFilesApi.list()]);
      setProxies(Array.isArray(nextProxies) ? nextProxies : []);
      setAuthFiles(Array.isArray(authResponse.files) ? authResponse.files : []);
      if (!selectedProxyId && nextProxies.length > 0) {
        setSelectedProxyId(nextProxies[0].id);
      }
    } catch (err: unknown) {
      showNotification(
        `${t('proxy_pool.load_failed', { defaultValue: '加载代理池失败' })}: ${getErrorMessage(err)}`,
        'error'
      );
    } finally {
      setLoading(false);
    }
  }, [selectedProxyId, showNotification, t]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const resetProxyForm = () => setProxyForm(emptyProxyForm);

  const editProxy = (proxy: ProxyEntry) => {
    setProxyForm({
      id: proxy.id,
      url: proxy.url,
      group: proxy.group ?? '',
      label: proxy.label ?? '',
      disabled: proxy.disabled === true
    });
  };

  const submitProxy = async () => {
    const url = proxyForm.url.trim();
    if (!url) {
      showNotification(t('proxy_pool.proxy_url_required', { defaultValue: '请填写代理 URL' }), 'warning');
      return;
    }
    setSavingProxy(true);
    try {
      const payload = {
        url,
        group: proxyForm.group.trim() || undefined,
        label: proxyForm.label.trim() || undefined,
        disabled: proxyForm.disabled
      };
      if (proxyForm.id) {
        await proxiesApi.update(proxyForm.id, payload);
        showNotification(t('proxy_pool.proxy_updated', { defaultValue: '代理已更新' }), 'success');
      } else {
        await proxiesApi.create(payload);
        showNotification(t('proxy_pool.proxy_created', { defaultValue: '代理已添加' }), 'success');
      }
      resetProxyForm();
      await loadData();
      window.setTimeout(() => {
        void loadData();
      }, 3500);
    } catch (err: unknown) {
      showNotification(getErrorMessage(err, t('proxy_pool.save_failed', { defaultValue: '保存代理失败' })), 'error');
    } finally {
      setSavingProxy(false);
    }
  };

  const deleteProxy = async (proxy: ProxyEntry) => {
    if (!window.confirm(t('proxy_pool.delete_confirm', { defaultValue: '确认删除这个代理？' }))) {
      return;
    }
    try {
      await proxiesApi.delete(proxy.id);
      if (selectedProxyId === proxy.id) {
        setSelectedProxyId('');
      }
      showNotification(t('proxy_pool.proxy_deleted', { defaultValue: '代理已删除' }), 'success');
      await loadData();
    } catch (err: unknown) {
      showNotification(getErrorMessage(err, t('proxy_pool.delete_failed', { defaultValue: '删除代理失败' })), 'error');
    }
  };

  const toggleDisabled = async (proxy: ProxyEntry) => {
    try {
      await proxiesApi.update(proxy.id, {
        url: proxy.url,
        group: proxy.group,
        label: proxy.label,
        disabled: !proxy.disabled
      });
      await loadData();
    } catch (err: unknown) {
      showNotification(getErrorMessage(err, t('proxy_pool.save_failed', { defaultValue: '保存代理失败' })), 'error');
    }
  };

  const handleAuthSelection = (event: ChangeEvent<HTMLInputElement>, authId: string) => {
    const checked = event.target.checked;
    setSelectedAuthIds((current) => {
      const next = new Set(current);
      if (checked) {
        next.add(authId);
      } else {
        next.delete(authId);
      }
      return next;
    });
  };

  const assignProxy = async () => {
    if (!selectedProxyId) {
      showNotification(t('proxy_pool.select_proxy_required', { defaultValue: '请选择代理' }), 'warning');
      return;
    }
    const authIds = Array.from(selectedAuthIds);
    if (authIds.length === 0) {
      showNotification(t('proxy_pool.select_auth_required', { defaultValue: '请选择要绑定的账号' }), 'warning');
      return;
    }
    setAssigning(true);
    try {
      const result = await proxiesApi.assign(selectedProxyId, authIds);
      showNotification(
        t('proxy_pool.assign_success', {
          defaultValue: '已绑定 {{count}} 个账号',
          count: result.updated?.length ?? authIds.length
        }),
        'success'
      );
      setSelectedAuthIds(new Set());
      await loadData();
    } catch (err: unknown) {
      showNotification(getErrorMessage(err, t('proxy_pool.assign_failed', { defaultValue: '绑定失败' })), 'error');
    } finally {
      setAssigning(false);
    }
  };

  const autoAssignProxy = async () => {
    if (!window.confirm(t('proxy_pool.auto_assign_confirm', { defaultValue: '自动给没有单独 proxy_url 的账号分配可用代理？已有单独代理的账号不会改。' }))) {
      return;
    }
    setAutoAssigning(true);
    try {
      const result = await proxiesApi.autoAssign();
      showNotification(
        t('proxy_pool.auto_assign_success', {
          defaultValue: '已自动分配 {{count}} 个账号',
          count: result.updated?.length ?? 0
        }),
        'success'
      );
      await loadData();
    } catch (err: unknown) {
      showNotification(getErrorMessage(err, t('proxy_pool.assign_failed', { defaultValue: '绑定失败' })), 'error');
    } finally {
      setAutoAssigning(false);
    }
  };


  return (
    <div className={styles.container}>
      <h1 className={styles.pageTitle}>{t('proxy_pool.title', { defaultValue: '代理池' })}</h1>

      <div className={styles.summaryGrid}>
        <div className={styles.summaryItem}>
          <span>{t('proxy_pool.total_proxies', { defaultValue: '代理总数' })}</span>
          <strong>{proxies.length}</strong>
        </div>
        <div className={styles.summaryItem}>
          <span>{t('proxy_pool.active_proxies', { defaultValue: '可用代理' })}</span>
          <strong>{activeProxyCount}</strong>
        </div>
        <div className={styles.summaryItem}>
          <span>{t('proxy_pool.auth_files', { defaultValue: '认证账号' })}</span>
          <strong>{authFiles.length}</strong>
        </div>
      </div>

      <div className={styles.content}>
        <Card
          title={t('proxy_pool.pool_card_title', { defaultValue: '代理池' })}
          extra={
            <Button variant="secondary" size="sm" onClick={loadData} loading={loading}>
              {t('common.refresh', { defaultValue: '刷新' })}
            </Button>
          }
        >
          <div className={styles.cardContent}>
            <p className={styles.cardHint}>
              {t('proxy_pool.pool_hint', {
                defaultValue: '导入账号时如果没有手动填写 proxy_url，会自动从可用代理中选择绑定数量最少的一个。'
              })}
            </p>

            <div className={styles.formGrid}>
              <Input
                label={t('proxy_pool.proxy_url', { defaultValue: '代理 URL' })}
                placeholder="38.111.61.59:443:user:pass（自动按 socks5）或显式 http://..."
                value={proxyForm.url}
                onChange={(event) => setProxyForm((prev) => ({ ...prev, url: event.target.value }))}
              />
              <Input
                label={t('proxy_pool.proxy_group', { defaultValue: '分组 / 地区' })}
                placeholder="US:California"
                value={proxyForm.group}
                onChange={(event) => setProxyForm((prev) => ({ ...prev, group: event.target.value }))}
              />
              <Input
                label={t('proxy_pool.proxy_label', { defaultValue: '备注' })}
                placeholder={t('proxy_pool.proxy_label_placeholder', { defaultValue: '可选备注' })}
                value={proxyForm.label}
                onChange={(event) => setProxyForm((prev) => ({ ...prev, label: event.target.value }))}
              />
            </div>

            <label className={styles.checkboxLine}>
              <input
                type="checkbox"
                checked={proxyForm.disabled}
                onChange={(event) =>
                  setProxyForm((prev) => ({ ...prev, disabled: event.target.checked }))
                }
              />
              <span>{t('proxy_pool.disabled_proxy', { defaultValue: '禁用这个代理' })}</span>
            </label>

            <div className={styles.actionRow}>
              <Button onClick={submitProxy} loading={savingProxy}>
                {proxyForm.id
                  ? t('proxy_pool.update_proxy', { defaultValue: '更新代理' })
                  : t('proxy_pool.add_proxy', { defaultValue: '添加代理' })}
              </Button>
              {proxyForm.id ? (
                <Button variant="secondary" onClick={resetProxyForm}>
                  {t('common.cancel', { defaultValue: '取消' })}
                </Button>
              ) : null}
            </div>

            <div className={styles.proxyList}>
              {proxies.length === 0 ? (
                <div className={styles.emptyState}>
                  {loading
                    ? t('common.loading', { defaultValue: '加载中...' })
                    : t('proxy_pool.empty', { defaultValue: '还没有代理，先添加一个。' })}
                </div>
              ) : (
                proxies.map((proxy) => (
                  <div className={styles.proxyRow} key={proxy.id}>
                    <div className={styles.proxyMain}>
                      <div className={styles.proxyUrl}>{proxy.url}</div>
                      <div className={styles.proxyMeta}>
                        {proxy.country || proxy.region || proxy.city ? (
                          <span>
                            {countryFlag(proxy.country)} {[proxy.country, proxy.region, proxy.city].filter(Boolean).join(' / ')}
                          </span>
                        ) : proxy.group ? (
                          <span>{proxy.group}</span>
                        ) : null}
                        {proxy.ip ? <span>IP {proxy.ip}</span> : null}
                        {proxy.label ? <span>{proxy.label}</span> : null}
                        {proxy.last_checked ? (
                          <span>
                            {t('proxy_pool.last_checked', { defaultValue: '检测' })} {new Date(proxy.last_checked).toLocaleString()}
                          </span>
                        ) : (
                          <span>{t('proxy_pool.checking', { defaultValue: '等待检测' })}</span>
                        )}
                        {proxy.check_error ? <span className={styles.proxyError}>{proxy.check_error}</span> : null}
                        <span>
                          {t('proxy_pool.assigned_count', {
                            defaultValue: '已绑定 {{count}} 个账号',
                            count: proxy.assigned_to?.length ?? 0
                          })}
                        </span>
                      </div>
                    </div>
                    <div className={styles.rowActions}>
                      <span className={`status-badge ${proxy.disabled || proxy.available === false ? 'error' : 'success'}`}>
                        {proxy.disabled
                          ? t('proxy_pool.disabled', { defaultValue: '已禁用' })
                          : proxy.available === false
                            ? t('proxy_pool.unavailable', { defaultValue: '不可用' })
                            : proxy.available === true
                              ? t('proxy_pool.available', { defaultValue: '可用' })
                          : t('proxy_pool.enabled', { defaultValue: '可用' })}
                      </span>
                      <Button variant="secondary" size="sm" onClick={() => editProxy(proxy)}>
                        {t('common.edit', { defaultValue: '编辑' })}
                      </Button>
                      <Button variant="secondary" size="sm" onClick={() => toggleDisabled(proxy)}>
                        {proxy.disabled
                          ? t('proxy_pool.enable', { defaultValue: '启用' })
                          : t('proxy_pool.disable', { defaultValue: '禁用' })}
                      </Button>
                      <Button variant="danger" size="sm" onClick={() => deleteProxy(proxy)}>
                        {t('common.delete', { defaultValue: '删除' })}
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </Card>

        <Card title={t('proxy_pool.assign_card_title', { defaultValue: '手动绑定账号' })}>
          <div className={styles.cardContent}>
            <p className={styles.cardHint}>
              {t('proxy_pool.assign_hint', {
                defaultValue: '选择一个代理和若干认证账号，保存后会把这些账号 JSON 里的 proxy_url 写成该代理。'
              })}
              {' '}
              {t('proxy_pool.unassigned_hint', {
                defaultValue: '当前没有单独代理的账号：{{count}} 个。',
                count: unassignedAuthCount
              })}
            </p>
            <div className={styles.formItem}>
              <label htmlFor="proxy-pool-select">{t('proxy_pool.select_proxy', { defaultValue: '选择代理' })}</label>
              <select
                id="proxy-pool-select"
                className={styles.select}
                value={selectedProxyId}
                onChange={(event) => setSelectedProxyId(event.target.value)}
              >
                <option value="">{t('proxy_pool.select_proxy_placeholder', { defaultValue: '请选择代理' })}</option>
                {proxies.map((proxy) => (
                  <option key={proxy.id} value={proxy.id}>
                    {proxy.label || proxy.group || proxy.url} · {proxy.url}
                  </option>
                ))}
              </select>
            </div>
            {selectedProxy ? <div className={styles.selectedProxyUrl}>{selectedProxy.url}</div> : null}
            <div className={styles.authList}>
              {authFiles.length === 0 ? (
                <div className={styles.emptyState}>
                  {t('proxy_pool.no_auth_files', { defaultValue: '暂无认证账号' })}
                </div>
              ) : (
                authFiles.map((file) => {
                  const authId = getAuthFileId(file);
                  if (!authId) return null;
                  return (
                    <label className={styles.authItem} key={authId}>
                      <input
                        type="checkbox"
                        checked={selectedAuthIds.has(authId)}
                        onChange={(event) => handleAuthSelection(event, authId)}
                      />
                      <span>{getAuthFileLabel(file)}</span>
                    </label>
                  );
                })
              )}
            </div>
            <div className={styles.actionRow}>
              <Button onClick={assignProxy} loading={assigning}>
                {t('proxy_pool.assign_button', { defaultValue: '绑定选中账号' })}
              </Button>
              <Button variant="secondary" onClick={autoAssignProxy} loading={autoAssigning}>
                {t('proxy_pool.auto_assign_button', { defaultValue: '自动分配未绑定账号' })}
              </Button>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
