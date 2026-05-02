// ========== البيانات الأساسية ==========
let words = [];
let scientificTerms = [];
let userStats = {
    streak: 0,
    lastStudyDate: null,
    dailyCorrect: {},
    quizHistory: [],
    enableImages: false,
    language: 'ar'
};
let currentQuiz = [];
let quizIndex = 0;
let quizScore = 0;
let quizType = 'multiple';
let currentReviewQueue = [];
let progressChart, levelChart;

// ========== الاتصال بـ Vercel Functions (آمن) ==========
async function fetchImageFromUnsplash(word) {
    try {
        const response = await fetch('/api/unsplash', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ word: word })
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        const data = await response.json();
        return data.success ? data.imageUrl : null;
    } catch (error) {
        console.error('Error fetching image from Unsplash function:', error);
        return null;
    }
}

async function callDeepSeekAPI(action, data) {
    try {
        showLoading(true, 'جاري الاتصال بالذكاء الاصطناعي...');
        const response = await fetch('/api/deepseek', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action, ...data })
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const result = await response.json();
        return result;
    } catch (error) {
        console.error('DeepSeek API error:', error);
        showToast(`خطأ في الاتصال: ${error.message}`, 'error');
        return null;
    } finally {
        showLoading(false);
    }
}

// ========== دوال التواريخ والبيانات ==========
function getTodayDate() {
    return new Date().toISOString().split('T')[0];
}

function createWordObj(word, translation, example, category = 'عام', imageUrl = null) {
    return {
        id: Date.now() + Math.random(),
        word: word,
        translation: translation,
        example: example || '',
        category: category,
        level: 1,
        nextReviewDate: getTodayDate(),
        timesReviewed: 0,
        correctStreak: 0,
        createdAt: getTodayDate(),
        imageUrl: imageUrl
    };
}

function saveData() {
    localStorage.setItem('smartlearn_words', JSON.stringify(words));
    localStorage.setItem('smartlearn_stats', JSON.stringify(userStats));
    localStorage.setItem('enableImages', userStats.enableImages);
    localStorage.setItem('app_language', userStats.language);
}

function loadData() {
    const savedWords = localStorage.getItem('smartlearn_words');
    if (savedWords) words = JSON.parse(savedWords);
    
    const savedStats = localStorage.getItem('smartlearn_stats');
    if (savedStats) {
        userStats = JSON.parse(savedStats);
        if (!userStats.dailyCorrect) userStats.dailyCorrect = {};
        if (!userStats.quizHistory) userStats.quizHistory = [];
        if (userStats.enableImages === undefined) userStats.enableImages = false;
    }
    
    const lang = localStorage.getItem('app_language');
    if (lang) userStats.language = lang;
    
    updateStreak();
    
    if (typeof scientificTermsDB !== 'undefined') {
        scientificTerms = scientificTermsDB;
    }
    updateScientificUI();
    applyLanguage();
}

function updateStreak() {
    const today = getTodayDate();
    if (userStats.lastStudyDate !== today) {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        if (userStats.lastStudyDate === yesterday.toISOString().split('T')[0]) {
            userStats.streak++;
        } else {
            userStats.streak = 1;
        }
        userStats.lastStudyDate = today;
        saveData();
    }
}

function getDueWords() {
    const today = getTodayDate();
    return words.filter(w => w.nextReviewDate <= today);
}

function updateWordLevel(word, isCorrect) {
    if (isCorrect) {
        word.correctStreak++;
        word.level = Math.min(5, word.level + 1);
        const intervals = {1: 1, 2: 3, 3: 7, 4: 15, 5: 30};
        const nextDate = new Date();
        nextDate.setDate(nextDate.getDate() + intervals[word.level]);
        word.nextReviewDate = nextDate.toISOString().split('T')[0];
        const today = getTodayDate();
        userStats.dailyCorrect[today] = (userStats.dailyCorrect[today] || 0) + 1;
    } else {
        word.correctStreak = 0;
        word.level = Math.max(1, word.level - 1);
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        word.nextReviewDate = tomorrow.toISOString().split('T')[0];
    }
    word.timesReviewed++;
    saveData();
    updateDashboard();
}

// ========== عرض الكلمات مع الصور ==========
function renderWords() {
    const search = document.getElementById('searchInput')?.value.toLowerCase() || '';
    const filtered = words.filter(w => w.word.toLowerCase().includes(search));
    const container = document.getElementById('wordsList');
    
    if (!container) return;
    
    if (!filtered.length) {
        container.innerHTML = '<div class="card text-center">لا توجد كلمات. أضف كلمات جديدة!</div>';
        return;
    }
    
    container.innerHTML = filtered.map(w => `
        <div class="word-item">
            ${w.imageUrl ? `<img src="${escapeHtml(w.imageUrl)}" class="word-image" alt="${escapeHtml(w.word)}">` : 
                           `<div class="word-image" style="background: #e0e0e0; display: flex; align-items: center; justify-content: center;"><i class="fas fa-image"></i></div>`}
            <div class="word-info">
                <h4>${escapeHtml(w.word)} <span class="level-badge level-${w.level}">مستوى ${w.level}</span></h4>
                <p>${escapeHtml(w.translation)}</p>
                ${w.example ? `<small><i class="fas fa-quote-right"></i> ${escapeHtml(w.example)}</small>` : ''}
            </div>
            <div class="word-actions">
                <button onclick="speakWord('${w.id}')" title="نطق"><i class="fas fa-volume-up"></i></button>
                <button onclick="fetchSingleImage('${w.id}')" title="جلب صورة"><i class="fas fa-image"></i></button>
                <button onclick="editWord('${w.id}')" title="تعديل"><i class="fas fa-edit"></i></button>
                <button onclick="deleteWord('${w.id}')" title="حذف"><i class="fas fa-trash"></i></button>
            </div>
        </div>
    `).join('');
}

async function fetchSingleImage(id) {
    const word = words.find(w => w.id == id);
    if (!word) return;
    
    const isEnabled = userStats.enableImages;
    if (!isEnabled) {
        showToast('⚠️ قم بتفعيل جلب الصور من الإعدادات أولاً', 'warning');
        return;
    }
    
    showLoading(true, 'جاري البحث عن صورة للكلمة...');
    const imageUrl = await fetchImageFromUnsplash(word.word);
    
    if (imageUrl) {
        word.imageUrl = imageUrl;
        saveData();
        renderWords();
        showToast(`✅ تمت إضافة صورة لـ "${word.word}"`, 'success');
    } else {
        showToast(`⚠️ لم نتمكن من العثور على صورة مناسبة لـ "${word.word}"`, 'warning');
    }
    showLoading(false);
}

async function fetchMissingImages() {
    if (!userStats.enableImages) {
        showToast('قم بتفعيل جلب الصور من الإعدادات أولاً', 'warning');
        return;
    }
    
    showLoading(true, 'جاري جلب الصور للكلمات...');
    let count = 0;
    
    for (const word of words) {
        if (!word.imageUrl) {
            const imageUrl = await fetchImageFromUnsplash(word.word);
            if (imageUrl) {
                word.imageUrl = imageUrl;
                count++;
                await new Promise(r => setTimeout(r, 500));
            }
        }
    }
    
    saveData();
    renderWords();
    showLoading(false);
    showToast(`✅ تمت إضافة ${count} صورة جديدة`, 'success');
}

function toggleImageFetch() {
    const checkbox = document.getElementById('enableImageFetch');
    userStats.enableImages = checkbox.checked;
    saveData();
    showToast(userStats.enableImages ? '✅ تم تفعيل جلب الصور' : '❌ تم تعطيل جلب الصور', 'info');
}

// ========== المصطلحات العلمية ==========
function updateScientificUI() {
    const countSpan = document.getElementById('scientificCount');
    if (countSpan) countSpan.innerText = scientificTerms.length;
    renderScientificTerms();
}

function renderScientificTerms() {
    const search = document.getElementById('scientificSearchInput')?.value.toLowerCase() || '';
    const filtered = scientificTerms.filter(t => t.word.toLowerCase().includes(search) || t.translation.includes(search));
    const container = document.getElementById('scientificTermsList');
    
    if (!container) return;
    
    if (!filtered.length) {
        container.innerHTML = '<div class="card text-center">لا توجد مصطلحات تطابق البحث</div>';
        return;
    }
    
    container.innerHTML = filtered.map(term => {
        const isAdded = words.some(w => w.word.toLowerCase() === term.word.toLowerCase());
        return `
            <div class="scientific-term-item">
                <div class="scientific-term-info">
                    <h4>${escapeHtml(term.word)} <span style="color: var(--primary);">→ ${escapeHtml(term.translation)}</span></h4>
                    <p><i class="fas fa-quote-right"></i> ${escapeHtml(term.example)}</p>
                    <small>📚 ${escapeHtml(term.category)}</small>
                </div>
                <div class="scientific-term-actions">
                    <button onclick="speakScientificTerm('${escapeHtml(term.word)}')" title="نطق"><i class="fas fa-volume-up"></i></button>
                    ${!isAdded ? 
                        `<button class="btn-add-term" onclick="addScientificTerm('${escapeHtml(term.word)}', '${escapeHtml(term.translation)}', '${escapeHtml(term.example)}')">➕ إضافة</button>` : 
                        `<button class="btn-add-term added" disabled>✓ مضافة</button>`}
                </div>
            </div>
        `;
    }).join('');
    
    const addedCount = scientificTerms.filter(term => words.some(w => w.word.toLowerCase() === term.word.toLowerCase())).length;
    const addedSpan = document.getElementById('scientificAddedCount');
    if (addedSpan) addedSpan.innerText = addedCount;
}

function filterScientificTerms() {
    renderScientificTerms();
}

function speakScientificTerm(word) {
    const utterance = new SpeechSynthesisUtterance(word);
    utterance.lang = 'en-US';
    utterance.rate = parseFloat(document.getElementById('speechRate')?.value || 0.9);
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
}

function addScientificTerm(word, translation, example) {
    if (words.some(w => w.word.toLowerCase() === word.toLowerCase())) {
        showToast('⚠️ هذا المصطلح موجود مسبقاً', 'warning');
        return;
    }
    
    words.unshift(createWordObj(word, translation, example, 'علمي'));
    saveData();
    renderWords();
    renderScientificTerms();
    updateDashboard();
    showToast(`✅ تمت إضافة "${word}" إلى مكتبتك`, 'success');
}

function loadScientificTerms() {
    let addedCount = 0;
    for (const term of scientificTerms) {
        if (!words.some(w => w.word.toLowerCase() === term.word.toLowerCase())) {
            words.unshift(createWordObj(term.word, term.translation, term.example, 'علمي'));
            addedCount++;
        }
    }
    saveData();
    renderWords();
    renderScientificTerms();
    updateDashboard();
    showToast(`✅ تمت إضافة ${addedCount} مصطلحاً علمياً إلى مكتبتك`, 'success');
}

// ========== إدارة الكلمات ==========
let editingId = null;

function openWordModal() {
    document.getElementById('wordModal').classList.add('open');
}

function closeWordModal() {
    document.getElementById('wordModal').classList.remove('open');
    editingId = null;
    document.getElementById('wordInput').value = '';
    document.getElementById('translationInput').value = '';
    document.getElementById('exampleInput').value = '';
    document.getElementById('fetchImageCheckbox').checked = false;
}

async function saveWord() {
    const word = document.getElementById('wordInput').value.trim();
    const translation = document.getElementById('translationInput').value.trim();
    const example = document.getElementById('exampleInput').value.trim();
    const category = document.getElementById('categoryInput').value;
    const fetchImage = document.getElementById('fetchImageCheckbox')?.checked || false;
    
    if (!word || !translation) {
        showToast('يرجى إدخال الكلمة والترجمة', 'error');
        return;
    }
    
    let imageUrl = null;
    if (fetchImage && userStats.enableImages) {
        showLoading(true, 'جاري البحث عن صورة...');
        imageUrl = await fetchImageFromUnsplash(word);
        showLoading(false);
    }
    
    if (editingId) {
        const existing = words.find(w => w.id == editingId);
        if (existing) {
            existing.word = word;
            existing.translation = translation;
            existing.example = example;
            existing.category = category;
            if (imageUrl) existing.imageUrl = imageUrl;
            showToast('تم التحديث', 'success');
        }
        editingId = null;
    } else {
        words.unshift(createWordObj(word, translation, example, category, imageUrl));
        showToast('تمت الإضافة', 'success');
    }
    
    saveData();
    renderWords();
    updateDashboard();
    closeWordModal();
}

function editWord(id) {
    const w = words.find(w => w.id == id);
    if (!w) return;
    
    document.getElementById('wordInput').value = w.word;
    document.getElementById('translationInput').value = w.translation;
    document.getElementById('exampleInput').value = w.example || '';
    document.getElementById('categoryInput').value = w.category || 'عام';
    editingId = id;
    openWordModal();
}

function deleteWord(id) {
    if (confirm('هل أنت متأكد من حذف هذه الكلمة؟')) {
        words = words.filter(w => w.id != id);
        saveData();
        renderWords();
        updateDashboard();
        showToast('تم الحذف', 'info');
    }
}

function loadDefaultCategories() {
    if (typeof vocabularyDB !== 'undefined') {
        for (const cat in vocabularyDB) {
            for (const w of vocabularyDB[cat]) {
                if (!words.some(ex => ex.word.toLowerCase() === w.word.toLowerCase())) {
                    words.push(createWordObj(w.word, w.translation, w.example, cat));
                }
            }
        }
        saveData();
        renderWords();
        updateDashboard();
        showToast(`تم تحميل ${words.length} كلمة من جميع المجالات`, 'success');
    }
}

// ========== المراجعة الذكية ==========
function startReview() {
    currentReviewQueue = getDueWords();
    
    if (!currentReviewQueue.length) {
        document.getElementById('reviewContainer').innerHTML = `
            <div class="card text-center">
                <i class="fas fa-check-circle" style="font-size: 48px; color: var(--success);"></i>
                <h3>🎉 لا توجد كلمات مستحقة اليوم!</h3>
            </div>`;
        updateReviewProgress();
        return;
    }
    
    showReviewCard(0);
}

function showReviewCard(index) {
    if (index >= currentReviewQueue.length) {
        document.getElementById('reviewContainer').innerHTML = `
            <div class="card text-center">
                <i class="fas fa-trophy" style="font-size: 48px; color: var(--warning);"></i>
                <h3>🎉 أكملت المراجعة!</h3>
                <button class="btn-primary" onclick="startReview()">مراجعة جديدة</button>
            </div>`;
        updateReviewProgress();
        updateDashboard();
        return;
    }
    
    const word = currentReviewQueue[index];
    let showingAnswer = false;
    
    document.getElementById('reviewContainer').innerHTML = `
        <div class="flashcard" id="reviewFlashcard">
            <div id="frontSide">
                ${word.imageUrl ? `<img src="${escapeHtml(word.imageUrl)}" alt="${escapeHtml(word.word)}">` : ''}
                <h1>${escapeHtml(word.word)}</h1>
                <button class="btn-outline" onclick="event.stopPropagation(); speakWord('${word.id}')">
                    <i class="fas fa-volume-up"></i> استماع
                </button>
                <p class="mt-3"><small>👆 اضغط لإظهار الترجمة</small></p>
            </div>
            <div id="backSide" style="display: none;">
                <h2>📖 ${escapeHtml(word.translation)}</h2>
                ${word.example ? `<p><i class="fas fa-quote-right"></i> ${escapeHtml(word.example)}</p>` : ''}
                <div class="rating-buttons">
                    <button class="rating-btn hard" onclick="rateReviewWord(${index}, false)">😫 صعب</button>
                    <button class="rating-btn medium" onclick="rateReviewWord(${index}, false)">🤔 صعب قليلاً</button>
                    <button class="rating-btn good" onclick="rateReviewWord(${index}, true)">👍 جيد</button>
                    <button class="rating-btn easy" onclick="rateReviewWord(${index}, true)">⭐ سهل</button>
                </div>
            </div>
        </div>
        <div class="progress-bar mt-3">
            <div class="progress-fill" style="width: ${((index + 1) / currentReviewQueue.length) * 100}%"></div>
        </div>
    `;
    
    const card = document.getElementById('reviewFlashcard');
    card.onclick = (e) => {
        if (e.target.tagName === 'BUTTON') return;
        showingAnswer = !showingAnswer;
        document.getElementById('frontSide').style.display = showingAnswer ? 'none' : 'block';
        document.getElementById('backSide').style.display = showingAnswer ? 'block' : 'none';
    };
}

function rateReviewWord(index, isCorrect) {
    updateWordLevel(currentReviewQueue[index], isCorrect);
    showReviewCard(index + 1);
}

function updateReviewProgress() {
    const due = getDueWords().length;
    document.getElementById('dueCountText').innerHTML = `${due} كلمة`;
    document.getElementById('sidebarReviewBadge').innerText = due;
    
    const reviewedToday = words.filter(w => w.nextReviewDate > getTodayDate()).length;
    const percent = due === 0 ? 100 : Math.min(100, (reviewedToday / due) * 100);
    document.getElementById('reviewProgress').style.width = `${percent}%`;
}

// ========== الاختبارات ==========
function startQuiz() {
    const type = document.getElementById('quizType').value;
    const source = document.getElementById('quizSource').value;
    
    let pool = source === 'due' ? getDueWords() : [...words];
    
    if (pool.length < 2) {
        document.getElementById('quizContainer').innerHTML = `
            <div class="card text-center">
                <i class="fas fa-exclamation-triangle" style="font-size: 48px; color: var(--warning);"></i>
                <h3>⚠️ تحتاج على الأقل كلمتين للاختبار</h3>
            </div>`;
        return;
    }
    
    currentQuiz = [...pool].sort(() => 0.5 - Math.random()).slice(0, 10);
    quizIndex = 0;
    quizScore = 0;
    quizType = type;
    document.getElementById('quizResult').innerHTML = '';
    
    if (type === 'multiple') showMultipleChoice();
    else if (type === 'writing') showWriting();
    else if (type === 'flashcard') showFlashcardQuiz();
    else if (type === 'truefalse') showTrueFalse();
}

function showMultipleChoice() {
    if (quizIndex >= currentQuiz.length) {
        finishQuiz();
        return;
    }
    
    const word = currentQuiz[quizIndex];
    const correct = word.translation;
    
    let otherTranslations = words.filter(w => w.id !== word.id).map(w => w.translation);
    otherTranslations = [...new Set(otherTranslations)];
    let wrongOptions = otherTranslations.sort(() => 0.5 - Math.random()).slice(0, 3);
    let options = [correct, ...wrongOptions];
    while (options.length < 4) options.push('???');
    options.sort(() => 0.5 - Math.random());
    
    const progress = (quizIndex / currentQuiz.length) * 100;
    
    document.getElementById('quizContainer').innerHTML = `
        <div class="quiz-progress"><div class="quiz-progress-fill" style="width: ${progress}%"></div></div>
        <div class="card text-center">
            <div class="quiz-stats">السؤال ${quizIndex + 1} من ${currentQuiz.length} | النقاط: ${quizScore}</div>
            ${word.imageUrl ? `<img src="${escapeHtml(word.imageUrl)}" style="max-width: 200px; border-radius: 12px; margin: 10px auto;">` : ''}
            <h2>📖 معنى كلمة "${escapeHtml(word.word)}"؟</h2>
            <button class="btn-outline mb-3" onclick="speakWord('${word.id}')"><i class="fas fa-volume-up"></i> استماع</button>
            <div class="quiz-options-grid">
                ${options.map(opt => `<button class="quiz-option" onclick="checkMultipleChoice('${escapeHtml(opt)}', '${escapeHtml(correct)}')">${escapeHtml(opt)}</button>`).join('')}
            </div>
        </div>
    `;
}

function checkMultipleChoice(selected, correct) {
    const isCorrect = selected === correct;
    const word = currentQuiz[quizIndex];
    
    if (isCorrect) {
        quizScore++;
        updateWordLevel(word, true);
        showToast('✅ إجابة صحيحة!', 'success');
    } else {
        updateWordLevel(word, false);
        showToast(`❌ خطأ! الإجابة الصحيحة: ${correct}`, 'error');
    }
    
    quizIndex++;
    showMultipleChoice();
}

function showWriting() {
    if (quizIndex >= currentQuiz.length) {
        finishQuiz();
        return;
    }
    
    const word = currentQuiz[quizIndex];
    const progress = (quizIndex / currentQuiz.length) * 100;
    
    document.getElementById('quizContainer').innerHTML = `
        <div class="quiz-progress"><div class="quiz-progress-fill" style="width: ${progress}%"></div></div>
        <div class="card text-center">
            <div class="quiz-stats">السؤال ${quizIndex + 1} من ${currentQuiz.length} | النقاط: ${quizScore}</div>
            ${word.imageUrl ? `<img src="${escapeHtml(word.imageUrl)}" style="max-width: 200px; border-radius: 12px; margin: 10px auto;">` : ''}
            <h2>✍️ اكتب ترجمة "${escapeHtml(word.word)}"</h2>
            <button class="btn-outline mb-3" onclick="speakWord('${word.id}')"><i class="fas fa-volume-up"></i> استماع</button>
            <input type="text" id="writingAnswer" class="form-input" placeholder="اكتب الترجمة هنا...">
            <button class="btn-primary mt-2" onclick="checkWriting('${escapeHtml(word.translation)}')">تحقق</button>
        </div>
    `;
    
    document.getElementById('writingAnswer')?.focus();
}

function checkWriting(correct) {
    const answer = document.getElementById('writingAnswer')?.value.trim();
    const normalize = (s) => s?.replace(/[ًٌٍَُِّْ]/g, '').trim().toLowerCase();
    const isCorrect = normalize(answer) === normalize(correct);
    const word = currentQuiz[quizIndex];
    
    if (isCorrect) {
        quizScore++;
        updateWordLevel(word, true);
        showToast('✅ إجابة صحيحة!', 'success');
    } else {
        updateWordLevel(word, false);
        showToast(`❌ خطأ! الإجابة الصحيحة: ${correct}`, 'error');
    }
    
    quizIndex++;
    showWriting();
}

function showFlashcardQuiz() {
    if (quizIndex >= currentQuiz.length) {
        finishQuiz();
        return;
    }
    
    const word = currentQuiz[quizIndex];
    let showingAnswer = false;
    const progress = (quizIndex / currentQuiz.length) * 100;
    
    document.getElementById('quizContainer').innerHTML = `
        <div class="quiz-progress"><div class="quiz-progress-fill" style="width: ${progress}%"></div></div>
        <div class="flashcard" id="flashcardQuiz">
            <div id="flashFront">
                ${word.imageUrl ? `<img src="${escapeHtml(word.imageUrl)}" alt="${escapeHtml(word.word)}">` : ''}
                <h1>${escapeHtml(word.word)}</h1>
                <button class="btn-outline" onclick="event.stopPropagation(); speakWord('${word.id}')"><i class="fas fa-volume-up"></i> استماع</button>
                <p class="mt-3"><small>👆 اضغط لإظهار الترجمة</small></p>
            </div>
            <div id="flashBack" style="display: none;">
                <h2>📖 ${escapeHtml(word.translation)}</h2>
                <div class="rating-buttons">
                    <button class="rating-btn hard" onclick="rateFlashcard(false)">😫 لا أعرفها</button>
                    <button class="rating-btn good" onclick="rateFlashcard(true)">👍 أعرفها</button>
                </div>
            </div>
        </div>
    `;
    
    const card = document.getElementById('flashcardQuiz');
    card.onclick = (e) => {
        if (e.target.tagName === 'BUTTON') return;
        showingAnswer = !showingAnswer;
        document.getElementById('flashFront').style.display = showingAnswer ? 'none' : 'block';
        document.getElementById('flashBack').style.display = showingAnswer ? 'block' : 'none';
    };
    
    window.rateFlashcard = (isCorrect) => {
        const word = currentQuiz[quizIndex];
        if (isCorrect) {
            quizScore++;
            updateWordLevel(word, true);
            showToast('✅ جيد!', 'success');
        } else {
            updateWordLevel(word, false);
            showToast('📖 حاول مجدداً', 'info');
        }
        quizIndex++;
        showFlashcardQuiz();
    };
}

function showTrueFalse() {
    if (quizIndex >= currentQuiz.length) {
        finishQuiz();
        return;
    }
    
    const word = currentQuiz[quizIndex];
    const isTrue = Math.random() < 0.5;
    const other = words.find(w => w.id !== word.id)?.translation || 'معنى آخر';
    const statement = isTrue ? `كلمة "${word.word}" تعني "${word.translation}"` : `كلمة "${word.word}" تعني "${other}"`;
    const correct = isTrue;
    const progress = (quizIndex / currentQuiz.length) * 100;
    
    document.getElementById('quizContainer').innerHTML = `
        <div class="quiz-progress"><div class="quiz-progress-fill" style="width: ${progress}%"></div></div>
        <div class="card text-center">
            <div class="quiz-stats">السؤال ${quizIndex + 1} من ${currentQuiz.length} | النقاط: ${quizScore}</div>
            ${word.imageUrl ? `<img src="${escapeHtml(word.imageUrl)}" style="max-width: 200px; border-radius: 12px; margin: 10px auto;">` : ''}
            <h2>❓ هل العبارة التالية صحيحة؟</h2>
            <div class="alert alert-info">"${escapeHtml(statement)}"</div>
            <div class="truefalse-options">
                <button class="truefalse-btn true" onclick="checkTrueFalse(true, ${correct})">✅ صحيح</button>
                <button class="truefalse-btn false" onclick="checkTrueFalse(false, ${correct})">❌ خطأ</button>
            </div>
        </div>
    `;
}

function checkTrueFalse(userChoice, correctAnswer) {
    const isCorrect = userChoice === correctAnswer;
    const word = currentQuiz[quizIndex];
    
    if (isCorrect) {
        quizScore++;
        updateWordLevel(word, true);
        showToast('✅ إجابة صحيحة!', 'success');
    } else {
        updateWordLevel(word, false);
        showToast(`❌ خطأ! العبارة ${correctAnswer ? 'صحيحة' : 'خاطئة'}`, 'error');
    }
    
    quizIndex++;
    showTrueFalse();
}

function finishQuiz() {
    const percent = Math.round((quizScore / currentQuiz.length) * 100);
    
    userStats.quizHistory.push({
        date: getTodayDate(),
        type: quizType,
        score: quizScore,
        total: currentQuiz.length,
        percent: percent
    });
    
    if (userStats.quizHistory.length > 20) userStats.quizHistory.shift();
    saveData();
    
    let message = '', emoji = '';
    if (percent >= 90) { message = 'ممتاز! أنت مبدع!'; emoji = '🏆'; }
    else if (percent >= 70) { message = 'جيد جداً! واصل التميز!'; emoji = '👍'; }
    else if (percent >= 50) { message = 'جيد! حاول مرة أخرى'; emoji = '💪'; }
    else { message = 'تحتاج إلى مزيد من المذاكرة!'; emoji = '📖'; }
    
    document.getElementById('quizContainer').innerHTML = '';
    document.getElementById('quizResult').innerHTML = `
        <div class="card text-center">
            <i class="fas fa-trophy" style="font-size: 48px; color: var(--warning);"></i>
            <h2>${emoji} نتيجتك: ${quizScore}/${currentQuiz.length}</h2>
            <h3>${percent}%</h3>
            <p>${message}</p>
            <button class="btn-primary mt-3" onclick="startQuiz()">اختبار جديد</button>
        </div>
    `;
    
    updateDashboard();
}

// ========== دوال AI ==========
async function aiTranslate() {
    const text = document.getElementById('aiTranslateText')?.value.trim();
    if (!text) { showToast('أدخل نصاً للترجمة', 'warning'); return; }
    const result = await callDeepSeekAPI('translate', { text });
    if (result?.success) {
        document.getElementById('aiTranslateResult').innerHTML = `<div class="alert alert-info"><i class="fas fa-language"></i> ${escapeHtml(result.result)}</div>`;
    }
}

async function aiGenerateExample() {
    const word = document.getElementById('aiExampleWord')?.value.trim();
    if (!word) { showToast('أدخل كلمة', 'warning'); return; }
    const result = await callDeepSeekAPI('example', { word });
    if (result?.success) {
        document.getElementById('aiExampleResult').innerHTML = `<div class="alert alert-success"><i class="fas fa-quote-right"></i> ${escapeHtml(result.result)}</div>`;
    }
}

async function aiExplainTerm() {
    const term = document.getElementById('aiExplainTerm')?.value.trim();
    if (!term) { showToast('أدخل مصطلحاً', 'warning'); return; }
    const result = await callDeepSeekAPI('explain', { term });
    if (result?.success) {
        document.getElementById('aiExplainResult').innerHTML = `<div class="alert alert-info"><i class="fas fa-comment-dots"></i> ${escapeHtml(result.result)}</div>`;
    }
}

async function aiGenerateFlashcard() {
    const word = document.getElementById('aiFlashcardWord')?.value.trim();
    if (!word) { showToast('أدخل كلمة', 'warning'); return; }
    const result = await callDeepSeekAPI('flashcard', { word });
    if (result?.success && result.data) {
        const d = result.data;
        document.getElementById('aiFlashcardResult').innerHTML = `
            <div class="alert alert-success">
                <strong>📖 ${escapeHtml(word)}</strong><br>
                📝 الترجمة: ${escapeHtml(d.translation)}<br>
                📌 مثال: ${escapeHtml(d.example)}<br>
                🔗 مرادفات: ${escapeHtml(d.synonyms?.join(', ') || '')}
                <button class="btn-outline btn-sm mt-2" onclick="addAIGeneratedWord('${escapeHtml(word)}', '${escapeHtml(d.translation)}', '${escapeHtml(d.example)}')">➕ إضافة إلى مكتبتي</button>
            </div>`;
    }
}

function addAIGeneratedWord(word, translation, example) {
    if (words.some(w => w.word.toLowerCase() === word.toLowerCase())) {
        showToast('⚠️ هذه الكلمة موجودة مسبقاً', 'warning');
        return;
    }
    words.unshift(createWordObj(word, translation, example, 'عام'));
    saveData();
    renderWords();
    updateDashboard();
    showToast(`✅ تمت إضافة "${word}" إلى مكتبتك`, 'success');
}

// ========== OCR (استخراج النص من الصورة) ==========
let ocrWorker = null;

async function initOCR() {
    if (ocrWorker) return ocrWorker;
    showLoading(true, 'جاري تجهيز OCR...');
    try {
        ocrWorker = await Tesseract.createWorker();
        await ocrWorker.loadLanguage('eng');
        await ocrWorker.initialize('eng');
        showToast('OCR جاهز', 'success');
        return ocrWorker;
    } catch (e) {
        showToast('فشل تحميل OCR', 'error');
        return null;
    } finally {
        showLoading(false);
    }
}

async function extractTextFromImageOCR() {
    const file = document.getElementById('ocrImage').files[0];
    if (!file) { showToast('اختر صورة أولاً', 'warning'); return; }
    
    showLoading(true, 'جاري استخراج النص من الصورة...');
    
    try {
        const worker = await initOCR();
        if (!worker) return;
        
        const imageUrl = URL.createObjectURL(file);
        const { data: { text } } = await worker.recognize(imageUrl);
        URL.revokeObjectURL(imageUrl);
        
        const extractedWords = text.match(/[A-Za-z]{3,}/g) || [];
        const uniqueWords = [...new Set(extractedWords.map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()))];
        
        const resultDiv = document.getElementById('ocrResult');
        if (uniqueWords.length === 0) {
            resultDiv.innerHTML = '<div class="alert alert-warning">⚠️ لم يتم العثور على كلمات إنجليزية في الصورة</div>';
        } else {
            let addedCount = 0;
            for (const w of uniqueWords) {
                if (!words.some(existing => existing.word.toLowerCase() === w.toLowerCase())) {
                    words.unshift(createWordObj(w, '📸 من الصورة', ''));
                    addedCount++;
                }
            }
            saveData();
            renderWords();
            updateDashboard();
            resultDiv.innerHTML = `
                <div class="alert alert-success">
                    <strong>✅ تم استخراج ${uniqueWords.length} كلمة:</strong>
                    <div class="d-flex flex-wrap gap-2 mt-2">
                        ${uniqueWords.slice(0, 10).map(w => `<span class="badge" style="background: var(--success);">${escapeHtml(w)}</span>`).join('')}
                    </div>
                    <p class="mt-2">تمت إضافة ${addedCount} كلمة جديدة إلى مكتبتك.</p>
                </div>
            `;
            showToast(`✅ تمت إضافة ${addedCount} كلمة جديدة`, 'success');
            setTimeout(() => closeOCRModal(), 3000);
        }
    } catch (error) {
        console.error(error);
        showToast('❌ فشل استخراج النص. تأكد من وضوح الصورة', 'error');
    } finally {
        showLoading(false);
        document.getElementById('ocrImage').value = '';
    }
}

function openOCRModal() {
    document.getElementById('ocrModal').classList.add('open');
    document.getElementById('ocrResult').innerHTML = '';
}

function closeOCRModal() {
    document.getElementById('ocrModal').classList.remove('open');
}

// ========== الصوت والنطق ==========
function speakWord(id) {
    const word = words.find(w => w.id == id);
    if (!word) return;
    
    if (!window.speechSynthesis) {
        showToast('متصفحك لا يدعم النطق', 'error');
        return;
    }
    
    try {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(word.word);
        const rate = parseFloat(document.getElementById('speechRate')?.value || 0.9);
        utterance.rate = rate;
        utterance.lang = /[a-zA-Z]/.test(word.word) ? 'en-US' : 'ar-EG';
        window.speechSynthesis.speak(utterance);
    } catch (e) {
        console.error('Speech error:', e);
        showToast('حدث خطأ في تشغيل الصوت', 'error');
    }
}

function testSpeech() {
    if (words.length > 0) {
        speakWord(words[0].id);
        showToast('🔊 تم اختبار الصوت', 'success');
    } else {
        const utterance = new SpeechSynthesisUtterance('Hello! This is a test.');
        utterance.lang = 'en-US';
        utterance.rate = 0.9;
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(utterance);
        showToast('🔊 تم اختبار الصوت', 'success');
    }
}

// ========== تصدير واستيراد ==========
function exportToCSV() {
    const headers = ['Word', 'Translation', 'Example', 'Level', 'Category'];
    const rows = words.map(w => [w.word, w.translation, w.example || '', w.level, w.category || 'عام']);
    const csv = [headers, ...rows].map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');
    const blob = new Blob(["\uFEFF" + csv], { type: 'text/csv;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `words_${getTodayDate()}.csv`;
    link.click();
    showToast('تم التصدير', 'success');
}

function exportAllData() {
    const allData = { words: words, stats: userStats };
    const blob = new Blob([JSON.stringify(allData, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `smartlearn_backup_${getTodayDate()}.json`;
    link.click();
    showToast('تم تصدير النسخة الاحتياطية', 'success');
}

function clearAllData() {
    if (confirm('⚠️ تحذير: سيتم حذف جميع الكلمات والإحصائيات نهائياً. هل أنت متأكد؟')) {
        words = [];
        userStats = {
            streak: 0,
            lastStudyDate: null,
            dailyCorrect: {},
            quizHistory: [],
            enableImages: false,
            language: 'ar'
        };
        saveData();
        renderWords();
        updateDashboard();
        renderScientificTerms();
        showToast('تم حذف جميع البيانات', 'info');
    }
}

// ========== المجالات ==========
function renderCategories() {
    const categories = [
        { name: 'أعمال', icon: 'fas fa-chart-line', color: '#4361ee' },
        { name: 'تقنية', icon: 'fas fa-microchip', color: '#4caf50' },
        { name: 'سفر', icon: 'fas fa-plane', color: '#ff9800' },
        { name: 'طبي', icon: 'fas fa-heartbeat', color: '#f44336' },
        { name: 'علمي', icon: 'fas fa-flask', color: '#9c27b0' },
        { name: 'عام', icon: 'fas fa-folder', color: '#607d8b' }
    ];
    
    const grid = document.getElementById('categoriesGrid');
    if (!grid) return;
    
    grid.innerHTML = categories.map(cat => `
        <div class="category-card" style="background: linear-gradient(135deg, ${cat.color}, ${cat.color}dd)" onclick="showCategoryWords('${cat.name}')">
            <i class="${cat.icon}"></i>
            <h3>${cat.name}</h3>
            <small>${words.filter(w => w.category === cat.name).length} كلمة</small>
        </div>
    `).join('');
}

function showCategoryWords(category) {
    const filtered = words.filter(w => w.category === category);
    const container = document.getElementById('categoryWordsContainer');
    
    if (filtered.length === 0) {
        container.innerHTML = `<div class="alert alert-info">لا توجد كلمات في مجال ${category}. يمكنك إضافتها يدوياً.</div>`;
        return;
    }
    
    container.innerHTML = `
        <div class="card">
            <h3>📖 كلمات ${category}</h3>
            <div class="words-list">
                ${filtered.map(w => `
                    <div class="word-item">
                        <div class="word-info">
                            <h4>${escapeHtml(w.word)} <span class="level-badge level-${w.level}">مستوى ${w.level}</span></h4>
                            <p>${escapeHtml(w.translation)}</p>
                        </div>
                        <div class="word-actions">
                            <button onclick="speakWord('${w.id}')"><i class="fas fa-volume-up"></i></button>
                            <button onclick="editWord('${w.id}')"><i class="fas fa-edit"></i></button>
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>
    `;
}

// ========== لوحة التحكم والإحصائيات ==========
function updateDashboard() {
    const total = words.length;
    const learned = words.filter(w => w.level >= 3).length;
    const due = getDueWords().length;
    const streak = userStats.streak;
    
    document.getElementById('statsGrid').innerHTML = `
        <div class="stat-card"><i class="fas fa-book"></i><h3>${total}</h3><p>إجمالي الكلمات</p></div>
        <div class="stat-card"><i class="fas fa-check-circle"></i><h3>${learned}</h3><p>كلمات متعلمة</p></div>
        <div class="stat-card"><i class="fas fa-clock"></i><h3>${due}</h3><p>مستحقة اليوم</p></div>
        <div class="stat-card"><i class="fas fa-fire"></i><h3>${streak}</h3><p>أيام متتالية 🔥</p></div>
    `;
    
    updateWeeklyChart();
    updateLevelChart();
    updateDailyTip();
    updateReviewProgress();
}

function updateWeeklyChart() {
    const ctx = document.getElementById('progressChart')?.getContext('2d');
    if (!ctx) return;
    
    const labels = [];
    const data = [];
    for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const dateStr = d.toISOString().split('T')[0];
        labels.push(dateStr.slice(5));
        data.push(userStats.dailyCorrect[dateStr] || 0);
    }
    
    if (progressChart) progressChart.destroy();
    progressChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'إجابات صحيحة',
                data: data,
                borderColor: '#4361ee',
                backgroundColor: 'rgba(67, 97, 238, 0.1)',
                tension: 0.3,
                fill: true
            }]
        },
        options: { responsive: true, maintainAspectRatio: false }
    });
}

function updateLevelChart() {
    const ctx = document.getElementById('levelChart')?.getContext('2d');
    if (!ctx) return;
    
    const levels = [1, 2, 3, 4, 5];
    const counts = levels.map(l => words.filter(w => w.level === l).length);
    
    if (levelChart) levelChart.destroy();
    levelChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ['مستوى 1', 'مستوى 2', 'مستوى 3', 'مستوى 4', 'مستوى 5'],
            datasets: [{
                label: 'عدد الكلمات',
                data: counts,
                backgroundColor: '#4361ee',
                borderRadius: 8
            }]
        },
        options: { responsive: true, maintainAspectRatio: false }
    });
}

function updateDailyTip() {
    const due = getDueWords().length;
    const tip = due > 0 ? `📚 لديك ${due} كلمة تحتاج مراجعة اليوم. ابدأ الآن!` : '🎉 ممتاز! كل الكلمات محدثة. أضف كلمات جديدة لتتعلم المزيد.';
    document.getElementById('dailyTip').innerHTML = tip;
}

// ========== دعم اللغات (عربي / إنجليزي) ==========
const translations = {
    ar: {
        app_name: "سمارت ليرن ألترا", welcome: "مرحباً بك", learn_language: "تعلم اللغات",
        nav_dashboard: "الرئيسية", nav_library: "مكتبتي", nav_scientific: "مصطلحات علمية",
        nav_review: "مراجعة ذكية", nav_quiz: "اختبارات", nav_stats: "إحصائيات",
        nav_ai: "AI مساعد", nav_categories: "المجالات", nav_settings: "إعدادات",
        btn_load_words: "تحميل كلمات جاهزة", btn_load_scientific: "تحميل مصطلحات علمية",
        language_label: "اللغة", dashboard_title: "لوحة التحكم", quick_quiz: "اختبار سريع",
        test_yourself: "اختبر معلوماتك", smart_review: "مراجعة ذكية", review_due: "راجع الكلمات المستحقة",
        categories: "المجالات", explore: "استكشف كلمات جديدة", scientific_terms: "مصطلحات علمية",
        academic_terms: "تعلم المصطلحات الأكاديمية", ai_assistant: "AI مساعد", ai_desc: "ترجمة وشرح ذكي",
        weekly_progress: "تقدمك الأسبوعي", daily_tip: "نصيحة اليوم", my_library: "مكتبتي",
        new_word: "كلمة جديدة", export_csv: "تصدير CSV", from_image: "من صورة",
        smart_review_title: "مراجعة ذكية", due_today: "الكلمات المستحقة اليوم",
        quiz_title: "اختبارات", quiz_type: "نوع الاختبار", word_source: "مصدر الكلمات",
        start_quiz: "بدء الاختبار", stats_title: "إحصائيات", level_distribution: "توزيع المستويات",
        ai_assistant_title: "AI مساعد (DeepSeek)", smart_translation: "ترجمة ذكية",
        translate: "ترجمة", generate_example: "توليد جملة مثال", generate: "توليد جملة",
        explain_term: "شرح مصطلح", explain: "شرح", generate_flashcard: "توليد بطاقة تعليمية",
        generate_card: "توليد بطاقة", categories_title: "المجالات", settings_title: "الإعدادات",
        image_settings: "إعدادات الصور", enable_auto_images: "تمكين جلب الصور التلقائي (يتطلب إنترنت)",
        fetch_images_for_all: "جلب الصور لجميع الكلمات", audio_settings: "إعدادات الصوت",
        speech_rate: "سرعة النطق", test_audio: "اختبار الصوت", data_management: "إدارة البيانات",
        delete_all: "حذف جميع الكلمات", export_json: "تصدير JSON", new_word_modal: "➕ كلمة جديدة",
        fetch_image_check: "جلب صورة من الإنترنت (إن أمكن)", save_word: "حفظ الكلمة",
        ocr_title: "📸 استخراج من صورة", extract_text: "استخراج النص وإضافة الكلمات",
        terms_available: "مصطلح متاح", added_to_library: "مضافة لمكتبتي", load_all_terms: "تحميل جميع المصطلحات (200+ مصطلح)",
        multiple_choice: "اختر الترجمة", writing: "اكتب الترجمة", flashcards: "بطاقات فلاش",
        truefalse: "صح / خطأ", all_words: "جميع الكلمات", due_only: "المستحقة فقط"
    },
    en: {
        app_name: "SmartLearn Ultra", welcome: "Welcome", learn_language: "Learn Languages",
        nav_dashboard: "Dashboard", nav_library: "My Library", nav_scientific: "Scientific Terms",
        nav_review: "Smart Review", nav_quiz: "Quizzes", nav_stats: "Statistics",
        nav_ai: "AI Assistant", nav_categories: "Categories", nav_settings: "Settings",
        btn_load_words: "Load Sample Words", btn_load_scientific: "Load Scientific Terms",
        language_label: "Language", dashboard_title: "Dashboard", quick_quiz: "Quick Quiz",
        test_yourself: "Test yourself", smart_review: "Smart Review", review_due: "Review due words",
        categories: "Categories", explore: "Explore new words", scientific_terms: "Scientific Terms",
        academic_terms: "Learn academic terms", ai_assistant: "AI Assistant", ai_desc: "Translate & explain",
        weekly_progress: "Weekly Progress", daily_tip: "Daily Tip", my_library: "My Library",
        new_word: "New Word", export_csv: "Export CSV", from_image: "From Image",
        smart_review_title: "Smart Review", due_today: "Words due today",
        quiz_title: "Quizzes", quiz_type: "Quiz type", word_source: "Word source",
        start_quiz: "Start Quiz", stats_title: "Statistics", level_distribution: "Level Distribution",
        ai_assistant_title: "AI Assistant (DeepSeek)", smart_translation: "Smart Translation",
        translate: "Translate", generate_example: "Generate Example Sentence", generate: "Generate",
        explain_term: "Explain Term", explain: "Explain", generate_flashcard: "Generate Flashcard",
        generate_card: "Generate Card", categories_title: "Categories", settings_title: "Settings",
        image_settings: "Image Settings", enable_auto_images: "Enable auto image fetching (requires internet)",
        fetch_images_for_all: "Fetch images for all words", audio_settings: "Audio Settings",
        speech_rate: "Speech rate", test_audio: "Test Audio", data_management: "Data Management",
        delete_all: "Delete All Words", export_json: "Export JSON", new_word_modal: "➕ New Word",
        fetch_image_check: "Fetch image from internet (if possible)", save_word: "Save Word",
        ocr_title: "📸 Extract from Image", extract_text: "Extract text and add words",
        terms_available: "terms available", added_to_library: "added to library", load_all_terms: "Load all terms (200+ terms)",
        multiple_choice: "Multiple Choice", writing: "Writing", flashcards: "Flashcards",
        truefalse: "True/False", all_words: "All words", due_only: "Due only"
    }
};

function applyLanguage() {
    const lang = userStats.language;
    document.querySelectorAll('[data-lang]').forEach(el => {
        const key = el.getAttribute('data-lang');
        if (translations[lang] && translations[lang][key]) {
            el.innerText = translations[lang][key];
        }
    });
    document.documentElement.lang = lang === 'ar' ? 'ar' : 'en';
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
}

function changeLanguage(lang) {
    userStats.language = lang;
    saveData();
    applyLanguage();
    showToast(lang === 'ar' ? 'تم تغيير اللغة إلى العربية' : 'Language changed to English', 'info');
}

function initLanguage() {
    const saved = localStorage.getItem('app_language');
    if (saved) userStats.language = saved;
    const select = document.getElementById('languageSelect');
    if (select) select.value = userStats.language;
    applyLanguage();
}

// ========== التنقل ==========
function toggleSidebar() {
    document.getElementById('sidebar').classList.toggle('open');
}

function showPage(pageId) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById(pageId + 'Page').classList.add('active');
    
    if (pageId === 'review') startReview();
    if (pageId === 'dashboard') updateDashboard();
    if (pageId === 'stats') { updateLevelChart(); updateWeeklyChart(); }
    if (pageId === 'categories') { renderCategories(); document.getElementById('categoryWordsContainer').innerHTML = ''; }
}

// ========== دوال مساعدة ==========
function showToast(message, type = 'success') {
    const colors = { success: '#4caf50', error: '#f44336', warning: '#ff9800', info: '#2196f3' };
    const toast = document.createElement('div');
    toast.style.cssText = `position:fixed; bottom:20px; left:50%; transform:translateX(-50%); background:${colors[type]}; color:white; padding:12px 24px; border-radius:50px; z-index:10000; box-shadow:0 4px 15px rgba(0,0,0,0.2); animation:fadeInUp 0.3s;`;
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

function showLoading(show, message = 'جاري التحميل...') {
    const overlay = document.getElementById('loadingOverlay');
    if (!overlay) return;
    overlay.style.display = show ? 'flex' : 'none';
    document.getElementById('loadingMsg').innerText = message;
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[m]);
}

function toggleDarkMode() {
    document.body.classList.toggle('dark');
    localStorage.setItem('darkMode', document.body.classList.contains('dark'));
}

function initDarkMode() {
    if (localStorage.getItem('darkMode') === 'true') document.body.classList.add('dark');
}

// ========== التهيئة النهائية ==========
document.addEventListener('DOMContentLoaded', () => {
    loadData();
    renderWords();
    updateDashboard();
    initDarkMode();
    startReview();
    renderCategories();
    initLanguage();
    const imgCheck = document.getElementById('enableImageFetch');
    if (imgCheck) imgCheck.checked = userStats.enableImages;
});