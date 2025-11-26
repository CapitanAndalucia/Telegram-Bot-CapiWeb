import { useState, useEffect } from 'react'
import styles from './FileShare.module.css'
import FriendList from './components/FriendList'
import FileUpload from './components/FileUpload'
import IncomingFiles from './components/IncomingFiles'
import UserIcon from './components/UserIcon'
import NotificationCenter from './components/NotificationCenter'
import { apiClient } from '../../services/apiClient'
import { BeatLoader } from 'react-spinners'
import { ToastContainer } from 'react-toastify'
import 'react-toastify/dist/ReactToastify.css'
import '../../styles/toastify-custom.css'

export default function FileShareDashboard() {
    const [activeTab, setActiveTab] = useState('files')
    const [user, setUser] = useState(null)
    const [refreshTrigger, setRefreshTrigger] = useState(0)
    const [loading, setLoading] = useState(true)
    const [isSidebarOpen, setIsSidebarOpen] = useState(false)
    const [unreadCount, setUnreadCount] = useState(0)
    const [selectedRecipient, setSelectedRecipient] = useState('')

    const handleUploadSuccess = () => {
        setRefreshTrigger(prev => prev + 1)
        setActiveTab('files')
        setSelectedRecipient('') // Clear selection after upload
    }

    const handleSelectFriend = (username) => {
        setSelectedRecipient(username)
        setActiveTab('upload') // Switch to upload tab
    }

    useEffect(() => {
        const fetchUser = async () => {
            try {
                const userData = await apiClient.checkAuth()
                if (userData && userData.username) {
                    setUser(userData)
                }
            } catch (error) {
                console.error('Error fetching user:', error)
            } finally {
                setLoading(false)
            }
        }
        fetchUser()
    }, [])

    const handleLogout = async () => {
        try {
            await apiClient.logout()
            setUser(null)
            setActiveTab('files')
        } catch (error) {
            console.error('Logout failed', error)
        }
    }

    if (loading) {
        return (
            <div className={styles.dashboardContainer} style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                <BeatLoader color="#00F2FF" size={15} />
            </div>
        )
    }

    return (
        <div className={styles.dashboardContainer}>
            {/* Mobile Sidebar Overlay */}
            {isSidebarOpen && (
                <div
                    className={styles.sidebarOverlay}
                    onClick={() => setIsSidebarOpen(false)}
                />
            )}

            <div className={`${styles.sidebar} ${isSidebarOpen ? styles.open : ''} `}>
                <div className={styles.header}>
                    <h1>Centro de Archivos</h1>
                    <button
                        className={styles.closeSidebarBtn}
                        onClick={() => setIsSidebarOpen(false)}
                    >
                        ✕
                    </button>
                </div>
                {user && <FriendList onSelectFriend={handleSelectFriend} />}
            </div>

            <div className={styles.mainContent}>
                <header className={styles.header} style={{ justifyContent: 'space-between' }}>
                    <button
                        className={styles.menuBtn}
                        onClick={() => setIsSidebarOpen(true)}
                    >
                        ☰
                    </button>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginLeft: 'auto' }}>
                        {user && <NotificationCenter />}
                        <UserIcon user={user} onLogout={handleLogout} />
                    </div>
                </header>

                {!user ? (
                    <div className={styles.loginPrompt}>
                        <h2>Inicia sesión para compartir archivos</h2>
                        <p>Necesitas una cuenta para enviar y recibir archivos con tus amigos.</p>
                    </div>
                ) : (
                    <>
                        <div className={styles.tabs}>
                            <button
                                className={`${styles.tab} ${activeTab === 'files' ? styles.active : ''} `}
                                onClick={() => setActiveTab('files')}
                            >
                                Mis Archivos
                                {unreadCount > 0 && (
                                    <span className={styles.tabNotificationDot}></span>
                                )}
                            </button>
                            <button
                                className={`${styles.tab} ${activeTab === 'upload' ? styles.active : ''} `}
                                onClick={() => setActiveTab('upload')}
                            >
                                Enviar Archivo
                            </button>
                        </div>

                        <div className={styles.contentArea}>
                            <div className={styles.tabContent}>
                                {activeTab === 'files' && (
                                    <IncomingFiles
                                        key={refreshTrigger}
                                        user={user}
                                        onUnreadCountChange={setUnreadCount}
                                    />
                                )}
                                {activeTab === 'upload' && (
                                    <FileUpload
                                        user={user}
                                        onUploadSuccess={handleUploadSuccess}
                                        selectedRecipient={selectedRecipient}
                                        onRecipientChange={setSelectedRecipient}
                                    />
                                )}
                            </div>
                        </div>
                    </>
                )}
            </div>
            <ToastContainer
                position="bottom-right"
                autoClose={3000}
                hideProgressBar={false}
                newestOnTop={true}
                closeOnClick
                rtl={false}
                pauseOnFocusLoss
                draggable
                pauseOnHover
                theme="dark"
                style={{
                    fontSize: '14px',
                }}
            />
        </div>
    )
}
