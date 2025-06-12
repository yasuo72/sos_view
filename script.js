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
      cameraAccessBtn.addEventListener('click', async () => {
    // Request camera permissions first
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      stream.getTracks().forEach(track => track.stop());
      startScanner();
    } catch (permError) {
      console.error('Camera permission error:', permError);
      showError('Camera permission denied. Please allow camera access and refresh the page.');
    }
  });
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
      try {
        await html5QrCode.stop();
        html5QrCode.clear();
      } catch (stopError) {
        console.log('Error stopping previous scanner:', stopError);
      }
      html5QrCode = null;
    }

    html5QrCode = new Html5Qrcode("qr-reader");

    const qrCodeSuccessCallback = (decodedText, decodedResult) => {
      console.log('QR Code scanned:', decodedText);
      const emergencyId = extractEmergencyId(decodedText);
      if (emergencyId) {
        html5QrCode.stop().catch(console.error);
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

    // Get available cameras first
    const cameras = await Html5Qrcode.getCameras();
    if (cameras && cameras.length === 0) {
      throw new Error('No cameras found on this device');
    }

    console.log('Available cameras:', cameras);

    // Try different camera approaches
    let cameraStarted = false;
    const cameraOptions = [
      { facingMode: "environment" },
      { facingMode: "user" },
      cameras?.[0]?.id ? cameras[0].id : null
    ].filter(Boolean);

    for (const cameraOption of cameraOptions) {
      try {
        console.log('Trying camera option:', cameraOption);
        await html5QrCode.start(
          cameraOption, 
          config, 
          qrCodeSuccessCallback,
          qrCodeErrorCallback
        );
        cameraStarted = true;
        console.log('Camera started successfully with option:', cameraOption);
        break;
      } catch (cameraError) {
        console.log('Camera option failed:', cameraOption, cameraError);
        continue;
      }
    }

    if (!cameraStarted) {
      throw new Error('Unable to start any camera');
    }

    cameraAccessBtn.textContent = 'Camera Active';
    cameraAccessBtn.disabled = true;

  } catch (err) {
    console.error('Error starting scanner:', err);
    let errorMessage = 'Unable to access camera. ';
    
    if (err.message.includes('NotAllowedError') || err.message.includes('Permission')) {
      errorMessage += 'Please allow camera permissions and try again.';
    } else if (err.message.includes('NotFoundError') || err.message.includes('No cameras')) {
      errorMessage += 'No camera found on this device.';
    } else if (err.message.includes('NotReadableError')) {
      errorMessage += 'Camera is being used by another application.';
    } else {
      errorMessage += 'Please check camera permissions and try again.';
    }
    
    showError(errorMessage);
    cameraAccessBtn.textContent = 'Retry Camera Access';
    cameraAccessBtn.disabled = false;
  }
}

function extractEmergencyId(text) {
  try {
    // First, try to parse as JSON (matches your backend QR format)
    const qrData = JSON.parse(text);
    if (qrData.type === 'MEDICAL_PROFILE' && qrData.data && qrData.data.emergencyId) {
      console.log('Found structured QR data:', qrData);
      return qrData.data.emergencyId;
    }
  } catch (e) {
    // Not JSON, try other formats
  }

  // Try to extract ID from URL format
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
    console.log('Fetching profile for emergency ID:', emergencyId);

    // Add cache busting parameter
    const url = `${BACKEND_BASE_URL}/api/emergency/${emergencyId}?nocache=${Date.now()}`;
    console.log('Fetching from URL:', url);

    const res = await fetch(url);
    console.log('Response status:', res.status);

    if (!res.ok) {
      console.error('Response not OK:', res.status, await res.text());
      throw new Error('Profile not found');
    }

    const data = await res.json();
    console.log('Received profile data:', data);

    if (!data || !data.user) {
      console.error('Invalid profile data received:', data);
      throw new Error('Invalid profile data');
    }

    displayProfile(data);
  } catch (err) {
    console.error('Error in fetchProfile:', err);
    showError(`Error fetching profile: ${err.message}`);
  }
}

function displayProfile(profile) {
  console.log('Full profile data:', JSON.stringify(profile, null, 2));
  
  const { user, familyMembers = [], emergencyContacts = [] } = profile;
  const profileContainer = document.querySelector('.profile-container');

  if (!profileContainer) {
    console.error('Profile container not found');
    return;
  }

  // Handle nested user properties - check multiple possible data structures
  const userData = user || profile; // Fallback to profile if user is not nested
  const bloodGroup = userData.bloodGroup || userData.blood_group || userData.bloodType || '—';
  const allergies = userData.allergies || userData.allergy || [];
  const conditions = userData.medicalConditions || userData.medical_conditions || userData.conditions || [];
  
  console.log('Extracted data:', { bloodGroup, allergies, conditions });

  profileContainer.innerHTML = `
    <div id="profile-card" class="profile-card">
      <h3>${userData.name || userData.fullName || 'Unknown Patient'}</h3>
      <div class="profile-info">
        <p><strong>Blood Group:</strong> ${bloodGroup}</p>
        <p><strong>Allergies:</strong> ${Array.isArray(allergies) ? allergies.join(', ') : (allergies || 'None reported')}</p>
        <p><strong>Conditions:</strong> ${Array.isArray(conditions) ? conditions.join(', ') : (conditions || 'None reported')}</p>
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