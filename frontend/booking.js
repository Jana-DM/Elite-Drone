/* ============================================================
   ELITE DRONE SERVICE - BOOKING JAVASCRIPT
============================================================ */

"use strict";

/* ============================================================
   CONFIGURATION
============================================================ */

const OWNER_UPI_ID = "hariharihari28163-3@okaxis";
const OWNER_NAME = "Elite Drone Service";
const RATE_PER_DAY = 1999;
const OTP_DURATION = 90;

/* ============================================================
   DOM ELEMENTS
============================================================ */

const bookingForm = document.getElementById("bookingForm");
const nameInput = document.getElementById("name");
const genderInput = document.getElementById("gender");
const ageInput = document.getElementById("age");
const eventInput = document.getElementById("eventType");
const otherEventGroup = document.getElementById("otherEventGroup");
const otherEventInput = document.getElementById("otherEvent");
const startDateInput = document.getElementById("startDate");
const endDateInput = document.getElementById("endDate");
const daysInput = document.getElementById("numberOfDays");
const addressInput = document.getElementById("address");
const countryCode = null; // removed - using email OTP instead
const emailInput = document.getElementById("email");
const mobileInput = emailInput; // alias for backward compatibility
const otpInput = document.getElementById("otp");
const sendOtpBtn = document.getElementById("sendOtpBtn");
const verifyOtpBtn = document.getElementById("verifyOtpBtn");
const otpTimer = document.getElementById("otpTimer");
const otpSuccess = document.getElementById("otpSuccess");
const amountBox = document.getElementById("amountBox");
const calculationLoading = document.getElementById("calculationLoading");
const paymentAmount = document.getElementById("paymentAmount");
const onlinePaymentSection = document.getElementById("onlinePaymentSection");
const offlinePaymentSection = document.getElementById("offlinePaymentSection");
const paymentError = document.getElementById("paymentError");
const paymentNetworkError = document.getElementById("paymentNetworkError");
const onlinePaymentBtn = document.getElementById("onlinePaymentBtn");
const bookingSuccess = document.getElementById("bookingSuccess");
const welcomeMessage = document.getElementById("welcomeMessage");

/* ============================================================
   ERROR ELEMENTS
============================================================ */

const errors = {
    name: document.getElementById("nameError"),
    gender: document.getElementById("genderError"),
    age: document.getElementById("ageError"),
    event: document.getElementById("eventError"),
    otherEvent: document.getElementById("otherEventError"),
    startDate: document.getElementById("startDateError"),
    endDate: document.getElementById("endDateError"),
    days: document.getElementById("daysError"),
    address: document.getElementById("addressError"),
    mobile: document.getElementById("mobileError"),
    otp: document.getElementById("otpError")
};

/* ============================================================
   STATE
============================================================ */

let otpVerified = false;
let otpTimerInterval = null;
let otpRemaining = 0;
let calculationTimeout = null;

/* ============================================================
   AUTHENTICATION / REGISTRATION STATE
============================================================ */

function getAuthenticatedUser() {
    try {
        const stored = localStorage.getItem("elite_drone_user") ||
            localStorage.getItem("eliteDroneUser") ||
            sessionStorage.getItem("elite_drone_user") ||
            sessionStorage.getItem("eliteDroneUser");
        if (stored) {
            const parsed = JSON.parse(stored);
            if (parsed && typeof parsed === "object") return parsed;
        }
    } catch (e) {
        console.warn("Error reading stored user:", e);
    }
    return null;
}

function isUserLoggedIn() {
    return !!(
        getAuthenticatedUser() ||
        localStorage.getItem("elite_drone_token") ||
        localStorage.getItem("eliteDroneAuthToken") ||
        sessionStorage.getItem("elite_drone_token")
    );
}

function isUserRegistered() {
    if (localStorage.getItem("eliteDroneRegistered") === "true") return true;
    const user = getAuthenticatedUser();
    if (user && (user.username || user.email || user.mobile)) {
        localStorage.setItem("eliteDroneRegistered", "true");
        return true;
    }
    return false;
}

function getBookingReturnPage() {
    return "booking.html";
}

/* ============================================================
   DATE HELPER
============================================================ */

function getTodayString() {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, "0");
    const day = String(today.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

const todayString = getTodayString();
if (startDateInput) startDateInput.min = todayString;
if (endDateInput) endDateInput.min = todayString;

/* ============================================================
   ERROR HELPERS
============================================================ */

function showError(element, message) {
    if (element) {
        element.textContent = message;
    }
}

function clearError(element) {
    if (element) {
        element.textContent = "";
    }
}

/* ============================================================
   ADDRESS VALIDATION
============================================================ */

function validateAddress() {
    if (!addressInput) return false;
    const address = addressInput.value.trim();

    if (address.length < 10) {
        showError(errors.address, "Please enter your complete address (min 10 characters)");
        return false;
    }

    clearError(errors.address);
    return true;
}

if (addressInput) {
    addressInput.addEventListener("input", function () {
        validateAddress();
        saveBookingData();
    });
}

/* ============================================================
   NAME
============================================================ */

if (nameInput) {
    nameInput.addEventListener("input", function () {
        if (nameInput.value.trim()) {
            clearError(errors.name);
        } else {
            showError(errors.name, "Please enter your name");
        }
        saveBookingData();
    });
}

/* ============================================================
   GENDER
============================================================ */

if (genderInput) {
    genderInput.addEventListener("change", function () {
        if (genderInput.value) {
            clearError(errors.gender);
        } else {
            showError(errors.gender, "Please select gender");
        }
        saveBookingData();
    });
}

/* ============================================================
   AGE
============================================================ */

if (ageInput) {
    ageInput.addEventListener("input", function () {
        ageInput.value = ageInput.value.replace(/\D/g, "").slice(0, 3);
        const age = Number(ageInput.value);

        if (Number.isInteger(age) && age >= 1 && age <= 120) {
            clearError(errors.age);
        } else {
            showError(errors.age, "Please enter a valid age (1-120)");
        }
        saveBookingData();
    });
}

/* ============================================================
   EVENT / FUNCTION
============================================================ */

if (eventInput) {
    eventInput.addEventListener("change", function () {
        if (!eventInput.value) {
            showError(errors.event, "Please select an event or function");
            if (otherEventGroup) otherEventGroup.classList.add("hidden");
            saveBookingData();
            return;
        }

        clearError(errors.event);

        if (eventInput.value === "Other") {
            if (otherEventGroup) otherEventGroup.classList.remove("hidden");
        } else {
            if (otherEventGroup) otherEventGroup.classList.add("hidden");
            if (otherEventInput) otherEventInput.value = "";
            clearError(errors.otherEvent);
        }

        saveBookingData();
    });
}

/* ============================================================
   OTHER EVENT
============================================================ */

if (otherEventInput) {
    otherEventInput.addEventListener("input", function () {
        if (otherEventInput.value.trim()) {
            clearError(errors.otherEvent);
        } else {
            showError(errors.otherEvent, "Please specify requirement");
        }
        saveBookingData();
    });
}

/* ============================================================
   START DATE
============================================================ */

if (startDateInput) {
    startDateInput.addEventListener("change", function () {
        const startDate = startDateInput.value;

        if (!startDate || startDate < getTodayString()) {
            showError(errors.startDate, "Please select a valid date from today onwards");
            return;
        }

        clearError(errors.startDate);

        if (endDateInput) {
            endDateInput.min = startDate;
            if (endDateInput.value && endDateInput.value < startDate) {
                endDateInput.value = "";
                if (daysInput) daysInput.value = "";
                if (amountBox) amountBox.textContent = "₹0";
                if (paymentAmount) paymentAmount.textContent = "₹0";
            }
        }

        calculateDays();
        saveBookingData();
    });
}

/* ============================================================
   END DATE
============================================================ */

if (endDateInput) {
    endDateInput.addEventListener("change", function () {
        const startDate = startDateInput ? startDateInput.value : "";
        const endDate = endDateInput.value;

        if (!endDate || endDate < getTodayString()) {
            showError(errors.endDate, "Please select a valid end date");
            return;
        }

        if (startDate && endDate < startDate) {
            showError(errors.endDate, "End date must be on or after start date");
            return;
        }

        clearError(errors.endDate);
        calculateDays();
        saveBookingData();
    });
}

/* ============================================================
   CALCULATE NUMBER OF DAYS
============================================================ */

function calculateDays() {
    if (!startDateInput || !endDateInput) return;

    const startValue = startDateInput.value;
    const endValue = endDateInput.value;

    if (!startValue || !endValue) {
        if (daysInput) daysInput.value = "";
        if (amountBox) amountBox.textContent = "₹0";
        if (paymentAmount) paymentAmount.textContent = "₹0";
        return;
    }

    const start = new Date(`${startValue}T00:00:00`);
    const end = new Date(`${endValue}T00:00:00`);

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
        return;
    }

    const difference = end.getTime() - start.getTime();
    const days = Math.floor(difference / (1000 * 60 * 60 * 24)) + 1;

    if (days < 1) {
        if (daysInput) daysInput.value = "";
        if (amountBox) amountBox.textContent = "₹0";
        if (paymentAmount) paymentAmount.textContent = "₹0";
        return;
    }

    if (daysInput) {
        daysInput.value = `${days} Day${days > 1 ? "s" : ""}`;
    }

    calculateAmount(days);
}

/* ============================================================
   CALCULATE AMOUNT
============================================================ */

function calculateAmount(days = null) {
    if (days === null) {
        days = getNumberOfBookingDays();
    }

    if (!Number.isInteger(days) || days < 1) {
        if (amountBox) amountBox.textContent = "₹0";
        if (paymentAmount) paymentAmount.textContent = "₹0";
        return;
    }

    if (calculationTimeout) {
        clearTimeout(calculationTimeout);
    }

    if (calculationLoading) calculationLoading.classList.remove("hidden");
    if (amountBox) amountBox.classList.add("hidden");

    calculationTimeout = setTimeout(function () {
        const total = days * RATE_PER_DAY;
        const formatted = `₹${total.toLocaleString("en-IN")}`;

        if (amountBox) amountBox.textContent = formatted;
        if (paymentAmount) paymentAmount.textContent = formatted;

        if (calculationLoading) calculationLoading.classList.add("hidden");
        if (amountBox) amountBox.classList.remove("hidden");
    }, 350);
}

/* ============================================================
   EMAIL VALIDATION
============================================================ */

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

if (mobileInput) {
    mobileInput.addEventListener("input", function () {
        const emailVal = mobileInput.value.trim();

        otpVerified = false;
        if (otpSuccess) otpSuccess.classList.remove("show");

        if (verifyOtpBtn) {
            verifyOtpBtn.disabled = false;
            verifyOtpBtn.textContent = "Verify OTP";
        }

        if (EMAIL_REGEX.test(emailVal)) {
            clearError(errors.mobile);
        } else if (emailVal.length > 0) {
            showError(errors.mobile, "Please enter a valid email address");
        } else {
            clearError(errors.mobile);
        }

        saveBookingData();
    });
}

/* ============================================================
   OTP SEND
============================================================ */

if (sendOtpBtn) {
    sendOtpBtn.addEventListener("click", async function (event) {
        event.preventDefault();

        const email = mobileInput ? mobileInput.value.trim() : "";
        if (!EMAIL_REGEX.test(email)) {
            showError(errors.mobile, "Please enter a valid email address");
            if (mobileInput) mobileInput.focus();
            return;
        }

        clearError(errors.mobile);
        clearError(errors.otp);

        otpVerified = false;
        if (otpSuccess) otpSuccess.classList.remove("show");

        startOtpTimer();

        sendOtpBtn.disabled = true;
        sendOtpBtn.textContent = "Sending...";

        try {
            const response = await fetch("/send-otp", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    method: "email",
                    contact: email
                })
            });

            const result = await response.json();

            if (!response.ok || !result.success) {
                throw new Error(result.message || "Unable to send OTP.");
            }

            if (otpInput) {
                otpInput.value = "";
                otpInput.focus();
            }

            if (verifyOtpBtn) {
                verifyOtpBtn.disabled = false;
                verifyOtpBtn.textContent = "Verify OTP";
            }

            // In local development, show the code helper
            if (result.otp) {
                console.log("🔑 Dev OTP Code:", result.otp);
                showError(errors.otp, `OTP sent! (Test Code: ${result.otp})`);
                if (errors.otp) errors.otp.style.color = "#0284c7";
            }

        } catch (error) {
            console.error("SEND OTP ERROR:", error);
            showError(errors.otp, error.message || "Unable to send OTP. Please try again.");
            if (errors.otp) errors.otp.style.color = "var(--error)";

            clearInterval(otpTimerInterval);
            if (otpTimer) otpTimer.textContent = "";

            sendOtpBtn.classList.remove("hidden");
            sendOtpBtn.disabled = false;
            sendOtpBtn.textContent = "Send OTP";
        }
    });
}

/* ============================================================
   OTP TIMER
============================================================ */

function startOtpTimer() {
    clearInterval(otpTimerInterval);
    otpRemaining = OTP_DURATION;

    if (sendOtpBtn) sendOtpBtn.classList.add("hidden");

    function updateOtpTimer() {
        const minutes = String(Math.floor(otpRemaining / 60)).padStart(2, "0");
        const seconds = String(otpRemaining % 60).padStart(2, "0");
        if (otpTimer) otpTimer.textContent = `OTP expires in ${minutes}:${seconds}`;
    }

    updateOtpTimer();

    otpTimerInterval = setInterval(function () {
        otpRemaining--;

        if (otpRemaining <= 0) {
            otpRemaining = 0;
            updateOtpTimer();
            clearInterval(otpTimerInterval);

            if (sendOtpBtn) {
                sendOtpBtn.classList.remove("hidden");
                sendOtpBtn.disabled = false;
                sendOtpBtn.textContent = "Resend OTP";
            }
            return;
        }

        updateOtpTimer();
    }, 1000);
}

/* ============================================================
   OTP INPUT
============================================================ */

if (otpInput) {
    otpInput.addEventListener("input", function () {
        otpInput.value = otpInput.value.replace(/\D/g, "").slice(0, 4);

        if (otpInput.value.length === 4) {
            clearError(errors.otp);
        } else {
            otpVerified = false;
            if (otpSuccess) otpSuccess.classList.remove("show");
        }
    });
}

/* ============================================================
   OTP VERIFY
============================================================ */

if (verifyOtpBtn) {
    verifyOtpBtn.addEventListener("click", async function () {
        const otp = otpInput ? otpInput.value.trim() : "";
        const email = mobileInput ? mobileInput.value.trim() : "";

        if (!EMAIL_REGEX.test(email)) {
            showError(errors.mobile, "Please enter your valid email address");
            return;
        }

        if (otp.length !== 4) {
            showError(errors.otp, "Please enter your 4 digit OTP");
            if (otpInput) otpInput.focus();
            return;
        }

        verifyOtpBtn.disabled = true;
        verifyOtpBtn.textContent = "Verifying...";

        try {
            const response = await fetch("/verify-otp", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    method: "email",
                    contact: email,
                    otp: otp
                })
            });

            const result = await response.json();

            if (!response.ok || !result.success) {
                throw new Error(result.message || "Please enter your valid OTP");
            }

            otpVerified = true;
            clearError(errors.otp);
            if (errors.otp) errors.otp.style.color = "var(--error)";

            if (otpSuccess) otpSuccess.classList.add("show");
            verifyOtpBtn.textContent = "Verified";
            verifyOtpBtn.disabled = true;

        } catch (error) {
            console.error("VERIFY OTP ERROR:", error);
            otpVerified = false;
            showError(errors.otp, error.message || "Please enter your valid OTP");
            if (errors.otp) errors.otp.style.color = "var(--error)";

            verifyOtpBtn.disabled = false;
            verifyOtpBtn.textContent = "Verify OTP";
        }
    });
}

/* ============================================================
   PAYMENT METHOD
============================================================ */

const paymentRadios = document.querySelectorAll('input[name="paymentMethod"]');

paymentRadios.forEach(function (radio) {
    radio.addEventListener("change", function () {
        clearError(paymentError);
        clearError(paymentNetworkError);

        if (radio.value === "online") {
            if (onlinePaymentSection) onlinePaymentSection.classList.remove("hidden");
            if (offlinePaymentSection) offlinePaymentSection.classList.add("hidden");
            if (paymentAmount && amountBox) paymentAmount.textContent = amountBox.textContent;
        }

        if (radio.value === "offline") {
            if (onlinePaymentSection) onlinePaymentSection.classList.add("hidden");
            if (offlinePaymentSection) offlinePaymentSection.classList.remove("hidden");
        }

        saveBookingData();
    });
});

/* ============================================================
   NETWORK CHECK
============================================================ */

function checkNetwork() {
    if (!navigator.onLine) {
        showError(paymentNetworkError, "Network slow/error. Please check connection.");
        return false;
    }
    clearError(paymentNetworkError);
    return true;
}

/* ============================================================
   UPI PAYMENT
============================================================ */

function openUPIPayment(appName) {
    if (!checkNetwork()) return;

    const days = getNumberOfBookingDays();
    if (!days) {
        showError(paymentError, "Please select valid booking dates.");
        return;
    }

    const totalAmount = days * RATE_PER_DAY;
    const upiUrl = "upi://pay?" +
        "pa=" + encodeURIComponent(OWNER_UPI_ID) +
        "&pn=" + encodeURIComponent(OWNER_NAME) +
        "&am=" + encodeURIComponent(totalAmount.toFixed(2)) +
        "&cu=INR";

    console.log("Selected UPI App:", appName, upiUrl);

    // Try launching UPI app handler on mobile/desktop
    window.location.href = upiUrl;

    // Show friendly guidance in UI
    showError(paymentError, `Opened ${appName ? appName.toUpperCase() : 'UPI'}. Scan the QR or complete payment to confirm.`);
    if (paymentError) paymentError.style.color = "#0284c7";
}

document.querySelectorAll(".upi-app-btn").forEach(function (button) {
    button.addEventListener("click", function () {
        clearError(paymentError);
        openUPIPayment(button.dataset.app);
    });
});

document.querySelectorAll(".card-payment-btn").forEach(function (button) {
    button.addEventListener("click", function () {
        if (!checkNetwork()) return;
        showError(paymentError, "Card payment gateway is connecting. You may also use instant UPI or Offline Payment.");
        if (paymentError) paymentError.style.color = "#0284c7";
    });
});

if (onlinePaymentBtn) {
    onlinePaymentBtn.addEventListener("click", function () {
        if (!checkNetwork()) return;

        const days = getNumberOfBookingDays();
        if (!days) {
            showError(paymentError, "Please select valid booking dates.");
            return;
        }

        clearError(paymentError);
        openUPIPayment("upi");
    });
}

/* ============================================================
   GET NUMBER OF DAYS
============================================================ */

function getNumberOfBookingDays() {
    if (!startDateInput || !endDateInput) return null;
    const startValue = startDateInput.value;
    const endValue = endDateInput.value;

    if (!startValue || !endValue) return null;

    const start = new Date(`${startValue}T00:00:00`);
    const end = new Date(`${endValue}T00:00:00`);

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
        return null;
    }

    const difference = end.getTime() - start.getTime();
    const days = Math.floor(difference / (1000 * 60 * 60 * 24)) + 1;

    if (!Number.isInteger(days) || days < 1) return null;
    return days;
}

/* ============================================================
   VALIDATE BOOKING FORM
============================================================ */

function validateBookingForm() {
    let valid = true;

    /* NAME */
    if (!nameInput || !nameInput.value.trim()) {
        showError(errors.name, "Please enter your name");
        valid = false;
    } else {
        clearError(errors.name);
    }

    /* GENDER */
    if (!genderInput || !genderInput.value) {
        showError(errors.gender, "Please select gender");
        valid = false;
    } else {
        clearError(errors.gender);
    }

    /* AGE */
    const age = ageInput ? Number(ageInput.value) : 0;
    if (!Number.isInteger(age) || age < 1 || age > 120) {
        showError(errors.age, "Please enter a valid age (1-120)");
        valid = false;
    } else {
        clearError(errors.age);
    }

    /* EVENT */
    if (!eventInput || !eventInput.value) {
        showError(errors.event, "Please select an event or function");
        valid = false;
    } else {
        clearError(errors.event);
    }

    /* OTHER EVENT */
    if (eventInput && eventInput.value === "Other") {
        if (!otherEventInput || !otherEventInput.value.trim()) {
            showError(errors.otherEvent, "Please specify your requirement");
            valid = false;
        } else {
            clearError(errors.otherEvent);
        }
    }

    /* START DATE */
    if (!startDateInput || !startDateInput.value || startDateInput.value < getTodayString()) {
        showError(errors.startDate, "Please choose a start date from today onwards");
        valid = false;
    } else {
        clearError(errors.startDate);
    }

    /* END DATE */
    if (!endDateInput || !endDateInput.value || endDateInput.value < getTodayString()) {
        showError(errors.endDate, "Please choose a valid end date");
        valid = false;
    } else if (startDateInput && startDateInput.value && endDateInput.value < startDateInput.value) {
        showError(errors.endDate, "End date must be on or after start date");
        valid = false;
    } else {
        clearError(errors.endDate);
    }

    /* NUMBER OF DAYS */
    const days = getNumberOfBookingDays();
    if (!days) {
        showError(errors.days, "Please select valid booking dates");
        valid = false;
    } else {
        clearError(errors.days);
    }

    /* ADDRESS */
    if (!validateAddress()) {
        valid = false;
    }

    /* EMAIL */
    const emailVal = mobileInput ? mobileInput.value.trim() : "";
    if (!EMAIL_REGEX.test(emailVal)) {
        showError(errors.mobile, "Please enter your valid email address");
        valid = false;
    } else {
        clearError(errors.mobile);
    }

    /* OTP */
    if (!otpVerified) {
        showError(errors.otp, "Please verify your email OTP before booking.");
        if (errors.otp) errors.otp.style.color = "var(--error)";
        valid = false;
    }

    /* PAYMENT */
    const selectedPayment = document.querySelector('input[name="paymentMethod"]:checked');
    if (!selectedPayment) {
        showError(paymentError, "Please select a payment method.");
        if (paymentError) paymentError.style.color = "var(--error)";
        valid = false;
    }

    return valid;
}

/* ============================================================
   BOOKING SUBMIT
============================================================ */

if (bookingForm) {
    bookingForm.addEventListener("submit", function (event) {
        event.preventDefault();

        const valid = validateBookingForm();
        if (!valid) {
            // Scroll to the first error
            const firstErr = document.querySelector('.field-error:not(:empty)');
            if (firstErr) {
                firstErr.parentElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
            return;
        }

        const selectedPayment = document.querySelector('input[name="paymentMethod"]:checked');

        if (selectedPayment && selectedPayment.value === "offline") {
            completeBooking("Offline Payment");
            return;
        }

        if (selectedPayment && selectedPayment.value === "online") {
            if (!checkNetwork()) return;
            completeBooking("Online Payment (Pending UPI Sync)");
            return;
        }
    });
}

/* ============================================================
   COMPLETE BOOKING
============================================================ */

function completeBooking(paymentStatus) {
    const days = getNumberOfBookingDays() || 1;
    const user = getAuthenticatedUser() || {};
    const totalAmount = days * RATE_PER_DAY;

    const bookingId = createUniqueBookingId();
    const now = new Date().toISOString();

    const selectedEvent = (eventInput && eventInput.value === "Other")
        ? (otherEventInput ? otherEventInput.value.trim() : "Custom Mission")
        : (eventInput ? eventInput.value : "Aerial Shoot");

    const timeElement = document.getElementById("bookingTime") ||
        document.querySelector('[name="bookingTime"], [name="time"], #time');
    const bookingTime = timeElement ? String(timeElement.value || "").trim() : "10:00 AM";

    const bookingData = {
        bookingId,
        userId: user.id || user.userId || `EDU-${Date.now().toString(36)}`,
        customerName: nameInput ? nameInput.value.trim() : (user.full_name || user.username || "Client"),
        username: user.username || "",
        email: ((mobileInput && mobileInput.value.trim()) || user.email || "client@elitedrone.com").toLowerCase(),
        mobile: user.mobile || "",
        service: selectedEvent,
        event: selectedEvent,
        numberOfDays: days,
        date: startDateInput ? startDateInput.value : getTodayString(),
        startDate: startDateInput ? startDateInput.value : getTodayString(),
        endDate: endDateInput ? endDateInput.value : getTodayString(),
        time: bookingTime,
        location: addressInput ? addressInput.value.trim() : "",
        address: addressInput ? addressInput.value.trim() : "",
        gender: genderInput ? genderInput.value : "",
        age: ageInput ? Number(ageInput.value) : null,
        amount: totalAmount,
        totalAmount,
        paymentStatus,
        bookingStatus: "Confirmed",
        status: "Confirmed",
        createdAt: now
    };

    try {
        let bookings = JSON.parse(localStorage.getItem("eliteDroneBookings") || "[]");
        if (!Array.isArray(bookings)) bookings = [];

        bookings.push(bookingData);
        localStorage.setItem("eliteDroneBookings", JSON.stringify(bookings));
        localStorage.setItem("eliteDroneBooking", JSON.stringify(bookingData));

        // Dispatch background notification to backend API
        sendOwnerNotification(bookingData);

        // Clear draft and show success card
        localStorage.removeItem("eliteDroneBookingForm");
        showBookingSuccess(bookingData);

    } catch (error) {
        console.error("Elite Drone booking save failed:", error);
        const successError = document.getElementById("bookingSuccessError");
        if (successError) {
            successError.textContent = "Something went wrong. Please try again.";
        }
        if (bookingSuccess) {
            bookingSuccess.classList.remove("hidden");
            bookingSuccess.scrollIntoView({ behavior: "smooth", block: "center" });
        }
    }
}

function createUniqueBookingId() {
    let bookings = [];
    try {
        bookings = JSON.parse(localStorage.getItem("eliteDroneBookings") || "[]");
    } catch (e) {
        bookings = [];
    }
    const used = new Set(Array.isArray(bookings) ? bookings.map(b => String(b.bookingId)) : []);

    let id;
    do {
        const stamp = Date.now().toString().slice(-7);
        const random = Math.floor(100 + Math.random() * 900);
        id = `ED-${stamp}${random}`;
    } while (used.has(id));

    return id;
}

function showBookingSuccess(booking) {
    const details = document.getElementById("bookingSuccessDetails");
    const flyer = document.getElementById("bookingNotificationFlyer");
    const button = document.getElementById("bookNowBtn");

    if (!bookingSuccess || !details) return;

    const displayDate = booking.date ? formatBookingDate(booking.date) : "Not provided";
    const displayTime = booking.time || "10:00 AM";
    const displayStatus = booking.bookingStatus || "Confirmed";

    details.innerHTML = `
        <div class="success-detail-row"><span>Booking ID</span><strong>${escapeBookingHtml(booking.bookingId)}</strong></div>
        <div class="success-detail-row"><span>Service / Event</span><strong>${escapeBookingHtml(booking.service || "—")}</strong></div>
        <div class="success-detail-row"><span>Dates</span><strong>${escapeBookingHtml(booking.startDate)} to ${escapeBookingHtml(booking.endDate)} (${booking.numberOfDays} Days)</strong></div>
        <div class="success-detail-row"><span>Estimated Amount</span><strong>₹${booking.totalAmount.toLocaleString('en-IN')}</strong></div>
        <div class="success-detail-row"><span>Location</span><strong>${escapeBookingHtml(booking.location || "—")}</strong></div>
        <div class="success-detail-row"><span>Payment</span><strong>${escapeBookingHtml(booking.paymentStatus || "—")}</strong></div>
        <div class="success-detail-row"><span>Status</span><strong class="success-confirmed">✓ ${escapeBookingHtml(displayStatus)}</strong></div>
    `;

    // Hide the form fields and show the success card
    Array.from(bookingForm.children).forEach(child => {
        if (child !== bookingSuccess) {
            child.classList.add("hidden");
        }
    });

    bookingSuccess.classList.remove("hidden");
    bookingSuccess.scrollIntoView({ behavior: "smooth", block: "center" });

    if (button) button.disabled = true;

    if (flyer) {
        setTimeout(() => flyer.classList.add("flyer-active"), 400);
    }

    setTimeout(() => {
        sessionStorage.setItem("eliteDroneBookingHandoff", JSON.stringify({
            bookingId: booking.bookingId,
            userId: booking.userId,
            startedAt: Date.now()
        }));
        window.location.replace("index.html");
    }, 4000);
}

function formatBookingDate(value) {
    const d = new Date(`${value}T00:00:00`);
    if (Number.isNaN(d.getTime())) return value;
    return d.toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric"
    });
}

function escapeBookingHtml(value) {
    return String(value ?? "").replace(/[&<>'"]/g, char => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        "'": "&#39;",
        '"': "&quot;"
    }[char]));
}

/* ============================================================
   LOCAL STORAGE - SAVE
============================================================ */

function saveBookingData() {
    const selectedPayment = document.querySelector('input[name="paymentMethod"]:checked');
    const data = {
        name: nameInput ? nameInput.value : "",
        gender: genderInput ? genderInput.value : "",
        age: ageInput ? ageInput.value : "",
        eventType: eventInput ? eventInput.value : "",
        otherEvent: otherEventInput ? otherEventInput.value : "",
        startDate: startDateInput ? startDateInput.value : "",
        endDate: endDateInput ? endDateInput.value : "",
        numberOfDays: daysInput ? daysInput.value : "",
        address: addressInput ? addressInput.value : "",
        email: mobileInput ? mobileInput.value : "",
        paymentMethod: selectedPayment ? selectedPayment.value : ""
    };

    localStorage.setItem("eliteDroneBookingForm", JSON.stringify(data));
}

/* ============================================================
   LOCAL STORAGE - LOAD
============================================================ */

function loadBookingData() {
    const saved = localStorage.getItem("eliteDroneBookingForm");
    if (!saved) return;

    try {
        const data = JSON.parse(saved);

        if (nameInput && data.name) nameInput.value = data.name;
        if (genderInput && data.gender) genderInput.value = data.gender;
        if (ageInput && data.age) ageInput.value = data.age;
        if (eventInput && data.eventType) {
            eventInput.value = data.eventType;
            if (data.eventType === "Other" && otherEventGroup) {
                otherEventGroup.classList.remove("hidden");
                if (otherEventInput && data.otherEvent) otherEventInput.value = data.otherEvent;
            }
        }
        if (startDateInput && data.startDate) {
            startDateInput.value = data.startDate;
            if (endDateInput) endDateInput.min = data.startDate;
        }
        if (endDateInput && data.endDate) endDateInput.value = data.endDate;
        if (addressInput && data.address) addressInput.value = data.address;
        if (mobileInput && (data.email || data.mobile)) mobileInput.value = data.email || data.mobile;

        if (data.paymentMethod) {
            const radio = document.querySelector(`input[name="paymentMethod"][value="${data.paymentMethod}"]`);
            if (radio) {
                radio.checked = true;
                if (data.paymentMethod === "online" && onlinePaymentSection) {
                    onlinePaymentSection.classList.remove("hidden");
                    if (offlinePaymentSection) offlinePaymentSection.classList.add("hidden");
                } else if (offlinePaymentSection) {
                    offlinePaymentSection.classList.remove("hidden");
                    if (onlinePaymentSection) onlinePaymentSection.classList.add("hidden");
                }
            }
        }

        calculateDays();
    } catch (error) {
        console.warn("Unable to restore booking data draft:", error);
    }
}

/* ============================================================
   WELCOME USER & AUTOFILL
============================================================ */

function loadWelcomeUser() {
    const user = getAuthenticatedUser();
    if (!user) return;

    const displayName = user.full_name || user.name || user.username;
    if (welcomeMessage && displayName) {
        welcomeMessage.textContent = `Hello, ${displayName} 👋`;
    }

    // Autofill user details if inputs are empty
    if (nameInput && !nameInput.value && displayName) {
        nameInput.value = displayName;
    }
    if (mobileInput && !mobileInput.value && (user.email || user.mobile)) {
        mobileInput.value = user.email || user.mobile || "";
    }
}

/* ============================================================
   ENTER KEY - PREVENT PAGE REFRESH
============================================================ */

if (bookingForm) {
    bookingForm.addEventListener("keydown", function (event) {
        if (event.key === "Enter" && event.target.tagName !== "TEXTAREA") {
            event.preventDefault();
        }
    });

    bookingForm.addEventListener("input", saveBookingData);
    bookingForm.addEventListener("change", saveBookingData);
}

/* ============================================================
   NETWORK EVENTS
============================================================ */

window.addEventListener("offline", function () {
    showError(paymentNetworkError, "Network connection lost. Please check your internet.");
});

window.addEventListener("online", function () {
    clearError(paymentNetworkError);
});

/* ============================================================
   BACKEND OWNER NOTIFICATION
============================================================ */

async function sendOwnerNotification(bookingData) {
    try {
        const response = await fetch("/api/booking/notify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(bookingData)
        });

        const result = await response.json();
        if (result.success) {
            console.log("✅ Owner & database booking notification dispatched successfully");
        } else {
            console.warn("Owner notification response note:", result.message);
        }
    } catch (error) {
        console.warn("Could not reach notification endpoint:", error.message);
    }
}

/* ============================================================
   INITIAL LOAD
============================================================ */

document.addEventListener("DOMContentLoaded", function () {
    loadBookingData();
    loadWelcomeUser();
    calculateDays();
});

