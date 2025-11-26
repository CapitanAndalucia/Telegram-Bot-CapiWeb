import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import styles from '../FileShare.module.css'
import { apiClient } from '../../../services/apiClient'
import FilePreviewModal from './FilePreviewModal'
import { toast } from 'react-toastify'

export default function IncomingFiles({ user, onUnreadCountChange }) {
    const [files, setFiles] = useState([])
    const [loading, setLoading] = useState(true)
    const [isDragging, setIsDragging] = useState(false)
    const [uploading, setUploading] = useState(false)
    const [uploadProgress, setUploadProgress] = useState(0)
    const [viewMode, setViewMode] = useState('grid')
    const [selectedFile, setSelectedFile] = useState(null)

    useEffect(() => {
        fetchFiles()
    }, [])

    useEffect(() => {
        // Notify parent of unread count
        if (onUnreadCountChange) {
            const unreadCount = files.filter(f => !f.is_viewed).length
            onUnreadCountChange(unreadCount)
        }
    }, [files, onUnreadCountChange])

    const fetchFiles = async () => {
        try {
            const data = await apiClient.listFiles()
            // Handle Django REST Framework paginated response
            if (data && data.results && Array.isArray(data.results)) {
                setFiles(data.results)
            } else if (Array.isArray(data)) {
                // Handle direct array response (backward compatibility)
                setFiles(data)
            } else {
                console.error('API returned unexpected format:', data)
                setFiles([])
            }
        } catch (error) {
            console.error('Error fetching files', error)
            setFiles([]) // Set to empty array on error
        } finally {
            setLoading(false)
        }
    }

    const markAsViewed = async (fileId) => {
        // Update local state immediately for instant UI feedback (optimistic update)
        setFiles(prev => prev.map(f =>
            f.id === fileId ? { ...f, is_viewed: true } : f
        ))

        try {
            // Then update on server
            await apiClient.markFileViewed(fileId)
        } catch (error) {
            console.error('Failed to mark as viewed', error)
            // Revert on error
            setFiles(prev => prev.map(f =>
                f.id === fileId ? { ...f, is_viewed: false } : f
            ))
        }
    }

    const handleFileClick = (file) => {
        // Always mark as viewed on click (for both grid and list)
        if (!file.is_viewed) {
            markAsViewed(file.id)
        }
        // Open modal
        setSelectedFile(file)
    }

    const handleFileHover = (file) => {
        // Only mark as viewed on hover in grid mode
        if (viewMode === 'grid' && !file.is_viewed) {
            markAsViewed(file.id)
        }
    }

    const handleDragOver = (e) => {
        e.preventDefault()
        setIsDragging(true)
    }

    const handleDragLeave = (e) => {
        e.preventDefault()
        setIsDragging(false)
    }

    const handleDrop = async (e) => {
        e.preventDefault()
        setIsDragging(false)

        const droppedFiles = e.dataTransfer.files
        if (droppedFiles.length > 0 && user) {
            await handleUpload(droppedFiles[0])
        }
    }

    const handleUpload = async (file) => {
        setUploading(true)
        setUploadProgress(0)
        const uploadToastId = toast.info(`Subiendo ${file.name}... 0%`, {
            autoClose: false,
            closeButton: false,
        })

        try {
            const formData = new FormData()
            formData.append('file', file)
            formData.append('recipient_username', user.username)

            await apiClient.uploadFile(formData, (progressEvent) => {
                const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total)
                setUploadProgress(percentCompleted)
                toast.update(uploadToastId, {
                    render: `Subiendo ${file.name}... ${percentCompleted}%`,
                })
            })

            toast.update(uploadToastId, {
                render: 'Archivo subido correctamente',
                type: 'success',
                autoClose: 2000,
                closeButton: true,
            })

            setUploadProgress(0)
            await fetchFiles()
        } catch (error) {
            console.error('Upload failed', error)

            let errorMessage = 'Error al subir el archivo'
            if (error.payload && error.payload.file) {
                errorMessage = error.payload.file
            } else if (error.message) {
                errorMessage = error.message
            }

            toast.update(uploadToastId, {
                render: errorMessage,
                type: 'error',
                autoClose: 5000,
                closeButton: true,
            })
            setUploadProgress(0)
        } finally {
            setUploading(false)
        }
    }

    const handleDownload = async (id, filename) => {
        try {
            // Check if it's an archive and contains executables
            const ext = '.' + filename.split('.').pop().toLowerCase()
            const archiveExts = ['.zip', '.rar', '.7z', '.tar', '.gz', '.bz2']

            if (archiveExts.includes(ext)) {
                const archiveInfo = await apiClient.checkArchive(id)

                if (archiveInfo.has_executables) {
                    const executableList = archiveInfo.executable_files.slice(0, 5).join(', ')
                    const moreCount = archiveInfo.executable_files.length > 5 ?
                        ` y ${archiveInfo.executable_files.length - 5} más` : ''

                    // Show custom warning toast
                    await new Promise((resolve) => {
                        const warningToast = toast.warning(
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                <div style={{ fontWeight: 'bold', fontSize: '15px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <span>⚠️</span>
                                    <span>ADVERTENCIA DE SEGURIDAD</span>
                                </div>
                                <div style={{ fontSize: '13px', lineHeight: '1.5' }}>
                                    Este archivo contiene ejecutables peligrosos:
                                    <div style={{ marginTop: '8px', padding: '8px', background: 'rgba(255, 0, 0, 0.1)', borderRadius: '4px', fontFamily: 'monospace', fontSize: '12px' }}>
                                        {executableList}{moreCount}
                                    </div>
                                </div>
                                <div style={{ fontSize: '12px', opacity: 0.8 }}>
                                    Los archivos .exe, .bat, .sh pueden contener malware
                                </div>
                                <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                                    <button
                                        onClick={() => {
                                            toast.dismiss(warningToast)
                                            resolve(true)
                                        }}
                                        style={{
                                            flex: 1,
                                            padding: '8px 16px',
                                            background: 'linear-gradient(135deg, #FFB800 0%, #FF8800 100%)',
                                            border: 'none',
                                            borderRadius: '6px',
                                            color: 'white',
                                            fontWeight: 'bold',
                                            cursor: 'pointer',
                                            fontSize: '13px'
                                        }}
                                    >
                                        Descargar de todos modos
                                    </button>
                                    <button
                                        onClick={() => {
                                            toast.dismiss(warningToast)
                                            resolve(false)
                                        }}
                                        style={{
                                            flex: 1,
                                            padding: '8px 16px',
                                            background: 'rgba(255, 255, 255, 0.1)',
                                            border: '1px solid rgba(255, 255, 255, 0.2)',
                                            borderRadius: '6px',
                                            color: 'white',
                                            cursor: 'pointer',
                                            fontSize: '13px'
                                        }}
                                    >
                                        Cancelar
                                    </button>
                                </div>
                            </div>,
                            {
                                autoClose: false,
                                closeButton: false,
                                draggable: false,
                                closeOnClick: false,
                            }
                        )
                    }).then((confirmed) => {
                        if (!confirmed) {
                            toast.error('Descarga cancelada por seguridad', {
                                icon: '🛡️',
                            })
                            throw new Error('Download cancelled')
                        }
                    })
                }
            }

            // Proceed with download
            const downloadToastId = toast.info('Descargando archivo...', {
                autoClose: false,
            })

            const blob = await apiClient.downloadFile(id)
            const url = window.URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = filename
            document.body.appendChild(a)
            a.click()
            window.URL.revokeObjectURL(url)
            document.body.removeChild(a)

            toast.update(downloadToastId, {
                render: 'Archivo descargado correctamente',
                type: 'success',
                autoClose: 2000,
            })
        } catch (error) {
            console.error('Download failed', error)
            toast.error('Error al descargar el archivo')
        }
    }

    const handleDelete = async (fileId) => {
        // Create custom confirmation toast
        const confirmToast = toast.info(
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ fontWeight: 'bold', fontSize: '15px' }}>
                    ¿Eliminar archivo?
                </div>
                <div style={{ fontSize: '13px', opacity: 0.9 }}>
                    Esta acción no se puede deshacer
                </div>
                <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                    <button
                        onClick={() => {
                            toast.dismiss(confirmToast)
                            performDelete(fileId)
                        }}
                        style={{
                            flex: 1,
                            padding: '8px 16px',
                            background: 'linear-gradient(135deg, #FF3366 0%, #CC0044 100%)',
                            border: 'none',
                            borderRadius: '6px',
                            color: 'white',
                            fontWeight: 'bold',
                            cursor: 'pointer',
                            fontSize: '13px'
                        }}
                    >
                        Eliminar
                    </button>
                    <button
                        onClick={() => toast.dismiss(confirmToast)}
                        style={{
                            flex: 1,
                            padding: '8px 16px',
                            background: 'rgba(255, 255, 255, 0.1)',
                            border: '1px solid rgba(255, 255, 255, 0.2)',
                            borderRadius: '6px',
                            color: 'white',
                            cursor: 'pointer',
                            fontSize: '13px'
                        }}
                    >
                        Cancelar
                    </button>
                </div>
            </div>,
            {
                autoClose: false,
                closeButton: false,
                draggable: false,
                closeOnClick: false,
            }
        )
    }

    const performDelete = async (fileId) => {
        const deleteToast = toast.info('Eliminando archivo...', {
            autoClose: false,
        })

        try {
            await apiClient.deleteFile(fileId)

            toast.update(deleteToast, {
                render: 'Archivo eliminado correctamente',
                type: 'success',
                autoClose: 2000,
            })

            await fetchFiles()
            setSelectedFile(null)
        } catch (error) {
            console.error('Delete failed', error)
            toast.update(deleteToast, {
                render: 'Error al eliminar el archivo',
                type: 'error',
                autoClose: 3000,
            })
        }
    }

    return (
        <>
            <div
                className={`${styles.incomingFiles} ${isDragging ? styles.dragging : ''}`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
            >
                <div className={styles.filesHeader}>
                    <h3>Mis Archivos {uploading && <span className={styles.uploadingBadge}>Subiendo...</span>}</h3>
                    <div className={styles.viewToggle}>
                        <button
                            className={`${styles.toggleBtn} ${viewMode === 'list' ? styles.active : ''}`}
                            onClick={() => setViewMode('list')}
                            title="Lista"
                        >
                            ☰
                        </button>
                        <button
                            className={`${styles.toggleBtn} ${viewMode === 'grid' ? styles.active : ''}`}
                            onClick={() => setViewMode('grid')}
                            title="Cuadrícula"
                        >
                            ⊞
                        </button>
                    </div>
                </div>

                {loading ? (
                    <p>Cargando...</p>
                ) : files.length === 0 ? (
                    <div className={styles.emptyState}>
                        <p>No has recibido archivos aún</p>
                        <p className={styles.dragHint}>Arrastra un archivo aquí para subirlo a tu nube personal</p>
                    </div>
                ) : (
                    <ul className={`${styles.filesList} ${viewMode === 'list' ? styles.listMode : ''}`}>
                        {Array.isArray(files) && files.map(file => {
                            const isImage = /\.(jpg|jpeg|png|gif|webp)$/i.test(file.filename)
                            const isNew = !file.is_viewed

                            return (
                                <motion.li
                                    key={file.id}
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    className={`${styles.fileCard} ${viewMode === 'list' ? styles.listMode : ''}`}
                                    onMouseEnter={() => handleFileHover(file)}
                                    onClick={() => handleFileClick(file)}
                                    style={{ cursor: 'pointer' }}
                                >
                                    {/* New indicator for list view */}
                                    {viewMode === 'list' && isNew && (
                                        <div className={styles.newIndicatorList}>
                                            <span className={styles.newDot}></span>
                                        </div>
                                    )}

                                    {/* New indicator for grid view */}
                                    {viewMode === 'grid' && isNew && (
                                        <div className={styles.newIndicatorGrid}>NUEVO</div>
                                    )}

                                    <div className={styles.previewContainer}>
                                        {isImage ? (
                                            <img
                                                src={`http://localhost:8000/api/transfers/${file.id}/download/`}
                                                alt={file.filename}
                                                className={styles.fileImage}
                                                onError={(e) => { e.target.onerror = null; e.target.src = 'fallback_image_url' }}
                                            />
                                        ) : (
                                            <div className={styles.fileIconPlaceholder}>
                                                📄
                                            </div>
                                        )}
                                        {viewMode === 'grid' && (
                                            <div className={styles.fileOverlay}>
                                                <span className={styles.fileNameOverlay}>{file.filename}</span>
                                            </div>
                                        )}
                                    </div>

                                    {viewMode === 'list' && (
                                        <div className={styles.fileInfoList}>
                                            <span className={styles.fileNameList}>{file.filename}</span>
                                            <span className={styles.fileSizeList}>{(file.size / 1024).toFixed(1)} KB</span>
                                        </div>
                                    )}

                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation()
                                            handleDownload(file.id, file.filename)
                                        }}
                                        className={styles.downloadIconBtn}
                                        title="Descargar"
                                    >
                                        ⬇
                                    </button>
                                </motion.li>
                            )
                        })}
                    </ul>
                )}
            </div>

            {selectedFile && (
                <FilePreviewModal
                    file={selectedFile}
                    onClose={() => setSelectedFile(null)}
                    onDownload={handleDownload}
                    onDelete={handleDelete}
                />
            )}
        </>
    )
}
