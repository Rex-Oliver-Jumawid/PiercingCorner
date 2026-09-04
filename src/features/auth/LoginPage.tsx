import { PagePlaceholder } from '../../components/ui/PagePlaceholder'

export function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-stone-50 p-6 text-stone-900">
      <PagePlaceholder
        title="Login"
        description="Authentication will be connected to Supabase in a later phase."
      />
    </main>
  )
}
