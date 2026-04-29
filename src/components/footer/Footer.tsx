import styles from './footer.module.css'

export function Footer() {
  return (
    <footer className={styles.footer ?? ''}>
      <span>Inspired by</span>
      <a
        href="https://github.com/irahulstomar/cosmo-tui"
        target="_blank"
        rel="noopener noreferrer"
        className={styles.link ?? ''}
      >
        cosmo-tui
      </a>
      <span className={styles.sep ?? ''} aria-hidden="true">
        ·
      </span>
      <span>Data from NASA</span>
      <span className={styles.sep ?? ''} aria-hidden="true">
        ·
      </span>
      <span>Built by Chris Favero</span>
      <span className={styles.sep ?? ''} aria-hidden="true">
        ·
      </span>
      <a
        href="https://github.com/geektechlive/observatory"
        target="_blank"
        rel="noopener noreferrer"
        className={styles.link ?? ''}
      >
        Source on GitHub
      </a>
    </footer>
  )
}
