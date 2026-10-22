let fbFirestoreMod;
let isForumInitialized = false;

window.openForum = async function() {
  const modal = document.getElementById('forum-modal');
  modal.classList.remove('hidden');
  modal.classList.add('flex');

  if (typeof currentUser === 'undefined' || !currentUser) {
    alert("Vui lòng đăng nhập để tham gia Cộng đồng V-LABS!");
    window.closeForum();
    return;
  }

  if (!isForumInitialized) {
    try {
      // SỬA LỖI Ở ĐÂY: Gọi thêm module App để nối luồng với firebase-service.js
      const fbAppMod = await import('https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js');
      fbFirestoreMod = await import('https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js');
      
      // Lấy ứng dụng đã khởi tạo từ bên kia sang làm cơ sở dữ liệu cho diễn đàn
      const app = fbAppMod.getApp();
      window.fbDb = fbFirestoreMod.getFirestore(app);

      isForumInitialized = true;
      listenToForumPosts();
    } catch (err) {
      console.error("Lỗi khởi tạo module Diễn đàn:", err);
    }
  }
};

window.closeForum = function() {
  const modal = document.getElementById('forum-modal');
  modal.classList.add('hidden');
  modal.classList.remove('flex');
};

// Đăng bài (Chỉ có text)
window.submitPost = async function() {
  const contentInput = document.getElementById('post-content');
  const submitBtn = document.getElementById('btn-submit-post');
  const content = contentInput.value.trim();

  if (!content) {
    alert("Vui lòng nhập nội dung bài viết!");
    return;
  }

  submitBtn.disabled = true;
  submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang đăng...';

  try {
    await fbFirestoreMod.addDoc(fbFirestoreMod.collection(window.fbDb, 'vlabs_forum'), {
      uid: currentUser.uid,
      authorName: currentUser.displayName || currentUser.email.split('@')[0],
      content: content,
      likes: 0,
      createdAt: Date.now()
    });

    contentInput.value = '';
    
    // Gọi hàm thưởng XP nếu có (Gamification)
    if (typeof addXP === 'function') addXP(30, "Đăng bài chia sẻ lên Cộng đồng");

  } catch (err) {
    console.error("Lỗi đăng bài:", err);
    alert("Đã xảy ra lỗi khi đăng bài!");
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerHTML = 'Đăng bài';
  }
};

// Hiển thị bài viết
function listenToForumPosts() {
  const q = fbFirestoreMod.query(
    fbFirestoreMod.collection(window.fbDb, 'vlabs_forum'),
    fbFirestoreMod.orderBy('createdAt', 'desc')
  );

  fbFirestoreMod.onSnapshot(q, (snapshot) => {
    const feedContainer = document.getElementById('forum-feed');
    if (snapshot.empty) {
      feedContainer.innerHTML = `<div class="text-center p-8 text-slate-500 text-sm">Chưa có bài đăng nào. Hãy là người đầu tiên chia sẻ!</div>`;
      return;
    }

    let html = '';
    snapshot.forEach((docSnap) => {
      const post = docSnap.data();
      const date = new Date(post.createdAt).toLocaleString('vi-VN');
      
      html += `
        <div class="bg-slate-800/60 border border-slate-700/60 rounded-xl p-4">
          <div class="flex items-center gap-3 mb-2">
            <div class="w-8 h-8 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold">
              <i class="fa-solid fa-user-astronaut"></i>
            </div>
            <div>
              <div class="text-sm font-bold text-slate-200">${post.authorName}</div>
              <div class="text-[10px] text-slate-400">${date}</div>
            </div>
          </div>
          <p class="text-sm text-slate-300 whitespace-pre-wrap leading-relaxed">${post.content}</p>
        </div>
      `;
    });
    feedContainer.innerHTML = html;
  });
}