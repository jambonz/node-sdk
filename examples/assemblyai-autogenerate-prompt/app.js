const http = require('http');
const {createEndpoint} = require('@jambonz/sdk/websocket');

const server = http.createServer();
const makeService = createEndpoint({server, port: 3000});
const svc = makeService({path: '/'});

const recognizer = {
  vendor: 'assemblyai',
  language: 'en',
  autogeneratePrompt: true,
  assemblyAiOptions: {
    serviceVersion: 'v3',
    speechModel: 'u3-rt-pro'
  }
};

const questions = [
  'What medication are you currently taking? For example, metformin, lisinopril, or atorvastatin.',
  'What is your street address including city and zip code?',
  'Can you spell your last name for me please?',
  'What is your date of birth? Please say the month, day, and year.',
  'What is your email address?',
  'What is the make, model, and year of your vehicle?',
  'Can you read me the six-digit confirmation code from your email? It should be a mix of letters and numbers.',
];

svc.on('session:new', (session) => {
  session.locals = {questionIndex: 0};

  session
    .on('close', (code, reason) => {
      console.log(`Session ${session.callSid} closed: ${code}`);
    })
    .on('error', (err) => {
      console.error(`Session ${session.callSid} error:`, err);
    })
    .on('/gather-result', (evt) => {
      if (evt.reason === 'speechDetected' && evt.speech?.alternatives?.length) {
        const transcript = evt.speech.alternatives[0].transcript;
        const confidence = evt.speech.alternatives[0].confidence;
        const question = questions[session.locals.questionIndex];
        console.log(`Q: ${question}`);
        console.log(`A: ${transcript} (confidence: ${confidence})`);
        console.log('---');

        session.locals.questionIndex++;

        if (session.locals.questionIndex < questions.length) {
          session
            .say({text: `Got it. You said: ${transcript}.`})
            .gather({
              input: ['speech'],
              actionHook: '/gather-result',
              timeout: 15,
              recognizer,
              say: {text: `Next question. ${questions[session.locals.questionIndex]}`}
            })
            .reply();
        } else {
          session
            .say({text: `Got it. You said: ${transcript}. That was the last question. Thanks for helping us test. Goodbye!`})
            .hangup()
            .reply();
        }
      } else {
        console.log(`Gather completed with reason: ${evt.reason}`);
        session
          .gather({
            input: ['speech'],
            actionHook: '/gather-result',
            timeout: 15,
            recognizer,
            say: {text: `I didn't catch that. Let me repeat the question. ${questions[session.locals.questionIndex]}`}
          })
          .reply();
      }
    });

  session
    .say({text: 'Welcome! This app tests Assembly A I auto-generate prompt. I\'m going to ask you a series of questions. The recognizer should be biased toward the type of answer each question expects.'})
    .gather({
      input: ['speech'],
      actionHook: '/gather-result',
      timeout: 15,
      recognizer,
      say: {text: `Here is the first question. ${questions[0]}`}
    })
    .send();
});

console.log('AssemblyAI autogeneratePrompt test app listening on port 3000');
