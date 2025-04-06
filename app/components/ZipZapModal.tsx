import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/app/components/ui/dialog"
import { Button } from "@/app/components/ui/button"

// Check if wallet is enabled via environment variable
const WALLET_ENABLED = process.env.NEXT_PUBLIC_USE_WALLET === 'true'

interface ZipZapModalProps {
  isOpen: boolean
  onClose: () => void
  noteId: string
}

export default function ZipZapModal({ isOpen, onClose, noteId }: ZipZapModalProps) {
  const [copied, setCopied] = useState(false);
  
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(noteId)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
      alert('Failed to copy to clipboard')
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px] bg-gray-950 border-gray-800">
        <DialogHeader>
          <DialogTitle className="text-white">ZipZap Request Created!</DialogTitle>
          <DialogDescription className="text-gray-300">
            Your ZipZap request has been published to the relay. The note ID below can be shared with others to reference this ZipZap request.
            {!WALLET_ENABLED && (
              <p className="mt-2 text-yellow-500">
                Note: Wallet features are currently disabled in this deployment.
              </p>
            )}
          </DialogDescription>
        </DialogHeader>
        
        <div className="mt-4">
          <div className="p-4 rounded-lg bg-gray-800 overflow-x-auto">
            <pre className="text-sm whitespace-pre-wrap break-all text-gray-200">
              {noteId}
            </pre>
          </div>
          
          <Button 
            onClick={handleCopy}
            className="w-full mt-4 bg-yellow-500 text-black font-medium hover:bg-yellow-400 transition-all"
          >
            {copied ? 'Copied!' : 'Copy Note ID'}
          </Button>
          
          <p className="text-xs text-center text-gray-400 mt-3">
            This note ID can be used in Nostr clients to reference your ZipZap request.
            {!WALLET_ENABLED && " However, wallet functionality is currently disabled."}
          </p>
        </div>
      </DialogContent>
    </Dialog>
  )
}