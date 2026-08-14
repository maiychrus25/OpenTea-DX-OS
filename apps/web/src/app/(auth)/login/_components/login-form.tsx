// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

'use client'

import { useFormState, useFormStatus } from 'react-dom'
import { Button } from "@/components/ui"
import styles from "../login-page.module.css"
import { loginAction } from '../actions'

function SubmitButton() {
  const { pending } = useFormStatus()
  
  return (
    <Button type="submit" className={styles.submitButton} isLoading={pending}>
      Tiếp tục với Keycloak
    </Button>
  )
}

export function LoginForm() {
  const [state, formAction] = useFormState(loginAction, null)

  return (
    <form action={formAction} className={styles.form}>
      {state?.error && (
        <div className={styles.errorBanner} role="alert">
          {state.error}
        </div>
      )}
      <SubmitButton />
    </form>
  )
}
