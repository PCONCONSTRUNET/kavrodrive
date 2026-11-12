const { handleApiRequest } = require('./server/apiHandler.cjs');
const http = require('http');

const server = http.createServer((req, res) => {
  if (req.url.startsWith('/api')) {
    return handleApiRequest(req, res);
  }
  res.writeHead(404);
  res.end('Not found');
});

server.listen(3001, async () => {
  console.log('Testing API server on port 3001...');
  try {
    const res = await fetch('http://localhost:3001/api/sync');
    const data = await res.json();
    console.log('Sync result:');
    console.log('- Config loaded:', !!data.config);
    console.log('- Rides count:', data.rides?.length);
    console.log('- Expenses count:', data.expenses?.length);
    console.log('- Clients count:', data.clients?.length);
    console.log('Sample ride:', data.rides?.[0]?.clientName, data.rides?.[0]?.totalPrice);
    server.close();
    process.exit(0);
  } catch (err) {
    console.error('API test failed:', err);
    server.close();
    process.exit(1);
  }
});

