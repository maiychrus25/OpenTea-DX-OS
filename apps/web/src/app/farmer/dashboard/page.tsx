import { auth } from "../../../auth"
import { redirect } from "next/navigation"

export default async function FarmerDashboard() {
  const session = await auth()
  
  if ((session?.user as any)?.role !== "farmer") {
    redirect("/unauthorized")
  }

  return (
    <div style={{ padding: '20px' }}>
      <h1>Dashboard Nông Dân</h1>
      <p>Xin chào, {session?.user?.name}</p>
      <form action="/api/auth/signout" method="POST">
        <button type="submit">Đăng xuất</button>
      </form>
    </div>
  )
}
