const http = require('http');

const options = {
  hostname: 'localhost',
  port: 3000,
  path: '/books/bd904c00-5563-4880-910c-737c1f17afec/reviews',
  method: 'GET'
};

const req = http.request(options, (res) => {
  let data = '';
  
  res.on('data', (chunk) => {
    data += chunk;
  });
  
  res.on('end', () => {
    console.log('📊 API Response:');
    console.log('Status:', res.statusCode);
    console.log('Headers:', res.headers);
    console.log('Body:');
    try {
      const json = JSON.parse(data);
      console.log(JSON.stringify(json, null, 2));
    } catch (e) {
      console.log(data);
    }
  });
});

req.on('error', (error) => {
  console.error('❌ Request failed:', error.message);
});

req.end();
