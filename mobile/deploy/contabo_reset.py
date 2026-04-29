import urllib.request, urllib.parse, json, uuid

# Step 1: Fresh token
data = urllib.parse.urlencode({
  'client_id': 'INT-14823035',
  'client_secret': 'DcCxBF3uTq5ooKvdOxvW69TZ0tWwm5HU',
  'username': 'mohameda.mouhameden@gmail.com',
  'password': '43etrzfhgvbnmXCGVHB43546"§$%%$§',
  'grant_type': 'password'
}).encode()

req = urllib.request.urlopen(
  urllib.request.Request(
    'https://auth.contabo.com/auth/realms/contabo/protocol/openid-connect/token',
    data=data,
    headers={'Content-Type': 'application/x-www-form-urlencoded'}
  )
)
TOKEN = json.loads(req.read())['access_token']
print('AUTH OK')

HEADERS = {
  'Authorization': f'Bearer {TOKEN}',
  'x-request-id': str(uuid.uuid4()),
  'Content-Type': 'application/json'
}

# Step 2: List instances
req2 = urllib.request.urlopen(
  urllib.request.Request('https://api.contabo.com/v1/compute/instances', headers=HEADERS)
)
instances = json.loads(req2.read())
instance = instances['data'][0]
instance_id = instance['instanceId']
ip = instance.get('ipConfig',{}).get('v4',{}).get('ip','?')
print(f'Instance: {instance_id}  IP: {ip}  Status: {instance.get("status")}')

# Step 3: List existing secrets
HEADERS['x-request-id'] = str(uuid.uuid4())
try:
  req3 = urllib.request.urlopen(
    urllib.request.Request('https://api.contabo.com/v1/secrets', headers=HEADERS)
  )
  secrets = json.loads(req3.read())
  print('Existing secrets:', json.dumps(secrets, indent=2))
except urllib.error.HTTPError as e:
  print(f'Secrets list HTTP {e.code}: {e.read().decode()}')

# Step 4: Create a new password secret
NEW_PASS = 'Tawjeeh@Deploy2026!'
HEADERS['x-request-id'] = str(uuid.uuid4())
secret_body = json.dumps({'name': 'tawjeeh-root', 'type': 'password', 'value': NEW_PASS}).encode()
try:
  req4 = urllib.request.urlopen(
    urllib.request.Request(
      'https://api.contabo.com/v1/secrets',
      data=secret_body,
      headers=HEADERS,
      method='POST'
    )
  )
  secret = json.loads(req4.read())
  secret_id = secret['data'][0]['secretId']
  print(f'Created secret ID: {secret_id}')
except urllib.error.HTTPError as e:
  print(f'Create secret HTTP {e.code}: {e.read().decode()}')
  secret_id = None

# Step 5: Reset instance root password using secret ID
if secret_id:
  HEADERS['x-request-id'] = str(uuid.uuid4())
  body = json.dumps({'rootPassword': secret_id}).encode()
  try:
    req5 = urllib.request.urlopen(
      urllib.request.Request(
        f'https://api.contabo.com/v1/compute/instances/{instance_id}/actions/resetPassword',
        data=body,
        headers=HEADERS,
        method='POST'
      )
    )
    result = json.loads(req5.read())
    print('Password reset result:', result)
    print(f'\nNEW ROOT PASSWORD: {NEW_PASS}')
    print(f'Connect: ssh root@{ip}')
  except urllib.error.HTTPError as e:
    print(f'Reset HTTP {e.code}: {e.read().decode()}')
