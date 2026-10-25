import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Button, Card, PageTitle } from './components/ui'
import { apiRequest, clearAuthSession, getStoredAuthUser, isRole, setAuthSession, setUnauthorizedHandler, type AuthUser, type LoginResponse, type Role } from './api'
import { AdmissionForm, DischargeForm, PatientList, PatientProfile, PatientRegister } from './components/PatientWorkflows'
import { AuditScreen, RetentionScreen, UsersScreen } from './components/AdminScreens'
import { ToastProvider } from './components/Toast'
import { formatDate, formatDateTime } from './lib/format'
import { HOSPITAL_NAME, SYSTEM_NAME } from './lib/branding'

type Screen = 'dashboard'|'patients'|'register'|'profile'|'admission'|'discharge'|'audit'|'retention'|'users'
const nav: {id: Screen; label: string; roles?: Role[]}[] = [
  {id:'dashboard',label:'Dashboard'},{id:'patients',label:'Patient Records'},{id:'register',label:'Register Patient',roles:['Admin','Records Officer']},
  {id:'admission',label:'New Admission',roles:['Admin','Records Officer','Physician']},{id:'discharge',label:'Discharge Patient',roles:['Admin','Records Officer','Physician']},{id:'audit',label:'Audit Log',roles:['Admin','Records Officer']},
  {id:'retention',label:'Retention & Disposal',roles:['Admin']},{id:'users',label:'User Management',roles:['Admin']}
]

function Login({ onLogin }: { onLogin: (user: AuthUser) => void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const result = await apiRequest<LoginResponse>('/api/auth/login', {
        method: 'POST',
        authenticated: false,
        body: { email, password },
      })
      if (
        !result ||
        typeof result.token !== 'string' ||
        !result.user ||
        typeof result.user.id !== 'string' ||
        typeof result.user.name !== 'string' ||
        typeof result.user.email !== 'string' ||
        !isRole(result.user.role)
      ) {
        throw new Error('The server returned an invalid login response.')
      }
      setAuthSession(result.token, result.user)
      onLogin(result.user)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to sign in. Please try again.')
    } finally {
      setLoading(false)
    }
  }
  return <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-teal-50 via-slate-50 to-cyan-100 p-6">
    <div aria-hidden="true" className="pointer-events-none absolute -left-24 -top-24 size-80 rounded-full bg-teal-200/40 blur-3xl"/>
    <div aria-hidden="true" className="pointer-events-none absolute -bottom-32 -right-24 size-96 rounded-full bg-cyan-200/50 blur-3xl"/>
    <section className="relative w-full max-w-md">
      <div className="mb-6 flex flex-col items-center text-center">
        <div aria-hidden="true" className="mb-4 grid size-14 place-items-center rounded-2xl bg-teal-700 text-3xl font-bold text-white shadow-lg shadow-teal-900/20">+</div>
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-teal-800">{HOSPITAL_NAME}</p>
      </div>
      <Card className="w-full border-white/80 p-8 shadow-xl shadow-teal-950/10 sm:p-10"><h2 className="text-center text-3xl font-bold tracking-tight text-slate-950">Sign in to {SYSTEM_NAME}</h2>
      <form onSubmit={submit} className="mt-8 space-y-5">
        <label className="block text-sm font-semibold text-slate-700">Email address<span className="ml-1 text-red-700">*</span><input autoComplete="username" required type="email" value={email} onChange={e=>setEmail(e.target.value)} className="mt-2 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3.5 text-slate-900 outline-none focus:border-teal-600 focus:ring-4 focus:ring-teal-100"/></label>
        <label className="block text-sm font-semibold text-slate-700">Password<span className="ml-1 text-red-700">*</span><input autoComplete="current-password" required type="password" value={password} onChange={e=>setPassword(e.target.value)} className="mt-2 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3.5 text-slate-900 outline-none focus:border-teal-600 focus:ring-4 focus:ring-teal-100"/></label>
        {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
        <div className="[&>button]:w-full"><Button type="submit" disabled={loading}>{loading?'Signing in…':'Sign in securely'}</Button></div>
      </form>
    </Card></section>
  </main>
}

function Logo({light=false}:{light?:boolean}) { return <div className="flex items-center gap-3"><div className="grid size-11 place-items-center rounded-xl bg-teal-600 text-2xl font-bold text-white">+</div><div><div className={`font-bold ${light?'text-white':'text-slate-950'}`}>{SYSTEM_NAME}</div><div className={`text-xs ${light?'text-teal-200':'text-slate-500'}`}>{HOSPITAL_NAME}</div></div></div> }

function Layout({user,screen,setScreen,logout,children}:{user:AuthUser;screen:Screen;setScreen:(s:Screen)=>void;logout:()=>void;children:ReactNode}) {
  const role = user.role
  return <div className="min-h-screen bg-slate-50 lg:flex"><aside className="border-b border-slate-200 bg-white lg:fixed lg:inset-y-0 lg:w-64 lg:border-b-0 lg:border-r"><div className="p-5"><Logo/></div><nav className="flex gap-1 overflow-x-auto px-3 pb-3 lg:block lg:space-y-1">{nav.filter(n=>!n.roles||n.roles.includes(role)).map(n=><button key={n.id} onClick={()=>setScreen(n.id)} className={`min-h-11 shrink-0 rounded-lg px-3.5 text-left text-sm font-semibold transition focus:outline-none focus:ring-4 focus:ring-teal-100 lg:w-full ${screen===n.id?'bg-teal-50 text-teal-800':'text-slate-600 hover:bg-slate-100 hover:text-slate-950'}`}>{n.label}</button>)}</nav><div className="border-t border-slate-200 p-4 lg:absolute lg:inset-x-0 lg:bottom-0"><p className="text-sm font-bold text-slate-900">{user.name}</p><p className="text-xs text-slate-500">{user.role}</p><button onClick={logout} className="mt-3 min-h-11 w-full rounded-lg text-left text-sm font-semibold text-slate-600 hover:text-teal-700 focus:outline-none focus:ring-4 focus:ring-teal-100">Logout</button></div></aside><main className="min-w-0 flex-1 p-5 lg:ml-64 lg:p-8"><div className="mx-auto max-w-7xl">{children}</div></main></div>
}

type DashboardData = {
  totalPatients: number
  currentAdmissions: number
  dischargesToday: number
  retentionPending: number
  recentActivity: Array<{
    audit_log_id: number
    actor_name: string
    role: string | null
    action_code: string
    description: string
    patient_id: number | null
    patient_name: string | null
    occurred_at: string
  }>
}

function Dashboard({go,userName}:{go:(s:Screen, patientId?:string)=>void;userName:string}) {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    apiRequest<{ data: DashboardData }>('/api/dashboard/summary')
      .then((result) => { if (active) setData(result.data) })
      .catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : 'Dashboard summary could not be loaded.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  const metrics = [
    ['Total patients', data?.totalPatients],
    ['Current admissions', data?.currentAdmissions],
    ['Discharges today', data?.dischargesToday],
    ['Retention review', data?.retentionPending],
  ] as const

  return <>
    <PageTitle title="Dashboard" subtitle={`Welcome, ${userName}. Today is ${formatDate(new Date())}.`}/>
    {error && <p role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{metrics.map(([label, value], index) => <Card key={label} className="p-5"><p className="text-sm font-semibold text-slate-600">{label}</p><p className="mt-2 text-3xl font-bold text-slate-950">{loading ? '…' : value?.toLocaleString() ?? '—'}</p><p className={`mt-2 text-xs font-semibold ${index === 3 ? 'text-amber-800' : 'text-teal-700'}`}>{index === 3 ? 'Pending review' : ''}</p></Card>)}</div>
    <div className="mt-6">
      <Card><div className="border-b border-slate-200 p-5"><h2 className="font-bold text-slate-950">Recent activity</h2><p className="text-sm text-slate-500">Latest audited record activity</p></div>
        {loading ? <p role="status" className="p-5 text-sm text-slate-600">Loading recent activity…</p>
          : !data?.recentActivity.length ? <p className="p-5 text-sm text-slate-600">No recent activity recorded.</p>
            : <div className="divide-y divide-slate-100">{data.recentActivity.map((activity) => <div key={activity.audit_log_id} className="flex gap-3 p-4"><span className="grid size-10 shrink-0 place-items-center rounded-full bg-slate-100 text-xs font-bold text-slate-700">{activity.actor_name.split(/\s+/).map((part) => part[0]).slice(0, 2).join('').toUpperCase()}</span><p className="text-sm text-slate-600"><strong className="text-slate-900">{activity.actor_name}</strong><span className="ml-2 text-xs text-slate-500">{activity.role || 'System'}</span>{' '}{activity.description}{activity.patient_id && activity.patient_name ? <> for <button onClick={() => go('profile', String(activity.patient_id))} className="font-semibold text-blue-700 hover:underline">{activity.patient_name}</button></> : null}<span className="mt-1 block text-xs text-slate-400">{formatDateTime(activity.occurred_at)}</span></p></div>)}</div>}
      </Card>
    </div>
  </>
}

function AppContent() {
  const [user,setUser]=useState<AuthUser|null>(()=>getStoredAuthUser()); const [screen,setScreen]=useState<Screen>('dashboard')
  const [selectedPatientId, setSelectedPatientId] = useState<string>()
  useEffect(() => {
    setUnauthorizedHandler(() => {
      setUser(null)
      setScreen('dashboard')
    })
    return () => setUnauthorizedHandler(null)
  }, [])
  if(!user) return <Login onLogin={authenticatedUser=>setUser(authenticatedUser)}/>
  const navigate = (nextScreen: Screen, patientId?: string) => {
    const permitted = nav.find((item) => item.id === nextScreen)
    if (permitted?.roles && !permitted.roles.includes(user.role)) return
    if (patientId) setSelectedPatientId(patientId)
    setScreen(nextScreen)
  }
  const canRegister = user.role === 'Admin' || user.role === 'Records Officer'
  const screens:Record<Screen,ReactNode>={
    dashboard:<Dashboard go={navigate} userName={user.name}/>,
    patients:<PatientList go={navigate} canRegister={canRegister}/>,
    register:<PatientRegister go={navigate}/>,
    profile:<PatientProfile go={navigate} role={user.role} initialPatientId={selectedPatientId}/>,
    admission:<AdmissionForm go={navigate}/>,
    discharge:<DischargeForm go={navigate}/>,
    audit:<AuditScreen/>,retention:<RetentionScreen/>,users:<UsersScreen currentUserId={user.id}/>
  }
  return <Layout user={user} screen={screen} setScreen={(next) => navigate(next)} logout={()=>{clearAuthSession();setUser(null);setScreen('dashboard')}}>{screens[screen]}</Layout>
}

export default function App() {
  return <ToastProvider><AppContent/></ToastProvider>
}
