// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

'use server'

import { AuthError } from "next-auth"
import { signIn } from "@/auth"

export async function loginAction(_prevState: { error: string } | null | undefined, _formData: FormData) {
  try {
    await signIn("keycloak")
  } catch (error) {
    if (error instanceof AuthError) {
      return { error: "Không thể kết nối máy chủ xác thực. Vui lòng thử lại sau." }
    }
    // Must rethrow so Next.js can handle redirects
    throw error
  }
}
