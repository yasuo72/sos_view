const BACKEND_BASE_URL = 'https://medassistbackend-production.up.railway.app';

// Ensure a hidden container exists for file-based QR scans.
// Html5Qrcode requires a valid DOM element id even when we only call `scanFile`,
// so we create (once) an off-screen div that will be reused for every
// image-upload decoding session.
(function ensureHiddenQrDiv() {
  if (!document.getElementById('qr-reader-temp')) {
    const hiddenDiv = document.createElement('div');
    hiddenDiv.id = 'qr-reader-temp';
    hiddenDiv.style.display = 'none';
    // It must be in the DOM *before* we instantiate Html5Qrcode.
    document.body.appendChild(hiddenDiv);
  }
})();

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
  const manualField = document.getElementById('manual-id');
  const manualBtn = document.getElementById('manual-fetch');
  // Face scan elements
  const faceScanBtn = document.getElementById('face-scan-btn');
  const faceModal = document.getElementById('face-modal');
  const faceVideo = document.getElementById('face-video');
  const captureFaceBtn = document.getElementById('capture-face');
  const closeFaceBtn = document.getElementById('close-face');
  const switchCameraBtn = document.getElementById('switch-camera');
  const faceStatus = document.getElementById('face-status');
  
  let faceStream = null;
  let currentFacingMode = 'user'; // 'user' for front camera, 'environment' for back

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

  // Attach upload handlers once library check passes
  if (uploadBtn && fileInput) {
    uploadBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      showProfileSection();
      showLoading('Scanning image...');
      try {
        // Pass the id of the hidden container created at start-up.
        const qrTemp = new Html5Qrcode("qr-reader-temp");
        const decodedText = await qrTemp.scanFile(file, true);
        await qrTemp.clear();
        console.log('Image QR decoded:', decodedText);
        const emergencyId = extractEmergencyId(decodedText);
        if (emergencyId) {
          fetchProfile(emergencyId);
        } else {
          showError('Invalid QR code in image');
        }
      } catch (imgErr) {
        console.error('Image scan error:', imgErr);
        showError('Could not read QR from image');
      } finally {
        e.target.value = '';
      }
    });
  }

  // Manual fetch handler
  if (manualBtn && manualField) {
    const triggerFetch = () => {
      const id = manualField.value.trim();
      if (id) {
        showProfileSection();
        showLoading('Fetching emergency information...');
        fetchProfile(id);
      }
    };
    manualBtn.addEventListener('click', triggerFetch);
    manualField.addEventListener('keyup', (e) => {
      if (e.key === 'Enter') triggerFetch();
    });
  }

    // ------- Face scan handlers -------
  async function openFaceModal() {
    faceModal.classList.remove('hidden');
    faceStatus.textContent = '';
    await startCamera('environment'); // Start with back camera by default
  }

  function closeFaceModal() {
    stopCamera();
    faceModal.classList.add('hidden');
  }

  async function stopCamera() {
    if (faceStream) {
      faceStream.getTracks().forEach(track => {
        track.stop();
      });
      faceStream = null;
    }
    if (faceVideo.srcObject) {
      faceVideo.srcObject = null;
    }
  }

  async function startCamera(facingMode) {
    try {
      // Stop any existing stream first
      await stopCamera();
      
      // Try to get the camera with the specified facing mode
      const constraints = {
        video: { 
          facingMode: { exact: facingMode },
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        },
        audio: false
      };

      faceStatus.textContent = 'Accessing camera...';
      faceStream = await navigator.mediaDevices.getUserMedia(constraints);
      
      // Update the current facing mode
      currentFacingMode = facingMode;
      
      // Set the video source
      faceVideo.srcObject = faceStream;
      faceVideo.play();
      
      // Clear any status message after a short delay
      setTimeout(() => {
        if (faceStatus.textContent === 'Accessing camera...') {
          faceStatus.textContent = '';
        }
      }, 1000);
      
      return true;
    } catch (err) {
      console.error('Camera error:', err);
      
      // If the requested camera fails, try the other one
      if (facingMode === 'environment') {
        faceStatus.textContent = 'Back camera not available, trying front camera...';
        return startCamera('user');
      } else if (facingMode === 'user') {
        faceStatus.textContent = 'Front camera not available, trying back camera...';
        return startCamera('environment');
      }
      
      faceStatus.textContent = 'Camera error: ' + (err.message || 'Could not access any camera');
      return false;
    }
  }
  
  async function switchCamera() {
    const newFacingMode = currentFacingMode === 'user' ? 'environment' : 'user';
    faceStatus.textContent = `Switching to ${newFacingMode === 'user' ? 'front' : 'back'} camera...`;
    await startCamera(newFacingMode);
  }

  async function captureAndIdentify() {
    if (!faceStream) {
      faceStatus.textContent = 'Camera not ready';
      return;
    }
    const track = faceStream.getVideoTracks()[0];
    const imageCapture = new ImageCapture(track);
    try {
      const bitmap = await imageCapture.grabFrame();
      // Draw to canvas
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(bitmap, 0, 0);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
      faceStatus.textContent = 'Identifying...';

      const resp = await fetch(`${BACKEND_BASE_URL}/api/face/identify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image_data: dataUrl })
      });
      const json = await resp.json();
      if (!resp.ok) throw new Error(json.error || 'Server error');

      if (json.match && json.profile) {
        closeFaceModal();
        showProfileSection();
        showLoading('Loading profile...');
        displayProfile({ user: json.profile });
      } else {
        faceStatus.textContent = 'No match found.';
      }
    } catch (err) {
      console.error('Face identify error:', err);
      faceStatus.textContent = 'Error: ' + err.message;
    }
  }

  // attach listeners
  if (faceScanBtn) faceScanBtn.addEventListener('click', openFaceModal);
  if (closeFaceBtn) closeFaceBtn.addEventListener('click', closeFaceModal);
  if (captureFaceBtn) captureFaceBtn.addEventListener('click', captureAndIdentify);
  if (switchCameraBtn) switchCameraBtn.addEventListener('click', switchCamera);

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

  // Try MedAssist+ compact format starting with V1:ID:<id>
  const v1Match = text.match(/V1:ID:([^,\n]+)/);
  if (v1Match) {
    console.log('Found emergency ID from V1 format:', v1Match[1]);
    return v1Match[1];
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

  // Treat plain alphanumeric strings (4-64 chars) as direct emergency ID
  if (text && /^[A-Za-z0-9_-]{4,64}$/.test(text)) {
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