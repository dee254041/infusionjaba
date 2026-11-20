'use client'

import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
import { isStorefrontAnalyticsPath } from '@/lib/commerce-analytics'
import { trackClientEvent } from '@/lib/commerce-analytics-client'

const SCROLL_MARKS = [25, 50, 75, 100]
const HEARTBEAT_SECONDS = 60

function scrollPercent() {
  const root = document.documentElement
  const max = root.scrollHeight - window.innerHeight
  if (max <= 0) return 100
  return Math.max(0, Math.min(100, Math.round((window.scrollY / max) * 100)))
}

export function CommercePageTracker() {
  const pathname = usePathname() || '/'
  const trackedPath = useRef('')
  const secondsOnPage = useRef(0)
  const sentScroll = useRef(0)

  useEffect(() => {
    if (trackedPath.current && trackedPath.current !== pathname && secondsOnPage.current > 0) {
      const total = secondsOnPage.current
      void trackClientEvent('page_exit', {
        path: trackedPath.current,
        metadata: { durationSeconds: total, activeSeconds: total % HEARTBEAT_SECONDS, scrollPercent: sentScroll.current },
      })
      secondsOnPage.current = 0
    }

    if (!isStorefrontAnalyticsPath(pathname)) {
      trackedPath.current = ''
      return
    }

    trackedPath.current = pathname
    secondsOnPage.current = 0
    sentScroll.current = 0
    void trackClientEvent('page_view', { path: pathname })

    const onScroll = () => {
      const percent = scrollPercent()
      const next = SCROLL_MARKS.filter((mark) => percent >= mark).pop() || 0
      if (next > sentScroll.current) {
        sentScroll.current = next
        void trackClientEvent('scroll', {
          path: pathname,
          metadata: { scrollPercent: next },
        })
      }
    }

    const tick = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return
      secondsOnPage.current += 1
      if (secondsOnPage.current > 0 && secondsOnPage.current % HEARTBEAT_SECONDS === 0) {
        void trackClientEvent('engagement', {
          path: pathname,
          metadata: { activeSeconds: HEARTBEAT_SECONDS, scrollPercent: sentScroll.current || scrollPercent() },
        })
      }
    }, 1000)

    const onClick = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target.closest('a, button') : null
      if (!target) return
      const href = target instanceof HTMLAnchorElement ? target.pathname || target.getAttribute('href') || '' : ''
      const label = (target.textContent || target.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim().slice(0, 80)
      if (!label && !href) return
      void trackClientEvent('click', {
        path: pathname,
        metadata: { label, href: String(href).slice(0, 180) },
      })
    }

    const flush = () => {
      if (secondsOnPage.current < 1) return
      const total = secondsOnPage.current
      void trackClientEvent('page_exit', {
        path: pathname,
        metadata: {
          durationSeconds: total,
          activeSeconds: total % HEARTBEAT_SECONDS,
          scrollPercent: sentScroll.current || scrollPercent(),
        },
      })
      secondsOnPage.current = 0
    }

    const onHide = () => {
      if (document.visibilityState === 'hidden') flush()
    }

    window.addEventListener('scroll', onScroll, { passive: true })
    document.addEventListener('click', onClick, true)
    document.addEventListener('visibilitychange', onHide)
    window.addEventListener('pagehide', flush)
    onScroll()

    return () => {
      window.clearInterval(tick)
      window.removeEventListener('scroll', onScroll)
      document.removeEventListener('click', onClick, true)
      document.removeEventListener('visibilitychange', onHide)
      window.removeEventListener('pagehide', flush)
    }
  }, [pathname])

  return null
}
