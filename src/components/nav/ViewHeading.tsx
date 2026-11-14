import { type ConsoleView, VIEW_META } from '@/lib/viewMeta'

const NAME: Record<ConsoleView, string> = {
  earth: 'Earth',
  orrery: 'Orrery',
  sun: 'Sun',
  sky: 'Sky',
  orbit: 'Orbit',
}

/**
 * The view's own heading inside the main landmark (#251), for heading navigation: the page's
 * only heading above it is "Observatory". Visually hidden: the dial and the header subtitle
 * already show which view is on screen.
 */
export function ViewHeading({ view }: { view: ConsoleView }) {
  return (
    <h2 className="visually-hidden">
      {NAME[view]}: {VIEW_META[view].subtitle}
    </h2>
  )
}
