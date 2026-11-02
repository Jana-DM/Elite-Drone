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

  // 3. Scrollspy: dynamically update active navbar link as user scrolls
  initScrollspy();

  // 4. Load Dynamic Services if container exists
  const servicesContainer = document.getElementById('services-container');
  if (servicesContainer) {
    loadServicesOverview(servicesContainer);
  }

  // 4. Load Featured Portfolio if container exists
  const portfolioContainer = document.getElementById('portfolio-container');
  if (portfolioContainer) {
    loadFeaturedPortfolio(portfolioContainer);
  }

  // 5. Initialize Live Journey Stats
  initLiveJourneyStats();

  // 6. Handle Consultation Form Submission
  const consultForm = document.getElementById('quick-inquiry-form');
  if (consultForm) {
    consultForm.addEventListener('submit', (e) => {
      e.preventDefault();
      showToast('Thank you! Our flight director will contact you within 2 hours.', 'success');
      consultForm.reset();
    });
  }
});

// Fetch and render services overview
async function loadServicesOverview(container) {
  try {
    const res = await API.get('/api/services');
    if (res.success && res.data && res.data.length > 0) {
      container.classList.add('services-grid-5');
      container.innerHTML = res.data.map(svc => {
        const numFormatted = String(svc.badge || svc.display_order || '01').padStart(2, '0');
        const emoji = svc.emoji || '🚁';

        return `
          <div class="service-card">
            <div class="service-card-header">
              <div class="service-emoji-box">${emoji}</div>
              <span class="service-card-num">${numFormatted}</span>
            </div>
            <h3>${escapeHtml(svc.name)}</h3>
            <p>${escapeHtml(svc.short_description)}</p>
            <div class="service-card-action">
              <a href="booking.html?service=${svc.slug}" class="btn btn-outline-gold btn-sm" style="width: 100%;">
                Book Shoot →
              </a>
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
      renderPortfolioItems(container, allGalleryItems.slice(0, 4));
      setupPortfolioFilters(container);
    }
  } catch (err) {
    console.warn('Using pre-rendered portfolio fallback');
  }
}

function renderPortfolioItems(container, items) {
  container.innerHTML = items.map(item => `
    <div class="portfolio-card" onclick="Lightbox.open('${item.media_url}', '${item.media_type}', '${escapeHtml(item.title)}', '${escapeHtml(item.description || '')}')">
      <div class="portfolio-img-wrap">
        <img src="${item.thumbnail_url || item.media_url}" alt="${escapeHtml(item.title)}" loading="lazy">
      </div>
      <div class="portfolio-content">
        <h4 class="portfolio-title">${escapeHtml(item.title)}</h4>
        ${item.description ? `<p class="portfolio-desc">${escapeHtml(item.description)}</p>` : ''}
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
        renderPortfolioItems(container, allGalleryItems.slice(0, 4));
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

// ==========================================================================
// SCROLLSPY
// ==========================================================================
function initScrollspy() {
  const navAnchorLinks = Array.from(document.querySelectorAll('.nav-links a[href^="#"]'));
  if (navAnchorLinks.length === 0) return;

  const sections = navAnchorLinks
    .map(link => {
      const id = link.getAttribute('href').replace('#', '');
      const el = document.getElementById(id);
      return el ? { id, el, link } : null;
    })
    .filter(Boolean);

  if (sections.length === 0) return;

  function setActive(activeId) {
    sections.forEach(({ id, link }) => {
      if (id === activeId) {
        link.classList.add('active');
      } else {
        link.classList.remove('active');
      }
    });
  }

  function updateActiveSection() {
    const scrollY = window.scrollY;
    const windowHeight = window.innerHeight;
    const docHeight = document.documentElement.scrollHeight;

    // 1. If at or near the very bottom of the page -> activate the last section (Contact)
    if (scrollY + windowHeight >= docHeight - 80) {
      setActive(sections[sections.length - 1].id);
      return;
    }

    // 2. Threshold offset below the fixed navbar
    const threshold = 140;
    let currentId = sections[0].id;

    for (let i = 0; i < sections.length; i++) {
      const rect = sections[i].el.getBoundingClientRect();
      if (rect.top <= threshold) {
        currentId = sections[i].id;
      }
    }

    setActive(currentId);
  }

  // Smooth click handler on anchor links
  navAnchorLinks.forEach(link => {
    link.addEventListener('click', () => {
      const targetId = link.getAttribute('href').replace('#', '');
      setActive(targetId);
    });
  });

  // Passive, requestAnimationFrame throttled scroll listener
  let ticking = false;
  window.addEventListener('scroll', () => {
    if (!ticking) {
      window.requestAnimationFrame(() => {
        updateActiveSection();
        ticking = false;
      });
      ticking = true;
    }
  }, { passive: true });

  // Handle URL hash on initial load
  if (window.location.hash) {
    const hashId = window.location.hash.replace('#', '');
    if (sections.some(s => s.id === hashId)) {
      setActive(hashId);
    }
  }

  // Run on initial render
  updateActiveSection();
  setTimeout(updateActiveSection, 300);
}

// ==========================================================================
// REAL-TIME JOURNEY STATS CONTROLLER
// ==========================================================================
function initLiveJourneyStats() {
  const usersEl = document.getElementById('stat-registered-users');
  if (!usersEl) return;

  let hasAnimated = false;
  const runAnimation = async () => {
    if (hasAnimated) return;
    hasAnimated = true;

    try {
      const res = await API.get('/api/stats');
      if (res && res.success && res.data) {
        animateStatNumber('stat-registered-users', res.data.registeredUsers, '+');
        animateStatNumber('stat-projects-completed', res.data.projectsCompleted, '+');
        animateStatNumber('stat-aerial-works', res.data.aerialWorks, '+');
        animateStatNumber('stat-passion-rate', res.data.passionRate, '%');
        return;
      }
    } catch (e) {
      console.warn('Real-time stats fallback applied:', e);
    }

    // Default baseline fallback
    animateStatNumber('stat-registered-users', 24, '+');
    animateStatNumber('stat-projects-completed', 21, '+');
    animateStatNumber('stat-aerial-works', 5, '+');
    animateStatNumber('stat-passion-rate', 100, '%');
  };

  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          runAnimation();
          observer.disconnect();
        }
      });
    }, { threshold: 0.15 });

    const statsGrid = document.querySelector('.journey-stats-grid');
    if (statsGrid) observer.observe(statsGrid);
    else runAnimation();
  } else {
    runAnimation();
  }
}

function animateStatNumber(id, target, suffix = '') {
  const el = document.getElementById(id);
  if (!el) return;
  const numTarget = parseInt(target, 10) || 0;
  if (numTarget <= 0) {
    el.textContent = `0${suffix}`;
    return;
  }

  const duration = 1600;
  const frameRate = 30;
  const totalFrames = Math.max(1, Math.round(duration / (1000 / frameRate)));
  let frame = 0;

  const timer = setInterval(() => {
    frame++;
    const progress = frame / totalFrames;
    const easeProgress = 1 - Math.pow(1 - progress, 3);
    const current = Math.round(numTarget * easeProgress);
    el.textContent = `${current}${suffix}`;

    if (frame >= totalFrames) {
      clearInterval(timer);
      el.textContent = `${numTarget}${suffix}`;
    }
  }, 1000 / frameRate);
}
