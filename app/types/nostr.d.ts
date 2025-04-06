// eslint-disable-next-line @typescript-eslint/no-unused-vars
import type { UnsignedEvent } from 'nostr-tools'

declare global {
  interface Window {
    nostr?: {
      getPublicKey(): Promise<string>
      signEvent(event: unknown): Promise<string | { sig: string }>
    }
  }
} 

export {}