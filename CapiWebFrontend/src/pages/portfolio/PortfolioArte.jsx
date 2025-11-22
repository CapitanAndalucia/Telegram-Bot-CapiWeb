import React, { useState, useEffect, useRef, useCallback, memo } from 'react';
import logo from './media/Capitan-Andalucia_logoArt.png';
import styles from './PortfolioArte.module.css';
import backgroundStyles from './ViceCityBackground.module.css';
import { apiClient } from '../../services/apiClient';

const classNames = (...classes) => classes.filter(Boolean).join(' ');

const ViceCityBackground = memo(() => (
  <div className={backgroundStyles.app}>
    <div className={backgroundStyles.sky}>
      <div className={backgroundStyles['background-left']}></div>
      <div className={backgroundStyles['background-right']}></div>
      <div className={backgroundStyles.sun}></div>
      <div className={backgroundStyles.buildings}>
        {[21, 22, 23, 24, 25, 11, 12, 13, 14, 15, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => (
          <div
            key={num}
            className={classNames(
              backgroundStyles.building,
              backgroundStyles[`building-${num}`]
            )}
          >
            <div className={backgroundStyles.top}></div>
          </div>
        ))}
      </div>
    </div>
    <div className={backgroundStyles.ground}>
      <div className={classNames(backgroundStyles.road, backgroundStyles.left)}></div>
      <div className={classNames(backgroundStyles.road, backgroundStyles.left, backgroundStyles.bis)}></div>
      <div className={classNames(backgroundStyles.road, backgroundStyles.right)}></div>
      <div className={classNames(backgroundStyles.road, backgroundStyles.right, backgroundStyles.bis)}></div>
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <div
          key={i}
          className={classNames(
            backgroundStyles.road,
            backgroundStyles.center,
            backgroundStyles[`road-${i}`]
          )}
        ></div>
      ))}
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <React.Fragment key={`v-${i}`}>
          <div
            className={classNames(
              backgroundStyles.wave,
              backgroundStyles.vertical,
              backgroundStyles.left,
              backgroundStyles[`wave-${i}`]
            )}
          ></div>
          <div
            className={classNames(
              backgroundStyles.wave,
              backgroundStyles.vertical,
              backgroundStyles.right,
              backgroundStyles[`wave-${i}`]
            )}
          ></div>
        </React.Fragment>
      ))}
      {[10, 11, 12, 13, 14, 15, 16, 17, 18, 19].map((i) => (
        <React.Fragment key={`h-${i}`}>
          <div
            className={classNames(
              backgroundStyles.wave,
              backgroundStyles.horizontal,
              backgroundStyles.left,
              backgroundStyles[`wave-${i}`]
            )}
          ></div>
          <div
            className={classNames(
              backgroundStyles.wave,
              backgroundStyles.horizontal,
              backgroundStyles.right,
              backgroundStyles[`wave-${i}`]
            )}
          ></div>
        </React.Fragment>
      ))}
    </div>
  </div>
));

ViceCityBackground.displayName = 'ViceCityBackground';

const ArtCard = memo(({ item, index, onImageLoad, onImageClick, onEdit, onDelete, onTogglePin, isStaff }) => {
  // La API ya devuelve la URL completa de la imagen
  const imgUrl = item.imagen;

  if (!imgUrl) return null;

  return (
    <div
      className={classNames(styles['art-card'], styles.show)}
      style={{ animationDelay: `${50 * index}ms` }}
    >
      <img
        src={imgUrl}
        alt={item.descripcion || "Dibujo"}
        onLoad={onImageLoad}
        onClick={() => onImageClick(imgUrl)}
      />

      {/* Badge de pin visible para todos */}
      {item.pin && (
        <div className={styles['pin-badge']}>
          📌
        </div>
      )}

      {/* Botones de acción solo para staff */}
      {isStaff && (
        <div className={styles['card-actions']}>
          <button
            className={styles['edit-btn']}
            onClick={(e) => {
              e.stopPropagation();
              onEdit(item);
            }}
            title="Editar"
          >
            ✏️
          </button>
          <button
            className={styles['delete-btn']}
            onClick={(e) => {
              e.stopPropagation();
              onDelete(item.id);
            }}
            title="Eliminar"
          >
            🗑️
          </button>
          <button
            className={classNames(styles['pin-btn'], item.pin && styles.active)}
            onClick={(e) => {
              e.stopPropagation();
              onTogglePin(item.id, item.pin);
            }}
            title={item.pin ? "Desfijar" : "Fijar"}
          >
            📌
          </button>
        </div>
      )}
    </div>
  );
});

ArtCard.displayName = 'ArtCard';

const ViceCityPortfolio = () => {
  const [activeSection, setActiveSection] = useState('gallery');
  const [drawings, setDrawings] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxImage, setLightboxImage] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingDrawing, setEditingDrawing] = useState(null);
  const [formData, setFormData] = useState({
    descripcion: '',
    imagen: null,
    palabras_clave: ''
  });
  const [imagePreview, setImagePreview] = useState(null);
  const [isStaff, setIsStaff] = useState(false);
  const galleryRef = useRef(null);
  const fileInputRef = useRef(null);

  // Configurar viewport height
  useEffect(() => {
    const setVH = () => {
      const vh = window.innerHeight * 0.01;
      document.documentElement.style.setProperty('--vh', `${vh}px`);
    };

    setVH();
    window.addEventListener('resize', setVH);
    return () => window.removeEventListener('resize', setVH);
  }, []);

  // Cargar dibujos iniciales y verificar si es staff
  useEffect(() => {
    const init = async () => {
      try {
        const authData = await apiClient.checkAuth();
        setIsStaff(authData.is_staff || false);
      } catch (error) {
        console.log('No autenticado o error al verificar auth');
      }
      loadDrawings(true);
    };
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Infinite scroll
  useEffect(() => {
    const handleScroll = () => {
      const nearBottom = window.innerHeight + window.scrollY >= document.body.offsetHeight - 200;
      if (nearBottom && !loading && hasMore) {
        loadDrawings(false);
      }
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, [loading, hasMore]);

  const loadDrawings = useCallback(async (initial = false) => {
    if (loading || (!initial && !hasMore)) return;

    setLoading(true);
    try {
      const page = initial ? 1 : currentPage;
      const data = await apiClient.listDibujos({ page, page_size: 6 });

      const items = Array.isArray(data) ? data : (Array.isArray(data.results) ? data.results : []);

      if (initial) {
        setDrawings(items);
        setCurrentPage(1);
      } else {
        setDrawings(prev => [...prev, ...items]);
      }

      // Actualizar paginación
      if (data.next) {
        setHasMore(true);
        setCurrentPage(prev => prev + 1);
      } else {
        setHasMore(false);
      }
    } catch (e) {
      console.error('Error cargando dibujos', e);
    } finally {
      setLoading(false);
    }
  }, [loading, hasMore, currentPage]);

  const openLightbox = useCallback((src) => {
    setLightboxImage(src);
    setLightboxOpen(true);
  }, []);

  const closeLightbox = useCallback(() => {
    setLightboxOpen(false);
    setTimeout(() => setLightboxImage(''), 250);
  }, []);

  const handleImageLoad = useCallback((e) => {
    e.target.classList.add('img-loaded');
  }, []);

  const handleLightboxClick = useCallback((e) => {
    if (e.target.className.includes('lightbox')) {
      closeLightbox();
    }
  }, [closeLightbox]);

  const handleSectionChange = useCallback((section) => {
    setActiveSection(section);
  }, []);

  // CRUD handlers
  const openModal = useCallback((drawing = null) => {
    if (drawing) {
      setEditingDrawing(drawing);
      setFormData({
        descripcion: drawing.descripcion || '',
        imagen: null,
        palabras_clave: drawing.palabras_clave || ''
      });
      setImagePreview(drawing.imagen); // Mostrar imagen actual
    } else {
      setEditingDrawing(null);
      setFormData({
        descripcion: '',
        imagen: null,
        palabras_clave: ''
      });
      setImagePreview(null);
    }
    setModalOpen(true);
  }, []);

  const closeModal = useCallback(() => {
    setModalOpen(false);
    setEditingDrawing(null);
    setFormData({
      descripcion: '',
      imagen: null,
      palabras_clave: ''
    });
    setImagePreview(null);
  }, []);

  const handleFormChange = useCallback((e) => {
    const { name, value, files } = e.target;
    if (name === 'imagen') {
      const file = files[0];
      setFormData(prev => ({ ...prev, imagen: file }));
      // Crear vista previa de la nueva imagen
      if (file) {
        const reader = new FileReader();
        reader.onloadend = () => {
          setImagePreview(reader.result);
        };
        reader.readAsDataURL(file);
      }
    } else {
      setFormData(prev => ({ ...prev, [name]: value }));
    }
  }, []);

  const handleSubmit = useCallback(async (e) => {
    e.preventDefault();

    const data = new FormData();
    data.append('descripcion', formData.descripcion);
    data.append('palabras_clave', formData.palabras_clave);

    // Solo añadir imagen si realmente se seleccionó un archivo nuevo
    if (formData.imagen && formData.imagen instanceof File) {
      data.append('imagen', formData.imagen);
    }

    try {
      if (editingDrawing) {
        await apiClient.updateDibujo(editingDrawing.id, data);
      } else {
        await apiClient.createDibujo(data);
      }
      closeModal();
      await loadDrawings(true);
    } catch (error) {
      console.error('Error saving drawing:', error);
      alert('Error al guardar el dibujo');
    }
  }, [formData, editingDrawing, closeModal]);

  const handleDelete = useCallback(async (id) => {
    if (window.confirm('¿Estás seguro de que quieres eliminar este dibujo?')) {
      try {
        await apiClient.deleteDibujo(id);
        await loadDrawings(true);
      } catch (error) {
        console.error('Error deleting drawing:', error);
        alert('Error al eliminar el dibujo');
      }
    }
  }, []);

  const handleTogglePin = useCallback(async (id, currentPinStatus) => {
    try {
      const data = new FormData();
      data.append('pin', !currentPinStatus);
      await apiClient.patchDibujo(id, data);
      await loadDrawings(true);
    } catch (error) {
      console.error('Error toggling pin:', error);
      alert('Error al cambiar el estado de pin');
    }
  }, []);

  return (
    <div className={styles['portfolio-container']}>
      <div className={styles['grid-background']}>
        <ViceCityBackground />
      </div>

      <div className={styles.container}>
        <header className={styles.header}>
          <img src={logo} alt="Logo" />
        </header>

        <nav className={styles['menu-nav']}>
          <button
            className={classNames(
              styles['nav-btn'],
              activeSection === 'gallery' && styles.active
            )}
            onClick={() => handleSectionChange('gallery')}
          >
            Galería
          </button>
          <button
            className={classNames(
              styles['nav-btn'],
              activeSection === 'about' && styles.active
            )}
            onClick={() => handleSectionChange('about')}
          >
            Sobre Mí
          </button>
          <button
            className={classNames(
              styles['nav-btn'],
              activeSection === 'contact' && styles.active
            )}
            onClick={() => handleSectionChange('contact')}
          >
            Contacto
          </button>
        </nav>

        {/* Botón para crear nuevo dibujo - solo para staff */}
        {activeSection === 'gallery' && isStaff && (
          <div className={styles['add-button-container']}>
            <button className={styles['add-button']} onClick={() => openModal()}>
              <span className={styles['plus-icon']}>+</span>
              <span>Nuevo Dibujo</span>
            </button>
          </div>
        )}

        <section
          className={classNames(
            styles['art-section'],
            activeSection === 'gallery' && styles.active
          )}
        >
          <div className={styles.gallery} ref={galleryRef}>
            {drawings.map((item, idx) => (
              <ArtCard
                key={item.id || idx}
                item={item}
                index={idx}
                onImageLoad={handleImageLoad}
                onImageClick={openLightbox}
                onEdit={openModal}
                onDelete={handleDelete}
                onTogglePin={handleTogglePin}
                isStaff={isStaff}
              />
            ))}
          </div>
        </section>

        <section
          className={classNames(
            styles['art-section'],
            activeSection === 'about' && styles.active
          )}
        >
          <div className={styles['about-content']}>
            <h2>SOBRE MI</h2>
            <p>¡Hola! Me llamo Capitan Andalucia y soy un artista ocasional. Mi trabajo explora varios temas, mezclando realidad con ficción, colocando a personajes ficticios en escenarios realistas.</p>
            <p>Siempre he estado dibujando y es un pasatiempo que disfruto mucho pero no es ni el único hobbie que tengo ni vivo de ello. He desarrollado un estilo único que fusiona degradados y sombras realistas con trazos sencillos. Mi inspiración viene de Kairoburogu, Suoiresnu y el estilo artístico de Kohei Horikoshi.</p>
            <p>Cada obra me lleva cierto tiempo, ya que lo dejo macerar un poco para ver partes que seguramente con el tiempo me desagraden. En cada obra busco expresar y representar alguna idea, experimentar con técnicas y medios que me resulten interesantes. Por eso en cada dibujo el estilo varía en ciertos puntos</p>
          </div>
        </section>

        <section
          className={classNames(
            styles['art-section'],
            activeSection === 'contact' && styles.active
          )}
        >
          <div className={styles['contact-content']}>
            <h2>CONECTA CONMIGO</h2>
            <p className={styles['contact-intro']}>
              Aquí tienes mis redes sociales:
            </p>
            <div className={styles['social-links']}>
              <a href="https://instagram.com/capitan_andalucia" target="_blank" rel="noopener noreferrer">INSTAGRAM</a>
              <a href="https://twitter.com/Capi_Andalucia" target="_blank" rel="noopener noreferrer">TWITTER</a>
            </div>
          </div>
        </section>

        <footer className={styles.footer}>
          <p>&copy; 2025 CapitanAndalucia - Todos los derechos reservados</p>
        </footer>
      </div>

      {/* Lightbox */}
      <div
        className={classNames(
          styles.lightbox,
          lightboxOpen && styles.open
        )}
        onClick={handleLightboxClick}
      >
        <button className={styles['lightbox-close']} onClick={closeLightbox}>
          ✕ Cerrar
        </button>
        {lightboxImage && (
          <img
            src={lightboxImage}
            alt="Imagen ampliada"
          />
        )}
      </div>

      {/* Modal para crear/editar dibujo */}
      {modalOpen && (
        <div className={styles['modal-backdrop']} onClick={closeModal}>
          <div className={styles['modal-content']} onClick={(e) => e.stopPropagation()}>
            <h2>{editingDrawing ? 'Editar Dibujo' : 'Nuevo Dibujo'}</h2>
            <form className={styles['modal-form']} onSubmit={handleSubmit}>
              <div className={styles['form-group']}>
                <label htmlFor="descripcion">Descripción</label>
                <textarea
                  id="descripcion"
                  name="descripcion"
                  value={formData.descripcion}
                  onChange={handleFormChange}
                  required
                  rows={4}
                  placeholder="Describe tu dibujo..."
                />
              </div>

              <div className={styles['form-group']}>
                <label>Imagen</label>
                {imagePreview ? (
                  <div
                    className={styles['image-preview-container']}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <img
                      src={imagePreview}
                      alt="Vista previa"
                      className={styles['image-preview']}
                    />
                    <div className={styles['image-overlay']}>
                      <span className={styles['edit-icon']}>✏️</span>
                      <span>Click para cambiar</span>
                    </div>
                  </div>
                ) : (
                  <div
                    className={styles['image-upload-placeholder']}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <span className={styles['upload-icon']}>📷</span>
                    <span>Click para seleccionar imagen</span>
                  </div>
                )}
                <input
                  ref={fileInputRef}
                  id="imagen"
                  type="file"
                  name="imagen"
                  accept="image/*"
                  onChange={handleFormChange}
                  required={!editingDrawing}
                  style={{ display: 'none' }}
                />
              </div>

              <div className={styles['form-group']}>
                <label htmlFor="palabras_clave">Palabras Clave</label>
                <input
                  id="palabras_clave"
                  type="text"
                  name="palabras_clave"
                  value={formData.palabras_clave}
                  onChange={handleFormChange}
                  placeholder="arte, digital, retrato..."
                />
              </div>

              <div className={styles['modal-actions']}>
                <button type="submit" className={styles['submit-btn']}>
                  {editingDrawing ? 'Guardar Cambios' : 'Crear Dibujo'}
                </button>
                <button type="button" className={styles['cancel-btn']} onClick={closeModal}>
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ViceCityPortfolio;
