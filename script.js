const BACKEND_BASE_URL = 'https://medassistbackend-production.up.railway.app';

let qrRegionId = null;
let profileSection = null;
let profileCard = null;
let scanAgainBtn = null;
let scannerSection = null;
let cameraAccessBtn = null;
let html5QrCode = null;
let uploadBtn = null;
let fileInput = null;

document.addEventListener('DOMContentLoaded', async () => {
  qrRegionId = document.getElementById('qr-reader');
  profileSection = document.getElementById('profile-section');
  profileCard = document.getElementById('profile-card');
  scanAgainBtn = document.getElementById('scan-again');
  scannerSection = document.getElementById('scanner-section');
  cameraAccessBtn = document.getElementById('camera-access-btn');
  uploadBtn = document.getElementById('upload-btn');
  fileInput = document.getElementById('file-input');

  // Attach upload events once
  if (uploadBtn && fileInput) {
    uploadBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        showProfileSection();
        showLoading('Scanning image...');
        scanImageFile(file);
        e.target.value = '';
      }
    });
  }

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

    // Optimised scanner configuration for faster & more precise detection
    const viewportW = Math.min(window.innerWidth, 600);
    const config = {
      fps: 30, // higher frame rate
      qrbox: viewportW * 0.8, // dynamic box uses 80% of viewport width
      aspectRatio: 1.0,
      disableFlip: true, // assume rear camera, skip mirror transform for speed
      rememberLastUsedCamera: true,
      experimentalFeatures: {
        useBarCodeDetectorIfSupported: true
      },
      formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
      videoConstraints: {
        facingMode: { ideal: "environment" },
        width: { ideal: 1920 },
        height: { ideal: 1080 },
        advanced: [
          { focusMode: "continuous" }, // continuous autofocus (where supported)
          { zoom: 2 } // attempt 2x digital zoom for distant codes
        ]
      }
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
      `/api/emergency/profile/${emergencyId}`,
      `/api/users/${emergencyId}`,
      `/emergency/${emergencyId}`
    ];

    let data = null;
    let successEndpoint = null;
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
          const responseText = await res.text();
          console.log('Raw response:', responseText);
          
          try {
            data = JSON.parse(responseText);
            successEndpoint = endpoint;
            console.log('Success! Received data from:', endpoint, data);
            break;
          } catch (parseErr) {
            console.log('JSON parse error:', parseErr);
            lastError = `${endpoint}: Invalid JSON response`;
            continue;
          }
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
      showError(`Could not fetch profile data. Emergency ID: ${emergencyId}. Last error: ${lastError}`);
      return;
    }

    console.log('Full API response:', JSON.stringify(data, null, 2));

    // Handle different possible data structures
    if (data.success === false || data.error) {
      throw new Error(data.message || data.error || 'API returned error');
    }

    // Try to find user data in different structures
    let userData = null;
    if (data.user) {
      userData = data.user;
    } else if (data.data && data.data.user) {
      userData = data.data.user;
    } else if (data.profile) {
      userData = data.profile;
    } else if (data.name || data.bloodGroup || data.emergencyId) {
      userData = data;
    } else if (Array.isArray(data) && data.length > 0) {
      userData = data[0];
    }

    if (!userData) {
      console.error('Could not extract user data from response:', data);
      showError(`Profile data found but in unexpected format. Using endpoint: ${successEndpoint}`);
      return;
    }

    displayProfile({ user: userData, ...data });

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
  
  // More comprehensive field mapping
  const name = userData.name || userData.fullName || userData.firstName || userData.username || 'Emergency Contact';
  const bloodGroup = userData.bloodGroup || userData.blood_group || userData.bloodType || userData.blood || '—';
  
  // Handle allergies in different formats
  let allergies = userData.allergies || userData.allergy || userData.allergiesList || [];
  if (typeof allergies === 'string') {
    allergies = allergies.split(',').map(a => a.trim()).filter(a => a);
  }
  
  // Handle medical conditions
  let conditions = userData.medicalConditions || userData.medical_conditions || userData.conditions || userData.medicalHistory || [];
  if (typeof conditions === 'string') {
    conditions = conditions.split(',').map(c => c.trim()).filter(c => c);
  }
  
  // Handle medications
  let medications = userData.currentMedications || userData.medications || userData.drugs || [];
  if (typeof medications === 'string') {
    medications = medications.split(',').map(m => m.trim()).filter(m => m);
  }
  
  // Handle emergency contacts
  const emergencyContactsList = emergencyContacts.length > 0 ? emergencyContacts : (userData.emergencyContacts || userData.contacts || []);
  
  // Additional fields that might be useful
  const age = userData.age || userData.dateOfBirth || '';
  const phone = userData.phone || userData.phoneNumber || userData.mobile || '';
  const email = userData.email || userData.emailAddress || '';
  
  console.log('Extracted data:', { 
    name, bloodGroup, allergies, conditions, medications, emergencyContacts: emergencyContactsList, age, phone, email
  });

  // Show all available data for debugging
  const allFields = Object.keys(userData).map(key => `${key}: ${JSON.stringify(userData[key])}`).join('<br>');

  profileContainer.innerHTML = `
    <div id="profile-card" class="profile-card">
      <h3>${name}</h3>
      <div class="profile-info">
        ${age ? `<p><strong>Age:</strong> ${age}</p>` : ''}
        ${phone ? `<p><strong>Phone:</strong> <a href="tel:${phone}">${phone}</a></p>` : ''}
        ${email ? `<p><strong>Email:</strong> ${email}</p>` : ''}
        <p><strong>Blood Group:</strong> ${bloodGroup}</p>
        <p><strong>Allergies:</strong> ${Array.isArray(allergies) && allergies.length > 0 ? allergies.join(', ') : (allergies || 'None reported')}</p>
        <p><strong>Medical Conditions:</strong> ${Array.isArray(conditions) && conditions.length > 0 ? conditions.join(', ') : (conditions || 'None reported')}</p>
        ${Array.isArray(medications) && medications.length > 0 ? `<p><strong>Current Medications:</strong> ${medications.join(', ')}</p>` : ''}
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
      <div class="debug-section">
        <strong>Debug Info:</strong><br>
        Emergency ID: ${userData.emergencyId || userData.id || 'Not found'}<br>
        <details>
          <summary>All Available Fields</summary>
          <div style="font-size: 0.7rem; margin-top: 0.5rem; max-height: 200px; overflow-y: auto;">
            ${allFields}
          </div>
        </details>
      </div>
    </div>
  `;
}

// === Image Upload QR Scanning ===
async function scanImageFile(file) {
  try {
    const qr = new Html5Qrcode("qr-reader");
    const decodedText = await qr.scanFile(file, false);
    console.log('Decoded from image:', decodedText);

    const emergencyId = extractEmergencyId(decodedText);
    if (emergencyId) {
      showLoading('Fetching emergency information...');
      fetchProfile(emergencyId);
      return;
    }

    // Could extend to other QR formats (e.g., email|token) here
    showError('Invalid or unsupported QR code in image.');
  } catch (err) {
    console.error('scanImageFile error:', err);
    showError('Unable to decode QR code from image.');
  }
}