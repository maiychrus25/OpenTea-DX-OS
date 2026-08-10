import { auth } from "../../../auth"
import { redirect } from "next/navigation"

export default async function OfficerDashboard() {
  const session = await auth()
  
  if ((session?.user as any)?.role !== "officer") {
    redirect("/unauthorized")
  }

  return (
    <div style={{ padding: '20px' }}>
      <h1>Dashboard Cán Bộ Kỹ Thuật</h1>
      <p>Xin chào, {session?.user?.name}</p>
      <form action="/api/auth/signout" method="POST">
        <button type="submit">Đăng xuất</button>
      </form>
    </div>
  )
}
