/* eslint-env browser */

// ---------------- Config -----------------
// Change this to your deployed backend base URL (no trailing slash)
const BACKEND_BASE_URL = 'https://medassistbackend-production.up.railway.app';
// -----------------------------------------

const qrRegionId = 'qr-reader';
const profileSection = document.getElementById('profile-section');
const profileContainer = document.getElementById('profile-container');
const scanAgainBtn = document.getElementById('scan-again');
const scannerSection = document.getElementById('scanner-section');
let html5QrCode;

function extractEmergencyId(text) {
  // Example QR content: https://domain/emergency/view/<id>
  const match = text.match(/\/emergency\/view\/([A-Za-z0-9_-]+)/);
  if (match) return match[1];
  // Fallback: if the whole text is just the id
  return text.trim();
}

async function fetchProfile(emergencyId) {
  const res = await fetch(`${BACKEND_BASE_URL}/api/emergency/${emergencyId}`);
  if (!res.ok) throw new Error('Profile not found');
  return res.json();
}

function renderCard(title, html) {
  const card = document.createElement('div');
  card.className = 'card';
  if (title) card.innerHTML = `<h3>${title}</h3>`;
  const div = document.createElement('div');
  div.innerHTML = html;
  card.appendChild(div);
  return card;
}

function renderProfile(data) {
  profileContainer.innerHTML = '';
  const { user, familyMembers = [], emergencyContacts = [] } = data;
  // Patient basics
  profileContainer.appendChild(
    renderCard(
      'Basic Info',
      `<p><strong>Name:</strong> ${user.name || 'Unknown'}</p>
       <p><strong>Blood Group:</strong> ${user.bloodGroup || '—'}</p>
       <p><strong>Allergies:</strong> ${user.allergies?.join(', ') || 'None'}</p>
       <p><strong>Conditions:</strong> ${user.medicalConditions?.join(', ') || 'None'}</p>`
    )
  );

  if (familyMembers.length) {
    const list = familyMembers.map(
      m => `<li>${m.name} (${m.relationship})</li>`
    ).join('');
    profileContainer.appendChild(renderCard('Family Members', `<ul>${list}</ul>`));
  }

  if (emergencyContacts.length) {
    const list = emergencyContacts.map(
      c => `<li>${c.name}: <a href="tel:${c.phone}">${c.phone}</a></li>`
    ).join('');
    profileContainer.appendChild(renderCard('Emergency Contacts', `<ul>${list}</ul>`));
  }
}

function startScanner() {
  html5QrCode = new Html5Qrcode(qrRegionId);
  const config = { fps: 10, qrbox: 250 };
  html5QrCode.start(
    { facingMode: 'environment' },
    config,
    async decodedText => {
      try {
        await html5QrCode.stop();
      } catch (_) {}
      scannerSection.classList.add('hidden');
      profileSection.classList.remove('hidden');
      profileContainer.innerHTML = '<p class="card">Fetching profile…</p>';
      try {
        const emergencyId = extractEmergencyId(decodedText);
        const data = await fetchProfile(emergencyId);
        renderProfile(data);
      } catch (err) {
        profileContainer.innerHTML = `<p class="error">${err.message}</p>`;
      }
    },
    err => {
      // console.log('QR scan error', err);
    }
  ).catch(err => {
    document.getElementById(qrRegionId).innerHTML = `<p class="error">Camera error: ${err}</p>`;
  });
}

scanAgainBtn.addEventListener('click', () => {
  profileSection.classList.add('hidden');
  scannerSection.classList.remove('hidden');
  startScanner();
});

// Kick off
startScanner();
