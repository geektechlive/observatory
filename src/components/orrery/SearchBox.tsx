import { useId, useState } from 'react'

import { type BodyName, ORRERY_BODIES } from '@/lib/orrery/bodies'

import styles from './orrery.module.css'

interface SearchBoxProps {
  onSelect: (name: BodyName) => void
}

/**
 * Find a body (#91): an ARIA 1.2 combobox with a listbox popup. Typing filters, arrows
 * move, Enter picks, Escape closes. #92/#93 add asteroids and spacecraft to the list.
 */
export function SearchBox({ onSelect }: SearchBoxProps) {
  const listId = useId()
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const q = query.trim().toLowerCase()
  const matches = ORRERY_BODIES.filter((b) => q === '' || b.name.toLowerCase().includes(q))
  const showList = open && matches.length > 0

  const pick = (name: BodyName) => {
    onSelect(name)
    setQuery(name)
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
        placeholder="Find a planet…"
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
            if (choice) pick(choice.name)
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
              key={b.name}
              id={`${listId}-${String(i)}`}
              role="option"
              aria-selected={i === active}
              className={styles.option ?? ''}
              // mousedown, not click: it fires before the input's blur closes the list.
              // The keyboard path is the input's own (aria-activedescendant).
              onMouseDown={(e) => {
                e.preventDefault()
                pick(b.name)
              }}
            >
              {b.name}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
