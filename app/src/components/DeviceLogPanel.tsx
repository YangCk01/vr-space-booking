import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/api/client'
import { toast } from 'sonner'
import { format, parse } from 'date-fns'
import { DateFilterPicker } from '@/components/ui/date-filter-picker'
import { cn } from '@/lib/utils'
import {
  Loader2, Plus, Trash2, Save, X, Monitor, Users, Gamepad2,
  AlertTriangle, CheckCircle, BarChart3, Upload, Download, FileSpreadsheet,
} from 'lucide-react'
import * as XLSX from 'xlsx'

interface DeviceLog {
  id: string
  deviceId: string
  venueId: string
  venue?: { name: string }
  appPackageName: string
  appName: string | null
  sessionStartAt: string
  sessionEndAt: string | null
  sessionDurationSec: number
  isCompleted: boolean
  isTestSession: boolean
  playerCount: number
  createdAt: string
}

interface HardwareStats {
  venueId: string
  date: string
  hardwareCount: number
  systemCount: number
  diffRate: number
  diffRatePercent: string
  threshold: number
  isMismatch: boolean
}

async function getDeviceLogs(params: { venueId?: string; date?: string }) {
  const res = await apiClient.get('/device-logs', { params })
  return (res.data.data || []) as DeviceLog[]
}

async function getHardwareStats(venueId: string, date: string) {
  const res = await apiClient.get('/device-logs/stats', { params: { venueId, date } })
  return res.data.data as HardwareStats
}

async function createDeviceLog(data: any) {
  const res = await apiClient.post('/device-logs', data)
  return res.data
}

async function batchCreateDeviceLogs(venueId: string, logs: any[]) {
  const res = await apiClient.post('/device-logs/batch', { venueId, logs })
  return res.data
}

async function deleteDeviceLog(id: string) {
  const res = await apiClient.delete(`/device-logs/${id}`)
  return res.data
}

// ===== 模板字段说明 =====
const TEMPLATE_HEADERS = [
  '设备ID',
  '游戏包名',
  '开始时间(yyyy-MM-dd HH:mm:ss)',
  '结束时间(yyyy-MM-dd HH:mm:ss)',
  '运行秒数',
  '是否完成(是/否)',
  '游玩人数',
]

const TEMPLATE_EXAMPLE = [
  ['PICO001', 'com.vrspace.starexpedition', '2026-05-28 11:30:00', '2026-05-28 11:45:00', '900', '是', '2'],
  ['PICO002', 'com.vrspace.dino', '2026-05-28 14:00:00', '2026-05-28 14:20:00', '1200', '是', '4'],
  ['PICO001', 'com.vrspace.starexpedition', '2026-05-28 16:00:00', '', '0', '否', '1'],
]

export default function DeviceLogPanel({
  venues,
  canManage = false,
  canDelete = false,
}: {
  venues: any[]
  canManage?: boolean
  canDelete?: boolean
}) {
  const queryClient = useQueryClient()
  const [selectedVenue, setSelectedVenue] = useState('')
  const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [showForm, setShowForm] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [form, setForm] = useState({
    deviceId: '',
    appPackageName: 'com.vrspace.default',
    sessionStartAt: '',
    sessionEndAt: '',
    sessionDurationSec: 0,
    isCompleted: true,
    playerCount: 1,
  })

  const { data: logs, isLoading: logsLoading } = useQuery({
    queryKey: ['device-logs', selectedVenue, selectedDate],
    queryFn: () => getDeviceLogs({ venueId: selectedVenue || undefined, date: selectedDate }),
  })

  const { data: stats } = useQuery({
    queryKey: ['device-log-stats', selectedVenue, selectedDate],
    queryFn: () => selectedVenue ? getHardwareStats(selectedVenue, selectedDate) : null,
    enabled: !!selectedVenue,
  })

  const createMut = useMutation({
    mutationFn: createDeviceLog,
    onSuccess: () => {
      toast.success('设备日志已添加')
      setShowForm(false)
      setForm({
        deviceId: '',
        appPackageName: 'com.vrspace.default',
        sessionStartAt: '',
        sessionEndAt: '',
        sessionDurationSec: 0,
        isCompleted: true,
        playerCount: 1,
      })
      queryClient.invalidateQueries({ queryKey: ['device-logs'] })
      queryClient.invalidateQueries({ queryKey: ['device-log-stats'] })
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || '添加失败')
    },
  })

  const batchMut = useMutation({
    mutationFn: ({ venueId, logs }: { venueId: string; logs: any[] }) =>
      batchCreateDeviceLogs(venueId, logs),
    onSuccess: (data) => {
      toast.success(`成功导入 ${data.data?.imported || 0} 条设备日志`)
      queryClient.invalidateQueries({ queryKey: ['device-logs'] })
      queryClient.invalidateQueries({ queryKey: ['device-log-stats'] })
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || '批量导入失败')
    },
  })

  const deleteMut = useMutation({
    mutationFn: deleteDeviceLog,
    onSuccess: () => {
      toast.success('已删除')
      queryClient.invalidateQueries({ queryKey: ['device-logs'] })
      queryClient.invalidateQueries({ queryKey: ['device-log-stats'] })
    },
  })

  const handleSubmit = () => {
    if (!selectedVenue) {
      toast.error('请先选择门店')
      return
    }
    if (!form.deviceId || !form.sessionStartAt) {
      toast.error('请填写设备ID和开始时间')
      return
    }
    createMut.mutate({
      venueId: selectedVenue,
      ...form,
      sessionStartAt: new Date(form.sessionStartAt).toISOString(),
      sessionEndAt: form.sessionEndAt ? new Date(form.sessionEndAt).toISOString() : null,
    })
  }

  // ===== 下载模板 =====
  const downloadTemplate = () => {
    const ws = XLSX.utils.aoa_to_sheet([TEMPLATE_HEADERS, ...TEMPLATE_EXAMPLE])
    ws['!cols'] = [
      { wch: 12 }, { wch: 30 }, { wch: 24 }, { wch: 24 },
      { wch: 10 }, { wch: 12 }, { wch: 10 },
    ]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, '设备日志模板')
    XLSX.writeFile(wb, `设备日志导入模板_${format(new Date(), 'yyyyMMdd')}.xlsx`)
  }

  // ===== 解析并导入 Excel/CSV =====
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!selectedVenue) {
      toast.error('请先选择门店')
      e.target.value = ''
      return
    }

    const reader = new FileReader()
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result
        const wb = XLSX.read(bstr, { type: 'binary' })
        const wsname = wb.SheetNames[0]
        const ws = wb.Sheets[wsname]
        const data = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, defval: '' })

        if (data.length < 2) {
          toast.error('表格数据为空或格式不正确')
          return
        }

        // 支持有表头和没表头两种情况
        // 如果第一行包含"设备ID"，则跳过；否则从第一行开始
        let startRow = 0
        const firstRow = data[0]
        if (firstRow[0] && String(firstRow[0]).includes('设备')) {
          startRow = 1
        }

        const parsedLogs: any[] = []
        const errors: string[] = []

        for (let i = startRow; i < data.length; i++) {
          const row = data[i]
          if (!row[0]) continue // 跳过空行

          const deviceId = String(row[0]).trim()
          const appPackageName = String(row[1] || 'com.vrspace.default').trim()
          const startTimeStr = String(row[2]).trim()
          const endTimeStr = String(row[3] || '').trim()
          const durationSec = parseInt(String(row[4] || '0').trim()) || 0
          const isCompletedStr = String(row[5] || '是').trim()
          const playerCount = parseInt(String(row[6] || '1').trim()) || 1

          // 解析开始时间（支持多种格式）
          let sessionStartAt: Date | null = null
          const formats = ['yyyy-MM-dd HH:mm:ss', 'yyyy/MM/dd HH:mm:ss', 'yyyy-MM-dd HH:mm', 'yyyy/MM/dd HH:mm']
          for (const f of formats) {
            try {
              const d = parse(startTimeStr, f, new Date())
              if (!isNaN(d.getTime())) {
                sessionStartAt = d
                break
              }
            } catch {}
          }
          // 尝试直接 new Date 解析
          if (!sessionStartAt) {
            const d = new Date(startTimeStr)
            if (!isNaN(d.getTime())) sessionStartAt = d
          }

          if (!sessionStartAt) {
            errors.push(`第${i + 1}行: 开始时间「${startTimeStr}」格式无法识别`)
            continue
          }

          // 解析结束时间
          let sessionEndAt: Date | null = null
          if (endTimeStr) {
            for (const f of formats) {
              try {
                const d = parse(endTimeStr, f, new Date())
                if (!isNaN(d.getTime())) {
                  sessionEndAt = d
                  break
                }
              } catch {}
            }
            if (!sessionEndAt) {
              const d = new Date(endTimeStr)
              if (!isNaN(d.getTime())) sessionEndAt = d
            }
          }

          parsedLogs.push({
            deviceId,
            appPackageName,
            sessionStartAt: sessionStartAt.toISOString(),
            sessionEndAt: sessionEndAt ? sessionEndAt.toISOString() : undefined,
            sessionDurationSec: durationSec,
            isCompleted: isCompletedStr === '是' || isCompletedStr === '1' || isCompletedStr === 'true',
            playerCount,
          })
        }

        if (errors.length > 0) {
          toast.error(`导入失败: ${errors.join('; ')}`)
          return
        }

        if (parsedLogs.length === 0) {
          toast.error('未解析到有效数据')
          return
        }

        batchMut.mutate({ venueId: selectedVenue, logs: parsedLogs })
      } catch (err: any) {
        toast.error('文件解析失败: ' + err.message)
      } finally {
        e.target.value = ''
      }
    }
    reader.readAsBinaryString(file)
  }

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3 bg-vrbg-card border border-vrborder-subtle rounded-xl p-4">
        <select
          value={selectedVenue}
          onChange={(e) => setSelectedVenue(e.target.value)}
          className="h-9 px-3 rounded-lg bg-vrbg-surface border border-vrborder-subtle text-sm text-vrtext-primary focus:outline-none focus:border-vraccent-primary"
        >
          <option value="">选择门店</option>
          {venues.map((v: any) => (
            <option key={v.id} value={v.id}>{v.name}</option>
          ))}
        </select>

        <DateFilterPicker
          mode="single"
          startDate={selectedDate}
          endDate={selectedDate}
          onChange={({ startDate }) => setSelectedDate(startDate)}
          allowClear={false}
        />

        <div className="h-5 w-[1px] bg-vrborder-subtle" />

        {canManage && (
          <>
            {/* 导入表格 */}
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={handleFileUpload}
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={batchMut.isPending}
              className="h-9 px-3 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center gap-1.5"
            >
              {batchMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              导入表格
            </button>
          </>
        )}

        <button
          onClick={downloadTemplate}
          className="h-9 px-3 rounded-lg bg-vrbg-surface border border-vrborder-subtle text-sm text-vrtext-secondary hover:text-vrtext-primary hover:border-vraccent-primary/50 transition-colors flex items-center gap-1.5"
        >
          <Download className="w-4 h-4" />
          下载模板
        </button>

        {canManage && (
          <button
            onClick={() => setShowForm(!showForm)}
            className="h-9 px-3 rounded-lg bg-vraccent-primary text-white text-sm font-medium hover:opacity-90 transition-opacity flex items-center gap-1.5"
          >
            {showForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
            {showForm ? '取消' : '单条添加'}
          </button>
        )}
      </div>

      {/* Stats Card */}
      {stats && (
        <div className={cn(
          'grid grid-cols-1 md:grid-cols-3 gap-4',
        )}>
          <div className="bg-vrbg-card border border-vrborder-subtle rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <Users className="w-4 h-4 text-vraccent-primary" />
              <span className="text-vr-caption text-vrtext-muted">系统确权人次</span>
            </div>
            <p className="text-2xl font-bold text-vrtext-primary">{stats.systemCount}</p>
            <p className="text-vr-caption text-vrtext-muted mt-1">Booking COMPLETED</p>
          </div>
          <div className="bg-vrbg-card border border-vrborder-subtle rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <Monitor className="w-4 h-4 text-emerald-400" />
              <span className="text-vr-caption text-vrtext-muted">硬件播控人次</span>
            </div>
            <p className="text-2xl font-bold text-emerald-400">{stats.hardwareCount}</p>
            <p className="text-vr-caption text-vrtext-muted mt-1">DeviceSessionLog 完成局</p>
          </div>
          <div className={cn(
            'bg-vrbg-card border rounded-xl p-4',
            stats.isMismatch ? 'border-red-500/30' : 'border-vrborder-subtle'
          )}>
            <div className="flex items-center gap-2 mb-2">
              <BarChart3 className={cn('w-4 h-4', stats.isMismatch ? 'text-red-400' : 'text-emerald-400')} />
              <span className="text-vr-caption text-vrtext-muted">核销差异率</span>
            </div>
            <p className={cn('text-2xl font-bold', stats.isMismatch ? 'text-red-400' : 'text-emerald-400')}>
              {stats.diffRatePercent}
            </p>
            <p className="text-vr-caption text-vrtext-muted mt-1">
              阈值: {(stats.threshold * 100).toFixed(0)}% {stats.isMismatch && '⚠️ 超过阈值'}
            </p>
          </div>
        </div>
      )}

      {/* Single Add Form */}
      {canManage && showForm && (
        <div className="bg-vrbg-card border border-vrborder-subtle rounded-xl p-4 space-y-3">
          <h4 className="text-sm font-medium text-vrtext-primary">手动添加单条设备日志</h4>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <input
              value={form.deviceId}
              onChange={(e) => setForm({ ...form, deviceId: e.target.value })}
              placeholder="设备ID (SN码)"
              className="h-9 px-3 rounded-lg bg-vrbg-surface border border-vrborder-subtle text-sm text-vrtext-primary placeholder:text-vrtext-muted focus:outline-none focus:border-vraccent-primary"
            />
            <input
              value={form.appPackageName}
              onChange={(e) => setForm({ ...form, appPackageName: e.target.value })}
              placeholder="游戏包名"
              className="h-9 px-3 rounded-lg bg-vrbg-surface border border-vrborder-subtle text-sm text-vrtext-primary placeholder:text-vrtext-muted focus:outline-none focus:border-vraccent-primary"
            />
            <input
              type="datetime-local"
              value={form.sessionStartAt}
              onChange={(e) => setForm({ ...form, sessionStartAt: e.target.value })}
              placeholder="开始时间"
              className="h-9 px-3 rounded-lg bg-vrbg-surface border border-vrborder-subtle text-sm text-vrtext-primary placeholder:text-vrtext-muted focus:outline-none focus:border-vraccent-primary"
            />
            <input
              type="datetime-local"
              value={form.sessionEndAt}
              onChange={(e) => setForm({ ...form, sessionEndAt: e.target.value })}
              placeholder="结束时间"
              className="h-9 px-3 rounded-lg bg-vrbg-surface border border-vrborder-subtle text-sm text-vrtext-primary placeholder:text-vrtext-muted focus:outline-none focus:border-vraccent-primary"
            />
            <input
              type="number"
              value={form.sessionDurationSec}
              onChange={(e) => setForm({ ...form, sessionDurationSec: parseInt(e.target.value) || 0 })}
              placeholder="运行秒数"
              className="h-9 px-3 rounded-lg bg-vrbg-surface border border-vrborder-subtle text-sm text-vrtext-primary placeholder:text-vrtext-muted focus:outline-none focus:border-vraccent-primary"
            />
            <input
              type="number"
              value={form.playerCount}
              onChange={(e) => setForm({ ...form, playerCount: parseInt(e.target.value) || 1 })}
              placeholder="游玩人数"
              min={1}
              className="h-9 px-3 rounded-lg bg-vrbg-surface border border-vrborder-subtle text-sm text-vrtext-primary placeholder:text-vrtext-muted focus:outline-none focus:border-vraccent-primary"
            />
          </div>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-sm text-vrtext-secondary">
              <input
                type="checkbox"
                checked={form.isCompleted}
                onChange={(e) => setForm({ ...form, isCompleted: e.target.checked })}
                className="rounded border-vrborder-subtle"
              />
              完整一局
            </label>
          </div>
          <div className="flex justify-end">
            <button
              onClick={handleSubmit}
              disabled={createMut.isPending}
              className="h-9 px-4 rounded-lg bg-vraccent-primary text-white text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center gap-1.5"
            >
              {createMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              保存
            </button>
          </div>
        </div>
      )}

      {/* Template Info */}
      {!showForm && (
        <div className="bg-vrbg-card border border-vrborder-subtle rounded-xl p-4">
          <div className="flex items-start gap-3">
            <FileSpreadsheet className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
            <div>
              <h4 className="text-sm font-medium text-vrtext-primary">批量导入说明</h4>
              <p className="text-vr-caption text-vrtext-muted mt-1">
                支持 Excel (.xlsx/.xls) 和 CSV 格式。表格需包含以下字段（顺序一致）：
              </p>
              <div className="flex flex-wrap gap-2 mt-2">
                {TEMPLATE_HEADERS.map((h) => (
                  <span key={h} className="px-2 py-0.5 rounded bg-vrbg-surface text-vr-caption text-vrtext-secondary border border-vrborder-subtle">
                    {h}
                  </span>
                ))}
              </div>
              <p className="text-vr-caption text-vrtext-muted mt-2">
                时间格式支持：yyyy-MM-dd HH:mm:ss、yyyy/MM/dd HH:mm:ss、yyyy-MM-dd HH:mm 等。结束时间可为空。
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Logs Table */}
      <div className="bg-vrbg-card border border-vrborder-subtle rounded-xl p-4">
        <h3 className="text-vr-body-sm font-medium text-vrtext-primary mb-3">设备日志明细</h3>
        {logsLoading ? (
          <div className="flex items-center gap-2 text-vrtext-muted text-sm py-8">
            <Loader2 className="w-4 h-4 animate-spin" />
            加载中...
          </div>
        ) : !logs || logs.length === 0 ? (
          <div className="text-center py-12 text-vrtext-muted">
            <Gamepad2 className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">暂无设备日志</p>
            <p className="text-vr-caption mt-1">请导入表格或单条添加</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-vrborder-subtle text-vrtext-muted text-vr-caption">
                  <th className="text-left py-2 px-3">设备ID</th>
                  <th className="text-left py-2 px-3">门店</th>
                  <th className="text-left py-2 px-3">开始时间</th>
                  <th className="text-right py-2 px-3">时长</th>
                  <th className="text-right py-2 px-3">人数</th>
                  <th className="text-center py-2 px-3">完成</th>
                  <th className="text-right py-2 px-3">操作</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id} className="border-b border-vrborder-subtle/50 hover:bg-vrbg-surface/50 transition-colors">
                    <td className="py-2.5 px-3 text-vrtext-secondary font-mono text-xs">{log.deviceId}</td>
                    <td className="py-2.5 px-3 text-vrtext-secondary">{log.venue?.name || '-'}</td>
                    <td className="py-2.5 px-3 text-vrtext-secondary whitespace-nowrap">
                      {format(new Date(log.sessionStartAt), 'MM-dd HH:mm')}
                    </td>
                    <td className="py-2.5 px-3 text-right text-vrtext-secondary">
                      {Math.floor(log.sessionDurationSec / 60)}分{log.sessionDurationSec % 60}秒
                    </td>
                    <td className="py-2.5 px-3 text-right text-vrtext-secondary">{log.playerCount}</td>
                    <td className="py-2.5 px-3 text-center">
                      {log.isCompleted ? (
                        <CheckCircle className="w-4 h-4 text-emerald-400 mx-auto" />
                      ) : (
                        <span className="text-vr-caption text-vrtext-muted">-</span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      {canDelete ? (
                        <button
                          onClick={() => {
                            if (window.confirm('确定删除这条日志吗？')) deleteMut.mutate(log.id)
                          }}
                          disabled={deleteMut.isPending}
                          className="text-red-400 hover:bg-red-500/10 p-1 rounded transition-colors disabled:opacity-50"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      ) : (
                        <span className="text-vr-caption text-vrtext-muted">-</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
