import { motion, AnimatePresence } from 'framer-motion'
import styles from '../FileShare.module.css'

export default function FilePreviewModal({ file, onClose, onDownload, onDelete }) {
    if (!file) return null

    const isImage = /\.(jpg|jpeg|png|gif|webp)$/i.test(file.filename)
    const downloadUrl = `http://localhost:8000/api/transfers/${file.id}/download/`

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className={styles.modalOverlay}
                onClick={onClose}
            >
                <motion.div
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.9, opacity: 0 }}
                    className={styles.modalContent}
                    onClick={(e) => e.stopPropagation()}
                >
                    <button className={styles.closeModalBtn} onClick={onClose}>✕</button>

                    <div className={styles.previewHeader}>
                        <h3>{file.filename}</h3>
                        <div className={styles.previewMeta}>
                            <span>{(file.size / 1024).toFixed(1)} KB</span>
                            <span className={styles.separator}>•</span>
                            <span>{new Date(file.created_at).toLocaleDateString()}</span>
                        </div>
                    </div>

                    <div className={styles.previewBody}>
                        {isImage ? (
                            <img src={downloadUrl} alt={file.filename} className={styles.modalImage} />
                        ) : (
                            <div className={styles.genericPreview}>
                                <div className={styles.genericIcon}>📄</div>
                                <p>No hay vista previa disponible</p>
                            </div>
                        )}
                    </div>

                    <div className={styles.previewFooter}>
                        <button
                            className={styles.deleteBtn}
                            onClick={() => onDelete(file.id)}
                        >
                            Eliminar
                        </button>
                        <button
                            className={styles.downloadBtn}
                            onClick={() => onDownload(file.id, file.filename)}
                        >
                            Descargar
                        </button>
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    )
}
