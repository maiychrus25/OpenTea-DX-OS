"use client"

import { useState } from "react"
import styles from "./copy-url-button.module.css"

export default function CopyUrlButton() {
    const [status, setStatus] = useState<string>("")

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(window.location.href)
            setStatus("Đã sao chép URL")
        } catch (error) {
            console.error("Copy failed", error)
            setStatus("Không thể sao chép, vui lòng thử lại")
        }
        setTimeout(() => setStatus(""), 3000)
    }

    return (
        <div className={styles.wrapper}>
            <button type="button" className={styles.button} onClick={handleCopy}>
                Sao chép URL
            </button>
            {status ? <span className={styles.status}>{status}</span> : null}
        </div>
    )
}
