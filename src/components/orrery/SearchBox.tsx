import { useId, useState } from 'react'

import { jdFromDate } from '@/lib/orrery/kepler'

import { buildCatalog, type CatalogItem } from './catalog'
import styles from './orrery.module.css'

interface SearchBoxProps {
  /** What can be found; defaults to the Sun and planets (#91). #93 adds the craft. */
  items?: readonly CatalogItem[] | undefined
  onSelect: (key: string) => void
}

const PLANETS_ONLY = buildCatalog([], jdFromDate(new Date()))

/**
 * Find a body (#91, #93): an ARIA 1.2 combobox with a listbox popup. Typing filters, arrows
 * move, Enter picks, Escape closes. A craft with no data at the sim date stays listed,
 * marked, so "not here" reads as an answer.
 */
export function SearchBox({ items = PLANETS_ONLY, onSelect }: SearchBoxProps) {
  const listId = useId()
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const q = query.trim().toLowerCase()
  const matches = items.filter(
    (b) => q === '' || b.label.toLowerCase().includes(q) || b.group.toLowerCase().includes(q),
  )
  const showList = open && matches.length > 0

  const pick = (item: CatalogItem) => {
    onSelect(item.key)
    setQuery(item.label)
    setOpen(false)
    setActive(-1)
  }

  return (
    <div className={styles.search ?? ''}>
      <input
        type="text"
        role="combobox"
        aria-label="Find a body"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={showList && active >= 0 ? `${listId}-${String(active)}` : undefined}
        placeholder="Find a planet or spacecraft…"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value)
          setOpen(true)
          setActive(-1)
        }}
        onFocus={() => {
          setOpen(true)
        }}
        onBlur={() => {
          setOpen(false)
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault()
            setOpen(true)
            setActive((i) => Math.min(matches.length - 1, i + 1))
          } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            setActive((i) => Math.max(0, i - 1))
          } else if (e.key === 'Enter') {
            const choice = matches[active >= 0 ? active : 0]
            if (choice) pick(choice)
          } else if (e.key === 'Escape') {
            setOpen(false)
            setActive(-1)
          }
        }}
      />
      {showList && (
        <ul id={listId} role="listbox" aria-label="Bodies" className={styles.listbox ?? ''}>
          {matches.map((b, i) => (
            <li
              key={b.key}
              id={`${listId}-${String(i)}`}
              role="option"
              aria-selected={i === active}
              title={b.group}
              data-kind={b.kind}
              data-available={b.available}
              className={styles.option ?? ''}
              // mousedown, not click: it fires before the input's blur closes the list.
              // The keyboard path is the input's own (aria-activedescendant).
              onMouseDown={(e) => {
                e.preventDefault()
                pick(b)
              }}
            >
              {b.label}
              {!b.available && (
                <span className={styles.optionNote ?? ''}> · no data for this date</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
