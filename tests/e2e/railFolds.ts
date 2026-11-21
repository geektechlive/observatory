import type { Page } from '@playwright/test'

/**
 * The control rail folds its layer groups (#273): Solar system and Spacecraft start open,
 * Small bodies, Near Earth and Earth orbit start folded. A step that clicks a switch in a
 * folded group opens the group first, as a visitor would.
 */
export type RailGroup =
  'Solar system' | 'Spacecraft' | 'Small bodies' | 'Near Earth' | 'Earth orbit'

/** Open a group if it is folded (a no-op when it is already open). */
export async function openRailGroup(page: Page, group: RailGroup): Promise<void> {
  // The fold button sits in the group's heading; the Earth orbit preset shares the name.
  const toggle = page
    .getByRole('region', { name: 'Orrery controls' })
    .locator('h2')
    .getByRole('button', { name: new RegExp(`^${group}`) })
  if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click()
}
