// --- 2 & 4. TÍCH HỢP FIREBASE AUTH & CLOUD FIRESTORE (SDK v10 CDN) ---
    // Thay thế thông tin cấu hình Project từ Firebase Console của bạn vào đây:
    const FIREBASE_CONFIG = {
      apiKey: "AIzaSyBUnMq85LtIOFt2KYLSosA_NHQx6h-TIak",
      authDomain: "v-lass3d.firebaseapp.com",
      projectId: "v-lass3d",
      storageBucket: "v-lass3d.firebasestorage.app",
      messagingSenderId: "165845744615",
      appId: "1:165845744615:web:d9348c07fb3ef1c2805b42",
    };

    let fbAuth = null;
    let fbDb = null;
    let fbModules = {};
    let currentUser = null;
    let cloudReportsCache = [];
    let unsubscribeReports = null;
	let currentUserProfile = { xp: 0, level: 1, streak: 0, lastLoginDate: null };

    // --- HỆ THỐNG GAMIFICATION: QUY ĐỔI XP, CẤP ĐỘ & DANH HIỆU ---
    function getLevelAndTierInfo(xp = 0) {
      let level = 1;
      let minXP = 0;
      let maxXP = 100;
      let tierTitle = '🟢 Thực Tập Sinh';
      let tierColor = 'text-emerald-400';

      if (xp < 500) {
        // Cấp 1 - 5 (0 - 500 XP): 100 XP / cấp
        level = Math.min(5, Math.floor(xp / 100) + 1);
        minXP = (level - 1) * 100;
        maxXP = level * 100;
        tierTitle = '🟢 Thực Tập Sinh';
        tierColor = 'text-emerald-400';
      } else if (xp < 2000) {
        // Cấp 6 - 15 (500 - 2000 XP): 150 XP / cấp
        level = Math.min(15, 6 + Math.floor((xp - 500) / 150));
        minXP = 500 + (level - 6) * 150;
        maxXP = 500 + (level - 5) * 150;
        tierTitle = '🔵 Trợ Lý Phòng Lab';
        tierColor = 'text-sky-400';
      } else if (xp < 5000) {
        // Cấp 16 - 30 (2000 - 5000 XP): 200 XP / cấp
        level = Math.min(30, 16 + Math.floor((xp - 2000) / 200));
        minXP = 2000 + (level - 16) * 200;
        maxXP = 2000 + (level - 15) * 200;
        tierTitle = '🟣 Nghiên Cứu Viên';
        tierColor = 'text-purple-400';
      } else if (xp < 10000) {
        // Cấp 31 - 50 (5000 - 10000 XP): 250 XP / cấp
        level = Math.min(50, 31 + Math.floor((xp - 5000) / 250));
        minXP = 5000 + (level - 31) * 250;
        maxXP = 5000 + (level - 30) * 250;
        tierTitle = '🟠 Chuyên Gia KHTN';
        tierColor = 'text-amber-400';
      } else {
        // Cấp 51+ (10000+ XP): 500 XP / cấp
        level = 51 + Math.floor((xp - 10000) / 500);
        minXP = 10000 + (level - 51) * 500;
        maxXP = 10000 + (level - 50) * 500;
        tierTitle = '🔴 Viện Trưởng V-LABS';
        tierColor = 'text-rose-400';
      }

      const progressPercent = Math.min(100, Math.max(0, ((xp - minXP) / (maxXP - minXP)) * 100));
      return { level, minXP, maxXP, progressPercent, tierTitle, tierColor };
    }

    // Lấy ngày hiện tại theo định dạng YYYY-MM-DD (giờ địa phương)
    function getTodayDateString() {
      const now = new Date();
      const yyyy = now.getFullYear();
      const mm = String(now.getMonth() + 1).padStart(2, '0');
      const dd = String(now.getDate()).padStart(2, '0');
      return `${yyyy}-${mm}-${dd}`;
    }

    // Tính số ngày chênh lệch giữa 2 chuỗi YYYY-MM-DD
    function getDaysDifference(dateStr1, dateStr2) {
      if (!dateStr1 || !dateStr2) return null;
      const d1 = new Date(dateStr1 + 'T00:00:00');
      const d2 = new Date(dateStr2 + 'T00:00:00');
      return Math.round((d2 - d1) / (1000 * 60 * 60 * 24));
    }

    // Kiểm tra đăng nhập hằng ngày, tính Streak và đồng bộ User Document trên Firestore
    async function checkDailyLoginAndSyncProfile(user) {
      if (!user || !fbDb) return;
      const userDocRef = fbModules.doc(fbDb, 'vlabs_users', user.uid);
      const today = getTodayDateString();

      try {
        const snap = await fbModules.getDoc(userDocRef);

        if (!snap.exists()) {
          // Người dùng mới lần đầu đăng nhập: +10 XP, Streak = 1
          const initialXP = 10;
          const info = getLevelAndTierInfo(initialXP);
          currentUserProfile = {
            uid: user.uid,
            displayName: user.displayName || user.email,
            xp: initialXP,
            level: info.level,
            streak: 1,
            lastLoginDate: today
          };
          await fbModules.setDoc(userDocRef, currentUserProfile);
          updateAuthUI();
          if (typeof showXPToast === 'function') {
            showXPToast('✨ +10 XP: Đăng nhập ngày đầu tiên! (Chuỗi 🔥 1 ngày)');
          }
          return;
        }

        const data = snap.data();
        let xp = data.xp || 0;
        let streak = data.streak || 0;
        const lastLogin = data.lastLoginDate || null;
        const oldLevel = getLevelAndTierInfo(xp).level;

        const diffDays = getDaysDifference(lastLogin, today);

        // Nếu đăng nhập sang một ngày mới (chưa điểm danh hôm nay)
        if (diffDays !== 0) {
          let earnedXP = 10; // +10 XP đăng nhập mỗi ngày
          let toastMessages = ['+10 XP đăng nhập hằng ngày'];

          if (diffDays === 1) {
            // Đăng nhập liên tiếp
            streak += 1;
            if (streak === 3) {
              earnedXP += 50;
              toastMessages.push('🔥 Thưởng mốc 3 ngày liên tiếp (+50 XP)');
            } else if (streak === 7) {
              earnedXP += 200;
              toastMessages.push('🔥 Thưởng mốc 7 ngày liên tiếp (+200 XP)');
            }
          } else {
            // Bỏ lỡ >= 1 ngày: Reset Streak về 0
            streak = 0;
            toastMessages.push('⚠️ Đã reset chuỗi Streak do bỏ lỡ ngày đăng nhập');
          }

          xp += earnedXP;
          const newInfo = getLevelAndTierInfo(xp);

          currentUserProfile = {
            ...data,
            xp,
            level: newInfo.level,
            streak,
            lastLoginDate: today
          };

          await fbModules.setDoc(userDocRef, currentUserProfile, { merge: true });
          updateAuthUI();

          if (typeof showXPToast === 'function') {
            showXPToast(`⚡ ${toastMessages.join(' | ')}`);
            if (newInfo.level > oldLevel) {
              setTimeout(() => {
                showXPToast(`🎉 Thăng cấp! Bạn đã đạt Cấp ${newInfo.level} (${newInfo.tierTitle})`, true);
              }, 800);
            }
          }
        } else {
          // Đã đăng nhập trong ngày hôm nay -> chỉ nạp lại dữ liệu
          const info = getLevelAndTierInfo(xp);
          currentUserProfile = { ...data, xp, level: info.level, streak, lastLoginDate: today };
          updateAuthUI();
        }
      } catch (err) {
        console.error('Lỗi đồng bộ hồ sơ Gamification:', err);
      }
    }

    // Hàm cộng XP chung (dùng khi lưu báo cáo hoặc hoàn thành nhiệm vụ)
    async function awardUserXP(amount, reasonText) {
      if (!currentUser || !fbDb) return;
      const userDocRef = fbModules.doc(fbDb, 'vlabs_users', currentUser.uid);

      try {
        const oldLevel = getLevelAndTierInfo(currentUserProfile.xp).level;
        const newXP = (currentUserProfile.xp || 0) + amount;
        const newInfo = getLevelAndTierInfo(newXP);

        currentUserProfile.xp = newXP;
        currentUserProfile.level = newInfo.level;

        await fbModules.setDoc(userDocRef, {
          xp: newXP,
          level: newInfo.level,
          updatedAt: Date.now()
        }, { merge: true });

        updateAuthUI();

        if (typeof showXPToast === 'function') {
          showXPToast(`⚡ +${amount} XP: ${reasonText}`);
          if (newInfo.level > oldLevel) {
            setTimeout(() => {
              showXPToast(`🎉 Thăng cấp! Bạn đã đạt Cấp ${newInfo.level} (${newInfo.tierTitle})`, true);
            }, 800);
          }
        }
      } catch (err) {
        console.error('Lỗi cập nhật XP lên Firestore:', err);
      }
    }

    // Nạp động Firebase SDK v10 (Modular CDN) để giữ nguyên các hàm global cho sự kiện onclick
    (async function initFirebaseV10() {
      try {
        const [appMod, authMod, firestoreMod] = await Promise.all([
          import('https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js'),
          import('https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js'),
          import('https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js')
        ]);

        fbModules = { ...authMod, ...firestoreMod };
        const app = appMod.initializeApp(FIREBASE_CONFIG);
        fbAuth = authMod.getAuth(app);
        fbDb = firestoreMod.getFirestore(app);

        // Lắng nghe trạng thái đăng nhập thời gian thực
        authMod.onAuthStateChanged(fbAuth, async (user) => {
          currentUser = user;
          if (user) {
            await checkDailyLoginAndSyncProfile(user);
          } else {
            currentUserProfile = { xp: 0, level: 1, streak: 0, lastLoginDate: null };
          }
          updateAuthUI();
          listenUserReportsFromFirestore(user);
        });
      } catch (err) {
        console.error('Lỗi khởi tạo Firebase v10:', err);
      }
    })();

    // Chuyển đổi username thành định dạng email hợp lệ nếu người dùng chỉ nhập tên tài khoản
    function formatUsernameToEmail(input) {
      return input.includes('@') ? input : `${input.toLowerCase()}@vlabs.edu.vn`;
    }

    function getCurrentUser() {
      return currentUser;
    }

    function openAuthModal(mode = 'login') {
      switchAuthMode(mode);
      document.getElementById('auth-modal').classList.remove('hidden');
      document.getElementById('auth-modal').classList.add('flex');
    }

    function closeAuthModal() {
      document.getElementById('auth-modal').classList.add('hidden');
      document.getElementById('auth-modal').classList.remove('flex');
      document.getElementById('auth-alert').classList.add('hidden');
      document.getElementById('auth-form').reset();
    }

    function switchAuthMode(mode) {
      authMode = mode;
      const tabLogin = document.getElementById('modal-tab-login');
      const tabRegister = document.getElementById('modal-tab-register');
      const fullnameGroup = document.getElementById('fullname-group');
      const title = document.getElementById('auth-modal-title');
      const submitBtn = document.getElementById('auth-submit-btn');
      document.getElementById('auth-alert').classList.add('hidden');

      if (mode === 'login') {
        tabLogin.className = 'flex-1 py-1.5 text-xs font-bold rounded-lg bg-sky-600 text-white transition';
        tabRegister.className = 'flex-1 py-1.5 text-xs font-bold rounded-lg text-slate-400 hover:text-white transition';
        fullnameGroup.classList.add('hidden');
        title.textContent = 'Chào mừng trở lại V-LABS';
        submitBtn.textContent = 'Đăng nhập ngay';
      } else {
        tabRegister.className = 'flex-1 py-1.5 text-xs font-bold rounded-lg bg-sky-600 text-white transition';
        tabLogin.className = 'flex-1 py-1.5 text-xs font-bold rounded-lg text-slate-400 hover:text-white transition';
        fullnameGroup.classList.remove('hidden');
        title.textContent = 'Tạo tài khoản V-LABS mới';
        submitBtn.textContent = 'Đăng ký tài khoản';
      }
    }

    function showAuthAlert(msg, isError = true) {
      const alertBox = document.getElementById('auth-alert');
      alertBox.textContent = msg;
      alertBox.className = `text-xs p-2.5 rounded-xl mb-3 border ${
        isError
          ? 'bg-rose-500/10 border-rose-500/30 text-rose-300'
          : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
      }`;
    }

    async function handleAuthSubmit(e) {
      e.preventDefault();
      if (!fbAuth) {
        showAuthAlert('Hệ thống Firebase đang tải hoặc chưa cấu hình API Key!');
        return;
      }

      const rawUsername = document.getElementById('auth-username').value.trim();
      const email = formatUsernameToEmail(rawUsername);
      const password = document.getElementById('auth-password').value.trim();
      const fullname = document.getElementById('auth-fullname').value.trim();
      const submitBtn = document.getElementById('auth-submit-btn');

      submitBtn.disabled = true;
      submitBtn.textContent = 'Đang xử lý...';

      try {
        if (authMode === 'register') {
          const userCred = await fbModules.createUserWithEmailAndPassword(fbAuth, email, password);
          await fbModules.updateProfile(userCred.user, {
            displayName: fullname || rawUsername
          });
          currentUser = fbAuth.currentUser;
          updateAuthUI();
        } else {
          await fbModules.signInWithEmailAndPassword(fbAuth, email, password);
        }
        closeAuthModal();
      } catch (err) {
        let msg = 'Đã xảy ra lỗi xác thực (' + err.code + ')';
        if (err.code === 'auth/email-already-in-use') msg = 'Tài khoản này đã được đăng ký!';
        else if (err.code === 'auth/weak-password') msg = 'Mật khẩu phải có ít nhất 6 ký tự!';
        else if (err.code === 'auth/invalid-credential' || err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password') {
          msg = 'Sai tên tài khoản hoặc mật khẩu!';
        }
        showAuthAlert(msg);
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = authMode === 'login' ? 'Đăng nhập ngay' : 'Đăng ký tài khoản';
      }
    }

    async function handleLogout() {
      if (!fbAuth) return;
      await fbModules.signOut(fbAuth);
    }

    function updateAuthUI() {
      const guestView = document.getElementById('guest-view');
      const userView = document.getElementById('user-view');
      const displayUsername = document.getElementById('display-username');

      if (currentUser) {
        guestView.classList.add('hidden');
        userView.classList.remove('hidden');
        userView.classList.add('flex');
        const fallbackName = currentUser.email ? currentUser.email.split('@')[0] : 'User';
        displayUsername.textContent = currentUser.displayName || fallbackName;

        // Cập nhật thông tin Gamification lên Header
        const info = getLevelAndTierInfo(currentUserProfile.xp || 0);
        const levelBadge = document.getElementById('user-level-badge');
        const tierTitle = document.getElementById('user-tier-title');
        const streakCount = document.getElementById('user-streak-count');
        const xpBar = document.getElementById('user-xp-bar');
        const xpText = document.getElementById('user-xp-text');

        if (levelBadge) levelBadge.textContent = `Lv.${info.level}`;
        if (tierTitle) {
          tierTitle.textContent = info.tierTitle;
          tierTitle.className = `text-[11px] font-bold leading-none ${info.tierColor}`;
        }
        if (streakCount) streakCount.textContent = currentUserProfile.streak || 0;
        if (xpBar) xpBar.style.width = `${info.progressPercent}%`;
        if (xpText) xpText.textContent = `${currentUserProfile.xp || 0} / ${info.maxXP} XP`;
      } else {
        guestView.classList.remove('hidden');
        userView.classList.add('hidden');
        userView.classList.remove('flex');
      }
      renderCloudHistory();
    }

    // --- ĐỒNG BỘ DỮ LIỆU THỜI GIAN THỰC VỚI CLOUD FIRESTORE ---
    function listenUserReportsFromFirestore(user) {
      if (unsubscribeReports) {
        unsubscribeReports();
        unsubscribeReports = null;
      }

      if (!user || !fbDb) {
        cloudReportsCache = [];
        renderCloudHistory();
        return;
      }

      const q = fbModules.query(
        fbModules.collection(fbDb, 'vlabs_reports'),
        fbModules.where('uid', '==', user.uid)
      );

      unsubscribeReports = fbModules.onSnapshot(q, (snapshot) => {
        const items = [];
        snapshot.forEach((docSnap) => {
          items.push({ id: docSnap.id, ...docSnap.data() });
        });
        // Sắp xếp bản ghi mới nhất lên đầu
        items.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        cloudReportsCache = items;
        renderCloudHistory();
      });
    }

    async function saveReportToCloud() {
      if (!currentUser) {
        openAuthModal('login');
        showAuthAlert('Vui lòng đăng nhập tài khoản trước khi lưu báo cáo lên Cloud Firestore!');
        return;
      }

      const cfg = SUBJECT_CONFIG[currentSubject];
      const params = getCurrentParams();
      const note = document.getElementById('report-note').value.trim() || 'Không có ghi chú thêm';

      try {
        await fbModules.addDoc(fbModules.collection(fbDb, 'vlabs_reports'), {
          uid: currentUser.uid,
          subjectKey: currentSubject,
          subjectName: cfg.name,
          params,
          labels: {
            p1: `${cfg.p1.label}: ${params.param1} ${cfg.p1.unit}`,
            p2: `${cfg.p2.label}: ${params.param2} ${cfg.p2.unit}`,
            p3: `${cfg.p3.label}: ${params.param3} ${cfg.p3.unit}`
          },
          note,
          timestamp: new Date().toLocaleString('vi-VN'),
          createdAt: Date.now()
        });
        document.getElementById('report-note').value = '';
		// Cộng 50 XP khi lưu báo cáo thành công lên Cloud
        await awardUserXP(50, 'Lưu báo cáo thí nghiệm lên Cloud');
      } catch (err) {
        console.error('Lỗi khi lưu báo cáo lên Firestore:', err);
        alert('Không thể lưu lên Cloud Firestore. Vui lòng kiểm tra Firestore Rules hoặc kết nối mạng!');
      }
    }

    function loadReportFromCloud(reportId) {
      const item = cloudReportsCache.find(r => r.id === reportId);
      if (!item) return;

      // Gọi đúng hàm khởi tạo thí nghiệm 3D theo mã bài đã lưu trên Cloud
      if (typeof window.initExperiment === 'function') {
        window.initExperiment(item.subjectKey);
      } else {
        switchSubject('physics', item.subjectKey);
      }

      // Đợi DOM render xong rồi gán lại giá trị thanh trượt và ghi chú
      setTimeout(() => {
        const p1El = document.getElementById('param1');
        const p2El = document.getElementById('param2');
        const p3El = document.getElementById('param3');

        if (p1El) { p1El.value = item.params.param1; document.getElementById('val-param1').textContent = item.params.param1; }
        if (p2El) { p2El.value = item.params.param2; document.getElementById('val-param2').textContent = item.params.param2; }
        if (p3El) { p3El.value = item.params.param3; document.getElementById('val-param3').textContent = item.params.param3; }

        const noteEl = document.getElementById('report-note');
        if (noteEl) noteEl.value = item.note || '';

        // Kích hoạt cập nhật lại thông số mô hình 3D
        if (typeof updateExperiment6Params === 'function') {
          updateExperiment6Params();
        }
      }, 120);
    }

    async function deleteReport(reportId) {
      if (!fbDb) return;
      try {
        await fbModules.deleteDoc(fbModules.doc(fbDb, 'vlabs_reports', reportId));
      } catch (err) {
        console.error('Lỗi xóa bản ghi:', err);
      }
    }

    async function clearAllUserReports() {
      if (!currentUser || !fbDb || cloudReportsCache.length === 0) return;
      try {
        await Promise.all(
          cloudReportsCache.map(r => fbModules.deleteDoc(fbModules.doc(fbDb, 'vlabs_reports', r.id)))
        );
      } catch (err) {
        console.error('Lỗi xóa toàn bộ báo cáo:', err);
      }
    }

    function renderCloudHistory() {
      const listEl = document.getElementById('cloud-history-list');
      const badgeEl = document.getElementById('cloud-count-badge');

      if (!currentUser) {
        badgeEl.textContent = 'Chưa đăng nhập';
        listEl.innerHTML = `
          <div class="text-center py-8 px-3 bg-slate-800/30 rounded-xl border border-dashed border-slate-700">
            <i class="fa-solid fa-lock text-slate-500 text-2xl mb-2"></i>
            <p class="text-xs text-slate-400">Đăng nhập tài khoản để đồng bộ và lưu trữ báo cáo thí nghiệm trên Cloud Firestore.</p>
          </div>
        `;
        return;
      }

      badgeEl.textContent = `${cloudReportsCache.length} bản ghi`;
      const displayName = currentUser.displayName || currentUser.email.split('@')[0];

      if (cloudReportsCache.length === 0) {
        listEl.innerHTML = `
          <div class="text-center py-8 px-3 bg-slate-800/30 rounded-xl border border-dashed border-slate-700">
            <i class="fa-regular fa-folder-open text-slate-500 text-2xl mb-2"></i>
            <p class="text-xs text-slate-400">Tài khoản <b>${displayName}</b> chưa có báo cáo nào trên Firestore. Hãy nhấn nút Lưu ở trên!</p>
          </div>
        `;
        return;
      }

      listEl.innerHTML = cloudReportsCache.map(r => `
        <div class="bg-slate-800/60 hover:bg-slate-800 border border-slate-700/70 rounded-xl p-3 transition group">
          <div class="flex items-center justify-between mb-1.5">
            <span class="text-xs font-bold text-sky-400">${r.subjectName}</span>
            <span class="text-[10px] text-slate-400 font-mono">${r.timestamp}</span>
          </div>
          <div class="text-[11px] text-slate-300 space-y-0.5 font-mono mb-1.5">
            <div>• ${r.labels.p1}</div>
            <div>• ${r.labels.p2}</div>
            <div>• ${r.labels.p3}</div>
          </div>
          <p class="text-xs text-amber-300/90 italic truncate mb-2">"${r.note}"</p>
          <div class="flex items-center justify-end gap-2 pt-1 border-t border-slate-700/50">
            <button onclick="loadReportFromCloud('${r.id}')"
              class="text-[11px] px-2.5 py-1 rounded-lg bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 font-medium transition">
              <i class="fa-solid fa-rotate mr-1"></i>Nạp lại
            </button>
            <button onclick="deleteReport('${r.id}')"
              class="text-[11px] px-2 py-1 rounded-lg bg-rose-500/15 hover:bg-rose-500/30 text-rose-300 transition">
              <i class="fa-solid fa-trash"></i>
            </button>
          </div>
        </div>
      `).join('');
    }
