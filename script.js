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
  console.log('Attempting to extract emergency ID from:', text);
  
  try {
    // First, try to parse as JSON (matches your backend QR format)
    const qrData = JSON.parse(text);
    console.log('Parsed QR data:', qrData);
    
    if (qrData.type === 'MEDICAL_PROFILE' && qrData.data && qrData.data.emergencyId) {
      console.log('Found structured QR data with emergency ID:', qrData.data.emergencyId);
      return qrData.data.emergencyId;
    }
    
    // Also check if emergencyId is at root level
    if (qrData.emergencyId) {
      console.log('Found emergency ID at root level:', qrData.emergencyId);
      return qrData.emergencyId;
    }
  } catch (e) {
    console.log('Not JSON format, trying other patterns');
  }

  // Try to extract ID from URL format (from emergencyUrl in QR)
  const urlMatch = text.match(/\/emergency\/view\/([^?&#]+)/);
  if (urlMatch) {
    console.log('Found emergency ID from URL:', urlMatch[1]);
    return urlMatch[1];
  }

  // Try direct emergency:// format
  const directMatch = text.match(/^emergency:\/\/(.+)$/);
  if (directMatch) {
    console.log('Found emergency ID from direct format:', directMatch[1]);
    return directMatch[1];
  }

  // Try if the text itself is just the ID
  if (text && text.length > 10 && text.length < 100 && !text.includes(' ')) {
    console.log('Treating text as direct emergency ID:', text);
    return text;
  }

  console.log('No emergency ID found in QR code');
  return null;
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

    // Try different possible endpoints
    const endpoints = [
      `/api/emergency/${emergencyId}`,
      `/api/users/emergency/${emergencyId}`,
      `/api/qr/emergency/${emergencyId}`,
      `/api/emergency/profile/${emergencyId}`
    ];

    let data = null;
    let lastError = null;

    for (const endpoint of endpoints) {
      try {
        const url = `${BACKEND_BASE_URL}${endpoint}?nocache=${Date.now()}`;
        console.log('Trying endpoint:', url);

        const res = await fetch(url, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          }
        });

        console.log(`Response from ${endpoint}:`, res.status);

        if (res.ok) {
          data = await res.json();
          console.log('Success! Received data from:', endpoint, data);
          break;
        } else {
          const errorText = await res.text();
          console.log(`${endpoint} failed:`, res.status, errorText);
          lastError = `${endpoint}: ${res.status} ${errorText}`;
        }
      } catch (fetchErr) {
        console.log(`${endpoint} error:`, fetchErr);
        lastError = `${endpoint}: ${fetchErr.message}`;
        continue;
      }
    }

    if (!data) {
      throw new Error(`All endpoints failed. Last error: ${lastError}`);
    }

    // Handle different possible data structures
    if (data.user) {
      displayProfile(data);
    } else if (data.emergencyId || data.bloodGroup || data.name) {
      // Data might be directly the user object
      displayProfile({ user: data });
    } else {
      console.error('Unexpected data structure:', data);
      throw new Error('Invalid profile data structure');
    }

  } catch (err) {
    console.error('Error in fetchProfile:', err);
    showError(`Error fetching profile: ${err.message}. Check console for details.`);
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
  const allergies = userData.allergies || userData.allergy || userData.currentMedications || [];
  const conditions = userData.medicalConditions || userData.medical_conditions || userData.conditions || [];
  const medications = userData.currentMedications || userData.medications || [];
  const emergencyContactsList = emergencyContacts.length > 0 ? emergencyContacts : (userData.emergencyContacts || []);
  
  console.log('Extracted data:', { 
    name: userData.name || userData.fullName,
    bloodGroup, 
    allergies, 
    conditions, 
    medications,
    emergencyContacts: emergencyContactsList
  });

  profileContainer.innerHTML = `
    <div id="profile-card" class="profile-card">
      <h3>${userData.name || userData.fullName || 'Emergency Contact'}</h3>
      <div class="profile-info">
        <p><strong>Blood Group:</strong> ${bloodGroup}</p>
        <p><strong>Allergies:</strong> ${Array.isArray(allergies) ? allergies.join(', ') : (allergies || 'None reported')}</p>
        <p><strong>Medical Conditions:</strong> ${Array.isArray(conditions) ? conditions.join(', ') : (conditions || 'None reported')}</p>
        ${medications.length > 0 ? `<p><strong>Current Medications:</strong> ${Array.isArray(medications) ? medications.join(', ') : medications}</p>` : ''}
      </div>
      ${familyMembers.length > 0 ? `
        <div class="section">
          <h4>Family Members</h4>
          <ul>${familyMembers.map(m => `<li>${m.name} (${m.relationship})</li>`).join('')}</ul>
        </div>` : ''}
      ${emergencyContactsList.length > 0 ? `
        <div class="section">
          <h4>Emergency Contacts</h4>
          <ul>${emergencyContactsList.map(c => `<li>${c.name}: <a href="tel:${c.phone}">${c.phone}</a></li>`).join('')}</ul>
        </div>` : ''}
      <div class="debug-section" style="margin-top: 1rem; padding: 0.5rem; background: #f0f0f0; border-radius: 4px; font-size: 0.8rem;">
        <strong>Debug Info:</strong> Emergency ID: ${userData.emergencyId || 'Not found'}
      </div>
    </div>
  `;
}