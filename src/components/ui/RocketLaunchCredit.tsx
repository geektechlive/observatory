import { Label } from '@/components/ui/Label'

/** RocketLaunch.live asks for this text "somewhere near the data" (#179, #183). */
export function RocketLaunchCredit() {
  return (
    <Label>
      <a href="https://www.rocketlaunch.live/" target="_blank" rel="noreferrer">
        Data by RocketLaunch.Live
      </a>
    </Label>
  )
}
