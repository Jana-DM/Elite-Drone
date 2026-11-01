// Elite Drone Service - Main Client Logic

// Toast Notification Utility
function showToast(message, type = 'info') {
  let container = document.querySelector('.toast-container');
  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  
  let icon = '<span style="font-weight: bold; color: var(--primary-light);">[i]</span>';
  if (type === 'success') icon = '<span style="font-weight: bold; color: #10b981;">&check;</span>';
  if (type === 'error') icon = '<span style="font-weight: bold; color: #ef4444;">&times;</span>';

  toast.innerHTML = `<span>${icon}</span> <div>${message}</div>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    toast.style.transition = 'all 0.3s ease-out';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}
window.showToast = showToast;

// Lightbox Modal Controller
const Lightbox = {
  modal: null,
  container: null,
  title: null,
  caption: null,

  init() {
    this.modal = document.getElementById('lightbox-modal');
    this.container = document.getElementById('lightbox-media');
    this.title = document.getElementById('lightbox-title');
    this.caption = document.getElementById('lightbox-caption');

    if (!this.modal) return;

    const closeBtn = document.getElementById('lightbox-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.close());
    }

    this.modal.addEventListener('click', (e) => {
      if (e.target === this.modal) this.close();
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.modal.classList.contains('active')) {
        this.close();
      }
    });
  },

  open(mediaUrl, mediaType, itemTitle, itemDescription) {
    if (!this.modal || !this.container) return;

    this.container.innerHTML = '';
    if (mediaType === 'video') {
      const video = document.createElement('video');
      video.src = mediaUrl;
      video.controls = true;
      video.autoplay = true;
      video.style.width = '100%';
      video.style.maxHeight = '65vh';
      this.container.appendChild(video);
    } else {
      const img = document.createElement('img');
      img.src = mediaUrl;
      img.alt = itemTitle || 'Drone Capture';
      img.style.maxWidth = '100%';
      img.style.maxHeight = '65vh';
      this.container.appendChild(img);
    }

    if (this.title) this.title.textContent = itemTitle || 'Elite Drone Showcase';
    if (this.caption) this.caption.textContent = itemDescription || 'Aerial cinematography by Elite Drone Service certified pilots.';

    this.modal.classList.add('active');
    document.body.style.overflow = 'hidden';
  },

  close() {
    if (!this.modal) return;
    this.modal.classList.remove('active');
    if (this.container) this.container.innerHTML = '';
    document.body.style.overflow = 'auto';
  }
};
window.Lightbox = Lightbox;

// DOM Initialization
document.addEventListener('DOMContentLoaded', () => {
  Lightbox.init();

  // 1. Header scroll effect
  const header = document.querySelector('.site-header');
  window.addEventListener('scroll', () => {
    if (window.scrollY > 40) {
      header?.classList.add('scrolled');
    } else {
      header?.classList.remove('scrolled');
    }
  });

  // 2. Mobile Navigation Toggle
  const navToggle = document.getElementById('nav-toggle');
  const navLinks = document.querySelector('.nav-links');
  const navActions = document.querySelector('.nav-actions');

  if (navToggle) {
    navToggle.addEventListener('click', () => {
      navLinks?.classList.toggle('mobile-open');
      navActions?.classList.toggle('mobile-open');
    });

    // Close mobile nav when clicking any link
    document.querySelectorAll('.nav-link').forEach(link => {
      link.addEventListener('click', () => {
        navLinks?.classList.remove('mobile-open');
        navActions?.classList.remove('mobile-open');
      });
    });
  }

  // 3. Load Dynamic Services if container exists
  const servicesContainer = document.getElementById('services-container');
  if (servicesContainer) {
    loadServicesOverview(servicesContainer);
  }

  // 4. Load Featured Portfolio if container exists
  const portfolioContainer = document.getElementById('portfolio-container');
  if (portfolioContainer) {
    loadFeaturedPortfolio(portfolioContainer);
  }

  // 5. Handle Consultation Form Submission
  const consultForm = document.getElementById('quick-inquiry-form');
  if (consultForm) {
    consultForm.addEventListener('submit', (e) => {
      e.preventDefault();
      showToast('Thank you! Our flight director will contact you within 2 hours.', 'success');
      consultForm.reset();
    });
  }

  // 6. Interactive Real-Time Drone Flight Simulation
  initDroneFlightSimulator();
});

// Real-Time Drone Flight Simulator (Interactive Flight Dynamics)
function initDroneFlightSimulator() {
  const stage = document.getElementById('hero-drone-stage');
  const chassis = document.getElementById('drone-chassis');
  const hudAlt = document.getElementById('hud-altitude');
  const hudSpeed = document.getElementById('hud-speed');

  if (!stage || !chassis) return;

  let targetPitch = 0;
  let targetRoll = 0;
  let currentPitch = 0;
  let currentRoll = 0;

  stage.addEventListener('mousemove', (e) => {
    const rect = stage.getBoundingClientRect();
    const x = e.clientX - rect.left - rect.width / 2;
    const y = e.clientY - rect.top - rect.height / 2;
    targetRoll = (x / (rect.width / 2)) * 7;
    targetPitch = -(y / (rect.height / 2)) * 5;
  });

  stage.addEventListener('mouseleave', () => {
    targetPitch = 0;
    targetRoll = 0;
  });

  function animatePhysics() {
    currentRoll += (targetRoll - currentRoll) * 0.08;
    currentPitch += (targetPitch - currentPitch) * 0.08;

    chassis.style.setProperty('--user-pitch', `${currentPitch.toFixed(2)}deg`);
    chassis.style.setProperty('--user-roll', `${currentRoll.toFixed(2)}deg`);

    requestAnimationFrame(animatePhysics);
  }
  requestAnimationFrame(animatePhysics);

  // Live Telemetry Readout Variations
  setInterval(() => {
    if (hudAlt && hudSpeed) {
      const alt = (118.5 + (Math.sin(Date.now() / 1500) * 3.5)).toFixed(1);
      const spd = (18.2 + (Math.cos(Date.now() / 2000) * 1.6)).toFixed(1);
      hudAlt.textContent = `${alt} M`;
      hudSpeed.textContent = `${spd} M/S`;
    }
  }, 1000);
}

// Fetch and render services overview
async function loadServicesOverview(container) {
  try {
    const res = await API.get('/api/services');
    if (res.success && res.data && res.data.length > 0) {
      container.innerHTML = res.data.map(svc => {
        const lowestPrice = svc.packages && svc.packages.length > 0 
          ? Math.min(...svc.packages.map(p => parseFloat(p.price)))
          : 14999;
        
        const priceFormatted = new Intl.NumberFormat('en-IN', {
          style: 'currency',
          currency: 'INR',
          maximumFractionDigits: 0
        }).format(lowestPrice);

        return `
          <div class="service-card">
            <div class="service-image-box">
              <img src="${svc.image_url}" alt="${svc.name}" loading="lazy">
              ${svc.badge ? `<span class="service-badge-pill">${svc.badge}</span>` : ''}
            </div>
            <div class="service-content">
              <h3>${svc.name}</h3>
              <p>${svc.short_description}</p>
              <div class="service-pricing-row">
                <span class="service-price-tag">Starting from</span>
                <span class="service-price-value">${priceFormatted}</span>
              </div>
              <div class="service-action">
                <a href="services.html#${svc.slug}" class="btn btn-secondary" style="width: 100%;">
                  View Packages & Details
                </a>
              </div>
            </div>
          </div>
        `;
      }).join('');
    }
  } catch (err) {
    console.warn('Using pre-rendered services fallback');
  }
}

// Fetch and render portfolio items with category filtering
let allGalleryItems = [];
async function loadFeaturedPortfolio(container) {
  try {
    const res = await API.get('/api/gallery');
    if (res.success && res.data && res.data.length > 0) {
      allGalleryItems = res.data;
      renderPortfolioItems(container, allGalleryItems.slice(0, 8));
      setupPortfolioFilters(container);
    }
  } catch (err) {
    console.warn('Using pre-rendered portfolio fallback');
  }
}

function renderPortfolioItems(container, items) {
  container.innerHTML = items.map(item => `
    <div class="portfolio-card" onclick="Lightbox.open('${item.media_url}', '${item.media_type}', '${escapeHtml(item.title)}', '${escapeHtml(item.description)}')">
      <img src="${item.thumbnail_url || item.media_url}" alt="${escapeHtml(item.title)}" loading="lazy">
      <div class="portfolio-overlay">
        <div class="portfolio-badge ${item.media_type === 'video' ? 'portfolio-video-pill' : ''}">
          ${item.media_type === 'video' ? '4K Video' : 'HDR Photo'}
        </div>
        <h4 class="portfolio-title">${item.title}</h4>
        ${item.location ? `<span class="portfolio-location">${item.location}</span>` : ''}
      </div>
    </div>
  `).join('');
}

function setupPortfolioFilters(container) {
  const filterBtns = document.querySelectorAll('.filter-btn');
  filterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      filterBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      const category = btn.dataset.filter;
      if (category === 'all') {
        renderPortfolioItems(container, allGalleryItems.slice(0, 8));
      } else {
        const filtered = allGalleryItems.filter(item => item.category === category);
        renderPortfolioItems(container, filtered);
      }
    });
  });
}

function escapeHtml(text) {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}