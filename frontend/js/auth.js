// Elite Drone Service - Client Auth State Manager
const Auth = {
  getUser() {
    try {
      const stored = localStorage.getItem('elite_drone_user');
      return stored ? JSON.parse(stored) : null;
    } catch (e) {
      return null;
    }
  },

  setUser(user) {
    if (user) {
      localStorage.setItem('elite_drone_user', JSON.stringify(user));
    } else {
      localStorage.removeItem('elite_drone_user');
    }
    this.updateNavbar();
  },

  isAuthenticated() {
    return !!this.getUser();
  },

  async logout() {
    try {
      await API.post('/api/auth/logout').catch(() => null);
    } catch (e) {
      // Ignore network errors on logout
    }
    localStorage.removeItem('elite_drone_user');
    window.location.href = '/login.html';
  },

  updateNavbar() {
    const navActions = document.getElementById('nav-actions');
    if (!navActions) return;

    const user = this.getUser();

    if (user) {
      const initial = user.full_name ? user.full_name.charAt(0).toUpperCase() : 'U';
      const roleBadge = user.role === 'admin' || user.role === 'superadmin' ? ' (Admin)' : '';
      const dashboardLink = user.role === 'admin' || user.role === 'superadmin' ? '/admin.html' : '/dashboard.html';

      navActions.innerHTML = `
        <div class="nav-user-menu">
          <a href="${dashboardLink}" class="nav-user-pill" title="Open Dashboard">
            <span class="nav-user-avatar">${initial}</span>
            <span>${user.full_name || user.username}${roleBadge}</span>
          </a>
          <a href="booking.html" class="btn btn-nav-book"><span>BOOK SHOOT</span> <span>✦</span></a>
          <a href="${dashboardLink}" class="btn btn-nav-dashboard">
            Dashboard
          </a>
          <button onclick="Auth.logout()" class="btn btn-secondary btn-sm" style="border-color: rgba(239,68,68,0.4); color: #f87171;">
            Logout
          </button>
        </div>
      `;
    } else {
      navActions.innerHTML = `
        <a href="login.html" class="btn btn-nav-login">Login</a>
        <a href="register.html" class="btn btn-nav-register">Register</a>
        <a href="booking.html" class="btn btn-nav-book"><span>BOOK SHOOT</span> <span>✦</span></a>
        <a href="dashboard.html" class="btn btn-nav-dashboard" onclick="return handleDashboardNavClick(event)">Dashboard</a>
      `;
    }
  }
};

function handleDashboardNavClick(event) {
  const user = (window.Auth && Auth.getUser()) || JSON.parse(localStorage.getItem('elite_drone_user') || 'null');
  if (!user) {
    if (event) event.preventDefault();
    window.location.href = 'register.html?redirect=dashboard.html&msg=register_required';
    return false;
  }
  const dashboardLink = user.role === 'admin' || user.role === 'superadmin' ? 'admin.html' : 'dashboard.html';
  window.location.href = dashboardLink;
  return true;
}
window.handleDashboardNavClick = handleDashboardNavClick;

window.Auth = Auth;
document.addEventListener('DOMContentLoaded', () => {
  Auth.updateNavbar();
});
