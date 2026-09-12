const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

app.get('/', (req, res) => {
  res.send('منصتي تعمل بنجاح!');
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
