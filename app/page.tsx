import NostrProfile from './components/NostrProfile'

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[hsl(var(--background))]">
      <main className="w-full flex flex-col items-center gap-6 text-center">
        <NostrProfile />
      </main>
    </div>
  )
}
