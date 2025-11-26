import { useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import styles from './Hub.module.css'

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      delayChildren: 0.2
    }
  }
}

const itemVariants = {
  hidden: { y: 30, opacity: 0 },
  visible: (i) => ({
    y: 0,
    opacity: 1,
    transition: {
      delay: i * 0.15,
      type: "spring",
      stiffness: 50,
      damping: 20
    }
  })
}

export default function Hub() {
  const navigate = useNavigate()
  const containerRef = useRef(null)

  const handleMouseMove = (e) => {
    if (!containerRef.current) return
    const cards = containerRef.current.getElementsByClassName(styles.card)
    for (const card of cards) {
      const rect = card.getBoundingClientRect()
      const x = e.clientX - rect.left
      const y = e.clientY - rect.top
      card.style.setProperty('--mouse-x', `${x}px`)
      card.style.setProperty('--mouse-y', `${y}px`)
    }
  }

  return (
    <div className={styles.hubContainer} onMouseMove={handleMouseMove} ref={containerRef}>
      <div className={styles.backgroundEffects}>
        <div className={`${styles.gradientOrb} ${styles.orb1}`} />
        <div className={`${styles.gradientOrb} ${styles.orb2}`} />
      </div>

      <motion.div
        className={styles.content}
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        viewport={{ once: true }}
      >
        <header className={styles.header}>
          <motion.h1 className={styles.title} variants={itemVariants} custom={0}>
            Capitán Andalucía Hud
          </motion.h1>
          <motion.p className={styles.subtitle} variants={itemVariants} custom={1}>
            Aplicaciones para probar
          </motion.p>
        </header>

        <div className={styles.grid}>
          <AppCard
            title="Portfolio"
            description="Explora mis proyectos, experiencia profesional y habilidades técnicas"
            icon="👤"
            onClick={() => navigate('/portafolio/curriculum')}
            variants={itemVariants}
            custom={2}
          />

          <AppCard
            title="Portfolio Arte"
            description="Explora mis proyectos artísticos y creativos"
            icon="🎨"
            onClick={() => navigate('/portafolio/portfolio_arte')}
            variants={itemVariants}
            custom={3}
          />

          <AppCard
            title="API"
            description="Documentación y estado de la API REST del sistema"
            icon="🔗"
            onClick={() => navigate('/api')}
            variants={itemVariants}
            custom={4}
          />

          <AppCard
            title="Tickets"
            description="Sistema completo de gestión de incidencias y soporte"
            icon="🎫"
            onClick={() => navigate('/tickets')}
            variants={itemVariants}
            custom={5}
          />

          <AppCard
            title="Archivos"
            description="Comparte archivos con tus amigos de forma segura"
            icon="📁"
            onClick={() => navigate('/fileshare')}
            variants={itemVariants}
            custom={6}
          />

          <motion.div
            className={styles.card}
            variants={itemVariants}
            custom={7}
            style={{ opacity: 0.5, cursor: 'default' }}
          >
            <div className={styles.cardContent}>
              <div className={styles.iconWrapper}>+</div>
              <h2 className={styles.cardTitle}>Próximamente</h2>
              <p className={styles.cardDescription}>Nuevas aplicaciones en desarrollo</p>
            </div>
          </motion.div>
        </div>
      </motion.div>
    </div>
  )
}

function AppCard({ title, description, icon, onClick, variants, custom }) {
  return (
    <motion.div
      className={styles.card}
      onClick={onClick}
      variants={variants}
      custom={custom}
      whileHover={{ y: -8, transition: { duration: 0.2 } }}
      whileTap={{ scale: 0.98 }}
    >
      <div className={styles.cardContent}>
        <div className={styles.iconWrapper}>{icon}</div>
        <h2 className={styles.cardTitle}>{title}</h2>
        <p className={styles.cardDescription}>{description}</p>
      </div>
      <div className={styles.arrow}>→</div>
    </motion.div>
  )
}

