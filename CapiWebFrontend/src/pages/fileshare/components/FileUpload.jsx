import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import styles from '../FileShare.module.css'
import { apiClient } from '../../../services/apiClient'

export default function FileUpload({ onUploadSuccess, user, selectedRecipient, onRecipientChange }) {
    const [file, setFile] = useState(null)
    const [recipient, setRecipient] = useState('')
    const [description, setDescription] = useState('')
    const [uploading, setUploading] = useState(false)
    const [error, setError] = useState('')
    const [sendToSelf, setSendToSelf] = useState(false)

    // Sync with selectedRecipient from parent
    useEffect(() => {
        if (selectedRecipient) {
            setRecipient(selectedRecipient)
            setSendToSelf(selectedRecipient === user?.username)
        }
    }, [selectedRecipient, user])

    const handleFileChange = (e) => {
        if (e.target.files[0]) {
            setFile(e.target.files[0])
        }
    }

    const handleSelfToggle = (e) => {
        const isChecked = e.target.checked
        setSendToSelf(isChecked)
        if (isChecked && user) {
            setRecipient(user.username)
            if (onRecipientChange) {
                onRecipientChange(user.username)
            }
        } else {
            setRecipient('')
            if (onRecipientChange) {
                onRecipientChange('')
            }
        }
    }

    const handleRecipientChange = (value) => {
        setRecipient(value)
        if (onRecipientChange) {
            onRecipientChange(value)
        }
        if (sendToSelf && value !== user?.username) {
            setSendToSelf(false)
        }
    }

    const handleSubmit = async (e) => {
        e.preventDefault()
        if (!file || !recipient) return

        setUploading(true)
        setError('')

        try {
            const formData = new FormData()
            formData.append('file', file)
            formData.append('recipient_username', recipient)
            if (description) formData.append('description', description)

            await apiClient.uploadFile(formData)
            onUploadSuccess()
            // Reset form
            setFile(null)
            setRecipient('')
            setDescription('')
            setSendToSelf(false)
            if (onRecipientChange) {
                onRecipientChange('')
            }
        } catch (err) {
            setError(err.payload?.error || 'Error al subir archivo')
        } finally {
            setUploading(false)
        }
    }

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className={styles.uploadContainer}
        >
            <h2>Enviar Archivo</h2>
            <form onSubmit={handleSubmit} className={styles.uploadForm}>
                <div className={styles.formGroup}>
                    <div className={styles.recipientHeader}>
                        <label>Destinatario</label>
                        <label className={styles.checkboxLabel}>
                            <input
                                type="checkbox"
                                checked={sendToSelf}
                                onChange={handleSelfToggle}
                            />
                            Enviarme a mí mismo
                        </label>
                    </div>
                    <input
                        type="text"
                        value={recipient}
                        onChange={(e) => handleRecipientChange(e.target.value)}
                        className={styles.input}
                        placeholder="Escribe el nombre de usuario..."
                        required
                        disabled={sendToSelf}
                    />
                </div>

                <div className={styles.formGroup}>
                    <label>Archivo</label>
                    <div className={styles.fileInputWrapper}>
                        <input
                            type="file"
                            onChange={handleFileChange}
                            className={styles.fileInput}
                            required
                        />
                        <div className={styles.fileDropZone}>
                            {file ? file.name : 'Arrastra un archivo o haz clic aquí'}
                        </div>
                    </div>
                </div>

                <div className={styles.formGroup}>
                    <label>Descripción (Opcional)</label>
                    <textarea
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        className={styles.textarea}
                        rows="3"
                    />
                </div>

                {error && <p className={styles.errorText}>{error}</p>}

                <button
                    type="submit"
                    className={styles.submitButton}
                    disabled={uploading}
                >
                    {uploading ? 'Enviando...' : 'Enviar Archivo'}
                </button>
            </form>
        </motion.div>
    )
}
