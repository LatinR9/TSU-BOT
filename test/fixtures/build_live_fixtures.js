// Writes the live-layout capa fixtures (test/fixtures/live_*.html) from the specs below.
// Layout copied from the TSUGE00152 screenshots of 2026-11-10: the block title ("Dropdown",
// "problem", "Multiple Choice") is the h3.problem-header, the question is in body paragraphs,
// optionresponse selects start with edX's dummy "Select an option", and Submit stays disabled
// until every input of the block has a value. Not real page HTML (none was captured).
// Run: node test/fixtures/build_live_fixtures.js
const fs = require('fs');
const path = require('path');

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function selectHtml(id, label, options) {
  return `
        <div class="wrapper-problem-response" tabindex="-1" aria-label="Question ${esc(label)}" role="group">
          <div class="inputtype option-input">
            <label class="problem-group-label" for="input_${id}">${esc(label)}</label>
            <div class="input-wrapper"><select name="input_${id}" id="input_${id}" aria-describedby="status_${id}">
              <option value="option_${id}_dummy_default">Select an option</option>
${options.map(o => `              <option value="${esc(o)}">${esc(o)}</option>`).join('\n')}
            </select></div>
            <span class="status unanswered" id="status_${id}"><span class="sr">unanswered</span></span>
          </div>
        </div>`;
}

function textHtml(id) {
  return `
        <div class="wrapper-problem-response" tabindex="-1" aria-label="Question" role="group">
          <div class="inputtype textline capa_inputtype">
            <input type="text" name="input_${id}" id="input_${id}" aria-describedby="status_${id}" size="20" value="">
            <span class="status unanswered" id="status_${id}"><span class="sr">unanswered</span></span>
          </div>
        </div>`;
}

function radioHtml(id, legend, choices) {
  return `
        <div class="wrapper-problem-response" tabindex="-1" aria-label="Question" role="group">
          <div class="choicegroup capa_inputtype" id="inputtype_${id}"><fieldset aria-describedby="status_${id}">
${choices.map((c, ci) => `            <div class="field">
              <input type="radio" name="input_${id}" id="input_${id}_choice_${ci}" class="field-input input-radio" value="choice_${ci}">
              <label id="${id}-choice_${ci}-label" for="input_${id}_choice_${ci}" class="response-label field-label label-inline">${esc(c)}</label>
            </div>`).join('\n')}
            <span class="status unanswered" id="status_${id}"><span class="sr">unanswered</span></span>
          </fieldset></div>
        </div>`;
}

// block: { title, points, attempts, paras: [html], inputs: [{ select: [opts], label } | { text: true } | { radio: [choices] }] }
function blockHtml(b, n) {
  const id = `b${n + 1}`;
  const inputs = b.inputs.map((inp, k) => {
    const rid = `${id}_${k + 2}_1`;
    if (inp.select) return selectHtml(rid, inp.label, inp.select);
    if (inp.radio) return radioHtml(rid, '', inp.radio);
    return textHtml(rid);
  }).join('');
  const pts = b.points || b.inputs.length;
  return `
<div class="vert vert-${n}" data-id="${id}">
  <div class="xblock xblock-student_view xblock-student_view-problem" data-block-type="problem">
    <div class="problems-wrapper" id="problem_${id}" data-problem-id="${id}">
      <h3 class="hd hd-3 problem-header" id="${id}-problem-title" aria-describedby="${id}-problem-progress">${esc(b.title)}</h3>
      <div class="problem-progress" id="${id}-problem-progress">${pts} point${pts > 1 ? 's' : ''} possible (graded)</div>
      <div class="problem"><div>
${b.paras.map(p => `        <p>${p}</p>`).join('\n')}${inputs}
      </div></div>
      <div class="action">
        <div class="submit-attempt-container">
          <button type="button" class="submit btn-brand" data-submitting="Submitting" data-value="Submit" data-should-enable-submit-button="False" aria-describedby="submission_feedback_${id}" disabled><span class="submit-label">Submit</span></button>
          <div class="submission-feedback" id="submission_feedback_${id}">You have used 0 of ${b.attempts || 2} attempts</div>
        </div>
        <div class="problem-action-buttons-wrapper"><button type="button" class="save problem-action-btn btn-default btn-small" data-value="Save"><span aria-hidden="true">Save</span></button></div>
      </div>
    </div>
  </div>
</div>`;
}

function page(title, blocks) {
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><title>${esc(title)} | Language and Communication | TSU COURSE</title></head>
<body>
<nav aria-label="breadcrumb" class="breadcrumbs"><ol><li>Language and Communication</li><li>${esc(title)}</li></ol></nav>
<div class="vert-mod">${blocks.map(blockHtml).join('')}
</div>
<script>
  window.__submits = [];
  document.querySelectorAll('.problems-wrapper').forEach(w => {
    const btn = w.querySelector('button.submit');
    const fields = () => Array.from(w.querySelectorAll('select, input[type="text"], input[type="radio"]'));
    const filled = () => {
      const named = new Map();
      fields().forEach(el => {
        const v = el.type === 'radio' ? (el.checked ? el.value : '') : el.tagName === 'SELECT' ? (/_dummy_default$/.test(el.value) ? '' : el.value) : el.value;
        named.set(el.name, named.get(el.name) || v);
      });
      return [...named.values()];
    };
    const refresh = () => { btn.disabled = filled().some(v => !v); };
    w.addEventListener('input', refresh);
    w.addEventListener('change', refresh);
    btn.addEventListener('click', () => {
      if (btn.disabled) return;
      window.__submits.push({ block: w.dataset.problemId, values: filled() });
      w.querySelector('.submission-feedback').textContent = 'Your answer has been received. You have used 1 of 2 attempts';
      btn.disabled = true;
    });
  });
</script>
</body></html>
`;
}

const two = (title, paras, opts1, opts2, labels = ['1', '2']) =>
  ({ title, paras, inputs: [{ select: opts1, label: labels[0] }, { select: opts2, label: labels[1] }] });

// Unit 5 Chapter 5: blocks 1-5 two dropdowns, 6-10 one text box.
const u5c5 = [
  two('Dropdown', ['Directions: Put in the correct third conditional verb form..', '1. If Milada ___1___ (not / be) late, we ___2___ (not / miss) the train.'],
    ['wasn’t', 'hadn’t been', 'hasn’t been'], ['wouldn’t miss', 'wouldn’t have missed', 'didn’t miss']),
  two('problem', ['2. If Amada ___1___ (study) harder, she ___2___ (pass) the final exam.'],
    ['studied', 'had studied', 'has studied'], ['would pass', 'would have passed', 'will pass']),
  two('problem', ['3. If the bus ___1___ (arrive) on time, we ___2___ (see) the beginning of the show.'],
    ['had arrived', 'arrived', 'arrives'], ['would see', 'would have seen', 'will see']),
  two('problem', ['4. If you ___1___ (go) to bed earlier, the noise ___2___ (not / wake) you up.'],
    ['went', 'had gone', 'have gone'], ['wouldn’t have woken', 'wouldn’t wake', 'won’t wake']),
  two('problem', ['5. If the band ___1___ (become) famous, they ___2___ (record) another album.'],
    ['became', 'had become', 'has become'], ['would record', 'would have recorded', 'recorded']),
  { title: 'problem', paras: ['6. If she had gone to medical school, she ______ (become) a doctor.'], inputs: [{ text: true }] },
  { title: 'problem', paras: ['7. If Emma _______ (be) more careful, she wouldn\'t have fallen.'], inputs: [{ text: true }] },
  { title: 'problem', paras: ['8. If Sophai had got the scholarship, she ______ (study) abroad.'], inputs: [{ text: true }] },
  { title: 'problem', paras: ['9. If they _______ (not / go) out, they wouldn\'t have met.'], inputs: [{ text: true }] },
  { title: 'problem', paras: ['10. They wouldn\'t have been late if they _______ (not / go) shopping.'], inputs: [{ text: true }] }
];

// Unit 4 Chapter 4: Part 1 = 11 two-dropdown blocks labelled (1)/(2); 9 and 10 share a prompt.
const sc = (n, s, a, b, title = 'problem', paras = []) => two(title, [...paras, `${n}. ${s}`], a, b, ['(1)', '(2)']);
const u4c4 = [
  sc(1, 'They __(1)__ (not/go) back home if you __(2)__ (pay) them.', ['won’t go', 'wouldn’t go', 'didn’t go'], ['pay', 'paid', 'would pay'], 'Dropdown', ['Part 1 : Choose the correct form for Second Conditional.']),
  sc(2, 'If I _(1)__(have) a dog, he_(2)__ (carry) the things for me.', ['have', 'had', 'would have'], ['would carry', 'carried', 'will carry']),
  sc(3, 'Your pencils __(1)__ (break) if you __(2)__ (pack) them carefully.', ['wouldn’t break', 'didn’t break', 'won’t break'], ['pack', 'packed', 'would pack']),
  sc(4, 'If Alex __(1)__ (sell) his car, he __(2)__ (buy) a motorbike.', ['sold', 'sells', 'would sell'], ['will buy', 'would buy', 'bought']),
  sc(5, 'We __(1)__ (come) to the party if it __(2)__ (start) later.', ['would come', 'came', 'will come'], ['starts', 'would start', 'started']),
  sc(6, 'If you __(1)__ (change) your habits, you __(2)__ (save) money.', ['change', 'changed', 'would change'], ['would save', 'saved', 'will save']),
  sc(7, 'If you __(1)__ (not click) the link, they __(2)__ (not cancel) your account.', ['didn’t click', 'don’t click', 'wouldn’t click'], ['wouldn’t cancel', 'didn’t cancel', 'won’t cancel']),
  sc(8, 'If the students __(1)__ (keep) notes, they __(2)__ (not forget) the rules.', ['kept', 'keep', 'would keep'], ['didn’t forget', 'wouldn’t forget', 'won’t forget']),
  sc(9, 'If he __(1)__ (be) younger, he __(2)__ (travel) around the world.', ['is', 'were', 'would be'], ['would travel', 'travelled', 'will travel']),
  sc(10, 'If he __(1)__ (be) younger, he __(2)__ (travel) around the world.', ['were', 'was being', 'would be'], ['travels', 'would travel', 'travelled']),
  sc(11, 'If she __(1)__ (not be) always late, she __(2)__ (be) promoted.', ['isn’t', 'weren’t', 'wouldn’t be'], ['would be', 'was', 'will be']),
  { title: 'Text Input', paras: ['Part 2 : Fill in the blanks with the correct form.', '12. If I ______ you, I wouldn\'t trust him.'], inputs: [{ text: true }] },
  { title: 'problem', paras: ['13. If we didn\'t take precautions, we ______ hurt.'], inputs: [{ text: true }] },
  { title: 'problem', paras: ['14. If the weather ________ better, we ________ to the park.'], inputs: [{ text: true }, { text: true }] },
  { title: 'problem', paras: ['15. If her hair were black, she ________ completely different.'], inputs: [{ text: true }] },
  { title: 'problem', paras: ['16. If smoking were allowed, I ________ a cigarette.'], inputs: [{ text: true }] },
  { title: 'problem', paras: ['17. Would you mind if I ______ the window?'], inputs: [{ text: true }] },
  { title: 'problem', paras: ['18. If we sold the house we ______ much right now.'], inputs: [{ text: true }] },
  { title: 'problem', paras: ['19. You ______ healthier if you ______ a bit of weight.'], inputs: [{ text: true }, { text: true }] },
  { title: 'problem', paras: ['20. If Paul __________ television so often, he would have more time for his homework.'], inputs: [{ text: true }] },
  { title: 'problem', paras: ['21. We would be able to swim better if we __________ swimming more often.'], inputs: [{ text: true }] }
];

// Unit 4 Chapter 2: Multiple Choice blocks; Q6 has the live options with no real noun of "produce" (user picked "refused").
const mc = (title, paras, choices) => ({ title, points: 1, attempts: 3, paras, inputs: [{ radio: choices }] });
const noun = (n, verb, sentence, choices, title = 'problem') =>
  mc(title, ['<b style="color:#1f5fa8">Part 1 : Choose the best answer.</b>', `<b>${n}. Which noun formed from the verb ${verb}, can be used to fill in the blank? “${sentence}”</b>`], choices);
const u4c2 = [
  noun(1, 'intend', 'Her ____ was noble.', ['intention', 'intended', 'intension', 'intends'], 'Multiple Choice'),
  noun(2, 'deliver', 'The ____ of the parcel took three days.', ['deliverance', 'delivery', 'deliverer', 'delivers']),
  noun(3, 'omit', 'The ____ of his name was a mistake.', ['omitting', 'omitance', 'omission', 'omited']),
  noun(4, 'lie', 'Tom is a consistent ____.', ['liar', 'lier', 'lying', 'lies']),
  noun(5, 'refuse', 'His ____ to help surprised us.', ['refusing', 'refusement', 'refused', 'refusal']),
  noun(6, 'produce', 'As a result, the cotton ____ went up.', ['producter', 'producement', 'produceion', 'refused']),
  noun(7, 'appoint', 'I have an ____ with the dentist.', ['appointment', 'appointion', 'appointance', 'appointed']),
  noun(8, 'decide', 'It was a difficult ____.', ['decidement', 'decision', 'deciding', 'decidance']),
  noun(9, 'choose', 'You have no ____.', ['chose', 'chosen', 'choice', 'choosing']),
  noun(10, 'dismiss', 'His ____ came as a shock.', ['dismission', 'dismissal', 'dismissment', 'dismissed']),
  mc('problem', ['Part 2', '11. "He slipped on the peel of a banana." peel is a noun; choose the sentence where it is a verb.'],
    ['The peel was yellow.', 'Monkeys peel bananas very easily.', 'Orange peel smells nice.']),
  mc('problem', ['12. "Light is able to travel in a vaccum." vaccum is a noun; choose the sentence where it is a verb.'],
    ['The vacuum cleaner is broken.', 'The maid had to vacuum the house twice to clean the house thoroughly.', 'Space is a vacuum.']),
  mc('problem', ['13. "The present I gave her for her birthday was a book." present is a noun; choose the sentence where it is a verb.'],
    ['I will present her with a board game on her birthday.', 'Live in the present.', 'The present was small.']),
  mc('problem', ['14. "I had to park the car a mile away" park is a verb; choose the sentence where it is a noun.'],
    ['Park here, please.', 'The biological park was close to the venue.', 'They park badly.']),
  mc('problem', ['15. "Plant the seed in a pot and water it." Plant is a verb; choose the sentence where it is a noun.'],
    ['Plant more trees.', 'The thief wanted to steal the plant.', 'We plant rice in May.'])
];

// Unit 5 Chapter 3 / 4: one text box per block, block title "problem", item text not matching the bank.
const u5c3Items = ['orange', 'bottle of milk', 'carton of juice', 'ice-cream', 'banana', 'small melon', 'hamburger', 'piece of ham',
  'pizza', 'apple', 'school uniform', 'hour', 'accident', 'white egg', 'English umbrella', 'green apple', 'European', 'house', 'umbrella', 'airport'];
const u5c3 = u5c3Items.map((w, i) => ({ title: 'problem', points: 1, paras: [...(i === 0 ? ['Directions: 1. Complete this shopping list with a/an.'] : []), `${i + 1}. ______ ${w}`], inputs: [{ text: true }] }));
const u5c4Items = ['Christ need to be at ____ hospital for her check-up.', 'Blast! I forgot to lock ____ door.', 'She\'s tired. She\'s going to ____ bed.',
  'My children always walk to ____ park.', 'What time do they have ____ breakfast?', 'Susan loves ____ chocolate.', 'Have you seen ____ film I told you about?',
  '____ Chinese practise tai chi.', 'Sadly, Martin doesn\'t go to ____ church.', 'Suzanne works at ____ university near here.'];
const u5c4 = u5c4Items.map((s, i) => ({ title: 'problem', points: 1, paras: [...(i === 0 ? ['Directions: Fill the gap with \'the\' or no article \'-\'.'] : []), `${i + 1}. ${s}`], inputs: [{ text: true }] }));

// Unit 3 Chapter 3: gerund / infinitive radio blocks around Q9 (live options staying / to stay / stay).
const u3c3 = [
  mc('Multiple Choice', ['8. We are looking forward _______ you.'], ['to see', 'seeing', 'see']),
  mc('problem', ["9. I'd rather _______ here if you don't mind."], ['staying', 'to stay', 'stay']),
  mc('problem', ['10. She pretended _______ interested.'], ['being', 'to be', 'be'])
];

// Unit 2 Chapter 2: question tags typed into text boxes.
const u2c2Items = ['Anna is from Mexico, ______?', 'We are late for the meeting, ______?', 'James isn\'t a doctor, ______?', 'I was wrong about that, ______?',
  'Andrew was pretty angry, ______?', 'You have done your homework, ______?', 'You would never tell anyone, ______?', 'You like chocolate, ______?',
  'Sheena won\'t mind, ______?', 'Your little Amy can swim, ______?', 'Patrick will come, ______?', 'Rita never actually cooks, ______?',
  'I\'m not interested, ______?', 'You haven\'t written it yet, ______?', 'Tom couldn\'t come, ______?', 'Let\'s go surfing, ______?',
  'The children are asleep, ______?', 'The pan is hot, ______?', 'Amy doesn\'t like fish, ______?', 'You are from Spain, ______?',
  'I like eating vegetables, ______?', 'You have completed the form, ______?', 'You don\'t live here, ______?', 'The children are playing in the garden, ______?',
  'We often go out on Fridays, ______?'];
const u2c2 = u2c2Items.map((s, i) => ({ title: i === 0 ? 'Text Input' : 'problem', points: 1, paras: [`${i + 1}. ${s}`], inputs: [{ text: true }] }));

const out = {
  'live_u5c5_third_conditional.html': page('Quiz : Unit 5 : Chapter 5', u5c5),
  'live_u4c4_second_conditional.html': page('Quiz : Unit 4 : Chapter 4', u4c4),
  'live_u4c2_nouns_from_verbs.html': page('Quiz : Unit 4 : Chapter 2', u4c2),
  'live_u5c3_a_an.html': page('Quiz : Unit 5 : Chapter 3', u5c3),
  'live_u5c4_articles.html': page('Quiz : Unit 5 : Chapter 4', u5c4),
  'live_u2c2_question_tags.html': page('Quiz : Unit 2 : Chapter 2', u2c2),
  'live_u3c3_gerund_infinitive.html': page('Quiz : Unit 3 : Chapter 3', u3c3)
};
if (require.main === module) {
  for (const [name, html] of Object.entries(out)) fs.writeFileSync(path.join(__dirname, name), html);
  console.log(`wrote ${Object.keys(out).join(', ')}`);
}
module.exports = { blockHtml, page };
