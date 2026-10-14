import styles from './primitives.module.css'

/** A data-identity dot. Decorative: the label next to it carries the meaning. Pass a palette.ts colour. */
export function Swatch({ color }: { color: string }) {
  return <span className={styles.swatch ?? ''} style={{ background: color }} aria-hidden="true" />
}
