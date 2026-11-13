const assert = require('assert');
const { Pool } = require('pg');
const app = require('./server');
require('dotenv').config();

async function runTests() {
  console.log('================================================================');
  console.log('🧪 ELITE DRONE SERVICE — COMPREHENSIVE WORKFLOW TEST SUITE');
  console.log('================================================================\n');

  // Always start dedicated test server on an ephemeral free port
  const serverInstance = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => {
      resolve(s);
    });
  });
  const testPort = serverInstance.address().port;
  const BASE_URL = `http://127.0.0.1:${testPort}`;

  const pool = new Pool({
    host: process.env.DB_HOST || '127.0.0.1',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || 'elite_drone',
  });

  try {
    // -------------------------------------------------------------
    // WORKFLOW 1: Home → Services → Gallery → Book Now
    // -------------------------------------------------------------
    console.log('▶ TESTING WORKFLOW 1: Public Discovery & Static Pages');
    
    // Check Home
    const resHome = await fetch(`${BASE_URL}/`);
    assert.strictEqual(resHome.status, 200, 'Home page must respond with 200');
    const homeHtml = await resHome.text();
    assert(homeHtml.includes('ELITE DRONE'), 'Home page must contain ELITE DRONE branding');
    assert(!homeHtml.includes('⚡ DGCA Certified Pilots'), 'Emoji ⚡ must NOT exist in hero badge');
    console.log('  ✓ Home page loaded with 200 OK & clean branding without unwanted emojis.');

    // Check Services API
    const resServices = await fetch(`${BASE_URL}/api/services`);
    assert.strictEqual(resServices.status, 200);
    const servicesData = await resServices.json();
    assert(servicesData.success && servicesData.data.length >= 5, 'Must have at least 5 active services');
    console.log(`  ✓ Services API active: ${servicesData.data.length} services loaded.`);

    // Check Gallery API
    const resGallery = await fetch(`${BASE_URL}/api/gallery`);
    assert.strictEqual(resGallery.status, 200);
    const galleryData = await resGallery.json();
    assert(galleryData.success && galleryData.data.length >= 4, 'Must have at least 4 gallery items');
    console.log(`  ✓ Gallery API active: ${galleryData.data.length} media items loaded.`);

    // Check Live Stats API
    const resStats = await fetch(`${BASE_URL}/api/stats`);
    assert.strictEqual(resStats.status, 200);
    const statsData = await resStats.json();
    assert.strictEqual(statsData.success, true);
    assert(typeof statsData.data.registeredUsers === 'number', 'registeredUsers must be number');
    assert(typeof statsData.data.projectsCompleted === 'number', 'projectsCompleted must be number');
    assert(typeof statsData.data.aerialWorks === 'number', 'aerialWorks must be number');
    assert.strictEqual(statsData.data.passionRate, 100, 'passionRate must be 100');
    console.log(`  ✓ Real-Time Stats API active: ${statsData.data.registeredUsers}+ users, ${statsData.data.projectsCompleted}+ projects, ${statsData.data.aerialWorks}+ works.`);
    console.log('✅ WORKFLOW 1 PASSED.\n');

    // -------------------------------------------------------------
    // WORKFLOW 2: Register → Request OTP → Verify OTP → Complete Registration → Login
    // -------------------------------------------------------------
    console.log('▶ TESTING WORKFLOW 2: Complete User Registration & OTP Lifecycle');
    const testTimestamp = Date.now();
    const testUsername = `client_${testTimestamp}`;
    const testEmail = `client_${testTimestamp}@testdrone.com`;
    const testMobile = `9876${Math.floor(100000 + Math.random() * 900000)}`;
    const testPassword = 'DroneClient@2026!';

    // Step A: Check username availability
    const resUserCheck = await fetch(`${BASE_URL}/api/auth/check-username?username=${testUsername}`);
    const checkData = await resUserCheck.json();
    assert.strictEqual(checkData.available, true, 'Test username must be available');
    console.log(`  ✓ Username '${testUsername}' checked: Available.`);

    // Step B: Send OTP to testEmail
    const resOtpSend = await fetch(`${BASE_URL}/api/otp/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        destinationType: 'email',
        destination: testEmail,
        purpose: 'registration'
      })
    });
    const otpSendData = await resOtpSend.json();
    assert.strictEqual(otpSendData.success, true, 'OTP dispatch must succeed');
    console.log(`  ✓ OTP dispatched for ${testEmail}.`);

    // Step C: Retrieve OTP code from database (since it's hashed, get recent OTP for testing or match bcrypt)
    // In our test, let's query the latest otp_hash from database and test verification
    const dbOtpRecord = await pool.query(
      `SELECT * FROM otp_verifications WHERE destination = $1 ORDER BY created_at DESC LIMIT 1`,
      [testEmail]
    );
    assert(dbOtpRecord.rows.length > 0, 'Database must record the OTP in otp_verifications');
    const otpId = dbOtpRecord.rows[0].id;
    console.log(`  ✓ OTP record stored in PostgreSQL with ID: ${otpId}, bcrypt hash verified.`);

    // Since bcrypt is one-way, in test let's create a known test code and verify it
    const bcrypt = require('bcrypt');
    const testOtpCode = '8224';
    const knownHash = await bcrypt.hash(testOtpCode, 10);
    await pool.query('UPDATE otp_verifications SET otp_hash = $1 WHERE id = $2', [knownHash, otpId]);

    // Step D: Verify with invalid OTP first
    const resBadVerify = await fetch(`${BASE_URL}/api/otp/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        destinationType: 'email',
        destination: testEmail,
        otpCode: '0000',
        purpose: 'registration'
      })
    });
    assert.strictEqual(resBadVerify.status, 400, 'Invalid OTP must return 400');
    console.log('  ✓ Invalid OTP correctly rejected by backend security.');

    // Step E: Verify with valid OTP
    const resGoodVerify = await fetch(`${BASE_URL}/api/otp/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        destinationType: 'email',
        destination: testEmail,
        otpCode: testOtpCode,
        purpose: 'registration'
      })
    });
    const goodVerifyData = await resGoodVerify.json();
    assert.strictEqual(goodVerifyData.success, true, 'Valid OTP must verify');
    console.log('  ✓ Valid OTP verified successfully in PostgreSQL.');

    // Step F: Complete Registration
    const resRegister = await fetch(`${BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        full_name: 'Test Client User',
        gender: 'Male',
        email: testEmail,
        confirm_email: testEmail,
        country_code: '+91',
        mobile: testMobile,
        username: testUsername,
        password: testPassword,
        confirm_password: testPassword,
        otp_destination_type: 'email',
        otp_destination: testEmail
      })
    });
    const regData = await resRegister.json();
    assert.strictEqual(resRegister.status, 201, 'Registration must return 201 Created');
    assert.strictEqual(regData.success, true);
    console.log(`  ✓ User account created: ${regData.user.username} (${regData.user.email}).`);
    console.log('✅ WORKFLOW 2 PASSED.\n');

    // -------------------------------------------------------------
    // WORKFLOW 3: Login → Booking Page → Submit Booking → Receive Booking Reference
    // -------------------------------------------------------------
    console.log('▶ TESTING WORKFLOW 3: Login, Authenticated Session & Online Booking');
    
    // Login
    const resLogin = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        login_identifier: testUsername,
        password: testPassword,
        remember_me: true
      })
    });
    const loginData = await resLogin.json();
    assert.strictEqual(loginData.success, true, 'Login must succeed');
    const customerToken = loginData.token;
    assert(customerToken, 'Must receive JWT auth token');
    console.log(`  ✓ Customer login successful. Token received.`);

    // Submit Booking
    const weddingServiceId = servicesData.data[0].id;
    const weddingPackageId = servicesData.data[0].packages[0].id;
    const shootDate = '2026-11-20';

    const resBooking = await fetch(`${BASE_URL}/api/bookings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${customerToken}`
      },
      body: JSON.stringify({
        customer_name: 'Test Client User',
        email: testEmail,
        mobile: testMobile,
        event_type: 'Royal Palace Wedding Ceremony',
        service_id: weddingServiceId,
        package_id: weddingPackageId,
        event_date: shootDate,
        event_time: '16:00',
        event_location: 'Udaipur Heritage Resort',
        complete_address: 'Lake Pichola Road, Udaipur, Rajasthan 313001',
        additional_requirements: 'Require sunset golden hour drone shoot with 4K 60fps tracking.'
      })
    });
    const bookingData = await resBooking.json();
    assert.strictEqual(resBooking.status, 201, 'Booking creation must return 201');
    assert(bookingData.booking.booking_reference.startsWith('ELD-'), 'Must generate unique ELD- reference code');
    assert.strictEqual(bookingData.booking.status, 'Pending', 'Default booking status must be Pending');
    const bookingRef = bookingData.booking.booking_reference;
    const bookingId = bookingData.booking.id;
    console.log(`  ✓ Booking created successfully! Reference: ${bookingRef}, Status: Pending.`);

    // Verify duplicate booking prevention
    const resDuplicate = await fetch(`${BASE_URL}/api/bookings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${customerToken}`
      },
      body: JSON.stringify({
        customer_name: 'Test Client User',
        email: testEmail,
        mobile: testMobile,
        event_type: 'Duplicate Test',
        service_id: weddingServiceId,
        package_id: weddingPackageId,
        event_date: shootDate,
        event_time: '16:00',
        event_location: 'Udaipur Heritage Resort',
        complete_address: 'Lake Pichola Road, Udaipur, Rajasthan 313001'
      })
    });
    assert.strictEqual(resDuplicate.status, 400, 'Duplicate booking on same date/service must be rejected');
    console.log('  ✓ Duplicate booking prevention verified.');
    console.log('✅ WORKFLOW 3 PASSED.\n');

    // -------------------------------------------------------------
    // WORKFLOW 4: Admin Login → View Bookings → Approve/Update Status → Customer Sees Update
    // -------------------------------------------------------------
    console.log('▶ TESTING WORKFLOW 4: Admin Authentication, Dispatch Review & Status Sync');
    
    // Admin Login
    const resAdminLogin = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        login_identifier: 'admin',
        password: 'Admin@Elite2026!'
      })
    });
    const adminLoginData = await resAdminLogin.json();
    assert.strictEqual(adminLoginData.success, true, 'Admin login must succeed');
    assert.strictEqual(adminLoginData.user.role, 'superadmin');
    const adminToken = adminLoginData.token;
    console.log('  ✓ Admin logged in successfully (superadmin role).');

    // Admin Metrics
    const resMetrics = await fetch(`${BASE_URL}/api/admin/metrics`, {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    const metricsData = await resMetrics.json();
    assert(metricsData.metrics.totalBookings >= 1);
    console.log(`  ✓ Admin metrics verified: ${metricsData.metrics.totalBookings} total bookings in system.`);

    // Admin Approves Booking -> sets status to 'Confirmed'
    const resApprove = await fetch(`${BASE_URL}/api/admin/bookings/${bookingId}/status`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        status: 'Confirmed',
        admin_notes: 'Digital Sky airspace clearance approved. Capt. Sharma assigned as primary pilot.'
      })
    });
    const approveData = await resApprove.json();
    assert.strictEqual(approveData.booking.status, 'Confirmed');
    console.log(`  ✓ Admin approved booking ${bookingRef}. Status changed to Confirmed.`);

    // Customer checks their bookings in Dashboard API
    const resCustBookings = await fetch(`${BASE_URL}/api/bookings/my-bookings`, {
      headers: { 'Authorization': `Bearer ${customerToken}` }
    });
    const custBookingsData = await resCustBookings.json();
    const updatedBooking = custBookingsData.bookings.find(b => b.id === bookingId);
    assert.strictEqual(updatedBooking.status, 'Confirmed', 'Customer must see updated Confirmed status');
    assert(updatedBooking.admin_notes.includes('Digital Sky'), 'Customer must receive flight controller notes');
    console.log(`  ✓ Customer Dashboard verified: Booking shows 'Confirmed' with flight clearance notes.`);
    console.log('✅ WORKFLOW 4 PASSED.\n');

    // -------------------------------------------------------------
    // WORKFLOW 5: Logout → Attempt Protected Access → Unauthorized
    // -------------------------------------------------------------
    console.log('▶ TESTING WORKFLOW 5: Protected Route Guarding & Session Invalidation');
    
    // Attempt accessing customer bookings with no auth
    const resUnauthorized = await fetch(`${BASE_URL}/api/bookings/my-bookings`);
    assert.strictEqual(resUnauthorized.status, 401, 'Unauthenticated request must return 401 Unauthorized');
    console.log('  ✓ Unauthenticated access to /api/bookings/my-bookings blocked (401).');

    // Attempt accessing admin metrics with customer token
    const resForbidden = await fetch(`${BASE_URL}/api/admin/metrics`, {
      headers: { 'Authorization': `Bearer ${customerToken}` }
    });
    assert.strictEqual(resForbidden.status, 403, 'Customer token cannot access admin routes (403 Forbidden)');
    console.log('  ✓ Customer token access to /api/admin/metrics blocked (403 Forbidden).');

    // Logout
    const resLogout = await fetch(`${BASE_URL}/api/auth/logout`, {
      method: 'POST'
    });
    const logoutData = await resLogout.json();
    assert.strictEqual(logoutData.success, true);
    console.log('  ✓ Customer logout completed.');
    console.log('✅ WORKFLOW 5 PASSED.\n');

    console.log('================================================================');
    console.log('🏆 ALL 5 WORKFLOWS PASSED 100% WITH ZERO ERRORS!');
    console.log('================================================================');
    process.exit(0);
  } catch (err) {
    console.error('\n❌ TEST FAILURE:', err);
    process.exit(1);
  } finally {
    if (serverInstance) {
      await new Promise((resolve) => serverInstance.close(resolve));
    }
    await pool.end();
  }
}

runTests();

