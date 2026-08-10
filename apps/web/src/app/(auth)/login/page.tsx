import { signIn } from "../../../../auth"

export default function LoginPage() {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', flexDirection: 'column' }}>
      <h1>Đăng nhập DX-AgriMarket</h1>
      <p>Hệ điều hành số Nông nghiệp</p>
      
      <form
        action={async () => {
          "use server"
          await signIn("keycloak")
        }}
      >
        <button type="submit" style={{ padding: '10px 20px', fontSize: '16px', cursor: 'pointer' }}>
          Đăng nhập qua Keycloak
        </button>
      </form>
    </div>
  )
}
