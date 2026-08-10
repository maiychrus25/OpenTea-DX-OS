import Link from "next/link"

export default function UnauthorizedPage() {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', flexDirection: 'column' }}>
      <h1 style={{ color: 'red' }}>403 - KHÔNG CÓ QUYỀN TRUY CẬP</h1>
      <p>Bạn không có quyền truy cập vào trang này dựa trên chức vụ của bạn.</p>
      <Link href="/" style={{ marginTop: '20px', color: 'blue', textDecoration: 'underline' }}>
        Quay lại trang chủ
      </Link>
    </div>
  )
}
