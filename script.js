/* eslint-env browser */

// ---------------- Config -----------------
// Change this to your deployed backend base URL (no trailing slash)
const BACKEND_BASE_URL = 'https://medassistbackend-production.up.railway.app';
// -----------------------------------------

// DOM Elements
let qrRegionId = null;
let profileSection = null;
let profileCard = null;
let scanAgainBtn = null;
let scannerSection = null;
let cameraAccessBtn = null;
let html5QrCode = null;

// Initialize DOM elements
function initializeDOMElements() {
  qrRegionId = document.getElementById('qr-reader');
  profileSection = document.getElementById('profile-section');
  profileCard = document.getElementById('profile-card');
  scanAgainBtn = document.getElementById('scan-again');
  scannerSection = document.getElementById('scanner-section');
  cameraAccessBtn = document.getElementById('camera-access-btn');

  if (!qrRegionId || !profileSection || !profileCard || !scanAgainBtn || !scannerSection || !cameraAccessBtn) {
    console.error('One or more required DOM elements not found');
    return false;
  }
  return true;
}

// Show loading state
function showLoading(message = 'Loading...') {
  profileCard.innerHTML = `
    <div class="loader">${message}</div>
  `;
}

// Show error state
function showError(message) {
  profileCard.innerHTML = `
    <div class="error">
      <p>${message}</p>
      <button onclick="window.location.reload()">Try Again</button>
    </div>
  `;
}

// Initialize QR scanner when page loads
document.addEventListener('DOMContentLoaded', async () => {
  try {
    // Initialize DOM elements
    if (!initializeDOMElements()) {
      showError('Error initializing the viewer. Please refresh the page.');
      return;
    }

    // Request camera permission immediately
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
    // Create a temporary video element to check if camera is accessible
    const video = document.createElement('video');
    video.srcObject = stream;
    video.play();
    // Clean up
    video.srcObject = null;
    stream.getTracks().forEach(track => track.stop());

    // Initialize QR scanner
    html5QrCode = new Html5QrCode();
    
    // Start scanner immediately
    startScanner();
  } catch (err) {
    console.error('Camera permission error:', err);
    if (err.name === 'NotAllowedError') {
      showError('Camera access denied. Please grant camera permission in your browser settings.');
    } else if (err.name === 'NotFoundError') {
      showError('No camera found. Please connect a camera device.');
    } else {
      showError('Unable to access camera. Please try again.');
    }
  }
});

// Initialize scan again button
if (scanAgainBtn) {
  scanAgainBtn.addEventListener('click', () => {
    try {
      showScannerSection();
      startScanner();
    } catch (err) {
      console.error('Error restarting scanner:', err);
      showError('Error restarting scanner. Please try again.');
    }
  });
}

function extractEmergencyId(text) {
  // QR code format: emergency://<emergencyId>
  const match = text.match(/^emergency:\/\/(.+)$/);
  return match ? match[1] : null;
}

async function startScanner() {
  try {
    if (!qrRegionId) {
      throw new Error('QR reader element not found');
    }

    // Clean up any existing scanner
    if (html5QrCode) {
      try {
        await html5QrCode.stop();
      } catch (e) {
        console.error('Error stopping previous scanner:', e);
      }
    }

    // Initialize new scanner
    html5QrCode = new Html5Qrcode(qrRegionId);
    
    const config = {
      fps: 10,
      qrbox: { width: 250, height: 250 },
      aspectRatio: 1,
      qrboxStyle: {
        borderColor: '#007991',
        borderWidth: 2
      },
      scannerStyle: {
        borderRadius: '12px',
        border: '4px solid #007991'
      }
    };

    const qrCodeSuccessCallback = (decodedText, decodedResult) => {
      const emergencyId = extractEmergencyId(decodedText);
      if (emergencyId) {
        try {
          showProfileSection();
          showLoading('Fetching profile...');
          fetchProfile(emergencyId);
        } catch (err) {
          console.error('Error after successful scan:', err);
          showError('Error processing scan. Please try again.');
        }
      }
    };

    const qrCodeFailureCallback = (err) => {
      console.error('QR code scan error:', err);
      showError('Error scanning QR code. Please try again.');
    };

    // Start scanning
    await html5QrCode.start({
      facingMode: "environment"
    }, config, qrCodeSuccessCallback, qrCodeFailureCallback);

    // Update UI
    showLoading('Scanner ready. Point your camera at the QR code.');
  } catch (err) {
    console.error('Error starting scanner:', err);
    showError(`Error starting scanner: ${err.message}. Please try again.`);
  }
}

function showProfileSection() {
  scannerSection.classList.add('hidden');
  profileSection.classList.remove('hidden');
}

function showScannerSection() {
  scannerSection.classList.remove('hidden');
  profileSection.classList.add('hidden');
}

async function fetchProfile(emergencyId) {
  try {
    const response = await fetch(`${BACKEND_BASE_URL}/api/emergency/${emergencyId}`);
    if (!response.ok) {
      throw new Error('Profile not found');
    }
    const data = await response.json();
    displayProfile(data);
  } catch (err) {
    console.error('Error fetching profile:', err);
    profileContainer.innerHTML = `
      <div class="error">
        <p>Error loading profile: ${err.message}</p>
        <button onclick="showScannerSection(); startScanner();">Try Again</button>
      </div>
    `;
  }
}

function displayProfile(profile) {
  const { user, familyMembers = [], emergencyContacts = [] } = profile;
  
  profileContainer.innerHTML = `
    <div class="profile-card">
      <h3>${user.name || 'Unknown Patient'}</h3>
      <div class="profile-info">
        <p><strong>Blood Group:</strong> ${user.bloodGroup || '—'}</p>
        <p><strong>Allergies:</strong> ${user.allergies && user.allergies.length ? user.allergies.join(', ') : 'None reported'}</p>
        <p><strong>Conditions:</strong> ${user.medicalConditions && user.medicalConditions.length ? user.medicalConditions.join(', ') : 'None reported'}</p>
      </div>
      
      ${familyMembers.length > 0 ? `
        <div class="section">
          <h4>Family Members</h4>
          <ul>
            ${familyMembers.map(member => `
              <li>${member.name} (${member.relationship})</li>
            `).join('')}
          </ul>
        </div>
      ` : ''}
      
      ${emergencyContacts.length > 0 ? `
        <div class="section">
          <h4>Emergency Contacts</h4>
          <ul>
            ${emergencyContacts.map(contact => `
              <li>${contact.name}: <a href="tel:${contact.phone}">${contact.phone}</a></li>
            `).join('')}
          </ul>
        </div>
      ` : ''}
    </div>
  `;
}

// Event listener for scan again button
scanAgainBtn.addEventListener('click', () => {
  showScannerSection();
  startScanner();
});

// Handle camera permission
window.addEventListener('error', (event) => {
  if (event.message.includes('Permission denied')) {
    alert('Camera access is required to scan QR codes. Please grant permission.');
  }
});

// Kick off
startScanner();
