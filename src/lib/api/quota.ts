import { useUiStore } from '@/store/ui'

export function trackQuota(res: Response): void {
  const header = res.headers.get('X-Quota-Remaining')
  if (header === null) return
  const n = parseInt(header, 10)
  if (!isNaN(n)) {
    useUiStore.getState().setQuotaRemaining(n)
  }
}
