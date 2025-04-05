import type { UnsignedEvent } from 'nostr-tools'

declare global {
  interface Window {
    nostr: {
      signEvent: (event: UnsignedEvent) => Promise<string>
    }
  }
} 