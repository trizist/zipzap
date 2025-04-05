'use client'

import { Button } from "@/components/ui/button"
import { generateSecretKey, getPublicKey } from 'nostr-tools/pure'
import * as nip19 from 'nostr-tools/nip19'
import { useState, useEffect } from 'react'

export default function NostrProfile() {
  const [nsec, setNsec] = useState<string | null>(null)
  const [npub, setNpub] = useState<string | null>(null)

  useEffect(() => {
    // Check localStorage on mount
    const storedNsec = localStorage.getItem('nostr_nsec')
    if (storedNsec) {
      setNsec(storedNsec)
      const { type, data } = nip19.decode(storedNsec)
      if (type === 'nsec') {
        const publicKey = getPublicKey(data)
        const npubKey = nip19.npubEncode(publicKey)
        setNpub(npubKey)
      }
    }
  }, [])

  const handleCreateProfile = () => {
    const sk = generateSecretKey()
    const nsecKey = nip19.nsecEncode(sk)
    const publicKey = getPublicKey(sk)
    const npubKey = nip19.npubEncode(publicKey)
    
    localStorage.setItem('nostr_nsec', nsecKey)
    setNsec(nsecKey)
    setNpub(npubKey)
  }

  return (
    <div className="flex flex-col items-center gap-6 text-center">
      <h1 className="text-4xl font-bold tracking-tight sm:text-6xl text-[hsl(var(--foreground))]">
        ZipZap
      </h1>
      <p className="text-lg text-[hsl(var(--muted-foreground))] sm:text-xl">
        Enter the world of BOLT 12 zaps
      </p>
      {!npub ? (
        <Button 
          size="lg" 
          className="mt-6 bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:brightness-90 transition-all font-medium"
          onClick={handleCreateProfile}
        >
          Create Nostr Profile
        </Button>
      ) : (
        <div className="flex flex-col items-center gap-4">
          <p className="text-sm text-[hsl(var(--muted-foreground))]">Your Nostr public key:</p>
          <code className="px-4 py-2 bg-[hsl(var(--secondary))] rounded-lg text-sm font-mono">
            {npub}
          </code>
        </div>
      )}
    </div>
  )
} 