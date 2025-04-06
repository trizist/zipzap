'use client'

import { Button } from "@/app/components/ui/button"
import { Input } from "@/app/components/ui/input"
import { Textarea } from "@/app/components/ui/textarea"
import { getPublicKey, SimplePool, getEventHash, verifyEvent } from 'nostr-tools'
import { finalizeEvent } from 'nostr-tools/pure'
import * as nip19 from 'nostr-tools/nip19'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import type { UnsignedEvent } from 'nostr-tools'
import Header from '../components/Header'

if (!process.env.NEXT_PUBLIC_NOSTR_RELAY_URL) {
  throw new Error('NEXT_PUBLIC_NOSTR_RELAY_URL environment variable is not set')
}

const RELAY_URL = process.env.NEXT_PUBLIC_NOSTR_RELAY_URL

interface ProfileMetadata {
  name?: string
  displayName?: string
  website?: string
  about?: string
  lno?: string // BOLT 12 offer
  picture?: string
}

// Define a type for any Nostr event
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type NostrEventBase = {
  kind: number
  created_at: number
  content: string
  tags: string[][]
  pubkey: string
  id?: string
  sig?: string
}

// Window.nostr interface is defined in app/types/nostr.d.ts

export default function ProfilePage() {
  const router = useRouter()
  const [profile, setProfile] = useState<ProfileMetadata>({})
  const [isUpdating, setIsUpdating] = useState(false)
  const [updateSuccess, setUpdateSuccess] = useState(false)
  const [pool, setPool] = useState<SimplePool | null>(null)

  useEffect(() => {
    // Initialize relay pool
    const newPool = new SimplePool()
    setPool(newPool)

    // Check for NIP-07 extension login first
    const storedPubkey = localStorage.getItem('nostr_pubkey')
    if (storedPubkey) {
      fetchProfile(newPool, storedPubkey)
      return
    }

    // Fall back to local nsec login
    const storedNsec = localStorage.getItem('nostr_nsec')
    if (storedNsec) {
      const { type, data } = nip19.decode(storedNsec)
      if (type === 'nsec') {
        const publicKey = getPublicKey(data)
        fetchProfile(newPool, publicKey)
        return
      }
    }

    // If no login method found, redirect to home
    router.push('/')

    // Cleanup
    return () => {
      newPool.close([RELAY_URL])
    }
  }, [router])

  const fetchProfile = async (poolInstance: SimplePool, pubkey: string) => {
    try {
      const events = await poolInstance.querySync([RELAY_URL], {
        kinds: [0],
        authors: [pubkey],
        limit: 1
      })
      if (events.length > 0) {
        try {
          const metadata = JSON.parse(events[0].content)
          setProfile(metadata)
        } catch (e) {
          console.error('Failed to parse profile metadata:', e)
        }
      }
    } catch (error) {
      console.error('Failed to fetch profile:', error)
    }
  }

  const handleUpdateProfile = async () => {
    if (!pool) return

    setIsUpdating(true)
    setUpdateSuccess(false)
    try {
      // Check for NIP-07 extension first
      const storedPubkey = localStorage.getItem('nostr_pubkey')
      if (storedPubkey) {
        if (!window.nostr) {
          throw new Error('Nostr extension not found')
        }

        try {
          // Create the base event
          const baseEvent = {
            kind: 0,
            pubkey: storedPubkey,
            created_at: Math.floor(Date.now() / 1000),
            content: JSON.stringify(profile),
            tags: []
          }

          // Calculate the event hash
          const id = getEventHash(baseEvent)

          // Create the event to sign
          const eventToSign = {
            ...baseEvent,
            id
          }

          try {
            // Get the signature from Alby
            const sig = await window.nostr.signEvent(eventToSign)
            console.log('Raw signature from Alby:', sig)
            console.log('Signature type:', typeof sig)

            // Handle different signature formats
            let finalSig = sig
            if (typeof sig === 'object' && sig !== null) {
              console.log('Signature is an object:', sig)
              // If sig is an object, it might contain the signature in a property
              if ('sig' in sig) {
                finalSig = sig.sig
              } else {
                throw new Error('Unexpected signature format')
              }
            }

            if (!finalSig || typeof finalSig !== 'string') {
              throw new Error('Invalid signature format')
            }

            // Construct the complete signed event
            const completeEvent = {
              ...baseEvent,
              id,
              sig: finalSig
            }

            // Verify the event is valid before publishing
            const isValid = verifyEvent(completeEvent)
            console.log('Event verification result:', isValid)

            if (!isValid) {
              throw new Error('Event verification failed')
            }

            // Publish to relay
            await pool.publish([RELAY_URL], completeEvent)
            setUpdateSuccess(true)
          } catch (error) {
            console.error('Signature error:', error)
            throw new Error('Failed to get valid signature from extension')
          }
        } catch (error) {
          console.error('Failed to sign/verify event:', error)
          throw error
        }
      } else {
        // Fall back to local nsec
        const storedNsec = localStorage.getItem('nostr_nsec')
        if (!storedNsec) {
          router.push('/')
          return
        }

        const { type, data: secretKey } = nip19.decode(storedNsec)
        if (type !== 'nsec') throw new Error('Invalid secret key')

        // Create the base event
        const baseEvent = {
          kind: 0,
          created_at: Math.floor(Date.now() / 1000),
          tags: [],
          content: JSON.stringify(profile),
          pubkey: getPublicKey(secretKey)
        }

        // Sign and finalize the event
        const signedEvent = finalizeEvent(baseEvent, secretKey)

        // Verify the event is valid before publishing
        if (!verifyEvent(signedEvent)) {
          throw new Error('Event verification failed')
        }

        // Publish to relay
        await pool.publish([RELAY_URL], signedEvent)
        setUpdateSuccess(true)
      }
    } catch (error) {
      console.error('Failed to update profile:', error)
      alert('Failed to update profile. Please try again.')
    } finally {
      setIsUpdating(false)
    }
  }

  return (
    <div className="w-full min-h-screen bg-background">
      <Header />
      <div className="w-full flex-1 px-4 sm:px-6 lg:px-8">
        <div className="max-w-[800px] mx-auto w-full">
          <div className="py-6">
            <div className="w-full bg-[hsl(var(--secondary))] p-4 rounded-lg">
              <h3 className="text-lg font-semibold mb-4">Profile Settings</h3>
              <div className="space-y-3">
                <Input
                  placeholder="Username"
                  value={profile.name || ''}
                  onChange={(e) => setProfile(prev => ({ ...prev, name: e.target.value }))}
                  className="bg-[hsl(var(--background))]"
                />
                <Input
                  placeholder="Display Name"
                  value={profile.displayName || ''}
                  onChange={(e) => setProfile(prev => ({ ...prev, displayName: e.target.value }))}
                  className="bg-[hsl(var(--background))]"
                />
                <Input
                  placeholder="Website"
                  value={profile.website || ''}
                  onChange={(e) => setProfile(prev => ({ ...prev, website: e.target.value }))}
                  className="bg-[hsl(var(--background))]"
                />
                <Input
                  placeholder="Profile Picture URL"
                  value={profile.picture || ''}
                  onChange={(e) => setProfile(prev => ({ ...prev, picture: e.target.value }))}
                  className="bg-[hsl(var(--background))]"
                />
                <Textarea
                  placeholder="About Me"
                  value={profile.about || ''}
                  onChange={(e) => setProfile(prev => ({ ...prev, about: e.target.value }))}
                  className="bg-[hsl(var(--background))]"
                />
                <Input
                  placeholder="BOLT 12 Offer"
                  value={profile.lno || ''}
                  onChange={(e) => setProfile(prev => ({ ...prev, lno: e.target.value }))}
                  className="bg-[hsl(var(--background))]"
                />
                <div className="flex gap-2">
                  <Button 
                    onClick={() => router.push('/')}
                    variant="outline"
                    className="flex-1"
                  >
                    Back to Home
                  </Button>
                  <Button 
                    onClick={handleUpdateProfile}
                    disabled={isUpdating}
                    className="flex-1 bg-gray-900 text-white hover:bg-gray-800 transition-all"
                  >
                    {isUpdating ? 'Updating Profile...' : 'Update Profile'}
                  </Button>
                </div>
                {updateSuccess && (
                  <p className="text-green-500 text-sm text-center">Profile updated successfully!</p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
} 