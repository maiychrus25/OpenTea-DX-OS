import { auth } from "../../../auth"
import { redirect } from "next/navigation"

export default async function ManagerDashboard() {
  const session = await auth()
  
  // Double check server-side in case middleware is bypassed
  if ((session?.user as any)?.role !== "manager") {
    redirect("/unauthorized")
  }

  return (
    <div style={{ padding: '20px' }}>
      <h1>Dashboard Giám Đốc HTX</h1>
      <p>Xin chào, {session?.user?.name}</p>
      <form action="/api/auth/signout" method="POST">
        <button type="submit">Đăng xuất</button>
      </form>
    </div>
  )
}
