import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { proxiesApi } from '@/services/api';
import { useNotificationStore } from '@/stores';
import { getErrorMessage } from '@/utils/helpers';
import styles from './SessionTextImportCard.module.scss';

interface SessionTextImportCardProps {
  disabled?: boolean;
  onImported?: () => void | Promise<void>;
}

interface ImportResultView {
  created: number;
  failed: number;
  total: number;
  proxyUrl?: string;
  files: string[];
  errors: string[];
}

export function SessionTextImportCard({ disabled = false, onImported }: SessionTextImportCardProps) {
  const { t } = useTranslation();
  const showNotification = useNotificationStore((state) => state.showNotification);
  const [sessionText, setSessionText] = useState('');
  const [proxyUrl, setProxyUrl] = useState('');
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResultView | null>(null);

  const importSession = async () => {
    const content = sessionText.trim();
    if (!content) {
      showNotification(t('proxy_pool.import_content_required', { defaultValue: '请粘贴 session 文本' }), 'warning');
      return;
    }
    setImporting(true);
    setResult(null);
    try {
      const response = await proxiesApi.importSessionText({
        content,
        proxy_url: proxyUrl.trim() || undefined
      });
      setResult({
        created: response.created,
        failed: response.failed,
        total: response.total,
        proxyUrl: response.proxy_url,
        files: response.files ?? [],
        errors: (response.errors ?? []).map((item) => `#${item.index}: ${item.message}`)
      });
      showNotification(
        t('proxy_pool.import_success', {
          defaultValue: '已导入 {{count}} 个账号',
          count: response.created
        }),
        response.failed > 0 ? 'warning' : 'success'
      );
      if (response.created > 0) {
        setSessionText('');
      }
      await onImported?.();
    } catch (err: unknown) {
      showNotification(getErrorMessage(err, t('proxy_pool.import_failed', { defaultValue: '导入失败' })), 'error');
    } finally {
      setImporting(false);
    }
  };

  return (
    <Card title={t('proxy_pool.import_card_title', { defaultValue: '导入 GPT Session 文本' })}>
      <div className={styles.cardContent}>
        <p className={styles.cardHint}>
          {t('proxy_pool.import_hint', {
            defaultValue: '可以粘贴夹杂其他内容的大段文本，会自动提取其中的 JSON，再转换成 CPA auth JSON 导入。'
          })}
        </p>
        <Input
          label={t('proxy_pool.import_proxy_url', { defaultValue: '本次导入指定代理 URL（可选）' })}
          hint={t('proxy_pool.import_proxy_hint', {
            defaultValue: '留空时自动从代理池选择；填写后会先加入代理池并写入导入账号的 proxy_url。'
          })}
          placeholder="http://user:pass@proxy.example:8080"
          value={proxyUrl}
          disabled={disabled || importing}
          onChange={(event) => setProxyUrl(event.target.value)}
        />
        <div className={styles.formItem}>
          <label htmlFor="session-import-text">
            {t('proxy_pool.import_content', { defaultValue: 'Session 文本' })}
          </label>
          <textarea
            id="session-import-text"
            className={styles.textarea}
            rows={10}
            value={sessionText}
            disabled={disabled || importing}
            onChange={(event) => setSessionText(event.target.value)}
            placeholder={t('proxy_pool.import_placeholder', {
              defaultValue: '{}dadad{}123sd，也可以包含换行和其他说明文字'
            })}
          />
        </div>
        <div className={styles.actionRow}>
          <Button onClick={importSession} loading={importing} disabled={disabled}>
            {t('proxy_pool.import_button', { defaultValue: '转换并导入' })}
          </Button>
        </div>
        {result ? (
          <div className={styles.resultBox}>
            <div className={styles.resultTitle}>
              {t('proxy_pool.import_result', {
                defaultValue: '导入结果：成功 {{created}} / 总计 {{total}} / 失败 {{failed}}',
                created: result.created,
                total: result.total,
                failed: result.failed
              })}
            </div>
            {result.proxyUrl ? (
              <div className={styles.keyValueItem}>
                <span>{t('proxy_pool.used_proxy', { defaultValue: '使用代理' })}</span>
                <strong>{result.proxyUrl}</strong>
              </div>
            ) : null}
            {result.files.length > 0 ? (
              <div className={styles.keyValueItem}>
                <span>{t('proxy_pool.created_files', { defaultValue: '创建文件' })}</span>
                <strong>{result.files.join(', ')}</strong>
              </div>
            ) : null}
            {result.errors.length > 0 ? (
              <div className={styles.errorList}>
                {result.errors.map((error) => (
                  <div key={error}>{error}</div>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </Card>
  );
}
