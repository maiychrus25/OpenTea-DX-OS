import React from 'react'
import BulletinCard from './_components/BulletinCard'

async function fetchBulletin(commodity?: string) {
  const base = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'
  const url = `${base}/api/bulletin${commodity ? `?commodity=${commodity}` : ''}`
  try {
    const res = await fetch(url, { cache: 'no-store' })
    const json = await res.json().catch(() => null)
    return { status: res.status, ok: res.ok, json }
  } catch (err) {
    return { status: 503, ok: false, json: null }
  }
}

function SkeletonList() {
  const items = [1, 2, 3]
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      {items.map(i => (
        <article key={i} style={{ borderRadius: 8, padding: 16, background: '#fff', boxShadow: '0 1px 0 rgba(0,0,0,0.04)' }}>
          <div style={{ width: '60%', height: 24, background: '#f3f4f6', borderRadius: 4, marginBottom: 12 }} />
          <div style={{ width: '100%', height: 14, background: '#f3f4f6', borderRadius: 4, marginBottom: 6 }} />
          <div style={{ width: '100%', height: 14, background: '#f3f4f6', borderRadius: 4, marginBottom: 6 }} />
          <div style={{ width: '80%', height: 14, background: '#f3f4f6', borderRadius: 4, marginTop: 8 }} />
        </article>
      ))}
    </div>
  )
}

export default async function BulletinPage() {
  const { status, ok, json } = await fetchBulletin()

  // Page title display
  const titleStyle: React.CSSProperties = { fontSize: 32, fontWeight: 700, marginBottom: 20 }

  // Handle Ollama / AI unavailable: API may return 503 or a success payload without synthesized text
  if (!ok && status === 503) {
    const raw = json?.data ?? null
    return (
      <main>
        <h1 style={titleStyle}>Bản tin thị trường</h1>
        <div style={{ padding: 12, background: '#fff4f4', borderRadius: 6, color: '#7f1d1d', marginBottom: 16 }}>
          Không thể kết nối máy chủ AI. Hiển thị dữ liệu thô.
        </div>
        <section>
          {raw ? (
            <table style={{ width: '100%', borderCollapse: 'collapse', background: '#fff' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', padding: 8, borderBottom: '1px solid #e5e7eb' }}>Source</th>
                  <th style={{ textAlign: 'left', padding: 8, borderBottom: '1px solid #e5e7eb' }}>Metric</th>
                  <th style={{ textAlign: 'left', padding: 8, borderBottom: '1px solid #e5e7eb' }}>Value</th>
                  <th style={{ textAlign: 'left', padding: 8, borderBottom: '1px solid #e5e7eb' }}>Date</th>
                </tr>
              </thead>
              <tbody>
                {raw.sources_json && raw.sources_json.map((s: any, idx: number) => (
                  <tr key={idx}>
                    <td style={{ padding: 8, borderBottom: '1px solid #f3f4f6' }}>{s.source}</td>
                    <td style={{ padding: 8, borderBottom: '1px solid #f3f4f6' }}>{s.metric}</td>
                    <td style={{ padding: 8, borderBottom: '1px solid #f3f4f6' }}>{s.value} {s.unit ?? ''}</td>
                    <td style={{ padding: 8, borderBottom: '1px solid #f3f4f6' }}>{s.date}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div>No raw data available.</div>
          )}
        </section>
      </main>
    )
  }

  // If API returned successfully but no bulletin synthesized yet -> show skeletons
  if (!json || !json.data || !json.data.bulletin_vi) {
    return (
      <main>
        <h1 style={titleStyle}>Bản tin thị trường</h1>
        <SkeletonList />
      </main>
    )
  }

  // Normal rendered bulletin
  const bulletin = json.data

  // Ensure AI invariant: append citation if model_used present and text lacks (Nguồn:
  const hasCitation = /\(Nguồn:/i.test(bulletin.bulletin_vi || '')
  if (bulletin.model_used && !hasCitation) {
    const firstSource = bulletin.sources_json && bulletin.sources_json[0] && bulletin.sources_json[0].source
    const date = bulletin.generated_at ? new Date(bulletin.generated_at) : null
    const ddmmy = date ? `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}` : ''
    bulletin.bulletin_vi = `${bulletin.bulletin_vi}\n\n(Nguồn: ${firstSource || bulletin.model_used}${ddmmy ? `, ${ddmmy}` : ''})`
  }

  return (
    <main>
      <h1 style={titleStyle}>Bản tin thị trường</h1>
      <BulletinCard bulletin={bulletin} />
    </main>
  )
}
