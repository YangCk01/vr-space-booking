import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Search,
  Plus,
  Edit2,
  Trash2,
  X,
  AlertTriangle,
  Upload,
  Gamepad2,
  Eye,
  EyeOff,
} from 'lucide-react'
import Layout from '@/components/Layout'
import { getGames, createGame, updateGame, deleteGame } from '@/api/games'
import type { Game } from '@/api/games'
import { uploadFile } from '@/api/upload'
import { getImageUrl } from '@/lib/imageUrl'
import { cn } from '@/lib/utils'

const easeOut = [0, 0, 0.2, 1] as [number, number, number, number]

const emptyGame: Partial<Game> = {
  title: '',
  subtitle: '',
  description: '',
  notice: '',
  coverImage: '',
  detailImages: [],
  price: 0,
  duration: 30,
  tags: [],
  status: 'ACTIVE',
  sortOrder: 0,
}

// 辅助：将后端 price（分）转为前端显示（元）
function toYuan(fen: number): number {
  return Math.round(fen / 100)
}

// 辅助：将前端 price（元）转为后端存储（分）
function toFen(yuan: number): number {
  return Math.round(yuan * 100)
}

export default function Games() {
  const queryClient = useQueryClient()
  const [searchQuery, setSearchQuery] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editingGame, setEditingGame] = useState<Game | null>(null)
  const [showDelete, setShowDelete] = useState<Game | null>(null)
  const [uploadingImage, setUploadingImage] = useState(false)
  const [uploadingDetailImage, setUploadingDetailImage] = useState(false)
  const [formData, setFormData] = useState<Partial<Game>>({ ...emptyGame })
  const [tagInput, setTagInput] = useState('')

  const { data: games, isLoading } = useQuery({
    queryKey: ['games'],
    queryFn: () => getGames(),
  })

  const filteredGames = games?.filter((g) => {
    if (!searchQuery) return true
    const s = searchQuery.toLowerCase()
    return (
      g.title.toLowerCase().includes(s) ||
      (g.subtitle && g.subtitle.toLowerCase().includes(s)) ||
      g.tags.some((t) => t.toLowerCase().includes(s))
    )
  })

  const createMutation = useMutation({
    mutationFn: createGame,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['games'] })
      closeModal()
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Game> }) => updateGame(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['games'] })
      closeModal()
    },
  })

  const deleteMutation = useMutation({
    mutationFn: deleteGame,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['games'] })
      setShowDelete(null)
    },
  })

  const openAdd = () => {
    setEditingGame(null)
    setFormData({ ...emptyGame })
    setTagInput('')
    setShowModal(true)
  }

  const openEdit = (game: Game) => {
    setEditingGame(game)
    setFormData({
      ...game,
      price: toYuan(game.price),
    })
    setTagInput(game.tags.join(', '))
    setShowModal(true)
  }

  const openDelete = (game: Game) => {
    setShowDelete(game)
  }

  const closeModal = () => {
    setShowModal(false)
    setEditingGame(null)
    setFormData({ ...emptyGame })
    setTagInput('')
  }

  const updateField = <K extends keyof Game>(field: K, value: Game[K]) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingImage(true)
    try {
      const result = await uploadFile('games', file)
      updateField('coverImage', result.url)
    } catch (err: any) {
      alert('上传失败: ' + (err?.response?.data?.message || err.message))
    } finally {
      setUploadingImage(false)
    }
  }

  const handleDetailImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return
    setUploadingDetailImage(true)
    const current = formData.detailImages || []
    const newImages: string[] = []
    try {
      for (const file of Array.from(files)) {
        const result = await uploadFile('games', file)
        newImages.push(result.url)
      }
      updateField('detailImages', [...current, ...newImages])
    } catch (err: any) {
      alert('上传失败: ' + (err?.response?.data?.message || err.message))
    } finally {
      setUploadingDetailImage(false)
      e.target.value = ''
    }
  }

  const removeDetailImage = (idx: number) => {
    const current = formData.detailImages || []
    updateField('detailImages', current.filter((_, i) => i !== idx))
  }

  const handleSubmit = () => {
    if (!formData.title?.trim()) {
      alert('标题不能为空')
      return
    }
    const payload = {
      title: formData.title,
      subtitle: formData.subtitle || undefined,
      description: formData.description || undefined,
      notice: formData.notice || undefined,
      coverImage: formData.coverImage || undefined,
      detailImages: formData.detailImages || [],
      price: toFen(Number(formData.price) || 0),
      duration: Number(formData.duration) || 30,
      tags: tagInput.split(/[,，]/).map((t) => t.trim()).filter(Boolean),
      status: formData.status || 'ACTIVE',
      sortOrder: Number(formData.sortOrder) || 0,
    }
    if (editingGame) {
      updateMutation.mutate({ id: editingGame.id, data: payload })
    } else {
      createMutation.mutate(payload)
    }
  }

  const isPending = createMutation.isPending || updateMutation.isPending

  return (
    <Layout breadcrumb={['内容管理']}>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="space-y-6"
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-vr-h1 text-vrtext-primary font-semibold">内容管理</h1>
            <p className="text-vr-body-sm text-vrtext-tertiary mt-1">游戏内容的增删改查，同步到C端首页</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-vrtext-muted" />
              <input
                type="text"
                placeholder="搜索游戏标题、标签..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-[280px] h-9 pl-9 pr-4 bg-vrbg-surface border border-vrborder-subtle rounded-lg text-vr-body-sm text-vrtext-primary placeholder:text-vrtext-muted focus:outline-none focus:border-vraccent-primary focus:ring-1 focus:ring-vraccent-primary/15 transition-all"
              />
            </div>
            <button
              onClick={openAdd}
              className="h-9 px-4 bg-vraccent-primary text-white text-vr-body-sm font-medium rounded-lg hover:bg-vraccent-primary/90 transition-colors flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              新增游戏
            </button>
          </div>
        </div>

        {/* Table */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3, delay: 0.2 }}
          className="bg-vrbg-card rounded-xl border border-vrborder-subtle overflow-hidden"
        >
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-vrbg-elevated">
                  <th className="text-left px-4 py-3 text-vr-caption text-vrtext-secondary font-medium w-[80px]">封面</th>
                  <th className="text-left px-4 py-3 text-vr-caption text-vrtext-secondary font-medium">标题</th>
                  <th className="text-left px-4 py-3 text-vr-caption text-vrtext-secondary font-medium w-[100px]">价格</th>
                  <th className="text-left px-4 py-3 text-vr-caption text-vrtext-secondary font-medium w-[80px]">时长</th>
                  <th className="text-left px-4 py-3 text-vr-caption text-vrtext-secondary font-medium w-[140px]">标签</th>
                  <th className="text-center px-4 py-3 text-vr-caption text-vrtext-secondary font-medium w-[90px]">状态</th>
                  <th className="text-right px-4 py-3 text-vr-caption text-vrtext-secondary font-medium w-[100px]">操作</th>
                </tr>
              </thead>
              <tbody>
                <AnimatePresence mode="wait">
                  {isLoading ? (
                    <tr>
                      <td colSpan={7} className="text-center py-12 text-vrtext-muted">加载中...</td>
                    </tr>
                  ) : filteredGames?.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="text-center py-16">
                        <Gamepad2 className="w-12 h-12 text-vrtext-muted mx-auto mb-3" />
                        <p className="text-vr-body text-vrtext-secondary">暂无游戏内容</p>
                      </td>
                    </tr>
                  ) : (
                    filteredGames?.map((game, idx) => (
                      <motion.tr
                        key={game.id}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.3, delay: idx * 0.05 }}
                        className="h-14 border-t border-vrborder-subtle hover:bg-vrbg-elevated/60 transition-colors"
                      >
                        <td className="px-4 py-3">
                          {game.coverImage ? (
                            <img
                              src={getImageUrl(game.coverImage)}
                              alt={game.title}
                              className="w-12 h-12 rounded-lg object-cover"
                            />
                          ) : (
                            <div className="w-12 h-12 rounded-lg bg-vrbg-elevated flex items-center justify-center">
                              <Gamepad2 className="w-5 h-5 text-vrtext-muted" />
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div>
                            <span className="text-vr-body-sm text-vrtext-primary font-medium">{game.title}</span>
                            {game.subtitle && (
                              <p className="text-vr-caption text-vrtext-tertiary mt-0.5">{game.subtitle}</p>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-vr-body-sm text-vrtext-primary">¥{(game.price / 100).toFixed(0)}</span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-vr-body-sm text-vrtext-primary">{game.duration}分钟</span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-1">
                            {game.tags.slice(0, 3).map((tag, i) => (
                              <span
                                key={i}
                                className="px-2 py-0.5 rounded-md bg-vrbg-elevated text-vr-caption text-vrtext-secondary"
                              >
                                {tag}
                              </span>
                            ))}
                            {game.tags.length > 3 && (
                              <span className="px-2 py-0.5 rounded-md bg-vrbg-elevated text-vr-caption text-vrtext-muted">
                                +{game.tags.length - 3}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span
                            className={cn(
                              'inline-flex items-center gap-1 px-3 py-1 rounded-full text-vr-caption font-medium',
                              game.status === 'ACTIVE'
                                ? 'bg-vrsuccess/15 text-vrsuccess'
                                : 'bg-vrtext-muted/15 text-vrtext-muted'
                            )}
                          >
                            {game.status === 'ACTIVE' ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                            {game.status === 'ACTIVE' ? '上架' : '下架'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => openEdit(game)}
                              className="w-8 h-8 rounded-lg hover:bg-vrbg-elevated flex items-center justify-center text-vrtext-secondary hover:text-vraccent-primary transition-colors"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => openDelete(game)}
                              className="w-8 h-8 rounded-lg hover:bg-vrerror/10 flex items-center justify-center text-vrtext-secondary hover:text-vrerror transition-colors"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </motion.tr>
                    ))
                  )}
                </AnimatePresence>
              </tbody>
            </table>
          </div>
        </motion.div>
      </motion.div>

      {/* Add/Edit Modal */}
      <AnimatePresence>
        {showModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.98 }}
              transition={{ duration: 0.25, ease: easeOut }}
              className="bg-vrbg-card border border-vrborder-subtle rounded-2xl w-full max-w-md max-h-[85vh] overflow-y-auto"
            >
              {/* Modal Header */}
              <div className="flex items-center justify-between px-5 py-3 border-b border-vrborder-subtle">
                <h2 className="text-vr-h3 text-vrtext-primary font-semibold">
                  {editingGame ? '编辑游戏' : '新增游戏'}
                </h2>
                <button
                  onClick={closeModal}
                  className="w-8 h-8 rounded-lg hover:bg-vrbg-elevated flex items-center justify-center text-vrtext-secondary transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Modal Body */}
              <div className="px-5 py-4 space-y-3">
                {/* Cover Image */}
                <div>
                  <label className="text-vr-caption text-vrtext-secondary font-medium block mb-2">封面图</label>
                  <div className="flex items-center gap-4">
                    {formData.coverImage ? (
                      <img
                        src={getImageUrl(formData.coverImage)}
                        alt="cover"
                        className="w-24 h-16 rounded-lg object-cover border border-vrborder-subtle"
                      />
                    ) : (
                      <div className="w-24 h-16 rounded-lg bg-vrbg-elevated border border-dashed border-vrborder-subtle flex items-center justify-center">
                        <Gamepad2 className="w-6 h-6 text-vrtext-muted" />
                      </div>
                    )}
                    <label className="relative h-9 px-4 border border-vrborder-subtle rounded-lg text-vr-body-sm text-vrtext-secondary hover:bg-vrbg-elevated transition-colors flex items-center gap-2 cursor-pointer">
                      <Upload className="w-4 h-4" />
                      {uploadingImage ? '上传中...' : '上传封面'}
                      <input
                        type="file"
                        accept="image/*"
                        className="absolute inset-0 opacity-0 cursor-pointer"
                        onChange={handleImageUpload}
                        disabled={uploadingImage}
                      />
                    </label>
                  </div>
                </div>

                {/* Title */}
                <div>
                  <label className="text-vr-caption text-vrtext-secondary font-medium block mb-1.5">
                    标题 <span className="text-vrerror">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.title || ''}
                    onChange={(e) => updateField('title', e.target.value)}
                    placeholder="请输入游戏标题"
                    className="w-full h-10 px-3 bg-vrbg-surface border border-vrborder-subtle rounded-lg text-vr-body-sm text-vrtext-primary placeholder:text-vrtext-muted focus:outline-none focus:border-vraccent-primary transition-colors"
                  />
                </div>

                {/* Subtitle */}
                <div>
                  <label className="text-vr-caption text-vrtext-secondary font-medium block mb-1.5">副标题</label>
                  <input
                    type="text"
                    value={formData.subtitle || ''}
                    onChange={(e) => updateField('subtitle', e.target.value)}
                    placeholder="请输入副标题"
                    className="w-full h-10 px-3 bg-vrbg-surface border border-vrborder-subtle rounded-lg text-vr-body-sm text-vrtext-primary placeholder:text-vrtext-muted focus:outline-none focus:border-vraccent-primary transition-colors"
                  />
                </div>

                {/* Description */}
                <div>
                  <label className="text-vr-caption text-vrtext-secondary font-medium block mb-1.5">介绍（描述）</label>
                  <textarea
                    value={formData.description || ''}
                    onChange={(e) => updateField('description', e.target.value)}
                    placeholder="请输入游戏介绍文字，展示在C端【描述】标签页"
                    rows={4}
                    className="w-full px-3 py-2 bg-vrbg-surface border border-vrborder-subtle rounded-lg text-vr-body-sm text-vrtext-primary placeholder:text-vrtext-muted focus:outline-none focus:border-vraccent-primary transition-colors resize-none"
                  />
                </div>

                {/* Notice */}
                <div>
                  <label className="text-vr-caption text-vrtext-secondary font-medium block mb-1.5">须知</label>
                  <textarea
                    value={formData.notice || ''}
                    onChange={(e) => updateField('notice', e.target.value)}
                    placeholder="请输入游戏须知（如：适合人群、禁忌症、注意事项等），展示在C端【须知】标签页"
                    rows={4}
                    className="w-full px-3 py-2 bg-vrbg-surface border border-vrborder-subtle rounded-lg text-vr-body-sm text-vrtext-primary placeholder:text-vrtext-muted focus:outline-none focus:border-vraccent-primary transition-colors resize-none"
                  />
                </div>

                {/* Detail Images */}
                <div>
                  <label className="text-vr-caption text-vrtext-secondary font-medium block mb-1.5">介绍图片</label>
                  <div className="flex flex-wrap gap-2 mb-2">
                    {(formData.detailImages || []).map((url, idx) => (
                      <div key={idx} className="relative w-20 h-20 rounded-lg overflow-hidden border border-vrborder-subtle group">
                        <img
                          src={getImageUrl(url)}
                          alt={`介绍图${idx + 1}`}
                          className="w-full h-full object-cover"
                        />
                        <button
                          onClick={() => removeDetailImage(idx)}
                          className="absolute top-0.5 right-0.5 w-5 h-5 bg-vrerror text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                    <label className="w-20 h-20 rounded-lg border border-dashed border-vrborder-subtle flex flex-col items-center justify-center cursor-pointer hover:border-vraccent-primary hover:bg-vraccent-primary/5 transition-colors">
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        onChange={handleDetailImageUpload}
                        className="hidden"
                      />
                      {uploadingDetailImage ? (
                        <span className="text-vr-caption text-vrtext-muted">上传中...</span>
                      ) : (
                        <>
                          <Upload className="w-5 h-5 text-vrtext-muted mb-1" />
                          <span className="text-vr-caption text-vrtext-muted">添加图片</span>
                        </>
                      )}
                    </label>
                  </div>
                  <p className="text-vr-caption text-vrtext-muted">支持多选上传，图片将展示在C端游戏介绍页面</p>
                </div>

                {/* Price & Duration */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-vr-caption text-vrtext-secondary font-medium block mb-1">价格（元/人）</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={formData.price ?? 0}
                      onChange={(e) => updateField('price', e.target.value === '' ? 0 : Number(e.target.value.replace(/\D/g, '')))}
                      placeholder="0"
                      className="w-full h-9 px-3 bg-vrbg-surface border border-vrborder-subtle rounded-lg text-vr-body-sm text-vrtext-primary placeholder:text-vrtext-muted focus:outline-none focus:border-vraccent-primary transition-colors"
                    />
                  </div>
                  <div>
                    <label className="text-vr-caption text-vrtext-secondary font-medium block mb-1">时长（分钟）</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={formData.duration ?? 30}
                      onChange={(e) => updateField('duration', e.target.value === '' ? 30 : Number(e.target.value.replace(/\D/g, '')))}
                      placeholder="30"
                      className="w-full h-9 px-3 bg-vrbg-surface border border-vrborder-subtle rounded-lg text-vr-body-sm text-vrtext-primary placeholder:text-vrtext-muted focus:outline-none focus:border-vraccent-primary transition-colors"
                    />
                  </div>
                </div>

                {/* Tags */}
                <div>
                  <label className="text-vr-caption text-vrtext-secondary font-medium block mb-1.5">标签</label>
                  <input
                    type="text"
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    placeholder="用逗号分隔，如：科幻, 冒险, 多人"
                    className="w-full h-10 px-3 bg-vrbg-surface border border-vrborder-subtle rounded-lg text-vr-body-sm text-vrtext-primary placeholder:text-vrtext-muted focus:outline-none focus:border-vraccent-primary transition-colors"
                  />
                </div>

                {/* Sort Order */}
                <div>
                  <label className="text-vr-caption text-vrtext-secondary font-medium block mb-1">排序</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={formData.sortOrder ?? 0}
                    onChange={(e) => updateField('sortOrder', e.target.value === '' ? 0 : Number(e.target.value.replace(/\D/g, '')))}
                    placeholder="0"
                    className="w-full h-9 px-3 bg-vrbg-surface border border-vrborder-subtle rounded-lg text-vr-body-sm text-vrtext-primary placeholder:text-vrtext-muted focus:outline-none focus:border-vraccent-primary transition-colors"
                  />
                </div>

                {/* Status */}
                <div>
                  <label className="text-vr-caption text-vrtext-secondary font-medium block mb-1">状态</label>
                  <div className="flex gap-2">
                    {[
                      { key: 'ACTIVE', label: '上架' },
                      { key: 'INACTIVE', label: '下架' },
                    ].map((s) => (
                      <button
                        key={s.key}
                        onClick={() => updateField('status', s.key)}
                        className={cn(
                          'flex-1 h-9 rounded-lg border text-vr-body-sm font-medium transition-all',
                          formData.status === s.key
                            ? 'border-vraccent-primary bg-vraccent-primary/10 text-vraccent-primary'
                            : 'border-vrborder-subtle bg-vrbg-surface text-vrtext-secondary hover:border-vrborder-hover'
                        )}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Modal Footer */}
              <div className="flex items-center justify-end gap-3 px-5 py-3 border-t border-vrborder-subtle">
                <button
                  onClick={closeModal}
                  className="h-10 px-5 border border-vrborder-subtle rounded-lg text-vr-body-sm text-vrtext-secondary hover:bg-vrbg-elevated transition-colors"
                >
                  取消
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={isPending}
                  className="h-10 px-5 bg-vraccent-primary text-white text-vr-body-sm font-medium rounded-lg hover:bg-vraccent-primary/90 transition-colors disabled:opacity-50"
                >
                  {isPending ? '保存中...' : editingGame ? '保存' : '创建'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Delete Confirm */}
      <AnimatePresence>
        {showDelete && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.2 }}
              className="bg-vrbg-card border border-vrborder-subtle rounded-2xl w-full max-w-sm p-6"
            >
              <div className="flex flex-col items-center text-center">
                <div className="w-12 h-12 rounded-full bg-vrerror/10 flex items-center justify-center mb-4">
                  <AlertTriangle className="w-6 h-6 text-vrerror" />
                </div>
                <h3 className="text-vr-h3 text-vrtext-primary font-semibold mb-1">确认删除</h3>
                <p className="text-vr-body-sm text-vrtext-secondary mb-6">
                  确定要删除「{showDelete.title}」吗？删除后将无法恢复。
                </p>
                <div className="flex gap-3 w-full">
                  <button
                    onClick={() => setShowDelete(null)}
                    className="flex-1 h-10 border border-vrborder-subtle rounded-lg text-vr-body-sm text-vrtext-secondary hover:bg-vrbg-elevated transition-colors"
                  >
                    取消
                  </button>
                  <button
                    onClick={() => deleteMutation.mutate(showDelete.id)}
                    disabled={deleteMutation.isPending}
                    className="flex-1 h-10 bg-vrerror text-white text-vr-body-sm font-medium rounded-lg hover:bg-vrerror/90 transition-colors disabled:opacity-50"
                  >
                    {deleteMutation.isPending ? '删除中...' : '确认删除'}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </Layout>
  )
}
