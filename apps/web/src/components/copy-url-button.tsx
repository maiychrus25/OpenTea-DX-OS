// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

"use client"

import { useState } from "react"
import styles from "./copy-url-button.module.css"

export default function CopyUrlButton() {
    const [status, setStatus] = useState<string>("")

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(window.location.href)
            setStatus("ÄÃ£ sao chÃ©p URL")
        } catch (error) {
            console.error("Copy failed", error)
            setStatus("KhÃ´ng thá»ƒ sao chÃ©p, vui lÃ²ng thá»­ láº¡i")
        }
        setTimeout(() => setStatus(""), 3000)
    }

    return (
        <div className={styles.wrapper}>
            <button type="button" className={styles.button} onClick={handleCopy}>
                Sao chÃ©p URL
            </button>
            {status ? <span className={styles.status}>{status}</span> : null}
        </div>
    )
}
