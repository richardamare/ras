import * as React from "react"

import * as ErrorState from "@/components/error-state"
import * as Environment from "@/lib/environment"

type ErrorBoundaryProps = {
  children: React.ReactNode
}

type ErrorBoundaryState = {
  error: Error | null
}

/**
 * Sits above the router: an error thrown while the router itself mounts cannot be caught by a
 * route's `errorComponent`, and the user gets a blank page instead.
 *
 * A class because `componentDidCatch` has no hook equivalent - the one non-arrow component here.
 */
export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error }
  }

  override componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[APP] Unhandled render error |", error, info.componentStack)
  }

  override render() {
    const { error } = this.state
    const { children } = this.props

    if (!error) return children

    // The message is shown only locally: in a deployed build it can carry internals a user
    // should not see, and it is no use to them anyway.
    return <ErrorState.AppCrash detail={Environment.isLocal() ? error.message : undefined} />
  }
}
