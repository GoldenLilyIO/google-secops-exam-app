// Google SecOps Exam Prep - Application Logic

// Global state
let questions = [];
let bookmarks = new Set();
let examHistory = [];
let practiceState = {
  currentIndex: 0,
  answers: {} // questionNum -> selectedArray
};
let activeExam = null;

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
    // Load local storage states
    loadStateFromStorage();
    
    // Fetch questions JSON
    const response = await fetch('./questions.json');
    questions = await response.json();
    
    // Initialize UI views
    initTheme();
    initNavigation();
    initDashboard();
    initPractice();
    initExam();
    initReviewCenter();
    
    // Refresh stats headers
    updateHeaderStats();
    
    // Initialize Lucide icons
    if (window.lucide) {
      window.lucide.createIcons();
    }
  } catch (err) {
    console.error("Error loading application:", err);
  }
});

// ================= STORAGE & STATE =================
function loadStateFromStorage() {
  bookmarks = new Set(JSON.parse(localStorage.getItem('secops_bookmarks') || '[]'));
  examHistory = JSON.parse(localStorage.getItem('secops_exam_history') || '[]');
  
  const savedPractice = localStorage.getItem('secops_practice_state');
  if (savedPractice) {
    practiceState = JSON.parse(savedPractice);
  } else {
    practiceState = { currentIndex: 0, answers: {} };
  }
  
  const savedActiveExam = localStorage.getItem('secops_active_exam');
  if (savedActiveExam) {
    activeExam = JSON.parse(savedActiveExam);
  }
}

function saveBookmarks() {
  localStorage.setItem('secops_bookmarks', JSON.stringify([...bookmarks]));
  updateHeaderStats();
}

function savePracticeState() {
  localStorage.setItem('secops_practice_state', JSON.stringify(practiceState));
  updateHeaderStats();
}

function saveExamHistory() {
  localStorage.setItem('secops_exam_history', JSON.stringify(examHistory));
}

function saveActiveExam() {
  if (activeExam) {
    localStorage.setItem('secops_active_exam', JSON.stringify(activeExam));
  } else {
    localStorage.removeItem('secops_active_exam');
  }
}

function updateHeaderStats() {
  document.getElementById('header-bookmarked-count').textContent = bookmarks.size;
  
  const completedPracticeCount = Object.keys(practiceState.answers).length;
  document.getElementById('header-completed-count').textContent = `${completedPracticeCount}/${questions.length}`;
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
    });
  });

  // Quick Action Buttons on Dashboard
  document.getElementById('start-practice-card').addEventListener('click', () => switchView('practice-view'));
  document.getElementById('start-exam-card').addEventListener('click', () => switchView('exam-view'));
  document.getElementById('start-review-card').addEventListener('click', () => {
    switchView('review-view');
    // Set filter to bookmarked
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
  // Calculate completion percentage
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
      const isPass = exam.score >= 70; // 70% passing threshold
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
    savePracticeState();
    renderPracticeQuestion();
  });
  
  document.getElementById('practice-prev-btn').addEventListener('click', () => {
    if (practiceState.currentIndex > 0) {
      practiceState.currentIndex--;
      savePracticeState();
      renderPracticeQuestion();
    }
  });
  
  document.getElementById('practice-bookmark-btn').addEventListener('click', () => {
    const q = questions[practiceState.currentIndex];
    if (bookmarks.has(q.number)) {
      bookmarks.delete(q.number);
      document.getElementById('practice-bookmark-btn').classList.remove('active');
    } else {
      bookmarks.add(q.number);
      document.getElementById('practice-bookmark-btn').classList.add('active');
    }
    saveBookmarks();
  });
  
  document.getElementById('practice-submit-btn').addEventListener('click', submitPracticeAnswer);
  
  document.getElementById('practice-next-btn').addEventListener('click', () => {
    if (practiceState.currentIndex < questions.length - 1) {
      practiceState.currentIndex++;
      savePracticeState();
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
  
  // Check if user has already answered this in this session
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
    
    // Toggle state selection
    if (previouslySelected && previouslySelected.includes(letter)) {
      item.classList.add('selected');
    }
    
    item.addEventListener('click', () => {
      // If already evaluated, don't allow changes
      if (!document.getElementById('practice-next-btn').classList.contains('hidden') || previouslySelected) {
        return;
      }
      
      if (q.is_multiple_choice) {
        // Toggle selection
        item.classList.toggle('selected');
      } else {
        // Single choice - clear all others
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
  
  // Scroll workspace to top
  document.querySelector('.workspace-layout').scrollIntoView({ behavior: 'smooth', block: 'start' });
  
  if (window.lucide) window.lucide.createIcons();
}

function submitPracticeAnswer() {
  const q = questions[practiceState.currentIndex];
  const list = document.getElementById('practice-options-list');
  const selectedItems = list.querySelectorAll('.option-item.selected');
  
  if (selectedItems.length === 0) {
    alert("Please select at least one option.");
    return;
  }
  
  const selectedLetters = Array.from(selectedItems).map(item => item.getAttribute('data-letter'));
  
  // Save answer state
  practiceState.answers[q.number] = selectedLetters;
  savePracticeState();
  
  // Hide check answer, show next button
  document.getElementById('practice-submit-btn').classList.add('hidden');
  document.getElementById('practice-next-btn').classList.remove('hidden');
  
  revealPracticeFeedback(q, selectedLetters);
  
  if (window.lucide) window.lucide.createIcons();
}

function revealPracticeFeedback(q, selectedLetters) {
  const list = document.getElementById('practice-options-list');
  const feedbackPane = document.getElementById('practice-feedback-pane');
  
  // Color the options list based on correctness
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
  
  // Build feedback explanation pane
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
      
      // Trigger bar animation in next frame
      setTimeout(() => {
        voteItem.querySelector('.vote-fill').style.width = `${vote.percentage}%`;
      }, 50);
    });
  } else {
    commVoteContainer.classList.add('hidden');
  }
}

// Parses string like "C (78%) B (22%)" into [{label: 'C', percentage: 78}, ...]
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
  
  // Flag checkbox
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
  
  // Result buttons
  document.getElementById('result-back-dash-btn').addEventListener('click', () => {
    activeExam = null;
    saveActiveExam();
    switchView('dashboard-view');
  });
  
  document.getElementById('result-review-btn').addEventListener('click', () => {
    // Redirect to review tab, showing this exam's results
    const lastResultIdx = examHistory.length - 1;
    openExamHistoryReview(lastResultIdx);
  });
}

function startNewExam() {
  // Generate 50 random questions
  const shuffled = [...questions].sort(() => 0.5 - Math.random());
  const selected = shuffled.slice(0, 50).map((q, idx) => {
    // Clone to prevent modifying static questions list
    return { ...q, examIndex: idx };
  });
  
  activeExam = {
    questions: selected,
    answers: {}, // index -> selected Letters array
    flags: [], // question numbers flagged
    currentIndex: 0,
    startTime: Date.now(),
    timeLeft: 120 * 60, // 120 mins
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
  
  // Show active workspace
  setupCard.classList.add('hidden');
  workspace.classList.remove('hidden');
  resultCard.classList.add('hidden');
  
  // Setup Grid
  initExamSidebarGrid();
  
  // Start Timer
  startExamTimer();
  
  // Render Current Question
  renderExamQuestion();
}

function startExamTimer() {
  if (activeExam.timerInterval) {
    clearInterval(activeExam.timerInterval);
  }
  
  // Calculate remaining time relative to current epoch and start duration
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
  
  // Turn timer red in final 5 minutes
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
  
  // Toggle prev/next disable states
  document.getElementById('exam-prev-btn').disabled = activeExam.currentIndex === 0;
  document.getElementById('exam-next-btn').disabled = activeExam.currentIndex === activeExam.questions.length - 1;
  
  // Sync flag state
  document.getElementById('exam-flag-checkbox').checked = activeExam.flags.includes(q.number);
  
  // Render meta & text
  document.getElementById('exam-current-num').textContent = activeExam.currentIndex + 1;
  document.getElementById('exam-question-text').textContent = q.text;
  
  // Render options list
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
      
      // Save choice instantly
      const activeSelections = Array.from(list.querySelectorAll('.option-item.selected')).map(el => el.getAttribute('data-letter'));
      activeExam.answers[activeExam.currentIndex] = activeSelections;
      saveActiveExam();
      updateExamSidebarGrid();
    });
    
    list.appendChild(item);
  });
  
  // Highlight active grid box
  updateExamSidebarGrid();
  
  // Scroll container to top
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
    
    // Clear classes
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

function submitExam() {
  if (!activeExam) return;
  
  // Stop timer
  clearInterval(activeExam.timerInterval);
  activeExam.timerInterval = null;
  
  // Calculate Score
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
  saveExamHistory();
  
  // Set active exam state to completed
  activeExam.completed = true;
  activeExam.resultRecord = historyRecord;
  saveActiveExam();
  
  // Render results
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
    feedbackEl.textContent = `You scored ${result.score}%, which is below the 70% passing score. Don't worry—review your mistakes and try again!`;
    titleEl.style.color = 'var(--danger-color)';
    ring.setAttribute('stroke', 'var(--danger-color)');
  }
  
  // Update progress ring stroke dash
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

// Redirects to Review tab, loaded with a past exam history record
function openExamHistoryReview(historyIdx) {
  const record = examHistory[historyIdx];
  if (!record) return;
  
  // Switch to review view pane
  switchView('review-view');
  
  // Change active filter tab style
  document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
  
  const container = document.getElementById('review-list-container');
  container.innerHTML = '';
  
  // Header explaining we are viewing mock exam review
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
  
  // Render exam questions
  record.questions.forEach((q, idx) => {
    const card = renderQuestionCardMarkup(q, q.userAnswer, true);
    container.appendChild(card);
  });
  
  if (window.lucide) window.lucide.createIcons();
}

// ================= REVIEW CENTER =================
let activeReviewFilter = 'all'; // 'all', 'bookmarks', 'incorrect'

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
  
  // Filter core questions array
  let filtered = [...questions];
  
  if (activeReviewFilter === 'bookmarks') {
    filtered = filtered.filter(q => bookmarks.has(q.number));
  } else if (activeReviewFilter === 'incorrect') {
    // Gather incorrect question numbers from all exam histories
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
      // Check if they answered this in practice mode
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
  
  // Calculate status badge
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
        <!-- Render Options -->
        ${q.options.map((optText, optIdx) => {
          const letter = String.fromCharCode(65 + optIdx);
          const isCorrectOpt = q.answer.includes(letter);
          const isSelectedOpt = selectedAnswers && selectedAnswers.includes(letter);
          
          let stateClass = '';
          if (selectedAnswers && selectedAnswers.length > 0) {
            if (isCorrectOpt) stateClass = 'correct';
            else if (isSelectedOpt) stateClass = 'incorrect';
          } else {
            // Just highlight correct option if looking in review center
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
      
      <!-- Community vote bars -->
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
  
  // Wire up bookmark button event
  const bkBtn = card.querySelector('.btn-bookmark');
  bkBtn.addEventListener('click', () => {
    const qNum = parseInt(bkBtn.getAttribute('data-num'));
    if (bookmarks.has(qNum)) {
      bookmarks.delete(qNum);
      bkBtn.classList.remove('active');
    } else {
      bookmarks.add(qNum);
      bkBtn.classList.add('active');
    }
    saveBookmarks();
    
    // If we're on the bookmark filter view, re-render list to drop removed item
    if (activeReviewFilter === 'bookmarks' && !isFromExamRecord) {
      renderReviewList();
    }
  });
  
  return card;
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
