const BACKEND_BASE_URL = 'https://medassistbackend-production.up.railway.app';

let qrRegionId = null;
let profileSection = null;
let profileCard = null;
let scanAgainBtn = null;
let scannerSection = null;
let cameraAccessBtn = null;
let html5QrCode = null;

document.addEventListener('DOMContentLoaded', async () => {
  qrRegionId = document.getElementById('qr-reader');
  profileSection = document.getElementById('profile-section');
  profileCard = document.getElementById('profile-card');
  scanAgainBtn = document.getElementById('scan-again');
  scannerSection = document.getElementById('scanner-section');
  cameraAccessBtn = document.getElementById('camera-access-btn');

  if (!qrRegionId || !profileSection || !profileCard || !scanAgainBtn || !scannerSection || !cameraAccessBtn) {
    console.error('DOM elements not found');
    return;
  }

  // Wait for Html5Qrcode library to load with fallback
  let attempts = 0;
  const checkLibrary = () => {
    if (typeof Html5Qrcode !== 'undefined') {
      console.log('Html5Qrcode library loaded successfully');
      cameraAccessBtn.addEventListener('click', () => startScanner());
      scanAgainBtn.addEventListener('click', () => {
        showScannerSection();
        cameraAccessBtn.textContent = 'Access Camera';
        cameraAccessBtn.disabled = false;
      });
    } else {
      attempts++;
      if (attempts < 50) { // Increased attempts
        setTimeout(checkLibrary, 200);
      } else if (attempts === 50) {
        console.log('Trying fallback CDN...');
        loadFallbackScript();
        setTimeout(checkLibrary, 500);
      } else {
        console.error('Html5Qrcode library failed to load from all sources');
        cameraAccessBtn.textContent = 'QR Library Error - Refresh Page';
        cameraAccessBtn.disabled = true;
      }
    }
  };

  const loadFallbackScript = () => {
    const fallbackScript = document.createElement('script');
    fallbackScript.src = 'https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js';
    fallbackScript.onload = () => console.log('Fallback script loaded');
    fallbackScript.onerror = () => console.error('Fallback script failed');
    document.head.appendChild(fallbackScript);
  };

  checkLibrary();
});

function showScannerSection() {
  scannerSection.classList.remove('hidden');
  profileSection.classList.add('hidden');
}

function showProfileSection() {
  scannerSection.classList.add('hidden');
  profileSection.classList.remove('hidden');
}

async function startScanner() {
  try {
    // Check if library is available
    if (typeof Html5Qrcode === 'undefined') {
      throw new Error('Html5Qrcode library not loaded');
    }

    if (html5QrCode) {
      await html5QrCode.stop();
      html5QrCode.clear();
      html5QrCode = null;
    }

    html5QrCode = new Html5Qrcode("qr-reader");

    const qrCodeSuccessCallback = (decodedText, decodedResult) => {
      console.log('QR Code scanned:', decodedText);
      const emergencyId = extractEmergencyId(decodedText);
      if (emergencyId) {
        html5QrCode.stop();
        showProfileSection();
        showLoading('Fetching emergency information...');
        fetchProfile(emergencyId);
      } else {
        showError('Invalid QR code format. Please scan a valid MedAssist+ emergency QR code.');
      }
    };

    const qrCodeErrorCallback = (error) => {
      // Ignore frequent scanning errors
    };

    const config = { 
      fps: 10, 
      qrbox: { width: 250, height: 250 },
      aspectRatio: 1.0
    };

    // Try environment camera first, fallback to any camera
    try {
      await html5QrCode.start(
        { facingMode: "environment" }, 
        config, 
        qrCodeSuccessCallback,
        qrCodeErrorCallback
      );
    } catch (envError) {
      console.log('Environment camera not available, trying default camera');
      await html5QrCode.start(
        { facingMode: "user" }, 
        config, 
        qrCodeSuccessCallback,
        qrCodeErrorCallback
      );
    }

    cameraAccessBtn.textContent = 'Camera Active';
    cameraAccessBtn.disabled = true;

  } catch (err) {
    console.error('Error starting scanner:', err);
    showError('Unable to access camera. Please check camera permissions and try again.');
    cameraAccessBtn.textContent = 'Retry Camera Access';
    cameraAccessBtn.disabled = false;
  }
}

function extractEmergencyId(text) {
  // Try to extract ID from URL format first
  const urlMatch = text.match(/\/emergency\/view\/(.+)$/);
  if (urlMatch) {
    return urlMatch[1];
  }
  
  // Fallback to original format
  const directMatch = text.match(/^emergency:\/\/(.+)$/);
  return directMatch ? directMatch[1] : null;
}

function showLoading(message = 'Loading...') {
  profileCard.innerHTML = `<div class="loader">${message}</div>`;
}

function showError(message) {
  profileCard.innerHTML = `<div class="error">${message}</div>`;
}

async function fetchProfile(emergencyId) {
  try {
    const res = await fetch(`${BACKEND_BASE_URL}/api/emergency/${emergencyId}`);
    if (!res.ok) throw new Error('Profile not found');
    const data = await res.json();
    displayProfile(data);
  } catch (err) {
    showError(`Error fetching profile: ${err.message}`);
  }
}

function displayProfile(profile) {
  const { user, familyMembers = [], emergencyContacts = [] } = profile;
  profileCard.innerHTML = `
    <div class="profile-card">
      <h3>${user.name || 'Unknown Patient'}</h3>
      <div class="profile-info">
        <p><strong>Blood Group:</strong> ${user.bloodGroup || '—'}</p>
        <p><strong>Allergies:</strong> ${user.allergies?.join(', ') || 'None reported'}</p>
        <p><strong>Conditions:</strong> ${user.medicalConditions?.join(', ') || 'None reported'}</p>
      </div>
      ${familyMembers.length > 0 ? `
        <div class="section">
          <h4>Family Members</h4>
          <ul>${familyMembers.map(m => `<li>${m.name} (${m.relationship})</li>`).join('')}</ul>
        </div>` : ''}
      ${emergencyContacts.length > 0 ? `
        <div class="section">
          <h4>Emergency Contacts</h4>
          <ul>${emergencyContacts.map(c => `<li>${c.name}: <a href="tel:${c.phone}">${c.phone}</a></li>`).join('')}</ul>
        </div>` : ''}
    </div>
  `;
}