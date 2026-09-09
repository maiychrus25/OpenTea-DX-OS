require('dotenv').config({ path: '../../docker/.env.local' });

async function getAdminToken() {
  const tokenUrl = 'http://127.0.0.1:8080/realms/master/protocol/openid-connect/token';
  const params = new URLSearchParams();
  params.append('client_id', 'admin-cli');
  params.append('username', 'admin');
  params.append('password', 'admin');
  params.append('grant_type', 'password');

  const res = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString()
  });

  if (!res.ok) {
    console.error('Failed to get token:', await res.text());
    process.exit(1);
  }

  const data = await res.json();
  return data.access_token;
}

async function run() {
  const token = await getAdminToken();
  const url = 'http://127.0.0.1:8080/admin/realms/agrimarket/users';
  const res = await fetch(url, {
    headers: { 'Authorization': 'Bearer ' + token }
  });
  const users = await res.json();
  console.log(users.map(u => ({ id: u.id, username: u.username, firstName: u.firstName, lastName: u.lastName })));
}

run();
