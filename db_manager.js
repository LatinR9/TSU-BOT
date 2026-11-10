// C:\Users\acer\.gemini\antigravity\scratch\elearn_bot\db_manager.js
const fs = require('fs');
const path = require('path');

const MAIN_DB_PATH = path.join(__dirname, 'tsu_answers.json');
const CUSTOM_DB_PATH = path.join(__dirname, 'custom_courses.json');

class DBManager {
  constructor() {
    this.courses = [];
    this.loadDatabase();
  }

  loadDatabase() {
    this.courses = [];
    if (fs.existsSync(MAIN_DB_PATH)) {
      try {
        const raw = fs.readFileSync(MAIN_DB_PATH, 'utf-8');
        const parsed = JSON.parse(raw);
        if (parsed.courses && Array.isArray(parsed.courses)) {
          this.courses.push(...parsed.courses);
        }
      } catch (err) {
        console.error('Error reading tsu_answers.json:', err.message);
      }
    }

    if (fs.existsSync(CUSTOM_DB_PATH)) {
      try {
        const raw = fs.readFileSync(CUSTOM_DB_PATH, 'utf-8');
        const custom = JSON.parse(raw);
        if (Array.isArray(custom)) {
          this.courses.push(...custom);
        }
      } catch (err) {
        console.error('Error reading custom_courses.json:', err.message);
      }
    }
  }

  getCoursesSummary() {
    return this.courses.map(c => {
      let totalQuestions = 0;
      let confirmedQuestions = 0;
      if (c.sections && Array.isArray(c.sections)) {
        for (const s of c.sections) {
          if (s.questions && Array.isArray(s.questions)) {
            totalQuestions += s.questions.length;
            confirmedQuestions += s.questions.filter(q => q.status === 'confirmed').length;
          }
        }
      }
      return {
        course_code: c.course_code,
        course_name: c.course_name || c.course_code,
        org: c.org || '',
        url: c.course_id_url_if_known || '',
        totalQuestions,
        confirmedQuestions,
        sectionsCount: (c.sections || []).length
      };
    });
  }

  addCourse(courseData) {
    // Check if course already exists
    const existingIndex = this.courses.findIndex(c => c.course_code === courseData.course_code);
    const newCourse = {
      course_code: courseData.course_code,
      course_name: courseData.course_name || courseData.course_code,
      org: courseData.org || 'Custom',
      course_id_url_if_known: courseData.url || '',
      pretest_policy: 'random',
      sections: courseData.sections || [
        {
          section: 'Default Section',
          questions: courseData.questions || []
        }
      ]
    };

    let customList = [];
    if (fs.existsSync(CUSTOM_DB_PATH)) {
      try {
        customList = JSON.parse(fs.readFileSync(CUSTOM_DB_PATH, 'utf-8'));
      } catch (e) {
        customList = [];
      }
    }

    const cIdx = customList.findIndex(c => c.course_code === courseData.course_code);
    if (cIdx >= 0) {
      customList[cIdx] = newCourse;
    } else {
      customList.push(newCourse);
    }

    fs.writeFileSync(CUSTOM_DB_PATH, JSON.stringify(customList, null, 2), 'utf-8');
    this.loadDatabase();
    return newCourse;
  }

  findAnswer(courseCode, questionText, sectionHint = '', questionIndex = -1) {
    if (!questionText) return null;
    const cleanQ = questionText.replace(/\s+/g, ' ').trim().toLowerCase();

    const targetCourse = this.courses.find(c => c.course_code === courseCode);
    const searchCourses = targetCourse ? [targetCourse] : this.courses;

    // Verb mapping for passive voice (TSUGE00152 and similar)
    const verbMatch = questionText.match(/\(([a-zA-Z\s]+)\)/);
    const bracketVerb = verbMatch ? verbMatch[1].trim().toLowerCase() : '';
    const verbMap = {
      'buy': 'are bought',
      'use': 'is used',
      'send': 'are sent',
      'book': 'are booked',
      'search': 'is searched',
      'read': 'are read',
      'see': 'are seen',
      'carry out': 'are carried out',
      'receive': 'are received',
      'make': 'are made',
      'solve': 'was solved',
      'write': 'was written',
      'build': 'was built',
      'promote': 'was promoted',
      'eat': 'were eaten'
    };

    if (bracketVerb && verbMap[bracketVerb]) {
      return {
        question: questionText,
        correct_answer: verbMap[bracketVerb],
        status: 'confirmed',
        known_wrong_answers: [],
        score: 1.0
      };
    }

    let bestMatch = null;
    let highestScore = 0;

    for (const course of searchCourses) {
      for (const section of (course.sections || [])) {
        const isTargetSection = sectionHint && section.section && (
          section.section.toLowerCase().includes(sectionHint.toLowerCase()) ||
          sectionHint.toLowerCase().includes(section.section.toLowerCase())
        );

        for (let qIdx = 0; qIdx < (section.questions || []).length; qIdx++) {
          const q = section.questions[qIdx];
          const dbQ = (q.question || '').replace(/\s+/g, ' ').trim().toLowerCase();
          const score = this.calculateSimilarity(cleanQ, dbQ);

          if (score > highestScore && score >= 0.45) {
            highestScore = score;
            bestMatch = {
              question: q.question,
              correct_answer: q.correct_answer,
              status: q.status,
              known_wrong_answers: q.known_wrong_answers || [],
              score
            };
          }

          if (isTargetSection && questionIndex >= 0 && qIdx === questionIndex && (q.notes || '').includes('listed order')) {
            if (!bestMatch || highestScore < 0.8) {
              bestMatch = {
                question: q.question,
                correct_answer: q.correct_answer,
                status: q.status,
                known_wrong_answers: q.known_wrong_answers || [],
                score: 0.95
              };
            }
          }
        }
      }
    }

    return bestMatch;
  }

  calculateSimilarity(s1, s2) {
    if (s1 === s2) return 1.0;
    if (s1.includes(s2) || s2.includes(s1)) {
      return Math.min(s1.length, s2.length) / Math.max(s1.length, s2.length);
    }
    const words1 = new Set(s1.split(' '));
    const words2 = new Set(s2.split(' '));
    let intersection = 0;
    for (const w of words1) {
      if (words2.has(w)) intersection++;
    }
    const union = new Set([...words1, ...words2]).size;
    return union > 0 ? (intersection / union) : 0;
  }
}

module.exports = new DBManager();
