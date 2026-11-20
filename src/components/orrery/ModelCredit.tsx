import type { ModelDescriptor } from '@/lib/orrery/modelDescriptor'

import styles from './detail-view.module.css'

function ExternalLink({ href, children }: { href: string; children: string }) {
  return (
    <a href={href} className={styles.detailLink ?? ''} target="_blank" rel="noreferrer noopener">
      {children}
      <span className={styles.srOnly ?? ''}> (opens in a new tab)</span>
    </a>
  )
}

/**
 * The credit line. A model under a licence that asks for the source, the licence and the
 * changes reads "Model: <credit> (source), <licence> (licence). <changes>"; a NASA model
 * keeps the short form. Shared by the studio close-up and the fly-in (#268).
 */
export function ModelCredit({ descriptor }: { descriptor: ModelDescriptor }) {
  const { credit, licence, licenceUrl, changes, sourceUrl } = descriptor
  if (!licenceUrl && !changes) {
    return (
      <p>
        Model: {credit} · {licence}
        {sourceUrl && (
          <>
            {' · '}
            <ExternalLink href={sourceUrl}>Source</ExternalLink>
          </>
        )}
      </p>
    )
  }
  return (
    <p>
      Model: {credit}
      {sourceUrl && (
        <>
          {' ('}
          <ExternalLink href={sourceUrl}>source</ExternalLink>
          {')'}
        </>
      )}
      {', '}
      {licence}
      {licenceUrl && (
        <>
          {' ('}
          <ExternalLink href={licenceUrl}>licence</ExternalLink>
          {')'}
        </>
      )}
      {'.'}
      {changes && ` ${changes}`}
    </p>
  )
}
