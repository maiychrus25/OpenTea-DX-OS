// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

"use client"

import type { ReactElement } from "react"
import { useState } from "react"
import { logger } from "@/lib/logger"
import styles from "./copy-url-button.module.css"

type CopyStatus = "idle" | "success" | "error"

export default function CopyUrlButton(): ReactElement {
    const [status, setStatus] = useState<CopyStatus>("idle")

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(window.location.href)
            setStatus("success")
        } catch (error) {
            logger.error("Copy failed", { error })
            setStatus("error")
        }
        setTimeout(() => setStatus("idle"), 3000)
    }

    return (
        <div className={styles.wrapper}>
            <button type="button" className={styles.button} onClick={handleCopy}>
                Sao chép URL
            </button>
            {status === "success" && <span className={styles.status}>Đã sao chép URL</span>}
            {status === "error" && <span className={styles.status}>Không thể sao chép, vui lòng thử lại</span>}
        </div>
    )
}
