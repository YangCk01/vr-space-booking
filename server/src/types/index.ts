import { Request } from 'express'
import { UserRole } from '@prisma/client'

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string
    phone: string
    name: string
    role: UserRole
    managedVenueIds?: string[]
  }
}

export interface TokenPayload {
  userId: string
  phone: string
  role: UserRole
  name: string
  managedVenueIds?: string[]
}
