import React, { FormEvent, useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import {
  User as FirebaseUser,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth'
import {
  addDoc,
  collection,
  doc,
  getDoc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore'
import { auth, db, isFirebaseConfigured } from './firebase'
import { getSpiritTitle, spiritTitles, warmthPercent } from './temperature'
import './styles.css'
import AdminModeration from './pages/AdminModeration'

type Gender = 'male' | 'female' | 'other'

type Profile = {
  uid: string
  nickname: string
  gender: Gender
  age: number
  area: string
  intro: string
  warmth: number
}

type Message = {
  id: string
  senderId: string
  text: string
  createdAt?: unknown
}

const defaultProfile = {
  nickname: '',
  gender: 'female' as Gender,
  age: 24,
  area: '서울',
  intro: '편하게 대화하고 싶어요 :)',
}

const ADULT_VERIFICATION_KEY = 'ongi_adult_verified_v1'
const MINIMUM_AGE = 19

function isAdultVerified() {
  return localStorage.getItem(ADULT_VERIFICATION_KEY) === 'true'
}

function AdultGate({ onVerified }: { onVerified: () => void }) {
  const [checked, setChecked] = useState(false)
  const [error, setError] = useState('')

  function enter() {
    if (!checked) {
      setError('만 19세 이상 확인에 동의해야 이용할 수 있어요.')
      return
    }
    localStorage.setItem(ADULT_VERIFICATION_KEY, 'true')
    onVerified()
  }

  return (
    <section className="authCard adultGate">
      <div className="logo">🔞</div>
      <h1>온기</h1>
      <p className="subtitle">만 19세 이상 전용 서비스</p>
      <p className="desc">
        온기는 위치 기반 친구 찾기, 프로필, 사진/채팅 등 사용자 간 소통 기능을 포함한 성인 대상 서비스입니다.<br />
        미성년자는 가입 및 이용할 수 없습니다.
      </p>
      <label className="checkRow">
        <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} />
        <span>본인은 만 19세 이상이며, 미성년자가 아님을 확인합니다.</span>
      </label>
      {error && <p className="error">{error}</p>}
      <button className="primary full" type="button" onClick={enter}>19세 이상 확인 후 입장</button>
      <p className="minorNotice">미성년자인 경우 이 앱을 종료해 주세요.</p>
    </section>
  )
}

function getChatId(a: string, b: string) {
  return [a, b].sort().join('_')
}

function SpiritBadge({ warmth, compact = false }: { warmth: number; compact?: boolean }) {
  const info = getSpiritTitle(warmth)
  return (
    <span className={`spiritBadge ${info.className} ${compact ? 'compact' : ''}`} title={`${info.title} · ${warmth.toFixed(1)}°`}>
      <span>{info.spirit}</span>
      <span>{info.title}</span>
    </span>
  )
}

function AuthPanel() {
  const [mode, setMode] = useState<'login' | 'signup'>('signup')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError('')
    if (!auth) return setError('Firebase 설정값이 없습니다. .env 파일을 먼저 입력하세요.')
    try {
      if (mode === 'signup') await createUserWithEmailAndPassword(auth, email, password)
      else await signInWithEmailAndPassword(auth, email, password)
    } catch (err) {
      setError(err instanceof Error ? err.message : '로그인 처리 중 문제가 발생했어요.')
    }
  }

  return (
    <section className="authCard">
      <div className="logo">💜</div>
      <h1>온기</h1>
      <p className="subtitle">우리, 조금 더 가까워질 수 있을까</p>
      {!isFirebaseConfigured && <p className="warning">Firebase 설정 전입니다. `.env`에 Firebase 값을 넣으면 로그인/채팅이 작동해요.</p>}
      <form onSubmit={submit} className="form">
        <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="이메일" required />
        <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" placeholder="비밀번호 6자 이상" minLength={6} required />
        {error && <p className="error">{error}</p>}
        <button className="primary" type="submit">{mode === 'signup' ? '시작하기' : '로그인'}</button>
      </form>
      <button className="linkButton" onClick={() => setMode(mode === 'signup' ? 'login' : 'signup')}>
        {mode === 'signup' ? '이미 계정이 있어요' : '새 계정 만들기'}
      </button>
    </section>
  )
}

function ProfileSetup({ user, onSaved }: { user: FirebaseUser; onSaved: (profile: Profile) => void }) {
  const [form, setForm] = useState(defaultProfile)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError('')
    if (!db) return
    if (Number(form.age) < MINIMUM_AGE) {
      setError('온기는 만 19세 이상만 가입할 수 있습니다.')
      return
    }
    setSaving(true)
    const profile: Profile = {
      uid: user.uid,
      nickname: form.nickname || user.email?.split('@')[0] || '온기유저',
      gender: form.gender,
      age: Number(form.age),
      area: form.area,
      intro: form.intro,
      warmth: 36.5,
    }
    await setDoc(doc(db, 'profiles', user.uid), {
      ...profile,
      adultVerified: true,
      minimumAgeNotice: '만 19세 이상 전용 서비스',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
    setSaving(false)
    onSaved(profile)
  }

  return (
    <section className="authCard wide">
      <h1>프로필 만들기</h1>
      <p className="desc">닉네임 옆에는 온도에 따라 작은 정령 칭호가 붙어요. 온기는 만 19세 이상만 이용할 수 있습니다.</p>
      <form onSubmit={submit} className="form gridForm">
        <input value={form.nickname} onChange={(e) => setForm({ ...form, nickname: e.target.value })} placeholder="닉네임" required />
        <input value={form.age} onChange={(e) => setForm({ ...form, age: Number(e.target.value) })} type="number" min={19} max={99} placeholder="나이" required />
        <select value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value as Gender })}>
          <option value="female">여성</option>
          <option value="male">남성</option>
          <option value="other">기타</option>
        </select>
        <input value={form.area} onChange={(e) => setForm({ ...form, area: e.target.value })} placeholder="지역" required />
        <input className="full" value={form.intro} onChange={(e) => setForm({ ...form, intro: e.target.value })} placeholder="한줄 소개" required />
        <p className="adultNotice full">가입 시 본 서비스가 만 19세 이상 전용임을 확인하며, 미성년자는 이용할 수 없습니다.</p>
        {error && <p className="error full">{error}</p>}
        <button className="primary full" disabled={saving}>{saving ? '저장 중...' : '온기 시작하기'}</button>
      </form>
    </section>
  )
}

function ChatRoom({ me, target }: { me: Profile; target: Profile }) {
  const [messages, setMessages] = useState<Message[]>([])
  const [text, setText] = useState('')
  const chatId = useMemo(() => getChatId(me.uid, target.uid), [me.uid, target.uid])

  useEffect(() => {
    if (!db) return
    const chatRef = doc(db, 'chats', chatId)
    setDoc(
      chatRef,
      {
        memberIds: [me.uid, target.uid].sort(),
        memberNames: [me.nickname, target.nickname],
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    )
    const q = query(collection(db, 'chats', chatId, 'messages'), orderBy('createdAt', 'asc'), limit(100))
    return onSnapshot(q, (snapshot) => {
      setMessages(snapshot.docs.map((item) => ({ id: item.id, ...(item.data() as Omit<Message, 'id'>) })))
    })
  }, [chatId, me.nickname, me.uid, target.nickname, target.uid])

  async function send(e: FormEvent) {
    e.preventDefault()
    if (!db || !text.trim()) return
    const clean = text.trim().slice(0, 500)
    setText('')
    await addDoc(collection(db, 'chats', chatId, 'messages'), {
      senderId: me.uid,
      text: clean,
      createdAt: serverTimestamp(),
    })
    await updateDoc(doc(db, 'chats', chatId), { lastMessage: clean, updatedAt: serverTimestamp() })
  }

  return (
    <section className="chatPanel">
      <div className="chatHeader">
        <div>
          <b>{target.nickname}</b> <SpiritBadge warmth={target.warmth} compact />
          <p>{target.area} · {target.intro}</p>
        </div>
      </div>
      <div className="messages">
        {messages.length === 0 && <p className="empty">아직 메시지가 없어요. 따뜻하게 첫 인사를 보내보세요 💜</p>}
        {messages.map((msg) => (
          <div key={msg.id} className={`message ${msg.senderId === me.uid ? 'mine' : ''}`}>{msg.text}</div>
        ))}
      </div>
      <form className="sendBox" onSubmit={send}>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="메시지 입력" maxLength={500} />
        <button>전송</button>
      </form>
    </section>
  )
}

function MainApp({ firebaseUser, profile, setProfile }: { firebaseUser: FirebaseUser; profile: Profile; setProfile: (p: Profile) => void }) {
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [selected, setSelected] = useState<Profile | null>(null)
  const titleInfo = getSpiritTitle(profile.warmth)

  useEffect(() => {
    if (!db) return
    const q = query(collection(db, 'profiles'), orderBy('warmth', 'desc'), limit(50))
    return onSnapshot(q, (snapshot) => {
      const list = snapshot.docs.map((item) => item.data() as Profile).filter((item) => Number(item.age) >= MINIMUM_AGE)
      setProfiles(list)
      const firstOther = list.find((item) => item.uid !== firebaseUser.uid)
      setSelected((prev) => prev ?? firstOther ?? null)
    })
  }, [firebaseUser.uid])

  const others = profiles.filter((item) => item.uid !== firebaseUser.uid)

  return (
    <main className="app">
      <section className="hero">
        <div className="logo">💜</div>
        <div>
          <h1>온기</h1>
          <p className="subtitle">동네에서 시작하는 따뜻한 인연</p>
          <div className="myLine">
            <b>{profile.nickname}</b>
            <SpiritBadge warmth={profile.warmth} compact />
            <span>{profile.warmth.toFixed(1)}°</span>
          </div>
          <button className="smallButton" onClick={() => auth && signOut(auth)}>로그아웃</button>
        </div>
      </section>

      <section className="previewGrid">
        <div className="phone">
          <div className="phoneHeader">지금 따뜻한 사람들 🔥</div>
          <div className="cards">
            {others.length === 0 && <p className="empty">아직 다른 유저가 없어요. 다른 계정으로 가입하면 여기 표시됩니다.</p>}
            {others.map((user) => {
              const info = getSpiritTitle(user.warmth)
              return (
                <button key={user.uid} className={`userCard ${selected?.uid === user.uid ? 'active' : ''}`} onClick={() => setSelected(user)}>
                  <div className="avatar">{user.gender === 'female' ? '👩' : user.gender === 'male' ? '👨' : '🙂'}</div>
                  <div className="nameLine">
                    <strong>{user.nickname}, {user.age}</strong>
                    <SpiritBadge warmth={user.warmth} compact />
                  </div>
                  <small>{user.area}</small>
                  <p>{user.intro}</p>
                  <div className="tempLine"><span>{info.spirit} {info.title}</span><b>{user.warmth.toFixed(1)}°</b></div>
                </button>
              )
            })}
          </div>
        </div>

        <div className={`detail ${titleInfo.className}`}>
          <p className="label">내 온기</p>
          <div className="bigAvatar">{profile.gender === 'female' ? '👩' : profile.gender === 'male' ? '👨' : '🙂'}</div>
          <h2 className="profileName">{profile.nickname}<SpiritBadge warmth={profile.warmth} compact /></h2>
          <div className={`largeSpirit ${titleInfo.className}`}>{titleInfo.spirit}</div>
          <div className="largeTitle">{titleInfo.title}</div>
          <div className="tempValue">{profile.warmth.toFixed(1)}°</div>
          <div className="meter"><span style={{ width: `${warmthPercent(profile.warmth)}%` }} /></div>
          <p className="desc">{titleInfo.desc}</p>
        </div>
      </section>

      {selected && <ChatRoom me={profile} target={selected} />}

      <section className="system">
        <h2>온기 칭호 정령 도감</h2>
        <div className="titleGrid">
          {spiritTitles.map((item) => (
            <div key={item.title} className={`tier ${item.className}`}>
              <b>{item.min === 100 ? '100° 이상' : item.min === -100 ? '19° 이하 ~ -100°' : `${item.min}° ~ ${Math.floor(item.max * 10) / 10}°`}</b>
              <span className="tierSpirit">{item.spirit}</span>
              <strong>{item.title}</strong>
              <p>{item.desc}</p>
            </div>
          ))}
        </div>
        <img className="guideImage" src="/assets/ongi_spirit_title_guide.png" alt="온기 칭호 정령 도감" />
      </section>

      <footer>
        <a href="/privacy/">개인정보처리방침</a>
        <a href="/delete-account/">계정 삭제 요청</a>
        <span>만 19세 이상 전용</span>
      </footer>
    </main>
  )
}

function Root() {
  if (window.location.pathname.startsWith('/admin/moderation')) return <AdminModeration />
  const [adultVerified, setAdultVerified] = useState(isAdultVerified())
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!auth) {
      setLoading(false)
      return
    }
    return onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user)
      if (user && db) {
        const snap = await getDoc(doc(db, 'profiles', user.uid))
        setProfile(snap.exists() ? (snap.data() as Profile) : null)
      } else {
        setProfile(null)
      }
      setLoading(false)
    })
  }, [])

  if (!adultVerified) return <AdultGate onVerified={() => setAdultVerified(true)} />
  if (loading) return <main className="app"><section className="authCard"><h1>온기 불러오는 중...</h1></section></main>
  if (!firebaseUser) return <AuthPanel />
  if (!profile) return <ProfileSetup user={firebaseUser} onSaved={setProfile} />
  return <MainApp firebaseUser={firebaseUser} profile={profile} setProfile={setProfile} />
}

createRoot(document.getElementById('root')!).render(<Root />)
