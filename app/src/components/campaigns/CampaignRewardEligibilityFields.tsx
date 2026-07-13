import type { Game } from '@/api/games'
import type { Venue } from '@/api/venues'
import CampaignRewardMultiSelect from './CampaignRewardMultiSelect'

export type EligibilityConditionKey = 'AMOUNT' | 'VENUE' | 'GAME' | 'WEEKDAY' | 'TIME' | 'PEOPLE' | 'FIRST_ORDER' | 'ORDER_COUNT'

export interface CampaignRewardEligibilityValue {
  conditions: EligibilityConditionKey[]
  minOrderAmount: string
  venueIds: string[]
  gameIds: string[]
  weekdays: number[]
  startTime: string
  endTime: string
  minPeople: string
  firstOrderOnly: boolean
  minCompletedOrders: string
}

const conditionOptions: Array<{ key: EligibilityConditionKey; label: string }> = [
  { key: 'AMOUNT', label: '最低订单金额' },
  { key: 'VENUE', label: '指定场馆' },
  { key: 'GAME', label: '指定游戏' },
  { key: 'WEEKDAY', label: '指定星期' },
  { key: 'TIME', label: '体验时段' },
  { key: 'PEOPLE', label: '最低体验人数' },
  { key: 'FIRST_ORDER', label: '首次下单' },
  { key: 'ORDER_COUNT', label: '累计完成订单数' },
]

const weekdayOptions = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
const inputClass = 'h-10 w-full rounded-md border border-vrborder-subtle bg-white px-3 text-vr-body-sm text-vrtext-primary outline-none focus:border-vraccent-primary'

export default function CampaignRewardEligibilityFields({
  value,
  venues,
  games,
  onChange,
}: {
  value: CampaignRewardEligibilityValue
  venues: Venue[]
  games: Game[]
  onChange: (value: CampaignRewardEligibilityValue) => void
}) {
  const patch = (next: Partial<CampaignRewardEligibilityValue>) => onChange({ ...value, ...next })
  const selected = (key: EligibilityConditionKey) => value.conditions.includes(key)
  const toggleCondition = (key: EligibilityConditionKey) => {
    patch({ conditions: selected(key) ? value.conditions.filter((item) => item !== key) : [...value.conditions, key] })
  }

  return (
    <div className="grid grid-cols-[112px_minmax(0,1fr)] items-start gap-4">
      <span className="pt-2 text-right text-vr-body-sm text-vrtext-primary">门槛条件:</span>
      <div className="space-y-4 rounded-md border border-vrborder-subtle bg-vrbg-surface p-4">
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          {conditionOptions.map((option) => (
            <label key={option.key} className="flex min-h-9 cursor-pointer items-center gap-2 rounded-md border border-vrborder-subtle bg-white px-3 text-vr-body-sm text-vrtext-secondary">
              <input type="checkbox" checked={selected(option.key)} onChange={() => toggleCondition(option.key)} />
              {option.label}
            </label>
          ))}
        </div>

        {selected('AMOUNT') && <input type="number" min={0} value={value.minOrderAmount} onChange={(e) => patch({ minOrderAmount: e.target.value })} placeholder="最低订单金额（元）" className={inputClass} />}
        {selected('VENUE') && (
          <CampaignRewardMultiSelect
            label="场馆"
            options={venues.map((venue) => ({ value: venue.id, label: venue.name }))}
            value={value.venueIds}
            onChange={(venueIds) => patch({ venueIds })}
            placeholder="请选择适用场馆"
          />
        )}
        {selected('GAME') && (
          <CampaignRewardMultiSelect
            label="游戏"
            options={games.map((game) => ({ value: game.id, label: game.title }))}
            value={value.gameIds}
            onChange={(gameIds) => patch({ gameIds })}
            placeholder="请选择适用游戏"
          />
        )}
        {selected('WEEKDAY') && (
          <div className="flex flex-wrap gap-2">
            {weekdayOptions.map((label, day) => (
              <label key={label} className="flex cursor-pointer items-center gap-2 rounded-md border border-vrborder-subtle bg-white px-3 py-2 text-vr-body-sm">
                <input type="checkbox" checked={value.weekdays.includes(day)} onChange={() => patch({ weekdays: value.weekdays.includes(day) ? value.weekdays.filter((item) => item !== day) : [...value.weekdays, day] })} />
                {label}
              </label>
            ))}
          </div>
        )}
        {selected('TIME') && <div className="grid grid-cols-2 gap-3"><input type="time" value={value.startTime} onChange={(e) => patch({ startTime: e.target.value })} className={inputClass} /><input type="time" value={value.endTime} onChange={(e) => patch({ endTime: e.target.value })} className={inputClass} /></div>}
        {selected('PEOPLE') && <input type="number" min={1} value={value.minPeople} onChange={(e) => patch({ minPeople: e.target.value })} placeholder="最低体验人数" className={inputClass} />}
        {selected('FIRST_ORDER') && <p className="text-vr-body-sm text-vrtext-tertiary">仅用户第一次完成正常订单时发放。</p>}
        {selected('ORDER_COUNT') && <input type="number" min={1} value={value.minCompletedOrders} onChange={(e) => patch({ minCompletedOrders: e.target.value })} placeholder="累计完成订单数" className={inputClass} />}
        <p className="text-xs text-vrtext-tertiary">已选择的条件需要同时满足，仅适用于订单完成触发场景。</p>
      </div>
    </div>
  )
}
