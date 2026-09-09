require('dotenv').config({ path: '../../docker/.env.local' });

async function getAdminToken() {
  const tokenUrl = 'http://127.0.0.1:8080/realms/master/protocol/openid-connect/token';
  const params = new URLSearchParams();
  params.append('client_id', 'admin-cli');
  params.append('username', 'admin');
  params.append('password', 'admin');
  params.append('grant_type', 'password');
  const res = await fetch(tokenUrl, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: params.toString() });
  const data = await res.json();
  return data.access_token;
}

async function run() {
  const token = await getAdminToken();
  const url = 'http://127.0.0.1:8080/admin/realms/agrimarket/users/7f2c22b9-1390-4106-81ba-02f530580552';
  const res = await fetch(url, { method: 'DELETE', headers: { 'Authorization': 'Bearer ' + token } });
  console.log(res.status, res.statusText);
  if (!res.ok) console.log(await res.text());
}
run();
