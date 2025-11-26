import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import styles from '../FileShare.module.css'
import { apiClient } from '../../../services/apiClient'

export default function NotificationCenter() {
    const [notifications, setNotifications] = useState([])
    const [requests, setRequests] = useState([])
    const [isOpen, setIsOpen] = useState(false)

    useEffect(() => {
        if (isOpen) {
            fetchData()
        }
    }, [isOpen])

    const fetchData = async () => {
        try {
            const [notifsData, requestsData] = await Promise.all([
                apiClient.listNotifications(),
                apiClient.listFriendRequests()
            ])
            setNotifications(notifsData)
            setRequests(requestsData)
        } catch (error) {
            console.error('Error fetching notifications', error)
        }
    }

    const handleAccept = async (id) => {
        try {
            await apiClient.acceptFriendRequest(id)
            fetchData() // Refresh
        } catch (error) {
            console.error('Error accepting request', error)
        }
    }

    const handleReject = async (id) => {
        try {
            await apiClient.rejectFriendRequest(id)
            fetchData() // Refresh
        } catch (error) {
            console.error('Error rejecting request', error)
        }
    }

    const totalCount = (Array.isArray(notifications) ? notifications.filter(n => !n.is_read).length : 0) + (Array.isArray(requests) ? requests.length : 0)

    return (
        <div className={styles.notificationCenter}>
            <button
                className={styles.bellButton}
                onClick={() => setIsOpen(!isOpen)}
            >
                🔔
                {totalCount > 0 && (
                    <span className={styles.badge}>{totalCount}</span>
                )}
            </button>

            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        className={styles.dropdown}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 10 }}
                    >
                        <h4>Solicitudes de Amistad</h4>
                        {!Array.isArray(requests) || requests.length === 0 ? (
                            <p className={styles.empty}>No hay solicitudes pendientes</p>
                        ) : (
                            <ul className={styles.notifList}>
                                {requests.map(req => (
                                    <li key={req.id} className={styles.requestItem}>
                                        <span>{req.from_user_username} quiere ser tu amigo</span>
                                        <div className={styles.requestActions}>
                                            <button onClick={() => handleAccept(req.id)} className={styles.acceptBtn}>✓</button>
                                            <button onClick={() => handleReject(req.id)} className={styles.rejectBtn}>✕</button>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        )}

                        <h4 style={{ marginTop: '1rem' }}>Notificaciones</h4>
                        {!Array.isArray(notifications) || notifications.length === 0 ? (
                            <p className={styles.empty}>No hay notificaciones</p>
                        ) : (
                            <ul className={styles.notifList}>
                                {notifications.map(notif => (
                                    <li key={notif.id} className={`${styles.notifItem} ${!notif.is_read ? styles.unread : ''} `}>
                                        {notif.message}
                                    </li>
                                ))}
                            </ul>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    )
}
