import { Notification } from 'electron'
import type { Language } from '@shared/i18n'
import { translate } from '@shared/i18n'
import type { Notice, PendingNotice } from '@shared/notices'

/** Avisos de Windows (F-14): el backend los deja en la bandeja de salida; aquí se traducen y se muestran una vez. */
function noticeText(language: Language, notice: Notice): { title: string; body: string } {
  const t = (key: Parameters<typeof translate>[1], values: Record<string, string | number> = {}) => translate(language, key, values)
  switch (notice.kind) {
    case 'expiry':
      return { title: t('notice.expiryTitle'), body: t('notice.expiryBody', { name: notice.name, days: notice.days, date: notice.expiresOn }) }
    case 'dueTomorrow':
      return { title: t('notice.dueTomorrowTitle'), body: t('notice.dueTomorrowBody', { count: notice.count }) }
    case 'reviewToday':
      return { title: t('notice.reviewTitle'), body: t('notice.reviewBody', { count: notice.count }) }
    case 'executed':
      return { title: t('notice.executedTitle'), body: t('notice.executedBody', { trashed: notice.trashed, failed: notice.failed }) }
    case 'needsConfirmation':
      return { title: t('notice.confirmTitle'), body: t('notice.confirmBody', { count: notice.count }) }
    case 'volumeOffline':
      return { title: t('notice.offlineTitle'), body: t('notice.offlineBody', { count: notice.count }) }
    case 'photosMoved':
      return { title: t('notice.photosTitle'), body: t('notice.photosBody', { count: notice.count }) }
  }
}

/** Muestra los avisos y devuelve los ids mostrados, para marcarlos entregados. */
export function showNotices(language: Language, pending: PendingNotice[], onClick: () => void): number[] {
  if (!Notification.isSupported()) return []
  for (const { notice } of pending) {
    const notification = new Notification(noticeText(language, notice))
    notification.on('click', onClick)
    notification.show()
  }
  return pending.map((entry) => entry.eventId)
}
