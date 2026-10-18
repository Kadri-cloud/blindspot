const $ = s => document.querySelector(s);
const isVideo = it => it.type.startsWith('video');
const status = t => { $('#status').textContent = t; };
const monthOf = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' });
let items = [], cur = -1;

// Tiles only start decrypting when scrolled near view.
// ponytail: tiles decode full-size files; add encrypted thumbnails if the grid gets slow past ~1000 items
const io = new IntersectionObserver(entries => entries.forEach(e => {
  if (e.isIntersecting) { e.target.src = e.target.dataset.src; io.unobserve(e.target); }
}), { rootMargin: '800px' });

async function init() {
  const s = await api.state();
  if (s.unlocked) return showGallery();
  $('#lock').hidden = false;
  if (!s.exists) {
    $('#lockHint').textContent = "Choose a password. If you forget it, nothing inside can be recovered.";
    $('#pw2').hidden = false;
    $('#unlockBtn').textContent = 'Create locker';
  }
  $('#pw').focus();
}

$('#lockForm').onsubmit = async e => {
  e.preventDefault();
  const pw = $('#pw').value, msg = $('#lockError');
  if (!pw) return;
  if (!$('#pw2').hidden && pw !== $('#pw2').value) return (msg.textContent = "Passwords don't match");
  msg.textContent = 'Unlocking…';
  const r = await api.unlock(pw);
  if (r.error) { msg.textContent = r.error; $('#pw').select(); return; }
  $('#lock').hidden = true;
  showGallery();
};

async function showGallery() {
  items = (await api.list()).sort((a, b) => b.date - a.date);
  $('#gallery').hidden = false;
  $('#empty').hidden = items.length > 0;
  const grid = $('#grid');
  grid.replaceChildren();
  let month;
  items.forEach((it, i) => {
    if (monthOf.format(it.date) !== month) {
      month = monthOf.format(it.date);
      grid.append(Object.assign(document.createElement('h2'), { textContent: month }));
    }
    const tile = Object.assign(document.createElement('button'), { className: 'tile', onclick: () => openViewer(i) });
    tile.dataset.name = it.name;
    const media = document.createElement(isVideo(it) ? 'video' : 'img');
    media.dataset.src = `vault://${it.id}` + (isVideo(it) ? '#t=0.5' : '');
    if (isVideo(it)) { media.muted = true; media.preload = 'metadata'; tile.classList.add('video'); }
    media.onerror = () => tile.classList.add('broken');
    tile.append(media);
    grid.append(tile);
    io.observe(media);
  });
}

function openViewer(i) {
  cur = i;
  const it = items[i], stage = $('#stage');
  const media = document.createElement(isVideo(it) ? 'video' : 'img');
  if (isVideo(it)) { media.controls = true; media.autoplay = true; }
  media.onerror = () => stage.replaceChildren(Object.assign(document.createElement('p'), { textContent: "This file can't be previewed here. Export it to open it." }));
  media.src = `vault://${it.id}`;
  stage.replaceChildren(media);
  $('#vName').textContent = `${it.name} · ${new Date(it.date).toLocaleDateString()}`;
  $('#viewer').hidden = false;
}

function closeViewer() {
  $('#stage').replaceChildren();
  $('#viewer').hidden = true;
  cur = -1;
}

const step = d => cur >= 0 && openViewer((cur + d + items.length) % items.length);

async function importFiles(paths) {
  $('#addBtn').disabled = true;
  status('Moving files in…');
  const r = await api.import(paths);
  $('#addBtn').disabled = false;
  status(r.failed.length ? `Added ${r.added}. Couldn't add ${r.failed.join('; ')}` : r.added ? `Added ${r.added}` : '');
  showGallery();
}

$('#addBtn').onclick = () => importFiles();
$('#lockBtn').onclick = () => api.lock();
$('#vClose').onclick = closeViewer;
$('.prev').onclick = () => step(-1);
$('.next').onclick = () => step(1);

$('#vExport').onclick = async () => {
  if (await api.export(items[cur].id)) status(`Exported ${items[cur].name}`);
};

$('#vDelete').onclick = async () => {
  if (!confirm(`Delete ${items[cur].name} forever?`)) return;
  await api.remove(items[cur].id);
  closeViewer();
  showGallery();
};

addEventListener('keydown', e => {
  if (cur < 0) return;
  if (e.key === 'Escape') closeViewer();
  if (e.key === 'ArrowLeft') step(-1);
  if (e.key === 'ArrowRight') step(1);
});

addEventListener('dragover', e => { e.preventDefault(); if (!$('#gallery').hidden) $('#drop').hidden = false; });
$('#drop').ondragleave = () => { $('#drop').hidden = true; };
addEventListener('drop', e => {
  e.preventDefault();
  $('#drop').hidden = true;
  if ($('#gallery').hidden) return;
  const paths = [...e.dataTransfer.files].map(api.pathOf).filter(Boolean);
  if (paths.length) importFiles(paths);
});

init();
