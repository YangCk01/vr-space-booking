import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/api/client'
import { toast } from 'sonner'
import { Loader2, Plus, Trash2, Save, Settings, X, Send } from 'lucide-react'

interface ReconConfig {
  id: string
  key: string
  value: string
  description: string | null
  updatedAt: string
}

async function getConfigs() {
  const res = await apiClient.get('/recon/configs')
  return (res.data.data || []) as ReconConfig[]
}

async function upsertConfig(key: string, value: string, description?: string) {
  const res = await apiClient.put('/recon/configs', { key, value, description })
  return res.data
}

async function deleteConfig(key: string) {
  const res = await apiClient.delete(`/recon/configs/${key}`)
  return res.data
}

const presetKeys = [
  { key: 'WECHAT_MCH_ID', label: '微信支付商户号', example: '1234567890' },
  { key: 'ALIPAY_APP_ID', label: '支付宝 App ID', example: '2024xxxxxxxx' },
  { key: 'CHANNEL_FEE_RATE', label: '渠道手续费率', example: '0.006' },
  { key: 'HARDWARE_MISMATCH_THRESHOLD', label: '硬件差异率阈值', example: '0.05' },
  { key: 'HARDWARE_TEST_START', label: '设备测试时段开始', example: '09:00' },
  { key: 'HARDWARE_TEST_END', label: '设备测试时段结束', example: '10:00' },
  { key: 'WEBHOOK_URL', label: '告警 Webhook 地址', example: 'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=xxx' },
  { key: 'WEBHOOK_TYPE', label: 'Webhook 类型', example: 'wecom / dingtalk / lark / generic' },
]

export default function ReconConfigPanel() {
  const queryClient = useQueryClient()
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [newKey, setNewKey] = useState('')
  const [newValue, setNewValue] = useState('')
  const [newDesc, setNewDesc] = useState('')

  const { data: configs, isLoading } = useQuery({
    queryKey: ['recon-configs'],
    queryFn: getConfigs,
  })

  const upsertMut = useMutation({
    mutationFn: ({ key, value, description }: { key: string; value: string; description?: string }) =>
      upsertConfig(key, value, description),
    onSuccess: () => {
      toast.success('配置已保存')
      setEditingKey(null)
      setNewKey('')
      setNewValue('')
      setNewDesc('')
      queryClient.invalidateQueries({ queryKey: ['recon-configs'] })
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || '保存失败')
    },
  })

  const deleteMut = useMutation({
    mutationFn: deleteConfig,
    onSuccess: () => {
      toast.success('配置已删除')
      queryClient.invalidateQueries({ queryKey: ['recon-configs'] })
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || '删除失败')
    },
  })

  const testWebhookMut = useMutation({
    mutationFn: async () => {
      const urlConfig = configs?.find((c) => c.key === 'WEBHOOK_URL')
      const typeConfig = configs?.find((c) => c.key === 'WEBHOOK_TYPE')
      if (!urlConfig?.value) throw new Error('未配置 WEBHOOK_URL')
      const res = await apiClient.post('/recon/webhook-test', {
        url: urlConfig.value,
        type: typeConfig?.value || 'generic',
      })
      return res.data
    },
    onSuccess: (data) => {
      toast.success(data?.message || '测试消息已发送')
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || err?.message || '测试失败')
    },
  })

  const startNew = () => {
    setEditingKey('__new__')
    setNewKey('')
    setNewValue('')
    setNewDesc('')
  }

  const startEdit = (config: ReconConfig) => {
    setEditingKey(config.key)
    setNewKey(config.key)
    setNewValue(config.value)
    setNewDesc(config.description || '')
  }

  const cancelEdit = () => {
    setEditingKey(null)
    setNewKey('')
    setNewValue('')
    setNewDesc('')
  }

  const saveEdit = () => {
    const key = editingKey === '__new__' ? newKey.trim() : editingKey
    if (!key) {
      toast.error('请输入配置键名')
      return
    }
    if (!newValue.trim()) {
      toast.error('请输入配置值')
      return
    }
    upsertMut.mutate({ key, value: newValue.trim(), description: newDesc.trim() || undefined })
  }

  const applyPreset = (preset: typeof presetKeys[0]) => {
    setNewKey(preset.key)
    setNewDesc(preset.label)
    setNewValue('')
  }

  const isEditing = editingKey !== null

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-vr-body-sm font-medium text-vrtext-primary flex items-center gap-2">
          <Settings className="w-4 h-4 text-vraccent-primary" />
          对账配置
        </h3>
        {!isEditing && (
          <button
            onClick={startNew}
            className="flex items-center gap-1 px-2 py-1 rounded-lg text-vr-caption text-vraccent-primary hover:bg-vraccent-primary/10 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            新增配置
          </button>
        )}
      </div>

      {/* Edit / New Form */}
      {isEditing && (
        <div className="bg-vrbg-surface rounded-lg p-4 border border-vrborder-subtle space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-vrtext-primary">
              {editingKey === '__new__' ? '新增配置' : '编辑配置'}
            </span>
            <button onClick={cancelEdit} className="text-vrtext-muted hover:text-vrtext-primary">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-vr-caption text-vrtext-muted block mb-1">键名</label>
              <input
                value={newKey}
                onChange={(e) => setNewKey(e.target.value)}
                placeholder="如 WECHAT_MCH_ID"
                disabled={editingKey !== '__new__'}
                className="w-full h-9 px-3 rounded-lg bg-vrbg-card border border-vrborder-subtle text-sm text-vrtext-primary placeholder:text-vrtext-muted focus:outline-none focus:border-vraccent-primary disabled:opacity-50"
              />
            </div>
            <div>
              <label className="text-vr-caption text-vrtext-muted block mb-1">值</label>
              <input
                value={newValue}
                onChange={(e) => setNewValue(e.target.value)}
                placeholder={presetKeys.find(p => p.key === newKey)?.example || '配置值'}
                className="w-full h-9 px-3 rounded-lg bg-vrbg-card border border-vrborder-subtle text-sm text-vrtext-primary placeholder:text-vrtext-muted focus:outline-none focus:border-vraccent-primary"
              />
            </div>
          </div>

          <div>
            <label className="text-vr-caption text-vrtext-muted block mb-1">描述（可选）</label>
            <input
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
              placeholder="配置说明"
              className="w-full h-9 px-3 rounded-lg bg-vrbg-card border border-vrborder-subtle text-sm text-vrtext-primary placeholder:text-vrtext-muted focus:outline-none focus:border-vraccent-primary"
            />
          </div>

          {editingKey === '__new__' && (
            <div>
              <p className="text-vr-caption text-vrtext-muted mb-2">快速选择预设配置项：</p>
              <div className="flex flex-wrap gap-2">
                {presetKeys.map((preset) => (
                  <button
                    key={preset.key}
                    onClick={() => applyPreset(preset)}
                    className={`px-2.5 py-1.5 rounded-lg text-vr-caption border transition-colors ${
                      newKey === preset.key
                        ? 'bg-vraccent-primary/10 border-vraccent-primary text-vraccent-primary'
                        : 'bg-vrbg-card border-vrborder-subtle text-vrtext-secondary hover:text-vrtext-primary hover:border-vraccent-primary/50'
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              onClick={cancelEdit}
              className="px-3 py-1.5 rounded-lg text-sm text-vrtext-secondary hover:text-vrtext-primary transition-colors"
            >
              取消
            </button>
            <button
              onClick={saveEdit}
              disabled={upsertMut.isPending}
              className="px-3 py-1.5 rounded-lg text-sm bg-vraccent-primary text-white hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center gap-1.5"
            >
              {upsertMut.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              保存
            </button>
          </div>
        </div>
      )}

      {/* Config List */}
      {isLoading ? (
        <div className="flex items-center gap-2 text-vrtext-muted text-sm">
          <Loader2 className="w-4 h-4 animate-spin" />
          加载中...
        </div>
      ) : !configs || configs.length === 0 ? (
        <div className="text-center py-6 text-vrtext-muted text-sm">
          暂无配置项，点击「新增配置」添加
        </div>
      ) : (
        <div className="space-y-2">
          {configs.map((config) => (
            <div
              key={config.key}
              className="flex items-center justify-between bg-vrbg-surface rounded-lg p-3 border border-vrborder-subtle"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-vrtext-primary">{config.key}</span>
                  {config.description && (
                    <span className="text-vr-caption text-vrtext-muted truncate">{config.description}</span>
                  )}
                </div>
                <div className="text-sm text-vraccent-primary font-mono mt-0.5">{config.value}</div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {config.key === 'WEBHOOK_URL' && (
                  <button
                    onClick={() => testWebhookMut.mutate()}
                    disabled={testWebhookMut.isPending}
                    className="px-2 py-1 rounded text-xs text-emerald-400 hover:bg-emerald-500/10 transition-colors disabled:opacity-50 flex items-center gap-1"
                  >
                    {testWebhookMut.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                    测试
                  </button>
                )}
                <button
                  onClick={() => startEdit(config)}
                  className="px-2 py-1 rounded text-xs text-vrtext-secondary hover:text-vrtext-primary hover:bg-vrbg-card transition-colors"
                >
                  编辑
                </button>
                <button
                  onClick={() => {
                    if (window.confirm(`确定删除配置「${config.key}」吗？`)) {
                      deleteMut.mutate(config.key)
                    }
                  }}
                  disabled={deleteMut.isPending}
                  className="px-2 py-1 rounded text-xs text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
