import { Component } from 'react'
import type { ReactNode } from 'react'
import styles from './error-boundary.module.css'

interface ErrorBoundaryProps {
  children: ReactNode
  label?: string | undefined
}

interface State {
  hasError: boolean
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  override render() {
    if (!this.state.hasError) {
      return this.props.children
    }

    return (
      <div className={styles.boundary ?? ''}>
        {this.props.label && <span className={styles.panelLabel ?? ''}>{this.props.label}</span>}
        <div className={styles.inner ?? ''}>
          <span className={styles.message ?? ''}>Data unavailable</span>
        </div>
      </div>
    )
  }
}
