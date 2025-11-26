import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import styles from '../FileShare.module.css'

export default function UserIcon({ user, onLogout }) {
    const navigate = useNavigate()
    const [isOpen, setIsOpen] = useState(false)

    const handleLogoutClick = () => {
        onLogout()
        setIsOpen(false)
    }

    return (
        <div className={styles.userIconContainer}>
            <button
                className={styles.userButton}
                onClick={() => setIsOpen(!isOpen)}
            >
                {user ? (
                    <div className={styles.avatarSmall}>{user.username[0].toUpperCase()}</div>
                ) : (
                    <div className={styles.avatarPlaceholder}>👤</div>
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
                        {user ? (
                            <div className={styles.menu}>
                                <div className={styles.userInfo}>
                                    <p className={styles.userName}>{user.username}</p>
                                </div>
                                <button onClick={handleLogoutClick} className={styles.menuItem}>Cerrar Sesión</button>
                            </div>
                        ) : (
                            <div className={styles.menu}>
                                <p className={styles.menuTitle}>Cuenta</p>
                                <button onClick={() => navigate('/login?redirect=/fileshare&title=Centro de Archivos')} className={styles.menuItem}>Iniciar Sesión</button>
                                <button onClick={() => navigate('/register?redirect=/fileshare&title=Centro de Archivos')} className={styles.menuItem}>Registrarse</button>
                            </div>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    )
}
