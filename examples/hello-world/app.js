const express = require('express');
const app = express();
app.use(express.json());

// jambonz calls this URL when a call arrives
app.post('/incoming', (req, res) => {
  console.log(`Incoming call from ${req.body.from} to ${req.body.to}`);

  res.json([
    {
      verb: 'say',
      text: 'Hello! Welcome to our service. Thank you for calling. Goodbye!'
    },
    {
      verb: 'hangup'
    }
  ]);
});

app.listen(3000, () => console.log('jambonz app listening on port 3000'));
