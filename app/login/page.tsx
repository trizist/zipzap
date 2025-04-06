'use client'

import { Button } from "@/app/components/ui/button"
import { useRouter } from 'next/navigation'
import { generateSecretKey } from 'nostr-tools'
import * as nip19 from 'nostr-tools/nip19'
import Header from '../components/Header'
import { useState } from 'react'

declare global {
  interface Window {
    nostr?: {
      getPublicKey(): Promise<string>
      signEvent(event: unknown): Promise<string>
    }
  }
}

export default function LoginPage() {
  const router = useRouter()
  const [isExtensionLoading, setIsExtensionLoading] = useState(false)

  const handleExtensionLogin = async () => {
    setIsExtensionLoading(true)
    try {
      if (!window.nostr) {
        alert('No Nostr extension found. Please install a Nostr browser extension.')
        return
      }

      const publicKey = await window.nostr.getPublicKey()
      if (publicKey) {
        // Store the pubkey in localStorage
        const npub = nip19.npubEncode(publicKey)
        localStorage.setItem('nostr_pubkey', publicKey)
        localStorage.setItem('nostr_npub', npub)
        router.push('/')
      }
    } catch (error) {
      console.error('Failed to get public key:', error)
      alert('Failed to connect to Nostr extension. Please try again.')
    } finally {
      setIsExtensionLoading(false)
    }
  }

  const handleCreateProfile = () => {
    const sk = generateSecretKey()
    const nsecKey = nip19.nsecEncode(sk)
    localStorage.setItem('nostr_nsec', nsecKey)
    router.push('/profile')
  }

  return (
    <div className="w-full min-h-screen bg-background">
      <Header />
      <div className="w-full flex-1 px-4 sm:px-6 lg:px-8">
        <div className="max-w-[800px] mx-auto w-full">
          <div className="py-12 flex flex-col items-center justify-center text-center">
            <h2 className="text-4xl font-bold mb-4">Welcome to ZipZap</h2>
            <p className="text-lg text-muted-foreground mb-8">Choose how you&apos;d like to get started</p>
            <div className="space-y-4 w-full max-w-[300px]">
              <Button 
                onClick={handleExtensionLogin}
                disabled={isExtensionLoading}
                className="w-full bg-gray-900 text-white hover:bg-gray-800 transition-all"
              >
                {isExtensionLoading ? 'Connecting...' : 'Login with Browser Extension'}
              </Button>
              <Button 
                onClick={handleCreateProfile}
                className="w-full bg-gray-900 text-white hover:bg-gray-800 transition-all"
              >
                Create New Nostr Profile
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
} 