'use client'

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { generateSecretKey, getPublicKey, SimplePool } from 'nostr-tools'
import { finalizeEvent } from 'nostr-tools/pure'
import * as nip19 from 'nostr-tools/nip19'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
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

    // Check localStorage for credentials
    const storedNsec = localStorage.getItem('nostr_nsec')
    if (!storedNsec) {
      router.push('/')
      return
    }

    const { type, data } = nip19.decode(storedNsec)
    if (type === 'nsec') {
      const publicKey = getPublicKey(data)
      fetchProfile(newPool, publicKey)
    }

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
      const storedNsec = localStorage.getItem('nostr_nsec')
      if (!storedNsec) {
        router.push('/')
        return
      }

      const { type, data: secretKey } = nip19.decode(storedNsec)
      if (type !== 'nsec') throw new Error('Invalid secret key')

      // Create the metadata event
      const eventTemplate: UnsignedEvent = {
        kind: 0,
        created_at: Math.floor(Date.now() / 1000),
        tags: [],
        content: JSON.stringify(profile),
        pubkey: getPublicKey(secretKey),
      }

      // Sign and publish the event
      const signedEvent = finalizeEvent(eventTemplate, secretKey)
      await pool.publish([RELAY_URL], signedEvent)
      
      // Show success message
      setUpdateSuccess(true)
    } catch (error) {
      console.error('Failed to update profile:', error)
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
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold">Profile Settings</h3>
                {updateSuccess && (
                  <span className="text-sm text-green-500">Profile updated successfully!</span>
                )}
              </div>
              <div className="space-y-3">
                <Input
                  placeholder="Username"
                  value={profile.name || ''}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setProfile(prev => ({ ...prev, name: e.target.value }))}
                  className="bg-[hsl(var(--background))]"
                />
                <Input
                  placeholder="Display Name"
                  value={profile.displayName || ''}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setProfile(prev => ({ ...prev, displayName: e.target.value }))}
                  className="bg-[hsl(var(--background))]"
                />
                <Input
                  placeholder="Website"
                  value={profile.website || ''}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setProfile(prev => ({ ...prev, website: e.target.value }))}
                  className="bg-[hsl(var(--background))]"
                />
                <Input
                  placeholder="Profile Picture URL"
                  value={profile.picture || ''}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setProfile(prev => ({ ...prev, picture: e.target.value }))}
                  className="bg-[hsl(var(--background))]"
                />
                <Textarea
                  placeholder="About Me"
                  value={profile.about || ''}
                  onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setProfile(prev => ({ ...prev, about: e.target.value }))}
                  className="bg-[hsl(var(--background))]"
                />
                <Input
                  placeholder="BOLT 12 Offer"
                  value={profile.lno || ''}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setProfile(prev => ({ ...prev, lno: e.target.value }))}
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
                    className="flex-1 bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:brightness-90 transition-all"
                  >
                    {isUpdating ? 'Updating Profile...' : 'Update Profile'}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
} 