import { describe, it, expect } from 'vitest'
import { parseDsn, rtltToDistanceKm } from '@/lib/dsn'

const FIXTURE = `<dsn>
  <station name="gdscc" friendlyName="Goldstone" timeUTC="1" timeZoneOffset="-25200000.0"/>
  <dish name="DSS14" azimuthAngle="0" elevationAngle="90" activity="Engineering Upgrades">
    <target name="DSN" id="99" uplegRange="-1" downlegRange="-1" rtlt="-1"/>
  </dish>
  <dish name="DSS25" azimuthAngle="230" elevationAngle="66" activity="Telemetry">
    <downSignal active="true" signalType="data" dataRate="14220" band="X" power="-130" spacecraft="MRO" spacecraftID="-74"/>
    <upSignal active="true" signalType="data" dataRate="0" band="X" power="9.9" spacecraft="MRO" spacecraftID="-74"/>
    <target name="MRO" id="74" uplegRange="1" downlegRange="1" rtlt="1284.6"/>
  </dish>
  <station name="cdscc" friendlyName="Canberra" timeUTC="1" timeZoneOffset="0"/>
  <dish name="DSS43" azimuthAngle="1" elevationAngle="2" activity="Telemetry">
    <downSignal active="true" signalType="data" dataRate="160" band="X" power="-150" spacecraft="VGR2" spacecraftID="-32"/>
    <target name="VGR2" id="32" uplegRange="-1" downlegRange="-1" rtlt="68040"/>
  </dish>
</dsn>`

describe('parseDsn', () => {
  it('groups dishes under the preceding station', () => {
    const { stations } = parseDsn(FIXTURE)
    expect(stations.map((s) => s.friendlyName)).toEqual(['Goldstone', 'Canberra'])
  })

  it('skips idle dishes (no active signals)', () => {
    const goldstone = parseDsn(FIXTURE).stations.find((s) => s.name === 'gdscc')
    // DSS14 is engineering-only; only DSS25 has an active contact.
    expect(goldstone?.dishes.map((d) => d.name)).toEqual(['DSS25'])
  })

  it('merges up/down signals into one contact with rtlt', () => {
    const dss25 = parseDsn(FIXTURE).stations[0]?.dishes[0]
    const mro = dss25?.contacts[0]
    expect(mro?.spacecraft).toBe('MRO')
    expect(mro?.hasUp).toBe(true)
    expect(mro?.hasDown).toBe(true)
    expect(mro?.rtlt).toBeCloseTo(1284.6, 1)
  })

  it('returns empty stations for malformed xml', () => {
    expect(parseDsn('<nope/>').stations).toEqual([])
  })
})

describe('rtltToDistanceKm', () => {
  it('halves the light-time and scales by c', () => {
    // 1284.6s round trip → ~1.92e8 km (Mars-ish)
    const d = rtltToDistanceKm(1284.6)
    expect(d).not.toBeNull()
    expect(d as number).toBeGreaterThan(1.8e8)
    expect(d as number).toBeLessThan(2.0e8)
  })

  it('returns null for non-positive rtlt', () => {
    expect(rtltToDistanceKm(-1)).toBeNull()
  })
})
