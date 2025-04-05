import { useState, useEffect } from 'react'
import * as nip19 from 'nostr-tools/nip19'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/app/components/ui/dialog"
import { Button } from "@/app/components/ui/button"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/app/components/ui/tabs"

interface ZipZapModalProps {
  isOpen: boolean
  onClose: () => void
  eventJson: string
}

export default function ZipZapModal({ isOpen, onClose, eventJson }: ZipZapModalProps) {
  const [neventEncoded, setNeventEncoded] = useState<string>('');
  const [noteEncoded, setNoteEncoded] = useState<string>('');
  
  useEffect(() => {
    if (eventJson) {
      try {
        // Parse the JSON string into an event object
        const event = JSON.parse(eventJson);
        
        // Create a properly formatted event object for nip19.neventEncode
        const neventContent = {
          id: event.id,
          author: event.pubkey,
          kind: event.kind,
          created_at: event.created_at,
          content: event.content,
          tags: event.tags
        };
        
        // Encode the full event using NIP-19 nevent
        const encodedNevent = nip19.neventEncode(neventContent);
        setNeventEncoded(encodedNevent);
        
        // Encode just the event ID using NIP-19 note
        const encodedNote = nip19.noteEncode(event.id);
        setNoteEncoded(encodedNote);
      } catch (err) {
        console.error('Failed to encode event as NIP-19:', err);
        setNeventEncoded('Error encoding event');
        setNoteEncoded('Error encoding event ID');
      }
    }
  }, [eventJson]);

  const handleCopyJson = async () => {
    try {
      await navigator.clipboard.writeText(eventJson)
      alert('JSON copied to clipboard!')
    } catch (err) {
      console.error('Failed to copy JSON:', err)
      alert('Failed to copy to clipboard')
    }
  }
  
  const handleCopyNevent = async () => {
    try {
      await navigator.clipboard.writeText(neventEncoded)
      alert('NIP-19 nevent string copied to clipboard!')
    } catch (err) {
      console.error('Failed to copy nevent:', err)
      alert('Failed to copy to clipboard')
    }
  }
  
  const handleCopyNote = async () => {
    try {
      await navigator.clipboard.writeText(noteEncoded)
      alert('NIP-19 note ID copied to clipboard!')
    } catch (err) {
      console.error('Failed to copy note ID:', err)
      alert('Failed to copy to clipboard')
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>ZipZap Request</DialogTitle>
          <DialogDescription>
            This is a ZipZap Request. The sender of the ZipZap will include this in the payer_note of the invoice_request which must be made against the BOLT 12 offer.
          </DialogDescription>
        </DialogHeader>
        
        <Tabs defaultValue="json" className="mt-4">
          <TabsList className="grid grid-cols-3 mb-4">
            <TabsTrigger value="json">JSON Event</TabsTrigger>
            <TabsTrigger value="nevent">nevent</TabsTrigger>
            <TabsTrigger value="note">note ID</TabsTrigger>
          </TabsList>
          
          <TabsContent value="json" className="relative">
            <div className="max-h-[400px] overflow-auto rounded-lg bg-gray-100 dark:bg-gray-800">
              <pre className="p-4 text-sm whitespace-pre-wrap break-all">
                {eventJson}
              </pre>
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={handleCopyJson}
              className="absolute top-2 right-2"
            >
              Copy
            </Button>
          </TabsContent>
          
          <TabsContent value="nevent" className="relative">
            <div className="max-h-[200px] overflow-auto rounded-lg bg-gray-100 dark:bg-gray-800">
              <pre className="p-4 text-sm whitespace-pre-wrap break-all">
                {neventEncoded}
              </pre>
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={handleCopyNevent}
              className="absolute top-2 right-2"
            >
              Copy
            </Button>
            <p className="text-xs text-muted-foreground mt-2">
              This NIP-19 encoded nevent string contains the complete event and can be shared with other Nostr clients.
            </p>
          </TabsContent>
          
          <TabsContent value="note" className="relative">
            <div className="max-h-[160px] overflow-auto rounded-lg bg-gray-100 dark:bg-gray-800">
              <pre className="p-4 text-sm whitespace-pre-wrap break-all">
                {noteEncoded}
              </pre>
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={handleCopyNote}
              className="absolute top-2 right-2"
            >
              Copy
            </Button>
            <p className="text-xs text-muted-foreground mt-2">
              This NIP-19 encoded note string contains just the event ID. Clients will need to fetch the full event from a relay.
            </p>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}