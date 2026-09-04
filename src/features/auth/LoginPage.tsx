import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

import logoUrl from '../../../logo.png'
import { SignInError } from './authService'
import { getAuthorizedDestination } from './routeAccess'
import { useAuth } from './useAuth'

const errorMessages = {
  invalid_credentials: 'Invalid email or password.',
  account_unavailable: 'Your account is unavailable or inactive. Contact the studio owner.',
  service_unavailable: 'Unable to sign in right now. Please try again.',
} as const

function requestedPathFromState(state: unknown) {
  if (!state || typeof state !== 'object' || !('from' in state)) {
    return undefined
  }

  const from = state.from
  return typeof from === 'string' && from.startsWith('/') ? from : undefined
}

export function LoginPage() {
  const { account, signIn, status } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const requestedPath = requestedPathFromState(location.state)

  useEffect(() => {
    if (status === 'authenticated' && account) {
      navigate(getAuthorizedDestination(account.role, requestedPath), { replace: true })
    }
  }, [account, navigate, requestedPath, status])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (isSubmitting) {
      return
    }

    setErrorMessage(null)
    setIsSubmitting(true)

    try {
      const authorizedAccount = await signIn(email.trim(), password)
      navigate(getAuthorizedDestination(authorizedAccount.role, requestedPath), {
        replace: true,
      })
    } catch (error) {
      const code = error instanceof SignInError ? error.code : 'service_unavailable'
      setErrorMessage(errorMessages[code])
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="grid min-h-screen min-w-0 bg-[#fffdf7] font-['DM_Sans',ui-sans-serif,system-ui,sans-serif] text-[#30231f] min-[821px]:grid-cols-2">
      <section className="relative flex min-h-[290px] min-w-0 flex-col justify-between overflow-hidden bg-[#cf861d] p-7 text-[#fff9e9] after:absolute after:-right-[210px] after:-bottom-[250px] after:h-[610px] after:w-[440px] after:rotate-[23deg] after:rounded-[52%_48%_61%_39%] after:border-[56px] after:border-[#86bcb0] after:opacity-80 after:content-[''] min-[821px]:min-h-screen min-[821px]:[padding:clamp(1.875rem,6vw,5rem)]">
        <div className="relative z-10 inline-flex w-max max-w-full min-w-0 items-center gap-3">
          <span className="size-[54px] shrink-0 overflow-hidden rounded-full bg-[#f6c45c] shadow-[0_0_0_2px_#ffffff55,0_3px_12px_#3a241429]">
            <img className="size-full object-cover" src={logoUrl} alt="" />
          </span>
          <span className="flex min-w-0 flex-col">
            <strong className="font-['Fraunces',Georgia,serif] text-[18px] leading-none font-semibold tracking-[-0.5px] whitespace-nowrap sm:text-[21px]">
              Piercing Corner
            </strong>
            <small className="mt-[5px] text-[8px] font-extrabold tracking-[2.2px] text-[#e8fff7]">
              PARAÑAQUE
            </small>
          </span>
        </div>

        <div className="relative z-10 mt-[50px] max-w-[520px] min-[821px]:mt-0">
          <span className="mb-7 hidden size-[58px] place-items-center rounded-full bg-white/25 min-[821px]:grid" aria-hidden="true">
            <svg className="size-[25px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12.4 3a7.6 7.6 0 1 0 8.6 8.6A6.4 6.4 0 0 1 12.4 3Z" />
              <path d="M18.7 2.9v3.2M17.1 4.5h3.2" />
            </svg>
          </span>
          <p className="mb-[9px] text-[10px] font-extrabold tracking-[1.8px] text-[#fff2c5] uppercase">
            Piercing Corner Operations
          </p>
          <h2 className="m-0 max-w-[510px] font-['Fraunces',Georgia,serif] text-[43px] leading-none font-semibold tracking-[-3px] min-[821px]:text-[clamp(45px,5vw,73px)]">
            Calm tools for a busy studio.
          </h2>
          <p className="mt-[22px] hidden max-w-[420px] text-base leading-7 text-[#fff5dd] min-[821px]:block">
            Transactions, consent, clients, and daily studio work—all in one private space.
          </p>
        </div>

        <svg className="absolute top-1/5 right-[17%] z-[1] size-[46px] text-[#f0bd32]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="m12 3-1.25 3.35L7.4 7.6l3.35 1.25L12 12.2l1.25-3.35L16.6 7.6l-3.35-1.25L12 3Z" />
          <path d="m19 13-.72 1.93-1.93.72 1.93.72L19 18.3l.72-1.93 1.93-.72-1.93-.72L19 13Z" />
          <path d="m5 14-.65 1.75-1.75.65 1.75.65L5 18.8l.65-1.75 1.75-.65-1.75-.65L5 14Z" />
        </svg>
      </section>

      <section className="flex min-h-[620px] min-w-0 flex-col items-center justify-center bg-[radial-gradient(circle_at_85%_10%,#86bcb02d,transparent_220px)] bg-[#fffdf7] px-[22px] py-[25px] min-[821px]:min-h-screen min-[821px]:p-[30px]">
        <div className="w-full max-w-[410px] min-w-0">
          <p className="mb-[9px] text-[10px] font-extrabold tracking-[1.8px] text-[#9e5c11] uppercase">
            Staff Access
          </p>
          <h1 className="m-0 font-['Fraunces',Georgia,serif] text-[42px] leading-[1.1] font-semibold tracking-[-1.5px]">
            Welcome back.
          </h1>
          <p className="mt-[11px] text-[13px] leading-[1.6] text-[#756861]">
            Sign in with the email attached to your Piercing Corner invitation.
          </p>

          <form className="mt-7 flex flex-col gap-[15px]" onSubmit={handleSubmit}>
            <label className="flex flex-col gap-[7px] text-xs font-bold text-[#554740]">
              Email address
              <input
                className="min-h-[45px] w-full rounded-[11px] border border-[#dfd1b9] bg-white px-3 py-2.5 text-[#30231f] outline-none transition focus-visible:border-[#cf861d] focus-visible:ring-3 focus-visible:ring-[#cf861d]/10"
                type="email"
                name="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                disabled={isSubmitting}
                required
              />
            </label>

            <label className="flex flex-col gap-[7px] text-xs font-bold text-[#554740]">
              Password
              <input
                className="min-h-[45px] w-full rounded-[11px] border border-[#dfd1b9] bg-white px-3 py-2.5 text-[#30231f] outline-none transition focus-visible:border-[#cf861d] focus-visible:ring-3 focus-visible:ring-[#cf861d]/10"
                type="password"
                name="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                disabled={isSubmitting}
                required
              />
            </label>

            {errorMessage ? (
              <p className="m-0 rounded-[10px] bg-[#f9e6df] px-[13px] py-[11px] text-xs leading-[1.6] text-[#a33e30]" role="alert">
                {errorMessage}
              </p>
            ) : null}

            <button
              className="mt-1 inline-flex min-h-[43px] w-full items-center justify-center gap-2 rounded-full border border-transparent bg-[#30231f] px-[19px] text-[13px] font-bold text-[#fff8e8] transition hover:-translate-y-px hover:bg-[#47332c] focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[#f0bd328c] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
              type="submit"
              disabled={isSubmitting || !email || !password}
              aria-busy={isSubmitting}
            >
              {isSubmitting ? (
                <svg className="size-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <path d="M21 12a9 9 0 1 1-6.22-8.56" />
                </svg>
              ) : null}
              <span>{isSubmitting ? 'Signing in…' : 'Sign in'}</span>
              {!isSubmitting ? (
                <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              ) : null}
            </button>
          </form>

          <div className="flex h-[50px] items-center text-[10px] text-[#aa9d92] before:h-px before:flex-1 before:bg-[#dfd1b9] before:content-[''] after:h-px after:flex-1 after:bg-[#dfd1b9] after:content-['']">
            <span className="px-3">or</span>
          </div>

          <button className="flex min-h-[45px] w-full cursor-not-allowed items-center justify-center gap-2.5 rounded-full border border-[#dfd1b9] bg-white text-xs font-bold text-[#30231f] opacity-50" type="button" disabled aria-describedby="oauth-note">
            <span className="text-base font-black text-[#4285f4]">G</span>
            Continue with Google
          </button>
          <small id="oauth-note" className="mt-2.5 block text-center text-[10px] leading-[1.45] text-[#756861]">
            Google sign-in is not available for this studio.
          </small>
        </div>
      </section>
    </main>
  )
}
