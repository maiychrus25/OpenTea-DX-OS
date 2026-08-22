// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

'use client'

import { useState } from 'react'
import { signIn } from 'next-auth/react'
import { Button } from "@/components/ui"
import styles from "../login-page.module.css"

export function LoginForm() {
  const [isLoading, setIsLoading] = useState(false)

  const handleLogin = async () => {
    setIsLoading(true)
    await signIn("keycloak", { callbackUrl: "/" })
  }

  return (
    <div className={styles.form}>
      <Button 
        type="button" 
        onClick={handleLogin} 
        className={styles.submitButton} 
        isLoading={isLoading}
      >
        Tiếp tục với Keycloak
      </Button>
    </div>
  )
}
