/**
 * EdTech Quiz Logic Controller
 * Tích hợp Firebase REST API để đếm số lượt làm bài
 */

// ĐƯỜNG DẪN DATABASE FIREBASE CỦA BẠN
const FIREBASE_URL = "https://ontap-59972-default-rtdb.firebaseio.com/quizStats.json";

document.addEventListener("DOMContentLoaded", () => {
    // --- STATE VARIABLES ---
    let questions = [];
    let startTime = null;
    let timerInterval = null;

    // --- DOM ELEMENTS ---
    const loadingSection = document.getElementById('loading-section');
    const quizSection = document.getElementById('quiz-section');
    const resultSection = document.getElementById('result-section');
    const questionsContainer = document.getElementById('questions-container');
    const quizForm = document.getElementById('quiz-form');
    const timerDisplay = document.getElementById('timer-display');
    const timeSpan = timerDisplay.querySelector('span');
    const reviewContainer = document.getElementById('review-container');
    const attemptsSpan = document.querySelector('#attempts-display span');

    // --- INITIALIZATION ---
    init();

    async function init() {
        try {
            // Lấy tổng số lượt làm bài từ Firebase khi vừa vào web
            fetchGlobalAttempts();

            // ĐIỂM MỚI: Thêm query string thời gian thực để xóa Cache trình duyệt
            const rawData = await fetchQuizData('data.txt');
            questions = parseData(rawData);
            startQuiz();
        } catch (error) {
            loadingSection.innerHTML = `<p style="color:red;">Lỗi tải dữ liệu: ${error.message}</p>`;
        }
    }

    async function fetchQuizData(url) {
        // Cache Busting: Bắt trình duyệt tải file mới nhất
        const cacheBuster = `?t=${new Date().getTime()}`;
        const response = await fetch(url + cacheBuster);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        return await response.text();
    }

    async function fetchGlobalAttempts() {
        try {
            const response = await fetch(FIREBASE_URL);
            const data = await response.json();
            if (data && data.totalAttempts) {
                attemptsSpan.textContent = data.totalAttempts;
            } else {
                attemptsSpan.textContent = 0;
            }
        } catch (error) {
            console.error("Không thể lấy dữ liệu bộ đếm từ Firebase:", error);
            attemptsSpan.textContent = "Lỗi";
        }
    }

    async function incrementGlobalAttempts() {
        try {
            // 1. Lấy dữ liệu hiện tại
            const response = await fetch(FIREBASE_URL);
            let data = await response.json();
            
            let currentTotal = (data && data.totalAttempts) ? data.totalAttempts : 0;
            currentTotal += 1;

            // 2. Gửi dữ liệu đã cộng dồn lên Firebase
            await fetch(FIREBASE_URL, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ totalAttempts: currentTotal })
            });

            // 3. Cập nhật giao diện
            attemptsSpan.textContent = currentTotal;
        } catch (error) {
            console.error("Không thể cập nhật bộ đếm lên Firebase:", error);
        }
    }

    function parseData(text) {
        const lines = text.split('\n');
        const parsedQuestions = [];
        let currentQ = null;

        lines.forEach(line => {
            line = line.trim();
            if (!line) return;

            let qMatch = line.match(/^Ask\d+:\s*(.*)/i);
            if (qMatch) {
                if (currentQ) parsedQuestions.push(currentQ);
                currentQ = {
                    questionText: qMatch[1],
                    options: [],
                    key: null,
                    type: 'single'
                };
                return;
            }

            let aMatch = line.match(/^answer\d+:\s*(.*)/i);
            if (aMatch && currentQ) {
                currentQ.options.push(aMatch[1]);
                return;
            }

            let kMatch = line.match(/^Key:\s*(.*)/i);
            if (kMatch && currentQ) {
                const keyStr = kMatch[1];
                if (keyStr.includes(',')) {
                    currentQ.type = 'multi';
                    currentQ.key = keyStr.split(',').map(Number);
                } else {
                    currentQ.type = 'single';
                    currentQ.key = parseInt(keyStr, 10);
                }
            }
        });

        if (currentQ) parsedQuestions.push(currentQ);
        return parsedQuestions;
    }

    function startQuiz() {
        renderQuestions();
        loadingSection.classList.add('hidden');
        resultSection.classList.add('hidden');
        quizSection.classList.remove('hidden');
        
        quizForm.reset();
        startTime = Date.now();
        timerDisplay.classList.remove('hidden');
        clearInterval(timerInterval);
        timerInterval = setInterval(updateTimer, 1000);
        updateTimer();
    }

    function renderQuestions() {
        questionsContainer.innerHTML = '';
        const fragment = document.createDocumentFragment();

        questions.forEach((q, qIndex) => {
            const block = document.createElement('div');
            block.className = 'question-block';

            const title = document.createElement('div');
            title.className = 'question-text';
            title.textContent = `Câu ${qIndex + 1}: ${q.questionText}`;
            if (q.type === 'multi') {
                title.textContent += ' (Có thể chọn nhiều đáp án)';
            }
            block.appendChild(title);

            const optionsGroup = document.createElement('div');
            optionsGroup.className = 'options-group';

            q.options.forEach((optText, optIndex) => {
                const label = document.createElement('label');
                label.className = 'option-label';

                const input = document.createElement('input');
                input.type = q.type === 'single' ? 'radio' : 'checkbox';
                input.name = `question_${qIndex}`;
                input.value = optIndex + 1;

                label.appendChild(input);
                label.appendChild(document.createTextNode(` ${optText}`));
                optionsGroup.appendChild(label);
            });

            block.appendChild(optionsGroup);
            fragment.appendChild(block);
        });

        questionsContainer.appendChild(fragment);
    }

    function updateTimer() {
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        const m = String(Math.floor(elapsed / 60)).padStart(2, '0');
        const s = String(elapsed % 60).padStart(2, '0');
        timeSpan.textContent = `${m}:${s}`;
    }

    quizForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        clearInterval(timerInterval);
        timerDisplay.classList.add('hidden');
        
        // ĐIỂM MỚI: Gọi hàm cập nhật số lượt lên Database
        await incrementGlobalAttempts();

        const timeTakenMs = Date.now() - startTime;
        evaluateResults(timeTakenMs);
    });

    function evaluateResults(timeTakenMs) {
        let correctCount = 0;
        const formData = new FormData(quizForm);
        reviewContainer.innerHTML = '';
        const reviewFragment = document.createDocumentFragment();

        questions.forEach((q, qIndex) => {
            const isCorrect = checkAnswer(q, qIndex, formData);
            if (isCorrect) correctCount++;
            
            const reviewItem = buildReviewItem(q, qIndex, isCorrect, formData);
            reviewFragment.appendChild(reviewItem);
        });

        reviewContainer.appendChild(reviewFragment);

        const accuracy = Math.round((correctCount / questions.length) * 100);
        const m = String(Math.floor(timeTakenMs / 60000)).padStart(2, '0');
        const s = String(Math.floor((timeTakenMs % 60000) / 1000)).padStart(2, '0');

        document.getElementById('score-display').textContent = `${correctCount}/${questions.length}`;
        document.getElementById('accuracy-display').textContent = `${accuracy}%`;
        document.getElementById('time-display').textContent = `${m}:${s}`;

        quizSection.classList.add('hidden');
        resultSection.classList.remove('hidden');
        window.scrollTo(0, 0); // Tự động cuộn lên đầu xem kết quả
    }

    function checkAnswer(q, qIndex, formData) {
        if (q.type === 'single') {
            const selected = formData.get(`question_${qIndex}`);
            return selected && parseInt(selected, 10) === q.key;
        } else {
            const selectedArr = formData.getAll(`question_${qIndex}`).map(Number);
            let isMatch = true;
            q.key.forEach((val, idx) => {
                const optValue = idx + 1;
                const isSelected = selectedArr.includes(optValue);
                const shouldBeSelected = val === 1;
                if (isSelected !== shouldBeSelected) {
                    isMatch = false;
                }
            });
            return isMatch;
        }
    }

    function buildReviewItem(q, qIndex, isCorrect, formData) {
        const div = document.createElement('div');
        div.className = `review-item ${isCorrect ? 'review-correct' : 'review-incorrect'}`;
        
        const title = document.createElement('h4');
        title.textContent = `Câu ${qIndex + 1}: ${q.questionText}`;
        div.appendChild(title);

        const feedback = document.createElement('p');
        feedback.className = `feedback-text ${isCorrect ? 'feedback-correct' : 'feedback-incorrect'}`;
        feedback.textContent = isCorrect ? '✓ Chính xác' : '✗ Chưa chính xác';
        div.appendChild(feedback);

        const correctInfo = document.createElement('p');
        correctInfo.style.marginTop = '10px';
        correctInfo.style.fontSize = '0.9rem';
        
        if (q.type === 'single') {
            correctInfo.textContent = `Đáp án đúng: ${q.options[q.key - 1]}`;
        } else {
            const correctOpts = q.key.map((val, idx) => val === 1 ? q.options[idx] : null).filter(v => v !== null);
            correctInfo.textContent = `Đáp án đúng: ${correctOpts.join(', ')}`;
        }
        div.appendChild(correctInfo);

        return div;
    }

    document.getElementById('retake-btn').addEventListener('click', () => {
        startQuiz();
        fetchGlobalAttempts(); // Lấy số mới nhất trước khi làm lại
    });
});
