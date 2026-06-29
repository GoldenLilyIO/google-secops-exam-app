// Google SecOps Exam Prep - Application Logic with Supabase Sync

import { supabase } from './config.js';

// Global state
let questions = [];
let bookmarks = new Set();
let examHistory = [];
let practiceState = {
  currentIndex: 0,
  answers: {} // questionNum -> selectedArray
};
let activeExam = null;

// Auth state
let currentUserId = null;
let activeAuthTab = 'login'; // 'login' or 'signup'

// DOM Elements
const views = {
  dashboard: document.getElementById('dashboard-view'),
  practice: document.getElementById('practice-view'),
  exam: document.getElementById('exam-view'),
  review: document.getElementById('review-view')
};

const navButtons = {
  dashboard: document.getElementById('nav-dashboard'),
  practice: document.getElementById('nav-practice'),
  exam: document.getElementById('nav-exam'),
  review: document.getElementById('nav-review')
};

// Theme toggle
const themeBtn = document.getElementById('theme-btn');

// Start-up Initializer
document.addEventListener('DOMContentLoaded', async () => {
  try {
    // 1. Fetch questions JSON
    const response = await fetch('./questions.json');
    questions = await response.json();
    
    // 2. Initialize UI views
    initTheme();
    initNavigation();
    initPractice();
    initExam();
    initReviewCenter();
    initAuthUI();
    
    // 3. Listen to Supabase Auth Changes
    supabase.auth.onAuthStateChange(async (event, session) => {
      const authOverlay = document.getElementById('auth-overlay');
      const emailDisplay = document.getElementById('sidebar-user-email');
      
      if (session) {
        // Logged in!
        currentUserId = session.user.id;
        authOverlay.classList.add('hidden');
        document.body.classList.remove('auth-active');
        emailDisplay.textContent = session.user.email;
        emailDisplay.classList.remove('hidden');
        
        // Load progress from Supabase Cloud
        await loadUserProgress(session.user.id);
        
        // Recover local active exam if any
        const savedActiveExam = localStorage.getItem('secops_active_exam');
        if (savedActiveExam) {
          activeExam = JSON.parse(savedActiveExam);
        }
        
        // Switch to dashboard
        switchView('dashboard-view');
      } else {
        // Logged out!
        currentUserId = null;
        authOverlay.classList.remove('hidden');
        document.body.classList.add('auth-active');
        emailDisplay.textContent = '';
        emailDisplay.classList.add('hidden');
        
        // Reset states
        resetLocalState();
        updateHeaderStats();
      }
      
      if (window.lucide) window.lucide.createIcons();
    });
    
  } catch (err) {
    console.error("Error loading application:", err);
  }
});

// ================= SUPABASE AUTHENTICATION =================
function initAuthUI() {
  const tabLogin = document.getElementById('tab-login');
  const tabSignup = document.getElementById('tab-signup');
  const authSubtitle = document.getElementById('auth-subtitle');
  const authBtnText = document.getElementById('auth-btn-text');
  const authForm = document.getElementById('auth-form');
  const authError = document.getElementById('auth-error');
  const authInfo = document.getElementById('auth-info');
  
  // Tab Switching
  tabLogin.addEventListener('click', () => {
    tabLogin.classList.add('active');
    tabSignup.classList.remove('active');
    authSubtitle.textContent = 'Sign in to access your personal workspace';
    authBtnText.textContent = 'Sign In';
    activeAuthTab = 'login';
    authError.classList.add('hidden');
    authInfo.classList.add('hidden');
  });
  
  tabSignup.addEventListener('click', () => {
    tabSignup.classList.add('active');
    tabLogin.classList.remove('active');
    authSubtitle.textContent = 'Create a free account to track your progress';
    authBtnText.textContent = 'Register Account';
    activeAuthTab = 'signup';
    authError.classList.add('hidden');
    authInfo.classList.add('hidden');
  });
  
  // Form Submission
  authForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const email = document.getElementById('auth-email').value;
    const password = document.getElementById('auth-password').value;
    const submitBtn = document.getElementById('auth-submit-btn');
    
    // UI Loading state
    submitBtn.disabled = true;
    authError.classList.add('hidden');
    authInfo.classList.add('hidden');
    
    try {
      if (activeAuthTab === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        
        // Check if user is logged in automatically or needs confirmation
        if (data.user && data.session) {
          authInfo.textContent = "Registration successful! Loading workspace...";
          authInfo.classList.remove('hidden');
        } else {
          authInfo.textContent = "Sign up successful! Please check your email inbox to verify your account.";
          authInfo.classList.remove('hidden');
          submitBtn.disabled = false;
        }
      }
    } catch (err) {
      console.error("Auth error:", err);
      authError.textContent = err.message || "An authentication error occurred.";
      authError.classList.remove('hidden');
      submitBtn.disabled = false;
    }
  });
  
  // Sign Out Button
  document.getElementById('signout-btn').addEventListener('click', async () => {
    const confirmOut = confirm("Are you sure you want to sign out?");
    if (confirmOut) {
      if (activeExam && !activeExam.completed) {
        clearInterval(activeExam.timerInterval);
      }
      activeExam = null;
      localStorage.removeItem('secops_active_exam');
      await supabase.auth.signOut();
    }
  });
}

// ================= DATA SYNCING (CLOUD DATABASE) =================
async function loadUserProgress(userId) {
  try {
    const { data, error } = await supabase
      .from('user_progress')
      .select('bookmarks, practice_answers, exam_history')
      .eq('user_id', userId)
      .single();
      
    if (error && error.code !== 'PGRST116') { // PGRST116 is POSTGRES "no rows found"
      throw error;
    }
    
    if (data) {
      bookmarks = new Set(data.bookmarks || []);
      practiceState.answers = data.practice_answers || {};
      examHistory = data.exam_history || [];
      
      // Load current practice index from local storage if available
      const savedPractice = localStorage.getItem('secops_practice_state');
      if (savedPractice) {
        const localState = JSON.parse(savedPractice);
        practiceState.currentIndex = localState.currentIndex || 0;
      }
    } else {
      // Row doesn't exist, create initial row for new user
      bookmarks = new Set();
      practiceState.answers = {};
      examHistory = [];
      
      await saveUserProgress(userId);
    }
  } catch (err) {
    console.error("Error loading progress from database:", err);
    // Fallback to empty states if database fails
    bookmarks = new Set();
    practiceState.answers = {};
    examHistory = [];
  }
  
  updateHeaderStats();
}

async function saveUserProgress() {
  if (!currentUserId) return;
  
  try {
    const { error } = await supabase
      .from('user_progress')
      .upsert({
        user_id: currentUserId,
        bookmarks: [...bookmarks],
        practice_answers: practiceState.answers,
        exam_history: examHistory,
        updated_at: new Date().toISOString()
      });
      
    if (error) throw error;
  } catch (err) {
    console.error("Error syncing progress to database:", err);
  }
  
  updateHeaderStats();
}

function resetLocalState() {
  bookmarks = new Set();
  examHistory = [];
  practiceState = { currentIndex: 0, answers: {} };
  activeExam = null;
  localStorage.removeItem('secops_active_exam');
}

function updateHeaderStats() {
  const total = questions.length || 133;
  const completed = Object.keys(practiceState.answers).length;
  const bookmarked = bookmarks.size;
  
  const completedEl = document.getElementById('header-completed-count');
  const bookmarkedEl = document.getElementById('header-bookmarked-count');
  
  if (completedEl) completedEl.textContent = `${completed}/${total}`;
  if (bookmarkedEl) bookmarkedEl.textContent = bookmarked;
}

// ================= THEME MANAGER =================
function initTheme() {
  const savedTheme = localStorage.getItem('secops_theme') || 'dark';
  if (savedTheme === 'light') {
    document.body.classList.add('light-theme');
    document.body.classList.remove('dark-theme');
  } else {
    document.body.classList.add('dark-theme');
    document.body.classList.remove('light-theme');
  }
  
  themeBtn.addEventListener('click', () => {
    if (document.body.classList.contains('dark-theme')) {
      document.body.classList.remove('dark-theme');
      document.body.classList.add('light-theme');
      localStorage.setItem('secops_theme', 'light');
    } else {
      document.body.classList.remove('light-theme');
      document.body.classList.add('dark-theme');
      localStorage.setItem('secops_theme', 'dark');
    }
  });
}

// ================= NAVIGATION MANAGER =================
function initNavigation() {
  const menuToggle = document.getElementById('mobile-menu-toggle');
  const sidebar = document.querySelector('.sidebar');
  const overlay = document.getElementById('sidebar-overlay');
  
  if (menuToggle && overlay) {
    menuToggle.addEventListener('click', () => {
      sidebar.classList.add('open');
      overlay.classList.remove('hidden');
    });
    
    overlay.addEventListener('click', () => {
      sidebar.classList.remove('open');
      overlay.classList.add('hidden');
    });
  }

  Object.keys(navButtons).forEach(key => {
    navButtons[key].addEventListener('click', () => {
      // Prevent nav switch if exam is running and user clicks elsewhere without confirmation
      if (activeExam && !activeExam.completed && key !== 'exam') {
        const leave = confirm("An exam is currently in progress. Switching views will PAUSE the timer, but you will not lose your progress. Continue?");
        if (!leave) return;
        // Pause timer interval
        clearInterval(activeExam.timerInterval);
        activeExam.timerInterval = null;
      }
      
      switchView(navButtons[key].getAttribute('data-view'));
      
      // Auto-close sidebar drawer on mobile after clicking
      if (sidebar && sidebar.classList.contains('open') && overlay) {
        sidebar.classList.remove('open');
        overlay.classList.add('hidden');
      }
    });
  });

  // Quick Action Buttons on Dashboard
  document.getElementById('start-practice-card').addEventListener('click', () => switchView('practice-view'));
  document.getElementById('start-exam-card').addEventListener('click', () => switchView('exam-view'));
  document.getElementById('start-review-card').addEventListener('click', () => {
    switchView('review-view');
    document.getElementById('review-filter-bookmarks').click();
  });
}

function switchView(viewId) {
  // Toggle nav buttons active class
  Object.keys(navButtons).forEach(key => {
    const btn = navButtons[key];
    if (btn.getAttribute('data-view') === viewId) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });
  
  // Toggle views active class
  Object.keys(views).forEach(key => {
    const view = views[key];
    if (view.id === viewId) {
      view.classList.add('active');
    } else {
      view.classList.remove('active');
    }
  });
  
  // Update view titles
  let title = 'Dashboard';
  if (viewId === 'practice-view') {
    title = 'Practice Mode';
    renderPracticeQuestion();
  } else if (viewId === 'exam-view') {
    title = 'Mock Exam';
    renderExamWorkspace();
  } else if (viewId === 'review-view') {
    title = 'Review Center';
    renderReviewList();
  } else if (viewId === 'dashboard-view') {
    initDashboard();
  }
  document.getElementById('current-view-title').textContent = title;
  
  // Re-generate Lucide Icons in case new markup is rendered
  if (window.lucide) {
    window.lucide.createIcons();
  }
}

// ================= DASHBOARD RENDERER =================
function initDashboard() {
  const total = questions.length || 133;
  const completed = Object.keys(practiceState.answers).length;
  const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
  
  document.getElementById('dashboard-completion-percent').textContent = `${percent}%`;
  document.getElementById('dashboard-completion-ratio').textContent = `${completed} of ${total} Questions`;
  
  // Update SVG Progress Ring
  const circle = document.getElementById('dashboard-progress-ring');
  if (circle) {
    const radius = circle.r.baseVal.value;
    const circumference = 2 * Math.PI * radius;
    circle.style.strokeDasharray = `${circumference}`;
    const offset = circumference - (percent / 100) * circumference;
    circle.style.strokeDashoffset = offset;
  }
  
  // Accuracy calculation
  let correctCount = 0;
  let answeredCount = 0;
  Object.keys(practiceState.answers).forEach(qNum => {
    const q = questions.find(item => item.number === parseInt(qNum));
    if (q) {
      answeredCount++;
      const userAns = practiceState.answers[qNum];
      const isCorrect = userAns.length === q.answer.length && userAns.every(val => q.answer.includes(val));
      if (isCorrect) correctCount++;
    }
  });
  
  const accuracy = answeredCount > 0 ? Math.round((correctCount / answeredCount) * 100) : 0;
  document.getElementById('stats-practice-accuracy').textContent = `${accuracy}%`;
  
  // Exams completed and High Score
  document.getElementById('stats-exams-taken').textContent = examHistory.length;
  if (examHistory.length > 0) {
    const high = Math.max(...examHistory.map(h => h.score));
    document.getElementById('stats-exam-high-score').textContent = `${high}%`;
  } else {
    document.getElementById('stats-exam-high-score').textContent = '--';
  }
  
  // Render Exam History Table
  const tbody = document.getElementById('exam-history-tbody');
  tbody.innerHTML = '';
  
  if (examHistory.length === 0) {
    tbody.innerHTML = `
      <tr class="empty-state-row">
        <td colspan="5">No exams taken yet. Start a Mock Exam to test your skills!</td>
      </tr>
    `;
  } else {
    // Show latest exams first
    [...examHistory].reverse().forEach((exam, idx) => {
      const isPass = exam.score >= 70;
      const row = document.createElement('tr');
      row.innerHTML = `
        <td>${new Date(exam.date).toLocaleDateString()} ${new Date(exam.date).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</td>
        <td><span class="score-badge ${isPass ? 'pass' : 'fail'}">${exam.score}%</span></td>
        <td>${formatSeconds(exam.timeSpent)}</td>
        <td>${isPass ? 'PASS' : 'FAIL'}</td>
        <td><button class="btn btn-secondary review-exam-btn" style="width:auto; padding: 6px 12px; font-size:12px;" data-idx="${examHistory.length - 1 - idx}">Review</button></td>
      `;
      tbody.appendChild(row);
    });
    
    // Add event listeners to review buttons
    document.querySelectorAll('.review-exam-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const historyIdx = parseInt(e.target.getAttribute('data-idx'));
        openExamHistoryReview(historyIdx);
      });
    });
  }
}

// ================= PRACTICE MODE =================
function initPractice() {
  const jumpSelect = document.getElementById('practice-jump');
  
  // Populate jump selector options
  jumpSelect.innerHTML = '';
  questions.forEach((q, idx) => {
    const opt = document.createElement('option');
    opt.value = idx;
    opt.textContent = `Q${q.number}`;
    jumpSelect.appendChild(opt);
  });
  
  // Listeners
  jumpSelect.addEventListener('change', (e) => {
    practiceState.currentIndex = parseInt(e.target.value);
    localStorage.setItem('secops_practice_state', JSON.stringify({ currentIndex: practiceState.currentIndex }));
    renderPracticeQuestion();
  });
  
  document.getElementById('practice-prev-btn').addEventListener('click', () => {
    if (practiceState.currentIndex > 0) {
      practiceState.currentIndex--;
      localStorage.setItem('secops_practice_state', JSON.stringify({ currentIndex: practiceState.currentIndex }));
      renderPracticeQuestion();
    }
  });
  
  document.getElementById('practice-bookmark-btn').addEventListener('click', async () => {
    const q = questions[practiceState.currentIndex];
    const bookmarkBtn = document.getElementById('practice-bookmark-btn');
    
    if (bookmarks.has(q.number)) {
      bookmarks.delete(q.number);
      bookmarkBtn.classList.remove('active');
    } else {
      bookmarks.add(q.number);
      bookmarkBtn.classList.add('active');
    }
    
    // Sync update to Cloud DB
    await saveUserProgress();
  });
  
  document.getElementById('practice-submit-btn').addEventListener('click', submitPracticeAnswer);
  
  document.getElementById('practice-next-btn').addEventListener('click', () => {
    if (practiceState.currentIndex < questions.length - 1) {
      practiceState.currentIndex++;
      localStorage.setItem('secops_practice_state', JSON.stringify({ currentIndex: practiceState.currentIndex }));
      renderPracticeQuestion();
    }
  });
}

function renderPracticeQuestion() {
  if (questions.length === 0) return;
  
  const q = questions[practiceState.currentIndex];
  
  // Sync jump dropdown
  document.getElementById('practice-jump').value = practiceState.currentIndex;
  
  // Toggle prev button disable state
  document.getElementById('practice-prev-btn').disabled = practiceState.currentIndex === 0;
  
  // Toggle bookmark button state
  const bookmarkBtn = document.getElementById('practice-bookmark-btn');
  if (bookmarks.has(q.number)) {
    bookmarkBtn.classList.add('active');
  } else {
    bookmarkBtn.classList.remove('active');
  }
  
  // Render text and meta
  document.getElementById('practice-current-num').textContent = q.number;
  document.getElementById('practice-question-text').textContent = q.text;
  
  // Reset buttons
  document.getElementById('practice-submit-btn').classList.remove('hidden');
  document.getElementById('practice-next-btn').classList.add('hidden');
  document.getElementById('practice-feedback-pane').classList.add('hidden');
  
  // Render options list
  const list = document.getElementById('practice-options-list');
  list.innerHTML = '';
  
  const previouslySelected = practiceState.answers[q.number];
  
  q.options.forEach((optText, optIdx) => {
    const letter = String.fromCharCode(65 + optIdx);
    const item = document.createElement('div');
    item.className = 'option-item';
    item.setAttribute('data-letter', letter);
    item.innerHTML = `
      <div class="option-letter">${letter}</div>
      <div class="option-text">${escapeHtml(optText)}</div>
    `;
    
    if (previouslySelected && previouslySelected.includes(letter)) {
      item.classList.add('selected');
    }
    
    item.addEventListener('click', () => {
      // If already evaluated, don't allow changes
      if (!document.getElementById('practice-next-btn').classList.contains('hidden') || previouslySelected) {
        return;
      }
      
      if (q.is_multiple_choice) {
        item.classList.toggle('selected');
      } else {
        list.querySelectorAll('.option-item').forEach(el => el.classList.remove('selected'));
        item.classList.add('selected');
      }
    });
    
    list.appendChild(item);
  });
  
  // If previously answered, show feedback immediately
  if (previouslySelected) {
    document.getElementById('practice-submit-btn').classList.add('hidden');
    document.getElementById('practice-next-btn').classList.remove('hidden');
    revealPracticeFeedback(q, previouslySelected);
  }
  
  document.querySelector('.workspace-layout').scrollIntoView({ behavior: 'smooth', block: 'start' });
  
  if (window.lucide) window.lucide.createIcons();
}

async function submitPracticeAnswer() {
  const q = questions[practiceState.currentIndex];
  const list = document.getElementById('practice-options-list');
  const selectedItems = list.querySelectorAll('.option-item.selected');
  
  if (selectedItems.length === 0) {
    alert("Please select at least one option.");
    return;
  }
  
  const selectedLetters = Array.from(selectedItems).map(item => item.getAttribute('data-letter'));
  
  // Save answer state & sync to DB
  practiceState.answers[q.number] = selectedLetters;
  await saveUserProgress();
  
  // Hide check answer, show next button
  document.getElementById('practice-submit-btn').classList.add('hidden');
  document.getElementById('practice-next-btn').classList.remove('hidden');
  
  revealPracticeFeedback(q, selectedLetters);
  
  if (window.lucide) window.lucide.createIcons();
}

function revealPracticeFeedback(q, selectedLetters) {
  const list = document.getElementById('practice-options-list');
  const feedbackPane = document.getElementById('practice-feedback-pane');
  
  list.querySelectorAll('.option-item').forEach(item => {
    const letter = item.getAttribute('data-letter');
    const isCorrectOpt = q.answer.includes(letter);
    const isSelectedOpt = selectedLetters.includes(letter);
    
    if (isCorrectOpt) {
      item.classList.add('correct');
      item.classList.remove('selected');
    } else if (isSelectedOpt) {
      item.classList.add('incorrect');
      item.classList.remove('selected');
    }
  });
  
  feedbackPane.classList.remove('hidden');
  document.getElementById('practice-correct-answer-val').textContent = q.answer.join(', ');
  
  // Community Vote
  const commVoteContainer = document.getElementById('practice-vote-distribution-container');
  const voteBars = document.getElementById('practice-vote-bars');
  voteBars.innerHTML = '';
  
  const parsedVotes = parseCommunityVotes(q.community_vote);
  if (parsedVotes.length > 0) {
    commVoteContainer.classList.remove('hidden');
    parsedVotes.forEach(vote => {
      const voteItem = document.createElement('div');
      voteItem.className = 'vote-bar-item';
      voteItem.innerHTML = `
        <span class="vote-label">${vote.label}</span>
        <div class="vote-track">
          <div class="vote-fill" style="width: 0%"></div>
        </div>
        <span class="vote-percent">${vote.percentage}%</span>
      `;
      voteBars.appendChild(voteItem);
      
      setTimeout(() => {
        const fill = voteItem.querySelector('.vote-fill');
        if (fill) fill.style.width = `${vote.percentage}%`;
      }, 50);
    });
  } else {
    commVoteContainer.classList.add('hidden');
  }
}

function parseCommunityVotes(voteStr) {
  if (!voteStr) return [];
  const regex = /([A-E]+)\s*\((\d+)%\)/g;
  const results = [];
  let match;
  while ((match = regex.exec(voteStr)) !== null) {
    results.push({
      label: match[1],
      percentage: parseInt(match[2], 10)
    });
  }
  return results;
}

// ================= EXAM MODE =================
function initExam() {
  document.getElementById('start-exam-btn').addEventListener('click', startNewExam);
  document.getElementById('exam-finish-btn').addEventListener('click', finishActiveExam);
  
  document.getElementById('exam-prev-btn').addEventListener('click', () => {
    if (activeExam && activeExam.currentIndex > 0) {
      activeExam.currentIndex--;
      saveActiveExam();
      renderExamQuestion();
    }
  });
  
  document.getElementById('exam-next-btn').addEventListener('click', () => {
    if (activeExam && activeExam.currentIndex < activeExam.questions.length - 1) {
      activeExam.currentIndex++;
      saveActiveExam();
      renderExamQuestion();
    }
  });
  
  const flagCheckbox = document.getElementById('exam-flag-checkbox');
  flagCheckbox.addEventListener('change', (e) => {
    if (!activeExam) return;
    const qNum = activeExam.questions[activeExam.currentIndex].number;
    if (e.target.checked) {
      if (!activeExam.flags.includes(qNum)) activeExam.flags.push(qNum);
    } else {
      activeExam.flags = activeExam.flags.filter(item => item !== qNum);
    }
    saveActiveExam();
    updateExamSidebarGrid();
  });
  
  document.getElementById('result-back-dash-btn').addEventListener('click', () => {
    activeExam = null;
    saveActiveExam();
    switchView('dashboard-view');
  });
  
  document.getElementById('result-review-btn').addEventListener('click', () => {
    const lastResultIdx = examHistory.length - 1;
    openExamHistoryReview(lastResultIdx);
  });
}

function startNewExam() {
  const shuffled = [...questions].sort(() => 0.5 - Math.random());
  const selected = shuffled.slice(0, 50).map((q, idx) => {
    return { ...q, examIndex: idx };
  });
  
  activeExam = {
    questions: selected,
    answers: {},
    flags: [],
    currentIndex: 0,
    startTime: Date.now(),
    timeLeft: 120 * 60,
    completed: false
  };
  
  saveActiveExam();
  renderExamWorkspace();
}

function renderExamWorkspace() {
  const setupCard = document.getElementById('exam-setup-card');
  const workspace = document.getElementById('exam-active-workspace');
  const resultCard = document.getElementById('exam-result-card');
  
  if (!activeExam) {
    setupCard.classList.remove('hidden');
    workspace.classList.add('hidden');
    resultCard.classList.add('hidden');
    return;
  }
  
  if (activeExam.completed) {
    setupCard.classList.add('hidden');
    workspace.classList.add('hidden');
    resultCard.classList.remove('hidden');
    renderExamResults();
    return;
  }
  
  setupCard.classList.add('hidden');
  workspace.classList.remove('hidden');
  resultCard.classList.add('hidden');
  
  initExamSidebarGrid();
  startExamTimer();
  renderExamQuestion();
}

function startExamTimer() {
  if (activeExam.timerInterval) {
    clearInterval(activeExam.timerInterval);
  }
  
  const elapsed = Math.floor((Date.now() - activeExam.startTime) / 1000);
  activeExam.timeLeft = Math.max(0, (120 * 60) - elapsed);
  
  updateTimerUI();
  
  activeExam.timerInterval = setInterval(() => {
    if (!activeExam) {
      clearInterval(activeExam.timerInterval);
      return;
    }
    
    const sec = Math.floor((Date.now() - activeExam.startTime) / 1000);
    activeExam.timeLeft = (120 * 60) - sec;
    
    if (activeExam.timeLeft <= 0) {
      activeExam.timeLeft = 0;
      updateTimerUI();
      clearInterval(activeExam.timerInterval);
      alert("Time is up! Your exam will be submitted automatically.");
      submitExam();
    } else {
      updateTimerUI();
    }
  }, 1000);
}

function updateTimerUI() {
  const timerSpan = document.getElementById('exam-timer');
  const hours = Math.floor(activeExam.timeLeft / 3600);
  const minutes = Math.floor((activeExam.timeLeft % 3600) / 60);
  const seconds = activeExam.timeLeft % 60;
  
  timerSpan.textContent = `${padZero(hours)}:${padZero(minutes)}:${padZero(seconds)}`;
  
  if (activeExam.timeLeft < 300) {
    timerSpan.style.color = 'var(--danger-color)';
  } else {
    timerSpan.style.color = '';
  }
}

function padZero(num) {
  return num.toString().padStart(2, '0');
}

function renderExamQuestion() {
  if (!activeExam) return;
  
  const q = activeExam.questions[activeExam.currentIndex];
  
  document.getElementById('exam-prev-btn').disabled = activeExam.currentIndex === 0;
  document.getElementById('exam-next-btn').disabled = activeExam.currentIndex === activeExam.questions.length - 1;
  
  document.getElementById('exam-flag-checkbox').checked = activeExam.flags.includes(q.number);
  
  document.getElementById('exam-current-num').textContent = activeExam.currentIndex + 1;
  document.getElementById('exam-question-text').textContent = q.text;
  
  const list = document.getElementById('exam-options-list');
  list.innerHTML = '';
  
  const selected = activeExam.answers[activeExam.currentIndex] || [];
  
  q.options.forEach((optText, optIdx) => {
    const letter = String.fromCharCode(65 + optIdx);
    const item = document.createElement('div');
    item.className = 'option-item';
    item.setAttribute('data-letter', letter);
    item.innerHTML = `
      <div class="option-letter">${letter}</div>
      <div class="option-text">${escapeHtml(optText)}</div>
    `;
    
    if (selected.includes(letter)) {
      item.classList.add('selected');
    }
    
    item.addEventListener('click', () => {
      if (q.is_multiple_choice) {
        item.classList.toggle('selected');
      } else {
        list.querySelectorAll('.option-item').forEach(el => el.classList.remove('selected'));
        item.classList.add('selected');
      }
      
      const activeSelections = Array.from(list.querySelectorAll('.option-item.selected')).map(el => el.getAttribute('data-letter'));
      activeExam.answers[activeExam.currentIndex] = activeSelections;
      saveActiveExam();
      updateExamSidebarGrid();
    });
    
    list.appendChild(item);
  });
  
  updateExamSidebarGrid();
  document.querySelector('.exam-main').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function initExamSidebarGrid() {
  const container = document.getElementById('exam-grid-container');
  container.innerHTML = '';
  
  activeExam.questions.forEach((q, idx) => {
    const box = document.createElement('div');
    box.className = 'grid-box';
    box.id = `exam-grid-box-${idx}`;
    box.textContent = idx + 1;
    
    box.addEventListener('click', () => {
      activeExam.currentIndex = idx;
      saveActiveExam();
      renderExamQuestion();
    });
    
    container.appendChild(box);
  });
}

function updateExamSidebarGrid() {
  if (!activeExam) return;
  
  activeExam.questions.forEach((q, idx) => {
    const box = document.getElementById(`exam-grid-box-${idx}`);
    if (!box) return;
    
    box.className = 'grid-box';
    
    if (idx === activeExam.currentIndex) {
      box.classList.add('active');
    }
    
    const ans = activeExam.answers[idx];
    if (ans && ans.length > 0) {
      box.classList.add('answered');
    }
    
    if (activeExam.flags.includes(q.number)) {
      box.classList.add('flagged');
    }
  });
}

function finishActiveExam() {
  if (!activeExam) return;
  
  const unansweredCount = activeExam.questions.length - Object.keys(activeExam.answers).filter(k => activeExam.answers[k].length > 0).length;
  
  let confirmMsg = "Are you sure you want to end and submit this mock exam?";
  if (unansweredCount > 0) {
    confirmMsg = `You have ${unansweredCount} unanswered questions remaining. Are you sure you want to submit?`;
  }
  
  if (confirm(confirmMsg)) {
    submitExam();
  }
}

async function submitExam() {
  if (!activeExam) return;
  
  clearInterval(activeExam.timerInterval);
  activeExam.timerInterval = null;
  
  let correct = 0;
  let incorrect = 0;
  
  const processedQuestions = activeExam.questions.map((q, idx) => {
    const userAnswers = activeExam.answers[idx] || [];
    const isCorrect = userAnswers.length === q.answer.length && userAnswers.every(val => q.answer.includes(val));
    if (isCorrect) {
      correct++;
    } else {
      incorrect++;
    }
    
    return {
      number: q.number,
      text: q.text,
      options: q.options,
      answer: q.answer,
      is_multiple_choice: q.is_multiple_choice,
      community_vote: q.community_vote,
      userAnswer: userAnswers,
      correct: isCorrect
    };
  });
  
  const scorePercent = Math.round((correct / activeExam.questions.length) * 100);
  const timeSpent = Math.floor((Date.now() - activeExam.startTime) / 1000);
  
  const historyRecord = {
    date: Date.now(),
    score: scorePercent,
    correctCount: correct,
    incorrectCount: incorrect,
    timeSpent: timeSpent,
    questions: processedQuestions
  };
  
  examHistory.push(historyRecord);
  
  // Sync to database
  await saveUserProgress();
  
  activeExam.completed = true;
  activeExam.resultRecord = historyRecord;
  saveActiveExam();
  
  renderExamWorkspace();
}

function renderExamResults() {
  const result = activeExam.resultRecord;
  
  document.getElementById('result-score-percent').textContent = `${result.score}%`;
  document.getElementById('result-stat-correct').textContent = `${result.correctCount}/50`;
  document.getElementById('result-stat-incorrect').textContent = `${result.incorrectCount}/50`;
  document.getElementById('result-stat-time').textContent = formatSeconds(result.timeSpent);
  
  const isPass = result.score >= 70;
  const titleEl = document.getElementById('result-title');
  const feedbackEl = document.getElementById('result-feedback-text');
  const ring = document.getElementById('result-progress-ring');
  
  if (isPass) {
    titleEl.textContent = "Congratulations!";
    feedbackEl.textContent = `You passed the mock exam with a score of ${result.score}% (Passing score: 70%)`;
    titleEl.style.color = 'var(--success-color)';
    ring.setAttribute('stroke', 'var(--success-color)');
  } else {
    titleEl.textContent = "Keep Practicing!";
    feedbackEl.textContent = `You scored ${result.score}%, which is below the 70% passing score. Review your mistakes and try again!`;
    titleEl.style.color = 'var(--danger-color)';
    ring.setAttribute('stroke', 'var(--danger-color)');
  }
  
  const radius = ring.r.baseVal.value;
  const circumference = 2 * Math.PI * radius;
  ring.style.strokeDasharray = `${circumference}`;
  ring.style.strokeDashoffset = circumference - (result.score / 100) * circumference;
}

function formatSeconds(secs) {
  const hours = Math.floor(secs / 3600);
  const minutes = Math.floor((secs % 3600) / 60);
  const seconds = secs % 60;
  
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m ${seconds}s`;
}

function openExamHistoryReview(historyIdx) {
  const record = examHistory[historyIdx];
  if (!record) return;
  
  switchView('review-view');
  
  document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
  
  const container = document.getElementById('review-list-container');
  container.innerHTML = '';
  
  const infoBar = document.createElement('div');
  infoBar.className = 'glass-panel';
  infoBar.style.padding = '16px 24px';
  infoBar.style.marginBottom = '16px';
  infoBar.style.display = 'flex';
  infoBar.style.justifyContent = 'space-between';
  infoBar.style.alignItems = 'center';
  infoBar.innerHTML = `
    <span>Reviewing Mock Exam from <strong>${new Date(record.date).toLocaleDateString()}</strong> (Score: <strong>${record.score}%</strong>)</span>
    <button class="btn btn-secondary" id="exit-exam-review-btn" style="width:auto; padding: 6px 12px;">Close Review</button>
  `;
  container.appendChild(infoBar);
  
  document.getElementById('exit-exam-review-btn').addEventListener('click', () => {
    switchView('dashboard-view');
  });
  
  record.questions.forEach((q, idx) => {
    const card = renderQuestionCardMarkup(q, q.userAnswer, true);
    container.appendChild(card);
  });
  
  if (window.lucide) window.lucide.createIcons();
}

// ================= REVIEW CENTER =================
let activeReviewFilter = 'all';

function initReviewCenter() {
  document.getElementById('review-filter-all').addEventListener('click', (e) => {
    setReviewFilter('all', e.target);
  });
  document.getElementById('review-filter-bookmarks').addEventListener('click', (e) => {
    setReviewFilter('bookmarks', e.target);
  });
  document.getElementById('review-filter-incorrect').addEventListener('click', (e) => {
    setReviewFilter('incorrect', e.target);
  });
  
  document.getElementById('review-search-input').addEventListener('input', () => {
    renderReviewList();
  });
}

function setReviewFilter(filter, buttonEl) {
  document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
  buttonEl.classList.add('active');
  activeReviewFilter = filter;
  renderReviewList();
}

function renderReviewList() {
  const container = document.getElementById('review-list-container');
  container.innerHTML = '';
  
  const searchVal = document.getElementById('review-search-input').value.toLowerCase();
  
  let filtered = [...questions];
  
  if (activeReviewFilter === 'bookmarks') {
    filtered = filtered.filter(q => bookmarks.has(q.number));
  } else if (activeReviewFilter === 'incorrect') {
    const incorrectNums = new Set();
    examHistory.forEach(exam => {
      exam.questions.forEach(eq => {
        if (!eq.correct) incorrectNums.add(eq.number);
      });
    });
    filtered = filtered.filter(q => incorrectNums.has(q.number));
  }
  
  if (searchVal.trim() !== '') {
    filtered = filtered.filter(q => 
      q.text.toLowerCase().includes(searchVal) || 
      q.options.some(opt => opt.toLowerCase().includes(searchVal)) ||
      `q${q.number}`.includes(searchVal) ||
      `question ${q.number}`.includes(searchVal)
    );
  }
  
  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="empty-review-state glass-panel">
        <i data-lucide="inbox"></i>
        <p>No questions match the current filters.</p>
      </div>
    `;
  } else {
    filtered.forEach(q => {
      const practiceAns = practiceState.answers[q.number];
      const card = renderQuestionCardMarkup(q, practiceAns, false);
      container.appendChild(card);
    });
  }
  
  if (window.lucide) window.lucide.createIcons();
}

function renderQuestionCardMarkup(q, selectedAnswers, isFromExamRecord = false) {
  const card = document.createElement('div');
  card.className = 'review-card glass-panel';
  
  let statusClass = 'unanswered';
  let statusText = 'Not Practiced';
  
  if (selectedAnswers && selectedAnswers.length > 0) {
    const isCorrect = selectedAnswers.length === q.answer.length && selectedAnswers.every(val => q.answer.includes(val));
    statusClass = isCorrect ? 'correct' : 'incorrect';
    statusText = isCorrect ? 'Correct' : 'Incorrect';
  }
  
  const isBookmarked = bookmarks.has(q.number);
  
  card.innerHTML = `
    <div class="review-card-header">
      <div class="review-badge-group">
        <div class="badge badge-topic">Q${q.number}</div>
        <span class="status-badge ${statusClass}">${statusText}</span>
      </div>
      <button class="btn-bookmark ${isBookmarked ? 'active' : ''}" data-num="${q.number}" title="Toggle Bookmark">
        <i data-lucide="bookmark"></i>
      </button>
    </div>
    <div class="question-body">
      <p class="question-text" style="font-size: 16px; margin-bottom:16px;">${q.text}</p>
      <div class="options-list">
        ${q.options.map((optText, optIdx) => {
          const letter = String.fromCharCode(65 + optIdx);
          const isCorrectOpt = q.answer.includes(letter);
          const isSelectedOpt = selectedAnswers && selectedAnswers.includes(letter);
          
          let stateClass = '';
          if (selectedAnswers && selectedAnswers.length > 0) {
            if (isCorrectOpt) stateClass = 'correct';
            else if (isSelectedOpt) stateClass = 'incorrect';
          } else {
            if (isCorrectOpt) stateClass = 'correct';
          }
          
          return `
            <div class="option-item ${stateClass}" style="cursor: default; padding: 12px 16px;">
              <div class="option-letter">${letter}</div>
              <div class="option-text" style="font-size: 14px;">${escapeHtml(optText)}</div>
            </div>
          `;
        }).join('')}
      </div>
    </div>
    <div class="answer-feedback-pane" style="background: rgba(255,255,255,0.01); border-color: var(--border-color); padding: 16px 20px;">
      <div class="correct-answer-display" style="margin-bottom: ${q.community_vote ? '14px' : '0'};">
        Correct Answer: <span class="answer-badge" style="background-color: var(--success-color);">${q.answer.join(', ')}</span>
        ${selectedAnswers && selectedAnswers.length > 0 ? `
          <span style="margin-left: 12px; font-size:14px; font-weight: normal; color: var(--text-secondary);">
            Your Selection: <strong>${selectedAnswers.join(', ')}</strong>
          </span>
        ` : ''}
      </div>
      
      ${q.community_vote ? `
        <div class="vote-distribution-container">
          <h5 style="font-size: 12px; color: var(--text-muted); margin-bottom: 8px;">Community Vote Distribution</h5>
          <div class="vote-bars">
            ${parseCommunityVotes(q.community_vote).map(vote => `
              <div class="vote-bar-item">
                <span class="vote-label" style="font-size: 11px;">${vote.label}</span>
                <div class="vote-track" style="height: 8px;">
                  <div class="vote-fill" style="width: ${vote.percentage}%"></div>
                </div>
                <span class="vote-percent" style="font-size: 11px; width: 35px;">${vote.percentage}%</span>
              </div>
            `).join('')}
          </div>
        </div>
      ` : ''}
    </div>
  `;
  
  const bkBtn = card.querySelector('.btn-bookmark');
  bkBtn.addEventListener('click', async () => {
    const qNum = parseInt(bkBtn.getAttribute('data-num'));
    if (bookmarks.has(qNum)) {
      bookmarks.delete(qNum);
      bkBtn.classList.remove('active');
    } else {
      bookmarks.add(qNum);
      bkBtn.classList.add('active');
    }
    
    // Sync update to Cloud DB
    await saveUserProgress();
    
    if (activeReviewFilter === 'bookmarks' && !isFromExamRecord) {
      renderReviewList();
    }
  });
  
  return card;
}

function saveActiveExam() {
  if (activeExam) {
    localStorage.setItem('secops_active_exam', JSON.stringify(activeExam));
  } else {
    localStorage.removeItem('secops_active_exam');
  }
}

// ================= UTILITIES =================
function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
