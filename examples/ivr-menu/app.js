const express = require('express');
const app = express();
app.use(express.json());

// Initial call handler — present the menu
app.post('/incoming', (req, res) => {
  res.json([
    {
      verb: 'gather',
      input: ['speech', 'digits'],
      actionHook: '/menu-selection',
      numDigits: 1,
      timeout: 10,
      say: {
        text: 'Welcome to Acme Corp. Press 1 or say sales for sales. Press 2 or say support for technical support. Press 3 or say billing for billing.'
      }
    },
    // Fallback if no input received
    {
      verb: 'say',
      text: 'We did not receive any input. Goodbye.'
    },
    {
      verb: 'hangup'
    }
  ]);
});

// Handle the menu selection
app.post('/menu-selection', (req, res) => {
  const { digits, speech } = req.body;
  const transcript = speech?.alternatives?.[0]?.transcript?.toLowerCase() || '';

  let department;
  if (digits === '1' || transcript.includes('sales')) {
    department = 'sales';
  } else if (digits === '2' || transcript.includes('support')) {
    department = 'support';
  } else if (digits === '3' || transcript.includes('billing')) {
    department = 'billing';
  }

  if (department) {
    res.json([
      {
        verb: 'say',
        text: `Connecting you to ${department}. Please hold.`
      },
      {
        verb: 'dial',
        target: [{ type: 'user', name: `${department}-queue` }],
        answerOnBridge: true,
        timeout: 30,
        actionHook: '/dial-result'
      },
      {
        verb: 'say',
        text: `Sorry, ${department} is not available right now. Please try again later.`
      },
      {
        verb: 'hangup'
      }
    ]);
  } else {
    // Unrecognized input — replay the menu
    res.json([
      {
        verb: 'say',
        text: 'Sorry, I didn\'t understand that.'
      },
      {
        verb: 'redirect',
        actionHook: '/incoming'
      }
    ]);
  }
});

// Handle dial result
app.post('/dial-result', (req, res) => {
  console.log(`Call ended: ${JSON.stringify(req.body)}`);
  res.json([{ verb: 'hangup' }]);
});

app.listen(3000, () => console.log('IVR app listening on port 3000'));
