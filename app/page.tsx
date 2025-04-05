import { Button } from "@/components/ui/button"

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[hsl(var(--background))] p-8">
      <main className="flex flex-col items-center gap-6 text-center">
        <h1 className="text-4xl font-bold tracking-tight sm:text-6xl text-[hsl(var(--foreground))]">
          ZipZap
        </h1>
        <p className="text-lg text-[hsl(var(--muted-foreground))] sm:text-xl">
          Enter the world of BOLT 12 zaps
        </p>
        <Button 
          size="lg" 
          className="mt-6 bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:brightness-90 transition-all font-medium"
        >
          Create Nostr Profile
        </Button>
      </main>
    </div>
  );
}
