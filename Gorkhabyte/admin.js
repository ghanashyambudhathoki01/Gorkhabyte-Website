// Simple client-side admin panel — no backend. Posts persist in localStorage.
(function(){
    const CREDENTIALS = { username: 'admin', password: 'admin@#' };
    const STORAGE_KEY = 'admin_posts_v1';
    const LOGIN_FLAG = 'admin_logged_in';

    // Elements
    const loginScreen = document.getElementById('loginScreen');
    const dashboard = document.getElementById('dashboard');
    const loginForm = document.getElementById('loginForm');
    const loginError = document.getElementById('loginError');
    const logoutBtn = document.getElementById('logoutBtn');

    const postForm = document.getElementById('postForm');
    const postIdInput = document.getElementById('postId');
    const titleInput = document.getElementById('postTitle');
    const excerptInput = document.getElementById('postExcerpt');
    const contentInput = document.getElementById('postContent');
    const imageInput = document.getElementById('postImage');
    const imagePreviewWrap = document.getElementById('imagePreview');
    const previewImg = document.getElementById('previewImg');
    const editorTitle = document.getElementById('editorTitle');
    const cancelEdit = document.getElementById('cancelEdit');

    const postsContainer = document.getElementById('postsContainer');
    const noPosts = document.getElementById('noPosts');
    const newPostBtn = document.getElementById('newPostBtn');
    const showPostsBtn = document.getElementById('showPostsBtn');

    // State
    let posts = [];
    let currentImageData = null;

    function loadPosts(){
        try{
            const raw = localStorage.getItem(STORAGE_KEY);
            posts = raw ? JSON.parse(raw) : [];
        }catch(e){posts = []}
    }

    function savePosts(){
        localStorage.setItem(STORAGE_KEY, JSON.stringify(posts));
    }

    function renderPosts(){
        postsContainer.innerHTML = '';
        if(!posts.length){ noPosts.style.display = 'block'; return; }
        noPosts.style.display = 'none';

        // apply search & filter
        const q = (document.getElementById('searchInput')?.value || '').toLowerCase();
        const filter = (document.getElementById('filterSelect')?.value || 'all');

        posts.slice().reverse().filter(post => {
            if(filter === 'published' && !post.published) return false;
            if(filter === 'draft' && post.published) return false;
            if(!q) return true;
            return (post.title || '').toLowerCase().includes(q) || (post.excerpt || '').toLowerCase().includes(q) || (post.content || '').toLowerCase().includes(q);
        }).forEach(post => {
            const el = document.createElement('article');
            el.className = 'post-card';
            el.innerHTML = `
                <div class="card-body">
                    <div class="post-meta">${new Date(post.updatedAt || post.createdAt).toLocaleString()}</div>
                    <h3>${escapeHtml(post.title)}</h3>
                    <div class="muted">${escapeHtml(post.excerpt || (post.content||'').slice(0,120))}</div>
                    <div class="post-actions">
                        <button data-id="${post.id}" class="btn ghost editBtn">Edit</button>
                        <button data-id="${post.id}" class="btn" style="background:#fde68a">Preview</button>
                        <button data-id="${post.id}" class="btn" style="background:var(--danger);color:#fff" data-action="delete">Delete</button>
                    </div>
                </div>
            `;
            // show publish badge
            const badge = document.createElement('div');
            badge.style.position = 'absolute'; badge.style.right = '12px'; badge.style.top = '12px'; badge.style.padding = '6px 8px'; badge.style.borderRadius = '6px'; badge.style.fontSize='0.8rem';
            badge.style.background = post.published ? '#ecfccb' : '#fee2e2';
            badge.textContent = post.published ? 'Published' : 'Draft';
            badge.className = 'small-muted';
            el.style.position = 'relative'; el.appendChild(badge);

            // if there is an imageData (legacy) insert an img at the top
            if(post.imageData){
                const img = document.createElement('img'); img.src = post.imageData; img.alt = post.title; el.insertBefore(img, el.firstChild);
            } else if(post.mediaIds && post.mediaIds.length){
                // async: fetch the first media blob URL and show as thumbnail
                const placeholder = document.createElement('div'); placeholder.style.height='140px'; placeholder.style.background='#f3f4f6'; el.insertBefore(placeholder, el.firstChild);
                (async ()=>{
                    const url = await getMediaURL(post.mediaIds[0]).catch(()=>null);
                    if(url){
                        const img = document.createElement('img'); img.src = url; img.alt = post.title; el.replaceChild(img, placeholder);
                    } else {
                        // show file name if fetch failed
                        placeholder.textContent = 'File'; placeholder.style.display='flex'; placeholder.style.alignItems='center'; placeholder.style.justifyContent='center';
                    }
                })();
            }
            postsContainer.appendChild(el);
        });
        // attach handlers
        postsContainer.querySelectorAll('.editBtn').forEach(btn=>btn.addEventListener('click',()=>editPost(btn.dataset.id)));
        postsContainer.querySelectorAll('button[data-action="delete"]').forEach(b=>b.addEventListener('click', ev=>{
            const id = b.dataset.id; if(!confirm('Delete this post?')) return; deletePost(id);
        }));
        // publish toggle & copy link
        postsContainer.querySelectorAll('.post-card').forEach(card=>{
            const id = card.querySelector('.editBtn')?.dataset.id;
            if(!id) return;
            // add publish toggle button
            let pubBtn = card.querySelector('.publishBtn');
            if(!pubBtn){
                pubBtn = document.createElement('button'); pubBtn.className='btn publishBtn ghost'; pubBtn.style.marginLeft='8px';
                pubBtn.textContent = 'Toggle Publish';
                const actions = card.querySelector('.post-actions'); if(actions) actions.insertBefore(pubBtn, actions.children[1] || null);
            }
            pubBtn.onclick = ()=>{
                const p = posts.find(x=>x.id==id); if(!p) return; p.published = !p.published; savePosts(); renderPosts();
            };

            // copy link
            let copyBtn = card.querySelector('.copyLinkBtn');
            if(!copyBtn){
                copyBtn = document.createElement('button'); copyBtn.className='btn copyLinkBtn ghost'; copyBtn.style.marginLeft='8px'; copyBtn.textContent='Copy link';
                const actions = card.querySelector('.post-actions'); if(actions) actions.appendChild(copyBtn);
            }
            copyBtn.onclick = ()=>{
                const link = `${location.origin}${location.pathname.replace(/[^/]*$/, '')}blog.html?post=${id}`;
                navigator.clipboard && navigator.clipboard.writeText(link).then(()=>alert('Link copied to clipboard')) .catch(()=>{ prompt('Copy this link', link); });
            };
        });
        postsContainer.querySelectorAll('.post-card button[style*="Preview"]').forEach(b=>{
            b.addEventListener('click', async ()=>{
                const id = b.dataset.id; const p = posts.find(x=>x.id==id);
                if(!p) return; const win = window.open('','_blank');
                win.document.write(`<title>${escapeHtml(p.title)}</title><meta charset="utf-8"><style>body{font-family:Arial;padding:18px;}</style><h1>${escapeHtml(p.title)}</h1><p style="color:#666">${new Date(p.updatedAt||p.createdAt).toLocaleString()}</p><div id="mediaContainer"></div><div>${p.content}</div>`);
                // if legacy base64
                if(p.imageData){
                    win.document.getElementById('mediaContainer').innerHTML = `<img style="max-width:100%;height:auto" src="${p.imageData}">`;
                } else if(p.mediaIds && p.mediaIds.length){
                    // fetch all media URLs and append
                    const container = win.document.getElementById('mediaContainer');
                    for(const mid of p.mediaIds){
                        try{
                            const url = await getMediaURL(mid);
                            if(!url) continue;
                            if(url && url.startsWith('blob:')){
                                const rec = await getMediaRecord(mid);
                                if(rec && rec.type && rec.type.startsWith('image/')){
                                    const img = win.document.createElement('img'); img.style.maxWidth='100%'; img.style.height='auto'; img.src = url; container.appendChild(img);
                                } else {
                                    const a = win.document.createElement('a'); a.href = url; a.textContent = rec && rec.name ? rec.name : 'Download file'; a.download = rec && rec.name ? rec.name : '';
                                    container.appendChild(a);
                                }
                            }
                        }catch(e){ console.warn('preview media fail', e); }
                    }
                }
            });
        });
    }

    function escapeHtml(s){
        if(!s) return '';
        return String(s).replace(/[&<>"']/g, function(c){
            return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
        });
    }

    function resetEditor(){
        postIdInput.value = '';
        titleInput.value = '';
        excerptInput.value = '';
        contentInput.value = '';
        imageInput.value = '';
        previewImg.src = '';
        imagePreviewWrap.style.display = 'none';
        currentImageData = null;
        editorTitle.textContent = 'Create Post';
    }

    function editPost(id){
        const p = posts.find(x=>x.id==id); if(!p) return; postIdInput.value = p.id; titleInput.value = p.title; excerptInput.value = p.excerpt||''; contentInput.value = p.content||''; if(p.imageData){ currentImageData = p.imageData; previewImg.src = p.imageData; imagePreviewWrap.style.display='block'; } else { imagePreviewWrap.style.display='none' }
        editorTitle.textContent = 'Edit Post';
        window.scrollTo({top:0,behavior:'smooth'});
    }

    function deletePost(id){
        const toDelete = posts.find(p=>p.id==id);
        // remove associated media
        if(toDelete && toDelete.mediaIds && toDelete.mediaIds.length){
            toDelete.mediaIds.forEach(mid=>{ try{ deleteMedia(mid); }catch(e){} });
        }
        posts = posts.filter(p=>p.id!=id); savePosts(); renderPosts();
    }

    // ----- IndexedDB media store helpers -----
    function openDb(){
        return new Promise((resolve,reject)=>{
            const req = indexedDB.open('gorkhabyte_admin', 1);
            req.onupgradeneeded = function(e){
                const db = e.target.result;
                if(!db.objectStoreNames.contains('media')){
                    db.createObjectStore('media', { keyPath: 'id', autoIncrement: true });
                }
            };
            req.onsuccess = ()=>resolve(req.result);
            req.onerror = ()=>reject(req.error || new Error('IndexedDB open failed'));
        });
    }

    async function storeFiles(files){
        if(!files || !files.length) return [];
        const db = await openDb();
        return new Promise((resolve,reject)=>{
            const tx = db.transaction('media','readwrite');
            const store = tx.objectStore('media');
            const ids = [];
            tx.oncomplete = ()=>{ resolve(ids); db.close(); };
            tx.onerror = ()=>{ reject(tx.error || new Error('transaction error')); db.close(); };
            Array.from(files).forEach(file=>{
                const rec = { blob: file, name: file.name, type: file.type, createdAt: Date.now() };
                const r = store.add(rec);
                r.onsuccess = ()=>{ ids.push(r.result); };
            });
        });
    }

    async function getMediaRecord(id){
        const db = await openDb();
        return new Promise((resolve,reject)=>{
            const tx = db.transaction('media','readonly');
            const store = tx.objectStore('media');
            const r = store.get(Number(id));
            r.onsuccess = ()=>{ resolve(r.result); db.close(); };
            r.onerror = ()=>{ reject(r.error || new Error('get error')); db.close(); };
        });
    }

    async function getMediaURL(id){
        try{
            const rec = await getMediaRecord(id);
            if(!rec || !rec.blob) return null;
            return URL.createObjectURL(rec.blob);
        }catch(e){ return null; }
    }

    async function deleteMedia(id){
        const db = await openDb();
        return new Promise((resolve,reject)=>{
            const tx = db.transaction('media','readwrite');
            const store = tx.objectStore('media');
            const r = store.delete(Number(id));
            r.onsuccess = ()=>{ resolve(true); db.close(); };
            r.onerror = ()=>{ reject(r.error || new Error('delete error')); db.close(); };
        });
    }

    // legacy: if a file needs to be converted to base64 for very old posts
    function fileToDataURL(file){
        return new Promise((resolve,reject)=>{
            if(!file) return resolve(null);
            const r = new FileReader();
            r.onload = ()=>resolve(r.result);
            r.onerror = ()=>reject('Failed to read file');
            r.readAsDataURL(file);
        });
    }

    // Auth
    function isLogged(){ return sessionStorage.getItem(LOGIN_FLAG) === 'true'; }
    function requireAuth(){ if(isLogged()){ showDashboard(); } else { showLogin(); } }

    function showLogin(){ loginScreen.style.display='flex'; dashboard.style.display='none'; }
    function showDashboard(){ loginScreen.style.display='none'; dashboard.style.display='block'; loadPosts(); renderPosts(); }

    // event handlers
    loginForm.addEventListener('submit', (e)=>{
        e.preventDefault(); const u = loginForm.username.value.trim(); const p = loginForm.password.value;
        if(u === CREDENTIALS.username && p === CREDENTIALS.password){ sessionStorage.setItem(LOGIN_FLAG,'true'); loginError.style.display='none'; showDashboard(); } else { loginError.style.display='block'; loginError.textContent = 'Invalid credentials'; }
    });

    logoutBtn.addEventListener('click', ()=>{ sessionStorage.removeItem(LOGIN_FLAG); showLogin(); });

    newPostBtn.addEventListener('click', ()=>{ resetEditor(); window.scrollTo({top:0,behavior:'smooth'}); });
    showPostsBtn.addEventListener('click', ()=>{ window.scrollTo({top:document.body.scrollHeight,behavior:'smooth'}); });

    imageInput.addEventListener('change', async (e)=>{
        const files = Array.from(e.target.files || []);
        currentImageData = null; // we will store files to IndexedDB when saving
        const previewList = document.getElementById('previewList');
        previewList.innerHTML = '';
        if(!files.length){ imagePreviewWrap.style.display='none'; return; }
        imagePreviewWrap.style.display = 'block';
        // show previews (images will be previewed via object URLs; other file types show filename)
        files.forEach(file=>{
            const wrap = document.createElement('div');
            wrap.style.maxWidth = '140px';
            if(file.type.startsWith('image/')){
                const img = document.createElement('img');
                img.style.width = '140px'; img.style.height='90px'; img.style.objectFit='cover'; img.style.borderRadius='6px';
                img.src = URL.createObjectURL(file);
                wrap.appendChild(img);
            } else {
                const icon = document.createElement('div');
                icon.textContent = file.name; icon.style.padding = '8px'; icon.style.border = '1px solid #eee'; icon.style.borderRadius='6px'; icon.style.fontSize='0.85rem';
                wrap.appendChild(icon);
            }
            previewList.appendChild(wrap);
        });
    });

    postForm.addEventListener('submit', async (e)=>{
        e.preventDefault();
        const id = postIdInput.value || String(Date.now());
        const title = titleInput.value.trim();
        const excerpt = excerptInput.value.trim();
        const content = contentInput.value.trim();
        if(!title || !content){ alert('Please provide title and content'); return; }

        // store any selected files to IndexedDB and attach mediaIds to post
        let mediaIds = [];
        if(imageInput.files && imageInput.files.length){
            try{ mediaIds = await storeFiles(imageInput.files); }catch(err){ console.error('storeFiles failed', err); alert('Failed to store media files'); return; }
        }

        const existing = posts.find(p=>p.id==id);
        const now = Date.now();
        const post = {
            id,
            title,
            excerpt,
            content,
            // preserve legacy base64 images (imageData) for older posts; prefer mediaIds for new uploads
            imageData: currentImageData || (existing? existing.imageData : null),
            mediaIds: mediaIds.length ? mediaIds : (existing? existing.mediaIds || [] : []),
            createdAt: existing ? existing.createdAt : now,
            updatedAt: now
        };

        if(existing){ posts = posts.map(p=>p.id==id?post:p); }
        else { posts.push(post); }

        savePosts(); renderPosts(); resetEditor();
        // After saving redirect to the public blog page so admin can view the post
        try{
            // small timeout to ensure storage is flushed in some browsers
            setTimeout(()=>{ window.location.href = 'blog.html'; }, 150);
        }catch(e){ console.warn('Redirect failed', e); }
    });

    cancelEdit.addEventListener('click', (e)=>{ e.preventDefault(); resetEditor(); });

    // initialize
    requireAuth();
    // wire search/filter/export/import
    const searchInput = document.getElementById('searchInput');
    const filterSelect = document.getElementById('filterSelect');
    const exportBtn = document.getElementById('exportBtn');
    const importBtn = document.getElementById('importBtn');
    const importFile = document.getElementById('importFile');
    if(searchInput) searchInput.addEventListener('input', ()=>renderPosts());
    if(filterSelect) filterSelect.addEventListener('change', ()=>renderPosts());

    if(exportBtn){
        exportBtn.addEventListener('click', ()=>{
            const data = { posts: posts };
            const blob = new Blob([JSON.stringify(data, null, 2)], {type: 'application/json'});
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a'); a.href = url; a.download = 'gorkhabyte-posts.json'; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
        });
    }

    if(importBtn && importFile){
        importBtn.addEventListener('click', ()=>importFile.click());
        importFile.addEventListener('change', async (e)=>{
            const f = e.target.files && e.target.files[0]; if(!f) return; try{
                const txt = await f.text(); const obj = JSON.parse(txt);
                if(!obj || !Array.isArray(obj.posts)) { alert('Invalid file format'); return; }
                // merge posts: give new ids to avoid collisions
                const incoming = obj.posts.map((p, i)=>({ ...p, id: String(Date.now()) + '_' + i }));
                posts = posts.concat(incoming); savePosts(); renderPosts(); alert('Imported '+incoming.length+' posts (media may not be present)');
            }catch(err){ alert('Import failed: '+err.message); }
        });
    }

    // --- Additional admin features: Messages, Subscribers, Registrations, Projects (client-side only) ---
    const MESSAGES_KEY = 'admin_messages_v1';
    const SUBS_KEY = 'admin_subs_v1';
    const REGS_KEY = 'admin_regs_v1';
    const PROJECTS_KEY = 'admin_projects_v1';

    // load helpers
    function loadFromStorage(key){ try{ return JSON.parse(localStorage.getItem(key) || '[]'); }catch(e){ return []; } }
    function saveToStorage(key, arr){ localStorage.setItem(key, JSON.stringify(arr || [])); }

    // Messages
    const showMessagesBtn = document.getElementById('showMessagesBtn');
    const messagesSection = document.getElementById('messagesSection');
    const messagesContainer = document.getElementById('messagesContainer');
    const exportMessages = document.getElementById('exportMessages');
    const clearMessages = document.getElementById('clearMessages');
    const noMessagesEl = document.getElementById('noMessages');

    function renderMessages(){
        const msgs = loadFromStorage(MESSAGES_KEY);
        messagesContainer.innerHTML = '';
        if(!msgs.length){ noMessagesEl.style.display='block'; return; }
        noMessagesEl.style.display='none';
        msgs.slice().reverse().forEach(m=>{
            const el = document.createElement('div'); el.className='card'; el.style.marginBottom='8px';
            el.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:flex-start"><div><strong>${escapeHtml(m.name||'')}</strong> <div class="muted">${escapeHtml(m.email||'')}</div></div><div style="font-size:0.85rem;color:var(--muted)">${new Date(m.createdAt||m.time||Date.now()).toLocaleString()}</div></div><div style="margin-top:8px">${escapeHtml(m.message||'')}</div><div style="margin-top:8px"><button class="btn ghost msg-delete" data-id="${m.id}">Delete</button></div>`;
            messagesContainer.appendChild(el);
        });
        messagesContainer.querySelectorAll('.msg-delete').forEach(b=>b.addEventListener('click', ()=>{
            const id = b.dataset.id; if(!confirm('Delete this message?')) return; const arr = loadFromStorage(MESSAGES_KEY).filter(x=>x.id!=id); saveToStorage(MESSAGES_KEY, arr); renderMessages();
        }));
    }

    if(showMessagesBtn) showMessagesBtn.addEventListener('click', ()=>{
        // hide others, show messages
        postsSection.style.display = 'none'; messagesSection.style.display='block'; subscribersSection && (subscribersSection.style.display='none'); registrationsSection && (registrationsSection.style.display='none'); projectsSection && (projectsSection.style.display='none'); renderMessages();
    });

    if(exportMessages) exportMessages.addEventListener('click', ()=>{
        const data = loadFromStorage(MESSAGES_KEY); const blob = new Blob([JSON.stringify(data,null,2)],{type:'application/json'}); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href=url; a.download='messages.json'; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    });
    if(clearMessages) clearMessages.addEventListener('click', ()=>{ if(confirm('Clear all messages?')){ saveToStorage(MESSAGES_KEY, []); renderMessages(); }});

    // Subscribers
    const showSubscribersBtn = document.getElementById('showSubscribersBtn');
    const subscribersSection = document.getElementById('subscribersSection');
    const subscribersContainer = document.getElementById('subscribersContainer');
    const exportSubscribers = document.getElementById('exportSubscribers');
    const clearSubscribers = document.getElementById('clearSubscribers');
    const noSubscribers = document.getElementById('noSubscribers');

    function renderSubscribers(){
        const subs = loadFromStorage(SUBS_KEY);
        subscribersContainer.innerHTML = '';
        if(!subs.length){ noSubscribers.style.display='block'; return; }
        noSubscribers.style.display='none';
        subs.slice().reverse().forEach(s=>{
            const el = document.createElement('div'); el.className='card'; el.style.marginBottom='8px'; el.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center"><div><strong>${escapeHtml(s.email)}</strong><div class="muted">${new Date(s.subscribedAt||s.time||Date.now()).toLocaleString()}</div></div><div><button class="btn ghost sub-delete" data-id="${s.id}">Delete</button></div></div>`; subscribersContainer.appendChild(el);
        });
        subscribersContainer.querySelectorAll('.sub-delete').forEach(b=>b.addEventListener('click', ()=>{ const id=b.dataset.id; if(!confirm('Delete subscriber?')) return; const arr = loadFromStorage(SUBS_KEY).filter(x=>x.id!=id); saveToStorage(SUBS_KEY, arr); renderSubscribers(); }));
    }
    if(showSubscribersBtn) showSubscribersBtn.addEventListener('click', ()=>{ postsSection.style.display='none'; messagesSection && (messagesSection.style.display='none'); subscribersSection.style.display='block'; registrationsSection && (registrationsSection.style.display='none'); projectsSection && (projectsSection.style.display='none'); renderSubscribers(); });
    if(exportSubscribers) exportSubscribers.addEventListener('click', ()=>{ const data = loadFromStorage(SUBS_KEY); const blob = new Blob([JSON.stringify(data,null,2)],{type:'application/json'}); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href=url; a.download='subscribers.json'; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url); });
    if(clearSubscribers) clearSubscribers.addEventListener('click', ()=>{ if(confirm('Clear all subscribers?')){ saveToStorage(SUBS_KEY, []); renderSubscribers(); }});

    // Registrations
    const showRegistrationsBtn = document.getElementById('showRegistrationsBtn');
    const registrationsSection = document.getElementById('registrationsSection');
    const registrationsContainer = document.getElementById('registrationsContainer');
    const exportRegistrations = document.getElementById('exportRegistrations');
    const clearRegistrations = document.getElementById('clearRegistrations');
    const noRegistrations = document.getElementById('noRegistrations');

    function renderRegistrations(){
        const regs = loadFromStorage(REGS_KEY);
        registrationsContainer.innerHTML = '';
        if(!regs.length){ noRegistrations.style.display='block'; return; }
        noRegistrations.style.display='none';
        regs.slice().reverse().forEach(r=>{
            const el = document.createElement('div'); el.className='card'; el.style.marginBottom='8px'; el.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:flex-start"><div><strong>${escapeHtml(r.name||'')}</strong> <div class="muted">${escapeHtml(r.email||'')}</div></div><div style="font-size:0.85rem;color:var(--muted)">${new Date(r.createdAt||r.time||Date.now()).toLocaleString()}</div></div><div style="margin-top:8px">Phone: ${escapeHtml(r.phone||'—')}</div><div style="margin-top:8px"><button class="btn ghost reg-delete" data-id="${r.id}">Delete</button></div>`; registrationsContainer.appendChild(el);
        });
        registrationsContainer.querySelectorAll('.reg-delete').forEach(b=>b.addEventListener('click', ()=>{ const id=b.dataset.id; if(!confirm('Delete registration?')) return; const arr = loadFromStorage(REGS_KEY).filter(x=>x.id!=id); saveToStorage(REGS_KEY,arr); renderRegistrations(); }));
    }
    if(showRegistrationsBtn) showRegistrationsBtn.addEventListener('click', ()=>{ postsSection.style.display='none'; messagesSection && (messagesSection.style.display='none'); subscribersSection && (subscribersSection.style.display='none'); registrationsSection.style.display='block'; projectsSection && (projectsSection.style.display='none'); renderRegistrations(); });
    if(exportRegistrations) exportRegistrations.addEventListener('click', ()=>{ const data = loadFromStorage(REGS_KEY); const blob = new Blob([JSON.stringify(data,null,2)],{type:'application/json'}); const url = URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download='registrations.json'; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url); });
    if(clearRegistrations) clearRegistrations.addEventListener('click', ()=>{ if(confirm('Clear all registrations?')){ saveToStorage(REGS_KEY, []); renderRegistrations(); }});

    // Projects manager
    const showProjectsBtnEl = document.getElementById('showProjectsBtn');
    const projectsSection = document.getElementById('projectsSection');
    const projectEditor = document.getElementById('projectEditor');
    const newProjectBtn = document.getElementById('newProjectBtn');
    const projectForm = document.getElementById('projectForm');
    const projectIdInput = document.getElementById('projectId');
    const projectTitle = document.getElementById('projectTitle');
    const projectDescription = document.getElementById('projectDescription');
    const projectImage = document.getElementById('projectImage');
    const projectsContainer = document.getElementById('projectsContainer');
    const noProjects = document.getElementById('noProjects');
    const cancelProject = document.getElementById('cancelProject');

    function renderProjects(){
        const list = loadFromStorage(PROJECTS_KEY);
        projectsContainer.innerHTML = '';
        if(!list.length){ noProjects.style.display='block'; return; }
        noProjects.style.display='none';
        list.slice().reverse().forEach(p=>{
            const card = document.createElement('div'); card.className='card'; card.style.position='relative'; card.style.padding='8px';
            card.innerHTML = `<div style="height:140px;background:#f3f4f6;border-radius:8px;overflow:hidden;display:flex;align-items:center;justify-content:center" data-media="${p.mediaIds && p.mediaIds[0] ? p.mediaIds[0] : ''}"></div><div style="padding:8px"><h4>${escapeHtml(p.title)}</h4><div class="muted">${escapeHtml((p.description||'').slice(0,160))}</div><div style="margin-top:8px"><button class="btn ghost project-edit" data-id="${p.id}">Edit</button> <button class="btn" style="background:var(--danger);color:#fff" data-id="${p.id}" data-action="delete">Delete</button></div></div>`;
            projectsContainer.appendChild(card);
            // load image
            (async ()=>{
                if(p.mediaIds && p.mediaIds.length){ const url = await getMediaURL(p.mediaIds[0]).catch(()=>null); if(url){ const el = card.querySelector('[data-media]'); const img = document.createElement('img'); img.src = url; img.style.width='100%'; img.style.height='100%'; img.style.objectFit='cover'; el.innerHTML=''; el.appendChild(img); }
                }
            })();
        });
        // attach handlers
        projectsContainer.querySelectorAll('.project-edit').forEach(b=>b.addEventListener('click', ()=>{
            const id=b.dataset.id; const arr = loadFromStorage(PROJECTS_KEY); const p = arr.find(x=>x.id==id); if(!p) return; projectIdInput.value=p.id; projectTitle.value=p.title; projectDescription.value=p.description||''; projectEditor.style.display='block'; window.scrollTo({top:0,behavior:'smooth'});
        }));
        projectsContainer.querySelectorAll('button[data-action="delete"]').forEach(b=>b.addEventListener('click', async ()=>{ const id=b.dataset.id; if(!confirm('Delete this project?')) return; const arr = loadFromStorage(PROJECTS_KEY); const p = arr.find(x=>x.id==id); if(p && p.mediaIds && p.mediaIds.length){ for(const mid of p.mediaIds){ try{ await deleteMedia(mid); }catch(e){} } } const remaining = arr.filter(x=>x.id!=id); saveToStorage(PROJECTS_KEY, remaining); renderProjects(); }));
    }

    if(showProjectsBtnEl) showProjectsBtnEl.addEventListener('click', ()=>{ postsSection.style.display='none'; messagesSection && (messagesSection.style.display='none'); subscribersSection && (subscribersSection.style.display='none'); registrationsSection && (registrationsSection.style.display='none'); projectsSection.style.display='block'; renderProjects(); });
    if(newProjectBtn) newProjectBtn.addEventListener('click', ()=>{ projectEditor.style.display='block'; projectIdInput.value=''; projectTitle.value=''; projectDescription.value=''; projectImage.value=''; });
    if(cancelProject) cancelProject.addEventListener('click', ()=>{ projectEditor.style.display='none'; });

    projectForm.addEventListener('submit', async (e)=>{
        e.preventDefault(); const id = projectIdInput.value || String(Date.now()); const title = projectTitle.value.trim(); const desc = projectDescription.value.trim(); if(!title){ alert('Please provide a title'); return; }
        let mediaIds = [];
        if(projectImage.files && projectImage.files.length){ try{ mediaIds = await storeFiles(projectImage.files); }catch(e){ console.error(e); alert('Failed to save project media'); return; } }
        const arr = loadFromStorage(PROJECTS_KEY);
        const existing = arr.find(x=>x.id==id);
        const rec = { id, title, description: desc, mediaIds: mediaIds.length ? mediaIds : (existing? existing.mediaIds||[]:[]) , createdAt: existing? existing.createdAt : Date.now(), updatedAt: Date.now() };
        if(existing){ const updated = arr.map(x=>x.id==id?rec:x); saveToStorage(PROJECTS_KEY, updated); } else { arr.push(rec); saveToStorage(PROJECTS_KEY, arr); }
        projectEditor.style.display='none'; renderProjects();
    });

    const exportProjects = document.getElementById('exportProjects');
    if(exportProjects) exportProjects.addEventListener('click', ()=>{ const data = loadFromStorage(PROJECTS_KEY); const blob = new Blob([JSON.stringify(data,null,2)],[{type:'application/json'}]); const url = URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download='projects.json'; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url); });

    // When showing dashboard, ensure posts view is default
    const allMenuButtons = [document.getElementById('showPostsBtn'), showMessagesBtn, showSubscribersBtn, showRegistrationsBtn, showProjectsBtnEl];
    if(document.getElementById('showPostsBtn')){
        document.getElementById('showPostsBtn').addEventListener('click', ()=>{ postsSection.style.display='block'; messagesSection && (messagesSection.style.display='none'); subscribersSection && (subscribersSection.style.display='none'); registrationsSection && (registrationsSection.style.display='none'); projectsSection && (projectsSection.style.display='none'); window.scrollTo({top:0,behavior:'smooth'}); });
    }

    // expose renderers on dashboard show
    const originalShowDashboard = showDashboard;
    showDashboard = function(){ originalShowDashboard(); renderMessages(); renderSubscribers(); renderRegistrations(); renderProjects(); };

})();
