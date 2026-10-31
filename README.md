# Elite Drone Service 

A full-stack, responsive commercial web application for **Elite Drone Service** — specializing in wedding aerial photography, corporate event videography, real estate imaging, landscape cinematography, and custom commercial flight missions.

---

## 🛠️ Technology Stack

- **Frontend**: Modern HTML5, CSS3 (Modern Glassmorphism & Cinematic Themes), Modular Vanilla JavaScript, Responsive Grid/Flexbox layouts, Clean SVG iconography.
- **Backend**: Node.js, Express.js (RESTful API architecture, modular controllers, routes, and middleware).
- **Database**: PostgreSQL 18 (Relational schema, parameterized queries, constraints, foreign keys, triggers, and indexes).
- **Security**: `bcrypt` (salted password and OTP hashing), `jsonwebtoken` (JWT), `express-rate-limit`, input validation, CORS protection, sanitized queries.
- **Email/SMS**: Nodemailer (Gmail SMTP integration) and modular OTP verification provider system.

---

## 📁 Project Architecture & Folder Structure

```
Elite Drone/
├── backend/
│   ├── config/
│   │   ├── db.js                 # PostgreSQL connection pool configuration
│   │   └── mailer.js             # Nodemailer & Gmail SMTP transport configuration
│   ├── controllers/              # Application business logic
│   │   ├── authController.js     # User registration, login, logout, me, username checks
│   │   ├── otpController.js      # 6-digit OTP generation, bcrypt hashing, rate-limiting, verification
│   │   ├── serviceController.js  # Services catalog & tiered packages retrieval
│   │   ├── bookingController.js  # Online shoot bookings, references, cancellation
│   │   ├── galleryController.js  # 4K photography and drone video media queries
│   │   └── adminController.js    # Operational metrics, booking dispatch review, customer directory
│   ├── database/
│   │   ├── schema.sql            # Core relational PostgreSQL database schema
│   │   ├── seed.js               # Initial services, packages, admin, and gallery items
│   │   ├── migrate.js            # Automated migration runner
│   │   └── test-connection.js    # PostgreSQL connectivity diagnostics
│   ├── middleware/
│   │   ├── authMiddleware.js     # JWT verification and role-based access control (protect & adminOnly)
│   │   ├── rateLimitMiddleware.js# Rate limiters for auth and OTP endpoints
│   ├── routes/                   # API route definitions
│   │   ├── authRoutes.js         # /api/auth
│   │   ├── otpRoutes.js          # /api/otp
│   │   ├── serviceRoutes.js      # /api/services
│   │   ├── bookingRoutes.js      # /api/bookings
│   │   ├── galleryRoutes.js      # /api/gallery
│   │   └── adminRoutes.js        # /api/admin
│   ├── test-workflows.js         # Automated end-to-end test suite covering all 5 user workflows
│   └── server.js                 # Express application entry point & static file server
├── frontend/
│   ├── css/
│   │   └── style.css             # Cinematic design system & responsive variables
│   ├── js/
│   │   ├── api.js                # Frontend API client and HTTP request helpers
│   │   ├── auth.js               # Client authentication state & navbar manager
│   │   └── main.js               # Interactive components, lightbox modal, toasts
│   ├── index.html                # Home page (Cinematic Hero, Services, Gallery preview, Testimonials)
│   ├── services.html             # Services & Tiered Packages (Silver, Gold, Platinum)
│   ├── gallery.html              # Photography & Video gallery with media modal and filters
│   ├── register.html             # Customer registration with real-time validation & OTP verification
│   ├── login.html                # Customer & Admin sign-in portal with Show/Hide password
│   ├── booking.html              # Online flight booking page (Authenticated customer only)
│   ├── dashboard.html            # Customer account dashboard & booking history tracking
│   └── admin.html                # Admin operations dashboard & booking dispatch management
├── .env.example                  # Environment variables template
├── .env                          # Local environment configuration
├── package.json                  # Dependencies and execution scripts
└── README.md                     # Project documentation & operational runbook
```

---

## 🗄️ Database Tables (PostgreSQL)

1. **`users`**: Customer credentials, profile info, verified mobile and email, active flags, timestamps.
2. **`otp_verifications`**: OTP destination tracking (email/mobile), bcrypt salted hashes, expiry timestamps, attempts counter, verification flags.
3. **`admin_users`**: Administrative personnel credentials, roles (`superadmin`, `admin`, `moderator`).
4. **`services`**: Commercial drone service offerings, slugs, imagery, and categories.
5. **`packages`**: Service tiers (Silver, Gold, Platinum) with hourly coverage, pricing, and feature arrays.
6. **`bookings`**: Customer bookings with unique references (`ELD-YYYYMMDD-XXXX`), status lifecycle (`Pending` -> `Confirmed` / `Rejected` / `Completed` / `Cancelled`), location, date/time, and admin notes.
7. **`gallery_items`**: Drone aerial photo and 4K video portfolio entries with category filtering.

---

## 🔑 Default Administrative Credentials

- **URL**: `http://localhost:5000/login.html` (or directly `admin.html`)
- **Username**: `admin`
- **Password**: `Admin@Elite2026!`
- **Role**: `superadmin`

---

## 🚀 Running the Project

### 1. Database Setup
Ensure PostgreSQL is running locally, then execute:
```bash
npm run migrate
```
To verify connectivity:
```bash
npm run test:db
```

### 2. Start the Server
```bash
npm start
```
The server will start at `http://localhost:5000`.

### 3. Run Automated Workflow Tests
To run the automated test suite testing all 5 business workflows end-to-end:
```bash
npm run test:workflows
```

---

## 🧪 Verified User Workflows

- **Workflow 1**: Home → Services → Gallery → Book Now navigation.
- **Workflow 2**: Register → Real-Time Validation → Request OTP → Receive OTP → Verify OTP → Complete Registration → Redirect to Login.
- **Workflow 3**: Login → Booking Page → Select Service & Package → Submit Booking → Receive Unique Reference (`ELD-YYYYMMDD-XXXX`) in `Pending` status.
- **Workflow 4**: Admin Login → View Bookings → Approve/Update Status to `Confirmed` with flight notes → Customer Dashboard reflects updated status.
- **Workflow 5**: Logout → Attempt Protected Access (`/api/bookings/my-bookings` or `/api/admin/*`) → Redirected / Blocked with 401/403.

---

## 🚢 Production Deployment Guide

### Environment Variables
Configure the following in your production environment:
- `PORT`: Production port (e.g., `5000` or `8080`)
- `NODE_ENV`: `production`
- `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`: Production PostgreSQL credentials
- `JWT_SECRET`: High-entropy 64+ character random string
- `SMTP_USER`, `SMTP_PASS`: Gmail App Password or SendGrid/Postmark credentials for live customer email delivery

### Deploying with PM2 & Nginx (Ubuntu / VPS)
```bash
# 1. Install dependencies
npm ci --only=production

# 2. Run database migration
npm run migrate

# 3. Start process with PM2
pm2 start backend/server.js --name "elite-drone-service"
pm2 save
pm2 startup
```

---

## 📋 Milestones Summary

- [x] **Milestone 1**: Project setup, folder structure, database architecture, migration, and seeding.
- [x] **Milestone 2**: Homepage, navigation bar, cinematic hero section, testimonials, footer, and responsive UI.
- [x] **Milestone 3**: Services page with dynamic packages and gallery page with photo/video playback & filtering.
- [x] **Milestone 4**: Registration form, real-time client-side validation, password policy, and OTP UX.
- [x] **Milestone 5**: Backend email/mobile OTP generation, bcrypt hashing, rate limiting, and verification.
- [x] **Milestone 6**: Customer login, JWT/cookie authentication, route protection, session management, logout.
- [x] **Milestone 7**: Online booking form, PostgreSQL integration, and unique reference code generation (`ELD-YYYYMMDD-XXXX`).
- [x] **Milestone 8**: Customer dashboard for profile, active bookings, status tracking, and cancellation.
- [x] **Milestone 9**: Admin dashboard, metrics, booking approvals/rejections, and catalog management.
- [x] **Milestone 10**: End-to-end testing, security audits, and bug fixes across all user workflows.
- [x] **Milestone 11**: Deployment preparation, environment guides, and comprehensive documentation.
#   E l i t e - D r o n e  
 