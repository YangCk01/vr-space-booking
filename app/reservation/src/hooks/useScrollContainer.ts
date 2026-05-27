import { createContext, useContext } from 'react'

export const ScrollContainerContext = createContext<React.RefObject<HTMLDivElement | null>>({ current: null })

export function useScrollContainer() {
  return useContext(ScrollContainerContext)
}
