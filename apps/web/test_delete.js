async function rawTest() {
  const baseUrl = process.env.KEYCLOAK_INTERNAL_URL?.replace('/realms/agrimarket', '') || 'http://127.0.0.1:8080';
  
  const params = new URLSearchParams();
  params.append('client_id', 'admin-cli');
  params.append('username', 'admin');
  params.append('password', 'admin');
  params.append('grant_type', 'password');

  const resToken = await fetch(`${baseUrl}/realms/master/protocol/openid-connect/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString()
  });
  const { access_token } = await resToken.json();

  const idToDelete = '47c6d95f-4656-4b8a-9531-db3255f282be';
  
  console.log(`Deleting user: ${idToDelete}`);
  const delRes = await fetch(`${baseUrl}/admin/realms/agrimarket/users/${idToDelete}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${access_token}` }
  });
  console.log(`Delete status: ${delRes.status}`);
  if (!delRes.ok) {
    console.log(`Error body: ${await delRes.text()}`);
  }
}

rawTest();
