import { describe, expect, it } from 'vitest'
import { selectableVenuesFromResponse } from './campaignVenueOptions'

describe('selectableVenuesFromResponse', () => {
  it('reads the paginated list and excludes disabled venues', () => {
    const response = {
      data: {
        list: [
          { id: 'venue-free', name: '可用场馆', status: 'FREE' },
          { id: 'venue-busy', name: '使用中场馆', status: 'IN_USE' },
          { id: 'venue-disabled', name: '停用场馆', status: 'DISABLED' },
        ],
      },
    }

    expect(selectableVenuesFromResponse(response).map((venue) => venue.id)).toEqual([
      'venue-free',
      'venue-busy',
    ])
  })

  it('reads the axios-adapted list response', () => {
    const response = {
      data: [
        { id: 'venue-free', name: '可用场馆', status: 'FREE' },
        { id: 'venue-disabled', name: '停用场馆', status: 'DISABLED' },
      ],
    }

    expect(selectableVenuesFromResponse(response).map((venue) => venue.id)).toEqual(['venue-free'])
  })
})
