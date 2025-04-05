'use client'

import { Button } from "@/components/ui/button"
import { useRouter } from 'next/navigation'
import { generateSecretKey, getPublicKey } from 'nostr-tools'
import * as nip19 from 'nostr-tools/nip19'
import Header from '../components/Header'

export default function LoginPage() {
  const router = useRouter()

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
            <p className="text-lg text-muted-foreground mb-8">Choose how you'd like to get started</p>
            <div className="space-y-4 w-full max-w-[300px]">
              <Button 
                onClick={() => {}}
                className="w-full bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:brightness-90 transition-all"
              >
                Login with Browser Extension
              </Button>
              <Button 
                onClick={handleCreateProfile}
                className="w-full bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:brightness-90 transition-all"
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