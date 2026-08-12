// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { signIn } from "../../../auth"

export default function LoginPage() {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', flexDirection: 'column' }}>
      <h1>ÄÄƒng nháº­p DX-AgriMarket</h1>
      <p>Há»‡ Ä‘iá»u hÃ nh sá»‘ NÃ´ng nghiá»‡p</p>
      
      <form
        action={async () => {
          "use server"
          await signIn("keycloak")
        }}
      >
        <button type="submit" style={{ padding: '10px 20px', fontSize: '16px', cursor: 'pointer' }}>
          ÄÄƒng nháº­p qua Keycloak
        </button>
      </form>
    </div>
  )
}
