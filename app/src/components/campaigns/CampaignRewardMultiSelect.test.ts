import { describe, expect, it } from 'vitest'
import { filterRewardOptions, toggleRewardOption } from '@/domain/campaignRewardSelectOptions'

const options = [
  { value: 'venue-1', label: '成都春熙店' },
  { value: 'venue-2', label: 'Shanghai VR Center' },
]

describe('campaign reward multi-select helpers', () => {
  it('filters by label without emitting arbitrary query text', () => {
    expect(filterRewardOptions(options, '成都')).toEqual([options[0]])
    expect(filterRewardOptions(options, 'vr center')).toEqual([options[1]])
    expect(filterRewardOptions(options, 'unknown')).toEqual([])
  })

  it('adds and removes option ids without mutating the input array', () => {
    const selected = ['venue-1']
    expect(toggleRewardOption(selected, 'venue-2')).toEqual(['venue-1', 'venue-2'])
    expect(toggleRewardOption(selected, 'venue-1')).toEqual([])
    expect(selected).toEqual(['venue-1'])
  })
})
