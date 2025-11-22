// Crear partículas animadas en el fondo (solo en desktop)
        const particlesContainer = document.getElementById('particles');
        const isMobile = window.innerWidth <= 768;
        
        if (!isMobile) {
            const particleCount = 15;
            for (let i = 0; i < particleCount; i++) {
                const particle = document.createElement('div');
                particle.className = 'particle';
                
                const size = Math.random() * 60 + 20;
                particle.style.width = size + 'px';
                particle.style.height = size + 'px';
                particle.style.left = Math.random() * 100 + '%';
                particle.style.animationDelay = Math.random() * 15 + 's';
                particle.style.animationDuration = (Math.random() * 10 + 10) + 's';
                
                particlesContainer.appendChild(particle);
            }
        }

        // Feedback táctil visual para móviles
        document.querySelectorAll('.app-card:not(.add-app-card)').forEach(card => {
            // Touch feedback
            card.addEventListener('touchstart', function() {
                this.style.transform = 'scale(0.98)';
            });
            
            card.addEventListener('touchend', function() {
                this.style.transform = 'scale(1)';
            });
            
            card.addEventListener('touchcancel', function() {
                this.style.transform = 'scale(1)';
            });

            // Efecto hover solo en desktop
            if (!isMobile) {
                card.addEventListener('mousemove', (e) => {
                    const rect = card.getBoundingClientRect();
                    const x = e.clientX - rect.left;
                    const y = e.clientY - rect.top;
                    
                    card.style.setProperty('--mouse-x', x + 'px');
                    card.style.setProperty('--mouse-y', y + 'px');
                });
            }
        });

        // Prevenir scroll bounce en iOS mientras se mantiene el scroll normal
        let lastTouchY = 0;
        document.addEventListener('touchstart', function(e) {
            lastTouchY = e.touches[0].clientY;
        }, { passive: true });

        // Mejorar performance en móviles
        if (isMobile) {
            document.body.style.overflow = 'auto';
        }