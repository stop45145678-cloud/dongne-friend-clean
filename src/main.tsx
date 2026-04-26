import React from 'react'
import { createRoot } from 'react-dom/client'

function App() {
  return (
    <main style={{ fontFamily: 'Arial, sans-serif', padding: 32 }}>
      <h1>Dongne Friend App Running</h1>
      <p>동네친구 앱 웹 페이지가 정상 작동 중입니다.</p>
      <p><a href="/privacy/">개인정보처리방침</a></p>
      <p><a href="/delete-account/">계정 삭제 요청</a></p>
    </main>
  )
}

createRoot(document.getElementById('root')!).render(<App />)
