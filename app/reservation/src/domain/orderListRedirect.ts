type TimerHandle = unknown

type OrderListRedirectOptions = {
  navigate: (target: string) => void
  hardRedirect: (target: string) => void
  schedule: (callback: () => void, delayMs: number) => TimerHandle
  cancel: (timer: TimerHandle) => void
  delayMs?: number
}

export function startOrderListRedirect({
  navigate,
  hardRedirect,
  schedule,
  cancel,
  delayMs = 500,
}: OrderListRedirectOptions) {
  const target = '/orders'
  navigate(target)
  const timer = schedule(() => hardRedirect(target), delayMs)

  return () => cancel(timer)
}
