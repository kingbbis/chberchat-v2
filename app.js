// Cryptographic Password Hashing Function (SHA-256)
async function hashPassword(password) {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// LocalStorage Database Helpers
const DB = {
    getUsers: () => JSON.parse(localStorage.getItem('chat_users') || '[]'),
    setUsers: (users) => localStorage.setItem('chat_users', JSON.stringify(users)),
    getMessages: () => JSON.parse(localStorage.getItem('chat_messages') || '[]'),
    setMessages: (msgs) => localStorage.setItem('chat_messages', JSON.stringify(msgs)),
    getGroups: () => JSON.parse(localStorage.getItem('chat_groups') || '[{"id":"general","name":"# General Lobby","creator":"system"}]'),
    setGroups: (groups) => localStorage.setItem('chat_groups', JSON.stringify(groups)),
    getSession: () => JSON.parse(localStorage.getItem('chat_session') || 'null'),
    setSession: (session) => localStorage.setItem('chat_session', JSON.stringify(session))
};

// Seed default admin account with hashed "admin123" if not present
async function seedAdmin() {
    let users = DB.getUsers();
    if (!users.some(u => u.username === 'admin123')) {
        const hashedDefault = await hashPassword('admin123');
        users.push({ username: 'admin123', password: hashedDefault, role: 'admin', muted: false });
        DB.setUsers(users);
    }
}
seedAdmin();

// Authentication UI Tabs
function switchTab(tabName) {
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.form-section').forEach(sec => sec.classList.remove('active'));
    document.getElementById('error-msg').innerText = '';

    if (tabName === 'login') {
        document.querySelector('.tab-btn:nth-child(1)').classList.add('active');
        document.getElementById('login-form').classList.add('active');
    } else if (tabName === 'admin') {
        document.querySelector('.admin-tab-btn').classList.add('active');
        document.getElementById('admin-form').classList.add('active');
    }
}

async function handleLogin(e) {
    e.preventDefault();
    const u = document.getElementById('login-username').value.trim();
    const p = document.getElementById('login-password').value;
    const users = DB.getUsers();

    const hashedInput = await hashPassword(p);
    const user = users.find(user => user.username === u && user.password === hashedInput);
    if (!user) {
        document.getElementById('error-msg').innerText = 'Invalid username or password.';
        return;
    }
    if (user.muted) {
        alert('Your account is muted by administration.');
    }

    DB.setSession({ username: user.username, role: user.role });
    window.location.href = 'chat.html';
}

async function handleAdminLogin(e) {
    e.preventDefault();
    const u = document.getElementById('admin-username').value.trim();
    const p = document.getElementById('admin-password').value;
    const users = DB.getUsers();

    const hashedInput = await hashPassword(p);
    const admin = users.find(user => user.username === u && user.password === hashedInput && user.role === 'admin');
    if (!admin) {
        document.getElementById('error-msg').innerText = 'Invalid administrative credentials.';
        return;
    }

    DB.setSession({ username: admin.username, role: 'admin' });
    window.location.href = 'admin.html';
}

// Password Management Modals & Functions (Shared by Users and Admins)
function openPasswordModal() {
    document.getElementById('current-password').value = '';
    document.getElementById('new-password').value = '';
    document.getElementById('password-modal').style.display = 'flex';
}

function closePasswordModal() {
    document.getElementById('password-modal').style.display = 'none';
}

async function changePassword() {
    const currentPass = document.getElementById('current-password').value;
    const newPass = document.getElementById('new-password').value;

    if (!currentPass || !newPass) {
        alert('Please fill out all fields.');
        return;
    }

    const session = DB.getSession();
    let users = DB.getUsers();
    const account = users.find(u => u.username === session.username);

    const hashedCurrent = await hashPassword(currentPass);
    if (account.password !== hashedCurrent) {
        alert('Incorrect current password.');
        return;
    }

    const hashedNew = await hashPassword(newPass);
    users = users.map(u => {
        if (u.username === session.username) u.password = hashedNew;
        return u;
    });

    DB.setUsers(users);
    alert('Password updated successfully!');
    closePasswordModal();
}

// Chat Room Logic
let activeRoom = 'general';

function initChatApp() {
    const session = DB.getSession();
    if (!session) { window.location.href = 'index.html'; return; }

    document.getElementById('current-user-badge').innerText = `${session.username} (${session.role})`;
    
    const users = DB.getUsers();
    const currentUserObj = users.find(u => u.username === session.username);
    if (currentUserObj && currentUserObj.muted) {
        document.getElementById('muted-banner').style.display = 'block';
    }

    renderGroups();
    renderOnlineUsers();
    loadMessages();

    setInterval(() => {
        loadMessages();
        renderOnlineUsers();
    }, 1000);
}

function renderGroups() {
    const groups = DB.getGroups();
    const list = document.getElementById('groups-list');
    list.innerHTML = '';

    groups.forEach(g => {
        const li = document.createElement('li');
        li.innerText = g.name;
        if (g.id === activeRoom) li.classList.add('active');
        li.onclick = () => {
            activeRoom = g.id;
            document.getElementById('active-room-title').innerText = g.name;
            renderGroups();
            loadMessages();
            renderRoomHeaderActions();
        };
        list.appendChild(li);
    });
    renderRoomHeaderActions();
}

function renderRoomHeaderActions() {
    const session = DB.getSession();
    const groups = DB.getGroups();
    const currentGroup = groups.find(g => g.id === activeRoom);
    const container = document.getElementById('room-actions-container');
    container.innerHTML = '';

    if (currentGroup && currentGroup.id !== 'general') {
        if (session.role === 'admin' || currentGroup.creator === session.username) {
            const delBtn = document.createElement('button');
            delBtn.className = 'logout-sm-btn';
            delBtn.innerText = 'Delete Group';
            delBtn.onclick = () => deleteGroup(currentGroup.id);
            container.appendChild(delBtn);
        }
    }
}

function renderOnlineUsers() {
    const users = DB.getUsers();
    const list = document.getElementById('users-list');
    list.innerHTML = '';
    users.forEach(u => {
        const li = document.createElement('li');
        li.innerText = u.username + (u.muted ? ' (Muted)' : '');
        list.appendChild(li);
    });
}

function loadMessages() {
    const messages = DB.getMessages();
    const container = document.getElementById('chat-messages');
    const session = DB.getSession();
    
    const roomMsgs = messages.filter(m => m.room === activeRoom);
    container.innerHTML = '';

    roomMsgs.forEach(m => {
        const div = document.createElement('div');
        div.className = `message-bubble ${m.sender === session.username ? 'mine' : ''}`;
        div.innerHTML = `
            <div class="message-meta">
                <span><b>${m.sender}</b></span>
                <span>${m.time}</span>
            </div>
            <div class="message-text">${escapeHtml(m.text)}</div>
        `;
        container.appendChild(div);
    });
    container.scrollTop = container.scrollHeight;
}

function sendMessage(e) {
    e.preventDefault();
    const session = DB.getSession();
    const users = DB.getUsers();
    const user = users.find(u => u.username === session.username);

    if (user && user.muted) {
        alert('Action denied: Your account is currently muted.');
        return;
    }

    const input = document.getElementById('message-input');
    const text = input.value.trim();
    if (!text) return;

    const messages = DB.getMessages();
    messages.push({
        room: activeRoom,
        sender: session.username,
        text: text,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    });

    DB.setMessages(messages);
    input.value = '';
    loadMessages();
}

function openCreateGroupModal() { document.getElementById('group-modal').style.display = 'flex'; }
function closeCreateGroupModal() { document.getElementById('group-modal').style.display = 'none'; }

function createGroup() {
    const nameInput = document.getElementById('new-group-name');
    const name = nameInput.value.trim();
    if (!name) return;

    const groups = DB.getGroups();
    const id = 'group_' + Date.now();
    const session = DB.getSession();

    groups.push({ id, name: '# ' + name, creator: session.username });
    DB.setGroups(groups);
    nameInput.value = '';
    closeCreateGroupModal();
    renderGroups();
}

function deleteGroup(groupId) {
    if (!confirm('Are you sure you want to delete this group chat?')) return;
    let groups = DB.getGroups();
    groups = groups.filter(g => g.id !== groupId);
    DB.setGroups(groups);

    let messages = DB.getMessages();
    messages = messages.filter(m => m.room !== groupId);
    DB.setMessages(messages);

    activeRoom = 'general';
    renderGroups();
    loadMessages();
}

function logout() {
    localStorage.removeItem('chat_session');
    window.location.href = 'index.html';
}

// Admin Dashboard Functions
async function initAdminDashboard() {
    const session = DB.getSession();
    if (!session || session.role !== 'admin') {
        window.location.href = 'index.html';
        return;
    }

    const users = DB.getUsers();
    const hashedDefault = await hashPassword('admin123');
    const adminAccount = users.find(u => u.username === session.username && u.password === hashedDefault);
    if (adminAccount) {
        document.getElementById('password-change-card').style.display = 'block';
    }

    renderAdminTables();
}

async function updateAdminBannerPassword() {
    const newPass = document.getElementById('new-admin-banner-password').value;
    if (!newPass) { alert('Please enter a valid password.'); return; }

    const hashedNewPass = await hashPassword(newPass);
    const session = DB.getSession();
    let users = DB.getUsers();
    users = users.map(u => {
        if (u.username === session.username) u.password = hashedNewPass;
        return u;
    });
    DB.setUsers(users);
    alert('Admin password updated securely!');
    document.getElementById('password-change-card').style.display = 'none';
}

function renderAdminTables() {
    const users = DB.getUsers();
    const tbodyUsers = document.getElementById('admin-users-tbody');
    tbodyUsers.innerHTML = '';

    users.forEach(u => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${u.username}</td>
            <td><span class="${u.role === 'admin' ? 'badge-admin' : 'badge-user'}">${u.role}</span></td>
            <td>${u.muted ? '<span class="badge-muted">Muted</span>' : '<span style="color:var(--success)">Active</span>'}</td>
            <td>
                ${u.username !== 'admin123' ? `<button onclick="deleteUser('${u.username}')" class="action-btn btn-danger">Delete</button>` : ''}
                ${u.username !== 'admin123' ? `<button onclick="toggleMute('${u.username}')" class="action-btn ${u.muted ? 'btn-success' : 'btn-warning'}">${u.muted ? 'Unmute' : 'Mute'}</button>` : ''}
                <button onclick="resetUserPassword('${u.username}')" class="action-btn" style="background: var(--accent); color: white;">Reset Pwd</button>
            </td>
        `;
        tbodyUsers.appendChild(tr);
    });

    const groups = DB.getGroups();
    const tbodyGroups = document.getElementById('admin-groups-tbody');
    tbodyGroups.innerHTML = '';

    groups.forEach(g => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${g.name}</td>
            <td>${g.creator}</td>
            <td>
                ${g.id !== 'general' ? `<button onclick="adminDeleteGroup('${g.id}')" class="action-btn btn-danger">Delete Group</button>` : 'Default'}
            </td>
        `;
        tbodyGroups.appendChild(tr);
    });
}

async function adminCreateUser(e) {
    e.preventDefault();
    const usernameInput = document.getElementById('new-user-username');
    const passwordInput = document.getElementById('new-user-password');
    const roleSelect = document.getElementById('new-user-role');

    const username = usernameInput.value.trim();
    const password = passwordInput.value;
    const role = roleSelect.value;

    let users = DB.getUsers();
    if (users.some(u => u.username === username)) {
        alert('A user with this username already exists.');
        return;
    }

    const hashedPassword = await hashPassword(password);
    users.push({
        username: username,
        password: hashedPassword,
        role: role,
        muted: false
    });

    DB.setUsers(users);
    
    usernameInput.value = '';
    passwordInput.value = '';
    roleSelect.value = 'user';

    alert(`Successfully created ${role} account: ${username}`);
    renderAdminTables();
}

async function resetUserPassword(username) {
    if (!confirm(`Are you sure you want to reset the password for ${username} to the default ('user123')?`)) return;

    const defaultHashed = await hashPassword('user123');
    let users = DB.getUsers();
    users = users.map(u => {
        if (u.username === username) {
            u.password = defaultHashed;
        }
        return u;
    });

    DB.setUsers(users);
    alert(`Password for ${username} has been reset to user123.`);
    renderAdminTables();
}

function deleteUser(username) {
    if (!confirm(`Delete user ${username}?`)) return;
    let users = DB.getUsers();
    users = users.filter(u => u.username !== username);
    DB.setUsers(users);
    renderAdminTables();
}

function toggleMute(username) {
    let users = DB.getUsers();
    users = users.map(u => {
        if (u.username === username) u.muted = !u.muted;
        return u;
    });
    DB.setUsers(users);
    renderAdminTables();
}

function adminDeleteGroup(groupId) {
    deleteGroup(groupId);
    renderAdminTables();
}

function adminLogout() {
    localStorage.removeItem('chat_session');
    window.location.href = 'index.html';
}

function escapeHtml(text) {
    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}