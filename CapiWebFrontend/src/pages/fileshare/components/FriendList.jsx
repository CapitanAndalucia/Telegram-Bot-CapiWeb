import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import styles from '../FileShare.module.css'
import { apiClient } from '../../../services/apiClient'
import { toast } from 'react-toastify'

export default function FriendList({ onSelectFriend }) {
    const [friends, setFriends] = useState([])
    const [newFriend, setNewFriend] = useState('')
    const [loading, setLoading] = useState(false)
    const [searchResults, setSearchResults] = useState([])
    const [showDropdown, setShowDropdown] = useState(false)
    const [searching, setSearching] = useState(false)
    const dropdownRef = useRef(null)
    const searchTimeout = useRef(null)

    useEffect(() => {
        fetchFriends()
    }, [])

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setShowDropdown(false)
            }
        }
        document.addEventListener('mousedown', handleClickOutside)
        return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [])

    // Debounced search
    useEffect(() => {
        if (searchTimeout.current) {
            clearTimeout(searchTimeout.current)
        }

        if (newFriend.trim().length > 0) {
            setSearching(true)
            searchTimeout.current = setTimeout(async () => {
                try {
                    const results = await apiClient.searchUsers(newFriend.trim())
                    setSearchResults(results)
                    setShowDropdown(true)
                } catch (error) {
                    console.error('Search error:', error)
                    setSearchResults([])
                } finally {
                    setSearching(false)
                }
            }, 300)
        } else {
            setSearchResults([])
            setShowDropdown(false)
            setSearching(false)
        }

        return () => {
            if (searchTimeout.current) {
                clearTimeout(searchTimeout.current)
            }
        }
    }, [newFriend])

    const fetchFriends = async () => {
        try {
            const data = await apiClient.listFriends()
            setFriends(data)
        } catch (error) {
            console.error('Error fetching friends', error)
        }
    }

    const handleAddFriend = async (username) => {
        setLoading(true)
        const loadingToast = toast.info(`Enviando solicitud a ${username}...`, {
            autoClose: false,
        })

        try {
            await apiClient.sendFriendRequest(username)
            toast.update(loadingToast, {
                render: 'Solicitud enviada correctamente',
                type: 'success',
                autoClose: 2000,
            })
            setNewFriend('')
            setShowDropdown(false)
            setSearchResults([])
        } catch (err) {
            const errorMsg = err.payload?.error || 'Error al enviar solicitud'
            toast.update(loadingToast, {
                render: errorMsg,
                type: 'error',
                autoClose: 3000,
            })
        } finally {
            setLoading(false)
        }
    }

    const handleSelectUser = (username) => {
        handleAddFriend(username)
    }

    const handleSelectFriend = (username) => {
        if (onSelectFriend) {
            onSelectFriend(username)
            toast.success(`${username} seleccionado para enviar archivo`, {
                autoClose: 2000,
            })
        }
    }

    const handleRemoveFriend = (username) => {
        const confirmToast = toast.warning(
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ fontWeight: 'bold', fontSize: '15px' }}>
                    ¿Eliminar a {username}?
                </div>
                <div style={{ fontSize: '13px', opacity: 0.9 }}>
                    Esta acción no se puede deshacer
                </div>
                <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                    <button
                        onClick={() => {
                            toast.dismiss(confirmToast)
                            performRemoveFriend(username)
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

    const performRemoveFriend = async (username) => {
        const loadingToast = toast.info('Eliminando amigo...', {
            autoClose: false,
        })

        try {
            await apiClient.removeFriend(username)
            toast.update(loadingToast, {
                render: 'Amigo eliminado correctamente',
                type: 'success',
                autoClose: 2000,
            })
            await fetchFriends()
        } catch (error) {
            console.error('Remove friend error:', error)
            toast.update(loadingToast, {
                render: 'Error al eliminar amigo',
                type: 'error',
                autoClose: 3000,
            })
        }
    }

    return (
        <div className={styles.friendList}>
            <h3>Amigos</h3>

            <div className={styles.addFriendForm} ref={dropdownRef}>
                <input
                    type="text"
                    value={newFriend}
                    onChange={(e) => setNewFriend(e.target.value)}
                    placeholder="Buscar usuario..."
                    className={styles.input}
                    disabled={loading}
                />

                <AnimatePresence>
                    {showDropdown && searchResults.length > 0 && (
                        <motion.div
                            initial={{ opacity: 0, y: -10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            className={styles.autocompleteDropdown}
                        >
                            {searchResults.map((user) => (
                                <motion.div
                                    key={user.id}
                                    className={styles.autocompleteItem}
                                    onClick={() => handleSelectUser(user.username)}
                                    whileHover={{ backgroundColor: 'rgba(0, 242, 255, 0.1)' }}
                                >
                                    <div className={styles.autocompleteAvatar}>
                                        {user.username[0].toUpperCase()}
                                    </div>
                                    <span>{user.username}</span>
                                </motion.div>
                            ))}
                        </motion.div>
                    )}
                </AnimatePresence>

                {searching && (
                    <div className={styles.searchingIndicator}>
                        Buscando...
                    </div>
                )}

                {showDropdown && !searching && searchResults.length === 0 && newFriend.trim().length > 0 && (
                    <div className={styles.noResults}>
                        No se encontraron usuarios
                    </div>
                )}
            </div>

            <ul className={styles.list}>
                {friends.length === 0 ? (
                    <li className={styles.emptyText}>No tienes amigos aún</li>
                ) : (
                    friends.map(friend => (
                        <motion.li
                            key={friend.id}
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            className={styles.friendItem}
                        >
                            <div className={styles.friendInfo}>
                                <div className={styles.avatar}>{friend.username[0].toUpperCase()}</div>
                                <span>{friend.username}</span>
                            </div>
                            <div className={styles.friendActions}>
                                <button
                                    className={styles.selectBtn}
                                    onClick={() => handleSelectFriend(friend.username)}
                                    title="Seleccionar para enviar archivo"
                                >
                                    📤
                                </button>
                                <button
                                    className={styles.removeBtn}
                                    onClick={() => handleRemoveFriend(friend.username)}
                                    title="Eliminar amigo"
                                >
                                    🗑️
                                </button>
                            </div>
                        </motion.li>
                    ))
                )}
            </ul>
        </div>
    )
}
