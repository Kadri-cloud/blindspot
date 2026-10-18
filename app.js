const $ = s => document.querySelector(s);
const el = (tag, props = {}, ...kids) => { const e = Object.assign(document.createElement(tag), props); e.append(...kids); return e; };
const isVideo = it => it.type.startsWith('video');
const isNote = it => it.type === 'text/plain';
const status = t => { $('#status').textContent = t; };
const monthOf = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' });

let all = [], folders = [], folder = null; // folder: the one open in the sidebar, null = All items
let view = [], cur = -1, note = null, dirty = false;

// Tiles only start decrypting when scrolled near view.
// ponytail: tiles decode full-size files; add encrypted thumbnails if the grid gets slow past ~1000 items
const io = new IntersectionObserver(entries => entries.forEach(e => {
  if (e.isIntersecting) { e.target.src = e.target.dataset.src; io.unobserve(e.target); }
}), { rootMargin: '800px' });

async function init() {
  const s = await api.state();
  if (s.unlocked) return refresh();
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
  refresh();
};

async function refresh() {
  ({ items: all, folders } = await api.list());
  all.sort((a, b) => b.date - a.date);
  if (folder && !folders.includes(folder)) folder = null;
  view = folder ? all.filter(it => it.folder === folder) : all;
  $('#gallery').hidden = false;
  renderFolders();
  renderGrid();
}

function renderFolders() {
  const row = (name, count) => {
    const b = el('button', { className: 'folder' + (folder === name ? ' active' : ''), onclick: () => { folder = name; refresh(); } },
      el('span', { textContent: name ?? 'All items' }), el('span', { className: 'count', textContent: count }));
    b.ondragover = e => { e.preventDefault(); b.classList.add('over'); };
    b.ondragleave = () => b.classList.remove('over');
    b.ondrop = e => { e.preventDefault(); e.stopPropagation(); b.classList.remove('over'); dropOn(e, name); };
    const r = el('div', { className: 'row' }, b);
    if (name) r.append(el('button', { className: 'x', textContent: '×', title: 'Delete folder', ariaLabel: `Delete folder ${name}`, onclick: () => removeFolder(name) }));
    return r;
  };
  $('#folders').replaceChildren(row(null, all.length), ...folders.map(f => row(f, all.filter(it => it.folder === f).length)));
  $('#title').textContent = folder ?? 'All items';
}

function renderGrid() {
  $('#empty').hidden = view.length > 0;
  $('#empty').textContent = folder
    ? 'This folder is empty. Drag items onto it in the sidebar, or add files while it is open.'
    : "Drag photos and videos here, or click Add. They're moved in and encrypted, and the originals are deleted from where they were.";
  const grid = $('#grid');
  grid.replaceChildren();
  let month;
  view.forEach((it, i) => {
    if (monthOf.format(it.date) !== month) grid.append(el('h2', { textContent: month = monthOf.format(it.date) }));
    const tile = el('button', { className: 'tile', draggable: true, onclick: () => openViewer(i) });
    tile.dataset.name = it.name;
    tile.ondragstart = e => e.dataTransfer.setData('text/x-locker', it.id);
    if (isNote(it)) {
      tile.classList.add('note');
      tile.append(el('b', { textContent: it.name || 'Untitled note' }), el('span', { textContent: it.text.slice(0, 300) }));
    } else {
      const media = el(isVideo(it) ? 'video' : 'img');
      media.dataset.src = `vault://${it.id}` + (isVideo(it) ? '#t=0.5' : '');
      if (isVideo(it)) { media.muted = true; media.preload = 'metadata'; tile.classList.add('video'); }
      media.onerror = () => tile.classList.add('broken');
      tile.append(media);
      io.observe(media);
    }
    grid.append(tile);
  });
}

async function dropOn(e, name) {
  const id = e.dataTransfer.getData('text/x-locker');
  if (id) { await api.update(id, { folder: name }); return refresh(); }
  const paths = [...e.dataTransfer.files].map(api.pathOf).filter(Boolean);
  if (paths.length) importFiles(paths, name);
}

async function removeFolder(name) {
  if (!confirm(`Delete the folder "${name}"? Everything in it stays in All items.`)) return;
  await api.removeFolder(name);
  refresh();
}

$('#folderForm').onsubmit = async e => {
  e.preventDefault();
  const name = $('#folderName').value.trim();
  if (!name) return;
  await api.addFolder(name);
  $('#folderName').value = '';
  folder = name;
  refresh();
};

function openViewer(i) {
  cur = i;
  const it = view[i], stage = $('#stage'), date = new Date(it.date).toLocaleDateString();
  note = null;
  if (isNote(it)) {
    const title = el('input', { className: 'noteTitle', placeholder: 'Title', value: it.name, ariaLabel: 'Title' });
    const text = el('textarea', { placeholder: 'Write something only you can read…', value: it.text, ariaLabel: 'Note' });
    note = { it, title, text };
    stage.replaceChildren(el('div', { className: 'editor' }, title, text));
  } else {
    const media = el(isVideo(it) ? 'video' : 'img');
    if (isVideo(it)) { media.controls = true; media.autoplay = true; }
    media.onerror = () => stage.replaceChildren(el('p', { textContent: "This file can't be previewed here. Export it to open it." }));
    media.src = `vault://${it.id}`;
    stage.replaceChildren(media);
  }
  $('#vName').textContent = isNote(it) ? date : `${it.name} · ${date}`;
  $('#vFolder').replaceChildren(el('option', { value: '', textContent: 'No folder' }), ...folders.map(f => el('option', { value: f, textContent: f })));
  $('#vFolder').value = it.folder || '';
  $('#viewer').hidden = false;
  if (note) (it.name ? note.text : note.title).focus();
}

async function saveNote() {
  if (!note) return;
  const { it, title, text } = note;
  if (title.value === it.name && text.value === it.text) return;
  Object.assign(it, { name: title.value, text: text.value });
  await api.update(it.id, { name: it.name, text: it.text });
  dirty = true;
}

async function closeViewer() {
  await saveNote();
  if (note && !note.it.name.trim() && !note.it.text.trim()) { await api.remove(note.it.id); dirty = true; }
  note = null;
  $('#stage').replaceChildren();
  $('#viewer').hidden = true;
  cur = -1;
  if (dirty) { dirty = false; refresh(); }
}

async function step(d) {
  if (cur < 0) return;
  await saveNote();
  openViewer((cur + d + view.length) % view.length);
}

async function importFiles(paths, into = folder) {
  $('#addBtn').disabled = true;
  status('Moving files in…');
  const r = await api.import(paths, into);
  $('#addBtn').disabled = false;
  status(r.failed.length ? `Added ${r.added}. Couldn't add ${r.failed.join('; ')}` : r.added ? `Added ${r.added}` : '');
  refresh();
}

$('#addBtn').onclick = () => importFiles();
$('#lockBtn').onclick = () => api.lock();
$('#vClose').onclick = closeViewer;
$('.prev').onclick = () => step(-1);
$('.next').onclick = () => step(1);

$('#noteBtn').onclick = async () => {
  const n = await api.addNote(folder);
  await refresh();
  openViewer(view.findIndex(it => it.id === n.id));
};

$('#vFolder').onchange = async () => {
  const it = view[cur];
  it.folder = $('#vFolder').value || null;
  await api.update(it.id, { folder: it.folder });
  dirty = true;
  status(it.folder ? `Moved to ${it.folder}` : 'Removed from folder');
};

$('#vExport').onclick = async () => {
  await saveNote();
  if (await api.export(view[cur].id)) status(`Exported ${view[cur].name || 'note'}`);
};

$('#vDelete').onclick = async () => {
  const it = view[cur];
  if (!confirm(`Delete ${it.name || 'this note'} forever?`)) return;
  await api.remove(it.id);
  note = null;
  dirty = true;
  closeViewer();
};

addEventListener('keydown', e => {
  if (cur < 0) return;
  if (e.key === 's' && e.ctrlKey) { e.preventDefault(); saveNote().then(() => status('Saved')); return; }
  if (e.key === 'Escape') return closeViewer();
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;
  if (e.key === 'ArrowLeft') step(-1);
  if (e.key === 'ArrowRight') step(1);
});

// Files dragged in from Explorer: drop on the grid = current folder, drop on a sidebar folder = that folder.
addEventListener('dragover', e => {
  e.preventDefault();
  if ($('#gallery').hidden || !e.dataTransfer.types.includes('Files') || !e.target.closest('#main, #drop')) return;
  $('#drop').textContent = folder ? `Drop to move into "${folder}"` : 'Drop to move into Blindspot';
  $('#drop').hidden = false;
});
$('#drop').ondragleave = () => { $('#drop').hidden = true; };
addEventListener('drop', e => {
  e.preventDefault();
  $('#drop').hidden = true;
  if ($('#gallery').hidden) return;
  const paths = [...e.dataTransfer.files].map(api.pathOf).filter(Boolean);
  if (paths.length) importFiles(paths);
});

init();
